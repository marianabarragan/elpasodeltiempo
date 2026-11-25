import * as THREE from 'three';

// Lados del rectángulo (en el plano XZ, centrado en el origen): de una esquina a la siguiente, en sentido antihorario
// visto desde arriba, con su normal hacia afuera. 0 fondo (−Z), 1 derecha (+X), 2 frente (+Z), 3 izquierda (−X).
const LADOS = [
  { desde: [1, -1], hasta: [-1, -1], normal: [0, -1] },
  { desde: [1, 1], hasta: [1, -1], normal: [1, 0] },
  { desde: [-1, 1], hasta: [1, 1], normal: [0, 1] },
  { desde: [-1, -1], hasta: [-1, 1], normal: [-1, 0] }
];

/*
 * Cantos de una superficie gruesa (corrección: las superficies de los escenarios 1 y 3 son 3D, con el grosor del
 * escritorio de la adultez): cuatro caras laterales y la cara de abajo de un rectángulo de `hx` × `hz` (medias
 * medidas) entre y = 0 y y = `alto`, en el espacio de quien lo use. `uv(lado, t, h)` da la coordenada de textura de
 * un punto del lado (t de 0 a 1 a lo largo del lado, h de 0 abajo a 1 arriba) y `uvAbajo(x, z)` la de la cara de
 * abajo. Cada lado se divide en `pasos` tramos para que la textura siga lo que haya en el borde.
 */
export function crearCanto({ hx, hz, alto, material, uv, uvAbajo = null, pasos = 48 }) {
  const posiciones = [], normales = [], uvs = [], indices = [];
  LADOS.forEach(({ desde, hasta, normal }, lado) => {
    const base = posiciones.length / 3;
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      const x = (desde[0] + (hasta[0] - desde[0]) * t) * hx, z = (desde[1] + (hasta[1] - desde[1]) * t) * hz;
      for (const h of [0, 1]) {
        posiciones.push(x, h * alto, z);
        normales.push(normal[0], 0, normal[1]);
        uvs.push(...uv(lado, t, h));
      }
    }
    for (let i = 0; i < pasos; i++) {
      const a = base + i * 2;
      // a (abajo), a+1 (arriba), a+2 (abajo siguiente), a+3 (arriba siguiente): caras hacia afuera.
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  // Cara de abajo (mirando hacia abajo).
  const b = posiciones.length / 3;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    posiciones.push(sx * hx, 0, sz * hz);
    normales.push(0, -1, 0);
    uvs.push(...(uvAbajo ? uvAbajo(sx * hx, sz * hz) : [(sx + 1) / 2, (sz + 1) / 2]));
  });
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  const canto = new THREE.Mesh(geometria, material);
  canto.name = 'canto-superficie';
  canto.raycast = () => {};
  canto.pointerEvents = 'none';
  return canto;
}

// Punto (x, z) de un lado del rectángulo en t, y su normal hacia afuera.
export function puntoDelLado(lado, t, hx, hz) {
  const { desde, hasta, normal } = LADOS[lado];
  return { x: (desde[0] + (hasta[0] - desde[0]) * t) * hx, z: (desde[1] + (hasta[1] - desde[1]) * t) * hz, nx: normal[0], nz: normal[1] };
}
