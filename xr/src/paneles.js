import { PokeInteractable, RayInteractable, setWorldPosition, setWorldQuaternion } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import gsap from 'gsap';
import { texturaHojas } from './hojas.js';

const temporal = new Vector3(), giro = new Quaternion(), ARRIBA = new Vector3(0, 1, 0);

/*
 * Crea un panel UIKitML (public/ui) como entidad que responde al rayo y al toque del índice.
 * `hojas` = [anchoCm, altoCm] añade el patrón de hojas al fondo verde.
 */
export async function crearPanel(world, assetId, { padre = null, hojas = null } = {}) {
  const objeto = await world.assets.instantiate(assetId);
  const entidad = world.createTransformEntity(objeto, padre ? { parent: padre } : undefined);
  objeto.visible = false;
  objeto.scale.setScalar(.001);
  const panel = { entidad, objeto, visible: false, el: id => objeto.getElementById(id) };
  if (hojas) texturaHojas(...hojas).then(textura => panel.el('hojas')?.setProperties({ src: textura }));
  return panel;
}

// Ubica el panel en `posicion` (mundo) mirando a `objetivo` solo con giro horizontal.
export function colocar(panel, posicion, objetivo) {
  setWorldPosition(panel.objeto, posicion);
  orientarHacia(panel.objeto, objetivo);
}

// Los paneles miran hacia +Z: el giro es atan2(dx, dz) hacia el objetivo.
export function orientarHacia(objeto, objetivo) {
  objeto.updateWorldMatrix(true, false);
  objeto.getWorldPosition(temporal);
  giro.setFromAxisAngle(ARRIBA, Math.atan2(objetivo.x - temporal.x, objetivo.z - temporal.z));
  setWorldQuaternion(objeto, giro);
}

// Muestra el panel creciendo desde su centro y habilita el rayo y el toque.
export function mostrar(panel, { duracion = .45, retraso = 0 } = {}) {
  panel.visible = true;
  panel.objeto.visible = true;
  if (!panel.entidad.hasComponent(RayInteractable)) panel.entidad.addComponent(RayInteractable);
  if (!panel.entidad.hasComponent(PokeInteractable)) panel.entidad.addComponent(PokeInteractable);
  gsap.killTweensOf(panel.objeto.scale);
  return gsap.fromTo(panel.objeto.scale, { x: .9, y: .9, z: .9 }, { x: 1, y: 1, z: 1, duration: duracion, delay: retraso, ease: 'back.out(1.6)' });
}

// Oculta el panel y deja de recibir el rayo y el toque mientras está oculto.
export function ocultar(panel, { duracion = .3 } = {}) {
  panel.visible = false;
  if (panel.entidad.hasComponent(RayInteractable)) panel.entidad.removeComponent(RayInteractable);
  if (panel.entidad.hasComponent(PokeInteractable)) panel.entidad.removeComponent(PokeInteractable);
  gsap.killTweensOf(panel.objeto.scale);
  return new Promise(resolve => gsap.to(panel.objeto.scale, {
    x: .001, y: .001, z: .001, duration: duracion, ease: 'power2.in',
    onComplete: () => { panel.objeto.visible = false; resolve(); }
  }));
}

// Pulsación de un botón del panel (rayo con pellizco o gatillo, o toque del índice). Se activa al soltar
// sobre el mismo botón: el evento «click» exige soltar antes de 300 ms y un pellizco pausado lo supera.
export function alPulsar(panel, id, accion) {
  const elemento = panel.el(id);
  const presionados = new Set();
  elemento?.addEventListener('pointerdown', evento => presionados.add(evento.pointerId));
  elemento?.addEventListener('pointerleave', evento => presionados.delete(evento.pointerId));
  elemento?.addEventListener('pointerup', evento => {
    if (presionados.delete(evento.pointerId) && panel.visible) accion();
  });
  return elemento;
}
