import * as THREE from 'three';
import gsap from 'gsap';
import { setWorldPosition } from '@iwsdk/core';
import { AJUSTES } from '../config.js';
import { APORTES } from '../textos.js';
import { alPulsar, crearPanel, mostrar, ocultar } from '../paneles.js';
import { texturaHojas } from '../hojas.js';
import { url } from '../rutas.js';

const PUNTAS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip', 'thumb-tip'];
const LADOS = ['left', 'right'];
const modulo = (n, m) => ((n % m) + m) % m;
// Posición relativa en el carrusel circular de 3 tarjetas, en [−1,5; 1,5).
const envolver = p => modulo(p + 1.5, 3) - 1.5;
const suave = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// Fondo del marco del carrusel (diseño): gris más oscuro al centro y claro hacia los bordes, con borde blanco.
// `ancho` y `alto` en metros (10 px por cm).
function texturaFondo(anchoM, altoM) {
  const ancho = Math.round(anchoM * 1000), alto = Math.round(altoM * 1000), radio = 45;
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  const contorno = () => { ctx.beginPath(); ctx.roundRect(3, 3, ancho - 6, alto - 6, radio); };
  const degradado = ctx.createRadialGradient(ancho / 2, alto / 2, alto * .1, ancho / 2, alto / 2, ancho * .62);
  degradado.addColorStop(0, '#9a9a9a');
  degradado.addColorStop(1, '#e2e2e2');
  contorno();
  ctx.fillStyle = degradado;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/*
 * Sección de aportes (corrección: después del escenario 3). Tres paneles en el lugar de la pregunta inicial, que
 * siempre miran al usuario y se pueden mover y escalar como los demás (mover-paneles.js):
 * - Inicio: «Hay momentos que duran…», con el reloj de arena a su derecha. QUIERO APRENDER abre el carrusel y AHORA NO
 *   el panel final.
 * - Carrusel: tres tarjetas (textos.js, APORTES) en un carrusel circular dentro de un marco. La del centro está
 *   desplegada (título, resumen, texto y foto) y las laterales recogidas y pálidas. Se arrastra hacia los lados con la
 *   punta de uno o varios dedos (sin pellizcar) y tocar una tarjeta lateral la trae al centro; con controles, con el
 *   rayo. CONTINUAR AL CIERRE abre el panel final.
 * - Final: «Gracias por regalarnos…». VER FORMAS DE APORTAR vuelve al carrusel, REPETIR reinicia la experiencia
 *   (alRepetir) y SALIR termina la sesión de realidad mixta (alSalir).
 * Cada panel nuevo aparece donde estaba el anterior (si el usuario lo movió, ahí).
 */
export async function crearAportes(world, espacio, { manos, movilidad, reloj, alRepetir, alSalir }) {
  const C = AJUSTES.aportes;
  const [inicio, marco, final] = await Promise.all([
    crearPanel(world, 'panel-aportes-inicio', { padre: espacio.entidad, hojas: [60, 49] }),
    crearPanel(world, 'panel-aportes-carrusel', { padre: espacio.entidad }),
    crearPanel(world, 'panel-aportes-final', { padre: espacio.entidad, hojas: [60, 49] })
  ]);
  movilidad.registrar(inicio, { alto: .49, ancho: .6 });
  movilidad.registrar(marco, { alto: C.marco[1], ancho: C.marco[0] });
  movilidad.registrar(final, { alto: .49, ancho: .6 });
  marco.el('fondo')?.setProperties({ src: texturaFondo(...C.marco) });

  // ---------- Tarjetas ----------
  const tarjetas = await Promise.all(APORTES.tarjetas.map(async (datos, i) => {
    const [central, lateral] = await Promise.all([world.assets.instantiate('panel-aportes-central'), world.assets.instantiate('panel-aportes-lateral')]);
    const grupo = new THREE.Group();
    grupo.name = `tarjeta-aportes-${i}`;
    grupo.add(lateral, central);
    marco.objeto.add(grupo);
    grupo.position.set(0, C.alturaTarjetas, C.delante);
    central.getElementById('titulo')?.setProperties({ text: datos.titulo });
    central.getElementById('resumen')?.setProperties({ text: datos.resumen });
    central.getElementById('detalle')?.setProperties({ text: datos.detalle });
    // La foto ocupa todo el ancho de la tarjeta (sin ajustarse a la proporción de la imagen: se recorta, no se encoge).
    central.getElementById('foto')?.setProperties({ src: url(datos.foto), objectFit: 'cover', keepAspectRatio: false });
    central.getElementById('hojas')?.setProperties({ keepAspectRatio: false });
    lateral.getElementById('hojas')?.setProperties({ keepAspectRatio: false });
    lateral.getElementById('titulo')?.setProperties({ text: datos.titulo });
    lateral.getElementById('resumen')?.setProperties({ text: datos.resumen });
    // Las hojas cubren la tarjeta entera (dentro de su borde de 1,2 mm), sin recortarse.
    texturaHojas(C.central[0] * 100 - .24, C.central[1] * 100 - .24).then(t => central.getElementById('hojas')?.setProperties({ src: t }));
    texturaHojas(C.lateral[0] * 100, C.lateral[1] * 100, { opacidad: .08 }).then(t => lateral.getElementById('hojas')?.setProperties({ src: t }));
    const raizCentral = central.getElementById('tarjeta'), raizLateral = lateral.getElementById('tarjeta');
    // Siempre delante del marco, mire donde mire el usuario.
    raizCentral?.setProperties({ renderOrder: C.orden });
    raizLateral?.setProperties({ renderOrder: C.orden });
    return { datos, grupo, central, lateral, raizCentral, raizLateral };
  }));

  const estado = { pantalla: null, indice: 0, desplazamiento: 0, arrastres: 0, toques: 0, ajuste: null, lugar: null };
  // Coloca cada tarjeta según su posición relativa: la del centro desplegada y adelante; las laterales recogidas.
  function dibujarCarrusel() {
    tarjetas.forEach((t, i) => {
      const p = envolver(i - estado.indice + estado.desplazamiento), d = Math.abs(p);
      t.grupo.position.set(p * C.paso, C.alturaTarjetas, C.delante + (1 - Math.min(d, 1)) * .008);
      // Cerca del extremo (cuando da la vuelta) se desvanece.
      const borde = 1 - suave(d, 1.15, 1.45);
      const deCentro = (1 - suave(d, .2, .55)) * borde, deLado = suave(d, .25, .6) * borde;
      t.raizCentral?.setProperties({ opacity: deCentro });
      t.raizLateral?.setProperties({ opacity: deLado });
      t.central.visible = deCentro > .01;
      t.lateral.visible = deLado > .01;
      const escala = THREE.MathUtils.lerp(1, .97, Math.min(d, 1));
      t.grupo.scale.setScalar(escala);
    });
  }
  dibujarCarrusel();

  // Anima el desplazamiento hasta `objetivo` tarjetas y deja al centro la que corresponda.
  function ajustar(objetivo) {
    estado.ajuste?.kill();
    estado.ajuste = gsap.to(estado, {
      desplazamiento: objetivo, duration: C.ajustar, ease: 'power2.out', onUpdate: dibujarCarrusel,
      onComplete: () => {
        estado.indice = modulo(estado.indice - Math.round(objetivo), tarjetas.length);
        estado.desplazamiento = 0;
        estado.ajuste = null;
        dibujarCarrusel();
      }
    });
  }

  // ¿El punto (en el espacio del marco) cae sobre alguna tarjeta? Devuelve su posición relativa (−1, 0, 1) o null.
  function tarjetaEn(x, y) {
    const yc = y - C.alturaTarjetas;
    if (Math.abs(x) <= C.central[0] / 2 && Math.abs(yc) <= C.central[1] / 2) return 0;
    for (const lado of [-1, 1]) if (Math.abs(x - lado * C.paso) <= C.lateral[0] / 2 && Math.abs(yc) <= C.lateral[1] / 2) return lado;
    return null;
  }
  function empezarArrastre(x, y) {
    if (estado.ajuste) { estado.ajuste.kill(); estado.ajuste = null; }
    const p = tarjetaEn(x, y);
    if (p === null) return null;
    return { x0: x, base: estado.desplazamiento, recorrido: 0, tiempo: 0, p };
  }
  function seguirArrastre(a, x) {
    const dx = x - a.x0;
    a.recorrido = Math.max(a.recorrido, Math.abs(dx));
    estado.desplazamiento = THREE.MathUtils.clamp(a.base + dx / C.paso, -1.4, 1.4);
    dibujarCarrusel();
  }
  function terminarArrastre(a) {
    if (a.recorrido < C.toqueMax) {
      // Toque: una tarjeta lateral pasa al centro.
      estado.toques += 1;
      estado.desplazamiento = a.base;
      ajustar(a.p === 0 ? 0 : -a.p);
      return;
    }
    estado.arrastres += 1;
    ajustar(THREE.MathUtils.clamp(Math.round(estado.desplazamiento), -1, 1));
  }

  // ---------- Arrastre con la punta de los dedos ----------
  const local = new THREE.Vector3(), escalaMarco = new THREE.Vector3();
  let dedos = null;
  // Punta de dedo (de una mano sin pellizcar) apoyada en la cara del marco: la más cercana, en su espacio.
  function puntaApoyada(soloLado = null, holgura = 0) {
    marco.objeto.updateWorldMatrix(true, false);
    marco.objeto.getWorldScale(escalaMarco);
    const k = escalaMarco.x || 1;
    let mejor = null;
    for (const lado of LADOS) {
      if (soloLado && lado !== soloLado) continue;
      const mano = manos[lado];
      if (!mano.seguida || mano.pellizco) continue;
      for (const nombre of PUNTAS) {
        const punto = mano.puntos.get(nombre);
        if (!punto) continue;
        marco.objeto.worldToLocal(local.copy(punto));
        const radio = (mano.radios.get(nombre) ?? .008) / k;
        if (local.z > radio + (C.contacto + holgura) / k || local.z < -C.detras / k) continue;
        if (Math.abs(local.x) > C.marco[0] / 2 || Math.abs(local.y - C.alturaTarjetas) > C.central[1] / 2 + .01) continue;
        if (!mejor || local.z < mejor.z) mejor = { lado, x: local.x, y: local.y, z: local.z };
      }
    }
    return mejor;
  }
  function revisarDedos(dt) {
    if (dedos) {
      const punta = puntaApoyada(dedos.lado, C.holgura);
      if (!punta) { terminarArrastre(dedos.arrastre); dedos = null; return; }
      dedos.arrastre.tiempo += dt;
      seguirArrastre(dedos.arrastre, punta.x);
      return;
    }
    if (marco.moviendo || movilidad.ocupado) return;
    const punta = puntaApoyada();
    if (!punta) return;
    const arrastre = empezarArrastre(punta.x, punta.y);
    if (arrastre) dedos = { lado: punta.lado, arrastre };
  }

  // ---------- Con controles: el rayo arrastra o toca ----------
  let rayo = null;
  marco.objeto.addEventListener('pointerdown', evento => {
    if (estado.pantalla !== 'carrusel' || evento.pointerType === 'touch' || marco.moviendo || rayo || !evento.point) return;
    marco.objeto.worldToLocal(local.copy(evento.point));
    const arrastre = empezarArrastre(local.x, local.y);
    if (!arrastre) return;
    evento.object?.setPointerCapture?.(evento.pointerId);
    rayo = { id: evento.pointerId, arrastre };
  });
  marco.objeto.addEventListener('pointermove', evento => {
    if (!rayo || evento.pointerId !== rayo.id || !evento.point) return;
    marco.objeto.worldToLocal(local.copy(evento.point));
    seguirArrastre(rayo.arrastre, local.x);
  });
  marco.objeto.addEventListener('pointerup', evento => {
    if (!rayo || evento.pointerId !== rayo.id) return;
    terminarArrastre(rayo.arrastre);
    rayo = null;
  });

  // ---------- Pantallas ----------
  const PANTALLAS = { inicio, carrusel: marco, final };
  // Muestra una pantalla en el lugar de la anterior (o en `lugar`) y oculta las demás.
  function ir(nombre, lugar = null) {
    const anterior = PANTALLAS[estado.pantalla];
    if (anterior?.visible) {
      anterior.objeto.updateWorldMatrix(true, false);
      estado.lugar = anterior.objeto.getWorldPosition(new THREE.Vector3());
    }
    if (lugar) estado.lugar = lugar.clone();
    Object.entries(PANTALLAS).forEach(([n, panel]) => { if (n !== nombre && panel.visible) ocultar(panel); });
    if (estado.pantalla === 'inicio' && nombre !== 'inicio') reloj?.ocultar?.();
    estado.pantalla = nombre;
    if (!nombre) return;
    const panel = PANTALLAS[nombre];
    if (estado.lugar) setWorldPosition(panel.objeto, estado.lugar);
    if (nombre === 'carrusel') { estado.indice = 0; estado.desplazamiento = 0; dibujarCarrusel(); }
    mostrar(panel, { retraso: anterior?.visible ? .3 : 0 });
    if (nombre === 'inicio') reloj?.mostrar?.();
  }

  alPulsar(inicio, 'aprender', () => { if (estado.pantalla === 'inicio') ir('carrusel'); });
  alPulsar(inicio, 'ahora-no', () => { if (estado.pantalla === 'inicio') ir('final'); });
  alPulsar(marco, 'continuar', () => { if (estado.pantalla === 'carrusel') ir('final'); });
  alPulsar(final, 'aportar', () => { if (estado.pantalla === 'final') ir('carrusel'); });
  alPulsar(final, 'repetir', () => { if (estado.pantalla === 'final') alRepetir?.(); });
  alPulsar(final, 'salir', () => { if (estado.pantalla === 'final') alSalir?.(); });

  return {
    estado, paneles: PANTALLAS, tarjetas,
    // Empieza la sección con el panel de inicio en `lugar` (mundo).
    iniciar(lugar) { ir('inicio', lugar); },
    ocultarTodo() { dedos = null; rayo = null; ir(null); },
    // Para las pruebas: lleva el carrusel a una tarjeta.
    irA: indice => { estado.indice = modulo(indice, tarjetas.length); estado.desplazamiento = 0; dibujarCarrusel(); },
    actualizar(dt) {
      if (estado.pantalla === 'carrusel' && marco.visible) revisarDedos(dt);
      else if (dedos) dedos = null;
    }
  };
}
