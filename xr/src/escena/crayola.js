import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../config.js';
import { crearAgarre } from './agarre.js';

const MEDIA_HOJA = { x: 4.1, y: 3.075 }; // medio ancho y medio fondo de la hoja en unidades de su geometría

/*
 * Crayola XR. Modos: 'reposo' (aún sin color), 'lista' (se puede agarrar), 'sostenida' y 'volviendo'.
 * Agarrarla no pinta: solo pinta cuando su punta toca la hoja, con histéresis para que el temblor
 * del seguimiento de manos no corte ni inicie trazos. La pintura usa PaintingSystem sin cambios.
 * Mientras pinta, informa al sonido procedural la velocidad de la punta y si va hacia adelante
 * (alejándose del usuario, hacia el borde superior del dibujo) o hacia atrás.
 * Sostenida, su pose la da la mano que la tiene (agarre.js): toma de escritura como la del lapicero (entre
 * el pulgar, el índice y el medio, sostenida un poco más arriba de la punta), con la derecha o la izquierda.
 */
export function crearCrayola({ world, manos, ninez, sonido, alPintar }) {
  const { props, pintura, hoja, crayon, entidades } = ninez;
  // La crayola está centrada en su origen y su punta en +X (afinarCrayola en ninez.js).
  const agarre = crearAgarre({
    world, manos, objeto: crayon, perfil: AJUSTES.crayola.agarre.perfil ?? 'escritura', ajustes: AJUSTES.crayola.agarre,
    medida: { centro: new THREE.Vector3(), eje: new THREE.Vector3(1, 0, 0), lateral: new THREE.Vector3(0, 1, 0), largo: 2 * props.crayonTip.x }
  });
  const estado = { modo: 'reposo', contacto: false, previo: null, filtrado: null, regreso: null, friccion: 0 };
  const punta = new THREE.Vector3(), origen = new THREE.Vector3(), normal = new THREE.Vector3(), local = new THREE.Vector3();
  // Movimiento de la punta para el sonido: posición anterior, velocidad suavizada y eje «adelante» de la hoja.
  const movimiento = { anterior: null, velocidad: new THREE.Vector3(), adelante: new THREE.Vector3(), paso: new THREE.Vector3() };

  const terminarTrazo = () => {
    if (estado.contacto) pintura.endStroke();
    estado.contacto = false;
    estado.previo = estado.filtrado = null;
    estado.friccion = 0;
    sonido.pintando(false);
  };

  // Velocidad (m/s) de la punta sobre el plano de la hoja y su componente hacia adelante (−1 a 1).
  function medirMovimiento(dt) {
    const { anterior, velocidad, adelante, paso } = movimiento;
    if (!anterior || dt <= 0) { movimiento.anterior = punta.clone(); velocidad.set(0, 0, 0); return { rapidez: 0, sentido: 0 }; }
    paso.subVectors(punta, anterior).divideScalar(dt);
    paso.addScaledVector(normal, -paso.dot(normal));
    velocidad.lerp(paso, 1 - Math.exp(-dt / .05));
    anterior.copy(punta);
    adelante.set(0, 1, 0).transformDirection(hoja.matrixWorld);
    const rapidez = velocidad.length();
    return { rapidez, sentido: rapidez > 1e-4 ? velocidad.dot(adelante) / rapidez : 0 };
  }

  return {
    estado, agarre,
    get enReposo() { return estado.modo === 'reposo' || estado.modo === 'lista'; },
    // Tras elegir un color en la caja, la crayola se puede tomar con la mano (pellizco) o el control (agarre).
    // El agarre no la traslada ni la gira: su pose en la mano la calcula agarre.js.
    habilitarAgarre() {
      if (estado.modo === 'reposo') estado.modo = 'lista';
      if (!entidades.crayon.hasComponent(OneHandGrabbable)) entidades.crayon.addComponent(OneHandGrabbable, { rotate: false, translate: false });
    },
    // Vuelve al principio (REPETIR): en reposo, sin color elegido y sin poder tomarla hasta elegir uno.
    reiniciar() {
      terminarTrazo();
      agarre.soltar();
      estado.regreso?.kill();
      estado.regreso = null;
      estado.modo = 'reposo';
      movimiento.anterior = null;
      world.getSystem(GrabSystem)?.forceRelease(entidades.crayon);
      if (entidades.crayon.hasComponent(OneHandGrabbable)) entidades.crayon.removeComponent(OneHandGrabbable);
    },
    tomar() {
      estado.regreso?.kill();
      estado.regreso = null;
      estado.modo = 'sostenida';
      agarre.tomar();
    },
    // Al soltarla vuelve a su lugar sobre la espuma, conservando el color.
    soltar() {
      terminarTrazo();
      agarre.soltar();
      estado.modo = 'volviendo';
      const desde = crayon.position.clone(), giro = crayon.quaternion.clone(), reposo = props.crayonRest, pose = { t: 0 };
      estado.regreso = gsap.to(pose, {
        t: 1, duration: .55, ease: 'power2.inOut',
        onUpdate: () => {
          crayon.position.lerpVectors(desde, reposo.position, pose.t);
          crayon.position.y += Math.sin(pose.t * Math.PI) * .4;
          crayon.quaternion.slerpQuaternions(giro, reposo.quaternion, pose.t);
        },
        onComplete: () => { estado.regreso = null; estado.modo = 'lista'; }
      });
    },
    update(dt) {
      if (estado.modo !== 'sostenida') { movimiento.anterior = null; sonido.crayola.actualizar(dt, false, 0, 0); return; }
      // Pose en la mano que la sostiene; la punta se mide después, ya transformada.
      agarre.update(dt, entidades.crayon);
      crayon.updateWorldMatrix(true, false);
      hoja.updateWorldMatrix(true, false);
      crayon.localToWorld(punta.copy(props.crayonTip));
      origen.setFromMatrixPosition(hoja.matrixWorld);
      normal.set(0, 0, 1).transformDirection(hoja.matrixWorld);
      const { rapidez, sentido } = medirMovimiento(dt);
      // Distancia de la punta al papel en metros (negativa si se hunde) y su lugar sobre la hoja.
      const distancia = local.copy(punta).sub(origen).dot(normal);
      hoja.worldToLocal(local.copy(punta));
      const { contacto, separacion, hundimiento, suavizado } = AJUSTES.pintura;
      const dentro = Math.abs(local.x) <= MEDIA_HOJA.x && Math.abs(local.y) <= MEDIA_HOJA.y;
      const tocando = dentro && distancia >= -hundimiento && distancia <= (estado.contacto ? separacion : contacto);
      if (!tocando) { terminarTrazo(); sonido.crayola.actualizar(dt, false, rapidez, sentido); return; }
      // La punta no atraviesa el papel: la crayola se apoya sobre él.
      if (distancia < 0) crayon.position.y -= distancia / ninez.escala;
      if (!estado.contacto) { estado.contacto = true; pintura.beginStroke(); }
      const actual = { x: (local.x / (2 * MEDIA_HOJA.x) + .5) * pintura.width, y: (.5 - local.y / (2 * MEDIA_HOJA.y)) * pintura.height };
      const filtrado = estado.filtrado
        ? { x: estado.filtrado.x + (actual.x - estado.filtrado.x) * (1 - suavizado), y: estado.filtrado.y + (actual.y - estado.filtrado.y) * (1 - suavizado) }
        : actual;
      estado.filtrado = filtrado;
      // El primer contacto deja un punto, como el clic en la web; después pinta al moverse.
      const desde = estado.previo || filtrado;
      const avanza = !estado.previo || Math.hypot(filtrado.x - desde.x, filtrado.y - desde.y) > .5;
      const pinto = avanza && pintura.stampSegment(desde, filtrado, ninez.color);
      if (avanza) estado.previo = filtrado;
      // La música baja mientras la crayola pinta y vuelve si la punta se queda quieta.
      if (pinto) { estado.friccion = .25; sonido.pintando(true); alPintar?.(); }
      else if ((estado.friccion -= dt) <= 0) sonido.pintando(false);
      // El roce suena solo con la punta en la hoja y pintando; su carácter depende de la velocidad y el sentido.
      sonido.crayola.actualizar(dt, estado.friccion > 0, rapidez, sentido);
    },
    terminarTrazo
  };
}
