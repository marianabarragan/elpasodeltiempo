import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, Grabbed, OneHandGrabbable, PokeInteractable, RayInteractable } from '@iwsdk/core';
import { Tocable } from '../componentes.js';
import { AJUSTES } from '../config.js';
import { crearCaja } from './caja.js';
import { cajaLocal } from './adultez/dedos.js';

// Distribución compacta para mesas angostas: juguetes más cerca de la hoja, en unidades originales.
const COMPACTA = { rings: { x: -7.4, z: -3.3 }, xylophone: { x: 8.2, z: .3 } };
// Bajo la espuma hay una capa de 0,045 unidades que debe apoyarse en la mesa (js/childhood-props.js).
const BASE_PISO = .045;
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
 * su recorte acompaña a `escena`. La caja de crayolas se puede tomar por su cuerpo y deslizar sobre el piso.
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
  props.group.position.set(-centro.x * s, BASE_PISO * s, -centro.z * s);
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

  // Caja de crayolas reubicable: se desliza sobre el piso sin salir de él ni montarse en la hoja, los
  // juguetes o la crayola. Todo en unidades del escenario (espacio de props.group); la caja no gira.
  const C = AJUSTES.caja;
  const yCaja = caja.grupo.position.y;
  const huella = (objeto, holgura = 0) => {
    const b = cajaLocal(props.group, objeto);
    return { minX: b.min.x - holgura, maxX: b.max.x + holgura, minZ: b.min.z - holgura, maxZ: b.max.z + holgura };
  };
  const obstaculos = [cuerpo, rings, xylophone, crayon].map(objeto => huella(objeto, C.holgura));
  const propia = huella(caja.grupo), inicio = caja.grupo.position;
  const extension = { x0: propia.minX - inicio.x, x1: propia.maxX - inicio.x, z0: propia.minZ - inicio.z, z1: propia.maxZ - inicio.z };
  const piso = { minX: centro.x - medio.x + C.bordePiso, maxX: centro.x + medio.x - C.bordePiso, minZ: centro.z - medio.z + C.bordePiso, maxZ: centro.z + medio.z - C.bordePiso };
  const ultimaValida = inicio.clone();
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
  function restringirCaja() {
    // Se lee cada vez: al crear la entidad, IWSDK reemplaza el vector `position` del objeto.
    const enCaja = caja.grupo.position;
    enCaja.y = yCaja;
    dentroDelPiso(enCaja);
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      let movida = false;
      for (const o of obstaculos) {
        const e = empuje(enCaja, o);
        if (!e) continue;
        enCaja[e[1]] += e[0] * e[2];
        movida = true;
      }
      if (!movida) break;
      dentroDelPiso(enCaja);
    }
    // Si no hay lugar libre (encajonada entre el borde y un juguete), vuelve al último lugar válido.
    if (obstaculos.some(o => empuje(enCaja, o))) enCaja.copy(ultimaValida);
    else ultimaValida.copy(enCaja);
  }
  const estadoCaja = { sostenida: false, soltadaEn: -Infinity, movimientos: 0 };

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
  const tocables = [entidades.rings, entidades.xylophone, ...entidades.colores];
  // Elegir un color y mover la caja son gestos distintos: las crayolas responden al toque del índice y al
  // rayo, nunca al agarre; el cuerpo de la caja responde solo al agarre (pellizco o botón lateral), así un
  // toque sobre el cartón no la desplaza. Sin trasladar en altura ni girar: se desliza sobre el piso.
  const habilitarCaja = () => {
    if (entidadCaja.hasComponent(OneHandGrabbable)) return;
    entidadCaja.addComponent(OneHandGrabbable, { rotate: false, translate: true });
    caja.grupo.pointerEventsType = { allow: 'grab' };
    caja.crayolas.forEach(crayola => { crayola.pointerEventsType = { deny: 'grab' }; });
  };
  const interactuar = activo => {
    tocables.forEach(entidad => {
      for (const Componente of [RayInteractable, PokeInteractable]) {
        if (activo && !entidad.hasComponent(Componente)) entidad.addComponent(Componente);
        if (!activo && entidad.hasComponent(Componente)) entidad.removeComponent(Componente);
      }
    });
    if (activo) habilitarCaja();
    else if (entidadCaja.hasComponent(Grabbed)) world.getSystem(GrabSystem)?.forceRelease(entidadCaja);
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
    escena, props, pintura, hoja, crayon, halo, caja, entidades, estadoCaja,
    // Rectángulo del piso (m, en el espacio de `escena`): zona donde las manos toman el escenario.
    area: { ancho: espacio.ancho, fondo: espacio.fondo },
    // Metros por unidad del escenario original, incluida la escala elegida con las manos.
    get escala() { return s * escena.scale.x; },
    // Mientras se mueve la caja (y un instante después de soltarla) tocar una crayola no elige color.
    get cajaOcupada() { return estadoCaja.sostenida || performance.now() - estadoCaja.soltadaEn < C.pausaColor * 1000; },
    // Caja sostenida o soltada (lo avisa el sistema de la experiencia).
    sostenerCaja(activo) {
      if (activo === estadoCaja.sostenida) return;
      estadoCaja.sostenida = activo;
      if (activo) estadoCaja.movimientos += 1;
      else { estadoCaja.soltadaEn = performance.now(); restringirCaja(); }
    },
    color: app.Config.colors.green,
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
    update() {
      if (!escena.visible) return;
      actualizarRecorte();
      // La caja en la mano sigue al agarre solo sobre el piso: misma altura, dentro de él y sin montarse en nada.
      if (estadoCaja.sostenida || entidadCaja.hasComponent(Grabbed)) restringirCaja();
    },
    ocultar() { interactuar(false); escena.visible = false; }
  };
  return ninez;
}
