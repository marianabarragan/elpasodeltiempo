import * as THREE from 'three';

const PUNTAS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const LADOS = ['left', 'right'];

/*
 * Puntas de los dedos en el mundo, cada cuadro. Con seguimiento de manos se leen las cinco puntas de cada
 * mano de las articulaciones que IWSDK ya consulta (XRHandVisualAdapter rellena `jointTransforms` con
 * XRFrame.fillPoses respecto del espacio de agarre); con controles queda la punta del índice que IWSDK
 * calcula para el toque (world.player.indexTipSpaces).
 */
export function crearDedos(world) {
  const reserva = Array.from({ length: 10 }, () => ({ lado: '', dedo: '', posicion: new THREE.Vector3() }));
  const puntas = [];
  const matriz = new THREE.Matrix4();
  return {
    puntas,
    // Solo las puntas de los índices (para el calendario).
    indices: () => puntas.filter(p => p.dedo === 'index-finger-tip'),
    actualizar() {
      puntas.length = 0;
      let k = 0;
      for (const lado of LADOS) {
        const mano = world.input?.xr?.visualAdapters?.hand?.[lado];
        const agarre = world.player.gripSpaces?.[lado];
        if (mano?.connected && mano.jointTransforms && mano.jointSpaces?.length && agarre) {
          agarre.updateWorldMatrix(true, false);
          mano.jointSpaces.forEach((articulacion, i) => {
            if (!PUNTAS.includes(articulacion.jointName)) return;
            const punta = reserva[k++];
            punta.lado = lado; punta.dedo = articulacion.jointName;
            punta.posicion.setFromMatrixPosition(matriz.fromArray(mano.jointTransforms, i * 16)).applyMatrix4(agarre.matrixWorld);
            puntas.push(punta);
          });
        } else if (world.player.indexTipSpaces?.[lado]) {
          const punta = reserva[k++];
          punta.lado = lado; punta.dedo = 'index-finger-tip';
          world.player.indexTipSpaces[lado].getWorldPosition(punta.posicion);
          puntas.push(punta);
        }
      }
    }
  };
}

// Caja de `objetos` en el espacio local de `raiz` (la raíz no necesita estar en el origen).
export function cajaLocal(raiz, objetos) {
  raiz.updateWorldMatrix(true, true);
  const inversa = raiz.matrixWorld.clone().invert(), caja = new THREE.Box3(), parcial = new THREE.Box3(), m = new THREE.Matrix4();
  [].concat(objetos).forEach(objeto => objeto.traverse(malla => {
    if (!malla.isMesh) return;
    malla.geometry.computeBoundingBox();
    caja.union(parcial.copy(malla.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inversa, malla.matrixWorld)));
  }));
  return caja;
}

/*
 * Botón físico: se pulsa cuando cualquier punta de dedo entra a menos de `margen` m de sus mallas y se
 * rearma cuando todas las puntas salen a más de `rearme` veces ese margen, así un toque cuenta una vez.
 * `raiz` es el objeto en cuyo espacio se mide (sus mallas pueden ser hijas suyas o estar en otro lado).
 */
export function crearBoton({ raiz, mallas, margen, rearme, alPulsar }) {
  const caja = cajaLocal(raiz, mallas);
  const local = new THREE.Vector3(), escala = new THREE.Vector3(), giro = new THREE.Quaternion(), inversa = new THREE.Matrix4();
  const estado = { armado: true, pulsaciones: 0, dedo: null };
  const dentro = (punto, distancia) => caja.distanceToPoint(punto) <= distancia;
  return {
    estado, caja,
    actualizar(puntas, habilitado) {
      raiz.updateWorldMatrix(true, false);
      raiz.matrixWorld.decompose(local, giro, escala);
      const metro = 1 / Math.max(1e-6, Math.abs(escala.x));
      inversa.copy(raiz.matrixWorld).invert();
      let cerca = false, toca = null;
      for (const punta of puntas) {
        local.copy(punta.posicion).applyMatrix4(inversa);
        if (dentro(local, margen * rearme * metro)) cerca = true;
        if (!toca && dentro(local, margen * metro)) toca = punta;
      }
      if (!cerca) estado.armado = true;
      if (toca && estado.armado && habilitado) {
        estado.armado = false;
        estado.pulsaciones += 1;
        estado.dedo = toca.dedo;
        alPulsar(toca);
      }
    }
  };
}
