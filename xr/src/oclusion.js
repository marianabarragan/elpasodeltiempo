import * as THREE from 'three';
import { AJUSTES } from './config.js';

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
 * Mano virtual al estilo de los paneles de Meta. El usuario ve su mano real (passthrough) y, encima:
 *
 * - Una silueta suave, de color oscuro translúcido, que solo se pinta sobre lo virtual (paneles, objetos,
 *   superficies): sobre la habitación real no se pinta y se ve la mano tal cual. Lo virtual nunca se recorta
 *   alrededor de la mano (ya no hay «máscara» que deje ver el passthrough a través de un panel u objeto).
 * - Un contorno blanco que marca el borde de los dedos, también sobre la habitación.
 * - Cuando la mano se hunde en la cara de un panel, del tablero o de la superficie base del escenario (piso con su
 *   hoja, escritorio, mesa pintada), la mano dibujada se detiene en esa cara en vez de atravesarla, como al
 *   pulsar un botón en Meta. Solo cambia el dibujo: el rayo, el toque y los agarres siguen a la mano real.
 *
 * La mano se arma cada cuadro con las 25 articulaciones de WebXR Hand Input y el radio que el visor mide en
 * cada una (XRFrame.fillJointRadii): una esfera por articulación y un cilindro por hueso, con la palma aplanada
 * según su normal. Así el tamaño, el largo de cada falange y el grosor de cada dedo son los de la mano real.
 * Se dibuja después de todo lo demás, en tres pasadas: su profundidad (para quedar oculta detrás de lo que
 * esté delante de ella y para que la silueta sea de una sola capa), la silueta y el contorno.
 * Son seis dibujos por mano, sin texturas. No se usa el sensor de profundidad del visor. Con controles no hay
 * articulaciones y la mano no se dibuja (se ven los controles de IWSDK).
 */
export function crearOclusion(world, manos, { superficies = () => [] } = {}) {
  const cfg = AJUSTES.manos;
  const esfera = new THREE.SphereGeometry(1, 12, 8);
  const cilindro = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  // Pasada 1: solo profundidad (después de lo virtual), para que la silueta sea de una capa y el contorno
  // quede solo en el borde.
  const profundidad = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
  // Pasada 2: silueta. Mezcla con la transparencia de lo ya dibujado (destino): sobre lo virtual se ve, sobre
  // la habitación real (transparente) no.
  const silueta = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cfg.silueta.color), opacity: cfg.silueta.opacidad, transparent: true, depthWrite: false, toneMapped: false,
    premultipliedAlpha: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  });
  // Pasada 3: contorno (caras traseras de una mano un poco más gruesa: solo asoma su borde).
  const contorno = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: cfg.contorno.opacidad, side: THREE.BackSide, depthWrite: false, toneMapped: false
  });
  const conContorno = cfg.contorno.opacidad > 0 && cfg.contorno.grosor > 0;
  // Después de todo lo virtual (paneles, objetos y la visión de la vejez, en 9000) y antes de las gafas (9100).
  const ORDEN = 9010;

  const instancias = (geometria, material, cantidad, orden, matrices = null) => {
    const malla = new THREE.InstancedMesh(geometria, material, cantidad);
    if (matrices) malla.instanceMatrix = matrices;
    else malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    malla.frustumCulled = false;
    malla.renderOrder = orden;
    malla.visible = false;
    malla.raycast = () => {};
    malla.pointerEvents = 'none';
    return malla;
  };
  const grupo = new THREE.Group();
  grupo.name = 'manos-virtuales';
  const modelos = {};
  LADOS.forEach(lado => {
    const esferas = instancias(esfera, profundidad, ARTICULACIONES.length, ORDEN);
    const huesos = instancias(cilindro, profundidad, HUESOS.length, ORDEN);
    const m = {
      esferas, huesos,
      siluetaEsferas: instancias(esfera, silueta, ARTICULACIONES.length, ORDEN + 1, esferas.instanceMatrix),
      siluetaHuesos: instancias(cilindro, silueta, HUESOS.length, ORDEN + 1, huesos.instanceMatrix),
      bordeEsferas: conContorno ? instancias(esfera, contorno, ARTICULACIONES.length, ORDEN + 2) : null,
      bordeHuesos: conContorno ? instancias(cilindro, contorno, HUESOS.length, ORDEN + 2) : null,
      // Corrección (m, mundo) que la deja sobre la superficie en la que se hunde, suavizada.
      apoyo: new THREE.Vector3(), objetivo: new THREE.Vector3()
    };
    m.todas = [m.esferas, m.huesos, m.siluetaEsferas, m.siluetaHuesos, m.bordeEsferas, m.bordeHuesos].filter(Boolean);
    m.todas.forEach(malla => { malla.name = `mano-virtual-${lado}`; grupo.add(malla); });
    modelos[lado] = m;
  });
  world.scene.add(grupo);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), eje = new THREE.Vector3();
  const x = new THREE.Vector3(), z = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  const relativo = new THREE.Vector3(), matriz = new THREE.Matrix4(), CERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const puntos = new Map(ARTICULACIONES.map(nombre => [nombre, new THREE.Vector3()]));
  const estado = { manos: 0, conRadios: false, apoyadas: 0, ocultas: 0 };

  function radio(mano, nombre, escalaMano) {
    const medido = mano.conRadios ? mano.radios.get(nombre) : 0;
    if (medido > 0) return medido * cfg.ajuste;
    const tipo = nombre.startsWith('thumb') || nombre === 'wrist' ? nombre : FALANGES.find(f => nombre.endsWith(f));
    return (RADIO_TIPICO[tipo] ?? .01) * escalaMano * cfg.ajuste;
  }
  function puntoDe(extremo, destino) {
    if (typeof extremo === 'string') return destino.copy(puntos.get(extremo));
    const [p0, q0, t] = extremo;
    return destino.lerpVectors(puntos.get(p0), puntos.get(q0), t);
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

  /*
   * Cuánto se hunde la mano en la superficie más comprometida: para cada cara (rectángulo con su normal), si la
   * muñeca está de su lado de adelante y alguna articulación (con su radio) queda detrás de la cara, dentro de su
   * contorno y a menos de `superficie.max`, la mano dibujada retrocede lo necesario a lo largo de la normal.
   */
  // Devuelve 'oculta' si la mano entera está detrás de un panel (el panel la tapa: no se dibuja), 'apoyada' si
  // se corrige su hundimiento, o null.
  function hundimiento(mano, escalaMano, destino) {
    destino.set(0, 0, 0);
    const S = cfg.superficie, muneca = mano.puntos.get('wrist');
    let mayor = 0;
    for (const s of superficies()) {
      const frente = relativo.subVectors(muneca, s.centro).dot(s.normal);
      if (frente < -S.margen) {
        // Detrás de un panel y dentro de su contorno: el panel la tapa (los paneles no escriben profundidad).
        if (s.tapa && frente > -S.detras && Math.abs(relativo.dot(s.u)) <= s.mu + S.margen && Math.abs(relativo.dot(s.v)) <= s.mv + S.margen) return 'oculta';
        continue;
      }
      let dentro = 0;
      for (const nombre of ARTICULACIONES) {
        relativo.subVectors(mano.puntos.get(nombre), s.centro);
        const r = radio(mano, nombre, escalaMano), adelante = relativo.dot(s.normal) - r;
        if (adelante >= 0 || adelante < -S.max) continue;
        if (Math.abs(relativo.dot(s.u)) > s.mu + S.margen || Math.abs(relativo.dot(s.v)) > s.mv + S.margen) continue;
        dentro = Math.max(dentro, -adelante);
      }
      if (dentro > mayor) { mayor = dentro; destino.copy(s.normal).multiplyScalar(dentro); }
    }
    return mayor > 0 ? 'apoyada' : null;
  }

  function armar(lado, dt) {
    const mano = manos[lado], m = modelos[lado];
    const seguida = mano.seguida && ARTICULACIONES.every(nombre => mano.puntos.has(nombre));
    m.todas.forEach(malla => { malla.visible = seguida; });
    if (!seguida) { m.apoyo.set(0, 0, 0); return false; }
    const escalaMano = mano.puntos.get('wrist').distanceTo(mano.puntos.get('middle-finger-phalanx-proximal')) / MANO_TIPICA;
    // Detenida en la superficie: la corrección crece de inmediato (no se ve hundida) y se suelta con suavidad.
    const caso = hundimiento(mano, escalaMano, m.objetivo);
    if (caso === 'oculta') { m.todas.forEach(malla => { malla.visible = false; }); m.apoyo.set(0, 0, 0); estado.ocultas += 1; return true; }
    if (m.objetivo.lengthSq() >= m.apoyo.lengthSq()) m.apoyo.copy(m.objetivo);
    else m.apoyo.lerp(m.objetivo, 1 - Math.exp(-cfg.superficie.suavizado * dt));
    ARTICULACIONES.forEach(nombre => puntos.get(nombre).copy(mano.puntos.get(nombre)).add(m.apoyo));
    const grosor = cfg.contorno.grosor;
    // Articulaciones: esferas (aplanadas en la palma, con el grosor según su normal).
    ARTICULACIONES.forEach((nombre, i) => {
      const r = radio(mano, nombre, escalaMano), plana = PALMA.has(nombre), punto = puntos.get(nombre);
      eje.copy(mano.dedos);
      base(plana ? mano.palma : null);
      const k = plana ? cfg.aplanado : 1;
      m.esferas.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(r), b.copy(eje).multiplyScalar(r), c.copy(z).multiplyScalar(r * k)).setPosition(punto));
      if (!m.bordeEsferas) return;
      if (SIN_CONTORNO.has(nombre)) { m.bordeEsferas.setMatrixAt(i, CERO); return; }
      const rb = r + grosor;
      m.bordeEsferas.setMatrixAt(i, matriz.makeBasis(a.copy(x).multiplyScalar(rb), b.copy(eje).multiplyScalar(rb), c.copy(z).multiplyScalar(r * k + grosor)).setPosition(punto));
    });
    // Huesos: cilindros de una articulación a la otra con el radio menor de las dos.
    HUESOS.forEach(([desde, hasta, tipo], i) => {
      puntoDe(desde, p);
      puntoDe(hasta, q);
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
    [m.esferas, m.huesos, m.bordeEsferas, m.bordeHuesos].forEach(malla => { if (malla) malla.instanceMatrix.needsUpdate = true; });
    if (caso === 'apoyada') estado.apoyadas += 1;
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
    actualizar(dt = 0) {
      apagarManoGenerica();
      estado.apoyadas = 0;
      estado.ocultas = 0;
      estado.manos = LADOS.filter(lado => armar(lado, dt)).length;
      estado.conRadios = LADOS.some(lado => manos[lado].seguida && manos[lado].conRadios);
    }
  };
}
