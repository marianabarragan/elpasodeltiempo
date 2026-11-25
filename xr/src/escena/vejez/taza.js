import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { Tocable } from '../../componentes.js';
import { AJUSTES } from '../../config.js';
import { crearAgarre, seSuelta } from '../agarre.js';

const PUNTAS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const ARRIBA = new THREE.Vector3(0, 1, 0);

/*
 * Taza de café de la vejez (corrección): antes giraba al tocarla; ahora se bebe.
 *
 * - Se toma con un pellizco (en el asa o en el cuerpo; queda en la mano tal como se tomó y se inclina girando la
 *   muñeca: perfil 'rigido' de agarre.js) o rodeándola con toda la mano (perfil 'envolvente', como el vaso de la
 *   adultez: la palma junto a su eje y al menos tres puntas de dedo alrededor de su superficie). Mientras está en la
 *   mano, la mano dibujada la rodea (oclusion.js, con su cilindro).
 * - Beber: con el borde cerca de la boca (estimada desde la pose del visor) e inclinada hacia la cara, el café baja
 *   poco a poco mientras dura el gesto y suena el sorbo de la web (el mismo archivo del vaso de la adultez) cada
 *   `sorbo` s. Vacía, la superficie del café desaparece. El primer sorbo suma el hito «extra» (el de la radio).
 * - Al soltarla vuelve sola a su plato (el plato no se mueve). El café bebido no vuelve.
 *
 * La taza (modelo taza-web.glb) se separa del plato al construir la escena: pasa a su propio grupo, hijo del grupo
 * del escenario, en la misma pose. Todo se calcula en el mundo, así funciona con el escenario movido o escalado.
 */
export function crearTaza({ world, manos, taza, grupo, entidadPadre, sonido, cabeza, alBeber }) {
  const A = AJUSTES.vejez.taza;
  const modelo = taza.cup;

  // ---------- La taza en su propio grupo, separada del plato ----------
  grupo.updateMatrixWorld(true);
  const raiz = new THREE.Group();
  raiz.name = 'taza-de-cafe';
  new THREE.Matrix4().copy(grupo.matrixWorld).invert().multiply(modelo.matrixWorld).decompose(raiz.position, raiz.quaternion, raiz.scale);
  grupo.add(raiz);
  raiz.updateMatrixWorld(true);
  raiz.attach(modelo);
  const entidad = world.createTransformEntity(raiz, { parent: entidadPadre });
  entidad.addComponent(Tocable, { id: 'vejez-taza' });

  // Piezas del modelo: la superficie del café (un disco plano), el asa y el cuerpo.
  raiz.updateMatrixWorld(true);
  const aRaiz = raiz.matrixWorld.clone().invert(), m = new THREE.Matrix4();
  const mallas = [];
  modelo.traverse(o => { if (o.isMesh && !o.userData.glowShell) { o.geometry.computeBoundingBox(); mallas.push(o); } });
  const tamDe = o => o.geometry.boundingBox.getSize(new THREE.Vector3());
  const cafe = mallas.find(o => { const t = tamDe(o); return Math.min(t.x, t.y, t.z) < 1e-4; }) ?? null;
  const cuerpo = mallas.filter(o => o !== cafe).sort((x, y) => y.geometry.attributes.position.count - x.geometry.attributes.position.count)[0];
  const caja = new THREE.Box3().copy(cuerpo.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(aRaiz, cuerpo.matrixWorld));
  const centro = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3());
  const radioLocal = Math.max(tam.x, tam.z) / 2, altoLocal = tam.y;
  const escalaRaiz = new THREE.Vector3();
  const metros = () => { raiz.getWorldScale(escalaRaiz); return escalaRaiz.y; };
  const medida = { centro, eje: new THREE.Vector3(0, 1, 0), lateral: new THREE.Vector3(0, 0, 1), largo: altoLocal };
  const envolvente = crearAgarre({ world, manos, objeto: raiz, perfil: 'envolvente', ajustes: { ...A.agarre, radio: () => radioLocal * metros() }, medida });
  const pinza = crearAgarre({ world, manos, objeto: raiz, perfil: 'rigido', ajustes: { ...A.agarre, radio: () => radioLocal * metros() }, medida });

  // Café: baja dentro de la taza y se estrecha con ella (en el espacio de su padre, el del modelo).
  const nivelCafe = cafe ? { y: cafe.position.y, escala: cafe.scale.clone(), alto: altoLocal / Math.max(cafe.parent ? new THREE.Vector3().setFromMatrixScale(m.multiplyMatrices(aRaiz, cafe.parent.matrixWorld)).y : 1, 1e-6) } : null;
  function dibujarCafe(nivel) {
    if (!cafe) return;
    const vacio = 1 - nivel, f = THREE.MathUtils.lerp(1, A.liquido.estrechar, vacio);
    cafe.position.y = nivelCafe.y - vacio * A.liquido.profundidad * nivelCafe.alto;
    cafe.scale.set(nivelCafe.escala.x * f, nivelCafe.escala.y, nivelCafe.escala.z * f);
    cafe.visible = nivel > .02;
  }

  const reposo = { posicion: raiz.position.clone(), giro: raiz.quaternion.clone() };
  const estado = {
    habilitado: false, modo: null, lado: null, candidato: null, espera: 0, suelto: 0,
    nivel: 1, bebiendo: false, sorbos: 0, bebido: false, desdeSorbo: Infinity, envolturas: 0, ultimaMedida: null
  };
  let regreso = null;
  const agarreActivo = () => (estado.modo === 'envolvente' ? envolvente : pinza);

  function volver() {
    regreso?.kill();
    const desde = raiz.position.clone(), giroDesde = raiz.quaternion.clone(), k = { v: 0 };
    regreso = gsap.to(k, {
      v: 1, duration: A.regreso, ease: 'power2.inOut',
      onUpdate: () => {
        // Arco de 3 cm sobre el plato (unidades del grupo del escenario).
        raiz.position.lerpVectors(desde, reposo.posicion, k.v).y += Math.sin(k.v * Math.PI) * .03 * raiz.scale.y / metros();
        raiz.quaternion.slerpQuaternions(giroDesde, reposo.giro, k.v);
      },
      onComplete: () => { regreso = null; }
    });
  }

  // ---------- Contacto de la mano con el cilindro de la taza ----------
  const base = new THREE.Vector3(), eje = new THREE.Vector3(), v = new THREE.Vector3(), giroRaiz = new THREE.Quaternion();
  function cilindro() {
    raiz.updateWorldMatrix(true, false);
    raiz.localToWorld(base.copy(centro).addScaledVector(ARRIBA, -altoLocal / 2));
    eje.copy(ARRIBA).applyQuaternion(raiz.getWorldQuaternion(giroRaiz));
    return { radio: radioLocal * metros(), alto: altoLocal * metros() };
  }
  function respectoDelEje(punto, alto) {
    v.subVectors(punto, base);
    const t = v.dot(eje);
    return { d: v.addScaledVector(eje, -t).length(), h: t / alto };
  }
  function envoltura(mano, holguraPuntas) {
    const { radio, alto } = cilindro();
    const palma = respectoDelEje(mano.centro, alto);
    const palmaJunto = palma.d <= radio + A.palma && palma.h > -.2 && palma.h < 1.2;
    let puntas = 0;
    for (const nombre of PUNTAS) {
      const p = mano.puntos.get(nombre);
      if (!p) continue;
      const r = respectoDelEje(p, alto);
      if (r.d <= radio + holguraPuntas && r.h > -.1 && r.h < 1.1) puntas += 1;
    }
    return { palmaJunto, puntas };
  }

  // ---------- Beber ----------
  const boca = new THREE.Vector3(), adelante = new THREE.Vector3(), abajo = new THREE.Vector3(), giroCabeza = new THREE.Quaternion();
  function revisarSorbo(dt) {
    world.player.head.getWorldQuaternion(giroCabeza);
    adelante.set(0, 0, -1).applyQuaternion(giroCabeza);
    abajo.set(0, -1, 0).applyQuaternion(giroCabeza);
    boca.copy(cabeza()).addScaledVector(abajo, A.bajoOjos).addScaledVector(adelante, A.delante);
    const borde = envolvente.puntoMundo(1), fondo = envolvente.puntoMundo(0);
    const inclinacion = Math.acos(THREE.MathUtils.clamp(borde.clone().sub(fondo).normalize().dot(ARRIBA), -1, 1));
    const distancia = borde.distanceTo(boca);
    estado.ultimaMedida = { distancia, inclinacion };
    const bebiendo = estado.nivel > 0 && distancia <= A.boca && inclinacion >= A.inclinacion;
    if (bebiendo && !estado.bebiendo) estado.desdeSorbo = Infinity;
    estado.bebiendo = bebiendo;
    if (!bebiendo) return;
    // El sorbo suena al empezar el gesto y cada `sorbo` s mientras sigue bebiendo.
    if ((estado.desdeSorbo += dt) >= A.sorbo) {
      estado.desdeSorbo = 0;
      estado.sorbos += 1;
      sonido.playEffect('cup');
    }
    estado.nivel = Math.max(0, estado.nivel - dt / A.beber);
    dibujarCafe(estado.nivel);
    if (!estado.bebido) { estado.bebido = true; alBeber(); }
  }

  function tomar(modo, lado) {
    regreso?.kill();
    regreso = null;
    Object.assign(estado, { modo, lado, suelto: 0 });
    agarreActivo().tomar();
  }
  function soltar() {
    if (!estado.modo) return;
    agarreActivo().soltar();
    Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, bebiendo: false });
    volver();
  }

  return {
    estado, raiz, entidad,
    // En la mano con el agarre envolvente (IWSDK no lo marca como Grabbed): bloquea el gesto del escenario.
    get envuelta() { return estado.modo === 'envolvente'; },
    get sostenido() { return !!estado.modo; },
    habilitar() {
      estado.habilitado = true;
      // El pellizco (o el botón lateral del control) la toma con el agarre de IWSDK; la pose la calcula agarre.js.
      if (!entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: false, translate: false });
    },
    deshabilitar() {
      estado.habilitado = false;
      world.getSystem(GrabSystem)?.forceRelease(entidad);
      if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      soltar();
    },
    // REPETIR: en su plato, llena y sin haber bebido.
    reiniciar() {
      this.deshabilitar();
      regreso?.kill();
      regreso = null;
      Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, suelto: 0, nivel: 1, bebiendo: false, sorbos: 0, bebido: false, desdeSorbo: Infinity, ultimaMedida: null });
      dibujarCafe(1);
    },
    // Agarre de IWSDK (pellizco o botón lateral).
    sostener(activo) {
      if (activo) { if (estado.habilitado && estado.modo !== 'envolvente') tomar('pinza', null); return; }
      if (estado.modo === 'pinza') soltar();
    },
    // `ocupadas`: manos que sostienen otra cosa (no pueden envolverla).
    update(dt, habilitado, ocupadas = []) {
      if (!estado.habilitado) return;
      if (!estado.modo && habilitado) {
        const lado = manos.lados.find(l => manos[l].seguida && !manos[l].pellizco && !ocupadas.includes(l) && (() => { const e = envoltura(manos[l], A.puntas); return e.palmaJunto && e.puntas >= A.dedos; })());
        if (lado && lado === estado.candidato) {
          if ((estado.espera += dt) >= A.confirmar) { estado.envolturas += 1; tomar('envolvente', lado); }
        } else { estado.candidato = lado ?? null; estado.espera = 0; }
      }
      if (!estado.modo) return;
      agarreActivo().update(dt, entidad, estado.modo === 'envolvente' ? estado.lado : null);
      if (estado.modo === 'envolvente' && seSuelta(manos[estado.lado], estado, dt, A)) { soltar(); return; }
      if (habilitado) revisarSorbo(dt);
    },
    // Centro del cuerpo de la taza en el mundo y su cilindro (pruebas y mano dibujada que la rodea).
    centroMundo: () => { raiz.updateWorldMatrix(true, false); return raiz.localToWorld(centro.clone()); },
    bordeMundo: () => envolvente.puntoMundo(1),
    medidas: () => ({ ...cilindro(), centro: centro.clone(), conCafe: !!cafe }),
    cilindroMundo(destino = {}) {
      const { radio, alto } = cilindro();
      destino.centro = (destino.centro ?? new THREE.Vector3()).copy(base).addScaledVector(eje, alto / 2);
      destino.eje = (destino.eje ?? new THREE.Vector3()).copy(eje);
      destino.radio = radio;
      destino.mitad = alto / 2;
      // Con el agarre envolvente, la mano que lo rodea dibuja la postura de agarre (oclusion.js).
      destino.envolvente = estado.modo === 'envolvente';
      destino.lado = estado.lado;
      return destino;
    }
  };
}
