import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../../config.js';
import { crearAgarre, estiramientos, seSuelta } from '../agarre.js';

// Falanges que cuentan como «dedo junto al vaso» (de cada dedo, cualquiera de ellas).
const FALANGES_DEDOS = [
  ['thumb-phalanx-distal', 'thumb-tip'],
  ...['index', 'middle', 'ring', 'pinky'].map(d => [`${d}-finger-phalanx-intermediate`, `${d}-finger-phalanx-distal`, `${d}-finger-tip`])
];
const ARRIBA = new THREE.Vector3(0, 1, 0);

/*
 * Termo de café (storyboard 8, corregido tras las pruebas en Quest 3).
 *
 * Agarre con la mano en C (corrección del PDF 4: sin cerrar el puño). Con las manos el vaso se toma acercando la mano
 * como se toma un vaso de verdad: la palma pegada a él y mirándolo, a la altura del cuerpo, con al menos dos dedos
 * junto a su superficie, durante un instante. El pellizco no lo toma. No es un reconocedor de posturas: mide
 * distancias entre las articulaciones (las que IWSDK ya lee) y el cilindro. Sostenido, el termo se coloca en la mano con
 * el perfil 'envolvente' de agarre.js y la mano dibujada toma la postura de agarre (oclusion.js): sus dedos lo envuelven
 * según su diámetro. Antes de tomarlo, la mano dibujada lo rodea en vez de atravesarlo (narrativa.js, envolturas).
 * Se suelta de dos formas:
 * - estirando los dedos (más que en la C con que se tomó): en el aire vuelve a su lugar; junto al escritorio se queda;
 * - bajándolo hasta el escritorio (queda posado) y retirando la mano: se queda donde se dejó, derecho, si ahí cabe
 *   (dentro del escritorio y sin cruzar otros objetos); si no, vuelve a su lugar. Subir la mano en C lo levanta otra vez.
 * Con controles (sin manos) se toma con el botón lateral (agarre de IWSDK).
 *
 * Sacudirlo hace sonar el hielo (sonido-hielo.js) según la fuerza del movimiento; es opcional y no suma.
 * Beber (el hito): acercar la tapa a la boca, estimada desde la pose del visor, e inclinar el termo; suena
 * el sorbo una vez por gesto y el hito se suma solo la primera vez.
 */
// `alturaSobreEscritorio()`: m de la base sobre el escritorio; `dejarTermo()`: lo asienta donde está (true si cabe).
export function crearTermo({ world, manos, termo, entidad, hielo, sonido, cabeza, apoyar, alturaSobreEscritorio, dejarTermo, alBeber }) {
  const A = AJUSTES.adultez.termo;
  const { root, visual } = termo;

  // Medidas del cilindro en el espacio de su raíz: eje vertical (+Y), centro, alto y radio.
  root.updateMatrixWorld(true);
  const aRaiz = root.matrixWorld.clone().invert(), caja = new THREE.Box3(), parte = new THREE.Box3(), m = new THREE.Matrix4();
  visual.traverse(o => { if (o.isMesh && !o.userData.glowShell) { o.geometry.computeBoundingBox(); caja.union(parte.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(aRaiz, o.matrixWorld))); } });
  const centro = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3());
  const radioLocal = Math.max(tam.x, tam.z) / 2, altoLocal = tam.y;
  const escalaRaiz = new THREE.Vector3();
  const metros = () => { root.getWorldScale(escalaRaiz); return escalaRaiz.y; };

  const agarre = crearAgarre({
    world, manos, objeto: root, perfil: 'envolvente', ajustes: { ...A.agarre, radio: () => radioLocal * metros() },
    medida: { centro, eje: new THREE.Vector3(0, 1, 0), lateral: new THREE.Vector3(0, 0, 1), largo: altoLocal }
  });

  const reposo = { posicion: root.position.clone(), giro: root.quaternion.clone() };
  // `modo`: null, 'iwsdk' (controles), 'envolvente' (en la mano) o 'posado' (apoyado en el escritorio, aún con la
  // mano alrededor). `rearmar`: tras dejarlo, la mano debe alejarse antes de poder tomarlo de nuevo.
  const estado = {
    habilitado: false, modo: null, lado: null, candidato: null, espera: 0, suelto: 0, fuera: 0,
    levantado: false, alturaPosado: 0, rearmar: false, inicial: null,
    bebido: false, sorbos: 0, listoParaBeber: true, choques: 0, envolturas: 0, posados: 0, dejados: 0, regresos: 0
  };
  let regreso = null;

  function volver() {
    regreso?.kill();
    const desde = root.position.clone(), giroDesde = root.quaternion.clone(), k = { v: 0 };
    regreso = gsap.to(k, {
      v: 1, duration: A.regreso, ease: 'power2.inOut',
      onUpdate: () => {
        // Arco de 4 cm: la posición está en unidades del grupo del escenario (metros / escala del padre).
        root.position.lerpVectors(desde, reposo.posicion, k.v).y += Math.sin(k.v * Math.PI) * .04 * root.scale.y / metros();
        root.quaternion.slerpQuaternions(giroDesde, reposo.giro, k.v);
      },
      onComplete: () => { regreso = null; }
    });
  }

  // ---------- Contacto de la mano con el cilindro ----------
  const base = new THREE.Vector3(), eje = new THREE.Vector3(), v = new THREE.Vector3();
  function cilindro() {
    root.updateWorldMatrix(true, false);
    root.localToWorld(base.copy(centro).addScaledVector(ARRIBA, -altoLocal / 2));
    eje.copy(ARRIBA).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    return { radio: radioLocal * metros(), alto: altoLocal * metros() };
  }
  // Distancia (m) de un punto al eje y altura relativa a lo largo de él (0 base, 1 tapa). Deja en `v` la dirección
  // del eje hacia el punto (sin normalizar).
  function respectoDelEje(punto, alto) {
    v.subVectors(punto, base);
    const t = v.dot(eje);
    return { d: v.addScaledVector(eje, -t).length(), h: t / alto };
  }
  // ¿La palma está junto al vaso (a menos de `extra` m de su superficie, a la altura del cuerpo)? Con `mirando`, además
  // la palma lo mira.
  function palmaJunto(mano, extra, mirando) {
    const { radio, alto } = cilindro();
    const palma = respectoDelEje(mano.centro, alto);
    if (palma.d > radio + extra || palma.h < A.altura[0] || palma.h > A.altura[1]) return false;
    // Muy cerca del eje la dirección no está definida: cuenta como junto.
    return !mirando || palma.d < radio * .6 || -mano.palma.dot(v.normalize()) >= A.mirar;
  }
  // Mano en C junto al vaso: la palma pegada a él y mirándolo, y al menos `A.dedos` dedos con alguna falange cerca de
  // su superficie (o dentro: la mano real no tiene nada que la detenga). No hace falta cerrar el puño.
  function enC(mano) {
    if (!palmaJunto(mano, A.palma, true)) return false;
    // Pulgar e índice juntos: es (o va a ser) un pellizco, no una C.
    const pulgar = mano.puntos.get('thumb-tip'), indice = mano.puntos.get('index-finger-tip');
    if (pulgar && indice && pulgar.distanceTo(indice) < A.pinzaMin) return false;
    const { radio, alto } = cilindro();
    let dedos = 0;
    for (const falanges of FALANGES_DEDOS) {
      if (falanges.some(nombre => {
        const p = mano.puntos.get(nombre);
        if (!p) return false;
        const r = respectoDelEje(p, alto);
        return r.d <= radio + A.puntas && r.h > -.05 && r.h < 1.05;
      })) dedos += 1;
    }
    return dedos >= A.dedos;
  }

  // ---------- Beber ----------
  const boca = new THREE.Vector3(), adelante = new THREE.Vector3(), abajo = new THREE.Vector3(), giroCabeza = new THREE.Quaternion();
  function revisarSorbo() {
    world.player.head.getWorldQuaternion(giroCabeza);
    adelante.set(0, 0, -1).applyQuaternion(giroCabeza);
    abajo.set(0, -1, 0).applyQuaternion(giroCabeza);
    boca.copy(cabeza()).addScaledVector(abajo, A.bajoOjos).addScaledVector(adelante, A.delante);
    const tapa = agarre.puntoMundo(1), fondo = agarre.puntoMundo(0);
    const inclinacion = Math.acos(THREE.MathUtils.clamp(tapa.clone().sub(fondo).normalize().dot(ARRIBA), -1, 1));
    const distancia = tapa.distanceTo(boca);
    estado.ultimaMedida = { distancia, inclinacion };
    if (!estado.listoParaBeber) {
      // Para repetir el sorbo hay que retirar el termo o enderezarlo.
      if (distancia > A.boca * A.rearme || inclinacion < A.inclinacion * .5) estado.listoParaBeber = true;
      return;
    }
    if (distancia <= A.boca && inclinacion >= A.inclinacion) {
      estado.listoParaBeber = false;
      estado.sorbos += 1;
      sonido.playEffect('thermos');
      if (!estado.bebido) { estado.bebido = true; alBeber(); }
    }
  }

  // ---------- Hielo ----------
  const previa = new THREE.Vector3(), actual = new THREE.Vector3(), velocidad = new THREE.Vector3(), rumbo = new THREE.Vector3();
  let conPrevia = false, ultimoChoque = 0;
  function revisarHielo(dt) {
    root.getWorldPosition(actual);
    if (!conPrevia) { previa.copy(actual); conPrevia = true; return; }
    velocidad.subVectors(actual, previa).divideScalar(Math.max(dt, 1 / 120));
    previa.copy(actual);
    const rapidez = velocidad.length();
    if (rapidez < A.hielo.velocidad) return;
    velocidad.divideScalar(rapidez);
    // Los cubos chocan con las paredes al cambiar de dirección: más fuerte cuanto más brusco y rápido.
    const giro = rumbo.lengthSq() > 0 ? velocidad.dot(rumbo) : 1;
    const ahora = performance.now() / 1000;
    if (giro < .5 && ahora - ultimoChoque > .06) {
      ultimoChoque = ahora;
      estado.choques += 1;
      const brusquedad = THREE.MathUtils.clamp((.5 - giro) / 1.5, 0, 1);
      hielo.chocar(THREE.MathUtils.clamp(rapidez / (A.hielo.velocidad * 4), .15, 1) * (.5 + .5 * brusquedad));
    }
    rumbo.copy(velocidad);
  }

  function tomar(modo, lado) {
    regreso?.kill();
    regreso = null;
    Object.assign(estado, { modo, lado, suelto: 0, fuera: 0, sinMano: 0, levantado: false });
    // Estiramiento de los dedos al tomarlo: soltar exige estirarlos más que en esta C.
    estado.inicial = lado ? estiramientos(manos[lado]) : null;
    conPrevia = false;
    rumbo.set(0, 0, 0);
    agarre.tomar();
  }
  // Suelta y vuelve a su lugar.
  function soltar() {
    if (!estado.modo) return;
    const conMano = !!estado.lado;
    Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, rearmar: conMano });
    estado.regresos += 1;
    agarre.soltar();
    volver();
  }
  // Suelta y se queda donde está, derecho sobre el escritorio; si ahí no cabe, vuelve a su lugar.
  function dejar() {
    if (!estado.modo) return;
    const desde = root.position.clone(), giroDesde = root.quaternion.clone();
    root.quaternion.copy(reposo.giro);
    const cabe = dejarTermo();
    const hasta = root.position.clone();
    root.position.copy(desde);
    if (!cabe) { root.quaternion.copy(giroDesde); soltar(); return; }
    root.quaternion.copy(giroDesde);
    Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, rearmar: true });
    estado.dejados += 1;
    agarre.soltar();
    regreso?.kill();
    const k = { v: 0 };
    regreso = gsap.to(k, {
      v: 1, duration: .2, ease: 'power2.out',
      onUpdate: () => { root.position.lerpVectors(desde, hasta, k.v); root.quaternion.slerpQuaternions(giroDesde, reposo.giro, k.v); },
      onComplete: () => { regreso = null; }
    });
  }

  return {
    estado, agarre,
    // Sostenido con la mano (o posado con la mano alrededor; IWSDK no lo marca como Grabbed): bloquea el gesto del escenario.
    get envuelto() { return estado.modo === 'envolvente' || estado.modo === 'posado'; },
    get sostenido() { return !!estado.modo; },
    habilitar() { estado.habilitado = true; },
    // REPETIR: en su lugar (la instantánea), sin haber bebido.
    reiniciar() {
      regreso?.kill();
      regreso = null;
      if (estado.modo) agarre.soltar();
      Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, suelto: 0, fuera: 0, rearmar: false, levantado: false, bebido: false, sorbos: 0, listoParaBeber: true });
    },
    deshabilitar() {
      estado.habilitado = false;
      world.getSystem(GrabSystem)?.forceRelease(entidad);
      if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      soltar();
    },
    // Agarre de IWSDK (pellizco o botón lateral).
    sostener(activo) {
      if (activo) { if (estado.habilitado && estado.modo !== 'envolvente' && estado.modo !== 'posado') tomar('iwsdk', null); return; }
      if (estado.modo === 'iwsdk') soltar();
    },
    // `ocupadas`: manos que sostienen otra cosa (no pueden envolver el termo).
    update(dt, habilitado, ocupadas = []) {
      if (!estado.habilitado) return;
      // El agarre de IWSDK (pellizco o botón lateral) solo existe con controles: con las manos, solo rodeándolo.
      const conControl = manos.left.control || manos.right.control;
      if (conControl && !entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: false, translate: false });
      if (!conControl && estado.modo !== 'iwsdk' && entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      // Tras dejarlo, ninguna mano lo vuelve a tomar hasta que todas se alejen de él.
      if (estado.rearmar && !manos.lados.some(l => manos[l].seguida && palmaJunto(manos[l], A.palma + A.retirar, false))) estado.rearmar = false;
      if (!estado.modo && habilitado && !estado.rearmar) {
        // Una mano libre en C junto al termo durante `confirmar` s lo toma. Pellizcando no cuenta.
        const lado = manos.lados.find(l => manos[l].seguida && !manos[l].pellizco && !ocupadas.includes(l) && enC(manos[l]));
        if (lado && lado === estado.candidato) {
          if ((estado.espera += dt) >= A.confirmar) { estado.envolturas += 1; tomar('envolvente', lado); }
        } else { estado.candidato = lado ?? null; estado.espera = 0; }
      }
      if (!estado.modo) return;

      // Posado en el escritorio con la mano alrededor: no se mueve. Retirar la mano o estirar los dedos lo deja ahí;
      // subir la mano en C lo levanta de nuevo.
      if (estado.modo === 'posado') {
        const mano = manos[estado.lado];
        if (seSuelta(mano, estado, dt, A, estado.inicial)) { dejar(); return; }
        if (mano.seguida && mano.centro.y - estado.alturaPosado >= A.levantar && enC(mano)) { tomar('envolvente', estado.lado); estado.levantado = true; return; }
        estado.fuera = mano.seguida && !palmaJunto(mano, A.palma + A.retirar, false) ? estado.fuera + dt : 0;
        if (estado.fuera >= A.soltar) dejar();
        return;
      }

      // Primero sigue a la mano; después se comprueba si la mano lo sigue envolviendo (con el termo ya en ella).
      agarre.update(dt, entidad, estado.modo === 'envolvente' ? estado.lado : null);
      const empuje = apoyar(root, visual);
      if (estado.modo === 'envolvente') {
        const altura = alturaSobreEscritorio();
        if (altura > A.levantado) estado.levantado = true;
        // Bajado hasta el escritorio (la mano lo empuja contra él): queda posado.
        if (estado.levantado && empuje > A.posar) {
          Object.assign(estado, { modo: 'posado', fuera: 0, suelto: 0, alturaPosado: manos[estado.lado].centro.y });
          estado.posados += 1;
          return;
        }
        if (seSuelta(manos[estado.lado], estado, dt, A, estado.inicial)) {
          // Dedos estirados: junto al escritorio se queda; en el aire vuelve a su lugar.
          if (altura <= A.cercaMesa) dejar(); else soltar();
          return;
        }
      }
      revisarHielo(dt);
      if (habilitado) revisarSorbo();
    },
    // Centro del cuerpo del termo en el mundo (pruebas).
    centroMundo: () => { root.updateWorldMatrix(true, false); return root.localToWorld(centro.clone()); },
    medidas: () => ({ ...cilindro(), centro: centro.clone() }),
    // En la mano (cualquier modo de agarre) y su cilindro en el mundo: la mano dibujada lo rodea en vez de atravesarlo.
    get sostenido() { return !!estado.modo; },
    cilindroMundo(destino = {}) {
      const { radio, alto } = cilindro();
      destino.centro = (destino.centro ?? new THREE.Vector3()).copy(base).addScaledVector(eje, alto / 2);
      destino.eje = (destino.eje ?? new THREE.Vector3()).copy(eje);
      destino.radio = radio;
      destino.mitad = alto / 2;
      // Con el agarre envolvente (o posado con la mano alrededor), la mano que lo rodea dibuja la postura de agarre
      // (oclusion.js); suelto, la mano dibujada lo rodea sin atravesarlo.
      destino.envolvente = estado.modo === 'envolvente' || (estado.modo === 'posado' && estado.fuera === 0);
      destino.lado = estado.lado;
      return destino;
    }
  };
}
