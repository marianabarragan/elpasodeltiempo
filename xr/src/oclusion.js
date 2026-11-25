import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRInputVisualAdapter, outlineMaterial, stencilMaterial } from '@iwsdk/core';
import { AJUSTES } from './config.js';

const LADOS = ['left', 'right'];
const DEDOS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const FALANGES = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const ARTICULACIONES = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...DEDOS.flatMap(dedo => FALANGES.map(falange => `${dedo}-${falange}`))];
// Radio típico (m) de cada tipo de articulación en una mano de 9,5 cm de la muñeca al nudillo del medio;
// solo se usa si el visor no entrega los radios reales (se escala con la mano medida).
const RADIO_TIPICO = {
  wrist: .02, 'thumb-metacarpal': .019, 'thumb-phalanx-proximal': .0125, 'thumb-phalanx-distal': .0098, 'thumb-tip': .0087,
  metacarpal: .016, 'phalanx-proximal': .0105, 'phalanx-intermediate': .0092, 'phalanx-distal': .0083, tip: .0075
};
const MANO_TIPICA = .095;
// La punta no tiene piel propia en el modelo: toma el grosor de la falange distal.
const GROSOR_DE = nombre => (nombre.endsWith('-tip') ? nombre.replace('-tip', '-phalanx-distal') : nombre);
// La palma (muñeca y metacarpianos) solo se ajusta un poco: su ancho ya lo dan las posiciones reales de los huesos.
const PALMA = new Set(['wrist', 'thumb-metacarpal', ...DEDOS.map(dedo => `${dedo}-metacarpal`)]);

/*
 * Mano virtual al estilo de las manos del sistema de Meta Quest 3 (corrección: la de esferas y cilindros se veía
 * esquelética). El usuario ve su mano real (passthrough) y, encima:
 *
 * - Un modelo de mano completo y continuo (generic-hand de WebXR Input Profiles, el mismo que usa IWSDK; en
 *   public/modelos/manos) cuyo esqueleto se coloca cada cuadro en las 25 articulaciones reales: el largo de cada
 *   falange es el de la mano real, y el grosor de cada dedo se ajusta al radio que el visor mide en cada
 *   articulación (XRFrame.fillJointRadii). Así el contorno coincide con el tamaño de la mano real.
 * - Un relleno oscuro (como en las manos de Meta) que solo se pinta sobre lo virtual (paneles, objetos,
 *   superficies) y se desvanece hacia la muñeca; sobre la habitación real no se pinta y se ve la mano tal cual.
 *   Lo virtual nunca se recorta alrededor de la mano (no deja ver el passthrough a través de un panel u objeto).
 * - Un contorno blanco continuo alrededor de la mano (también sobre la habitación), abierto en la muñeca.
 * - Cuando la mano se hunde en la cara de un panel, del tablero, de la superficie base del escenario o en un objeto
 *   3D, la mano dibujada se detiene en su superficie; lo que se sostiene envolviéndolo (el vaso, la taza) lo rodean
 *   los dedos dibujados. Solo cambia el dibujo: el rayo, el toque y los agarres siguen a la mano real.
 *
 * Se dibuja después de todo lo demás, en tres pasadas con el mismo cálculo de vértices: su profundidad (para quedar
 * oculta detrás de lo que esté delante de ella y para que el relleno sea de una sola capa), el relleno y el
 * contorno. No se usa el sensor de profundidad del visor. Con controles no hay articulaciones y la mano no se
 * dibuja (se ven los controles de IWSDK).
 */

// Vértices con piel (skinning) y la distancia de cada vértice a la muñeca en la pose de unión (para desvanecer).
// `uEmpuje` saca cada vértice a lo largo de su normal (el contorno es la mano un poco más gruesa, por detrás).
const VERTICES = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  attribute float aMuneca;
  uniform float uEmpuje;
  varying float vMuneca;
  void main() {
    #include <skinbase_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    vec3 transformed = position + normal * uEmpuje;
    #include <skinning_vertex>
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vMuneca = aMuneca;
  }`;
// Color con su opacidad, que aparece desde `uDesvanecer.x` hasta `uDesvanecer.y` m de la muñeca. Sale
// premultiplicado (la mezcla del relleno lo necesita; la del contorno usa la normal de three con premultiplicado).
const FRAGMENTOS = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacidad;
  uniform vec2 uDesvanecer;
  varying float vMuneca;
  void main() {
    float a = uOpacidad * smoothstep(uDesvanecer.x, uDesvanecer.y, vMuneca);
    gl_FragColor = vec4(uColor * a, a);
  }`;

export function crearOclusion(world, manos, { superficies = () => [] } = {}) {
  const cfg = AJUSTES.manos;
  // Sin máscara de recorte, nunca: la mano genérica de IWSDK escribe su profundidad antes que lo virtual y recorta los
  // paneles y objetos alrededor de la mano (se veía la realidad a través de ellos). IWSDK la descarga de internet y la
  // vuelve a encender al terminar de cargarla, así que sus dos materiales (compartidos por las dos manos) quedan
  // apagados desde el arranque: aunque su modelo llegue tarde o se vuelva a conectar, no se dibuja ni escribe nada.
  [stencilMaterial, outlineMaterial].forEach(m => { if (m) { m.visible = false; m.colorWrite = false; m.depthWrite = false; } });
  // Después de todo lo virtual, incluidas las gafas de la vejez (9100): su profundidad no oculta nada que se dibuje
  // después (no hay nada después) y lo virtual nunca se recorta alrededor de la mano.
  const ORDEN = 9200;
  const material = (opciones, uniformes) => new THREE.ShaderMaterial({
    vertexShader: VERTICES, fragmentShader: FRAGMENTOS, transparent: true, toneMapped: false,
    uniforms: {
      uEmpuje: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) }, uOpacidad: { value: 1 }, uDesvanecer: { value: new THREE.Vector2(0, 0) },
      ...uniformes
    },
    ...opciones
  });
  // Pasada 1: solo profundidad, para que el relleno sea de una capa y el contorno quede solo en el borde.
  const profundidad = material({ colorWrite: false, depthWrite: true });
  // Pasada 2: relleno. Mezcla con la transparencia de lo ya dibujado (destino): sobre lo virtual se ve, sobre la
  // habitación real (transparente) no; la transparencia de lo dibujado no cambia.
  const relleno = material({
    depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  }, {
    uColor: { value: new THREE.Color(cfg.relleno.color) }, uOpacidad: { value: cfg.relleno.opacidad }, uDesvanecer: { value: new THREE.Vector2(...cfg.relleno.desvanecer) }
  });
  // Pasada 3: contorno (caras traseras de la mano un poco más gruesa: solo asoma su borde), también sobre lo real.
  const contorno = material({ depthWrite: false, side: THREE.BackSide, premultipliedAlpha: true }, {
    uEmpuje: { value: cfg.contorno.grosor }, uOpacidad: { value: cfg.contorno.opacidad }, uDesvanecer: { value: new THREE.Vector2(...cfg.contorno.desvanecer) }
  });

  const grupo = new THREE.Group();
  grupo.name = 'manos-virtuales';
  world.scene.add(grupo);
  const modelos = {};
  const estado = { manos: 0, conRadios: false, apoyadas: 0, ocultas: 0, rodeadas: 0, envolturas: 0, agarres: 0, cargadas: 0, error: null };

  // Modelo de cada mano: tres mallas con piel que comparten el esqueleto, la distancia de cada vértice a la muñeca y el
  // radio de la piel alrededor de cada hueso en la pose de unión (para ajustar el grosor a la mano real).
  const cargador = new GLTFLoader();
  LADOS.forEach(lado => {
    const m = {
      listo: false, raiz: null, huesos: new Map(), radioModelo: new Map(), manoModelo: MANO_TIPICA, mallas: [],
      apoyo: new THREE.Vector3(), objetivo: new THREE.Vector3(), dibujados: new Map(ARTICULACIONES.map(n => [n, new THREE.Vector3()]))
    };
    modelos[lado] = m;
    cargador.loadAsync(`modelos/manos/${lado}.glb`).then(gltf => {
      const raiz = gltf.scene;
      raiz.name = `mano-virtual-${lado}`;
      const piel = raiz.getObjectByProperty('type', 'SkinnedMesh');
      raiz.updateMatrixWorld(true);
      ARTICULACIONES.forEach(nombre => { const hueso = raiz.getObjectByName(nombre); if (hueso) m.huesos.set(nombre, hueso); });
      const geometria = piel.geometry, esqueleto = piel.skeleton;
      // Distancia a la muñeca y radio de la piel por hueso (vértices que dependen sobre todo de ese hueso).
      const pos = geometria.attributes.position, indices = geometria.attributes.skinIndex, pesos = geometria.attributes.skinWeight;
      const muneca = m.huesos.get('wrist').getWorldPosition(new THREE.Vector3()).applyMatrix4(piel.matrixWorld.clone().invert());
      const distancias = new Float32Array(pos.count), suma = esqueleto.bones.map(() => [0, 0]);
      const v = new THREE.Vector3(), l = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        distancias[i] = v.distanceTo(muneca);
        let hueso = 0, peso = 0;
        for (let k = 0; k < 4; k++) { const w = pesos.getComponent(i, k); if (w > peso) { peso = w; hueso = indices.getComponent(i, k); } }
        if (peso < .6) continue;
        l.copy(v).applyMatrix4(piel.bindMatrix).applyMatrix4(esqueleto.boneInverses[hueso]);
        suma[hueso][0] += Math.hypot(l.x, l.y); suma[hueso][1] += 1;
      }
      geometria.setAttribute('aMuneca', new THREE.BufferAttribute(distancias, 1));
      esqueleto.bones.forEach((hueso, i) => { if (suma[i][1]) m.radioModelo.set(hueso.name, suma[i][0] / suma[i][1]); });
      m.manoModelo = m.huesos.get('wrist').position.distanceTo(m.huesos.get('middle-finger-phalanx-proximal').position) || MANO_TIPICA;
      // Tres pasadas con la misma geometría y el mismo esqueleto.
      [[profundidad, ORDEN], [relleno, ORDEN + 1], [contorno, ORDEN + 2]].forEach(([mat, orden], i) => {
        const malla = i === 0 ? piel : new THREE.SkinnedMesh(geometria, mat);
        if (i === 0) piel.material = mat;
        else { piel.parent.add(malla); malla.bind(esqueleto, piel.bindMatrix); }
        malla.renderOrder = orden;
        malla.frustumCulled = false;
        malla.raycast = () => {};
        malla.pointerEvents = 'none';
        m.mallas.push(malla);
      });
      raiz.visible = false;
      grupo.add(raiz);
      m.raiz = raiz;
      m.listo = true;
      estado.cargadas += 1;
    }).catch(error => { estado.error = String(error?.message ?? error); console.warn('No cargó el modelo de la mano', lado, error); });
  });

  const relativo = new THREE.Vector3(), NULO = new THREE.Vector3(), segunda = new THREE.Vector3(), extra = new THREE.Vector3();
  const puntos = new Map(ARTICULACIONES.map(nombre => [nombre, new THREE.Vector3()]));

  function radio(mano, nombre, escalaMano) {
    const medido = mano.conRadios ? mano.radios.get(nombre) : 0;
    if (medido > 0) return medido * cfg.ajuste;
    const tipo = nombre.startsWith('thumb') || nombre === 'wrist' ? nombre : FALANGES.find(f => nombre.endsWith(f));
    return (RADIO_TIPICO[tipo] ?? .01) * escalaMano * cfg.ajuste;
  }

  /*
   * Cuánto se hunde la mano en lo que tiene delante, con la mano desplazada `desplazamiento` (m):
   * - Caras (paneles, tablero, superficie base): si la muñeca está de su lado de adelante y alguna articulación
   *   (con su radio) queda detrás de la cara, dentro de su contorno y a menos de `superficie.max`, la corrección
   *   es retroceder a lo largo de su normal.
   * - Cuerpos 3D (una caja orientada por malla): si alguna articulación queda dentro de la caja y la muñeca está
   *   fuera, la corrección es salir por la cara de la caja que la muñeca tiene delante y que pide menos recorrido.
   * Se queda con la corrección mayor. Devuelve 'oculta' si la mano entera está detrás de un panel (el panel la
   * tapa: no se dibuja), 'apoyada' si hay corrección, o null.
   */
  const punto = new THREE.Vector3(), muneca = new THREE.Vector3(), t = [0, 0, 0];
  function hundimiento(mano, escalaMano, desplazamiento, destino, conPaneles) {
    destino.set(0, 0, 0);
    const S = cfg.superficie;
    muneca.copy(mano.puntos.get('wrist')).add(desplazamiento);
    let mayor = 0;
    for (const s of superficies()) {
      const frente = relativo.subVectors(muneca, s.centro).dot(s.normal);
      if (frente < -S.margen) {
        // Detrás de un panel y dentro de su contorno: el panel la tapa (los paneles no escriben profundidad).
        if (conPaneles && s.tapa && frente > -S.detras && Math.abs(relativo.dot(s.u)) <= s.mu + S.margen && Math.abs(relativo.dot(s.v)) <= s.mv + S.margen) return 'oculta';
        continue;
      }
      let dentro = 0;
      for (const nombre of ARTICULACIONES) {
        relativo.subVectors(punto.copy(mano.puntos.get(nombre)).add(desplazamiento), s.centro);
        const r = radio(mano, nombre, escalaMano), adelante = relativo.dot(s.normal) - r;
        if (adelante >= 0 || adelante < -S.max) continue;
        if (Math.abs(relativo.dot(s.u)) > s.mu + S.margen || Math.abs(relativo.dot(s.v)) > s.mv + S.margen) continue;
        dentro = Math.max(dentro, -adelante);
      }
      if (dentro > mayor) { mayor = dentro; destino.copy(s.normal).multiplyScalar(dentro); }
    }
    // Cuerpos 3D cercanos a la mano.
    const caras = [0, 0, 0, 0, 0, 0];
    for (const c of superficies.cajas?.(muneca, S.alcance) ?? []) {
      // Caras de la caja que la muñeca tiene delante (por fuera); si está dentro de la caja, no se corrige.
      relativo.subVectors(muneca, c.centro);
      let permitidas = 0;
      for (let i = 0; i < 3; i++) {
        const t = relativo.dot(c.ejes[i]);
        caras[2 * i] = t > c.mitad[i] ? 0 : -1;
        caras[2 * i + 1] = t < -c.mitad[i] ? 0 : -1;
        if (caras[2 * i] === 0) permitidas++;
        if (caras[2 * i + 1] === 0) permitidas++;
      }
      if (!permitidas) continue;
      let alguna = false;
      for (const nombre of ARTICULACIONES) {
        relativo.subVectors(punto.copy(mano.puntos.get(nombre)).add(desplazamiento), c.centro);
        const r = radio(mano, nombre, escalaMano);
        const t0 = relativo.dot(c.ejes[0]), t1 = relativo.dot(c.ejes[1]), t2 = relativo.dot(c.ejes[2]);
        if (Math.abs(t0) > c.mitad[0] + r || Math.abs(t1) > c.mitad[1] + r || Math.abs(t2) > c.mitad[2] + r) continue;
        alguna = true;
        t[0] = t0; t[1] = t1; t[2] = t2;
        for (let i = 0; i < 3; i++) {
          if (caras[2 * i] >= 0) caras[2 * i] = Math.max(caras[2 * i], c.mitad[i] + r - t[i]);
          if (caras[2 * i + 1] >= 0) caras[2 * i + 1] = Math.max(caras[2 * i + 1], c.mitad[i] + r + t[i]);
        }
      }
      if (!alguna) continue;
      let mejor = -1, recorrido = Infinity;
      for (let k = 0; k < 6; k++) if (caras[k] > 0 && caras[k] < recorrido) { recorrido = caras[k]; mejor = k; }
      if (mejor < 0 || recorrido > S.max || recorrido <= mayor) continue;
      mayor = recorrido;
      destino.copy(c.ejes[mejor >> 1]).multiplyScalar(mejor % 2 ? -recorrido : recorrido);
    }
    return mayor > 0 ? 'apoyada' : null;
  }

  // Lo que se sostiene con un pellizco (la taza por el asa): las articulaciones que quedan dentro de su cilindro salen
  // hacia su superficie. Lo que se sostiene con toda la mano usa la postura de agarre (más abajo).
  const radial = new THREE.Vector3();
  function rodear(mano, escalaMano) {
    for (const cil of superficies.envolturas?.() ?? []) {
      if (cil.envolvente && cil.lado === mano.lado) continue;
      for (const nombre of ARTICULACIONES) {
        const p = puntos.get(nombre), r = radio(mano, nombre, escalaMano);
        relativo.subVectors(p, cil.centro);
        const a = relativo.dot(cil.eje);
        if (Math.abs(a) > cil.mitad + r) continue;
        radial.copy(relativo).addScaledVector(cil.eje, -a);
        const d = radial.length(), minimo = cil.radio + r;
        if (d >= minimo) continue;
        if (d < 1e-5) radial.copy(mano.palma).addScaledVector(cil.eje, -mano.palma.dot(cil.eje));
        p.addScaledVector(radial.normalize(), minimo - Math.max(d, 0));
        estado.rodeadas += 1;
      }
    }
  }

// ---------- Postura de agarre (corrección: el vaso y la taza rodeados con toda la mano) ----------
  // Mientras una mano sostiene un cilindro con el agarre envolvente, sus dedos dibujados no copian a los reales (que se
  // cierran más que el objeto virtual y lo atraviesan): cada dedo parte de su nudillo real y se enrolla alrededor del
  // cilindro, en el plano perpendicular a su eje, con el largo real de cada falange (la piel no se estira) y del lado
  // hacia el que el dedo real apunta. La muñeca, la palma y los nudillos siguen a la mano real. La postura entra y sale
  // con una mezcla suave.
  const DIGITOS = [['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'], ...DEDOS.map(d => FALANGES.slice(1).map(f => `${d}-${f}`))];
  const agarreP = new Map(ARTICULACIONES.map(n => [n, new THREE.Vector3()])), agarreQ = new Map(ARTICULACIONES.map(n => [n, new THREE.Quaternion()]));
  const eu = new THREE.Vector3(), ew = new THREE.Vector3(), base2 = new THREE.Vector3(), real = new THREE.Vector3(), adelanteReal = new THREE.Vector3(), haciaSiguiente = new THREE.Vector3();
  const giroExtra = new THREE.Quaternion(), ADELANTE = new THREE.Vector3(0, 0, -1);
  function posturaDeAgarre(mano, cil, escalaMano) {
    for (const cadena of DIGITOS) {
      const inicio = puntos.get(cadena[0]);
      base2.copy(cil.centro).addScaledVector(cil.eje, relativo.subVectors(inicio, cil.centro).dot(cil.eje));
      eu.subVectors(inicio, base2);
      let rho = eu.length();
      if (rho < 1e-5) eu.copy(mano.palma).negate(); else eu.divideScalar(rho);
      ew.crossVectors(cil.eje, eu);
      // Hacia dónde se enrolla: hacia donde apunta la primera falange real (o los dedos de la mano).
      real.subVectors(mano.puntos.get(cadena[1]), mano.puntos.get(cadena[0]));
      const sentido = (Math.abs(real.dot(ew)) > 1e-4 ? real.dot(ew) : mano.dedos.dot(ew)) >= 0 ? 1 : -1;
      const piel = radio(mano, cadena[1], escalaMano) + cfg.agarre.holgura;
      const Rf = cil.radio + piel;
      rho = Math.max(rho, Rf);
      let fi = 0;
      agarreP.get(cadena[0]).copy(base2).addScaledVector(eu, rho);
      for (let i = 1; i < cadena.length; i++) {
        const largo = mano.puntos.get(cadena[i]).distanceTo(mano.puntos.get(cadena[i - 1]));
        if (rho > Rf + 1e-4) {
          const c = (rho * rho + Rf * Rf - largo * largo) / (2 * rho * Rf);
          if (c <= 1) { fi += sentido * Math.acos(Math.max(-1, c)); rho = Rf; }
          else {
            // No alcanza el cilindro: avanza hacia el punto de tangencia.
            const dt = Math.acos(Rf / rho), tx = Rf * Math.cos(fi + sentido * dt), ty = Rf * Math.sin(fi + sentido * dt);
            const px = rho * Math.cos(fi), py = rho * Math.sin(fi), dx = tx - px, dy = ty - py, l = Math.hypot(dx, dy) || 1;
            const nx = px + dx / l * largo, ny = py + dy / l * largo;
            rho = Math.hypot(nx, ny); fi = Math.atan2(ny, nx);
          }
        } else {
          fi += sentido * 2 * Math.asin(Math.min(1, largo / (2 * Rf)));
        }
        fi = THREE.MathUtils.clamp(fi, -cfg.agarre.vueltaMax, cfg.agarre.vueltaMax);
        agarreP.get(cadena[i]).copy(base2).addScaledVector(eu, rho * Math.cos(fi)).addScaledVector(ew, rho * Math.sin(fi));
      }
      // Giro de cada hueso: el de la articulación real, girado lo justo para apuntar a la articulación siguiente.
      cadena.forEach((nombre, i) => {
        const siguiente = i < cadena.length - 1 ? agarreP.get(cadena[i + 1]) : null;
        if (siguiente) haciaSiguiente.subVectors(siguiente, agarreP.get(nombre)).normalize();
        else haciaSiguiente.subVectors(agarreP.get(nombre), agarreP.get(cadena[i - 1])).normalize();
        const q = mano.giros.get(nombre);
        adelanteReal.copy(ADELANTE).applyQuaternion(q);
        agarreQ.get(nombre).copy(giroExtra.setFromUnitVectors(adelanteReal, haciaSiguiente)).multiply(q);
      });
    }
  }

  // Grosor de cada hueso: radio real de su articulación sobre el radio de la piel del modelo (la palma, poco).
  function grosor(mano, m, nombre, escalaMano) {
    const fuente = GROSOR_DE(nombre), modelo = m.radioModelo.get(fuente);
    const [min, max] = PALMA.has(nombre) ? cfg.grosor.palma : cfg.grosor.dedos;
    if (!modelo || !mano.conRadios) return THREE.MathUtils.clamp(escalaMano * MANO_TIPICA / m.manoModelo * cfg.ajuste, min, max);
    return THREE.MathUtils.clamp(radio(mano, fuente, escalaMano) / modelo, min, max);
  }

  function armar(lado, dt) {
    const mano = manos[lado], m = modelos[lado];
    if (!m.listo) return false;
    const seguida = mano.seguida && ARTICULACIONES.every(nombre => mano.puntos.has(nombre) && mano.giros.has(nombre));
    m.raiz.visible = seguida;
    if (!seguida) { m.apoyo.set(0, 0, 0); return false; }
    const escalaMano = mano.puntos.get('wrist').distanceTo(mano.puntos.get('middle-finger-phalanx-proximal')) / MANO_TIPICA;
    // Detenida en la superficie: la corrección crece de inmediato (no se ve hundida) y se suelta con suavidad.
    const caso = hundimiento(mano, escalaMano, NULO, m.objetivo, true);
    if (caso === 'oculta') { m.raiz.visible = false; m.apoyo.set(0, 0, 0); estado.ocultas += 1; return true; }
    // Segunda pasada con la mano ya corregida: que al salir de un cuerpo no quede metida en otro.
    if (caso && hundimiento(mano, escalaMano, segunda.copy(m.objetivo), extra, false)) m.objetivo.add(extra);
    if (m.objetivo.lengthSq() >= m.apoyo.lengthSq()) m.apoyo.copy(m.objetivo);
    else m.apoyo.lerp(m.objetivo, 1 - Math.exp(-cfg.superficie.suavizado * dt));
    ARTICULACIONES.forEach(nombre => puntos.get(nombre).copy(mano.puntos.get(nombre)).add(m.apoyo));
    rodear(mano, escalaMano);
    // Postura de agarre: con un cilindro rodeado por esta mano, los dedos lo envuelven (mezcla suave al entrar y salir).
    const cil = (superficies.envolturas?.() ?? []).find(c => c.envolvente && c.lado === lado);
    if (cil) m.cilindro = { centro: cil.centro.clone(), eje: cil.eje.clone(), radio: cil.radio, mitad: cil.mitad };
    m.agarre = THREE.MathUtils.clamp((m.agarre ?? 0) + (cil ? 1 : -1) * dt * cfg.agarre.rapidez, 0, 1);
    if (cil && m.agarre < .02) m.agarre = .02;
    const mezcla = THREE.MathUtils.smoothstep(m.agarre, 0, 1);
    if (mezcla > 0 && m.cilindro) { posturaDeAgarre(mano, m.cilindro, escalaMano); estado.agarres += 1; }
    // Esqueleto del modelo en las articulaciones (el modelo cuelga de la escena sin giro ni escala): posición
    // corregida, giro de la articulación real y grosor a lo ancho de cada hueso (su eje largo es −Z).
    ARTICULACIONES.forEach(nombre => {
      const hueso = m.huesos.get(nombre);
      if (!hueso) return;
      const p = puntos.get(nombre);
      hueso.quaternion.copy(mano.giros.get(nombre));
      if (mezcla > 0 && m.cilindro && !PALMA.has(nombre) && nombre !== 'wrist') {
        p.lerp(agarreP.get(nombre), mezcla);
        hueso.quaternion.slerp(agarreQ.get(nombre), mezcla);
      }
      hueso.position.copy(p);
      const k = grosor(mano, m, nombre, escalaMano);
      hueso.scale.set(k, k, 1);
      m.dibujados.get(nombre).copy(p);
    });
    if (caso === 'apoyada') estado.apoyadas += 1;
    return true;
  }

  // Además, cada cuadro: el adaptador de IWSDK no muestra su mano (toggleVisual) y se ocultan las mallas de toda mano
  // genérica que IWSDK tenga cargada (la del adaptador y las de su caché, que reutiliza al volver a conectar la mano).
  const ocultarModelo = modelo => {
    if (!modelo) return;
    modelo.visible = false;
    modelo.traverse(o => { if (o.isMesh) o.visible = false; });
  };
  function apagarManoGenerica() {
    for (const lado of LADOS) {
      const adaptador = world.input?.xr?.visualAdapters?.hand?.[lado];
      if (!adaptador) continue;
      if (adaptador.visualsEnabled !== false) adaptador.toggleVisual?.(false);
      ocultarModelo(adaptador.visual?.model);
    }
    XRInputVisualAdapter?.visualCache?.forEach((visual, clave) => { if (String(clave).startsWith('hand')) ocultarModelo(visual?.model); });
  }

  return {
    estado, grupo, modelos, superficies,
    actualizar(dt = 0) {
      apagarManoGenerica();
      estado.apoyadas = 0;
      estado.ocultas = 0;
      estado.rodeadas = 0;
      estado.agarres = 0;
      estado.envolturas = superficies.envolturas?.().length ?? 0;
      estado.manos = LADOS.filter(lado => armar(lado, dt)).length;
      estado.conRadios = LADOS.some(lado => manos[lado].seguida && manos[lado].conRadios);
    }
  };
}
