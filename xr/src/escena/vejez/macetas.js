import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../../config.js';

/*
 * Dos macetas: se toman con un pellizco (o el botón de agarre), se arrastran y se sueltan sobre el mantel.
 * Cerca del mantel el mantel se aviva; al soltar dentro del radio de imán la maceta se acomoda sola en el
 * centro con un pequeño rebote (como choosePot en js/oldage-scene.js). Soltada lejos, vuelve a su lugar.
 * Elegida una, la otra deja de poder tomarse. Las macetas no giran al arrastrarlas.
 */
export function crearMacetas({ world, macetas, entidades, destino, mantel, sonido, alColocar }) {
  const { iman, senalar: alSenalar } = AJUSTES.vejez.macetas;
  const ids = Object.keys(macetas);
  const reposo = Object.fromEntries(ids.map(id => [id, macetas[id].root.position.clone()]));
  const estado = { habilitadas: false, elegida: null, sostenida: null, cerca: false };
  // El mantel se aviva cuando la maceta sostenida está sobre él.
  const brillo = [];
  mantel?.traverse(o => { if (o.isMesh && o.material?.emissive) brillo.push(o.material); });
  const avivar = activo => brillo.forEach(material => gsap.to(material, { emissiveIntensity: activo ? .35 : 0, duration: .25, overwrite: 'auto', onStart: () => { if (activo) material.emissive.set('#fadd87'); } }));

  const agarrable = (id, activo) => {
    const entidad = entidades[id];
    if (activo && !entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    if (!activo) {
      world.getSystem(GrabSystem)?.forceRelease(entidad);
      if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
    }
  };
  const distancia = id => Math.hypot(macetas[id].root.position.x - destino.x, macetas[id].root.position.z - destino.z);
  const llevar = (id, hasta, alTerminar) => {
    const { root } = macetas[id], desde = root.position.clone(), t = { v: 0 };
    gsap.to(t, { v: 1, duration: .6, ease: 'power2.inOut', onUpdate: () => { root.position.lerpVectors(desde, hasta, t.v).y += Math.sin(t.v * Math.PI) * .35; }, onComplete: alTerminar });
  };

  function colocar(id) {
    estado.elegida = id;
    ids.forEach(otra => agarrable(otra, false));
    sonido.playEffect('pot');
    const { visual } = macetas[id];
    gsap.to(visual.position, { y: 0, duration: .3 });
    gsap.to(visual.rotation, { x: 0, z: 0, duration: .3 });
    llevar(id, destino.clone(), () => {
      gsap.fromTo(visual.scale, { y: .94 }, { y: 1, duration: .45, ease: 'elastic.out(1, .5)' });
      alColocar(id);
    });
  }

  return {
    estado,
    habilitar() { estado.habilitadas = true; ids.forEach(id => agarrable(id, true)); },
    // Señalar (acercar la mano) una maceta la alza y la inclina un poco, como en la web.
    senalar(id, activo) {
      if (!estado.habilitadas || estado.elegida || estado.sostenida) return;
      const { visual } = macetas[id];
      gsap.to(visual.position, { y: activo ? alSenalar.alzar : 0, duration: .4, ease: activo ? 'back.out(2)' : 'power2.out', overwrite: 'auto' });
      gsap.to(visual.rotation, { z: activo ? alSenalar.inclinar : 0, duration: .45, ease: 'power2.out', overwrite: 'auto' });
    },
    sostener(id, activo) {
      if (!estado.habilitadas || estado.elegida) return;
      if (activo) {
        estado.sostenida = id;
        gsap.killTweensOf(macetas[id].root.position);
        return;
      }
      if (estado.sostenida !== id) return;
      estado.sostenida = null;
      avivar(false);
      estado.cerca = false;
      if (distancia(id) <= iman) colocar(id);
      else llevar(id, reposo[id]);
    },
    update() {
      const id = estado.sostenida;
      if (!id) return;
      // Sobre la mesa, nunca por debajo de ella.
      const { root } = macetas[id];
      root.position.y = Math.max(root.position.y, reposo[id].y);
      const cerca = distancia(id) <= iman;
      if (cerca !== estado.cerca) { estado.cerca = cerca; avivar(cerca); }
    },
    deshabilitar() { estado.habilitadas = false; ids.forEach(id => agarrable(id, false)); },
    // REPETIR: ninguna maceta elegida y el mantel sin brillo.
    reiniciar() {
      this.deshabilitar();
      Object.assign(estado, { elegida: null, sostenida: null, cerca: false });
      brillo.forEach(material => { gsap.killTweensOf(material); material.emissiveIntensity = 0; });
    }
  };
}
