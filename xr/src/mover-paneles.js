import * as THREE from 'three';
import { setWorldPosition } from '@iwsdk/core';
import { AJUSTES } from './config.js';

const LADOS = ['left', 'right'];
// Colores del diseño del botón: círculo blanco con las flechas de mover en café claro.
const BLANCO = '#ffffff', CAFE = '#c29564';

// Icono del diseño: círculo y cuatro flechas (trazo con puntas en ángulo), dibujado en un lienzo.
function texturaBoton(fondo, flechas) {
  const n = 256, lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = n;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.beginPath();
  ctx.arc(n / 2, n / 2, n / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  // En el diseño las flechas ocupan el 75 % del círculo, con un trazo de ~7 % de su largo.
  const largo = n * .75, medio = largo / 2, punta = largo * .16, c = n / 2;
  ctx.strokeStyle = flechas;
  ctx.lineWidth = largo * .075;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(c - medio, c); ctx.lineTo(c + medio, c);
  ctx.moveTo(c, c - medio); ctx.lineTo(c, c + medio);
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
    const px = c + dx * medio, py = c + dy * medio;
    ctx.moveTo(px - dx * punta + dy * punta, py - dy * punta + dx * punta);
    ctx.lineTo(px, py);
    ctx.lineTo(px - dx * punta - dy * punta, py - dy * punta - dx * punta);
  });
  ctx.stroke();
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

/*
 * Paneles de texto que el usuario puede reubicar (instrucción, confirmación de la superficie, pregunta inicial
 * y barras de progreso). Cada uno lleva debajo, centrado, el botón de mover del diseño (círculo blanco con
 * flechas). Las frases finales y la flecha de continuar no lo llevan.
 *
 * - Pulsar el botón (rayo con pellizco o gatillo, toque con la yema del índice o pellizco junto a él) activa el
 *   modo de mover: el botón se invierte (círculo café, flechas blancas). Con el modo activo, el panel se toma
 *   con el rayo (pellizco o gatillo sobre él) o con un pellizco junto a su superficie, y se arrastra.
 * - También se puede arrastrar directamente desde el botón: se pulsa y, sin soltar, se mueve.
 * - Solo cambia la posición: el panel no gira, no cambia de tamaño y no sigue la mirada. Al soltarlo queda
 *   ahí y el modo se apaga. Mientras el modo está activo sus botones no responden. Un panel que el usuario
 *   acomodó ya no se reubica solo (paneles.colocar lo respeta).
 */
export function crearMovilidad(world, manos) {
  const cfg = AJUSTES.paneles;
  const paneles = new Set();
  const texturas = { normal: texturaBoton(BLANCO, CAFE), activo: texturaBoton(CAFE, BLANCO) };
  const geometria = new THREE.CircleGeometry(cfg.diametro / 2, 48);
  // `arrastre`: { panel, tipo: 'puntero' | 'mano', id | lado, desde, inicio, desdeBoton, recorrido }.
  const estado = { arrastre: null, toque: null, movimientos: 0 };
  const previo = { left: false, right: false };
  const objetivo = new THREE.Vector3(), actual = new THREE.Vector3(), punto = new THREE.Vector3(), local = new THREE.Vector3();

  const posicionDe = (panel, destino) => { panel.objeto.updateWorldMatrix(true, false); return panel.objeto.getWorldPosition(destino); };
  const aspecto = panel => {
    const activo = panel.moviendo || estado.arrastre?.panel === panel;
    const textura = activo ? texturas.activo : texturas.normal;
    if (panel.movil.material.map !== textura) panel.movil.material.map = textura;
  };
  function modo(panel, activo) {
    panel.moviendo = activo;
    panel.movil.espera = 0;
    aspecto(panel);
  }

  function empezar(panel, datos) {
    estado.arrastre = { panel, ...datos, inicio: posicionDe(panel, new THREE.Vector3()), recorrido: 0 };
    panel.movil.objetivo.copy(estado.arrastre.inicio);
    estado.toque = null;
    aspecto(panel);
  }
  function terminar() {
    const a = estado.arrastre;
    if (!a) return;
    estado.arrastre = null;
    if (a.recorrido < cfg.pulsar) {
      // Pulsar sin mover: el botón activa o apaga el modo; sobre el panel (con el modo activo) no hace nada.
      if (a.desdeBoton) modo(a.panel, !a.panel.moviendo);
      else aspecto(a.panel);
      return;
    }
    a.panel.movidoPorUsuario = true;
    estado.movimientos += 1;
    modo(a.panel, false);
  }
  function seguir(desde, ahora) {
    const a = estado.arrastre;
    a.panel.movil.objetivo.copy(a.inicio).add(objetivo.subVectors(ahora, desde));
    a.recorrido = Math.max(a.recorrido, a.panel.movil.objetivo.distanceTo(a.inicio));
  }

  function registrar(panel, { alto, ancho }) {
    const material = new THREE.MeshBasicMaterial({ map: texturas.normal, transparent: true, toneMapped: false });
    const boton = new THREE.Mesh(geometria, material);
    boton.name = 'boton-mover-panel';
    // Centrado bajo el borde inferior del panel, un poco por delante de su superficie.
    boton.position.set(0, -(alto / 2 + cfg.separacion + cfg.diametro / 2), .003);
    panel.objeto.add(boton);
    panel.movil = { boton, material, alto, ancho, espera: 0, objetivo: new THREE.Vector3() };
    panel.moviendo = false;
    panel.movidoPorUsuario = false;

    boton.addEventListener('pointerenter', () => boton.scale.setScalar(1.07));
    boton.addEventListener('pointerleave', () => boton.scale.setScalar(1));
    // Rayo (pellizco o gatillo) sobre el botón: empieza a arrastrar; si se suelta sin mover, activa el modo.
    // Toque con la yema: activa o apaga el modo al soltar (salvo que ese mismo gesto sea un pellizco).
    boton.addEventListener('pointerdown', evento => {
      if (!panel.visible || estado.arrastre) return;
      if (evento.pointerType === 'touch') { estado.toque = { panel, id: evento.pointerId }; return; }
      evento.object?.setPointerCapture?.(evento.pointerId);
      empezar(panel, { tipo: 'puntero', id: evento.pointerId, desde: evento.point.clone(), desdeBoton: true });
    });
    boton.addEventListener('pointerup', evento => {
      if (estado.toque?.id === evento.pointerId && estado.toque.panel === panel) { estado.toque = null; modo(panel, !panel.moviendo); }
    });
    // Con el modo activo, el rayo sobre cualquier parte del panel lo toma.
    panel.objeto.addEventListener('pointerdown', evento => {
      if (!panel.visible || !panel.moviendo || estado.arrastre || evento.object === boton || evento.pointerType === 'touch') return;
      evento.object?.setPointerCapture?.(evento.pointerId);
      empezar(panel, { tipo: 'puntero', id: evento.pointerId, desde: evento.point.clone(), desdeBoton: false });
    });
    panel.objeto.addEventListener('pointermove', evento => {
      const a = estado.arrastre;
      if (a?.panel === panel && a.tipo === 'puntero' && a.id === evento.pointerId && evento.point) seguir(a.desde, evento.point);
    });
    panel.objeto.addEventListener('pointerup', evento => {
      const a = estado.arrastre;
      if (a?.panel === panel && a.tipo === 'puntero' && a.id === evento.pointerId) terminar();
    });
    paneles.add(panel);
    return panel;
  }

  // Un punto (mundo) junto a la superficie del panel: a menos de `alcancePanel` de su plano y dentro de su contorno.
  function cercaDelPanel(panel, mundo) {
    panel.objeto.updateWorldMatrix(true, false);
    panel.objeto.worldToLocal(local.copy(mundo));
    const caja = panel.movil.caja ??= new THREE.Box3();
    if (caja.isEmpty()) {
      const ancho = panel.movil.ancho ?? .6;
      caja.min.set(-ancho / 2, -panel.movil.alto / 2, -1);
      caja.max.set(ancho / 2, panel.movil.alto / 2, 1);
    }
    const m = cfg.alcancePanel;
    return Math.abs(local.z) <= m && local.x >= caja.min.x - m && local.x <= caja.max.x + m && local.y >= caja.min.y - m && local.y <= caja.max.y + m;
  }

  // Pellizco directo con las manos (sin rayo): junto al botón, o junto al panel con el modo activo.
  function pellizcos() {
    for (const lado of LADOS) {
      const mano = manos[lado], pellizca = mano.seguida && mano.pellizco, empieza = pellizca && !previo[lado];
      previo[lado] = pellizca;
      const a = estado.arrastre;
      if (a?.tipo === 'mano' && a.lado === lado) {
        if (pellizca) seguir(a.desde, mano.pinza);
        else terminar();
        continue;
      }
      if (!empieza || a) continue;
      for (const panel of paneles) {
        if (!panel.visible) continue;
        const enBoton = panel.movil.boton.getWorldPosition(punto).distanceTo(mano.pinza) <= cfg.alcance;
        if (enBoton || (panel.moviendo && cercaDelPanel(panel, mano.pinza))) {
          empezar(panel, { tipo: 'mano', lado, desde: mano.pinza.clone(), desdeBoton: enBoton });
          break;
        }
      }
    }
  }

  return {
    estado, paneles, registrar,
    // Alguna mano o rayo está moviendo un panel: los gestos de los escenarios no lo toman.
    get ocupado() { return !!estado.arrastre; },
    actualizar(dt) {
      pellizcos();
      const alfa = 1 - Math.exp(-cfg.suavizado * dt);
      for (const panel of paneles) {
        if (!panel.visible) {
          if (estado.arrastre?.panel === panel) estado.arrastre = null;
          if (panel.moviendo) modo(panel, false);
          continue;
        }
        if (estado.arrastre?.panel === panel) {
          // Solo la posición sigue al gesto (con un suavizado leve); el giro y el tamaño no cambian.
          setWorldPosition(panel.objeto, posicionDe(panel, actual).lerp(panel.movil.objetivo, alfa));
        } else if (panel.moviendo && (panel.movil.espera += dt) > cfg.espera) {
          modo(panel, false);
        }
      }
    }
  };
}
