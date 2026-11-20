import * as THREE from 'three';

// Luz cálida de atardecer sobre la mesa, con sombras suaves para apoyar los objetos virtuales.
export function crearLuces(world, espacio) {
  const grupo = new THREE.Group();
  grupo.name = 'luces-calidas';
  const cielo = new THREE.HemisphereLight(0xffe2bf, 0x9a7656, 1.35);
  const sol = new THREE.DirectionalLight(0xffc68e, 1.9);
  const posicionSol = new THREE.Vector3(-.6, 1.2, -.45);
  sol.position.copy(posicionSol);
  sol.target.position.set(0, 0, 0);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  const alcance = Math.max(espacio.ancho, espacio.fondo) * .65 + .15;
  Object.assign(sol.shadow.camera, { left: -alcance, right: alcance, top: alcance, bottom: -alcance, near: .1, far: 3.5 });
  sol.shadow.bias = -.0004;
  sol.shadow.normalBias = .01;
  sol.shadow.radius = 3;
  const relleno = new THREE.DirectionalLight(0xffd9ad, .5);
  relleno.position.set(.7, .9, .8);
  grupo.add(cielo, sol, sol.target, relleno);
  world.createTransformEntity(grupo, { parent: espacio.entidad });
  const anterior = { x: 0, y: 0, z: 0, k: 1 };
  return {
    grupo, sol,
    // Las sombras acompañan al escenario que el usuario mueve o escala (raíz hija del espacio de la mesa):
    // la luz conserva su dirección y su zona de sombra se centra en el escenario y crece con él.
    seguir(raiz) {
      const { x, y, z } = raiz.position, k = raiz.scale.x;
      if (x === anterior.x && y === anterior.y && z === anterior.z && k === anterior.k) return;
      Object.assign(anterior, { x, y, z, k });
      sol.target.position.copy(raiz.position);
      sol.position.copy(posicionSol).multiplyScalar(Math.max(1, k)).add(raiz.position);
      const a = alcance * k;
      Object.assign(sol.shadow.camera, { left: -a, right: a, top: a, bottom: -a, far: 3.5 * Math.max(1, k) });
      sol.shadow.camera.updateProjectionMatrix();
    }
  };
}
