import * as THREE from 'three';
import { AJUSTES } from '../config.js';

let textura = null;

// Esquina del diseño: una L de brazos iguales y extremos redondeados, blanca con un borde gris, dibujada en un
// lienzo con su vértice arriba a la izquierda y los brazos hacia la derecha y hacia abajo.
function texturaEsquina() {
  if (textura) return textura;
  const { brazo, grosor, relleno, borde } = AJUSTES.manipulacion.esquinas;
  const n = 256, lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = n;
  const ctx = lienzo.getContext('2d');
  const ancho = n * grosor / brazo, linea = Math.max(4, ancho * .1), p = ancho / 2 + 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trazo = () => { ctx.beginPath(); ctx.moveTo(p, n - p); ctx.lineTo(p, p); ctx.lineTo(n - p, p); ctx.stroke(); };
  ctx.strokeStyle = borde; ctx.lineWidth = ancho; trazo();
  ctx.strokeStyle = relleno; ctx.lineWidth = ancho - 2 * linea; trazo();
  textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

// Signo de cada esquina (x a la derecha, y hacia arriba) y el giro que lleva la L del lienzo a esa esquina.
const ESQUINAS = [[-1, 1, 0], [1, 1, -Math.PI / 2], [1, -1, -Math.PI], [-1, -1, Math.PI / 2]];

/*
 * Señal de escalado (corrección): cuatro esquinas en forma de L junto a las esquinas de un rectángulo (la superficie
 * de un escenario o un panel), por fuera de él. Viven en el plano XY de su grupo; el que las usa decide dónde va el
 * grupo y su escala. `colocar(ancho, alto)` las reparte para un rectángulo de ese tamaño en unidades del grupo, con
 * `metro` unidades del grupo por metro (el brazo y la separación se dan en metros). `opacidad` las funde.
 */
export function crearEsquinas({ renderOrder = 5, encima = false } = {}) {
  const { brazo, separacion } = AJUSTES.manipulacion.esquinas;
  const material = new THREE.MeshBasicMaterial({
    map: texturaEsquina(), transparent: true, opacity: 0, depthWrite: false, depthTest: !encima, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
  const geometria = new THREE.PlaneGeometry(1, 1);
  const grupo = new THREE.Group();
  grupo.name = 'esquinas-escalado';
  grupo.visible = false;
  const piezas = ESQUINAS.map(([, , giro]) => {
    const pieza = new THREE.Mesh(geometria, material);
    pieza.rotation.z = giro;
    pieza.renderOrder = renderOrder;
    pieza.raycast = () => {};
    pieza.pointerEvents = 'none';
    pieza.userData.sombraContacto = true;
    grupo.add(pieza);
    return pieza;
  });
  return {
    grupo, material, piezas,
    colocar(ancho, alto, metro = 1) {
      const b = brazo * metro, d = separacion * metro;
      piezas.forEach((pieza, i) => {
        const [sx, sy] = ESQUINAS[i];
        pieza.scale.set(b, b, 1);
        pieza.position.set(sx * (ancho / 2 + d) - sx * b / 2, sy * (alto / 2 + d) - sy * b / 2, 0);
      });
    },
    set opacidad(valor) { material.opacity = valor; grupo.visible = valor > .01; },
    get opacidad() { return material.opacity; }
  };
}
