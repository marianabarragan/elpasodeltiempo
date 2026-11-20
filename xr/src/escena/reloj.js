import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { Tocable } from '../componentes.js';
import { AJUSTES } from '../config.js';

// Sustituto sin contexto WebGL: el reloj original crea su propio renderizador y aquí no hace falta.
class RendererVacio {
  constructor() { this.domElement = document.createElement('canvas'); this.outputColorSpace = ''; }
  setPixelRatio() {} setClearColor() {} setSize() {} render() {} dispose() {}
}

// Balanceo del reloj original (SWAY en js/intro-hourglass.js).
const BALANCEO = { yaw: .12, periodo: 16 };
const ARRIBA = new THREE.Vector3(0, 1, 0);

/*
 * Reutiliza IntroHourglass (js/intro-hourglass.js) con su modelo de Blender, su arena animada
 * y su brillo, pero dentro de la escena XR y sin su renderizador ni su bucle propio.
 * Durante la introducción se puede agarrar con una mano, levantar y girar: nunca atraviesa la mesa,
 * la arena se invierte al voltearlo (finishFlip del reloj original) y al soltarlo vuelve a apoyarse.
 */
export function crearReloj(world, espacio, { escala }) {
  const app = window.TimeExperience, real = window.THREE;
  window.THREE = Object.create(real, { WebGLRenderer: { value: RendererVacio } });
  let reloj;
  try { reloj = new app.IntroHourglass(document.createElement('div'), { cover: null }); }
  finally { window.THREE = real; }
  cancelAnimationFrame(reloj.frame);
  reloj.resizeObserver?.disconnect();
  Object.assign(reloj, { tick() {}, render() {}, resize() {} });

  const soporte = new THREE.Group();
  soporte.name = 'reloj-de-arena';
  const ajuste = new THREE.Group();
  soporte.add(ajuste);
  ajuste.add(reloj.root);
  soporte.scale.setScalar(escala);
  soporte.visible = false;
  const entidad = world.createTransformEntity(soporte, { parent: espacio.entidad });
  entidad.addComponent(Tocable, { id: 'reloj' });

  // Esquinas del reloj en el espacio del soporte, para no atravesar la mesa al moverlo.
  const esquinas = [];
  // Apoya la base del reloj sobre la mesa cuando su modelo termina de armarse.
  const listo = new Promise(resolve => {
    const esperar = () => {
      if (!reloj.built) { setTimeout(esperar, 50); return; }
      const caja = new THREE.Box3(), parte = new THREE.Box3();
      reloj.root.updateMatrixWorld(true);
      reloj.spin.traverse(objeto => { if (objeto.isMesh) caja.union(parte.setFromObject(objeto, true)); });
      ajuste.position.y = -caja.min.y + .02;
      soporte.updateMatrixWorld(true);
      const aSoporte = soporte.matrixWorld.clone().invert(), local = new THREE.Box3(), matriz = new THREE.Matrix4();
      reloj.spin.traverse(objeto => {
        if (!objeto.isMesh) return;
        objeto.geometry.computeBoundingBox();
        local.union(parte.copy(objeto.geometry.boundingBox).applyMatrix4(matriz.multiplyMatrices(aSoporte, objeto.matrixWorld)));
      });
      for (const x of [local.min.x, local.max.x]) for (const y of [local.min.y, local.max.y]) for (const z of [local.min.z, local.max.z]) esquinas.push(new THREE.Vector3(x, y, z));
      resolve();
    };
    esperar();
  });

  // Punto más bajo del reloj (metros sobre la mesa) con el soporte en la pose dada.
  const punto = new THREE.Vector3(), matrizPose = new THREE.Matrix4(), escalaPose = new THREE.Vector3();
  const alturaMinima = (posicion, giro) => {
    matrizPose.compose(posicion, giro, escalaPose.copy(soporte.scale));
    return esquinas.reduce((minimo, esquina) => Math.min(minimo, punto.copy(esquina).applyMatrix4(matrizPose).y), Infinity);
  };

  const estado = { sostenido: false, asentando: null, agarrable: false };
  const eje = new THREE.Vector3(), giroObjetivo = new THREE.Quaternion(), enderezar = new THREE.Quaternion();
  const { holgura, bordeMesa, asentar, volteo, inclinado } = AJUSTES.reloj;

  // Al soltarlo, se endereza sobre su base actual (la que queda abajo) y se apoya dentro de la mesa.
  function asentarse() {
    estado.asentando?.kill();
    const signo = reloj.sand?.sign ?? 1;
    eje.copy(ARRIBA).applyQuaternion(soporte.quaternion).multiplyScalar(signo);
    giroObjetivo.copy(enderezar.setFromUnitVectors(eje.normalize(), ARRIBA).multiply(soporte.quaternion));
    const limiteX = Math.max(0, espacio.ancho / 2 - bordeMesa), limiteZ = Math.max(0, espacio.fondo / 2 - bordeMesa);
    const destino = new THREE.Vector3(THREE.MathUtils.clamp(soporte.position.x, -limiteX, limiteX), 0, THREE.MathUtils.clamp(soporte.position.z, -limiteZ, limiteZ));
    destino.y = holgura - alturaMinima(destino, giroObjetivo);
    const desde = soporte.position.clone(), giroInicial = soporte.quaternion.clone(), avance = { t: 0 };
    estado.asentando = gsap.to(avance, {
      t: 1, duration: asentar, ease: 'power2.inOut',
      onUpdate: () => {
        soporte.position.lerpVectors(desde, destino, avance.t);
        soporte.quaternion.slerpQuaternions(giroInicial, giroObjetivo, avance.t);
      },
      onComplete: () => { estado.asentando = null; }
    });
  }

  // Las luces de la arena tienen intensidad física: al reducir el reloj, se reduce su alcance.
  const atenuar = escala * escala;
  return {
    entidad, soporte, listo, estado, original: reloj,
    // El reloj se puede agarrar mientras la introducción está visible.
    habilitarAgarre(activo) {
      estado.agarrable = activo;
      if (activo && !entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: true, translate: true });
      if (!activo) {
        world.getSystem(GrabSystem)?.forceRelease(entidad);
        if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      }
    },
    sostener(activo) {
      if (activo) {
        estado.asentando?.kill();
        estado.asentando = null;
        estado.sostenido = true;
      } else if (estado.sostenido) {
        estado.sostenido = false;
        if (soporte.visible && estado.agarrable) asentarse();
      }
    },
    paso(dt) {
      if (!reloj.built || !soporte.visible) return;
      if (reloj.hidden) { reloj.hidden = false; reloj.time = 0; reloj.resetSand(); }
      reloj.time += dt;
      // En la mano no flota ni se balancea: así se siente sólido.
      const t = reloj.time, quieto = estado.sostenido || estado.asentando, movimiento = reloj.reduced || quieto ? 0 : 1;
      reloj.spin.rotation.y = movimiento * BALANCEO.yaw * Math.sin(t * Math.PI * 2 / BALANCEO.periodo);
      reloj.root.position.y = movimiento * .05 * Math.sin(t * .9);
      reloj.glow.level = 1 + movimiento * (.07 * Math.sin(t * 1.3) + .025 * Math.sin(t * 4.1));
      // Con el reloj volteado, la arena de abajo pasa a estar arriba y vuelve a caer, como en la portada.
      soporte.updateMatrixWorld(true);
      const vertical = eje.copy(ARRIBA).transformDirection(soporte.matrixWorld).y;
      if (vertical * reloj.sand.sign < -volteo) reloj.finishFlip();
      const deCostado = Math.abs(vertical) < inclinado;
      if (!deCostado) reloj.drain = Math.min(1, reloj.drain + dt / reloj.settings.drainSeconds);
      reloj.updateSand(reloj.reduced ? 0 : reloj.drain);
      if (deCostado) {
        reloj.stream.visible = false;
        reloj.grains.forEach(grano => { grano.visible = false; });
        reloj.glow.halos.stream.visible = false;
      }
      reloj.glow.lamps.top.intensity *= atenuar;
      reloj.glow.lamps.bottom.intensity *= atenuar;
      // Mientras se sostiene, la mano puede bajarlo hasta la mesa pero no a través de ella.
      if (estado.sostenido && esquinas.length) {
        const bajo = alturaMinima(soporte.position, soporte.quaternion);
        if (bajo < holgura) soporte.position.y += holgura - bajo;
      }
    },
    async aparecer() {
      await listo;
      soporte.visible = true;
      return gsap.fromTo(soporte.scale, { x: escala * .6, y: escala * .6, z: escala * .6 }, { x: escala, y: escala, z: escala, duration: .8, ease: 'back.out(1.5)' });
    },
    desaparecer() {
      this.habilitarAgarre(false);
      estado.sostenido = false;
      estado.asentando?.kill();
      return new Promise(resolve => gsap.to(soporte.scale, {
        x: escala * .001, y: escala * .001, z: escala * .001, duration: .5, ease: 'power2.in',
        onComplete: () => { soporte.visible = false; resolve(); }
      }));
    }
  };
}
