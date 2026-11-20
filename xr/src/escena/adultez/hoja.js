import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../../config.js';
import { PENDIENTES } from '../../textos.js';
import { crearAgarre } from '../agarre.js';
import { cajaLocal } from './dedos.js';

// Misma letra manuscrita que la lista de la web (js/checklist-system.js).
const MANO = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
const LADOS = ['left', 'right'];

// Parte un texto en renglones que caben en `ancho` píxeles.
function renglones(ctx, texto, ancho) {
  const lineas = [];
  texto.split(/\s+/).forEach(palabra => {
    const ultima = lineas[lineas.length - 1];
    if (ultima && ctx.measureText(`${ultima} ${palabra}`).width <= ancho) lineas[lineas.length - 1] = `${ultima} ${palabra}`;
    else lineas.push(palabra);
  });
  return lineas;
}

/*
 * Hoja de pendientes y lapicero (corregido tras las pruebas en Quest 3: la hoja ya no se levanta).
 * - La hoja permanece acostada sobre el escritorio. Un pellizco sobre ella la desliza por el escritorio (sin
 *   salirse de él ni montarse en otros objetos) y se queda donde se suelta; un pellizco de cada mano sobre
 *   ella la amplía o reduce de forma uniforme. Texto, casillas, título y marcas están en su textura, así que
 *   escalan con ella; el contacto se mide en su espacio local, así que sigue funcionando movida o escalada.
 * - El lapicero se toma con un pellizco (OneHandGrabbable de IWSDK, sin trasladar ni girar) y se coloca en la
 *   mano con la toma de escritura (perfil 'escritura' de agarre.js), igual con la mano derecha o la izquierda.
 *   Mientras se sostiene, la hoja emite una luz intermitente leve (el halo de bordes de la web).
 * - Tocar una casilla con la punta del lapicero dibuja el chulo (ChecklistSystem de la web), solo en orden de
 *   arriba hacia abajo. Las marcas se conservan al soltar el lapicero, mover o escalar la hoja o el escenario.
 * - Con las cuatro marcadas se suelta el lapicero, vuelve a su lugar y se avisa con `alCompletar`.
 */
// `escala()`: metros por unidad del escritorio en este momento (cambia si el usuario escala el escenario).
// `limites` y `obstaculos`: rectángulos en el espacio del grupo del escenario (unidades) para la hoja.
export function crearHoja({ world, props, entidadLapicero, escala, sonido, manos, limites, obstaculos, apoyar, alCompletar }) {
  const app = window.TimeExperience, A = AJUSTES.adultez.hoja;
  const { paper, pen } = props, grupo = props.group;
  const punta = pen.root.getObjectByName('pen-tip');
  const estado = { fase: 'mesa', habilitado: false, sostenido: false, terminando: false, ultimaFila: null, contacto: false, arrastres: 0, escalados: 0 };

  // La hoja de Blender trae sus textos como mallas; se ocultan y las tareas se escriben en la textura,
  // con la tinta de las casillas, para que digan exactamente PENDIENTES.tareas. El título se conserva.
  const textosModelo = [];
  paper.root.traverse(o => { if (/^Hoja_Texto/i.test(o.name)) textosModelo.push(o); });
  const tinta = paper.root.getObjectByName('paper-box-1')?.material?.color?.getStyle() ?? '#2b3854';

  let alTerminarLista = null;
  const checklist = new app.ChecklistSystem({
    title: PENDIENTES.titulo, tasks: PENDIENTES.tareas, aspect: paper.height / paper.width, sheet: paper.sheet,
    onCheck: indice => sonido.playEffect('list', indice + 1),
    onComplete: () => { alTerminarLista = gsap.delayedCall(A.pausaFinal, terminar); }
  });
  paper.material.map = checklist.texture;
  paper.material.emissiveMap = checklist.texture;
  paper.material.needsUpdate = true;

  // El papel de Blender solo usa parte de la textura (u ≈ 0,01–0,71) y la estira distinto a lo ancho que a lo
  // alto: el texto se limita a esa franja y se comprime en horizontal para que las letras conserven su forma.
  const uv = paper.mesh.geometry.attributes.uv;
  let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
  for (let i = 0; i < (uv?.count ?? 0); i++) {
    u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i));
    v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
  }
  function escribirTareas() {
    if (!paper.sheet || !uv) return; // la hoja provisional ya dibuja título y tareas
    textosModelo.forEach(o => { o.visible = false; });
    const W = checklist.width, H = checklist.height;
    const compresion = ((u1 - u0) * W / paper.width) / ((v1 - v0) * H / paper.height);
    const borde = u1 * W - .035 * W;
    const ctx = checklist.base.getContext('2d');
    ctx.fillStyle = tinta; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    checklist.rows.forEach((fila, i) => {
      const { x, y, size } = fila.box;
      const altoCasilla = (paper.sheet.boxes[i]?.hv ?? size / W / 2) * 2 * H;
      const tam = Math.round(altoCasilla * .95);
      ctx.font = `600 ${tam}px ${MANO}`;
      const izquierda = x + size * 1.55;
      renglones(ctx, fila.text, (borde - izquierda) / compresion).forEach((linea, k) => {
        ctx.save();
        ctx.translate(izquierda + (k ? size * .2 : 0), y + size / 2 + k * tam * 1.05);
        ctx.scale(compresion, 1);
        ctx.fillText(linea, 0, 0);
        ctx.restore();
      });
    });
    checklist.invalidate();
  }
  Promise.resolve(document.fonts?.load(`600 48px ${MANO}`)).catch(() => {}).then(escribirTareas);

  // ---------- Luz intermitente de la hoja ----------
  const halo = paper.glow;
  let pulso = null;
  function encenderBrillo() {
    if (pulso || checklist.complete) return;
    gsap.killTweensOf(halo.material);
    halo.visible = true;
    pulso = gsap.fromTo(halo.material, { opacity: A.brillo[0] }, { opacity: A.brillo[1], duration: A.pulso, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }
  function apagarBrillo() {
    pulso?.kill();
    pulso = null;
    if (!halo.visible) return;
    gsap.to(halo.material, { opacity: 0, duration: .25, overwrite: true, onComplete: () => { halo.visible = false; } });
  }

  // ---------- Lapicero en la mano (toma de escritura) ----------
  pen.root.updateMatrixWorld(true);
  const cuerpoLapicero = cajaLocal(pen.root, pen.visual ?? pen.root);
  const centroLapicero = new THREE.Vector3((cuerpoLapicero.min.x + cuerpoLapicero.max.x) / 2, pen.tip.y, pen.tip.z);
  const agarre = crearAgarre({
    world, manos, objeto: pen.root, perfil: 'escritura', ajustes: AJUSTES.adultez.lapicero.agarre,
    medida: { centro: centroLapicero, eje: new THREE.Vector3(1, 0, 0), lateral: new THREE.Vector3(0, 1, 0), largo: 2 * (pen.tip.x - centroLapicero.x) }
  });
  let regreso = null;
  function devolverLapicero() {
    regreso?.kill();
    const desde = pen.root.position.clone(), giroDesde = pen.root.quaternion.clone(), k = { v: 0 };
    regreso = gsap.to(k, {
      v: 1, duration: A.regresoLapicero, ease: 'power2.inOut',
      onUpdate: () => {
        pen.root.position.lerpVectors(desde, pen.rest.position, k.v).y += Math.sin(k.v * Math.PI) * .05 / escala();
        pen.root.quaternion.slerpQuaternions(giroDesde, pen.rest.quaternion, k.v);
      },
      onComplete: () => { regreso = null; }
    });
  }

  // Lista completa: se suelta el lapicero y vuelve a su lugar; la hoja se queda donde está, acostada.
  function terminar() {
    if (estado.terminando) return;
    estado.terminando = true;
    world.getSystem(GrabSystem)?.forceRelease(entidadLapicero);
    if (entidadLapicero.hasComponent(OneHandGrabbable)) entidadLapicero.removeComponent(OneHandGrabbable);
    estado.sostenido = false;
    agarre.soltar();
    apagarBrillo();
    devolverLapicero();
    estado.fase = 'completa';
    alCompletar();
  }

  // ---------- Contacto de la punta con la hoja ----------
  const p = new THREE.Vector3(), origen = new THREE.Vector3(), direccion = new THREE.Vector3(), rayo = new THREE.Raycaster();
  const enHoja = mundo => { paper.root.updateWorldMatrix(true, false); return paper.root.worldToLocal(p.copy(mundo)); };
  // Metros → unidades locales de la hoja (incluye su escala propia y la del escenario).
  const unidades = () => 1 / (escala() * paper.root.scale.x);
  // Casilla bajo la punta: se proyecta sobre el papel y se lee su coordenada de textura.
  function filaEn(local) {
    paper.root.localToWorld(origen.set(local.x, paper.surfaceTop + .5, local.z));
    direccion.set(0, -1, 0).transformDirection(paper.root.matrixWorld);
    rayo.set(origen, direccion);
    const golpe = rayo.intersectObject(paper.mesh, false)[0];
    if (!golpe?.uv) return null;
    const { x, y } = checklist.uvToCanvas(golpe.uv);
    return checklist.hit(x, y);
  }

  // ---------- Deslizar y escalar la hoja ----------
  const H = paper.root;
  const yHoja = H.position.y, base = H.scale.x;
  const ultimaValida = { posicion: H.position.clone(), escala: H.scale.x };
  // Huella de la hoja en el grupo (unidades) relativa a su posición, con su escala actual.
  function huella() {
    const b = cajaLocal(grupo, H);
    return { x0: b.min.x - H.position.x, x1: b.max.x - H.position.x, z0: b.min.z - H.position.z, z1: b.max.z - H.position.z };
  }
  // ¿La hoja con huella `e` en (x, z) cruza el obstáculo `o` (con holgura)?
  const cruza = (e, x, z, o) => !(x + e.x1 <= o.minX - A.holgura || x + e.x0 >= o.maxX + A.holgura || z + e.z1 <= o.minZ - A.holgura || z + e.z0 >= o.maxZ + A.holgura);
  // Lleva (x, z) dentro del escritorio; null si la hoja ya no cabe en él.
  function dentroDelEscritorio(e, x, z) {
    const h = A.holgura;
    if (limites.maxX - limites.minX - 2 * h < e.x1 - e.x0 || limites.maxZ - limites.minZ - 2 * h < e.z1 - e.z0) return null;
    return [THREE.MathUtils.clamp(x, limites.minX + h - e.x0, limites.maxX - h - e.x1), THREE.MathUtils.clamp(z, limites.minZ + h - e.z0, limites.maxZ - h - e.z1)];
  }
  const libre = (e, [x, z]) => !obstaculos.some(o => cruza(e, x, z, o));
  // Posiciones que dejan la hoja junto a cada lado de cada obstáculo que cruza (dentro del escritorio).
  function alrededor(e, [x, z]) {
    const h = A.holgura, salida = [];
    obstaculos.filter(o => cruza(e, x, z, o)).forEach(o => {
      [[o.maxX + h - e.x0, z], [o.minX - h - e.x1, z], [x, o.maxZ + h - e.z0], [x, o.minZ - h - e.z1]].forEach(([cx, cz]) => {
        const c = dentroDelEscritorio(e, cx, cz);
        if (c) salida.push(c);
      });
    });
    return salida;
  }
  /*
   * Acomoda la hoja acostada, dentro del escritorio y sin cruzar objetos: si donde la lleva la mano (o donde
   * crece al ampliarla) choca con algo, busca el lugar libre más cercano rodeando los obstáculos (dos niveles:
   * al ampliarla junto al teclado puede correrse hacia adelante, donde el escritorio está libre). Si no hay
   * ninguno, vuelve a la última posición y escala válidas.
   */
  function acomodar() {
    H.position.y = yHoja;
    const e = huella();
    const deseada = dentroDelEscritorio(e, H.position.x, H.position.z);
    let elegida = null;
    if (deseada) {
      if (libre(e, deseada)) elegida = deseada;
      else {
        const primeras = alrededor(e, deseada);
        const candidatas = [...primeras, ...primeras.filter(c => !libre(e, c)).flatMap(c => alrededor(e, c))].filter(c => libre(e, c));
        const d = c => (c[0] - deseada[0]) ** 2 + (c[1] - deseada[1]) ** 2;
        elegida = candidatas.reduce((mejor, c) => (!mejor || d(c) < d(mejor) ? c : mejor), null);
      }
    }
    if (!elegida) {
      H.position.copy(ultimaValida.posicion);
      H.scale.setScalar(ultimaValida.escala);
      return false;
    }
    H.position.x = elegida[0];
    H.position.z = elegida[1];
    ultimaValida.posicion.copy(H.position);
    ultimaValida.escala = H.scale.x;
    return true;
  }
  // Escala pedida por las manos; si en ese tamaño no cabe en el escritorio, crece lo más que el espacio permita.
  function escalarHoja(meta) {
    const probar = k => { H.position.copy(ultimaValida.posicion); H.scale.setScalar(k); return acomodar(); };
    if (probar(meta)) return;
    let cabe = ultimaValida.escala, no = meta;
    for (let i = 0; i < 6; i++) {
      const medio = (cabe + no) / 2;
      if (probar(medio)) cabe = medio; else no = medio;
    }
  }

  // Un pellizco cuenta sobre la hoja si su punto queda dentro del contorno (más un borde) y cerca de la superficie.
  function pinzaSobreHoja(mano) {
    const local = enHoja(mano.pinza), u = unidades();
    return Math.abs(local.x) <= paper.width / 2 + A.borde * u && Math.abs(local.z) <= paper.height / 2 + A.borde * u
      && local.y <= paper.surfaceTop + A.alcance * u && local.y >= -A.detras * u;
  }
  const pinzaEnGrupo = (mano, destino) => { grupo.updateWorldMatrix(true, false); return grupo.worldToLocal(destino.copy(mano.pinza)); };
  const previo = { left: false, right: false };
  const enGrupo = new THREE.Vector3();
  let gesto = null;

  function manipular(habilitado, ocupadas) {
    const empieza = {};
    LADOS.forEach(lado => { const ahora = manos[lado].pellizco; empieza[lado] = ahora && !previo[lado]; previo[lado] = ahora; });
    if (!habilitado) { gesto = null; return; }
    const disponible = lado => (manos[lado].seguida || manos[lado].control) && !ocupadas.includes(lado);
    if (gesto) {
      const { lado } = gesto;
      if (gesto.tipo === 'escala') {
        if (!manos.left.pellizco || !manos.right.pellizco) { gesto = null; return; }
        const d = manos.left.pinza.distanceTo(manos.right.pinza);
        escalarHoja(THREE.MathUtils.clamp(gesto.k0 * d / gesto.d0, base * A.escalaMin, base * A.escalaMax));
        return;
      }
      if (!manos[lado].pellizco) { gesto = null; return; }
      // Un segundo pellizco sobre la hoja convierte el deslizamiento en escalado.
      const otro = lado === 'left' ? 'right' : 'left';
      if (empieza[otro] && disponible(otro) && pinzaSobreHoja(manos[otro])) {
        gesto = { tipo: 'escala', d0: Math.max(.02, manos.left.pinza.distanceTo(manos.right.pinza)), k0: H.scale.x };
        estado.escalados += 1;
        return;
      }
      pinzaEnGrupo(manos[lado], enGrupo);
      H.position.x = enGrupo.x + gesto.desfase.x;
      H.position.z = enGrupo.z + gesto.desfase.z;
      acomodar();
      return;
    }
    // Empezar: los dos pellizcos a la vez sobre la hoja escalan; uno solo la desliza.
    const nuevos = LADOS.filter(lado => empieza[lado] && disponible(lado) && pinzaSobreHoja(manos[lado]));
    if (!nuevos.length) return;
    const ambos = LADOS.every(lado => manos[lado].pellizco && disponible(lado) && pinzaSobreHoja(manos[lado]));
    if (ambos) {
      gesto = { tipo: 'escala', d0: Math.max(.02, manos.left.pinza.distanceTo(manos.right.pinza)), k0: H.scale.x };
      estado.escalados += 1;
      return;
    }
    const lado = nuevos[0];
    pinzaEnGrupo(manos[lado], enGrupo);
    gesto = { tipo: 'arrastre', lado, desfase: { x: H.position.x - enGrupo.x, z: H.position.z - enGrupo.z } };
    estado.arrastres += 1;
  }

  return {
    estado, checklist, agarre,
    get completa() { return checklist.complete && estado.fase === 'completa'; },
    // La hoja siempre está sobre el escritorio (ya no se levanta).
    get enMesa() { return true; },
    get manipulando() { return !!gesto; },
    get gesto() { return gesto?.tipo ?? null; },
    // Los dos pellizcos están sobre la hoja: el gesto es de la hoja, no del escenario completo.
    reclama() { return LADOS.every(lado => manos[lado].pellizco && (manos[lado].seguida || manos[lado].control) && pinzaSobreHoja(manos[lado])); },
    habilitar() {
      estado.habilitado = true;
      if (!checklist.complete && !entidadLapicero.hasComponent(OneHandGrabbable)) entidadLapicero.addComponent(OneHandGrabbable, { rotate: false, translate: false });
    },
    deshabilitar() {
      estado.habilitado = false;
      gesto = null;
      world.getSystem(GrabSystem)?.forceRelease(entidadLapicero);
      if (entidadLapicero.hasComponent(OneHandGrabbable)) entidadLapicero.removeComponent(OneHandGrabbable);
    },
    sostener(activo) {
      if (activo) {
        if (!estado.habilitado || estado.terminando) return;
        estado.sostenido = true;
        regreso?.kill();
        regreso = null;
        agarre.tomar();
        encenderBrillo();
        return;
      }
      if (!estado.sostenido) return;
      estado.sostenido = false;
      agarre.soltar();
      if (estado.terminando) return;
      apagarBrillo();
      devolverLapicero();
    },
    // Centro de una casilla en el mundo (pruebas): índice 0–3.
    casillaEnMundo(indice) {
      const caja = new THREE.Box3().setFromObject(paper.root.getObjectByName(`paper-box-${indice + 1}`));
      return caja.getCenter(new THREE.Vector3());
    },
    // `ocupadas`: manos que sostienen el lapicero, el termo u otro objeto (no deslizan la hoja).
    update(dt, habilitado, ocupadas = []) {
      checklist.update();
      manipular(habilitado && estado.habilitado, ocupadas);
      if (!estado.sostenido || estado.terminando) { estado.contacto = false; estado.ultimaFila = null; return; }
      // El lapicero sigue la toma de escritura y no atraviesa el escritorio.
      agarre.update(dt, entidadLapicero);
      apoyar(pen.root, pen.visual ?? pen.root);
      if (!habilitado) { estado.contacto = false; estado.ultimaFila = null; return; }
      const local = enHoja(punta.getWorldPosition(new THREE.Vector3())).clone(), u = unidades();
      const enRectangulo = Math.abs(local.x) <= paper.width / 2 + A.margen * u && Math.abs(local.z) <= paper.height / 2 + A.margen * u;
      estado.contacto = enRectangulo && local.y <= paper.surfaceTop + A.delante * u && local.y >= paper.surfaceTop - A.detras * u;
      if (!estado.contacto) { estado.ultimaFila = null; return; }
      const fila = filaEn(local);
      // Cada casilla responde una vez por toque: marca si es la siguiente; si no, la pendiente parpadea.
      if (fila && fila !== estado.ultimaFila) checklist.mark(fila);
      estado.ultimaFila = fila;
    },
    detener() {
      alTerminarLista?.kill();
      apagarBrillo();
      gesto = null;
    }
  };
}
