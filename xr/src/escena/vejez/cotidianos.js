import gsap from 'gsap';
import { PokeInteractable, RayInteractable } from '@iwsdk/core';

// Respuesta al señalarlas, como CUP_HOVER y RADIO_HOVER en js/oldage-scene.js.
const TAZA = { alzar: .12, escala: 1.05 }, RADIO = 1.045;

/*
 * Pequeños momentos: la taza de café y la radio responden al toque del índice (o al rayo si quedan lejos)
 * después de ponerse las gafas. Su respuesta es la de la web (OldAgeScene.poke: la radio se mece, mueve
 * la antena y suena; la taza gira sobre el plato y se oye un sorbo) y cualquiera de las dos suma el hito.
 */
export function crearCotidianos({ objetos, entidades, sonido, alUsar }) {
  const app = window.TimeExperience;
  const nombres = { 'vejez-radio': 'radio', 'vejez-taza': 'coffeeCup' };
  const estado = { habilitados: false };
  // Contexto prestado para el método de la web: solo usa props, audio y progress.mark.
  const prestado = { props: objetos, audio: sonido, progress: { mark: paso => alUsar(paso) } };
  return {
    estado,
    habilitar() {
      estado.habilitados = true;
      Object.values(entidades).forEach(entidad => {
        if (!entidad.hasComponent(RayInteractable)) entidad.addComponent(RayInteractable);
        if (!entidad.hasComponent(PokeInteractable)) entidad.addComponent(PokeInteractable);
      });
    },
    deshabilitar() {
      estado.habilitados = false;
      Object.values(entidades).forEach(entidad => [RayInteractable, PokeInteractable].forEach(C => { if (entidad.hasComponent(C)) entidad.removeComponent(C); }));
    },
    senalar(id, activo) {
      if (!estado.habilitados) return;
      if (nombres[id] === 'coffeeCup') {
        const { visual } = objetos.coffeeCup, escala = activo ? TAZA.escala : 1;
        gsap.to(visual.position, { y: activo ? TAZA.alzar : 0, duration: .3, ease: 'power2.out', overwrite: 'auto' });
        gsap.to(visual.scale, { x: escala, y: escala, z: escala, duration: .3, ease: 'power2.out', overwrite: 'auto' });
      } else {
        const escala = activo ? RADIO : 1;
        gsap.to(objetos.radio.visual.scale, { x: escala, y: escala, z: escala, duration: .3, ease: 'power2.out', overwrite: 'auto' });
      }
    },
    presionar(id) {
      if (estado.habilitados) app.OldAgeScene.prototype.poke.call(prestado, nombres[id]);
    }
  };
}
