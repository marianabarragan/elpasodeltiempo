import * as THREE from 'three';
import { AJUSTES } from '../config.js';
import { colocar, colocarAlineado, escalarPanel } from '../paneles.js';
import { crearEsquinas } from './esquinas.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const LADOS = ['left', 'right'];
const angulo = v => Math.atan2(v.x, v.z);
const envolver = a => Math.atan2(Math.sin(a), Math.cos(a));

/*
 * Manipulación de un escenario completo con las dos manos (guía de gestos manuales del equipo):
 * - Trasladar y girar: las dos palmas abiertas hacia arriba, bajo el escenario o junto a su borde, como al
 *   sostener una bandeja. El escenario sigue el punto medio de las manos (también en altura) y gira en
 *   horizontal con la línea que las une. (Sin cambios.)
 * - Ampliar y reducir: un pellizco con cada mano que EMPIECE en el borde de la superficie base (piso de
 *   rompecabezas, escritorio o mesa pintada), no en su interior: el interior queda para los objetos. Separar
 *   las manos lo amplía y juntarlas lo reduce, de forma uniforme, alrededor del punto entre las manos y sin
 *   cambiar la altura de su superficie. Una vez empezado, sigue aunque las manos se alejen del borde.
 * Con controles: los dos botones laterales trasladan y los dos gatillos, desde el borde, escalan.
 *
 * Cuatro esquinas en forma de L (blancas con borde gris, como en el diseño) aparecen junto a las esquinas de la
 * superficie cuando una mano se acerca a su borde y se apagan al alejarse; durante el escalado se quedan. Son hijas
 * del escenario: lo acompañan al moverlo, girarlo y escalarlo, y conservan su tamaño en metros.
 *
 * Se transforma solo la raíz del escenario (hija del espacio de la mesa anclado): todos sus objetos la
 * acompañan con sus posiciones relativas y su superficie sigue horizontal, así lo que se apoya en ella no
 * se desliza. La mesa real solo fija la posición inicial; el tablero y los demás elementos globales no se
 * mueven. Los paneles anclados (barra, frase, flecha) acompañan al escenario y crecen o se reducen con él, en el
 * mismo orden (barra arriba, frase debajo y flecha a su derecha), así nunca se superponen.
 *
 * `area`: ancho y fondo (m) de la superficie base, centrada en el origen de `raiz`; `superficie`: su altura (m).
 */
export function crearManipulacion({ manos, espacio, raiz, area, cabeza, superficie = 0 }) {
  const M = AJUSTES.manipulacion, B = M.esquinas;
  // Escala con que apareció el escenario: a ella los paneles anclados tienen su tamaño de diseño.
  const escalaInicial = raiz.scale.x;
  const poseInicial = { posicion: raiz.position.clone(), giro: raiz.quaternion.clone() };
  const estado = { modo: null, espera: 0, gracia: 0, inicio: null, movimientos: 0, escalados: 0, contorno: 0 };
  const anclas = new Map();
  const izq = new THREE.Vector3(), der = new THREE.Vector3(), medio = new THREE.Vector3(), local = new THREE.Vector3();
  const objetivo = new THREE.Vector3(), desfase = new THREE.Vector3();
  // Pellizco de cada mano: si está activo, desde cuántos cuadros y si empezó en el borde.
  const pellizcos = Object.fromEntries(LADOS.map(lado => [lado, { activo: false, cuadros: 0, enBorde: false, cerca: false }]));

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
  // Distancia (m) de un punto al contorno de la superficie base en horizontal (positiva afuera, negativa
  // adentro) y su altura sobre ella (m), con la escala actual del escenario.
  function respectoDelBorde(mundo) {
    raiz.updateWorldMatrix(true, false);
    raiz.worldToLocal(local.copy(mundo));
    const k = raiz.scale.x, qx = Math.abs(local.x) - area.ancho / 2, qz = Math.abs(local.z) - area.fondo / 2;
    const afuera = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)), adentro = Math.min(Math.max(qx, qz), 0);
    return { distancia: (afuera + adentro) * k, altura: (local.y - superficie) * k };
  }
  const enBorde = (mundo, extra = 0) => {
    const { distancia, altura } = respectoDelBorde(mundo);
    return distancia >= -M.bordeDentro - extra && distancia <= M.bordeFuera + extra && altura >= M.bordeAbajo - extra && altura <= M.bordeArriba + extra;
  };
  const separadas = (a, b) => a.distanceTo(b) >= M.separacionMin;

  // ---------- Esquinas de escalado junto a la superficie ----------
  // Grupo hijo del escenario, tendido sobre su superficie (el plano XY de las esquinas pasa a XZ, con «arriba» hacia
  // el fondo); su escala compensa la del escenario para que las esquinas midan siempre lo mismo en el mundo.
  const esquinas = crearEsquinas({ renderOrder: 5 });
  const contorno = esquinas.grupo;
  contorno.name = 'contorno-escalado';
  contorno.rotation.x = -Math.PI / 2;
  raiz.add(contorno);

  // Una mano está cerca del borde (con histéresis: se apaga solo al alejarse un poco más).
  function manoCercaDelBorde(lado) {
    const mano = manos[lado], p = pellizcos[lado];
    if (!mano.seguida && !mano.control) { p.cerca = false; return false; }
    p.cerca = enBorde(mano.pinza, p.cerca ? B.histeresis : 0);
    return p.cerca;
  }
  function actualizarContorno(dt, mostrar) {
    const meta = mostrar ? 1 : 0;
    estado.contorno += (meta - estado.contorno) * (1 - Math.exp(-B.fundido * dt));
    if (Math.abs(estado.contorno - meta) < .01) estado.contorno = meta;
    esquinas.opacidad = estado.contorno;
    if (!contorno.visible) return;
    const k = raiz.scale.x;
    contorno.scale.setScalar(1 / k);
    contorno.position.set(0, superficie + .0015 / k, 0);
    esquinas.colocar(area.ancho * k, area.fondo * k, 1);
  }

  // Seguimiento de los pellizcos: dónde empezó cada uno (borde o no) y cuántos cuadros lleva.
  function seguirPellizcos() {
    for (const lado of LADOS) {
      const mano = manos[lado], p = pellizcos[lado], activo = (mano.seguida || mano.control) && mano.pellizco;
      if (activo && !p.activo) { p.enBorde = enBorde(mano.pinza); p.cuadros = 0; }
      if (activo) p.cuadros += 1;
      p.activo = activo;
    }
  }

  // Paneles anclados: tamaño relativo (1 a la escala con que apareció el escenario). Los que van junto a otro
  // panel (la frase y la flecha junto a la barra) quedan en su mismo plano, a `dx` m a su derecha y `dy` m hacia
  // arriba medidos a ese tamaño, así crecen y se reducen sin superponerse.
  const relativa = () => raiz.scale.x / escalaInicial;
  const derecha = new THREE.Vector3(), giroPanel = new THREE.Quaternion(), junto = new THREE.Vector3();
  function ubicarJunto(panel, referencia, dx, dy) {
    const k = relativa();
    referencia.objeto.updateWorldMatrix(true, false);
    referencia.objeto.getWorldQuaternion(giroPanel);
    derecha.set(1, 0, 0).applyQuaternion(giroPanel);
    referencia.objeto.getWorldPosition(junto).addScaledVector(derecha, dx * k).addScaledVector(ARRIBA, dy * k);
    colocarAlineado(panel, junto, giroPanel);
    escalarPanel(panel, k);
  }
  function acompanar() {
    if (!anclas.size) return;
    raiz.updateWorldMatrix(true, false);
    const ojo = cabeza(), k = relativa();
    anclas.forEach((ancla, panel) => {
      if (ancla.referencia) return;
      colocar(panel, raiz.localToWorld(objetivo.copy(ancla.posicion)), ojo);
      escalarPanel(panel, k);
    });
    anclas.forEach((ancla, panel) => { if (ancla.referencia) ubicarJunto(panel, ancla.referencia, ancla.dx, ancla.dy); });
  }

  function empezar(modo) {
    estado.modo = modo;
    estado.gracia = 0;
    estado.movimientos += 1;
    if (modo === 'escalar') estado.escalados += 1;
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
    estado, raiz, contorno, pellizcos, area, superficie,
    get activo() { return estado.modo !== null; },
    get escalando() { return estado.modo === 'escalar' && !!estado.inicio?.escalando; },
    // Para las pruebas: distancia de un punto al borde de la superficie y si cuenta como borde.
    respectoDelBorde, enBorde: mundo => enBorde(mundo),
    // El panel acompaña al escenario desde su posición actual (en el espacio del escenario) y toma el tamaño que le
    // corresponde a la escala actual. Con `junto` (otro panel anclado) va en su plano, a `dx`, `dy` m de él.
    anclar(panel, { junto: referencia = null, dx = 0, dy = 0 } = {}) {
      if (referencia) {
        anclas.set(panel, { referencia, dx, dy });
        ubicarJunto(panel, referencia, dx, dy);
        return;
      }
      raiz.updateWorldMatrix(true, false);
      panel.objeto.updateWorldMatrix(true, false);
      anclas.set(panel, { posicion: raiz.worldToLocal(panel.objeto.getWorldPosition(new THREE.Vector3())) });
      escalarPanel(panel, relativa());
    },
    // Tamaño relativo actual de los paneles anclados (pruebas).
    get escalaPaneles() { return relativa(); },
    // `permitido`: el escenario está activo y sin transición. `ocupado`: alguna mano sostiene o maneja un objeto
    // (crayola, caja, hoja, perilla, gafas, panel…): entonces ni se escala ni se muestra el contorno.
    update(dt, { permitido, ocupado }) {
      const { left, right } = manos;
      seguirPellizcos();
      const disponibles = (left.seguida || left.control) && (right.seguida || right.control);
      const algunaCerca = permitido && !ocupado ? LADOS.map(manoCercaDelBorde).some(Boolean) : false;
      if (!permitido || !disponibles) {
        terminar();
        actualizarContorno(dt, permitido && algunaCerca);
        return;
      }
      const alfa = 1 - Math.exp(-M.suavizado * dt);
      if (estado.modo === 'trasladar') {
        actualizarContorno(dt, algunaCerca);
        if (left.bandeja && right.bandeja) { estado.gracia = 0; trasladar(alfa); acompanar(); return; }
        // Tolerancia a perder el gesto un instante (el seguimiento de manos tiembla).
        if ((estado.gracia += dt) > M.gracia) terminar();
        return;
      }
      if (estado.modo === 'escalar') {
        // Durante el escalado el contorno se queda y acompaña al escenario.
        actualizarContorno(dt, true);
        if (!left.pellizco || !right.pellizco || ocupado) { terminar(); return; }
        escalar(alfa);
        acompanar();
        return;
      }
      actualizarContorno(dt, algunaCerca);
      if (ocupado) { estado.espera = 0; return; }
      // Trasladar y girar: igual que antes (palmas hacia arriba sobre el escenario o junto a su borde).
      if (left.bandeja && right.bandeja && cerca(left.centro) && cerca(right.centro) && separadas(left.centro, right.centro)) {
        if ((estado.espera += dt) >= M.espera) empezar('trasladar');
        return;
      }
      estado.espera = 0;
      // Escalar: los dos pellizcos empezaron en el borde (no en el interior ni sobre un objeto). Se espera un
      // cuadro para que, si el pellizco tomó un objeto, ese objeto lo reclame primero (`ocupado`).
      const L = pellizcos.left, R = pellizcos.right;
      if (L.activo && R.activo && L.enBorde && R.enBorde && L.cuadros >= 2 && R.cuadros >= 2 && separadas(left.pinza, right.pinza)) empezar('escalar');
    },
    detener: terminar,
    // REPETIR: el escenario vuelve a donde apareció, con su tamaño inicial, y sin paneles anclados.
    reiniciar() {
      terminar();
      anclas.clear();
      raiz.position.copy(poseInicial.posicion);
      raiz.quaternion.copy(poseInicial.giro);
      raiz.scale.setScalar(escalaInicial);
      estado.contorno = 0;
    }
  };
}
