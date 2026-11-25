import * as THREE from 'three';
import { setWorldPosition, setWorldQuaternion } from '@iwsdk/core';
import { AJUSTES } from './config.js';
import { escalarPanel } from './paneles.js';
import { crearEsquinas } from './escena/esquinas.js';

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
 * Paneles de texto que el usuario puede reubicar (instrucción, confirmación de la superficie y pregunta
 * inicial). Cada uno lleva debajo, centrado, el botón de mover del diseño (círculo blanco con
 * flechas). Las frases finales y la flecha de continuar no lo llevan.
 *
 * - Pulsar el botón (rayo con pellizco o gatillo, toque con la yema del índice o pellizco junto a él) activa el
 *   modo de mover: el botón se invierte (círculo café, flechas blancas). Con el modo activo, el panel se toma
 *   con el rayo (pellizco o gatillo sobre él) o con un pellizco junto a su superficie, y se arrastra.
 * - También se puede arrastrar directamente desde el botón: se pulsa y, sin soltar, se mueve.
 * - Mover cambia la posición; al soltarlo queda ahí y el modo se apaga. Mientras el modo está activo sus botones no
 *   responden. Un panel que el usuario acomodó ya no se reubica solo (paneles.colocar lo respeta).
 * - Siempre de frente (corrección): estos paneles giran solos hacia la cara del usuario, mientras se mueven y también
 *   cuando el usuario camina a su alrededor (en horizontal y en vertical, con un suavizado leve). Al aparecer ya
 *   están de frente.
 * - Escalar (corrección): con una mano cerca del borde del panel aparecen cuatro esquinas (la misma señal de los
 *   escenarios); un pellizco con cada mano que empiece junto a su borde (no sobre el botón de mover) y separar o
 *   juntar las manos lo amplía o lo reduce desde su centro. Con el modo de mover activo no se escala.
 */
export function crearMovilidad(world, manos) {
  const cfg = AJUSTES.paneles;
  const paneles = new Set();
  const texturas = { normal: texturaBoton(BLANCO, CAFE), activo: texturaBoton(CAFE, BLANCO) };
  const geometria = new THREE.CircleGeometry(cfg.diametro / 2, 48);
  // `arrastre`: { panel, tipo: 'puntero' | 'mano', id | lado, desde, inicio, desdeBoton, recorrido }.
  const estado = { arrastre: null, toque: null, movimientos: 0, escalado: null, escalados: 0 };
  // Pellizco de cada mano para escalar: si está activo, desde cuántos cuadros y junto al borde de qué panel empezó.
  const pinzas = Object.fromEntries(LADOS.map(lado => [lado, { activo: false, cuadros: 0, panel: null, cerca: null }]));
  const previo = { left: false, right: false };
  const objetivo = new THREE.Vector3(), actual = new THREE.Vector3(), punto = new THREE.Vector3(), local = new THREE.Vector3();
  const escalaPanel = new THREE.Vector3(), frente = new THREE.Vector3();
  const ojo = new THREE.Vector3(), centroPanel = new THREE.Vector3(), mira = new THREE.Matrix4(), giroMeta = new THREE.Quaternion(), giroActual = new THREE.Quaternion();
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  // Gira el panel (su cara, +Z) hacia los ojos del usuario; `directo`: sin suavizado (al aparecer).
  function mirarAlUsuario(panel, dt, directo) {
    world.player.head.getWorldPosition(ojo);
    panel.objeto.updateWorldMatrix(true, false);
    panel.objeto.getWorldPosition(centroPanel);
    if (ojo.distanceToSquared(centroPanel) < 1e-4) return;
    giroMeta.setFromRotationMatrix(mira.lookAt(ojo, centroPanel, ARRIBA));
    panel.objeto.getWorldQuaternion(giroActual);
    if (!directo) giroMeta.copy(giroActual.slerp(giroMeta, 1 - Math.exp(-cfg.girar * dt)));
    setWorldQuaternion(panel.objeto, giroMeta);
  }

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
    // Esquinas de escalado: van en la escena (no dentro del panel, así no cuentan en su tamaño para la mano dibujada)
    // y cada cuadro se ponen en el plano del panel, un poco por delante.
    const esquinas = crearEsquinas({ renderOrder: 3 });
    world.scene.add(esquinas.grupo);
    panel.movil = { boton, material, alto, ancho, espera: 0, objetivo: new THREE.Vector3(), esquinas, senal: 0 };
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

  // Distancia (m) de un punto al contorno del panel en su plano (positiva afuera, negativa adentro) y a su plano.
  function respectoDelBorde(panel, mundo) {
    panel.objeto.updateWorldMatrix(true, false);
    panel.objeto.worldToLocal(local.copy(mundo));
    const k = panel.objeto.scale.x, qx = Math.abs(local.x) - (panel.movil.ancho ?? .6) / 2, qy = Math.abs(local.y) - panel.movil.alto / 2;
    const afuera = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)), adentro = Math.min(Math.max(qx, qy), 0);
    return { distancia: (afuera + adentro) * k, profundidad: Math.abs(local.z) * k };
  }
  // Junto al borde del panel (y no sobre su botón de mover), con un margen extra para que la señal no parpadee.
  function enBorde(panel, mundo, extra = 0) {
    if (!panel.visible || panel.aparicion < .5) return false;
    if (panel.movil.boton.getWorldPosition(punto).distanceTo(mundo) <= cfg.alcance) return false;
    const { distancia, profundidad } = respectoDelBorde(panel, mundo);
    return distancia >= -cfg.bordeDentro - extra && distancia <= cfg.bordeFuera + extra && profundidad <= cfg.profundidad + extra;
  }
  const panelEnBorde = (mundo, extra = 0) => [...paneles].find(panel => enBorde(panel, mundo, extra)) ?? null;

  // Escalar con las dos manos: los dos pellizcos empezaron junto al borde del mismo panel.
  function escalar(dt) {
    for (const lado of LADOS) {
      const mano = manos[lado], p = pinzas[lado], activo = mano.seguida && mano.pellizco;
      if (activo && !p.activo) { p.panel = estado.arrastre ? null : panelEnBorde(mano.pinza); p.cuadros = 0; }
      if (activo) p.cuadros += 1;
      p.activo = activo;
    }
    const e = estado.escalado, L = pinzas.left, D = pinzas.right;
    if (e) {
      if (!L.activo || !D.activo || !e.panel.visible) { estado.escalado = null; return; }
      const separacion = manos.left.pinza.distanceTo(manos.right.pinza);
      if (!e.escalando) {
        if (Math.abs(separacion / e.separacion - 1) < AJUSTES.manipulacion.zonaMuerta) return;
        Object.assign(e, { escalando: true, separacion, escala: e.panel.escala });
      }
      const meta = THREE.MathUtils.clamp(e.escala * separacion / e.separacion, cfg.escalaMin * e.original, cfg.escalaMax * e.original);
      escalarPanel(e.panel, e.panel.escala + (meta - e.panel.escala) * (1 - Math.exp(-AJUSTES.manipulacion.suavizado * dt)));
      return;
    }
    // Se espera un cuadro más para que, si el pellizco era del botón (arrastre), ese gesto lo tome primero.
    if (estado.arrastre || !L.activo || !D.activo || !L.panel || L.panel !== D.panel || L.cuadros < 2 || D.cuadros < 2 || L.panel.moviendo) return;
    const panel = L.panel;
    panel.movil.original ??= panel.escala;
    estado.escalado = { panel, separacion: manos.left.pinza.distanceTo(manos.right.pinza), escala: panel.escala, original: panel.movil.original, escalando: false };
    estado.escalados += 1;
  }

  // Señal de escalado: las esquinas del panel que tiene una mano cerca de su borde (o que se está escalando).
  function senales(dt) {
    for (const lado of LADOS) {
      const mano = manos[lado], p = pinzas[lado];
      p.cerca = mano.seguida && !estado.arrastre ? (p.cerca && enBorde(p.cerca, mano.pinza, AJUSTES.manipulacion.esquinas.histeresis) ? p.cerca : panelEnBorde(mano.pinza)) : null;
    }
    const fundido = 1 - Math.exp(-AJUSTES.manipulacion.esquinas.fundido * dt);
    for (const panel of paneles) {
      const m = panel.movil;
      const meta = panel.visible && !panel.moviendo && (estado.escalado?.panel === panel || pinzas.left.cerca === panel || pinzas.right.cerca === panel) ? 1 : 0;
      m.senal += (meta - m.senal) * fundido;
      if (Math.abs(m.senal - meta) < .01) m.senal = meta;
      m.esquinas.opacidad = m.senal;
      if (m.esquinas.grupo.visible) {
        const g = m.esquinas.grupo;
        panel.objeto.updateWorldMatrix(true, false);
        panel.objeto.matrixWorld.decompose(g.position, g.quaternion, escalaPanel);
        g.position.add(frente.set(0, 0, .004).applyQuaternion(g.quaternion));
        const k = Math.max(escalaPanel.x, .001);
        m.esquinas.colocar((m.ancho ?? .6) * k, m.alto * k, 1);
      }
    }
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
      if (!empieza || a || estado.escalado) continue;
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
    estado, paneles, registrar, respectoDelBorde, enBorde,
    // Alguna mano o rayo está moviendo o escalando un panel: los gestos de los escenarios no lo toman.
    get ocupado() { return !!estado.arrastre || !!estado.escalado; },
    actualizar(dt) {
      pellizcos();
      escalar(dt);
      senales(dt);
      const alfa = 1 - Math.exp(-cfg.suavizado * dt);
      for (const panel of paneles) {
        if (!panel.visible) {
          if (estado.arrastre?.panel === panel) estado.arrastre = null;
          if (panel.moviendo) modo(panel, false);
          panel.movil.deFrente = false;
          continue;
        }
        mirarAlUsuario(panel, dt, !panel.movil.deFrente);
        panel.movil.deFrente = true;
        if (estado.arrastre?.panel === panel) {
          // La posición sigue al gesto (con un suavizado leve); el giro lo da mirarAlUsuario y el tamaño no cambia.
          setWorldPosition(panel.objeto, posicionDe(panel, actual).lerp(panel.movil.objetivo, alfa));
        } else if (panel.moviendo && (panel.movil.espera += dt) > cfg.espera) {
          modo(panel, false);
        }
      }
    }
  };
}
