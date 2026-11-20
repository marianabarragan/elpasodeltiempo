import * as THREE from 'three';
import { GrabSystem } from '@iwsdk/core';

const ABAJO = new THREE.Vector3(0, -1, 0);

/*
 * Pose de un objeto en la mano que lo sostiene. El agarre sigue siendo el de IWSDK (pellizco o botón lateral
 * con OneHandGrabbable, sin trasladar ni girar) o el envolvente del termo; en vez de conservar la distancia
 * arbitraria que había entre la mano y el objeto al tomarlo, cada cuadro se coloca según un perfil de toma
 * calculado con las articulaciones de la mano que lo sostiene (GrabSystem.getHolderHand o la mano indicada).
 * Las direcciones son anatómicas (nudillos del índice al meñique, muñeca a dedos, normal de la palma), así
 * que la toma es la misma para diestros y zurdos sin reflejar el modelo; cada mano admite un ajuste fino.
 *
 * Perfiles:
 * - 'palmar': cruza el puño entre el pulgar y el índice; la punta sale por el lado del meñique, abajo.
 * - 'escritura' (lapicero y crayola): pasa por la pinza y se apoya en el pliegue entre pulgar e índice; la punta
 *   sale delante de la pinza, inclinada hacia el papel. Con `haciaMedio` se apoya además en el dedo medio.
 * - 'envolvente' (termo): el cilindro queda delante de la palma, con su eje a lo largo de los nudillos y la
 *   tapa hacia el lado del pulgar.
 * Con controles (sin articulaciones) se usa el espacio de agarre con una dirección configurable.
 *
 * `medida` describe el objeto en su espacio local: `centro`, `eje` (unitario, hacia la punta o la tapa),
 * `lateral` (unitario, perpendicular) y `largo` (a lo largo del eje). `ajustes.sujecion` es la fracción del
 * largo, desde el extremo trasero, donde lo sostiene la mano.
 */
export function crearAgarre({ world, manos, objeto, perfil, ajustes: A, medida }) {
  const estado = { lado: null, tiempo: 0, filtrada: false };
  const sujecion = new THREE.Vector3(), eje = new THREE.Vector3(), lateral = new THREE.Vector3(), frente = new THREE.Vector3();
  const pliegue = new THREE.Vector3(), desfase = new THREE.Vector3(), escala = new THREE.Vector3(), tmp = new THREE.Vector3();
  const giro = new THREE.Quaternion(), giroPadre = new THREE.Quaternion(), base = new THREE.Matrix4();
  const pose = { sujecion: new THREE.Vector3(), giro: new THREE.Quaternion() };
  const filtro = { sujecion: new THREE.Vector3(), giro: new THREE.Quaternion() };
  const desde = { sujecion: new THREE.Vector3(), giro: new THREE.Quaternion() };
  // Base local del objeto (eje, lateral, frente) y punto de sujeción en su espacio.
  const ejeLocal = medida.eje.clone().normalize();
  const lateralLocal = medida.lateral.clone().addScaledVector(ejeLocal, -medida.lateral.dot(ejeLocal)).normalize();
  const giroLocal = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ejeLocal, lateralLocal, new THREE.Vector3().crossVectors(ejeLocal, lateralLocal)));
  const giroLocalInverso = giroLocal.clone().invert();
  const puntoLocal = medida.centro.clone().addScaledVector(ejeLocal, medida.largo * (A.sujecion - .5));

  // Dirección del eje y punto de sujeción (mundo) para una mano seguida, según el perfil.
  function tomaConMano(mano) {
    const perfilMano = mano.lado === 'left' ? A.izquierda : A.derecha;
    if (perfil === 'palmar') {
      eje.copy(mano.nudillos).multiplyScalar(Math.cos(A.haciaMuneca)).addScaledVector(mano.dedos, -Math.sin(A.haciaMuneca));
      sujecion.copy(mano.pinza).lerp(mano.centro, A.haciaPalma);
      lateral.copy(mano.palma);
    } else if (perfil === 'escritura') {
      const pulgar = mano.puntos.get('thumb-phalanx-proximal'), indice = mano.puntos.get('index-finger-phalanx-proximal');
      pliegue.addVectors(pulgar, indice).multiplyScalar(.5);
      eje.subVectors(mano.pinza, pliegue);
      if (eje.lengthSq() < 1e-8) eje.copy(mano.dedos);
      sujecion.copy(mano.pinza);
      // Toma de trípode (opcional): el punto de sujeción se acerca a la falange distal del medio, donde descansa,
      // como mucho `medioMax` m (si el medio está doblado lejos, la crayola no se aparta de la pinza).
      const medio = A.haciaMedio ? mano.puntos.get('middle-finger-phalanx-distal') : null;
      if (medio) {
        const distancia = medio.distanceTo(sujecion);
        if (distancia > 1e-6) sujecion.lerp(medio, Math.min(A.haciaMedio, (A.medioMax ?? .006) / distancia));
      }
      lateral.copy(mano.palma);
    } else {
      eje.copy(mano.nudillos).negate();
      sujecion.copy(mano.centro).addScaledVector(mano.palma, A.radio() + A.holgura).addScaledVector(mano.dedos, A.radio() * A.haciaDedos);
      lateral.copy(mano.palma).negate();
    }
    eje.normalize();
    if (A.haciaAbajo) eje.addScaledVector(ABAJO, A.haciaAbajo).normalize();
    // Ajuste fino por mano en el marco de la mano (x hacia el meñique, y hacia el dorso, z hacia los dedos).
    const [dx, dy, dz] = perfilMano.desplazamiento;
    sujecion.addScaledVector(mano.nudillos, dx).addScaledVector(mano.palma, -dy).addScaledVector(mano.dedos, dz);
  }

  function tomaConControl(lado) {
    const agarre = world.player.gripSpaces[lado];
    agarre.updateWorldMatrix(true, false);
    agarre.matrixWorld.decompose(sujecion, giro, escala);
    eje.fromArray(A.control.direccion).normalize().applyQuaternion(giro);
    if (A.haciaAbajo) eje.addScaledVector(ABAJO, A.haciaAbajo).normalize();
    sujecion.add(desfase.fromArray(A.control.desplazamiento).applyQuaternion(giro));
    lateral.set(1, 0, 0).applyQuaternion(giro);
  }

  // Pose objetivo (punto de sujeción y giro en el mundo): false si no hay datos de esa mano.
  function calcular(lado) {
    const mano = manos[lado];
    if (mano.seguida) tomaConMano(mano);
    else if (mano.control) tomaConControl(lado);
    else return false;
    lateral.addScaledVector(eje, -lateral.dot(eje));
    if (lateral.lengthSq() < 1e-6) lateral.set(0, 1, 0).addScaledVector(eje, -eje.y);
    lateral.normalize();
    frente.crossVectors(eje, lateral);
    pose.sujecion.copy(sujecion);
    // Giro del objeto: lleva su base local (eje, lateral, frente) a la de la mano.
    pose.giro.setFromRotationMatrix(base.makeBasis(eje, lateral, frente)).multiply(giroLocalInverso);
    return true;
  }

  // Coloca el objeto para que su punto de sujeción quede en `punto` con el giro `giroMundo`.
  function aplicar(punto, giroMundo) {
    objeto.getWorldScale(escala);
    tmp.copy(puntoLocal).multiply(escala).applyQuaternion(giroMundo);
    const padre = objeto.parent;
    padre.updateWorldMatrix(true, false);
    objeto.position.copy(padre.worldToLocal(desfase.copy(punto).sub(tmp)));
    padre.getWorldQuaternion(giroPadre);
    objeto.quaternion.copy(giroPadre.invert().multiply(giroMundo));
  }

  return {
    estado,
    // Al tomarlo: se acomoda en la mano desde donde estaba.
    tomar() {
      objeto.updateWorldMatrix(true, false);
      objeto.getWorldQuaternion(desde.giro);
      objeto.localToWorld(desde.sujecion.copy(puntoLocal));
      Object.assign(estado, { tiempo: 0, filtrada: false, lado: null });
    },
    soltar() { estado.lado = null; },
    // `lado`: mano que lo sostiene si no lo decide IWSDK (agarre envolvente). Devuelve si pudo colocarlo.
    update(dt, entidad, lado = null) {
      const mano = lado ?? world.getSystem(GrabSystem)?.getHolderHand(entidad) ?? null;
      estado.lado = mano;
      if (!mano || !calcular(mano)) return false;
      estado.tiempo += dt;
      if (!estado.filtrada) {
        filtro.sujecion.copy(pose.sujecion);
        filtro.giro.copy(pose.giro);
        estado.filtrada = true;
      } else {
        const alfa = 1 - Math.exp(-A.suavizado * dt);
        filtro.sujecion.lerp(pose.sujecion, alfa);
        filtro.giro.slerp(pose.giro, alfa);
      }
      // Durante `acomodar` segundos pasa de la pose en que estaba a la de la mano.
      const t = A.acomodar > 0 ? THREE.MathUtils.smoothstep(estado.tiempo / A.acomodar, 0, 1) : 1;
      if (t < 1) aplicar(tmp.copy(desde.sujecion).lerp(filtro.sujecion, t).clone(), giro.copy(desde.giro).slerp(filtro.giro, t));
      else aplicar(filtro.sujecion, filtro.giro);
      return true;
    },
    // Punto del objeto en el mundo a una fracción de su largo desde atrás (1 = punta o tapa).
    puntoMundo(fraccion = 1) {
      objeto.updateWorldMatrix(true, false);
      return objeto.localToWorld(medida.centro.clone().addScaledVector(ejeLocal, medida.largo * (fraccion - .5)));
    },
    puntaMundo() { return this.puntoMundo(1); }
  };
}
