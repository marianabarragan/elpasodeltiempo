import * as THREE from 'three';
import gsap from 'gsap';
import { Tocable } from '../../componentes.js';
import { AJUSTES } from '../../config.js';
import { crearVision } from './vision.js';
import { crearSombras } from '../sombras.js';
import { crearGafas } from './gafas.js';
import { crearMacetas } from './macetas.js';
import { crearRegadera } from './regadera.js';
import { crearCotidianos } from './cotidianos.js';
import { crearIndicadorRiego } from './indicador.js';
import { crearRadio, prepararPerillas } from './radio.js';
import { cajaLocal } from '../adultez/dedos.js';

/*
 * Composición de la vejez de la web (OldAgeProps.build en js/oldage-props.js): modelos de Blender o
 * sustitutos, en sus posiciones originales. Para realidad mixta se quita la habitación (piso y pared)
 * y de la ventana queda solo el marco. Cada objeto puede tener su propio tamaño respecto de las manos
 * (AJUSTES.vejez.objetos: crece desde su base, sin despegarse de la mesa) y las perillas de la radio pasan a
 * tener pivote propio. Se mide la caja de los objetos de la actividad para ajustarla a la mesa.
 */
export function prepararVejez() {
  const app = window.TimeExperience;
  return new Promise(resolve => app.OldAgeModels.whenSettled(resolve)).then(() => {
    const props = app.OldAgeProps.build();
    const { room, table } = props.models, ventana = props.curiosities.window;
    props.group.attach(ventana.root);
    ventana.visual.getObjectByName('window-view')?.removeFromParent();
    room.root.removeFromParent();
    // La mesa provisional (si la pintada no cargó) conserva solo su tablero: patas y faldón atravesarían la mesa real.
    if (!props.tableFit) [...table.visual.children].forEach(hijo => { if (!['table-top', 'center-placemat'].includes(hijo.name) && !hijo.geometry?.type?.startsWith('Torus')) hijo.removeFromParent(); });
    props.group.updateMatrixWorld(true);
    const porNombre = { ...props.interactive, ...props.curiosities };
    Object.entries(AJUSTES.vejez.objetos).forEach(([nombre, { escala = 1 }]) => {
      const raiz = porNombre[nombre]?.root;
      if (!raiz) return;
      const antes = new THREE.Box3().setFromObject(raiz), centroAntes = antes.getCenter(new THREE.Vector3());
      raiz.scale.multiplyScalar(escala);
      raiz.updateMatrixWorld(true);
      const despues = new THREE.Box3().setFromObject(raiz), centroDespues = despues.getCenter(new THREE.Vector3());
      raiz.position.x += centroAntes.x - centroDespues.x;
      raiz.position.z += centroAntes.z - centroDespues.z;
      raiz.position.y += antes.min.y - despues.min.y;
      raiz.updateMatrixWorld(true);
    });
    const perillas = prepararPerillas(props.curiosities.radio);
    props.group.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    const { glasses, pot1, pot2, wateringCan } = props.interactive, { radio, coffeeCup } = props.curiosities;
    [glasses, pot1, pot2, wateringCan, radio, coffeeCup].forEach(({ root }) => caja.union(new THREE.Box3().setFromObject(root)));
    const mantel = table.visual.getObjectByName('center-placemat');
    if (mantel) caja.union(new THREE.Box3().setFromObject(mantel));
    // Medidas en unidades del escenario, antes de escalarlo: marco de la ventana y grosor de la mesa pintada.
    const ventanaTam = new THREE.Box3().setFromObject(ventana.visual).getSize(new THREE.Vector3());
    const grosorMesa = props.tableFit ? new THREE.Box3().setFromObject(props.tableFit.object).getSize(new THREE.Vector3()).y || 1 : .5;
    return { props, caja, mantel, ventanaTam, grosorMesa, perillas };
  });
}

/*
 * Escenario 3 sobre la mesa real: mesa pintada recortada a su rectángulo, marco de ventana detrás, gafas,
 * dos macetas, regadera, radio y taza. Empieza con la vista deteriorada (vision.js: lo virtual desenfocado y un velo sobre toda la vista; solo
 * las gafas se ven nítidas);
 * el orden es el de OldAgeActivity (gafas → maceta → regadera → riego), y la taza (con el índice) o la radio
 * (girando una perilla) suman el hito «extra» después de las gafas.
 */
export async function crearVejez(world, espacio, base, { sonido, cabeza, manos, luz, alHito, alTerminarActividad }) {
  const app = window.TimeExperience, cfg = app.Config.oldage, A = AJUSTES.vejez;
  const { props, caja: composicion, mantel, ventanaTam: tamVentana, grosorMesa: grosor, perillas } = base;
  const { glasses, pot1, pot2, wateringCan } = props.interactive, { radio, coffeeCup, window: ventana } = props.curiosities;
  const { table } = props.models;

  // Escala para llenar el área útil de la mesa, con la mesa pintada a ras de la superficie real.
  const { margen } = AJUSTES.mesa;
  const tam = composicion.getSize(new THREE.Vector3()), centro = composicion.getCenter(new THREE.Vector3());
  const s = THREE.MathUtils.clamp(Math.min((espacio.ancho - 2 * margen) / tam.x, (espacio.fondo - 2 * margen) / tam.z), A.escalaMin, A.escalaMax);
  const escena = new THREE.Group();
  escena.name = 'escenario-vejez';
  escena.visible = false;
  escena.add(props.group);
  props.group.scale.setScalar(s);
  props.group.position.set(-centro.x * s, -props.tableTopY * s + .001, -centro.z * s);
  const entidadEscena = world.createTransformEntity(escena, { parent: espacio.entidad });
  const entidadProps = world.createTransformEntity(props.group, { parent: entidadEscena });

  // Mesa pintada: cubre la mesa real (y, como mínimo, la composición con un margen), muy delgada, y se recorta
  // a ese rectángulo. El recorte está en el espacio de `escena`: si el usuario mueve o escala el escenario, la
  // mesa pintada lo acompaña. `medio` en unidades del escenario.
  const borde = AJUSTES.mesa.margen * .5;
  const medio = {
    x: Math.max((espacio.ancho / 2 - borde) / s, tam.x / 2 + A.margenMesa),
    z: Math.max((espacio.fondo / 2 - borde) / s, tam.z / 2 + A.margenMesa)
  };
  const area = { ancho: 2 * medio.x * s, fondo: 2 * medio.z * s };
  const cubierta = props.tableFit?.object ?? table.visual.getObjectByName('table-top');
  if (props.tableFit) {
    const { width, depth } = props.tableFit;
    const k =Math.max(2 * medio.x / width, 2 * medio.z / depth) * A.cubrirMesa;
    cubierta.scale.set(k, A.grosorMesa / s / grosor, k);
    cubierta.position.set(centro.x, props.tableTopY, centro.z - depth * k / 2);
  } else if (cubierta) {
    cubierta.scale.y = A.grosorMesa / s / grosor;
    cubierta.position.set(centro.x, props.tableTopY - A.grosorMesa / s / 2, centro.z);
  }
  const local = [[1, 0, area.ancho / 2], [-1, 0, area.ancho / 2], [0, 1, area.fondo / 2], [0, -1, area.fondo / 2]]
    .map(([x, z, d]) => new THREE.Plane(new THREE.Vector3(-x, 0, -z), d));
  const planos = local.map(plano => plano.clone());
  const materialesMesa = new Set();
  table.visual.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => materialesMesa.add(m)); });
  materialesMesa.forEach(m => { m.clippingPlanes = planos; m.clipShadows = true; m.transparent = true; m.needsUpdate = true; });
  const actualizarRecorte = () => {
    escena.updateWorldMatrix(true, false);
    planos.forEach((plano, i) => plano.copy(local[i]).applyMatrix4(escena.matrixWorld));
  };

  // Marco de la ventana suspendido detrás de la composición, sin pared ni paisaje.
  ventana.root.scale.setScalar(A.ventana.escala);
  const anchoVentana = tamVentana.x * A.ventana.escala;
  ventana.root.position.set(
    THREE.MathUtils.clamp(ventana.root.position.x, composicion.min.x + anchoVentana / 2, composicion.max.x - anchoVentana / 2),
    props.tableTopY + A.ventana.sobreMesa + tamVentana.y * A.ventana.escala / 2,
    composicion.min.z - A.ventana.detras
  );
  ventana.root.rotation.set(0, 0, 0);
  // Barra de progreso y frase final por encima del marco de la ventana (no dentro ni detrás), y la flecha
  // adelante a la derecha. Posiciones en metros, en el espacio de `escena`.
  const cajaVentana = cajaLocal(escena, ventana.root);
  const sobreVentana = { x: (cajaVentana.min.x + cajaVentana.max.x) / 2, y: cajaVentana.max.y, z: cajaVentana.max.z + A.paneles.delante };
  const paneles = {
    barra: [sobreVentana.x, sobreVentana.y + A.paneles.barra, sobreVentana.z],
    frase: [sobreVentana.x, sobreVentana.y + A.paneles.frase, sobreVentana.z],
    flecha: [THREE.MathUtils.clamp(area.ancho * .4, .2, area.ancho / 2), .2, -area.fondo * .15]
  };

  // Entidades: cada objeto es un Tocable; la narrativa decide qué hace cada id.
  const tocar = (item, id) => {
    const entidad = world.createTransformEntity(item.root, { parent: entidadProps });
    entidad.addComponent(Tocable, { id });
    return entidad;
  };
  const entidades = {
    gafas: tocar(glasses, 'vejez-gafas'), pot1: tocar(pot1, 'vejez-pot1'), pot2: tocar(pot2, 'vejez-pot2'),
    regadera: tocar(wateringCan, 'vejez-regadera'), radio: tocar(radio, 'vejez-radio'), taza: tocar(coffeeCup, 'vejez-taza')
  };

  // Halos de la web (OldAgeScene.buildGlows).
  const halos = app.OldAgeScene.prototype.buildGlows.call({ props });
  // Sombras de contacto sobre la mesa pintada (no del marco de la ventana, que está suspendido).
  props.group.updateMatrixWorld(true);
  const techoMesa = Math.max(props.tableTopY, cubierta ? cajaLocal(props.group, cubierta).max.y : props.tableTopY);
  const sombras = crearSombras(props.group, { superficie: () => techoMesa, metros: () => s * escena.scale.x });
  [glasses, pot1, pot2, wateringCan, radio, coffeeCup].forEach(({ root }) => sombras.agregar(root));
  // Visión deteriorada (desenfoque de lo virtual y velo sobre toda la vista); las gafas quedan nítidas.
  const vision = crearVision(world, { raiz: escena, excluir: [glasses.root], luz });

  const actividad = new app.OldAgeActivity({ wateringSeconds: cfg.wateringSeconds });
  const hechos = new Set();
  const hito = paso => { hechos.add(paso); alHito(paso); };
  const indicador = await crearIndicadorRiego(world, espacio, { regadera: wateringCan, cabeza });
  // La taza responde al toque del índice; la radio se enciende girando una de sus perillas.
  const cotidianos = crearCotidianos({ objetos: { radio: props.radio, coffeeCup: props.coffeeCup }, entidades: { 'vejez-taza': entidades.taza }, sonido, alUsar: hito });
  const radioPerillas = crearRadio({
    world, manos, radio, perillas, sonido,
    // La respuesta de la web al encender (se mece, la antena oscila, suena y suma el hito «extra»).
    alEncender: () => app.OldAgeScene.prototype.poke.call({ props: { radio: props.radio }, audio: sonido, progress: { mark: paso => hito(paso) } }, 'radio')
  });
  const regadera = crearRegadera({
    world, regadera: props.wateringCan, entidad: entidades.regadera, grupo: props.group, actividad, sonido, indicador,
    maceta: () => props.pots[actividad.chosen], centro: props.center,
    alTerminar: { riego: () => hito('watering'), reposo: () => alTerminarActividad() }
  });
  const macetas = crearMacetas({
    world, macetas: { pot1, pot2 }, entidades: { pot1: entidades.pot1, pot2: entidades.pot2 }, destino: props.center, mantel, sonido,
    alColocar: id => { actividad.chosen = id; actividad.set('can'); hito('pot'); regadera.habilitar(); }
  });
  const gafas = crearGafas({
    world, gafas: props.glasses, grupo: props.group,
    // Con las gafas puestas la vista se aclara; después se habilitan las macetas, la taza y la radio.
    alPonerse: () => {
      actividad.set('wearing');
      gsap.to(vision, {
        nivel: 0, duration: A.vision.aclarar, ease: 'sine.inOut',
        onComplete: () => { hito('glasses'); actividad.set('choose'); macetas.habilitar(); cotidianos.habilitar(); radioPerillas.habilitar(); }
      });
    }
  });

  // Balanceo de las plantas con el agua (OldAgeScene.updateSway) y halos del paso siguiente (updateGlows).
  const hojas = {};
  Object.entries(props.pots).forEach(([id, { plant }]) => {
    hojas[id] = [];
    plant.visual.traverse(o => { if (o.userData.leaf) hojas[id].push({ object: o, base: o.rotation.clone(), phase: Math.random() * 6 }); });
  });
  const balanceo = { amount: 0, target: 0, time: 0 };
  const prestado = { sway: balanceo, props, activity: actividad, leaves: hojas };
  let tiempo = 0;
  const actualizarHalos = dt => {
    const siguientes = actividad.complete && !hechos.has('extra') ? ['radio', 'coffeeCup'] : actividad.glowing;
    const pulso = .5 + .5 * Math.sin(tiempo * 2.4);
    Object.entries(halos).forEach(([id, halo]) => {
      halo.value += ((siguientes.includes(id) ? 1 : 0) - halo.value) * (1 - Math.exp(-5 * dt));
      halo.material.uniforms.uOpacity.value = halo.value * (.28 + .55 * pulso);
    });
  };

  // Aparición: la mesa se funde, luego el marco y los objetos crecen uno tras otro; las gafas al final.
  const objetos = [ventana, pot1, pot2, wateringCan, radio, coffeeCup, glasses];
  const escalas = new Map(objetos.map(({ root }) => [root, root.scale.clone()]));
  const opacidades = new Map([...materialesMesa].map(m => [m, m.opacity]));

  const vejez = {
    escena, props, actividad, gafas, macetas, regadera, cotidianos, radio: radioPerillas, vision, sombras, indicador, entidades, hechos, paneles,
    // Metros por unidad del escenario, incluida la escala que el usuario le dé con las manos.
    get escala() { return s * escena.scale.x; },
    // Altura de la mesa pintada (m, en el espacio de `escena`): el contorno del escalado va sobre ella.
    superficie: (techoMesa - props.tableTopY) * s + .001,
    // Área de la mesa pintada (m, en el espacio de `escena`): zona donde las manos toman el escenario.
    area,
    get completa() { return actividad.complete; },
    // Girando una perilla, el pellizco es de la radio: no se toma el escenario completo.
    get ocupado() { return radioPerillas.girando; },
    manejadores: {
      'vejez-pot1': { senalar: activo => macetas.senalar('pot1', activo), sostener: activo => macetas.sostener('pot1', activo) },
      'vejez-pot2': { senalar: activo => macetas.senalar('pot2', activo), sostener: activo => macetas.sostener('pot2', activo) },
      'vejez-regadera': { senalar: activo => regadera.senalar(activo), sostener: activo => regadera.sostener(activo) },
      'vejez-taza': { senalar: activo => cotidianos.senalar('vejez-taza', activo), presionar: () => cotidianos.presionar('vejez-taza') }
    },
    preparar() {
      vision.nivel = gafas.estado.modo === 'puestas' ? 0 : 1;
      objetos.forEach(({ root }) => root.scale.copy(escalas.get(root)).multiplyScalar(.0001));
      materialesMesa.forEach(m => { m.opacity = 0; });
      actualizarRecorte();
      escena.visible = true;
    },
    revelar() {
      const { mesa, objetos: tObjetos, intervalo } = A.aparecer;
      materialesMesa.forEach(m => gsap.to(m, { opacity: opacidades.get(m), duration: mesa, ease: 'sine.inOut' }));
      return new Promise(resolve => {
        objetos.forEach(({ root }, i) => {
          const final = escalas.get(root), ultimo = i === objetos.length - 1;
          gsap.to(root.scale, {
            x: final.x, y: final.y, z: final.z, duration: tObjetos, delay: mesa * .6 + i * intervalo + (ultimo ? .25 : 0), ease: 'back.out(1.7)',
            onComplete: ultimo ? () => { if (gafas.estado.modo !== 'puestas') gafas.habilitar(); resolve(); } : undefined
          });
        });
      });
    },
    update(dt, enEscena = true) {
      if (!escena.visible) return;
      tiempo += dt;
      actualizarRecorte();
      sombras.actualizar();
      gafas.update(dt);
      macetas.update();
      regadera.update(dt);
      radioPerillas.update(dt, enEscena);
      balanceo.target = actividad.pouring ? 1 : 0;
      app.OldAgeScene.prototype.updateSway.call(prestado, dt);
      actualizarHalos(dt);
    },
    ocultar() {
      macetas.deshabilitar();
      cotidianos.deshabilitar();
      radioPerillas.deshabilitar();
      regadera.detener();
      indicador.ocultar();
      escena.visible = false;
      vision.actualizar(0, false);
    }
  };
  return vejez;
}
