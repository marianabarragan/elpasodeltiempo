import * as THREE from 'three';
import { AJUSTES } from '../config.js';
import { colocar } from '../paneles.js';

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
 * Un contorno punteado (color del diseño) aparece sobre el borde de la superficie cuando una mano se acerca a
 * él y se apaga al alejarse; durante el escalado se queda. Es hijo del escenario: lo acompaña al moverlo,
 * girarlo y escalarlo, y conserva el grosor y el largo de sus trazos en metros.
 *
 * Se transforma solo la raíz del escenario (hija del espacio de la mesa anclado): todos sus objetos la
 * acompañan con sus posiciones relativas y su superficie sigue horizontal, así lo que se apoya en ella no
 * se desliza. La mesa real solo fija la posición inicial; el tablero y los demás elementos globales no se
 * mueven. Los paneles anclados (barra, frase, flecha) acompañan al escenario sin cambiar de tamaño.
 *
 * `area`: ancho y fondo (m) de la superficie base, centrada en el origen de `raiz`; `superficie`: su altura (m).
 */
export function crearManipulacion({ manos, espacio, raiz, area, cabeza, superficie = 0 }) {
  const M = AJUSTES.manipulacion, B = M.contorno;
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

  // ---------- Contorno punteado sobre el borde de la superficie ----------
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(B.color), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
  const contorno = new THREE.Mesh(new THREE.BufferGeometry(), material);
  contorno.name = 'contorno-escalado';
  contorno.visible = false;
  contorno.renderOrder = 5;
  contorno.raycast = () => {};
  contorno.pointerEvents = 'none';
  contorno.userData.sombraContacto = true;
  raiz.add(contorno);
  let escalaContorno = 0;
  // Trazos planos sobre la superficie, en el espacio del escenario; su largo, hueco y grosor se dan en metros
  // y se rehacen si la escala del escenario cambia, para que en el mundo midan siempre lo mismo.
  function armarContorno(k) {
    escalaContorno = k;
    const trazo = B.trazo / k, hueco = B.hueco / k, grosor = B.grosor / k, y = superficie + .0015 / k;
    const ax = area.ancho / 2, az = area.fondo / 2, posiciones = [], indices = [];
    // Cada lado: de una esquina a la siguiente, con trazos repartidos de modo que empiece y termine en trazo.
    const lados = [[[-ax, -az], [ax, -az]], [[ax, -az], [ax, az]], [[ax, az], [-ax, az]], [[-ax, az], [-ax, -az]]];
    lados.forEach(([[x0, z0], [x1, z1]]) => {
      const largo = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / largo, uz = (z1 - z0) / largo, nx = -uz * grosor / 2, nz = ux * grosor / 2;
      const n = Math.max(1, Math.round((largo + hueco) / (trazo + hueco))), paso = (largo + hueco) / n, lleno = paso - hueco;
      for (let i = 0; i < n; i++) {
        const a = i * paso, b = Math.min(largo, a + lleno), base = posiciones.length / 3;
        const pa = [x0 + ux * a, z0 + uz * a], pb = [x0 + ux * b, z0 + uz * b];
        posiciones.push(pa[0] + nx, y, pa[1] + nz, pb[0] + nx, y, pb[1] + nz, pb[0] - nx, y, pb[1] - nz, pa[0] - nx, y, pa[1] - nz);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
    geometria.setIndex(indices);
    contorno.geometry.dispose();
    contorno.geometry = geometria;
  }
  armarContorno(1);

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
    material.opacity = estado.contorno;
    contorno.visible = estado.contorno > .01;
    const k = raiz.scale.x;
    if (contorno.visible && Math.abs(k - escalaContorno) / k > .04) armarContorno(k);
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
    estado, raiz, contorno, pellizcos,
    get activo() { return estado.modo !== null; },
    get escalando() { return estado.modo === 'escalar' && !!estado.inicio?.escalando; },
    // Para las pruebas: distancia de un punto al borde de la superficie y si cuenta como borde.
    respectoDelBorde, enBorde: mundo => enBorde(mundo),
    // El panel acompaña al escenario desde su posición actual (en el espacio del escenario).
    anclar(panel) {
      raiz.updateWorldMatrix(true, false);
      panel.objeto.updateWorldMatrix(true, false);
      anclas.set(panel, raiz.worldToLocal(panel.objeto.getWorldPosition(new THREE.Vector3())));
    },
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
    detener: terminar
  };
}
