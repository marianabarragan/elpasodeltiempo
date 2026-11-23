import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, RayInteractable } from '@iwsdk/core';
import { Tocable } from '../../componentes.js';
import { AJUSTES } from '../../config.js';
import { cajaLocal, crearDedos } from './dedos.js';
import { crearAparatos } from './aparatos.js';
import { crearComputador } from './computador.js';
import { crearHoja } from './hoja.js';
import { crearTermo } from './termo.js';
import { crearCalendario } from './calendario.js';
import { crearBordeSombra, crearSombras } from '../sombras.js';

// Hitos de la adultez, sin orden entre sí; cada uno vale 20 %. 'vaso' es beber café con el termo.
export const HITOS_ADULTEZ = ['hoja', 'monitor', 'reloj', 'vaso', 'calendario'];
// Objetos que se apoyan en la mesa (miden el área que ocupa la escena) y objetos «de pared».
const ESCRITORIO = ['monitor', 'keyboard', 'clockDigital', 'coffeeThermos', 'plant', 'checklistPaper', 'pen'];
const PARED = ['floor', 'back-wall', 'left-wall', 'right-wall'];

/*
 * Lógica de la barra: la de la web (AdulthoodProgress, js/adulthood-progress.js) con sus animaciones y su
 * aviso al 100 %, pero repartida en los cinco hitos del escenario XR en lugar de lista 60 % + objetos.
 */
export function progresoAdultez() {
  const app = window.TimeExperience;
  return class ProgresoAdultez extends app.AdulthoodProgress {
    constructor(opciones) {
      super({ ...opciones, tasks: 0 });
      this.weights = new Map(HITOS_ADULTEZ.map(hito => [hito, 100 / HITOS_ADULTEZ.length]));
    }
  };
}

/*
 * Tamaño propio de cada objeto respecto de las manos (AJUSTES.adultez.objetos): cada uno crece desde su base
 * (los del escritorio no se despegan de él; el calendario, desde su centro) y se corre lo indicado para que
 * nada se cruce. Se actualizan las poses de reposo que dependen de su posición.
 */
function ajustarObjetos(props) {
  const { models } = props;
  props.group.updateMatrixWorld(true);
  Object.entries(AJUSTES.adultez.objetos).forEach(([nombre, { escala = 1, dx = 0, dz = 0 }]) => {
    const raiz = models[nombre]?.root;
    if (!raiz) return;
    const antes = new THREE.Box3().setFromObject(raiz), centroAntes = antes.getCenter(new THREE.Vector3());
    raiz.scale.multiplyScalar(escala);
    raiz.updateMatrixWorld(true);
    const despues = new THREE.Box3().setFromObject(raiz), centroDespues = despues.getCenter(new THREE.Vector3());
    const enPared = nombre === 'wallCalendar';
    raiz.position.x += centroAntes.x - centroDespues.x + dx;
    raiz.position.z += centroAntes.z - centroDespues.z + dz;
    raiz.position.y += enPared ? centroAntes.y - centroDespues.y : antes.min.y - despues.min.y;
    raiz.updateMatrixWorld(true);
  });
  props.pen.rest.position.copy(props.pen.root.position);
  props.paper.rest.position.copy(props.paper.root.position);
}

/*
 * Composición de la adultez de la web (AdulthoodProps.build en js/adulthood-props.js): modelos de Blender
 * en sus posiciones originales. En realidad mixta no hay habitación: se quitan piso y paredes, y la repisa
 * (que colgaba de la pared) queda suspendida detrás, como el calendario. Del escritorio queda su tablero de
 * madera (mesa.glb con su textura; si no cargara, el tablero provisional de la web, sin patas ni cajones).
 */
export function prepararAdultez() {
  const app = window.TimeExperience;
  const fuentes = Promise.all(['700 36px "DM Sans"', '600 48px "Caveat"'].map(f => document.fonts?.load(f))).catch(() => {});
  return Promise.all([new Promise(resolve => app.AdulthoodModels.whenSettled(resolve)), fuentes]).then(() => {
    const props = app.AdulthoodProps.build();
    const { room, desk } = props.models;
    // La repisa y sus libros están dentro de la habitación: se rescatan antes de quitarla.
    const repisa = new THREE.Group();
    repisa.name = 'repisa-suspendida';
    props.group.add(repisa);
    [...room.visual.children].filter(hijo => !PARED.includes(hijo.name) && hijo.position.y > props.deskTopY).forEach(hijo => repisa.attach(hijo));
    room.root.removeFromParent();
    const tablero = props.deskFit?.object ?? desk.visual.getObjectByName('desk-top');
    [...desk.visual.children].forEach(hijo => { if (hijo !== tablero) hijo.removeFromParent(); });
    tablero?.traverse(malla => { if (malla.isMesh) { malla.receiveShadow = true; malla.castShadow = true; } });
    ajustarObjetos(props);
    props.group.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    ESCRITORIO.forEach(nombre => caja.union(new THREE.Box3().setFromObject(props.models[nombre].root)));
    return { props, caja, repisa, escritorio: desk };
  });
}

/*
 * Escenario 2 sobre la mesa real: el escritorio de madera como base (como el piso de rompecabezas de la niñez)
 * con monitor, teclado, reloj, termo, planta, hoja con su lapicero, y la repisa y el calendario suspendidos
 * detrás. Todo cuelga de `escena`, que el usuario mueve, gira y escala con las dos manos (manipulacion.js).
 * Cinco interacciones sin orden: la lista de pendientes, escribir el correo en el computador (encenderlo con su
 * botón y pulsar el teclado), el botón del reloj, beber café del termo y desprender una hoja del calendario.
 */
export function crearAdultez(world, espacio, base, { sonido, hielo, teclado, cabeza, manos, alHito }) {
  const A = AJUSTES.adultez;
  const { props, caja: composicion, repisa, escritorio } = base;
  const { models } = props;

  // Escala para llenar el área útil de la mesa, dentro de límites cómodos para las manos.
  const { margen } = AJUSTES.mesa;
  const tam = composicion.getSize(new THREE.Vector3()), centro = composicion.getCenter(new THREE.Vector3());
  const s = THREE.MathUtils.clamp(Math.min((espacio.ancho - 2 * margen) / tam.x, (espacio.fondo - 2 * margen) / tam.z), A.escalaMin, A.escalaMax);

  // Escritorio: cubre la mesa elegida y, como mínimo, la composición con un margen; centrado en ella.
  // Su cara superior queda a la altura donde se apoyan los objetos (props.deskTopY) y su cara inferior,
  // sobre la mesa real. `medio` en unidades del escenario.
  const E = A.escritorio, grosor = E.grosor / s;
  const medio = {
    x: Math.max((espacio.ancho / 2 - margen) / s, tam.x / 2 + E.margen),
    z: Math.max((espacio.fondo / 2 - margen) / s, tam.z / 2 + E.margen)
  };
  props.group.updateMatrixWorld(true);
  const cajaTablero = new THREE.Box3().setFromObject(escritorio.root), tamTablero = cajaTablero.getSize(new THREE.Vector3());
  escritorio.root.scale.multiply(new THREE.Vector3(2 * medio.x / tamTablero.x, grosor / tamTablero.y, 2 * medio.z / tamTablero.z));
  escritorio.root.updateMatrixWorld(true);
  const ajustado = new THREE.Box3().setFromObject(escritorio.root), centroTablero = ajustado.getCenter(new THREE.Vector3());
  escritorio.root.position.add(new THREE.Vector3(centro.x - centroTablero.x, props.deskTopY - ajustado.max.y, centro.z - centroTablero.z));
  const limites = { minX: centro.x - medio.x, maxX: centro.x + medio.x, minZ: centro.z - medio.z, maxZ: centro.z + medio.z };
  const area = { ancho: 2 * medio.x * s, fondo: 2 * medio.z * s };

  // Repisa y calendario no pasan del borde trasero del escritorio.
  [repisa, models.wallCalendar.root].forEach(objeto => {
    const atras = new THREE.Box3().setFromObject(objeto).min.z;
    if (atras < limites.minZ) objeto.position.z += limites.minZ - atras;
  });
  // Barra y frase van sobre el monitor (al fondo y al centro, donde en otros escenarios no hay nada alto),
  // y la flecha adelante a la derecha, sobre el escritorio. Posiciones en metros, en el espacio de `escena`.
  const cajaMonitor = new THREE.Box3().setFromObject(models.monitor.root);
  const monitor = {
    x: ((cajaMonitor.min.x + cajaMonitor.max.x) / 2 - centro.x) * s,
    alto: (cajaMonitor.max.y - props.deskTopY) * s + E.grosor,
    z: ((cajaMonitor.min.z + cajaMonitor.max.z) / 2 - centro.z) * s
  };
  const paneles = {
    // La tarjeta de la frase (dos renglones) mide ~10 cm de alto: su borde inferior queda ~3 cm sobre el monitor.
    barra: [monitor.x, monitor.alto + .175, monitor.z],
    frase: [monitor.x, monitor.alto + .085, monitor.z + .02],
    flecha: [THREE.MathUtils.clamp(area.ancho * .36, .15, area.ancho / 2 - .08), E.grosor + .1, area.fondo * .2]
  };

  const escena = new THREE.Group();
  escena.name = 'escenario-adultez';
  escena.visible = false;
  escena.add(props.group);
  props.group.scale.setScalar(s);
  // La cara inferior del escritorio se apoya en la mesa real.
  props.group.position.set(-centro.x * s, -(props.deskTopY - grosor) * s + .001, -centro.z * s);
  // El escritorio se apoya en la mesa real con un borde de sombra suave alrededor (sin mapas de sombra).
  const bordeSombra = crearBordeSombra(area.ancho, area.fondo);
  bordeSombra.position.set(((limites.minX + limites.maxX) / 2 - centro.x) * s, .0005, ((limites.minZ + limites.maxZ) / 2 - centro.z) * s);
  escena.add(bordeSombra);
  const entidadEscena = world.createTransformEntity(escena, { parent: espacio.entidad });
  const entidadProps = world.createTransformEntity(props.group, { parent: entidadEscena });

  // Entidades: cada objeto interactivo es un Tocable; la narrativa decide qué hace cada id.
  const tocar = (item, id) => {
    const entidad = world.createTransformEntity(item.root, { parent: entidadProps });
    entidad.addComponent(Tocable, { id });
    return entidad;
  };
  const entidades = {
    lapicero: tocar(models.pen, 'adultez-lapicero'),
    vaso: tocar(models.coffeeThermos, 'adultez-vaso'),
    calendario: tocar(models.wallCalendar, 'adultez-calendario')
  };

  // Sombras de contacto sobre el escritorio de lo que se apoya en él (no de la repisa ni del calendario, que
  // están suspendidos, ni de la hoja, que es plana). Las del termo y el lapicero los siguen al tomarlos.
  const sombras = crearSombras(props.group, { superficie: () => props.deskTopY, metros: () => s * escena.scale.x });
  [models.plant, models.monitor, models.keyboard, models.clockDigital, models.coffeeThermos, models.pen]
    .filter(({ root }) => root.parent === props.group)
    .forEach(({ root }) => sombras.agregar(root));

  // Lo sostenido no atraviesa el escritorio: si su punto más bajo queda bajo la cara superior (estando
  // sobre el escritorio), sube lo necesario.
  const enGrupo = new THREE.Vector3(), cajaMundo = new THREE.Box3(), superficie = new THREE.Vector3(), escalaGrupo = new THREE.Vector3();
  function apoyar(raiz, visual) {
    props.group.updateWorldMatrix(true, false);
    raiz.updateWorldMatrix(true, true);
    cajaMundo.setFromObject(visual);
    props.group.worldToLocal(cajaMundo.getCenter(enGrupo));
    if (enGrupo.x < limites.minX || enGrupo.x > limites.maxX || enGrupo.z < limites.minZ || enGrupo.z > limites.maxZ) return;
    props.group.localToWorld(superficie.set(enGrupo.x, props.deskTopY, enGrupo.z));
    const falta = superficie.y - cajaMundo.min.y;
    if (falta > 0) raiz.position.y += falta / props.group.getWorldScale(escalaGrupo).y;
  }

  // Lugares que la hoja no puede invadir al deslizarla o ampliarla (unidades del escenario).
  const huella = objeto => { const b = cajaLocal(props.group, objeto); return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }; };
  const obstaculos = [models.monitor, models.keyboard, models.clockDigital, models.coffeeThermos, models.plant, models.pen].map(({ root }) => huella(root));

  const hechos = new Set();
  const hito = paso => { if (hechos.has(paso)) return; hechos.add(paso); alHito(paso); };
  const dedos = crearDedos(world);
  // Computador: monitor apagado al empezar, correo en la pantalla y teclado que se pulsa con los dedos. Su hito
  // ('monitor') llega al terminar el correo, no al encender el monitor.
  const computador = crearComputador({ props, manos, dedos, teclado, alHito: hito });
  const aparatos = crearAparatos({ props, sonido, alHito: hito, alPantalla: encendida => computador.pantalla(encendida) });
  // Metros por unidad del escritorio, incluida la escala que el usuario le dé al escenario con las manos.
  const escalaActual = () => s * escena.scale.x;
  const hoja = crearHoja({
    world, props, entidadLapicero: entidades.lapicero, escala: escalaActual, sonido, manos, limites, obstaculos, apoyar, alCompletar: () => hito('hoja')
  });
  const termo = crearTermo({
    world, manos, termo: models.coffeeThermos, entidad: entidades.vaso, hielo, sonido, cabeza, apoyar, alBeber: () => hito('vaso')
  });
  const calendario = crearCalendario({ calendario: props.calendar, dedos, sonido, alArrancar: () => hito('calendario') });

  // Aparición: el escritorio primero; después los objetos uno tras otro, la hoja y el lapicero al final.
  const objetos = [escritorio, models.plant, models.monitor, models.keyboard, models.clockDigital, models.coffeeThermos, { root: repisa }, models.wallCalendar, models.checklistPaper, models.pen];
  const escalas = new Map(objetos.map(({ root }) => [root, root.scale.clone()]));
  const estado = { habilitado: false };

  const habilitar = activo => {
    estado.habilitado = activo;
    if (activo) {
      hoja.habilitar();
      termo.habilitar();
      // El calendario es lo más lejano: si queda fuera del alcance, el rayo también lo desprende.
      if (!entidades.calendario.hasComponent(RayInteractable)) entidades.calendario.addComponent(RayInteractable);
    } else {
      hoja.deshabilitar();
      termo.deshabilitar();
      if (entidades.calendario.hasComponent(RayInteractable)) entidades.calendario.removeComponent(RayInteractable);
    }
  };
  // Manos que sostienen el lapicero o el termo.
  const manoDelTermo = () => (termo.estado.modo === 'envolvente' ? termo.estado.lado : termo.estado.modo ? world.getSystem(GrabSystem)?.getHolderHand(entidades.vaso) : null);

  return {
    escena, props, entidades, sombras, hechos, dedos, aparatos, computador, hoja, termo, calendario, estado, paneles, limites, area,
    get escala() { return escalaActual(); },
    // Altura de la cara superior del escritorio (m, en el espacio de `escena`): el contorno del escalado va sobre ella.
    superficie: E.grosor + .001,
    // Un gesto de dos manos es de la hoja (o el termo está en la mano): no se toma el escenario completo.
    get ocupado() { return hoja.manipulando || hoja.reclama() || termo.envuelto; },
    // La frase final espera a que se suelte el lapicero.
    get lista() { return !hoja.estado.sostenido; },
    manejadores: {
      'adultez-lapicero': { sostener: activo => hoja.sostener(activo) },
      'adultez-vaso': { sostener: activo => termo.sostener(activo) },
      'adultez-calendario': { presionar: () => calendario.arrancar('derecha') }
    },
    preparar() {
      objetos.forEach(({ root }) => root.scale.copy(escalas.get(root)).multiplyScalar(.0001));
      escena.visible = true;
    },
    revelar() {
      const { objetos: duracion, intervalo } = A.aparecer;
      return new Promise(resolve => {
        objetos.forEach(({ root }, i) => {
          const final = escalas.get(root), ultimo = i === objetos.length - 1;
          gsap.to(root.scale, {
            x: final.x, y: final.y, z: final.z, duration: duracion, delay: .3 + i * intervalo, ease: 'back.out(1.7)',
            onComplete: ultimo ? () => { habilitar(true); resolve(); } : undefined
          });
        });
      });
    },
    update(dt, enEscena) {
      if (!escena.visible) return;
      const activo = enEscena && estado.habilitado;
      dedos.actualizar();
      aparatos.actualizar(dedos.puntas, activo);
      computador.actualizar(dt, activo);
      const conLapicero = hoja.estado.sostenido ? hoja.agarre.estado.lado : null, conTermo = manoDelTermo();
      hoja.update(dt, activo, [conLapicero, conTermo].filter(Boolean));
      termo.update(dt, activo, [conLapicero].filter(Boolean));
      calendario.update(activo);
      sombras.actualizar();
      // El borde de sombra del escritorio aparece con él.
      const crecido = THREE.MathUtils.clamp(escritorio.root.scale.x / escalas.get(escritorio.root).x, 0, 1);
      bordeSombra.material.opacity = bordeSombra.userData.opacidad * crecido;
    },
    ocultar() {
      habilitar(false);
      hoja.detener();
      computador.detener();
      escena.visible = false;
    }
  };
}
