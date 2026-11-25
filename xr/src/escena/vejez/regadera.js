import * as THREE from 'three';
import gsap from 'gsap';
import { GrabSystem, OneHandGrabbable } from '@iwsdk/core';
import { AJUSTES } from '../../config.js';

/*
 * Regadera: se toma con la mano, se lleva sobre la planta colocada y se inclina con la muñeca.
 * El agua sale cuando el pico baja unos Config.oldage.pourAngle (40°) con la regadera cerca de la planta;
 * el riego se acumula en segundos reales con OldAgeActivity (4,5 s) y se conserva si se deja de inclinar.
 * Las gotas, su suelo y el sonido del agua siguen js/oldage-scene.js (updateWater); el pico es el anclaje
 * «watering-can-spout» que js/oldage-models.js marca en el extremo del modelo (apunta hacia −X).
 */
export function crearRegadera({ world, regadera, entidad, grupo, actividad, maceta, centro, sonido, indicador, alTerminar }) {
  const app = window.TimeExperience, cfg = app.Config.oldage;
  const { empezar, parar, cerca, alto, sonido: sostenerSonido } = AJUSTES.vejez.regadera;
  const { root, visual, spout } = regadera;
  const reposo = { posicion: root.position.clone(), giro: root.quaternion.clone() };
  const estado = { habilitada: false, sostenida: false, inclinacion: 0, cerca: false, tiempo: 0, ultimaGota: -Infinity };

  // Gotas reutilizables (como buildWater en la web), en el espacio del escenario.
  const color = new THREE.Color(app.OldAgeProps.PALETTE.sky).offsetHSL(0, .2, -.12);
  const geometria = new THREE.IcosahedronGeometry(.075, 0).scale(1, 1.6, 1);
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .25, roughness: .2, transparent: true, opacity: .9 });
  const gotas = Array.from({ length: 70 }, () => {
    const malla = new THREE.Mesh(geometria, material);
    malla.visible = false;
    grupo.add(malla);
    return { malla, velocidad: new THREE.Vector3(), viva: false };
  });
  let aparicion = 0;

  const pico = new THREE.Vector3(), direccion = new THREE.Vector3(), azar = new THREE.Vector3();
  const giroRaiz = new THREE.Quaternion(), giroMundo = new THREE.Quaternion(), aGrupo = new THREE.Quaternion();
  // Ángulo (rad) que el pico baja respecto de la horizontal, en el espacio del escenario.
  function medir() {
    grupo.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, true);
    grupo.worldToLocal(spout.getWorldPosition(pico));
    grupo.getWorldQuaternion(aGrupo).invert();
    root.getWorldQuaternion(giroMundo);
    giroRaiz.copy(aGrupo).multiply(giroMundo);
    direccion.set(-1, 0, 0).applyQuaternion(giroRaiz).normalize();
    estado.inclinacion = Math.asin(THREE.MathUtils.clamp(-direccion.y, -1, 1));
    const suelo = centro.y + maceta().soilY;
    estado.cerca = Math.hypot(pico.x - centro.x, pico.z - centro.z) <= cerca && pico.y > suelo && pico.y < suelo + alto;
    return suelo;
  }

  function terminar() {
    estado.sostenida = false;
    actividad.pouring = false;
    world.getSystem(GrabSystem)?.forceRelease(entidad);
    if (entidad.hasComponent(OneHandGrabbable)) entidad.removeComponent(OneHandGrabbable);
    actividad.set('returning');
    indicador.ocultar();
    alTerminar.riego?.();
    // Vuelve a su lugar de reposo, como finishWatering en la web.
    const desde = root.position.clone(), giroDesde = root.quaternion.clone(), t = { v: 0 };
    gsap.to(t, {
      v: 1, duration: 1.2, delay: .35, ease: 'power2.inOut',
      onUpdate: () => { root.position.lerpVectors(desde, reposo.posicion, t.v).y += Math.sin(t.v * Math.PI) * .5; root.quaternion.slerpQuaternions(giroDesde, reposo.giro, t.v); },
      onComplete: () => { actividad.set('complete'); alTerminar.reposo?.(); }
    });
  }

  return {
    estado,
    habilitar() {
      estado.habilitada = true;
      if (!entidad.hasComponent(OneHandGrabbable)) entidad.addComponent(OneHandGrabbable, { rotate: true, translate: true });
    },
    senalar(activo) {
      const escala = activo && estado.habilitada && actividad.step === 'can' ? 1.06 : 1;
      gsap.to(visual.scale, { x: escala, y: escala, z: escala, duration: .3, ease: 'power2.out', overwrite: 'auto' });
    },
    sostener(activo) {
      if (!estado.habilitada || !['can', 'water'].includes(actividad.step)) return;
      estado.sostenida = activo;
      if (activo && actividad.step === 'can') actividad.set('water');
      if (!activo) actividad.pouring = false;
    },
    // dt en segundos reales: el riego se mide en tiempo, no en cuadros.
    update(dt) {
      estado.tiempo += dt;
      let suelo = -Infinity;
      if (actividad.step === 'water') {
        suelo = medir();
        if (estado.sostenida) root.position.y = Math.max(root.position.y, reposo.posicion.y);
        const umbral = cfg.pourAngle * (actividad.pouring ? parar : empezar);
        const vierte = estado.sostenida && estado.cerca && estado.inclinacion >= umbral;
        if (vierte && !actividad.pouring) indicador.mostrar();
        actividad.pouring = vierte;
        if (vierte) {
          const completo = actividad.addWatering(Math.min(dt, .25));
          indicador.avance(actividad.progress);
          if (completo) terminar();
        }
        indicador.seguir();
      }
      // Gotas desde el pico mientras se vierte. Como en la web, el agua avanza a lo sumo 0,05 s por
      // cuadro: si el visor pierde cuadros cae más despacio en vez de atravesar la tierra sin verse.
      const paso = Math.min(dt, .05);
      if (actividad.pouring) {
        aparicion += paso * 60;
        while (aparicion >= 1) {
          aparicion -= 1;
          const gota = gotas.find(g => !g.viva);
          if (!gota) break;
          gota.viva = true;
          gota.suelo = suelo;
          gota.malla.visible = true;
          gota.malla.position.copy(pico).add(azar.set((Math.random() - .5) * .18, (Math.random() - .5) * .08, (Math.random() - .5) * .18));
          gota.velocidad.copy(direccion).multiplyScalar(.9 + Math.random() * .6).add(azar.set((Math.random() - .5) * .5, -.2, (Math.random() - .5) * .5));
          gota.malla.scale.setScalar(.7 + Math.random() * .6);
        }
      } else aparicion = 0;
      gotas.forEach(gota => {
        if (!gota.viva) return;
        gota.velocidad.y -= 9.5 * paso;
        gota.malla.position.addScaledVector(gota.velocidad, paso);
        if (gota.malla.position.y <= gota.suelo) { gota.viva = false; gota.malla.visible = false; estado.ultimaGota = estado.tiempo; }
      });
      // El agua suena solo mientras cae sobre la planta.
      sonido.setPainting(estado.tiempo - estado.ultimaGota < sostenerSonido);
    },
    // REPETIR: en su lugar y sin poder tomarla hasta elegir maceta.
    reiniciar() {
      this.detener();
      Object.assign(estado, { habilitada: false, sostenida: false, inclinacion: 0, cerca: false, tiempo: 0, ultimaGota: -Infinity });
    },
    detener() {
      actividad.pouring = false;
      gotas.forEach(gota => { gota.viva = false; gota.malla.visible = false; });
      sonido.setPainting(false);
    }
  };
}
