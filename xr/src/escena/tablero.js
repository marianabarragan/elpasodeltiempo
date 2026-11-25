import * as THREE from 'three';
import gsap from 'gsap';
import { Grabbed, PokeInteractable, RayInteractable, TwoHandsGrabbable } from '@iwsdk/core';
import { Tocable } from '../componentes.js';
import { AJUSTES } from '../config.js';

const MITAD_ALTO = 6.05; // medio alto del marco en unidades del tablero original

/*
 * Tablero de corcho con la cuerda, las tres fotos y los candados, construido con los métodos
 * de IntroScene (js/intro-scene.js) sin su renderizador ni su cámara. Flota sobre la mesa,
 * se mueve con las dos manos y cada foto es un Tocable («foto-childhood», …).
 */
export function crearTablero(world, espacio) {
  const app = window.TimeExperience;
  const escala = AJUSTES.escala.tablero;
  const tablero = Object.create(app.IntroScene.prototype);
  Object.assign(tablero, {
    board: new THREE.Group(), photos: [], hoveredPhoto: null, render() {},
    options: { photoSources: app.Config.assets.photos, lockIcon: app.Config.assets.photoLock }
  });
  tablero.buildBoard();
  tablero.buildRopeAndPhotos();
  // La pared del tablero original no tiene sentido en la habitación real.
  const pared = tablero.board.getObjectByName('wall');
  pared?.removeFromParent();
  pared?.geometry.dispose();
  pared?.material.dispose();

  const raiz = new THREE.Group();
  raiz.name = 'tablero-de-recuerdos';
  raiz.add(tablero.board);
  tablero.board.scale.setScalar(escala);
  raiz.visible = false;
  const entidad = world.createTransformEntity(raiz, { parent: espacio.entidad });
  const entidadTablero = world.createTransformEntity(tablero.board, { parent: entidad });
  const fotos = tablero.photos.map(foto => {
    const entidadFoto = world.createTransformEntity(foto.group, { parent: entidadTablero });
    entidadFoto.addComponent(Tocable, { id: `foto-${foto.stage}` });
    return { ...foto, entidad: entidadFoto };
  });

  const activarFotos = activo => fotos.forEach(({ entidad: e }) => {
    for (const Componente of [RayInteractable, PokeInteractable]) {
      if (activo && !e.hasComponent(Componente)) e.addComponent(Componente);
      if (!activo && e.hasComponent(Componente)) e.removeComponent(Componente);
    }
  });
  const activarMover = activo => {
    if (activo && !entidad.hasComponent(TwoHandsGrabbable)) entidad.addComponent(TwoHandsGrabbable, { translate: true, rotate: true, scale: false });
    if (!activo && entidad.hasComponent(TwoHandsGrabbable)) entidad.removeComponent(TwoHandsGrabbable);
  };

  const euler = new THREE.Euler(), cabeza = new THREE.Vector3();
  return {
    entidad, raiz, tablero,
    estaDesbloqueada: etapa => tablero.isPhotoUnlocked(etapa),
    // Vuelve a poner los candados de la segunda y la tercera foto (REPETIR en la sección de aportes).
    reiniciar: () => tablero.resetPhotoLocks(),
    desbloquear: (etapa, alTerminar) => tablero.unlockPhoto(etapa, { duration: 1.1, onComplete: alTerminar }),
    senalar: etapa => tablero.setHoveredPhoto(etapa),
    // Frente al usuario, por encima de la mesa y hacia su fondo, mirando a la cabeza.
    colocar(cabezaLocal) {
      const { alturaMin, alturaMax, fondo } = AJUSTES.tablero;
      raiz.position.set(0, THREE.MathUtils.clamp(cabezaLocal.y - .22, alturaMin, alturaMax), -espacio.fondo * fondo);
      raiz.rotation.set(0, Math.atan2(cabezaLocal.x - raiz.position.x, cabezaLocal.z - raiz.position.z), 0);
    },
    aparecer() {
      raiz.visible = true;
      activarFotos(true);
      activarMover(true);
      gsap.fromTo(raiz.position, { y: raiz.position.y - .06 }, { y: raiz.position.y, duration: .9, ease: 'power2.out' });
      return gsap.fromTo(raiz.scale, { x: .85, y: .85, z: .85 }, { x: 1, y: 1, z: 1, duration: .9, ease: 'back.out(1.4)' });
    },
    // Respuesta de la foto elegida antes de la transición.
    destacar(etapa) {
      const foto = fotos.find(f => f.stage === etapa);
      return gsap.timeline().to(foto.visual.scale, { x: 1.14, y: 1.14, z: 1.14, duration: .22, ease: 'power2.out' })
        .to(foto.visual.scale, { x: 1, y: 1, z: 1, duration: .35, ease: 'power2.inOut' });
    },
    bloquearInteraccion() { activarFotos(false); activarMover(false); tablero.clearHover(true); },
    habilitarInteraccion() { activarFotos(true); activarMover(true); },
    ocultar() { raiz.visible = false; this.bloquearInteraccion(); },
    mostrar() { raiz.visible = true; },
    // Tras moverlo con dos manos: vertical, sobre la mesa y a una distancia cómoda.
    update(cabezaMundo) {
      if (!raiz.visible || !entidad.hasComponent(Grabbed)) return;
      const { separacionMesa, distanciaMin, distanciaMax, alturaMax } = AJUSTES.tablero;
      euler.setFromQuaternion(raiz.quaternion, 'YXZ');
      raiz.rotation.set(0, euler.y, 0);
      raiz.position.y = THREE.MathUtils.clamp(raiz.position.y, MITAD_ALTO * escala + separacionMesa, alturaMax + .4);
      espacio.raiz.updateWorldMatrix(true, false);
      cabeza.copy(cabezaMundo);
      espacio.raiz.worldToLocal(cabeza);
      const dx = raiz.position.x - cabeza.x, dz = raiz.position.z - cabeza.z, d = Math.hypot(dx, dz);
      if (d > 0 && (d < distanciaMin || d > distanciaMax)) {
        const k = THREE.MathUtils.clamp(d, distanciaMin, distanciaMax) / d;
        raiz.position.x = cabeza.x + dx * k;
        raiz.position.z = cabeza.z + dz * k;
      }
    }
  };
}
