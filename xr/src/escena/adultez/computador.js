import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../../config.js';

// Piezas sueltas de una malla (triángulos unidos por vértices que coinciden), con su caja en el espacio de la malla.
function piezasSueltas(malla) {
  const g = malla.geometry, pos = g.attributes.position;
  const indices = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const clave = i => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const padre = new Map();
  const raiz = k => { while (padre.get(k) !== k) { padre.set(k, padre.get(padre.get(k))); k = padre.get(k); } return k; };
  for (let i = 0; i < pos.count; i++) { const k = clave(i); if (!padre.has(k)) padre.set(k, k); }
  for (let t = 0; t < indices.length; t += 3) {
    const a = raiz(clave(indices[t]));
    [indices[t + 1], indices[t + 2]].forEach(j => { const b = raiz(clave(j)); if (a !== b) padre.set(b, a); });
  }
  const grupos = new Map(), v = new THREE.Vector3();
  for (let t = 0; t < indices.length; t += 3) {
    const r = raiz(clave(indices[t]));
    if (!grupos.has(r)) grupos.set(r, { malla, vertices: new Set(), caja: new THREE.Box3() });
    const grupo = grupos.get(r);
    for (let k = 0; k < 3; k++) { grupo.vertices.add(indices[t + k]); grupo.caja.expandByPoint(v.fromBufferAttribute(pos, indices[t + k])); }
  }
  return [...grupos.values()];
}

// ---------- Dibujo del correo (lienzo) ----------
// Composición de las imágenes de referencia (barra superior, menú lateral, ventana de redacción con destinatario,
// asunto, cuerpo y barra inferior), en unidades del boceto (676 de ancho) que se escalan al lienzo. Sin el logo ni
// la identidad de una marca real: un sobre del proyecto en su lugar.
const COLOR = {
  fondo: '#f6f8fc', busqueda: '#e9eef6', barra: '#c9ced6', barraClara: '#d9dde3', linea: '#e6e8ec', icono: '#6b7078',
  pastilla: '#d3e3fd', encabezado: '#66758f', titulo: '#a9b3c4', ventana: '#ffffff', enviar: '#3a6fdc', enviarBorde: '#2f5cbc',
  avatar: '#a9c8b8', sobre: '#fff7e8', sobreBorde: '#b28b4d', texto: '#3d3f44'
};
function redondeado(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
function dibujarInterfaz(ctx, W, H) {
  const s = W / 676, X = v => v * s, n = H / s; // `n`: alto del lienzo en unidades del boceto
  const pastilla = (x, y, w, h, color) => { ctx.fillStyle = color; redondeado(ctx, X(x), X(y), X(w), X(h), X(h) / 2); ctx.fill(); };
  const trazo = (ancho = 1.6) => { ctx.strokeStyle = COLOR.icono; ctx.lineWidth = X(ancho); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
  ctx.fillStyle = COLOR.fondo; ctx.fillRect(0, 0, W, H);
  // Sobre (en lugar de un logo de marca).
  ctx.fillStyle = COLOR.sobre; ctx.strokeStyle = COLOR.sobreBorde; ctx.lineWidth = X(2.2); ctx.lineJoin = 'round';
  redondeado(ctx, X(17), X(14), X(32), X(22), X(3)); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(18.5), X(16)); ctx.lineTo(X(33), X(27)); ctx.lineTo(X(47.5), X(16)); ctx.stroke();
  // Barra de búsqueda.
  pastilla(110, 8, 413, 29, COLOR.busqueda);
  trazo(); ctx.beginPath(); ctx.arc(X(127), X(21), X(4.5), 0, Math.PI * 2); ctx.moveTo(X(130.5), X(24.5)); ctx.lineTo(X(134), X(28)); ctx.stroke();
  pastilla(147, 18.5, 165, 7, COLOR.barra);
  [[16], [22], [28]].forEach(([y], i) => { ctx.beginPath(); ctx.moveTo(X(498), X(y - 1.5)); ctx.lineTo(X(512), X(y - 1.5)); ctx.stroke(); ctx.beginPath(); ctx.arc(X([502, 509, 504][i]), X(y - 1.5), X(1.6), 0, Math.PI * 2); ctx.fillStyle = COLOR.fondo; ctx.fill(); ctx.stroke(); });
  // Íconos de la derecha: ayuda, ajustes, aplicaciones y perfil.
  trazo(1.4);
  ctx.beginPath(); ctx.arc(X(576), X(23), X(6.5), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(576), X(21.5), X(2.2), Math.PI, Math.PI * 2.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(601), X(23), X(6.2), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(601), X(23), X(2.4), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLOR.icono;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(X(621 + i * 5), X(18 + j * 5), X(1.3), 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = COLOR.avatar; ctx.beginPath(); ctx.arc(X(654), X(23), X(10), 0, Math.PI * 2); ctx.fill();
  // Menú lateral: botón de redactar y secciones (la primera destacada).
  pastilla(6, 50, 92, 35, COLOR.pastilla);
  trazo(1.6); ctx.beginPath(); ctx.moveTo(X(21), X(73)); ctx.lineTo(X(30), X(64)); ctx.lineTo(X(33), X(67)); ctx.lineTo(X(24), X(76)); ctx.lineTo(X(20.5), X(76.5)); ctx.closePath(); ctx.stroke();
  pastilla(42, 65, 44, 6, '#7aa1e8');
  pastilla(6, 98, 92, 20, COLOR.pastilla);
  [108, 130, 152, 174, 196].forEach((y, i) => {
    trazo(1.3);
    ctx.beginPath();
    if (i === 0) { redondeado(ctx, X(18.5), X(y - 4.5), X(10), X(9), X(1.5)); }
    else if (i === 1) { for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; ctx.lineTo(X(23.5 + Math.cos(a) * 5), X(y + Math.sin(a) * 5)); const b = a + Math.PI / 5; ctx.lineTo(X(23.5 + Math.cos(b) * 2.2), X(y + Math.sin(b) * 2.2)); } ctx.closePath(); }
    else if (i === 2) { ctx.arc(X(23.5), X(y), X(5), 0, Math.PI * 2); ctx.moveTo(X(23.5), X(y - 2.5)); ctx.lineTo(X(23.5), X(y)); ctx.lineTo(X(26), X(y + 1.5)); }
    else if (i === 3) { ctx.moveTo(X(19), X(y - 4.5)); ctx.lineTo(X(28.5), X(y)); ctx.lineTo(X(19), X(y + 4.5)); ctx.lineTo(X(21), X(y)); ctx.closePath(); }
    else { ctx.moveTo(X(20), X(y - 5)); ctx.lineTo(X(25), X(y - 5)); ctx.lineTo(X(28), X(y - 2)); ctx.lineTo(X(28), X(y + 5)); ctx.lineTo(X(20), X(y + 5)); ctx.closePath(); }
    ctx.stroke();
    pastilla(37, y - 3, i === 0 ? 42 : 34, 6, i === 0 ? '#7aa1e8' : COLOR.barraClara);
  });
  trazo(1.3); ctx.beginPath(); ctx.moveTo(X(20), X(216)); ctx.lineTo(X(23.5), X(219.5)); ctx.lineTo(X(27), X(216)); ctx.stroke();
  // Ventana de redacción: ocupa hasta el borde inferior de la pantalla.
  const v = { x: 122, y: 52, w: 512, h: n - 52 - 6 };
  ctx.save(); ctx.shadowColor = 'rgba(60,64,67,.18)'; ctx.shadowBlur = X(6); ctx.shadowOffsetY = X(2);
  ctx.fillStyle = COLOR.ventana; redondeado(ctx, X(v.x), X(v.y), X(v.w), X(v.h), X(7)); ctx.fill(); ctx.restore();
  ctx.save(); redondeado(ctx, X(v.x), X(v.y), X(v.w), X(v.h), X(7)); ctx.clip();
  ctx.fillStyle = COLOR.encabezado; ctx.fillRect(X(v.x), X(v.y), X(v.w), X(32));
  ctx.restore();
  pastilla(v.x + 13, v.y + 12, 106, 8, COLOR.titulo);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = X(1.6); ctx.lineCap = 'round';
  const ix = v.x + v.w;
  ctx.beginPath(); ctx.moveTo(X(ix - 76), X(v.y + 21)); ctx.lineTo(X(ix - 68), X(v.y + 21)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(ix - 52), X(v.y + 21)); ctx.lineTo(X(ix - 44), X(v.y + 13)); ctx.moveTo(X(ix - 49), X(v.y + 13)); ctx.lineTo(X(ix - 44), X(v.y + 13)); ctx.lineTo(X(ix - 44), X(v.y + 18));
  ctx.moveTo(X(ix - 52), X(v.y + 16)); ctx.lineTo(X(ix - 52), X(v.y + 21)); ctx.lineTo(X(ix - 47), X(v.y + 21)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(ix - 25), X(v.y + 12)); ctx.lineTo(X(ix - 17), X(v.y + 20)); ctx.moveTo(X(ix - 17), X(v.y + 12)); ctx.lineTo(X(ix - 25), X(v.y + 20)); ctx.stroke();
  // Destinatario y asunto.
  trazo(1.3);
  ctx.fillStyle = COLOR.icono; ctx.beginPath(); ctx.arc(X(v.x + 20), X(v.y + 45), X(2.6), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(X(v.x + 20), X(v.y + 53), X(4.6), Math.PI, Math.PI * 2); ctx.fill();
  pastilla(v.x + 38, v.y + 45, 167, 7, COLOR.barraClara);
  ctx.fillStyle = COLOR.linea; ctx.fillRect(X(v.x + 13), X(v.y + 63), X(v.w - 26), X(1));
  ctx.beginPath(); ctx.moveTo(X(v.x + 16), X(v.y + 76)); ctx.lineTo(X(v.x + 21), X(v.y + 76)); ctx.lineTo(X(v.x + 25), X(v.y + 81)); ctx.lineTo(X(v.x + 21), X(v.y + 86)); ctx.lineTo(X(v.x + 16), X(v.y + 86)); ctx.closePath(); ctx.stroke();
  pastilla(v.x + 38, v.y + 78, 177, 7, COLOR.barraClara);
  ctx.fillStyle = COLOR.linea; ctx.fillRect(X(v.x + 13), X(v.y + 97), X(v.w - 26), X(1));
  // Barra inferior: botón de enviar e íconos de formato, adjuntar, enlace, emoji, unidad, imagen, más y papelera.
  const by = v.y + v.h - 35;
  ctx.fillStyle = COLOR.linea; ctx.fillRect(X(v.x + 13), X(by - 9), X(v.w - 26), X(1));
  pastilla(v.x + 14, by, 86, 27, COLOR.enviar);
  ctx.fillStyle = COLOR.enviarBorde; ctx.fillRect(X(v.x + 76), X(by + 4), X(1.2), X(19));
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(X(v.x + 24), X(by + 8)); ctx.lineTo(X(v.x + 37), X(by + 13.5)); ctx.lineTo(X(v.x + 24), X(by + 19)); ctx.lineTo(X(v.x + 27), X(by + 13.5)); ctx.closePath(); ctx.fill();
  ctx.font = `600 ${X(9.5)}px "DM Sans", sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText('Enviar', X(v.x + 41), X(by + 14));
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = X(1.4); ctx.beginPath(); ctx.moveTo(X(v.x + 84), X(by + 12)); ctx.lineTo(X(v.x + 87.5), X(by + 15.5)); ctx.lineTo(X(v.x + 91), X(by + 12)); ctx.stroke();
  trazo(1.4);
  const c = by + 13.5;
  ctx.beginPath(); ctx.moveTo(X(v.x + 118), X(c + 4)); ctx.lineTo(X(v.x + 122), X(c - 6)); ctx.lineTo(X(v.x + 126), X(c + 4)); ctx.moveTo(X(v.x + 119.5), X(c)); ctx.lineTo(X(v.x + 124.5), X(c)); ctx.moveTo(X(v.x + 116), X(c + 7)); ctx.lineTo(X(v.x + 128), X(c + 7)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(v.x + 152), X(c + 5)); ctx.lineTo(X(v.x + 152), X(c - 3)); ctx.arc(X(v.x + 154.5), X(c - 3), X(2.5), Math.PI, 0); ctx.lineTo(X(v.x + 157), X(c + 4)); ctx.arc(X(v.x + 154), X(c + 4), X(3), 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(v.x + 180), X(c), X(3), Math.PI / 2, Math.PI * 1.5); ctx.lineTo(X(v.x + 184), X(c - 3)); ctx.moveTo(X(v.x + 184), X(c + 3)); ctx.lineTo(X(v.x + 180), X(c + 3)); ctx.moveTo(X(v.x + 183), X(c)); ctx.lineTo(X(v.x + 189), X(c)); ctx.moveTo(X(v.x + 188), X(c - 3)); ctx.arc(X(v.x + 191), X(c), X(3), -Math.PI / 2, Math.PI / 2); ctx.lineTo(X(v.x + 188), X(c + 3)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(v.x + 214), X(c), X(6), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(v.x + 214), X(c + 1), X(3), .2, Math.PI - .2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(v.x + 240), X(c + 5)); ctx.lineTo(X(v.x + 245), X(c - 5)); ctx.lineTo(X(v.x + 250), X(c + 5)); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); redondeado(ctx, X(v.x + 271), X(c - 5.5), X(12), X(11), X(1.5)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(v.x + 272), X(c + 4)); ctx.lineTo(X(v.x + 276), X(c)); ctx.lineTo(X(v.x + 279), X(c + 3)); ctx.lineTo(X(v.x + 282), X(c)); ctx.stroke();
  ctx.fillStyle = COLOR.icono; [-4, 0, 4].forEach(d => { ctx.beginPath(); ctx.arc(X(v.x + 307), X(c + d), X(1.2), 0, Math.PI * 2); ctx.fill(); });
  ctx.beginPath(); ctx.moveTo(X(ix - 26), X(c - 4)); ctx.lineTo(X(ix - 16), X(c - 4)); ctx.moveTo(X(ix - 24.5), X(c - 4)); ctx.lineTo(X(ix - 23.5), X(c + 6)); ctx.lineTo(X(ix - 18.5), X(c + 6)); ctx.lineTo(X(ix - 17.5), X(c - 4)); ctx.moveTo(X(ix - 23), X(c - 4)); ctx.lineTo(X(ix - 22), X(c - 6)); ctx.lineTo(X(ix - 20), X(c - 6)); ctx.lineTo(X(ix - 19), X(c - 4)); ctx.stroke();
  // Cuerpo del mensaje (en unidades del boceto): donde se escribe.
  return { x: v.x + 13, y: v.y + 104, w: v.w - 26, h: by - 9 - (v.y + 104) - 4, escala: s };
}

/*
 * Computador de la adultez: monitor con su botón, correo en la pantalla y teclado que se pulsa con los dedos.
 *
 * - El monitor empieza apagado (pantalla negra). Su botón (aparatos.js) lo enciende y lo apaga; encendido muestra
 *   de inmediato el correo, sin pasar por el escritorio anterior. Apagarlo no borra lo escrito.
 * - El correo se dibuja en dos planos delante de la pantalla (hijos de ella: acompañan al escenario al moverlo o
 *   escalarlo): la interfaz fija, dibujada una vez, y el cuerpo del mensaje, un lienzo pequeño que solo se vuelve a
 *   dibujar mientras crece un renglón.
 * - El teclado del modelo de Blender tiene cada tecla como pieza suelta: se identifican y cada una se hunde por su
 *   cuenta desde el sombreador (un dibujo para todas). Una tecla se pulsa cuando la yema de un dedo (cualquiera)
 *   llega desde arriba a su cara; queda hundida mientras el dedo la toca y vuelve al soltarla. Cada dedo debe subir
 *   de nuevo antes de otra pulsación: pasar la mano sobre las teclas o dejar el dedo apoyado no repite pulsaciones.
 * - Con el monitor encendido, cada pulsación alarga los renglones grises del cuerpo: las primeras
 *   `primerRenglon` el primero (más corto) y las demás el segundo (más largo). Con la pulsación `pulsaciones` los
 *   renglones se desvanecen y aparece «Correo recibido. Muchas gracias.»; solo entonces se suma el hito del
 *   computador ('monitor'), una vez.
 * Todo se mide en el espacio de las mallas, así funciona igual con el escenario movido, girado o escalado.
 */
export function crearComputador({ props, manos, dedos, teclado: sonidoTeclado, alHito }) {
  const C = AJUSTES.adultez.computador, T = C.tecla;
  const estado = { encendido: false, pulsaciones: 0, completo: false, terminando: false, teclasPulsadas: 0 };

  // ---------- Teclas ----------
  const visual = props.models.keyboard.visual;
  visual.updateMatrixWorld(true);
  const piezas = [];
  visual.traverse(malla => { if (malla.isMesh) piezas.push(...piezasSueltas(malla)); });
  const area = p => { const s = p.caja.getSize(new THREE.Vector3()); return s.x * s.z; };
  const cuerpo = piezas.reduce((a, b) => (area(b) > area(a) ? b : a), piezas[0]);
  const teclas = piezas.filter(p => p !== cuerpo && area(p) < area(cuerpo) * .2).map((p, indice) => ({
    ...p, indice, centro: p.caja.getCenter(new THREE.Vector3()), hundido: 0, objetivo: 0, ultimo: -Infinity, dedos: 0
  }));
  const N = Math.max(1, teclas.length);
  const uniforme = { value: new Float32Array(N) };
  const mallas = new Map();
  teclas.forEach(t => { if (!mallas.has(t.malla)) mallas.set(t.malla, []); mallas.get(t.malla).push(t); });
  mallas.forEach((lista, malla) => {
    const pos = malla.geometry.attributes.position, atributo = new Float32Array(pos.count).fill(-1);
    lista.forEach(t => t.vertices.forEach(i => { atributo[i] = t.indice; }));
    malla.geometry.setAttribute('aTecla', new THREE.BufferAttribute(atributo, 1));
    const material = malla.material.clone();
    material.onBeforeCompile = shader => {
      shader.uniforms.uHundir = uniforme;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aTecla;\nuniform float uHundir[${N}];`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aTecla > -.5) transformed.y -= uHundir[int(aTecla + .5)];');
    };
    material.customProgramCacheKey = () => `teclado-${N}`;
    malla.material = material;
  });

  const inversa = new THREE.Matrix4(), local = new THREE.Vector3(), escala = new THREE.Vector3();
  const estadosDedo = new Map();
  let cuadro = 0;
  const radioDe = punta => (manos?.[punta.lado]?.conRadios ? manos[punta.lado].radios.get(punta.dedo) : 0) || .008;

  function pulsar(tecla) {
    const ahora = performance.now();
    if (ahora - tecla.ultimo < T.pausa * 1000) return;
    tecla.ultimo = ahora;
    estado.teclasPulsadas += 1;
    sonidoTeclado?.tecla(.6 + Math.random() * .35);
    if (estado.encendido && !estado.terminando && !estado.completo) escribir();
  }

  // Cada yema: ¿sobre qué tecla está y a qué altura de su cara? Pulsa al llegar desde arriba (armada) y se rearma
  // al subir más de `rearme` m sobre las teclas.
  function revisarTeclas(habilitado) {
    cuadro += 1;
    teclas.forEach(t => { t.dedos = 0; });
    if (habilitado && teclas.length) {
      for (const malla of mallas.keys()) malla.updateWorldMatrix(true, false);
      for (const punta of dedos.puntas) {
        const clave = `${punta.lado}-${punta.dedo}`;
        const e = estadosDedo.get(clave) ?? { armado: false, tecla: null, visto: 0 };
        estadosDedo.set(clave, e);
        e.visto = cuadro;
        const r = radioDe(punta);
        let encima = null, altura = Infinity;
        for (const [malla, lista] of mallas) {
          malla.getWorldScale(escala);
          const k = escala.x || 1;
          inversa.copy(malla.matrixWorld).invert();
          local.copy(punta.posicion).applyMatrix4(inversa);
          const margen = T.margen / k;
          for (const t of lista) {
            const h = (local.y - t.caja.max.y) * k - r;
            // Altura sobre las teclas (aunque no esté encima de una): para rearmar el dedo.
            if (h < altura && Math.abs(local.x - t.centro.x) <= (t.caja.max.x - t.caja.min.x) / 2 + margen * 6 && Math.abs(local.z - t.centro.z) <= (t.caja.max.z - t.caja.min.z) / 2 + margen * 6) altura = h;
            if (local.x < t.caja.min.x - margen || local.x > t.caja.max.x + margen || local.z < t.caja.min.z - margen || local.z > t.caja.max.z + margen) continue;
            if (!encima || h < encima.h) encima = { tecla: t, h };
          }
        }
        if (e.tecla) {
          // Sigue apoyado en su tecla mientras no suba ni se salga de ella.
          if (encima?.tecla === e.tecla && encima.h <= T.rearme) { e.tecla.dedos += 1; continue; }
          e.tecla = null;
        }
        if (altura > T.rearme) e.armado = true;
        // Solo cuenta si la yema llega a la cara de la tecla (no si aparece metida en el teclado, p. ej. al moverlo).
        if (e.armado && encima && encima.h <= T.contacto && encima.h >= -T.profundo) {
          e.armado = false;
          e.tecla = encima.tecla;
          e.tecla.dedos += 1;
          pulsar(e.tecla);
        }
      }
    }
    // Dedos que dejaron de verse (seguimiento perdido): sueltan su tecla.
    estadosDedo.forEach((e, clave) => { if (e.visto !== cuadro) estadosDedo.delete(clave); });
  }

  // Hundimiento de cada tecla: baja rápido mientras un dedo la toca y vuelve suave al soltarla.
  function animarTeclas(dt) {
    let k = 1;
    for (const malla of mallas.keys()) { malla.getWorldScale(escala); k = escala.y || 1; break; }
    const bajar = 1 - Math.exp(-45 * dt), subir = 1 - Math.exp(-16 * dt);
    teclas.forEach(t => {
      t.objetivo = t.dedos > 0 ? T.hundir : 0;
      t.hundido += (t.objetivo - t.hundido) * (t.objetivo > t.hundido ? bajar : subir);
      if (t.hundido < 1e-5) t.hundido = 0;
      uniforme.value[t.indice] = t.hundido / k;
    });
  }

  // ---------- Correo en la pantalla ----------
  const pantalla = props.models.monitor.root.getObjectByName('monitor-screen');
  const correo = { grupo: null, cuerpo: null, lienzo: null, ctx: null, textura: null, region: null, anchos: [0, 0], lineas: 1, texto: 0 };
  if (pantalla) {
    pantalla.geometry.computeBoundingBox();
    const b = pantalla.geometry.boundingBox, w = b.max.x - b.min.x, h = b.max.y - b.min.y, c = b.getCenter(new THREE.Vector3());
    // Cara que mira al usuario: el eje ±Z de la pantalla que apunta hacia el frente del escenario (+Z del grupo).
    pantalla.updateWorldMatrix(true, false); props.group.updateWorldMatrix(true, false);
    const zPantalla = new THREE.Vector3(0, 0, 1).transformDirection(pantalla.matrixWorld), frente = new THREE.Vector3(0, 0, 1).transformDirection(props.group.matrixWorld);
    const lado = zPantalla.dot(frente) >= 0 ? 1 : -1;
    const escalaPantalla = pantalla.getWorldScale(new THREE.Vector3()).x || 1, milimetro = .001 / escalaPantalla;
    // Interfaz fija.
    const W = 1536, H = Math.round(W * h / w);
    const lienzoInterfaz = document.createElement('canvas');
    lienzoInterfaz.width = W; lienzoInterfaz.height = H;
    const region = dibujarInterfaz(lienzoInterfaz.getContext('2d'), W, H);
    const texturaInterfaz = new THREE.CanvasTexture(lienzoInterfaz);
    texturaInterfaz.colorSpace = THREE.SRGBColorSpace;
    texturaInterfaz.anisotropy = 4;
    const grupo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texturaInterfaz, toneMapped: false }));
    grupo.name = 'correo-interfaz';
    grupo.position.set(c.x, c.y, c.z + lado * milimetro);
    if (lado < 0) grupo.rotation.y = Math.PI;
    grupo.visible = false;
    grupo.raycast = () => {};
    pantalla.add(grupo);
    // Cuerpo del mensaje: plano pequeño sobre su región, un poco más adelante.
    const s = region.escala, aPlano = w / W;
    const rw = region.w * s, rh = region.h * s;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(rw); lienzo.height = Math.round(rh);
    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    const cuerpoPlano = new THREE.Mesh(new THREE.PlaneGeometry(rw * aPlano, rh * aPlano), new THREE.MeshBasicMaterial({ map: textura, toneMapped: false }));
    cuerpoPlano.name = 'correo-cuerpo';
    cuerpoPlano.position.set((region.x * s + rw / 2) * aPlano - w / 2, h / 2 - (region.y * s + rh / 2) * aPlano, milimetro * .5);
    cuerpoPlano.raycast = () => {};
    grupo.add(cuerpoPlano);
    Object.assign(correo, { grupo, cuerpo: cuerpoPlano, lienzo, ctx: lienzo.getContext('2d'), textura, region: { ...region, s } });
  }

  // Renglones (pastillas grises que crecen desde la izquierda) o el mensaje final.
  function dibujarCuerpo() {
    const { ctx, lienzo, region } = correo;
    if (!ctx) return;
    const W = lienzo.width, s = region.s;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, lienzo.height);
    const alto = 7 * s, x = 2 * s, ys = [16 * s, 35 * s];
    if (correo.lineas > .001) {
      ctx.globalAlpha = correo.lineas;
      ctx.fillStyle = COLOR.barraClara;
      correo.anchos.forEach((a, i) => {
        if (a <= 0) return;
        const ancho = Math.max(alto, a * (W - x * 2));
        redondeado(ctx, x, ys[i], ancho, alto, alto / 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (correo.texto > .001) {
      ctx.globalAlpha = correo.texto;
      ctx.fillStyle = COLOR.texto;
      ctx.font = `500 ${14 * s}px "DM Sans", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(C.correo.texto, x, ys[0] - 3 * s);
      ctx.globalAlpha = 1;
    }
    correo.textura.needsUpdate = true;
  }

  // Anchos de los renglones (fracción de su largo final) tras `p` pulsaciones.
  function anchosPara(p) {
    const primero = C.primerRenglon, segundo = Math.max(1, C.pulsaciones - primero);
    const n1 = Math.min(p, primero), n2 = Math.max(0, p - primero);
    return [n1 ? C.renglones[0] * n1 / primero : 0, n2 ? C.renglones[1] * n2 / segundo : 0];
  }

  function escribir() {
    estado.pulsaciones = Math.min(C.pulsaciones, estado.pulsaciones + 1);
    const [a1, a2] = anchosPara(estado.pulsaciones);
    gsap.to(correo.anchos, { 0: a1, 1: a2, duration: C.correo.crecer, ease: 'power2.out', overwrite: true, onUpdate: dibujarCuerpo });
    if (estado.pulsaciones < C.pulsaciones) return;
    // Última pulsación: el renglón termina de crecer, los renglones se van y aparece el mensaje; recién ahí el hito.
    estado.terminando = true;
    gsap.timeline({ delay: C.correo.crecer + C.correo.pausa, onComplete: () => { estado.terminando = false; estado.completo = true; alHito?.('monitor'); } })
      .to(correo, { lineas: 0, duration: C.correo.ocultar, ease: 'sine.inOut', onUpdate: dibujarCuerpo })
      .to(correo, { texto: 1, duration: C.correo.mostrar, ease: 'sine.out', onUpdate: dibujarCuerpo });
  }

  dibujarCuerpo();
  // Las fuentes del proyecto pueden terminar de cargar después: se vuelve a dibujar con ellas.
  document.fonts?.ready?.then(() => dibujarCuerpo());

  return {
    estado, teclas, correo,
    // Encendido o apagado desde el botón del monitor: el correo aparece directamente, con lo ya escrito.
    pantalla(encendida) {
      estado.encendido = encendida;
      if (correo.grupo) correo.grupo.visible = encendida;
      if (encendida) dibujarCuerpo();
    },
    // Centro de una tecla en el mundo (pruebas) y altura de su cara.
    centroTecla(i, sobre = 0) {
      const t = teclas[i];
      t.malla.updateWorldMatrix(true, false);
      const k = t.malla.getWorldScale(new THREE.Vector3()).y || 1;
      return new THREE.Vector3(t.centro.x, t.caja.max.y + sobre / k, t.centro.z).applyMatrix4(t.malla.matrixWorld);
    },
    actualizar(dt, habilitado) {
      revisarTeclas(habilitado);
      animarTeclas(dt);
    },
    detener() { teclas.forEach(t => { t.dedos = 0; t.objetivo = 0; }); estadosDedo.clear(); },
    // REPETIR: monitor apagado, correo vacío y teclas arriba.
    reiniciar() {
      gsap.killTweensOf(correo.anchos);
      gsap.killTweensOf(correo);
      Object.assign(estado, { encendido: false, pulsaciones: 0, completo: false, terminando: false, teclasPulsadas: 0 });
      Object.assign(correo, { anchos: [0, 0], lineas: 1, texto: 0 });
      teclas.forEach(t => { t.dedos = 0; t.objetivo = 0; t.hundido = 0; t.ultimo = -Infinity; uniforme.value[t.indice] = 0; });
      estadosDedo.clear();
      if (correo.ctx) dibujarCuerpo();
      if (correo.grupo) correo.grupo.visible = false;
    }
  };
}
