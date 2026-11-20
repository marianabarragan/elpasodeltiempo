import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../config.js';

/*
 * Paso a un recuerdo: el entorno se oscurece por completo y luego vuelve revelando el escenario nuevo.
 * No es una capa delante de los ojos: una cúpula oscura fija en la habitación (radio AJUSTES.transicion.radio)
 * cubre el passthrough por detrás de todo lo virtual, y a la vez se atenúan las luces de la escena virtual,
 * como cuando se apagan las luces de un cuarto. Al volver, primero se ilumina lo virtual y después la habitación.
 * La cámara no se mueve. Sirve para entrar a un escenario y para regresar al tablero.
 */
export function crearTransicion(world) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false
  });
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(AJUSTES.transicion.radio, 32, 16), material);
  cupula.name = 'oscuridad-del-entorno';
  // Primera entre lo transparente: todo lo virtual queda por delante.
  cupula.renderOrder = -1000;
  cupula.frustumCulled = false;
  cupula.visible = false;
  world.createTransformEntity(cupula, { persistent: true });

  const luz = { nivel: 1 };
  let luces = [], ambiente = 1;
  const aplicarLuz = () => {
    luces.forEach(([fuente, base]) => { fuente.intensity = base * luz.nivel; });
    world.scene.environmentIntensity = ambiente * luz.nivel;
  };
  const tween = (objetivo, valores) => new Promise(resolve => gsap.to(objetivo, { ...valores, onComplete: resolve }));

  return {
    get oscuro() { return cupula.visible && material.opacity > .99; },
    // Oscurece el entorno y la escena virtual. La cúpula se centra en la cabeza al empezar.
    cubrir() {
      const { oscurecer, luzMinima } = AJUSTES.transicion;
      world.player.head.getWorldPosition(cupula.position);
      cupula.visible = true;
      gsap.killTweensOf([material, luz]);
      // Las luces se leen al oscurecer; las que ya estaban atenuadas conservan su valor original.
      if (luz.nivel >= 1) {
        luces = [];
        world.scene.traverse(objeto => { if (objeto.isLight && objeto.intensity > 0) luces.push([objeto, objeto.intensity]); });
        ambiente = world.scene.environmentIntensity ?? 1;
      }
      return Promise.all([
        tween(material, { opacity: 1, duration: oscurecer, ease: 'sine.inOut' }),
        tween(luz, { nivel: luzMinima, duration: oscurecer * .9, ease: 'sine.in', onUpdate: aplicarLuz })
      ]);
    },
    pausa: () => new Promise(resolve => gsap.delayedCall(AJUSTES.transicion.pausa, resolve)),
    // Vuelve la luz: el escenario nuevo se ilumina primero y la habitación reaparece poco a poco.
    destapar() {
      const { aclarar } = AJUSTES.transicion;
      gsap.killTweensOf([material, luz]);
      return Promise.all([
        tween(luz, { nivel: 1, duration: aclarar * .7, ease: 'sine.out', onUpdate: aplicarLuz }),
        tween(material, { opacity: 0, duration: aclarar, delay: aclarar * .2, ease: 'sine.inOut' })
      ]).then(() => {
        cupula.visible = false;
        luz.nivel = 1;
        aplicarLuz();
      });
    }
  };
}
