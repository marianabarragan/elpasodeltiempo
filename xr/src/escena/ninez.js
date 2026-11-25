import * as THREE from 'three';
import gsap from 'gsap';
import { PokeInteractable, RayInteractable } from '@iwsdk/core';
import { Tocable } from '../componentes.js';
import { AJUSTES } from '../config.js';
import { crearCaja } from './caja.js';
import { crearBordeSombra, crearSombras } from './sombras.js';
import { crearCanto, puntoDelLado } from './canto.js';
import { cajaLocal } from './adultez/dedos.js';

// Distribución compacta para mesas angostas: juguetes más cerca de la hoja, en unidades originales.
const COMPACTA = { rings: { x: -7.4, z: -3.3 }, xylophone: { x: 8.2, z: .3 } };
const HOJA = { ancho: 8.2, fondo: 6.15 };
// Teclas del xilófono: «Cube…» en toys.glb y «xylophone-key-…» en el sustituto de js/childhood-props.js.
const TECLA = /^(Cube\d*|xylophone-key-\d+)$/;

/*
 * Crayola principal más delgada y alargada para el gesto real de pintar: estira el cuerpo, estira
 * menos la punta (sigue siendo roma, de crayola, no de lápiz) y reduce el grosor. Modifica una copia
 * de la geometría de toys.glb (eje largo = Y) y corrige las normales con la inversa de la escala.
 * Luego centra la crayola, ubica la punta en +X y la apoya de nuevo sobre la espuma.
 */
function afinarCrayola(props) {
  const { crayon, crayonTip, crayonRest, floorY } = props;
  if (!crayon.userData.blenderModel) return;
  const { cuerpo, punta, grosor } = AJUSTES.crayola;
  crayon.traverse(malla => {
    if (!malla.isMesh) return;
    const geometria = malla.geometry.clone(), posicion = geometria.attributes.position, normal = geometria.attributes.normal;
    let radioMax = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < posicion.count; i++) {
      radioMax = Math.max(radioMax, Math.hypot(posicion.getX(i), posicion.getZ(i)));
      minY = Math.min(minY, posicion.getY(i)); maxY = Math.max(maxY, posicion.getY(i));
    }
    // La punta empieza donde el radio deja de ser el del cuerpo, en la mitad superior.
    let inicioPunta = maxY;
    for (let i = 0; i < posicion.count; i++) {
      const y = posicion.getY(i);
      if (y > (minY + maxY) / 2 && Math.hypot(posicion.getX(i), posicion.getZ(i)) < radioMax * .95) inicioPunta = Math.min(inicioPunta, y);
    }
    const n = new THREE.Vector3();
    for (let i = 0; i < posicion.count; i++) {
      const y = posicion.getY(i), k = y <= inicioPunta ? cuerpo : punta;
      posicion.setXYZ(i, posicion.getX(i) * grosor, inicioPunta + (y - inicioPunta) * k, posicion.getZ(i) * grosor);
      if (normal) {
        n.set(normal.getX(i) / grosor, normal.getY(i) / k, normal.getZ(i) / grosor).normalize();
        normal.setXYZ(i, n.x, n.y, n.z);
      }
    }
    posicion.needsUpdate = true;
    if (normal) normal.needsUpdate = true;
    geometria.computeBoundingBox();
    geometria.computeBoundingSphere();
    malla.geometry = geometria;
  });
  // Centro y largo en el espacio de la crayola: la punta queda en +X, a medio largo del centro.
  crayon.updateMatrixWorld(true);
  const aCrayola = crayon.matrixWorld.clone().invert(), matriz = new THREE.Matrix4(), limites = new THREE.Box3(), parte = new THREE.Box3();
  crayon.traverse(malla => { if (malla.isMesh) limites.union(parte.copy(malla.geometry.boundingBox).applyMatrix4(matriz.multiplyMatrices(aCrayola, malla.matrixWorld))); });
  const centro = limites.getCenter(new THREE.Vector3()), tam = limites.getSize(new THREE.Vector3());
  crayon.children.forEach(hijo => hijo.position.sub(centro));
  crayonTip.set(tam.x / 2, 0, 0);
  // Más delgada, queda más baja: se apoya otra vez sobre la espuma.
  props.group.updateMatrixWorld(true);
  crayon.position.y += floorY + .004 - new THREE.Box3().setFromObject(crayon, true).min.y;
  crayonRest.position.copy(crayon.position);
}

// Xilófono más grande (mismo modelo y lugar) y sus teclas ordenadas de grave (la más larga) a aguda.
function prepararXilofono(props) {
  const { floorY } = props, { xylophone } = props.metadata.models;
  xylophone.scale.multiplyScalar(AJUSTES.xilofono.aumento);
  props.group.updateMatrixWorld(true);
  xylophone.position.y += floorY + .002 - new THREE.Box3().setFromObject(xylophone).min.y;
  xylophone.userData.rest.position.copy(xylophone.position);
  xylophone.userData.rest.scale.copy(xylophone.scale);
  xylophone.updateMatrixWorld(true);
  const aXilofono = xylophone.matrixWorld.clone().invert(), matriz = new THREE.Matrix4();
  const teclas = [];
  xylophone.traverse(objeto => {
    if (!objeto.isMesh || !TECLA.test(objeto.name)) return;
    objeto.geometry.computeBoundingBox();
    const caja = objeto.geometry.boundingBox.clone().applyMatrix4(matriz.multiplyMatrices(aXilofono, objeto.matrixWorld));
    const tam = caja.getSize(new THREE.Vector3());
    teclas.push({ malla: objeto, centro: caja.getCenter(new THREE.Vector3()), largo: Math.max(tam.x, tam.z), reposo: objeto.position.y });
  });
  teclas.sort((a, b) => b.largo - a.largo);
  // Eje a lo largo del cual se alinean las teclas (de la primera a la última).
  const eje = teclas.length > 1 ? teclas.at(-1).centro.clone().sub(teclas[0].centro).normalize() : new THREE.Vector3(0, 0, 1);
  return { teclas, eje };
}

/*
 * Medidas de la composición original (hoja, juguetes, crayola y caja de crayolas) para decidir su escala
 * en una mesa. Se arma una vez con ChildhoodProps.build() y se reutiliza al construir el escenario.
 */
export function prepararNinez(world) {
  const app = window.TimeExperience;
  const cfg = app.Config.childhood;
  const props = app.ChildhoodProps.build();
  const pintura = new app.PaintingSystem();
  afinarCrayola(props);
  const xilofono = prepararXilofono(props);
  // Caja de crayolas en el lateral izquierdo, apoyada en la espuma y girada hacia el usuario.
  const colores = cfg.palette.flatMap(familia => familia.colors.map(([hex]) => hex));
  const caja = crearCaja(colores);
  const ubicarCaja = ({ x, z, giro }) => { caja.grupo.position.set(x, props.floorY + .002, z); caja.grupo.rotation.y = giro; };
  ubicarCaja(AJUSTES.caja.normal);
  props.group.add(caja.grupo);
  // Reflejos de los juguetes, halo de la crayola y luz de ventana: métodos de js/childhood-scene.js.
  // Se preparan antes de la sesión XR porque los reflejos usan un render auxiliar (PMREM).
  const prestado = { props, renderer: world.renderer, scene: props.group };
  app.ChildhoodScene.prototype.addToyReflections.call(prestado);
  const halo = app.ChildhoodScene.prototype.buildCrayonGlow.call(prestado);
  app.ChildhoodScene.prototype.addWindowLight.call(prestado);
  // Hoja con el mismo cuerpo y lienzo de js/childhood-scene.js.
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(HOJA.ancho, .025, HOJA.fondo), new THREE.MeshStandardMaterial({ color: '#fffdf6', roughness: 1 }));
  cuerpo.position.set(0, props.floorY + .0125, 0);
  cuerpo.scale.set(cfg.paperScale, 1, cfg.paperScale);
  cuerpo.castShadow = cuerpo.receiveShadow = true;
  const hoja = new THREE.Mesh(new THREE.PlaneGeometry(HOJA.ancho, HOJA.fondo), new THREE.MeshStandardMaterial({ map: pintura.texture, roughness: 1, metalness: 0 }));
  hoja.rotation.x = -Math.PI / 2;
  hoja.scale.setScalar(cfg.paperScale);
  hoja.position.set(0, props.floorY + .026, 0);
  hoja.receiveShadow = true;
  props.group.add(cuerpo, hoja);
  const medir = () => {
    props.group.updateMatrixWorld(true);
    const { rings, xylophone, crayon } = props.metadata.models;
    const total = new THREE.Box3();
    [cuerpo, rings, xylophone, crayon, caja.grupo].forEach(objeto => total.union(new THREE.Box3().setFromObject(objeto)));
    return total;
  };
  const normal = medir();
  const { rings, xylophone } = props.metadata.models;
  const reposo = { rings: rings.position.clone(), xylophone: xylophone.position.clone() };
  Object.entries(COMPACTA).forEach(([nombre, p]) => props.metadata.models[nombre].position.set(p.x, reposo[nombre].y, p.z));
  ubicarCaja(AJUSTES.caja.compacta);
  const compacta = medir();
  Object.entries(reposo).forEach(([nombre, p]) => props.metadata.models[nombre].position.copy(p));
  ubicarCaja(AJUSTES.caja.normal);
  return { props, pintura, cuerpo, hoja, halo, ventana: prestado.windowLight, caja, colores, xilofono, ubicarCaja, cajas: { normal, compacta } };
}

// Escala (metros por unidad) con la que la composición llena el área útil de la mesa, sin tope.
function escalaQueLlena(caja, ancho, fondo) {
  const { margen } = AJUSTES.mesa, tam = caja.getSize(new THREE.Vector3());
  return Math.min((ancho - 2 * margen) / tam.x, (fondo - 2 * margen) / tam.z);
}

// Escala que cabe en la mesa: 'normal', 'compacta' o 'insuficiente' (se usa la mínima y se avisa).
export function evaluarMesa(base, ancho, fondo) {
  const { ninezMax, ninezMin } = AJUSTES.escala;
  const normal = Math.min(escalaQueLlena(base.cajas.normal, ancho, fondo), ninezMax);
  if (normal >= ninezMin) return { modo: 'normal', escala: normal };
  const compacta = Math.min(escalaQueLlena(base.cajas.compacta, ancho, fondo), ninezMax);
  if (compacta >= ninezMin) return { modo: 'compacta', escala: compacta };
  return { modo: 'insuficiente', escala: ninezMin };
}

/*
 * Escenario de niñez sobre la mesa: piso de rompecabezas recortado a su rectángulo, hoja, juguetes,
 * crayola y caja de crayolas. Todo empieza oculto; revelar() hace crecer el piso desde el centro y luego
 * los objetos. Todo cuelga de `escena` (EscenarioNiñez): manipulacion.js la traslada, gira y escala con
 * las dos manos y cada objeto conserva su lugar sobre el piso. El piso es del escenario, no de la mesa:
 * su recorte acompaña a `escena`. La caja de crayolas se toma por la parte alta de su cuerpo, se lleva y baja al piso.
 */
export function crearNinez(world, espacio, base, encaje) {
  const app = window.TimeExperience;
  const { props, pintura, cuerpo, hoja, halo, ventana, caja, xilofono } = base;
  const { rings, xylophone, crayon, floor } = props.metadata.models;
  if (encaje.modo === 'compacta') {
    Object.entries(COMPACTA).forEach(([nombre, p]) => { const t = props.metadata.models[nombre]; t.position.x = p.x; t.position.z = p.z; t.userData.rest.position.copy(t.position); });
    base.ubicarCaja(AJUSTES.caja.compacta);
  }

  // La composición queda centrada en la mesa y la capa inferior del piso, sobre su cara superior.
  const s = encaje.escala;
  const cajaComposicion = (encaje.modo === 'compacta' ? base.cajas.compacta : base.cajas.normal).clone();
  const centro = cajaComposicion.getCenter(new THREE.Vector3());
  const escena = new THREE.Group();
  escena.name = 'escenario-ninez';
  escena.visible = false;
  escena.add(props.group);
  props.group.scale.setScalar(s);
  // Superficie 3D (corrección): el rompecabezas tiene el grosor del escritorio de la adultez; su cara de abajo queda
  // sobre la mesa real y la de arriba (props.floorY), `grosor` m más arriba.
  const grosor = AJUSTES.adultez.escritorio.grosor;
  props.group.position.set(-centro.x * s, grosor - props.floorY * s, -centro.z * s);
  const entidadEscena = world.createTransformEntity(escena, { parent: espacio.entidad });
  const entidadProps = world.createTransformEntity(props.group, { parent: entidadEscena });

  // El piso del escenario mide lo que la mesa elegida (menos un margen) y se mueve y escala con `escena`.
  const margen = AJUSTES.mesa.margen * .5;
  const medio = { x: (espacio.ancho / 2 - margen) / s, z: (espacio.fondo / 2 - margen) / s };
  const camara = new THREE.OrthographicCamera(-medio.x, medio.x, medio.z, -medio.z, .1, 100);
  camara.position.set(centro.x, 50, centro.z);
  camara.up.set(0, 0, -1);
  camara.lookAt(centro.x, 0, centro.z);
  camara.updateMatrixWorld(true);
  camara.updateProjectionMatrix();
  props.ensureFloorCoverage(camara);

  // Recorta el piso y la luz de ventana a ese rectángulo: planos definidos en el espacio de `escena` y
  // llevados al mundo cada cuadro, así el recorte acompaña al escenario cuando se mueve o escala.
  const local = [[1, 0, espacio.ancho / 2 - margen], [-1, 0, espacio.ancho / 2 - margen], [0, 1, espacio.fondo / 2 - margen], [0, -1, espacio.fondo / 2 - margen]]
    .map(([x, z, d]) => new THREE.Plane(new THREE.Vector3(-x, 0, -z), d));
  const planos = local.map(plano => plano.clone());
  const recortados = new Set();
  floor.traverse(objeto => { if (objeto.isMesh) recortados.add(objeto.material); });
  ventana.traverse(objeto => { if (objeto.isMesh) recortados.add(objeto.material); });
  recortados.forEach(material => { material.clippingPlanes = planos; material.clipShadows = true; material.needsUpdate = true; });
  const actualizarRecorte = () => {
    escena.updateWorldMatrix(true, false);
    planos.forEach((plano, i) => plano.copy(local[i]).applyMatrix4(escena.matrixWorld));
  };

  // Canto del rompecabezas: cada lado muestra el color de la pieza que llega a ese borde (la más cercana a cada
  // punto), con una línea más oscura entre piezas, como un rompecabezas grueso. Debajo, la base del piso.
  const hx = espacio.ancho / 2 - margen, hz = espacio.fondo / 2 - margen;
  const centros = [];
  const matrizPieza = new THREE.Matrix4(), centroPieza = new THREE.Vector3();
  floor.traverse(malla => {
    if (!malla.isInstancedMesh) return;
    const color = '#' + malla.material.color.getHexString(THREE.SRGBColorSpace);
    for (let i = 0; i < malla.count; i++) { malla.getMatrixAt(i, matrizPieza); centroPieza.setFromMatrixPosition(matrizPieza); centros.push({ x: centroPieza.x, z: centroPieza.z, color }); }
  });
  const MUESTRAS = 512, FILA = 32;
  const lienzoCanto = document.createElement('canvas');
  lienzoCanto.width = MUESTRAS; lienzoCanto.height = FILA * 4;
  const ctxCanto = lienzoCanto.getContext('2d');
  for (let lado = 0; lado < 4; lado++) {
    let anterior = null;
    for (let i = 0; i < MUESTRAS; i++) {
      const p = puntoDelLado(lado, (i + .5) / MUESTRAS, hx, hz);
      const px = (p.x - props.group.position.x) / s, pz = (p.z - props.group.position.z) / s;
      let mejor = null, distancia = Infinity;
      for (const c of centros) { const d = (c.x - px) ** 2 + (c.z - pz) ** 2; if (d < distancia) { distancia = d; mejor = c; } }
      const color = mejor?.color ?? '#f4e6b0';
      const degradado = ctxCanto.createLinearGradient(0, lado * FILA, 0, (lado + 1) * FILA);
      degradado.addColorStop(0, color);
      degradado.addColorStop(1, new THREE.Color(color).multiplyScalar(.86).getStyle());
      ctxCanto.fillStyle = degradado;
      ctxCanto.fillRect(i, lado * FILA, 1, FILA);
      if (anterior && mejor !== anterior) { ctxCanto.fillStyle = 'rgba(90,60,30,.35)'; ctxCanto.fillRect(i, lado * FILA, 1.5, FILA); }
      anterior = mejor;
    }
  }
  const texturaCanto = new THREE.CanvasTexture(lienzoCanto);
  texturaCanto.colorSpace = THREE.SRGBColorSpace;
  texturaCanto.anisotropy = 4;
  // Como las piezas: color propio con un poco de emisión para conservar los tonos pastel.
  const materialCanto = new THREE.MeshStandardMaterial({ map: texturaCanto, emissive: '#ffffff', emissiveMap: texturaCanto, emissiveIntensity: .32, roughness: 1, metalness: 0 });
  const fila = lado => [1 - (lado + 1) / 4 + .02 / 4, 1 - lado / 4 - .02 / 4];
  const canto = crearCanto({
    hx, hz, alto: grosor, material: materialCanto,
    uv: (lado, t, h) => { const [abajo, arriba] = fila(lado); return [t, h ? arriba : abajo]; },
    uvAbajo: () => [.5, 1 - 2.5 / 4]
  });
  canto.visible = false;
  escena.add(canto);
  const bordeSombra = crearBordeSombra(2 * hx, 2 * hz);
  bordeSombra.position.y = .0005;
  bordeSombra.visible = false;
  escena.add(bordeSombra);

  // ---------- Caja de crayolas ----------
  // Se toma con un pellizco (o con el botón lateral del control) sobre la parte alta de su cuerpo, nunca sobre
  // las puntas de las crayolas: se alza un poco, sigue a la mano y gira solo alrededor de la vertical. Al soltarla
  // baja suavemente hasta el piso del escenario en el lugar donde quedó; si queda sobre la hoja, un juguete o la
  // crayola, se corre lo justo a un lado. Todo en unidades del escenario (espacio de props.group), así funciona
  // igual con el escenario movido, girado o escalado.
  const C = AJUSTES.caja, M = caja.medidas;
  const yCaja = caja.grupo.position.y, giroOriginal = caja.grupo.rotation.y;
  const huella = (objeto, holgura = 0) => {
    const b = cajaLocal(props.group, objeto);
    return { minX: b.min.x - holgura, maxX: b.max.x + holgura, minZ: b.min.z - holgura, maxZ: b.max.z + holgura, alto: b.max.y - props.floorY };
  };
  const obstaculos = [cuerpo, rings, xylophone, crayon].map(objeto => huella(objeto, C.holgura));
  // Caja de la caja de crayolas en su propio espacio (sin giro): su huella se calcula con cualquier giro.
  const propia = cajaLocal(caja.grupo, caja.grupo);
  const centroPropio = propia.getCenter(new THREE.Vector3()), mitadPropia = propia.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const extension = { x0: 0, x1: 0, z0: 0, z1: 0 };
  function extensionCon(g) {
    const c = Math.cos(g), sn = Math.sin(g);
    const cx = centroPropio.x * c + centroPropio.z * sn, cz = -centroPropio.x * sn + centroPropio.z * c;
    const hx = Math.abs(c) * mitadPropia.x + Math.abs(sn) * mitadPropia.z, hz = Math.abs(sn) * mitadPropia.x + Math.abs(c) * mitadPropia.z;
    Object.assign(extension, { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz });
  }
  const piso = { minX: centro.x - medio.x + C.bordePiso, maxX: centro.x + medio.x - C.bordePiso, minZ: centro.z - medio.z + C.bordePiso, maxZ: centro.z + medio.z - C.bordePiso };
  const ultimaValida = caja.grupo.position.clone();
  const dentroDelPiso = p => {
    p.x = THREE.MathUtils.clamp(p.x, piso.minX - extension.x0, Math.max(piso.minX - extension.x0, piso.maxX - extension.x1));
    p.z = THREE.MathUtils.clamp(p.z, piso.minZ - extension.z0, Math.max(piso.minZ - extension.z0, piso.maxZ - extension.z1));
  };
  // Lo que la caja invade de un obstáculo (0 si no se tocan) y el empuje mínimo para separarlos.
  const empuje = (p, o) => {
    const minX = p.x + extension.x0, maxX = p.x + extension.x1, minZ = p.z + extension.z0, maxZ = p.z + extension.z1;
    if (maxX <= o.minX || minX >= o.maxX || maxZ <= o.minZ || minZ >= o.maxZ) return null;
    return [[o.maxX - minX, 'x', 1], [maxX - o.minX, 'x', -1], [o.maxZ - minZ, 'z', 1], [maxZ - o.minZ, 'z', -1]].reduce((a, b) => (b[0] < a[0] ? b : a));
  };
  // Corre `p` lo justo para no montarse en lo que sea más alto que `altura` (unidades sobre el piso) ni salir del
  // piso, con la huella del giro actual. Devuelve false si no queda lugar libre.
  function despejar(p, altura = 0) {
    dentroDelPiso(p);
    const activos = obstaculos.filter(o => o.alto > altura);
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      let movida = false;
      for (const o of activos) {
        const e = empuje(p, o);
        if (!e) continue;
        p[e[1]] += e[0] * e[2];
        movida = true;
      }
      if (!movida) break;
      dentroDelPiso(p);
    }
    return !activos.some(o => empuje(p, o));
  }

  // `retirandose`: mano que acaba de soltar la caja; no elige color hasta alejarse de ella (sus dedos abiertos
  // pueden rozar las crayolas al retirarse).
  const estadoCaja = { sostenida: false, bajando: false, lado: null, soltadaEn: -Infinity, movimientos: 0, activa: false, retirandose: null };
  const agarreCaja = { desfase: new THREE.Vector3(), giroMano: 0, giroCaja: 0, delta: 0, tiempo: 0, perdida: 0 };
  const previoCaja = { left: false, right: false };
  const enCaja = new THREE.Vector3(), enGrupo = new THREE.Vector3(), metaCaja = new THREE.Vector3(), direccion = new THREE.Vector3();
  const inversaGrupo = new THREE.Matrix4(), ARRIBA = new THREE.Vector3(0, 1, 0);
  const envolver = a => Math.atan2(Math.sin(a), Math.cos(a));
  const unidadesPorMetro = () => 1 / (s * escena.scale.x);
  let manosCaja = null, bajada = null;

  // Con la mano: pellizco; con el control: botón lateral.
  const apretando = lado => {
    const mano = manosCaja?.[lado];
    if (!mano) return false;
    if (mano.seguida) return mano.pellizco;
    return mano.control && !!world.input?.xr?.gamepads?.[lado]?.getButtonPressed?.('xr-standard-squeeze');
  };
  // Un punto (mundo) está en la zona de agarre: sobre la parte alta del cuerpo, entre `zona.desde` de la altura de
  // las paredes y apenas por encima de su canto (que sube de la pared delantera a la trasera), sin salir más que
  // `zona.costado` de su huella. Las puntas de las crayolas quedan por encima.
  function enZona(mundo, conControl = false) {
    caja.grupo.updateWorldMatrix(true, false);
    if (caja.grupo.scale.x < .5) return false;
    caja.grupo.worldToLocal(enCaja.copy(mundo));
    const metro = unidadesPorMetro(), costado = (conControl ? C.zona.control : C.zona.costado) * metro;
    const mx = M.ancho / 2 + M.pared, mz = M.fondo / 2 + M.pared;
    if (Math.abs(enCaja.x) > mx + costado || Math.abs(enCaja.z) > mz + costado) return false;
    const canto = THREE.MathUtils.lerp(M.alturaFrente, M.alturaAtras, THREE.MathUtils.clamp((mz - enCaja.z) / (2 * mz), 0, 1));
    return enCaja.y >= canto * C.zona.desde && enCaja.y <= canto + (conControl ? C.zona.control : C.zona.arriba) * metro;
  }
  // Giro horizontal de la mano en el espacio del escenario: línea de los nudillos (o el frente del control).
  function giroDeMano(lado) {
    const mano = manosCaja[lado];
    if (mano.seguida) direccion.copy(mano.nudillos);
    else world.player.gripSpaces[lado].getWorldDirection(direccion);
    direccion.transformDirection(inversaGrupo);
    if (direccion.x * direccion.x + direccion.z * direccion.z < .09) return null;
    return Math.atan2(direccion.x, direccion.z);
  }
  const prepararGrupo = () => { props.group.updateWorldMatrix(true, false); inversaGrupo.copy(props.group.matrixWorld).invert(); };

  function tomarCaja(lado) {
    bajada?.kill();
    bajada = null;
    prepararGrupo();
    const posicion = caja.grupo.position;
    enGrupo.copy(manosCaja[lado].pinza).applyMatrix4(inversaGrupo);
    agarreCaja.desfase.copy(posicion).sub(enGrupo);
    agarreCaja.giroMano = giroDeMano(lado) ?? 0;
    agarreCaja.giroCaja = caja.grupo.rotation.y;
    Object.assign(agarreCaja, { delta: 0, tiempo: 0, perdida: 0 });
    Object.assign(estadoCaja, { sostenida: true, bajando: false, lado });
    estadoCaja.movimientos += 1;
  }

  // En la mano: sigue a la pinza con su desfase inicial (girado con la mano), se alza un poco, gira solo
  // alrededor de la vertical y no baja del piso ni sale de él; volando bajo, no se monta en los juguetes.
  function seguirCaja(dt) {
    const lado = estadoCaja.lado;
    prepararGrupo();
    const giroMano = giroDeMano(lado);
    if (giroMano !== null) agarreCaja.delta = envolver(giroMano - agarreCaja.giroMano);
    const giro = THREE.MathUtils.clamp(agarreCaja.giroCaja + agarreCaja.delta, giroOriginal - C.giroMax, giroOriginal + C.giroMax);
    enGrupo.copy(manosCaja[lado].pinza).applyMatrix4(inversaGrupo);
    metaCaja.copy(agarreCaja.desfase).applyAxisAngle(ARRIBA, giro - agarreCaja.giroCaja).add(enGrupo);
    agarreCaja.tiempo += dt;
    const alzado = C.alzar * unidadesPorMetro() * THREE.MathUtils.smoothstep(agarreCaja.tiempo, 0, .2);
    metaCaja.y = Math.max(metaCaja.y, yCaja + alzado);
    extensionCon(giro);
    despejar(metaCaja, metaCaja.y - yCaja);
    const alfa = 1 - Math.exp(-C.suavizado * dt), posicion = caja.grupo.position;
    posicion.lerp(metaCaja, alfa);
    caja.grupo.rotation.y += envolver(giro - caja.grupo.rotation.y) * alfa;
  }

  // Al soltarla baja hasta el piso del escenario (su altura en el espacio del escenario, no una altura fija del
  // mundo), en el lugar donde quedó, derecha y con el giro que le dio el usuario.
  function soltarCaja() {
    if (!estadoCaja.sostenida) return;
    estadoCaja.retirandose = { lado: estadoCaja.lado, desde: performance.now() };
    Object.assign(estadoCaja, { sostenida: false, bajando: true, lado: null });
    const posicion = caja.grupo.position, desde = posicion.clone(), destino = posicion.clone();
    destino.y = yCaja;
    extensionCon(caja.grupo.rotation.y);
    if (!despejar(destino, 0)) destino.copy(ultimaValida);
    const altura = Math.max(0, desde.y - yCaja) / unidadesPorMetro();
    const duracion = THREE.MathUtils.clamp(C.bajar[0] + altura * 2, C.bajar[0], C.bajar[1]), t = { v: 0 };
    bajada = gsap.to(t, {
      v: 1, duration: duracion, ease: 'sine.inOut',
      onUpdate: () => caja.grupo.position.lerpVectors(desde, destino, t.v),
      onComplete: () => {
        bajada = null;
        estadoCaja.bajando = false;
        estadoCaja.soltadaEn = performance.now();
        ultimaValida.copy(destino);
      }
    });
  }

  // Cada cuadro: `activa` (escenario en uso), `manoLibre(lado)` (esa mano no sostiene otra cosa).
  const cajaPropiaLocal = propia.clone();
  function revisarRetiro() {
    const r = estadoCaja.retirandose;
    if (!r) return;
    const mano = manosCaja[r.lado];
    let lejos = !(mano.seguida || mano.control) || performance.now() - r.desde > C.retirarMax * 1000;
    if (!lejos) {
      caja.grupo.updateWorldMatrix(true, false);
      lejos = cajaPropiaLocal.distanceToPoint(caja.grupo.worldToLocal(enCaja.copy(mano.pinza))) / unidadesPorMetro() > C.retirar;
    }
    if (lejos) estadoCaja.retirandose = null;
  }

  function actualizarCaja(dt, { manos: lista, activa, manoLibre = () => true }) {
    manosCaja = lista;
    if (!lista) return;
    revisarRetiro();
    const disponible = activa && estadoCaja.activa;
    if (estadoCaja.sostenida) {
      if (!disponible) soltarCaja();
      else if (apretando(estadoCaja.lado)) agarreCaja.perdida = 0;
      // El seguimiento de manos puede perder el pellizco un instante sin soltarla.
      else if ((agarreCaja.perdida += dt) > C.gracia) soltarCaja();
      if (estadoCaja.sostenida) seguirCaja(dt);
    }
    for (const lado of ['left', 'right']) {
      const ahora = apretando(lado), empieza = ahora && !previoCaja[lado];
      previoCaja[lado] = ahora;
      if (!empieza || estadoCaja.sostenida || !disponible || !manoLibre(lado)) continue;
      if (enZona(lista[lado].pinza, !lista[lado].seguida)) { tomarCaja(lado); break; }
    }
    revisarYemas(dt, lista, disponible);
  }

  // ---------- Elegir color con el índice ----------
  // Corrección tras la prueba en Quest (antes había que tocar la puntita exacta y costaba mucho): cuenta solo la punta
  // del índice de cada mano sobre la parte de la crayola que sobresale de la caja (sus últimos `toque.largo` m hasta la
  // punta), a menos de su radio más `toque.alcance` m; si quedan varias cerca, la más próxima. Pasar la mano cerca no
  // suena: el índice tiene que quedarse `toque.sostener` s sobre la misma crayola. Mientras tanto esa crayola se asoma
  // en silencio (la señal de cuál se va a elegir); al cumplirse el tiempo suena su nota y se elige. Para volver a
  // elegir la misma, el índice sale de ella. Pellizcando (el gesto de tomar la caja) o con la caja en uso no se elige.
  const puntasCrayolas = caja.crayolas.map(() => new THREE.Vector3()), basesCrayolas = caja.crayolas.map(() => new THREE.Vector3());
  const ejeCrayola = new THREE.Vector3(), aPunto = new THREE.Vector3();
  const indices = { left: { crayola: -1, tiempo: 0, elegida: -1, cajas: 0 }, right: { crayola: -1, tiempo: 0, elegida: -1, cajas: 0 } };
  const toque = { elecciones: 0, ultimo: null, senalada: -1, indices };
  // Distancia (m) de un punto al tramo visible de una crayola.
  function distanciaACrayola(i, punto) {
    const a = basesCrayolas[i];
    ejeCrayola.subVectors(puntasCrayolas[i], a);
    const largo2 = ejeCrayola.lengthSq();
    const t = largo2 > 0 ? THREE.MathUtils.clamp(aPunto.subVectors(punto, a).dot(ejeCrayola) / largo2, 0, 1) : 0;
    return aPunto.copy(a).addScaledVector(ejeCrayola, t).distanceTo(punto);
  }
  // Asoma en silencio la crayola que el índice está por elegir (la elegida no se mueve: caja.senalar la ignora).
  function senalarCrayola(i) {
    if (i === toque.senalada) return;
    if (toque.senalada >= 0) caja.senalar(toque.senalada, false, C);
    toque.senalada = i;
    if (i >= 0) caja.senalar(i, true, C);
  }
  function revisarYemas(dt, lista, disponible) {
    const T = C.toque;
    if (!lista || !escena.visible) { senalarCrayola(-1); return; }
    caja.crayolas.forEach((crayola, i) => {
      crayola.updateWorldMatrix(true, false);
      crayola.localToWorld(puntasCrayolas[i].set(0, crayola.userData.puntaY, 0));
      crayola.localToWorld(basesCrayolas[i].set(0, crayola.userData.puntaY - 1, 0));
      ejeCrayola.subVectors(puntasCrayolas[i], basesCrayolas[i]).normalize();
      basesCrayolas[i].copy(puntasCrayolas[i]).addScaledVector(ejeCrayola, -T.largo);
    });
    let senal = -1, cercania = Infinity;
    for (const lado of ['left', 'right']) {
      const mano = lista[lado], e = indices[lado];
      const punto = mano?.seguida ? mano.puntos.get('index-finger-tip') : null;
      if (!punto) { e.crayola = -1; e.tiempo = 0; e.elegida = -1; continue; }
      if (mano.pellizco || !disponible || ninez.cajaOcupada) { e.crayola = -1; e.tiempo = 0; continue; }
      const limite = (mano.radios.get('index-finger-tip') ?? .008) + T.alcance;
      // Salir de la crayola recién elegida permite volver a elegirla.
      if (e.elegida >= 0 && distanciaACrayola(e.elegida, punto) > limite + T.rearme) e.elegida = -1;
      // La crayola que ya se tocaba tiene un margen extra (un temblor del seguimiento no la suelta).
      if (!(e.crayola >= 0 && distanciaACrayola(e.crayola, punto) <= limite + T.histeresis)) {
        let cerca = -1, distancia = Infinity;
        caja.crayolas.forEach((_, i) => { const d = distanciaACrayola(i, punto); if (d < distancia) { distancia = d; cerca = i; } });
        e.crayola = distancia <= limite ? cerca : -1;
        e.tiempo = 0;
        e.cajas = estadoCaja.movimientos;
      }
      if (e.crayola < 0 || e.crayola === e.elegida) continue;
      const d = distanciaACrayola(e.crayola, punto);
      if (d < cercania) { cercania = d; senal = e.crayola; }
      // Si en medio se tomó la caja, el toque vuelve a empezar.
      if (estadoCaja.movimientos !== e.cajas) { e.tiempo = 0; e.cajas = estadoCaja.movimientos; continue; }
      if ((e.tiempo += dt) >= T.sostener) {
        e.elegida = e.crayola;
        e.tiempo = 0;
        toque.elecciones += 1;
        toque.ultimo = { lado, indice: e.crayola };
        if (senal === e.crayola) senal = -1;
        ninez.alElegirColor?.(e.crayola);
      }
    }
    senalarCrayola(senal);
  }

  // Sombras de contacto sobre el piso (y sobre la hoja: quedan apenas por encima de ella).
  const sombras = crearSombras(props.group, { superficie: () => props.floorY, metros: () => s * escena.scale.x });
  [rings, xylophone, caja.grupo, crayon].forEach(objeto => sombras.agregar(objeto));

  // Piezas del rompecabezas: cada instancia guarda su posición y su demora según la distancia al centro.
  // La demora se mide hasta la esquina de la mesa: las piezas de más allá (visibles solo al encoger) llegan al final.
  const piezas = [];
  const matriz = new THREE.Matrix4(), posicion = new THREE.Vector3(), giro = new THREE.Quaternion(), tam = new THREE.Vector3();
  floor.children.filter(objeto => objeto.isInstancedMesh).forEach(malla => {
    for (let i = 0; i < malla.count; i++) {
      malla.getMatrixAt(i, matriz);
      const base = new THREE.Vector3().setFromMatrixPosition(matriz);
      piezas.push({ malla, i, base, distancia: Math.hypot(base.x - centro.x, base.z - centro.z) });
    }
  });
  const lejana = Math.max(Math.hypot(medio.x, medio.z), 1);
  const capa = floor.children.find(objeto => objeto.isMesh && !objeto.isInstancedMesh);
  const rebote = gsap.parseEase('back.out(1.6)');
  const aplicarPiso = t => {
    const { piso, pieza } = AJUSTES.transformacion, cambiadas = new Set();
    for (const p of piezas) {
      const avance = THREE.MathUtils.clamp((t - Math.min(p.distancia / lejana, 1) * piso) / pieza, 0, 1);
      const k = avance <= 0 ? .0001 : rebote(avance);
      matriz.compose(posicion.copy(p.base).setY(p.base.y + (1 - Math.min(1, k)) * .8), giro, tam.setScalar(Math.max(k, .0001)));
      p.malla.setMatrixAt(p.i, matriz);
      cambiadas.add(p.malla);
    }
    cambiadas.forEach(malla => { malla.instanceMatrix.needsUpdate = true; });
    if (capa) capa.visible = t >= piso * .8;
    ventana.visible = t >= piso;
    canto.visible = bordeSombra.visible = t >= piso * .85;
  };

  // Escalas de reposo para la aparición de la hoja, los juguetes, la caja y la crayola.
  const objetos = [cuerpo, hoja, rings, xylophone, caja.grupo, crayon];
  const reposo = new Map(objetos.map(objeto => [objeto, objeto.scale.clone()]));
  const encoger = objeto => objeto.scale.copy(reposo.get(objeto)).multiplyScalar(.0001);
  const crecer = (objetos, duracion, retraso) => objetos.map((objeto, i) => gsap.to(objeto.scale, {
    x: reposo.get(objeto).x, y: reposo.get(objeto).y, z: reposo.get(objeto).z, duration: duracion, delay: retraso + i * .12, ease: 'back.out(1.8)'
  }));

  // Juguetes, teclas y crayolas de la caja responden al rayo y al toque; la crayola principal solo se agarra.
  const tocar = (objeto, id, padre = entidadProps) => {
    const entidad = world.createTransformEntity(objeto, { parent: padre });
    if (id) entidad.addComponent(Tocable, { id });
    return entidad;
  };
  const entidadCaja = tocar(caja.grupo, 'caja-crayolas');
  const entidades = {
    rings: tocar(rings, 'juguete-rings'), xylophone: tocar(xylophone, 'juguete-xylophone'), crayon: tocar(crayon, 'crayola'),
    caja: entidadCaja, colores: caja.crayolas.map((crayola, i) => tocar(crayola, `color-${i}`, entidadCaja))
  };
  // Las crayolas de la caja solo responden al rayo de un control: con las manos se elige color tocando su punta
  // con la yema (revisarYemas), no con el toque genérico del índice.
  const tocables = [entidades.rings, entidades.xylophone];
  // Elegir un color y mover la caja son gestos distintos: las crayolas responden al toque del índice y al
  // rayo, nunca al agarre; la caja se toma solo con un pellizco sobre la parte alta de su cuerpo (actualizarCaja),
  // así un toque sobre una crayola o el cartón no la desplaza.
  caja.crayolas.forEach(crayola => { crayola.pointerEventsType = { deny: 'grab' }; });
  const interactuar = activo => {
    const poner = (entidad, Componente) => {
      if (activo && !entidad.hasComponent(Componente)) entidad.addComponent(Componente);
      if (!activo && entidad.hasComponent(Componente)) entidad.removeComponent(Componente);
    };
    tocables.forEach(entidad => [RayInteractable, PokeInteractable].forEach(Componente => poner(entidad, Componente)));
    entidades.colores.forEach(entidad => poner(entidad, RayInteractable));
    estadoCaja.activa = activo;
    if (!activo) soltarCaja();
  };

  // Cada tecla suena por separado: la que toca el dedo o el rayo (o la más cercana al punto, si cae entre dos).
  const { teclas, eje } = xilofono;
  const relativo = new THREE.Vector3();
  const teclaEn = evento => {
    const directa = teclas.findIndex(t => t.malla === evento.object);
    if (directa >= 0 || !evento.point) return directa;
    xylophone.worldToLocal(relativo.copy(evento.point));
    let mejor = -1, distancia = Infinity;
    teclas.forEach((t, i) => {
      const d = Math.abs(relativo.clone().sub(t.centro).dot(eje));
      if (d < distancia) { distancia = d; mejor = i; }
    });
    return mejor;
  };
  xylophone.addEventListener('pointerdown', evento => {
    if (!escena.visible || !entidades.xylophone.hasComponent(PokeInteractable)) return;
    const i = teclaEn(evento);
    if (i < 0) return;
    const tecla = teclas[i];
    gsap.killTweensOf(tecla.malla.position);
    gsap.timeline()
      .to(tecla.malla.position, { y: tecla.reposo - AJUSTES.xilofono.hundir, duration: .05, ease: 'power2.out' })
      .to(tecla.malla.position, { y: tecla.reposo, duration: .28, ease: 'back.out(3)' });
    ninez.alTocarTecla?.(i);
  });

  const ninez = {
    escena, props, pintura, hoja, crayon, halo, caja, entidades, estadoCaja, sombras,
    // Rectángulo del piso (m, en el espacio de `escena`): zona donde las manos toman el escenario.
    area: { ancho: espacio.ancho, fondo: espacio.fondo },
    // Metros por unidad del escenario original, incluida la escala elegida con las manos.
    get escala() { return s * escena.scale.x; },
    // Altura de la superficie del piso (m, en el espacio de `escena`): el contorno del escalado va sobre ella.
    superficie: grosor,
    // Mientras se mueve o baja la caja (y un instante después de apoyarla) tocar una crayola no elige color.
    get cajaOcupada() { return estadoCaja.sostenida || estadoCaja.bajando || !!estadoCaja.retirandose || performance.now() - estadoCaja.soltadaEn < C.pausaColor * 1000; },
    // Zona de agarre de la caja (para las pruebas) y soltarla desde fuera (al salir del escenario).
    zonaCaja: enZona, soltarCaja,
    // Elección de color con el índice (la narrativa decide con alElegirColor) y punta de cada crayola (pruebas).
    toque, alElegirColor: null,
    puntaCrayola: i => puntasCrayolas[i].clone(),
    color: app.Config.colors.green,
    // REPETIR: la hoja sin pintar, la crayola del color inicial, ninguna crayola de la caja elegida y la caja libre.
    reiniciar() {
      pintura.reset();
      ninez.setColor(app.Config.colors.green);
      caja.reiniciar();
      bajada?.kill();
      bajada = null;
      Object.assign(estadoCaja, { sostenida: false, bajando: false, lado: null, soltadaEn: -Infinity, retirandose: null });
      Object.values(toque.indices).forEach(e => Object.assign(e, { crayola: -1, tiempo: 0, elegida: -1 }));
      toque.senalada = -1;
      halo.value = 0;
    },
    alTocarTecla: null,
    // Todo oculto y encogido, listo para la transformación.
    preparar() {
      aplicarPiso(0);
      objetos.forEach(encoger);
      actualizarRecorte();
      escena.visible = true;
    },
    // El piso se extiende desde el centro; después la hoja, los juguetes y la caja, y por último la crayola.
    revelar() {
      const { piso, pieza, hoja: tHoja, juguetes, crayola } = AJUSTES.transformacion;
      const estado = { t: 0 };
      return new Promise(resolve => {
        gsap.to(estado, { t: piso + pieza, duration: piso + pieza, ease: 'none', onUpdate: () => aplicarPiso(estado.t), onComplete: () => aplicarPiso(Infinity) });
        crecer([cuerpo, hoja], tHoja, piso * .7);
        crecer([rings, xylophone, caja.grupo], juguetes, piso * .7 + tHoja * .8);
        const ultima = crecer([crayon], crayola, piso * .7 + tHoja * .8 + juguetes + .2)[0];
        ultima.eventCallback('onComplete', () => { interactuar(true); resolve(); });
      });
    },
    setColor(color) {
      ninez.color = color;
      props.crayonColorMaterials.forEach(material => material.color.set(color));
    },
    // Salto y balanceo del juguete señalado (ObjectInteractions.poseToy de la web).
    senalarJuguete(nombre, activo) {
      app.ObjectInteractions.prototype.poseToy.call({ toys: { rings, xylophone }, world: { invalidate() {} } }, nombre, activo);
    },
    // Halo de la crayola en reposo: pulsa despacio cuando se espera que el usuario la tome.
    actualizarHalo(t, dt, encendido) {
      halo.value += ((encendido ? 1 : 0) - halo.value) * (1 - Math.exp(-6 * dt));
      const pulso = .5 + .5 * Math.sin(t * 2.4);
      halo.material.uniforms.uOpacity.value = halo.value * (.22 + .33 * pulso);
      halo.halo.visible = halo.value > .005;
    },
    interactuar,
    // `contexto`: { manos, activa (escenario en uso), manoLibre(lado) }.
    update(dt = 0, contexto = {}) {
      if (!escena.visible) return;
      actualizarRecorte();
      actualizarCaja(dt, contexto);
      sombras.actualizar();
    },
    ocultar() { interactuar(false); escena.visible = false; }
  };
  return ninez;
}
