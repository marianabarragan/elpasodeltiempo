import * as THREE from 'three';
import { colocar, crearPanel, mostrar, ocultar } from '../../paneles.js';

// Corazón del proyecto (--goal en styles.css), en crema, con tamaño explícito para la textura.
const CORAZON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="203" viewBox="327.06 14.15 18.32 14.51"><path fill="#fff7e8" d="M336.69,28.66h-.22c-1.19.02-2.35-.48-3.01-1.39l-5.87-8.05c-1.02-1.41-.51-3.29,1.15-4.18.54-.3,1.15-.45,1.74-.47,1.23-.04,2.44.46,3.13,1.4l2.7,3.7,2.42-3.89c.93-1.48,3.08-2.06,4.8-1.28,1.71.77,2.36,2.61,1.44,4.09l-5.27,8.45c-.6.96-1.72,1.54-2.9,1.61-.04,0-.08,0-.12,0Z"/></svg>`)}`;

/*
 * Indicador vertical de riego (el .oldage-progress de la web) junto a la regadera: aparece al empezar
 * a verter, el relleno sube con el riego acumulado y desaparece al completarlo.
 */
export async function crearIndicadorRiego(world, espacio, { regadera, cabeza }) {
  const panel = await crearPanel(world, 'panel-riego', { padre: espacio.entidad });
  panel.el('corazon')?.setProperties({ src: CORAZON });
  const relleno = panel.el('relleno');
  const centro = new THREE.Vector3(), adelante = new THREE.Vector3(), derecha = new THREE.Vector3(), caja = new THREE.Box3();
  let dibujado = -1;
  return {
    panel,
    mostrar() { if (!panel.visible) mostrar(panel, { duracion: .3 }); },
    ocultar() { if (panel.visible) ocultar(panel, { duracion: .45 }); },
    // Igual que la web: 1,9 cm de relleno más 9,9 cm según el avance.
    avance(valor) {
      if (Math.abs(valor - dibujado) < .005) return;
      dibujado = valor;
      relleno?.setProperties({ height: 1.9 + 9.9 * valor });
    },
    // A la derecha de la regadera, vista desde el usuario.
    seguir() {
      if (!panel.visible) return;
      const ojo = cabeza();
      caja.setFromObject(regadera.visual).getCenter(centro);
      adelante.subVectors(centro, ojo).setY(0).normalize();
      derecha.set(-adelante.z, 0, adelante.x);
      const medio = caja.getSize(adelante).x * .5;
      colocar(panel, centro.addScaledVector(derecha, medio + .05).setY(centro.y + .02), ojo);
    }
  };
}
