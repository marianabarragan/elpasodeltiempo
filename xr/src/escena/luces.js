import * as THREE from 'three';

/*
 * Luz cálida de atardecer sobre la mesa. Ya no proyecta sombras con mapa (dibujaban la escena una segunda vez
 * cada cuadro): los objetos se apoyan con sombras de contacto (escena/sombras.js). Colores, intensidades y
 * dirección son los mismos de antes, así la iluminación de cada escenario no cambia.
 */
export function crearLuces(world, espacio) {
  const grupo = new THREE.Group();
  grupo.name = 'luces-calidas';
  const cielo = new THREE.HemisphereLight(0xffe2bf, 0x9a7656, 1.35);
  const sol = new THREE.DirectionalLight(0xffc68e, 1.9);
  sol.position.set(-.6, 1.2, -.45);
  sol.target.position.set(0, 0, 0);
  sol.castShadow = false;
  const relleno = new THREE.DirectionalLight(0xffd9ad, .5);
  relleno.position.set(.7, .9, .8);
  grupo.add(cielo, sol, sol.target, relleno);
  world.createTransformEntity(grupo, { parent: espacio.entidad });
  return { grupo, sol };
}
