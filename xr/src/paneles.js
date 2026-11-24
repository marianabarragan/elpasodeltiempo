import { PokeInteractable, RayInteractable, setWorldPosition, setWorldQuaternion } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import gsap from 'gsap';
import { texturaHojas } from './hojas.js';

const temporal = new Vector3(), giro = new Quaternion(), ARRIBA = new Vector3(0, 1, 0);
// Todos los paneles creados: la mano virtual se detiene en la cara de los que están a la vista (superficies.js).
export const PANELES = new Set();

/*
 * Crea un panel UIKitML (public/ui) como entidad que responde al rayo y al toque del índice.
 * `hojas` = [anchoCm, altoCm] añade el patrón de hojas al fondo verde.
 */
export async function crearPanel(world, assetId, { padre = null, hojas = null } = {}) {
  const objeto = await world.assets.instantiate(assetId);
  const entidad = world.createTransformEntity(objeto, padre ? { parent: padre } : undefined);
  objeto.visible = false;
  objeto.scale.setScalar(.001);
  // `escala`: tamaño del panel (1 = el de su diseño); el usuario lo cambia con las dos manos (mover-paneles.js) y los
  // paneles anclados a un escenario lo siguen (manipulacion.js). `aparicion` anima mostrar y ocultar.
  const panel = { entidad, objeto, visible: false, escala: 1, aparicion: 0, el: id => objeto.getElementById(id) };
  PANELES.add(panel);
  if (hojas) texturaHojas(...hojas).then(textura => panel.el('hojas')?.setProperties({ src: textura }));
  return panel;
}

// Ubica el panel en `posicion` (mundo) mirando a `objetivo` solo con giro horizontal. Un panel que el usuario
// ya acomodó con el botón de mover (mover-paneles.js) se queda donde lo dejó.
export function colocar(panel, posicion, objetivo) {
  if (panel.movidoPorUsuario) return;
  setWorldPosition(panel.objeto, posicion);
  orientarHacia(panel.objeto, objetivo);
}

// Ubica el panel en `posicion` (mundo) con el giro `giroMundo`: queda en el mismo plano que otro panel.
export function colocarAlineado(panel, posicion, giroMundo) {
  setWorldPosition(panel.objeto, posicion);
  setWorldQuaternion(panel.objeto, giroMundo);
}

// Los paneles miran hacia +Z: el giro es atan2(dx, dz) hacia el objetivo.
export function orientarHacia(objeto, objetivo) {
  objeto.updateWorldMatrix(true, false);
  objeto.getWorldPosition(temporal);
  giro.setFromAxisAngle(ARRIBA, Math.atan2(objetivo.x - temporal.x, objetivo.z - temporal.z));
  setWorldQuaternion(objeto, giro);
}

// Tamaño en pantalla: su escala por la animación de aparición.
export function aplicarEscala(panel) {
  panel.objeto.scale.setScalar(Math.max(.001, panel.escala * panel.aparicion));
}
// Cambia el tamaño del panel (también si está oculto o apareciendo).
export function escalarPanel(panel, escala) {
  panel.escala = escala;
  if (panel.aparicion > 0) aplicarEscala(panel);
}

// Muestra el panel creciendo desde su centro y habilita el rayo y el toque.
export function mostrar(panel, { duracion = .45, retraso = 0 } = {}) {
  panel.visible = true;
  panel.objeto.visible = true;
  if (!panel.entidad.hasComponent(RayInteractable)) panel.entidad.addComponent(RayInteractable);
  if (!panel.entidad.hasComponent(PokeInteractable)) panel.entidad.addComponent(PokeInteractable);
  gsap.killTweensOf(panel);
  return gsap.fromTo(panel, { aparicion: .9 }, { aparicion: 1, duration: duracion, delay: retraso, ease: 'back.out(1.6)', onStart: () => aplicarEscala(panel), onUpdate: () => aplicarEscala(panel) });
}

// Oculta el panel y deja de recibir el rayo y el toque mientras está oculto.
export function ocultar(panel, { duracion = .3 } = {}) {
  panel.visible = false;
  if (panel.entidad.hasComponent(RayInteractable)) panel.entidad.removeComponent(RayInteractable);
  if (panel.entidad.hasComponent(PokeInteractable)) panel.entidad.removeComponent(PokeInteractable);
  gsap.killTweensOf(panel);
  return new Promise(resolve => gsap.to(panel, {
    aparicion: 0, duration: duracion, ease: 'power2.in', onUpdate: () => aplicarEscala(panel),
    onComplete: () => { aplicarEscala(panel); panel.objeto.visible = false; resolve(); }
  }));
}

// Pulsación de un botón del panel (rayo con pellizco o gatillo, o toque del índice). Se activa al soltar
// sobre el mismo botón: el evento «click» exige soltar antes de 300 ms y un pellizco pausado lo supera.
// Con el modo de mover activo (mover-paneles.js) los botones del panel no responden.
export function alPulsar(panel, id, accion) {
  const elemento = panel.el(id);
  const presionados = new Set();
  elemento?.addEventListener('pointerdown', evento => presionados.add(evento.pointerId));
  elemento?.addEventListener('pointerleave', evento => presionados.delete(evento.pointerId));
  elemento?.addEventListener('pointerup', evento => {
    if (presionados.delete(evento.pointerId) && panel.visible && !panel.moviendo) accion();
  });
  return elemento;
}
