import * as THREE from 'three';
import { AJUSTES } from '../config.js';
import { colocar } from '../paneles.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const angulo = v => Math.atan2(v.x, v.z);
const envolver = a => Math.atan2(Math.sin(a), Math.cos(a));

/*
 * Manipulación de un escenario completo con las dos manos (guía de gestos manuales del equipo):
 * - Trasladar y girar: las dos palmas abiertas hacia arriba, bajo el escenario o junto a su borde, como al
 *   sostener una bandeja. El escenario sigue el punto medio de las manos (también en altura) y gira en
 *   horizontal con la línea que las une.
 * - Ampliar y reducir: un pellizco con cada mano sobre el escenario; separarlas lo amplía y juntarlas lo
 *   reduce, de forma uniforme, alrededor del punto entre las manos y sin cambiar la altura de su superficie.
 * Con controles: los dos botones laterales trasladan y los dos gatillos escalan.
 *
 * Se transforma solo la raíz del escenario (hija del espacio de la mesa anclado): todos sus objetos la
 * acompañan con sus posiciones relativas y su superficie sigue horizontal, así lo que se apoya en ella no
 * se desliza. La mesa real solo fija la posición inicial; el tablero y los demás elementos globales no se
 * mueven. Los paneles anclados (barra, frase, flecha) acompañan al escenario sin cambiar de tamaño.
 */
export function crearManipulacion({ manos, espacio, raiz, area, cabeza }) {
  const M = AJUSTES.manipulacion;
  const estado = { modo: null, espera: 0, gracia: 0, inicio: null, movimientos: 0 };
  const anclas = new Map();
  const izq = new THREE.Vector3(), der = new THREE.Vector3(), medio = new THREE.Vector3(), local = new THREE.Vector3();
  const objetivo = new THREE.Vector3(), desfase = new THREE.Vector3();

  const enEspacio = (mundo, destino) => {
    espacio.raiz.updateWorldMatrix(true, false);
    return espacio.raiz.worldToLocal(destino.copy(mundo));
  };
  // Un punto (mundo) está sobre el escenario o junto a su borde, a una altura razonable de su superficie.
  const cerca = mundo => {
    raiz.updateWorldMatrix(true, false);
    raiz.worldToLocal(local.copy(mundo));
    const k = raiz.scale.x, margen = M.margen / k;
    return Math.abs(local.x) <= area.ancho / 2 + margen && Math.abs(local.z) <= area.fondo / 2 + margen
      && local.y * k >= M.alturaMin && local.y * k <= M.alturaMax;
  };
  const separadas = (a, b) => a.distanceTo(b) >= M.separacionMin;

  function acompanar() {
    if (!anclas.size) return;
    raiz.updateWorldMatrix(true, false);
    const ojo = cabeza();
    anclas.forEach((posicion, panel) => colocar(panel, raiz.localToWorld(objetivo.copy(posicion)), ojo));
  }

  function empezar(modo) {
    estado.modo = modo;
    estado.gracia = 0;
    estado.movimientos += 1;
    const { left, right } = manos;
    const puntoDe = mano => (modo === 'trasladar' ? mano.centro : mano.pinza);
    enEspacio(puntoDe(left), izq);
    enEspacio(puntoDe(right), der);
    medio.addVectors(izq, der).multiplyScalar(.5);
    estado.inicio = {
      medio: medio.clone(), angulo: angulo(desfase.subVectors(der, izq)), separacion: izq.distanceTo(der),
      posicion: raiz.position.clone(), giro: raiz.rotation.y, escala: raiz.scale.x, escalando: false,
      // Pivote del escalado: entre las manos, a la altura de la superficie del escenario.
      pivote: new THREE.Vector3(medio.x, raiz.position.y, medio.z)
    };
  }
  function terminar() { estado.modo = null; estado.espera = 0; estado.inicio = null; }

  function trasladar(alfa) {
    const { inicio } = estado;
    enEspacio(manos.left.centro, izq);
    enEspacio(manos.right.centro, der);
    medio.addVectors(izq, der).multiplyScalar(.5);
    const giro = envolver(angulo(desfase.subVectors(der, izq)) - inicio.angulo);
    objetivo.subVectors(inicio.posicion, inicio.medio).applyAxisAngle(ARRIBA, giro).add(medio);
    raiz.position.lerp(objetivo, alfa);
    raiz.rotation.y += envolver(inicio.giro + giro - raiz.rotation.y) * alfa;
  }

  function escalar(alfa) {
    const { inicio } = estado;
    enEspacio(manos.left.pinza, izq);
    enEspacio(manos.right.pinza, der);
    const separacion = izq.distanceTo(der);
    if (!inicio.escalando) {
      if (Math.abs(separacion / inicio.separacion - 1) < M.zonaMuerta) return;
      // Pasada la zona muerta, el escalado parte de la separación actual (sin saltos).
      Object.assign(inicio, { escalando: true, separacion, escala: raiz.scale.x, posicion: raiz.position.clone() });
    }
    const meta = THREE.MathUtils.clamp(inicio.escala * separacion / inicio.separacion, M.escalaMin, M.escalaMax);
    const k = raiz.scale.x + (meta - raiz.scale.x) * alfa;
    raiz.scale.setScalar(k);
    raiz.position.subVectors(inicio.posicion, inicio.pivote).multiplyScalar(k / inicio.escala).add(inicio.pivote);
  }

  return {
    estado, raiz,
    get activo() { return estado.modo !== null; },
    get escalando() { return estado.modo === 'escalar' && !!estado.inicio?.escalando; },
    // El panel acompaña al escenario desde su posición actual (en el espacio del escenario).
    anclar(panel) {
      raiz.updateWorldMatrix(true, false);
      panel.objeto.updateWorldMatrix(true, false);
      anclas.set(panel, raiz.worldToLocal(panel.objeto.getWorldPosition(new THREE.Vector3())));
    },
    // `permitido`: el escenario está activo y sin transición. `ocupado`: alguna mano sostiene un objeto.
    update(dt, { permitido, ocupado }) {
      const { left, right } = manos;
      const disponibles = (left.seguida || left.control) && (right.seguida || right.control);
      if (!permitido || !disponibles) { terminar(); return; }
      const alfa = 1 - Math.exp(-M.suavizado * dt);
      if (estado.modo === 'trasladar') {
        if (left.bandeja && right.bandeja) { estado.gracia = 0; trasladar(alfa); acompanar(); return; }
        // Tolerancia a perder el gesto un instante (el seguimiento de manos tiembla).
        if ((estado.gracia += dt) > M.gracia) terminar();
        return;
      }
      if (estado.modo === 'escalar') {
        if (!left.pellizco || !right.pellizco || ocupado) { terminar(); return; }
        escalar(alfa);
        acompanar();
        return;
      }
      if (ocupado) { estado.espera = 0; return; }
      if (left.bandeja && right.bandeja && cerca(left.centro) && cerca(right.centro) && separadas(left.centro, right.centro)) {
        if ((estado.espera += dt) >= M.espera) empezar('trasladar');
        return;
      }
      estado.espera = 0;
      if (left.pellizco && right.pellizco && cerca(left.pinza) && cerca(right.pinza) && separadas(left.pinza, right.pinza)) empezar('escalar');
    },
    detener: terminar
  };
}
