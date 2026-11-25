import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../../config.js';

const LADOS = ['left', 'right'];

/*
 * Perillas de la radio. El modelo de Blender (radio.glb) es una sola malla; como hace la web con la antena
 * (prepareRadio en js/oldage-models.js), se buscan sus partes sueltas (triángulos unidos por vértices que
 * coinciden) y las que forman cada perilla del frente pasan a un pivote propio en su centro, con el eje
 * perpendicular al frente. Debe hacerse antes de crear la visión borrosa, para que sus copias giren con ellas.
 * Medidas en el espacio de la raíz de la radio (unidades de js/oldage-props.js).
 */
export function prepararPerillas(radio) {
  const { root, visual } = radio;
  root.updateMatrixWorld(true);
  const aRaiz = root.matrixWorld.clone().invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const piezas = [];
  visual.traverse(malla => {
    if (!malla.isMesh || /-antenna$/.test(malla.name) || malla.userData.glowShell || malla.userData.desenfoque) return;
    const g = malla.geometry, pos = g.attributes.position;
    const indices = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
    // Une los vértices que ocupan el mismo lugar y agrupa los triángulos conectados.
    const clave = i => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const padre = new Map();
    const raiz = k => { while (padre.get(k) !== k) { padre.set(k, padre.get(padre.get(k))); k = padre.get(k); } return k; };
    for (let i = 0; i < pos.count; i++) { const k = clave(i); if (!padre.has(k)) padre.set(k, k); }
    for (let t = 0; t < indices.length; t += 3) {
      const a = raiz(clave(indices[t]));
      [indices[t + 1], indices[t + 2]].forEach(j => { const b = raiz(clave(j)); if (a !== b) padre.set(b, a); });
    }
    m.multiplyMatrices(aRaiz, malla.matrixWorld);
    const grupos = new Map();
    for (let t = 0; t < indices.length; t += 3) {
      const r = raiz(clave(indices[t]));
      if (!grupos.has(r)) grupos.set(r, { malla, triangulos: [], caja: new THREE.Box3() });
      const grupo = grupos.get(r);
      grupo.triangulos.push(t);
      for (let k = 0; k < 3; k++) grupo.caja.expandByPoint(v.fromBufferAttribute(pos, indices[t + k]).applyMatrix4(m));
    }
    grupos.forEach(grupo => piezas.push(grupo));
  });
  if (!piezas.length) return [];
  // Las perillas: piezas pequeñas que sobresalen del frente, a los lados (no el dial ni la rejilla del centro).
  const cuerpo = piezas.reduce((a, b) => (b.caja.getSize(v).lengthSq() > a.caja.getSize(new THREE.Vector3()).lengthSq() ? b : a));
  const cajaCuerpo = cuerpo.caja, ancho = cajaCuerpo.max.x - cajaCuerpo.min.x, alto = cajaCuerpo.max.y - cajaCuerpo.min.y;
  const frente = cajaCuerpo.max.z;
  const deLaPerilla = piezas.filter(p => {
    const t = p.caja.getSize(new THREE.Vector3()), c = p.caja.getCenter(new THREE.Vector3());
    return p !== cuerpo && Math.max(t.x, t.y) < ancho * .16 && p.caja.max.z > frente - .02 && Math.abs(c.x - (cajaCuerpo.min.x + cajaCuerpo.max.x) / 2) > ancho * .15
      && c.y > cajaCuerpo.min.y + alto * .15 && c.y < cajaCuerpo.min.y + alto * .6;
  });
  // Agrupa por lado (izquierda y derecha del frente).
  const medioX = (cajaCuerpo.min.x + cajaCuerpo.max.x) / 2;
  const perillas = [-1, 1].map(lado => deLaPerilla.filter(p => Math.sign(p.caja.getCenter(v).x - medioX) === lado)).filter(grupo => grupo.length);
  return perillas.map((grupo, n) => {
    const caja = grupo.reduce((b, p) => b.union(p.caja), new THREE.Box3());
    const centro = caja.getCenter(new THREE.Vector3());
    centro.z = caja.min.z;
    // El pivote cuelga del padre de las mallas (todas comparten padre: son las partes de una malla de Blender).
    const padreMallas = grupo[0].malla.parent;
    padreMallas.updateMatrixWorld(true);
    const enPadre = p => padreMallas.worldToLocal(root.localToWorld(p.clone()));
    const pivote = new THREE.Group();
    pivote.name = `radio-perilla-${n + 1}`;
    pivote.position.copy(enPadre(centro));
    const eje = enPadre(centro.clone().add(new THREE.Vector3(0, 0, 1))).sub(pivote.position).normalize();
    padreMallas.add(pivote);
    // Cada malla de origen cede los triángulos de la perilla a una copia que comparte sus atributos.
    new Set(grupo.map(p => p.malla)).forEach(malla => {
      const indices = malla.geometry.index ? malla.geometry.index.array : Array.from({ length: malla.geometry.attributes.position.count }, (_, i) => i);
      const propios = new Set(grupo.filter(p => p.malla === malla).flatMap(p => p.triangulos));
      const separar = filtro => {
        const lista = [];
        for (let t = 0; t < indices.length; t += 3) if (filtro(propios.has(t))) lista.push(indices[t], indices[t + 1], indices[t + 2]);
        return lista;
      };
      const geometria = new THREE.BufferGeometry();
      Object.entries(malla.geometry.attributes).forEach(([nombre, atributo]) => geometria.setAttribute(nombre, atributo));
      geometria.setIndex(separar(es => es));
      geometria.computeBoundingBox(); geometria.computeBoundingSphere();
      const parte = new THREE.Mesh(geometria, malla.material);
      parte.name = `${malla.name}-perilla`;
      parte.castShadow = malla.castShadow; parte.receiveShadow = malla.receiveShadow;
      parte.applyMatrix4(malla.matrix);
      parte.position.sub(pivote.position);
      pivote.add(parte);
      const resto = malla.geometry.clone();
      resto.setIndex(separar(es => !es));
      resto.computeBoundingBox(); resto.computeBoundingSphere();
      malla.geometry = resto;
    });
    return { pivote, eje, centro, radio: Math.max(caja.max.x - caja.min.x, caja.max.y - caja.min.y) / 2, angulo: 0 };
  });
}

/*
 * Encender la radio girando una perilla: un pellizco (o el gatillo) junto a una perilla la toma y, mientras
 * se sostiene, la perilla sigue el giro de la muñeca alrededor de su eje (en sentido horario visto de frente).
 * Al pasar `encender` rad suena la radio con su animación de la web (OldAgeScene.poke: se mece, la antena
 * oscila y suma el hito «extra»); volviéndola por debajo de `apagar` rad, el sonido se apaga suavemente.
 * Con las manos, el giro se mide con la línea de los nudillos; con controles, con el eje lateral del control.
 */
export function crearRadio({ world, manos, radio, perillas, sonido, alEncender }) {
  const A = AJUSTES.vejez.radio;
  const estado = { habilitada: false, encendida: false, giro: null, encendidos: 0, previo: { left: false, right: false } };
  const centroMundo = new THREE.Vector3(), ejeMundo = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), ref = new THREE.Vector3();
  const giroRaiz = new THREE.Quaternion(), giroControl = new THREE.Quaternion();
  const escalas = new Map(perillas.map(p => [p, p.pivote.scale.x]));

  const centroDe = perilla => { perilla.pivote.updateWorldMatrix(true, false); return perilla.pivote.getWorldPosition(centroMundo); };
  function marco(perilla) {
    radio.root.getWorldQuaternion(giroRaiz);
    ejeMundo.set(0, 0, 1).applyQuaternion(giroRaiz).normalize();
    u.set(1, 0, 0).applyQuaternion(giroRaiz).normalize();
    w.crossVectors(ejeMundo, u);
  }
  // Ángulo de la mano alrededor del eje de la perilla (frente de la radio).
  function anguloMano(lado, perilla) {
    const mano = manos[lado];
    if (mano.seguida) ref.copy(mano.nudillos);
    else {
      world.player.gripSpaces[lado].getWorldQuaternion(giroControl);
      ref.set(1, 0, 0).applyQuaternion(giroControl);
    }
    marco(perilla);
    return Math.atan2(ref.dot(w), ref.dot(u));
  }
  const envolver = a => Math.atan2(Math.sin(a), Math.cos(a));
  function aplicar(perilla) { perilla.pivote.quaternion.setFromAxisAngle(perilla.eje, -perilla.angulo); }

  function apagarSonido() {
    const audio = sonido.effects?.get('radio');
    if (!audio || audio.paused) return;
    clearInterval(sonido.effectTimers?.get('radio'));
    sonido.fade?.(audio, 0, .45, () => audio.pause());
  }

  function senalar(perilla, activo) {
    if (perilla.senalada === activo) return;
    perilla.senalada = activo;
    const k = escalas.get(perilla) * (activo ? A.agrandar : 1);
    gsap.to(perilla.pivote.scale, { x: k, y: k, z: k, duration: .25, ease: 'power2.out', overwrite: true });
  }

  return {
    estado, perillas,
    get girando() { return !!estado.giro; },
    habilitar() { estado.habilitada = true; },
    deshabilitar() { estado.habilitada = false; estado.giro = null; perillas.forEach(p => senalar(p, false)); },
    // REPETIR: apagada.
    reiniciar() { this.deshabilitar(); estado.encendida = false; },
    // Centro de una perilla en el mundo (pruebas).
    centroPerilla: i => centroDe(perillas[i]).clone(),
    update(dt, habilitado) {
      const empieza = {};
      LADOS.forEach(lado => { const ahora = manos[lado].pellizco; empieza[lado] = ahora && !estado.previo[lado]; estado.previo[lado] = ahora; });
      if (!estado.habilitada || !habilitado || !perillas.length) { estado.giro = null; return; }
      // Señal: la perilla más cercana a una mano libre se agranda un poco.
      perillas.forEach(p => {
        const cerca = LADOS.some(lado => (manos[lado].seguida || manos[lado].control) && manos[lado].pinza.distanceTo(centroDe(p)) < A.senal);
        senalar(p, cerca || estado.giro?.perilla === p);
      });
      if (estado.giro) {
        const { lado, perilla } = estado.giro;
        if (!manos[lado].pellizco) { estado.giro = null; return; }
        // Giro acumulado con la muñeca (horario visto de frente = positivo), entre 0 y el máximo.
        const angulo = anguloMano(lado, perilla), paso = envolver(angulo - estado.giro.previo);
        estado.giro.previo = angulo;
        perilla.angulo = THREE.MathUtils.clamp(perilla.angulo - paso, 0, A.maximo);
        aplicar(perilla);
        const maximo = Math.max(...perillas.map(p => p.angulo));
        if (!estado.encendida && maximo >= A.encender) {
          estado.encendida = true;
          estado.encendidos += 1;
          alEncender();
        } else if (estado.encendida && maximo <= A.apagar) {
          estado.encendida = false;
          apagarSonido();
        }
        return;
      }
      for (const lado of LADOS) {
        if (!empieza[lado] || !(manos[lado].seguida || manos[lado].control)) continue;
        const perilla = perillas.find(p => manos[lado].pinza.distanceTo(centroDe(p)) <= A.alcance);
        if (!perilla) continue;
        estado.giro = { lado, perilla, previo: anguloMano(lado, perilla) };
        break;
      }
    }
  };
}
