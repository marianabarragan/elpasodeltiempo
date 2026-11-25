import * as THREE from 'three';
import { AJUSTES } from './config.js';

const LADOS = ['left', 'right'];
const DEDOS = ['index', 'middle', 'ring', 'pinky'];
const ARRIBA = new THREE.Vector3(0, 1, 0);

/*
 * Postura de cada mano en el mundo, cada cuadro. Con seguimiento de manos se leen las articulaciones que
 * IWSDK ya consulta (XRHandVisualAdapter rellena `jointTransforms` con XRFrame.fillPoses respecto del
 * espacio de agarre) y se derivan:
 * - `nudillos`: dirección del nudillo del índice al del meñique (igual en las dos manos);
 * - `dedos`: dirección de la muñeca a los nudillos;
 * - `palma`: normal hacia donde mira la palma (su signo depende de la mano);
 * - `pinza`: punto medio entre las puntas del pulgar y del índice; `centro`: centro de la palma;
 * - `bandeja`: palma hacia arriba con los dedos extendidos (gesto de trasladar el escenario).
 * Con controles no hay articulaciones: `centro` es el espacio de agarre y `bandeja` el botón lateral.
 */
export function crearManos(world) {
  const M = AJUSTES.manipulacion;
  // `radios`: radio de cada articulación (m), del centro a la piel, en el orden de `puntos` (XRFrame.fillJointRadii;
  // depende del tamaño real de la mano). `conRadios` indica si el visor los entregó en este cuadro.
  const nueva = lado => ({
    lado, seguida: false, control: false, puntos: new Map(), giros: new Map(), radios: new Map(), conRadios: false,
    nudillos: new THREE.Vector3(), dedos: new THREE.Vector3(), palma: new THREE.Vector3(),
    pinza: new THREE.Vector3(), centro: new THREE.Vector3(), abierta: false, bandeja: false, pellizco: false
  });
  const manos = { left: nueva('left'), right: nueva('right') };
  const matriz = new THREE.Matrix4(), mundo = new THREE.Matrix4(), escala = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const punto = (mano, nombre) => {
    if (!mano.puntos.has(nombre)) mano.puntos.set(nombre, new THREE.Vector3());
    return mano.puntos.get(nombre);
  };

  const radios = new Float32Array(25);
  function leerRadios(mano, adaptador) {
    const cuadro = world.renderer.xr.getFrame?.();
    const n = adaptador.jointSpaces.length;
    mano.conRadios = n <= radios.length && !!cuadro?.fillJointRadii?.(adaptador.jointSpaces, n === radios.length ? radios : radios.subarray(0, n));
    if (mano.conRadios) adaptador.jointSpaces.forEach((articulacion, i) => mano.radios.set(articulacion.jointName, radios[i]));
  }

  function leerArticulaciones(mano, adaptador, agarre) {
    agarre.updateWorldMatrix(true, false);
    // Posición y giro de cada articulación en el mundo (el giro lo usa la mano dibujada, oclusion.js).
    adaptador.jointSpaces.forEach((articulacion, i) => {
      const nombre = articulacion.jointName;
      if (!mano.giros.has(nombre)) mano.giros.set(nombre, new THREE.Quaternion());
      mundo.multiplyMatrices(agarre.matrixWorld, matriz.fromArray(adaptador.jointTransforms, i * 16)).decompose(punto(mano, nombre), mano.giros.get(nombre), escala);
    });
    leerRadios(mano, adaptador);
    const p = nombre => mano.puntos.get(nombre);
    const muneca = p('wrist'), indice = p('index-finger-phalanx-proximal'), menique = p('pinky-finger-phalanx-proximal'), medio = p('middle-finger-phalanx-proximal');
    if (!muneca || !indice || !menique || !medio) return false;
    mano.nudillos.subVectors(menique, indice).normalize();
    mano.dedos.subVectors(medio, muneca).normalize();
    // Mano derecha con la palma abajo: nudillos = +X, dedos = −Z, palma = dedos × nudillos = −Y. En la izquierda se invierte.
    if (mano.lado === 'right') mano.palma.crossVectors(mano.dedos, mano.nudillos);
    else mano.palma.crossVectors(mano.nudillos, mano.dedos);
    mano.palma.normalize();
    mano.pinza.addVectors(p('thumb-tip'), p('index-finger-tip')).multiplyScalar(.5);
    mano.centro.addVectors(muneca, medio).multiplyScalar(.5);
    // Un dedo está extendido si su punta queda bastante más lejos de la muñeca que su nudillo.
    const extendidos = DEDOS.filter(dedo => {
      const nudillo = p(`${dedo}-finger-phalanx-proximal`), punta = p(`${dedo}-finger-tip`);
      return a.subVectors(punta, muneca).length() > M.extendido * b.subVectors(nudillo, muneca).length();
    }).length;
    mano.abierta = extendidos >= M.dedos;
    return true;
  }

  /*
   * Botón lateral de los controles. IWSDK elige un solo puntero activo por prioridad (toque, agarre, rayo);
   * con el ajuste de parche-puntero.js el toque gana cuando la punta del índice está a 5 cm o menos de algo
   * tocable. Junto a la caja de crayolas las crayolas siempre quedan así de cerca, y el botón lateral no
   * llegaba al agarre de la caja. Con las manos, GrabSystem ya envía el pellizco directo al puntero de
   * agarre (MultiPointer.routeDown); aquí se hace lo mismo con el botón lateral si el agarre tiene un
   * objeto al alcance y no lo capturó ya por su cuenta.
   */
  const enrutado = { left: false, right: false };
  function enrutarBotonLateral(lado) {
    const multi = world.input?.xr?.multiPointers?.[lado], gamepad = world.input?.xr?.gamepads?.[lado];
    if (!multi?.routeDown || !gamepad?.getButtonDown) return;
    const agarre = multi.getPointer('grab');
    if (gamepad.getButtonDown('xr-standard-squeeze') && agarre?.getIntersection?.() && !agarre.getPointerCapture?.()) {
      multi.routeDown('squeeze', 'grab', { timeStamp: performance.now() });
      enrutado[lado] = true;
    }
    if (enrutado[lado] && gamepad.getButtonUp('xr-standard-squeeze')) {
      multi.routeUp('squeeze', 'grab', { timeStamp: performance.now() });
      enrutado[lado] = false;
    }
  }

  return {
    ...manos,
    lados: LADOS,
    actualizar() {
      for (const lado of LADOS) {
        const mano = manos[lado];
        const adaptador = world.input?.xr?.visualAdapters?.hand?.[lado];
        const agarre = world.player.gripSpaces?.[lado];
        const gamepad = world.input?.xr?.gamepads?.[lado];
        mano.pellizco = !!gamepad?.getSelecting?.();
        mano.seguida = !!(adaptador?.connected && adaptador.jointTransforms && adaptador.jointSpaces?.length && agarre)
          && leerArticulaciones(mano, adaptador, agarre);
        mano.control = !mano.seguida && !!gamepad && !!agarre;
        if (mano.seguida) {
          mano.bandeja = mano.abierta && !mano.pellizco && mano.palma.dot(ARRIBA) > M.palmaArriba;
        } else if (mano.control) {
          enrutarBotonLateral(lado);
          agarre.updateWorldMatrix(true, false);
          agarre.getWorldPosition(mano.centro);
          world.player.indexTipSpaces?.[lado]?.getWorldPosition(mano.pinza) ?? mano.pinza.copy(mano.centro);
          mano.bandeja = !!gamepad.getButtonPressed?.('xr-standard-squeeze');
        } else {
          mano.bandeja = false;
        }
      }
    },
    // Articulación de una mano seguida (o null).
    articulacion: (lado, nombre) => (manos[lado].seguida ? manos[lado].puntos.get(nombre) ?? null : null)
  };
}
