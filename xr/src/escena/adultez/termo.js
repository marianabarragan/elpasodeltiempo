import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../../config.js';
import { crearAgarre, seSuelta } from '../agarre.js';

const PUNTAS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const ARRIBA = new THREE.Vector3(0, 1, 0);

/*
 * Termo de café (storyboard 8, corregido tras las pruebas en Quest 3).
 *
 * Agarre con toda la mano (corrección): con las manos el vaso solo se toma rodeándolo; el pellizco ya no lo
 * levanta (la mano lo atravesaba). Se detecta el contacto de la mano con el cuerpo del termo: la palma junto a su
 * eje y al menos tres puntas de dedo alrededor de su superficie durante un instante. No es un reconocedor de
 * posturas: mide distancias entre las articulaciones (las que IWSDK ya lee) y el cilindro. Se suelta solo al abrir
 * la mano con claridad (agarre.js, seSuelta), no cuando el visor pierde de vista un dedo. Sostenido, el termo se coloca
 * en la mano con el perfil 'envolvente' de agarre.js (igual en las dos manos) y la mano dibujada toma la postura de
 * agarre (oclusion.js): sus dedos lo envuelven según su diámetro, sin atravesarlo ni deformarse.
 * Con controles (sin manos) se toma con el botón lateral (agarre de IWSDK).
 *
 * Sacudirlo hace sonar el hielo (sonido-hielo.js) según la fuerza del movimiento; es opcional y no suma.
 * Beber (el hito): acercar la tapa a la boca, estimada desde la pose del visor, e inclinar el termo; suena
 * el sorbo una vez por gesto y el hito se suma solo la primera vez.
 */
export function crearTermo({ world, manos, termo, entidad, hielo, sonido, cabeza, apoyar, alBeber }) {
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
  const estado = {
    habilitado: false, modo: null, lado: null, candidato: null, espera: 0, suelto: 0,
    bebido: false, sorbos: 0, listoParaBeber: true, choques: 0, envolturas: 0
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
  // Distancia (m) de un punto al eje y altura relativa a lo largo de él (0 base, 1 tapa).
  function respectoDelEje(punto, alto) {
    v.subVectors(punto, base);
    const t = v.dot(eje);
    return { d: v.addScaledVector(eje, -t).length(), h: t / alto };
  }
  // Cuántas puntas de dedo rodean el cilindro (cerca de su superficie, a la altura del cuerpo) y si la palma está junto a él.
  function envoltura(mano, holguraPuntas) {
    const { radio, alto } = cilindro();
    const palma = respectoDelEje(mano.centro, alto);
    const palmaJunto = palma.d <= radio + A.palma && palma.h > -.1 && palma.h < 1.1;
    let puntas = 0;
    for (const nombre of PUNTAS) {
      const p = mano.puntos.get(nombre);
      if (!p) continue;
      const r = respectoDelEje(p, alto);
      if (r.d <= radio + holguraPuntas && r.h > -.05 && r.h < 1.05) puntas += 1;
    }
    return { palmaJunto, puntas };
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
    Object.assign(estado, { modo, lado, suelto: 0 });
    conPrevia = false;
    rumbo.set(0, 0, 0);
    agarre.tomar();
  }
  function soltar() {
    if (!estado.modo) return;
    Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0 });
    agarre.soltar();
    volver();
  }

  return {
    estado, agarre,
    // Sostenido con el agarre envolvente (IWSDK no lo marca como Grabbed): bloquea el gesto del escenario.
    get envuelto() { return estado.modo === 'envolvente'; },
    get sostenido() { return !!estado.modo; },
    habilitar() { estado.habilitado = true; },
    // REPETIR: en su lugar (la instantánea), sin haber bebido.
    reiniciar() {
      regreso?.kill();
      regreso = null;
      if (estado.modo) agarre.soltar();
      Object.assign(estado, { modo: null, lado: null, candidato: null, espera: 0, suelto: 0, bebido: false, sorbos: 0, listoParaBeber: true });
    },
    deshabilitar() {
      estado.habilitado = false;
      world.getSystem(GrabSystem)?.forceRelease(entidad);
      if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      soltar();
    },
    // Agarre de IWSDK (pellizco o botón lateral).
    sostener(activo) {
      if (activo) { if (estado.habilitado && estado.modo !== 'envolvente') tomar('iwsdk', null); return; }
      if (estado.modo === 'iwsdk') soltar();
    },
    // `ocupadas`: manos que sostienen otra cosa (no pueden envolver el termo).
    update(dt, habilitado, ocupadas = []) {
      if (!estado.habilitado) return;
      // El agarre de IWSDK (pellizco o botón lateral) solo existe con controles: con las manos, solo rodeándolo.
      const conControl = manos.left.control || manos.right.control;
      if (conControl && !entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: false, translate: false });
      if (!conControl && estado.modo !== 'iwsdk' && entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
      if (!estado.modo && habilitado) {
        // Una mano libre que envuelve el termo durante `confirmar` s lo toma.
        // Pellizcando no cuenta como rodearlo (solo la mano completa lo toma).
        const lado = manos.lados.find(l => manos[l].seguida && !manos[l].pellizco && !ocupadas.includes(l) && (() => { const e = envoltura(manos[l], A.puntas); return e.palmaJunto && e.puntas >= A.dedos; })());
        if (lado && lado === estado.candidato) {
          if ((estado.espera += dt) >= A.confirmar) { estado.envolturas += 1; tomar('envolvente', lado); }
        } else { estado.candidato = lado ?? null; estado.espera = 0; }
      }
      if (!estado.modo) return;
      // Primero sigue a la mano; después se comprueba si la mano lo sigue envolviendo (con el termo ya en ella).
      agarre.update(dt, entidad, estado.modo === 'envolvente' ? estado.lado : null);
      apoyar(root, visual);
      if (estado.modo === 'envolvente' && seSuelta(manos[estado.lado], estado, dt, A)) { soltar(); return; }
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
      // Con el agarre envolvente, la mano que lo rodea dibuja la postura de agarre (oclusion.js).
      destino.envolvente = estado.modo === 'envolvente';
      destino.lado = estado.lado;
      return destino;
    }
  };
}
