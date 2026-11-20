import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../../config.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const LADOS = ['left', 'right'];

/*
 * Gafas que se toman con las dos manos. Cada mano pellizca (o aprieta el gatillo) cerca de un extremo
 * de la montura; solo con los dos extremos sujetos las gafas siguen a las manos (con una sola mano no
 * se mueven, así la etapa no se puede saltar). Mientras suben giran solas hacia la posición de uso
 * (lentes hacia afuera, varillas hacia el rostro). Se dan por puestas cuando llegan cerca del visor,
 * o si el seguimiento de las manos se pierde ya cerca de él. Si se sueltan lejos, vuelven a la mesa.
 * Usa solo la raíz y la parte visible del objeto: el modelo se puede cambiar sin tocar esta lógica.
 */
export function crearGafas({ world, gafas, grupo, alPonerse }) {
  const { root, visual } = gafas;
  const { alcance, rostro, tolerancia, gracia, giro, animacion } = AJUSTES.vejez.gafas;
  const reposo = { posicion: root.position.clone(), giro: root.quaternion.clone(), inclinacion: visual.rotation.x };

  // Extremos de la montura (bisagras) en el espacio de la raíz, a partir de su caja.
  root.updateMatrixWorld(true);
  const aRaiz = root.matrixWorld.clone().invert(), caja = new THREE.Box3(), parte = new THREE.Box3(), m = new THREE.Matrix4();
  visual.traverse(o => { if (o.isMesh && !o.userData.glowShell) { o.geometry.computeBoundingBox(); caja.union(parte.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(aRaiz, o.matrixWorld))); } });
  const centro = caja.getCenter(new THREE.Vector3());
  const extremos = [new THREE.Vector3(caja.min.x, centro.y, caja.max.z), new THREE.Vector3(caja.max.x, centro.y, caja.max.z)];

  const estado = { modo: 'mesa', activo: false, manos: { left: null, right: null }, perdida: { left: 0, right: 0 }, desfase: new THREE.Vector3(), cercaDelRostro: false };
  const mano = { left: new THREE.Vector3(), right: new THREE.Vector3() }, punto = new THREE.Vector3(), cabeza = new THREE.Vector3();
  const objetivo = new THREE.Vector3(), giroUso = new THREE.Quaternion(), giroMundo = new THREE.Quaternion(), giroGrupo = new THREE.Quaternion();
  const ejes = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() }, base = new THREE.Matrix4();
  let regreso = null;

  const extremoMundo = i => root.localToWorld(punto.copy(extremos[i]));
  const pellizca = lado => !!world.input.xr.gamepads[lado]?.getSelecting();
  const libres = () => [0, 1].filter(i => !LADOS.some(lado => estado.manos[lado] === i));

  // Lleva la raíz a una pose dada en el mundo (la raíz cuelga del grupo escalado del escenario).
  function ponerEnMundo(posicion, cuaternion) {
    grupo.updateWorldMatrix(true, false);
    root.position.copy(grupo.worldToLocal(punto.copy(posicion)));
    root.quaternion.copy(giroGrupo.copy(grupo.getWorldQuaternion(giroGrupo)).invert().multiply(cuaternion));
  }

  function soltar() {
    LADOS.forEach(lado => { estado.manos[lado] = null; estado.perdida[lado] = 0; });
    if (estado.modo === 'sostenidas' && estado.cercaDelRostro) { ponerse(); return; }
    estado.modo = 'mesa';
    // Lejos del rostro, vuelven despacio a su lugar sobre la mesa.
    const desde = root.position.clone(), giroDesde = root.quaternion.clone(), t = { v: 0 };
    regreso = gsap.to(t, {
      v: 1, duration: .7, ease: 'power2.inOut',
      onUpdate: () => { root.position.lerpVectors(desde, reposo.posicion, t.v).y += Math.sin(t.v * Math.PI) * .3; root.quaternion.slerpQuaternions(giroDesde, reposo.giro, t.v); },
      onComplete: () => { regreso = null; }
    });
    gsap.to(visual.rotation, { x: reposo.inclinacion, duration: .5, ease: 'power2.out' });
    gsap.to(visual.position, { y: 0, duration: .3 });
  }

  // ---------- Animación de ponérselas ----------
  // Pose de uso frente a los ojos, siguiendo la cabeza: lentes (+Z) hacia adelante, +X hacia la izquierda
  // del usuario y +Y hacia arriba de la cabeza; a `distancia` m delante de los ojos y un poco más abajo.
  const ancho = caja.max.x - caja.min.x;
  const giroCabeza = new THREE.Quaternion(), adelante = new THREE.Vector3(), abajo = new THREE.Vector3(), izquierda = new THREE.Vector3(), arribaCabeza = new THREE.Vector3();
  const meta = { centro: new THREE.Vector3(), giro: new THREE.Quaternion() }, escalaGrupo = new THREE.Vector3(), desplazado = new THREE.Vector3();
  function poseDeUso(distancia) {
    world.player.head.getWorldPosition(cabeza);
    world.player.head.getWorldQuaternion(giroCabeza);
    adelante.set(0, 0, -1).applyQuaternion(giroCabeza);
    abajo.set(0, -1, 0).applyQuaternion(giroCabeza);
    izquierda.set(-1, 0, 0).applyQuaternion(giroCabeza);
    arribaCabeza.set(0, 1, 0).applyQuaternion(giroCabeza);
    meta.centro.copy(cabeza).addScaledVector(adelante, distancia).addScaledVector(abajo, animacion.bajo);
    meta.giro.setFromRotationMatrix(base.makeBasis(izquierda, arribaCabeza, adelante));
    return meta;
  }
  // Coloca las gafas con su centro (el de la montura) en `centroMundo`, con giro y escala propios.
  function colocarCentro(centroMundo, giroMundoGafas, escala) {
    root.scale.setScalar(escala);
    grupo.getWorldScale(escalaGrupo);
    desplazado.copy(centro).multiplyScalar(escala * escalaGrupo.x).applyQuaternion(giroMundoGafas);
    ponerEnMundo(objetivo.copy(centroMundo).sub(desplazado), giroMundoGafas);
  }

  /*
   * Ponérselas: las manos las sueltan y las gafas hacen el gesto solas, siguiendo la cabeza del usuario.
   * Llegan frente a los ojos (con el ancho de unas gafas reales, aunque el escenario esté ampliado), se calzan
   * sobre el rostro (la montura enmarca la vista), se quedan un instante y se desvanecen. Solo entonces se
   * avisa (alPonerse) y la escena empieza a aclararse.
   */
  function ponerse() {
    if (estado.modo === 'poniendose' || estado.modo === 'puestas') return;
    estado.modo = 'poniendose';
    estado.activo = false;
    LADOS.forEach(lado => { estado.manos[lado] = null; });
    regreso?.kill();
    gsap.killTweensOf(visual.rotation);
    gsap.killTweensOf(visual.position);
    visual.rotation.x = 0;
    visual.position.y = 0;
    const materiales = [];
    visual.traverse(o => {
      if (o.userData.glowShell) { o.visible = false; return; }
      if (o.isMesh) [].concat(o.material).forEach(mt => { if (mt && !materiales.includes(mt)) materiales.push(mt); });
    });
    const opacidades = materiales.map(mt => mt.opacity);
    root.updateWorldMatrix(true, false);
    const inicio = { centro: root.localToWorld(centro.clone()), giro: root.getWorldQuaternion(new THREE.Quaternion()), escala: root.scale.x };
    grupo.getWorldScale(escalaGrupo);
    const escalaUso = animacion.ancho / (ancho * escalaGrupo.x);
    const llegar = { t: 0 }, calzar = { t: 0 }, mantener = { t: 0 }, desvanecer = { t: 0 }, tmp = new THREE.Vector3(), giroTmp = new THREE.Quaternion();
    gsap.timeline({
      onComplete: () => {
        root.visible = false;
        materiales.forEach((mt, i) => { mt.opacity = opacidades[i]; });
        estado.modo = 'puestas';
        alPonerse?.();
      }
    })
      .to(llegar, {
        t: 1, duration: animacion.llegar, ease: 'power2.out',
        onUpdate: () => {
          const { centro: c, giro: g } = poseDeUso(animacion.frente);
          colocarCentro(tmp.lerpVectors(inicio.centro, c, llegar.t), giroTmp.slerpQuaternions(inicio.giro, g, llegar.t), THREE.MathUtils.lerp(inicio.escala, escalaUso, llegar.t));
        }
      })
      .to(calzar, {
        t: 1, duration: animacion.calzar, ease: 'power1.inOut',
        onUpdate: () => { const { centro: c, giro: g } = poseDeUso(THREE.MathUtils.lerp(animacion.frente, animacion.puestas, calzar.t)); colocarCentro(c, g, escalaUso); }
      })
      .to(mantener, {
        t: 1, duration: animacion.mantener, ease: 'none',
        onUpdate: () => { const { centro: c, giro: g } = poseDeUso(animacion.puestas); colocarCentro(c, g, escalaUso); }
      })
      .add(() => materiales.forEach(mt => { mt.transparent = true; mt.needsUpdate = true; }))
      .to(desvanecer, {
        t: 1, duration: animacion.desvanecer, ease: 'power1.in',
        onUpdate: () => {
          const { centro: c, giro: g } = poseDeUso(animacion.puestas * (1 - .35 * desvanecer.t));
          colocarCentro(c, g, escalaUso);
          materiales.forEach((mt, i) => { mt.opacity = opacidades[i] * (1 - desvanecer.t); });
        }
      });
  }

  return {
    estado, extremos,
    habilitar() { estado.activo = true; },
    // Cada cuadro: sujeción por extremos, seguimiento con las dos manos y llegada al rostro.
    update(dt) {
      if (!estado.activo || estado.modo === 'puestas') return;
      world.player.head.getWorldPosition(cabeza);
      LADOS.forEach(lado => {
        world.player.indexTipSpaces[lado].getWorldPosition(mano[lado]);
        const sujeta = estado.manos[lado] !== null;
        if (pellizca(lado)) {
          estado.perdida[lado] = 0;
          if (!sujeta && estado.modo !== 'sostenidas') {
            const libre = libres().find(i => mano[lado].distanceTo(extremoMundo(i)) <= alcance);
            if (libre !== undefined) estado.manos[lado] = libre;
          }
        } else if (sujeta && (estado.perdida[lado] += dt) > gracia) {
          estado.manos[lado] = null;
        }
      });
      const sujetas = LADOS.filter(lado => estado.manos[lado] !== null).length;
      if (estado.modo === 'sostenidas' && sujetas < 2) { soltar(); return; }
      if (sujetas === 2 && estado.modo !== 'sostenidas') {
        // Con los dos extremos sujetos empiezan a seguir el punto medio entre las manos.
        regreso?.kill();
        regreso = null;
        estado.modo = 'sostenidas';
        estado.desfase.copy(root.getWorldPosition(punto)).sub(objetivo.addVectors(mano.left, mano.right).multiplyScalar(.5));
        gsap.to(visual.rotation, { x: 0, duration: .4, ease: 'power2.out' });
        gsap.to(visual.position, { y: 0, duration: .2 });
      }
      if (estado.modo !== 'sostenidas') {
        // Una sola mano: se alzan un poco para indicar que falta la otra.
        const modo = sujetas === 1 ? 'una' : 'mesa';
        if (modo !== estado.modo && !regreso) gsap.to(visual.position, { y: modo === 'una' ? .12 : 0, duration: .25, overwrite: 'auto' });
        estado.modo = modo;
        return;
      }
      // Posición: punto medio de las manos; el desfase inicial se disuelve para quedar entre ellas.
      estado.desfase.multiplyScalar(Math.exp(-dt * 3));
      objetivo.addVectors(mano.left, mano.right).multiplyScalar(.5).add(estado.desfase);
      // Giro de uso: lentes (+Z) hacia afuera desde la cabeza, +X hacia la izquierda del usuario.
      ejes.z.subVectors(objetivo, cabeza);
      if (ejes.z.lengthSq() < 1e-6) ejes.z.set(0, 0, -1);
      ejes.z.normalize();
      ejes.x.crossVectors(ARRIBA, ejes.z);
      if (ejes.x.lengthSq() < 1e-6) ejes.x.set(1, 0, 0);
      ejes.x.normalize();
      ejes.y.crossVectors(ejes.z, ejes.x);
      giroUso.setFromRotationMatrix(base.makeBasis(ejes.x, ejes.y, ejes.z));
      root.getWorldQuaternion(giroMundo).slerp(giroUso, 1 - Math.exp(-dt * giro));
      ponerEnMundo(objetivo, giroMundo);
      // Cerca del visor se ponen; si el seguimiento falla a poca distancia, soltar también las pone.
      const distancia = objetivo.distanceTo(cabeza);
      estado.cercaDelRostro = distancia < tolerancia;
      if (distancia < rostro) ponerse();
    }
  };
}
