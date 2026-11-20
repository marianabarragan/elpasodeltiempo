import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../../config.js';

/*
 * Calendario colgado (storyboard 9): la punta del índice toca la hoja del mes y la arrastra. La hoja cuelga
 * de su borde superior y se inclina siguiendo el dedo; al pasar `derecha` de su ancho hacia la derecha (o
 * `abajo` de su alto hacia abajo) se desprende y cae como en la web (AdulthoodScene.flipCalendar), y debajo
 * queda el mes siguiente (calendar.setMonth). Si se suelta antes, vuelve a colgar en su sitio.
 * Hojas y meses son los de js/adulthood-props.js; el mes inicial es Config.adulthood.calendar.
 */
export function crearCalendario({ calendario, dedos, sonido, alArrancar }) {
  const A = AJUSTES.adultez.calendario;
  const { pages, setMonth, visual } = calendario, hoja = pages.front;
  hoja.sheet.geometry.computeBoundingBox();
  const { min, max } = hoja.sheet.geometry.boundingBox, ancho = max.x - min.x, alto = max.y - min.y;
  const reposo = hoja.rest.clone();
  const estado = { mes: 0, arrastre: null, cayendo: false, arrancadas: 0, avance: 0 };
  const local = new THREE.Vector3(), inversa = new THREE.Matrix4(), escala = new THREE.Vector3(), giro = new THREE.Quaternion();

  function colgar() {
    gsap.killTweensOf([hoja.pivot.position, hoja.pivot.rotation, hoja.material]);
    hoja.pivot.position.copy(reposo);
    hoja.pivot.rotation.set(0, 0, 0);
    hoja.material.opacity = 1;
  }

  function soltar() {
    estado.arrastre = null;
    estado.avance = 0;
    gsap.to(hoja.pivot.rotation, { x: 0, z: 0, duration: .5, ease: 'elastic.out(1, .5)', overwrite: true });
    gsap.to(hoja.pivot.position, { x: reposo.x, y: reposo.y, z: reposo.z, duration: .35, ease: 'power2.out', overwrite: true });
  }

  // La hoja se desprende y cae (desde donde la dejó el dedo); debajo aparece el mes siguiente.
  function arrancar(hacia = 'derecha') {
    if (estado.cayendo) return;
    estado.cayendo = true;
    estado.arrastre = null;
    sonido.playEffect('calendar', estado.mes);
    gsap.killTweensOf([hoja.pivot.position, hoja.pivot.rotation]);
    const derecha = hacia === 'derecha';
    gsap.timeline({
      onComplete: () => {
        estado.mes += 1;
        setMonth(estado.mes);
        colgar();
        estado.cayendo = false;
      }
    })
      .to(hoja.pivot.position, { x: `+=${ancho * (derecha ? .9 : .15)}`, y: `-=${alto * 1.1}`, z: `+=${alto * .7}`, duration: .8, ease: 'power2.in' })
      .to(hoja.pivot.rotation, { x: -1.35, z: derecha ? 1 : .35, duration: .8, ease: 'power1.in' }, '<')
      .to(hoja.material, { opacity: 0, duration: .42, ease: 'power1.in' }, '<.38');
    estado.arrancadas += 1;
    if (estado.arrancadas === 1) alArrancar();
  }

  return {
    estado, arrancar, ancho, alto,
    // Punto de la hoja del mes en el mundo: u de 0 (izquierda) a 1, v de 0 (arriba) a 1 (abajo).
    puntoEnMundo(u, v) {
      visual.updateWorldMatrix(true, false);
      return visual.localToWorld(new THREE.Vector3(reposo.x + (u - .5) * ancho, reposo.y - v * alto, reposo.z));
    },
    update(habilitado) {
      if (estado.cayendo || !habilitado) { if (estado.arrastre) soltar(); return; }
      visual.updateWorldMatrix(true, false);
      visual.matrixWorld.decompose(local, giro, escala);
      const metro = 1 / Math.max(1e-6, Math.abs(escala.x));
      inversa.copy(visual.matrixWorld).invert();
      const indices = dedos.indices();
      if (!estado.arrastre) {
        for (const punta of indices) {
          local.copy(punta.posicion).applyMatrix4(inversa);
          const dz = local.z - reposo.z;
          const sobreHoja = Math.abs(local.x - reposo.x) <= ancho / 2 && local.y <= reposo.y && local.y >= reposo.y - alto;
          if (sobreHoja && dz <= A.delante * metro && dz >= -A.detras * metro) {
            estado.arrastre = { lado: punta.lado, inicio: local.clone() };
            gsap.killTweensOf([hoja.pivot.position, hoja.pivot.rotation]);
            break;
          }
        }
        return;
      }
      const punta = indices.find(q => q.lado === estado.arrastre.lado);
      if (!punta) { soltar(); return; }
      local.copy(punta.posicion).applyMatrix4(inversa);
      const dz = local.z - reposo.z;
      if (dz > A.soltar * metro || dz < -A.soltar * metro * 1.5) { soltar(); return; }
      const dx = local.x - estado.arrastre.inicio.x, dy = local.y - estado.arrastre.inicio.y;
      const derecha = THREE.MathUtils.clamp(dx / ancho, 0, 1), abajo = THREE.MathUtils.clamp(-dy / alto, 0, 1);
      estado.avance = Math.max(derecha / A.derecha, abajo / A.abajo);
      // Cuelga del borde superior: el dedo la inclina hacia la derecha y la despega un poco hacia el usuario.
      hoja.pivot.rotation.z = derecha * .6;
      hoja.pivot.rotation.x = -(abajo * .5 + derecha * .12);
      hoja.pivot.position.set(reposo.x + Math.max(0, dx) * .3, reposo.y + Math.min(0, dy) * .25, reposo.z);
      if (derecha >= A.derecha) arrancar('derecha');
      else if (abajo >= A.abajo) arrancar('abajo');
    }
  };
}
