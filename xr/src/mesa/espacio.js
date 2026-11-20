import * as THREE from 'three';
import { XRAnchor } from '@iwsdk/core';

// Elige el borde de la superficie que mira al usuario: el ancho corre a lo largo de ese borde.
export function medirFrente(candidata, cabeza) {
  const hacia = new THREE.Vector3(cabeza.x - candidata.centro.x, 0, cabeza.z - candidata.centro.z).normalize();
  const opciones = [candidata.ejeX, candidata.ejeX.clone().negate(), candidata.ejeZ, candidata.ejeZ.clone().negate()];
  const frente = opciones.reduce((mejor, eje) => eje.dot(hacia) > mejor.dot(hacia) ? eje : mejor);
  const frenteEsZ = Math.abs(frente.dot(candidata.ejeZ)) > .5;
  return {
    frente,
    ancho: frenteEsZ ? candidata.ancho : candidata.fondo,
    fondo: frenteEsZ ? candidata.fondo : candidata.ancho
  };
}

/*
 * Espacio de la mesa confirmada: origen en el centro de su cara superior, +Y hacia arriba
 * y +Z hacia el usuario. Todo el contenido de la experiencia cuelga de este grupo, que queda
 * anclado (XRAnchor) para no moverse si el visor recentra la vista o pierde el seguimiento.
 */
export function crearEspacio(world, candidata, cabeza) {
  const { frente, ancho, fondo } = medirFrente(candidata, cabeza);
  const raiz = new THREE.Group();
  raiz.name = 'espacio-mesa';
  raiz.position.copy(candidata.centro);
  raiz.rotation.y = Math.atan2(frente.x, frente.z);
  const entidad = world.createTransformEntity(raiz);
  if (world.session?.enabledFeatures?.includes('anchors')) entidad.addComponent(XRAnchor);
  return { entidad, raiz, ancho, fondo, fuente: candidata.fuente, etiqueta: candidata.etiqueta };
}

// Posición en el espacio de la mesa → mundo, y cabeza (mundo) → espacio de la mesa.
export function aMundo(espacio, x, y, z) {
  espacio.raiz.updateWorldMatrix(true, false);
  return espacio.raiz.localToWorld(new THREE.Vector3(x, y, z));
}
// Posición en el espacio de un escenario → mundo. La raíz del escenario cuelga del espacio de la mesa y
// coincide con él hasta que el usuario lo mueve o escala; desde entonces los paneles se ubican respecto de él.
export function aEscena(raiz, x, y, z) {
  raiz.updateWorldMatrix(true, false);
  return raiz.localToWorld(new THREE.Vector3(x, y, z));
}
export function cabezaLocal(espacio, cabeza) {
  espacio.raiz.updateWorldMatrix(true, false);
  return espacio.raiz.worldToLocal(cabeza.clone());
}
