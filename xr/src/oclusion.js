import * as THREE from 'three';
import { AJUSTES, CAPAS } from './config.js';

const LADOS = ['left', 'right'];
const DEDOS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const FALANGES = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const ARTICULACIONES = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...DEDOS.flatMap(dedo => FALANGES.map(falange => `${dedo}-${falange}`))];
// Articulaciones de la palma: su volumen es más ancho que grueso.
const PALMA = new Set(['wrist', ...DEDOS.map(dedo => `${dedo}-metacarpal`)]);
// Radio típico (m) de cada tipo de articulación en una mano de 9,5 cm de la muñeca al nudillo del medio;
// solo se usa si el visor no entrega los radios reales (se escala con la mano medida).
const RADIO_TIPICO = {
  wrist: .02, 'thumb-metacarpal': .019, 'thumb-phalanx-proximal': .0125, 'thumb-phalanx-distal': .0098, 'thumb-tip': .0087,
  metacarpal: .016, 'phalanx-proximal': .0105, 'phalanx-intermediate': .0092, 'phalanx-distal': .0083, tip: .0075
};
const MANO_TIPICA = .095;

// Huesos de la mano virtual: [desde, hasta, tipo]. 'redondo' (dedos), 'palma' (aplanado según la palma),
// 'membrana' (piel entre el pulgar y el índice, delgada). `hasta` puede ser [a, b, t]: punto entre a y b.
const HUESOS = [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'redondo'],
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'redondo'],
  ['thumb-phalanx-distal', 'thumb-tip', 'redondo'],
  ...DEDOS.flatMap(dedo => [
    [`${dedo}-metacarpal`, `${dedo}-phalanx-proximal`, 'palma'],
    [`${dedo}-phalanx-proximal`, `${dedo}-phalanx-intermediate`, 'redondo'],
    [`${dedo}-phalanx-intermediate`, `${dedo}-phalanx-distal`, 'redondo'],
    [`${dedo}-phalanx-distal`, `${dedo}-tip`, 'redondo']
  ]),
  // Relleno de la palma: de la muñeca a la base de cada metacarpiano y la línea de los nudillos.
  ['wrist', 'thumb-metacarpal', 'palma'],
  ...DEDOS.map(dedo => ['wrist', `${dedo}-metacarpal`, 'palma']),
  ['index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'palma'],
  ['middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'palma'],
  ['ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'palma'],
  ['index-finger-metacarpal', 'pinky-finger-metacarpal', 'palma'],
  ['thumb-phalanx-proximal', ['index-finger-metacarpal', 'index-finger-phalanx-proximal', .5], 'membrana']
];
// Sin contorno junto a la muñeca: ahí la mano sigue en el antebrazo y un borde la cortaría.
const SIN_CONTORNO = new Set(['wrist']);

/*
 * Oclusión solo de las manos. Antes había dos capas: la máscara de IWSDK (un modelo de mano genérico, con
 * grosor fijo, que se veía como una silueta rígida que no coincidía con la mano real) y la profundidad real
 * del visor aplicada a cada objeto (13 muestras de profundidad por píxel y todos los materiales vueltos
 * transparentes: lo más costoso de la experiencia). Ahora:
 *
 * - No se pide ni se usa el sensor de profundidad; ningún objeto lleva un sombreador especial.
 * - Se oculta la mano genérica de IWSDK y se arma una mano propia cada cuadro con las 25 articulaciones de
 *   WebXR Hand Input: una esfera por articulación y un cilindro por hueso, con el radio que el visor mide en
 *   cada articulación (XRFrame.fillJointRadii), de modo que el tamaño, el largo de cada falange y el grosor
 *   de cada dedo son los de la mano del usuario. La palma se rellena con huesos aplanados según su normal.
 * - Esa mano no pinta color: solo escribe profundidad y se dibuja antes que todo, así lo virtual que queda
 *   detrás de la mano real no se pinta y se ve la mano del passthrough; lo que está delante se sigue viendo.
 * - Un contorno blanco tenue (configurable) marca el borde de los dedos para las interacciones.
 *
 * Son cuatro dibujos por mano (esferas y cilindros, de la máscara y del contorno), sin texturas ni pases extra.
 * Es oclusión visual: no añade colisiones. Con controles no hay articulaciones y la mano no se dibuja.
 */
export function crearOclusion(world, manos) {
  const cfg = AJUSTES.manos;
  const esfera = new THREE.SphereGeometry(1, 12, 8);
  const cilindro = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  const mascara = new THREE.MeshBasicMaterial({ colorWrite: false });
  const contorno = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: cfg.contorno.opacidad, side: THREE.BackSide, depthWrite: false, toneMapped: false
  });
  const conContorno = cfg.contorno.opacidad > 0 && cfg.contorno.grosor > 0;

  const instancias = (geometria, material, cantidad, orden, vision) => {
    const malla = new THREE.InstancedMesh(geometria, material, cantidad);
    malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    malla.frustumCulled = false;
    malla.renderOrder = orden;
    malla.visible = false;
    malla.raycast = () => {};
    malla.pointerEvents = 'none';
    // La máscara también entra al dibujo aparte de la vejez: recorta la imagen desenfocada donde está la mano.
    if (vision) malla.layers.enable(CAPAS.vision);
    return malla;
  };
  const grupo = new THREE.Group();
  grupo.name = 'manos-virtuales';
  const modelos = {};
  LADOS.forEach(lado => {
    const m = {
      esferas: instancias(esfera, mascara, ARTICULACIONES.length, -1000, true),
      huesos: instancias(cilindro, mascara, HUESOS.length, -1000, true),
      bordeEsferas: conContorno ? instancias(esfera, contorno, ARTICULACIONES.length, 999, false) : null,
      bordeHuesos: conContorno ? instancias(cilindro, contorno, HUESOS.length, 999, false) : null
    };
    m.todas = [m.esferas, m.huesos, m.bordeEsferas, m.bordeHuesos].filter(Boolean);
    m.todas.forEach(malla => { malla.name = `mano-virtual-${lado}`; grupo.add(malla); });
    modelos[lado] = m;
  });
  world.scene.add(grupo);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), eje = new THREE.Vector3();
  const x = new THREE.Vector3(), z = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  const matriz = new THREE.Matrix4(), CERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const estado = { manos: 0, conRadios: false };

  function radio(mano, nombre, escalaMano) {
    const medido = mano.conRadios ? mano.radios.get(nombre) : 0;
    if (medido > 0) return medido * cfg.ajuste;
    const tipo = nombre.startsWith('thumb') || nombre === 'wrist' ? nombre : FALANGES.find(f => nombre.endsWith(f));
    return (RADIO_TIPICO[tipo] ?? .01) * escalaMano * cfg.ajuste;
  }
  function puntoDe(mano, extremo, destino) {
    if (typeof extremo === 'string') return destino.copy(mano.puntos.get(extremo));
    const [p, q, t] = extremo;
    return destino.lerpVectors(mano.puntos.get(p), mano.puntos.get(q), t);
  }
  // Base perpendicular a `eje` (unitario): con `normal` (palma), z sigue a la normal y x al ancho.
  function base(normal) {
    if (normal) {
      z.copy(normal).addScaledVector(eje, -normal.dot(eje));
      if (z.lengthSq() > 1e-8) { z.normalize(); x.crossVectors(eje, z); return; }
    }
    x.set(1, 0, 0).addScaledVector(eje, -eje.x);
    if (x.lengthSq() < 1e-6) x.set(0, 0, 1).addScaledVector(eje, -eje.z);
    x.normalize();
    z.crossVectors(x, eje);
  }

  function armar(lado) {
    const mano = manos[lado], m = modelos[lado];
    const seguida = mano.seguida && ARTICULACIONES.every(nombre => mano.puntos.has(nombre));
    m.todas.forEach(malla => { malla.visible = seguida; });
    if (!seguida) return false;
    const escalaMano = mano.puntos.get('wrist').distanceTo(mano.puntos.get('middle-finger-phalanx-proximal')) / MANO_TIPICA;
    const grosor = cfg.contorno.grosor;
    // Articulaciones: esferas (aplanadas en la palma, con el grosor según su normal).
    ARTICULACIONES.forEach((nombre, i) => {
      const r = radio(mano, nombre, escalaMano), plana = PALMA.has(nombre);
      eje.copy(mano.dedos);
      base(plana ? mano.palma : null);
      const k = plana ? cfg.aplanado : 1;
      m.esferas.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(r), b.copy(eje).multiplyScalar(r), c.copy(z).multiplyScalar(r * k)).setPosition(mano.puntos.get(nombre)));
      if (!m.bordeEsferas) return;
      if (SIN_CONTORNO.has(nombre)) { m.bordeEsferas.setMatrixAt(i, CERO); return; }
      const rb = r + grosor;
      m.bordeEsferas.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(rb), b.copy(eje).multiplyScalar(rb), c.copy(z).multiplyScalar(r * k + grosor)).setPosition(mano.puntos.get(nombre)));
    });
    // Huesos: cilindros de una articulación a la otra con el radio menor de las dos.
    HUESOS.forEach(([desde, hasta, tipo], i) => {
      puntoDe(mano, desde, p);
      puntoDe(mano, hasta, q);
      eje.subVectors(q, p);
      const largo = eje.length();
      if (largo < 1e-5) { m.huesos.setMatrixAt(i, CERO); m.bordeHuesos?.setMatrixAt(i, CERO); return; }
      eje.divideScalar(largo);
      const nombreHasta = typeof hasta === 'string' ? hasta : hasta[1];
      let r = Math.min(radio(mano, desde, escalaMano), radio(mano, nombreHasta, escalaMano));
      if (tipo === 'membrana') r = radio(mano, desde, escalaMano) * cfg.membrana;
      base(tipo === 'redondo' ? null : mano.palma);
      const k = tipo === 'redondo' ? 1 : cfg.aplanado;
      const centro = c.addVectors(p, q).multiplyScalar(.5);
      m.huesos.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(r), b.copy(eje).multiplyScalar(largo), d.copy(z).multiplyScalar(r * k)).setPosition(centro));
      if (!m.bordeHuesos) return;
      if (SIN_CONTORNO.has(desde)) { m.bordeHuesos.setMatrixAt(i, CERO); return; }
      const rb = r + grosor;
      m.bordeHuesos.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(rb), b.copy(eje).multiplyScalar(largo), d.copy(z).multiplyScalar(r * k + grosor)).setPosition(centro));
    });
    m.todas.forEach(malla => { malla.instanceMatrix.needsUpdate = true; });
    return true;
  }

  // La mano genérica de IWSDK queda apagada (su modelo fijo no coincide con la mano real). IWSDK vuelve a
  // mostrar su modelo cada cuadro (model.visible), así que se ocultan sus mallas; toggleVisual(false) además
  // evita que mueva su esqueleto.
  const apagadas = new WeakSet();
  function apagarManoGenerica() {
    for (const lado of LADOS) {
      const adaptador = world.input?.xr?.visualAdapters?.hand?.[lado];
      if (!adaptador) continue;
      if (adaptador.visualsEnabled !== false) adaptador.toggleVisual?.(false);
      const modelo = adaptador.visual?.model;
      if (modelo && !apagadas.has(modelo)) {
        modelo.traverse(o => { if (o.isMesh) o.visible = false; });
        apagadas.add(modelo);
      }
    }
  }

  return {
    estado, grupo, modelos,
    actualizar() {
      apagarManoGenerica();
      estado.manos = LADOS.filter(armar).length;
      estado.conRadios = LADOS.some(lado => manos[lado].seguida && manos[lado].conRadios);
    }
  };
}
