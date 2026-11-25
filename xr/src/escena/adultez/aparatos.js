import * as THREE from 'three';
import gsap from 'gsap';
import { AJUSTES } from '../../config.js';
import { cajaLocal, crearBoton } from './dedos.js';

/*
 * Monitor y reloj digital: cada uno se apaga y se enciende con su botón físico, tocándolo con la punta de
 * cualquier dedo (crearBoton). El encendido es el de la web (AdulthoodScene.toggleScreen y el reloj de
 * activateProp): pantalla e indicador del monitor (monitorScreen.setPower) y luz y dígitos del reloj
 * (clock.setPower), con sus sonidos. El monitor empieza apagado; encenderlo muestra el correo (computador.js,
 * avisado con `alPantalla`) y no suma el hito por sí solo: el del computador llega al terminar el correo. El
 * reloj suma su hito la primera vez que cambia de estado.
 */
export function crearAparatos({ props, sonido, alHito, alPantalla }) {
  const A = AJUSTES.adultez.boton;
  const botonMonitor = props.interactive.monitorPower, reloj = props.models.clockDigital;
  const estado = { pantalla: false, reloj: true, ultimo: { monitor: -Infinity, reloj: -Infinity } };
  // El monitor empieza apagado (pantalla negra).
  props.monitorScreen.setPower(false);
  // Evita que un mismo toque cuente dos veces si el dedo tiembla en el borde del botón.
  const libre = id => {
    const ahora = performance.now() / 1000;
    if (ahora - estado.ultimo[id] < .35) return false;
    estado.ultimo[id] = ahora;
    return true;
  };

  // Botones del reloj: las piezas que sobresalen por encima de la caja, en su esquina derecha.
  const altoReloj = cajaLocal(reloj.root, reloj.visual);
  const botonesReloj = [];
  reloj.visual.traverse(malla => {
    if (!malla.isMesh || /clock-(digits|backlight|display)/.test(malla.name)) return;
    const caja = cajaLocal(reloj.root, malla);
    if (caja.min.y > altoReloj.min.y + (altoReloj.max.y - altoReloj.min.y) * .85) botonesReloj.push({ malla, y: malla.position.y });
  });

  function alternarPantalla() {
    if (!libre('monitor')) return;
    sonido.playEffect('screen');
    estado.pantalla = !estado.pantalla;
    props.monitorScreen.setPower(estado.pantalla);
    gsap.fromTo(botonMonitor.visual.position, { z: -A.hundir }, { z: 0, duration: .25, ease: 'power2.out', overwrite: true });
    alPantalla?.(estado.pantalla);
  }

  function alternarReloj() {
    if (!libre('reloj')) return;
    sonido.playEffect('clock');
    estado.reloj = !estado.reloj;
    props.clock.setPower(estado.reloj);
    botonesReloj.forEach(({ malla, y }) => gsap.fromTo(malla.position, { y: y - A.hundir }, { y, duration: .25, ease: 'power2.out', overwrite: true }));
    alHito('reloj');
  }

  const botones = {
    monitor: crearBoton({ raiz: botonMonitor.root, mallas: botonMonitor.visual, margen: A.margen, rearme: A.rearme, alPulsar: alternarPantalla }),
    reloj: crearBoton({ raiz: reloj.root, mallas: botonesReloj.length ? botonesReloj.map(b => b.malla) : reloj.visual, margen: A.margen, rearme: A.rearme, alPulsar: alternarReloj })
  };

  return {
    // REPETIR: monitor apagado y reloj encendido, como al empezar.
    reiniciar() {
      estado.pantalla = false;
      props.monitorScreen.setPower(false);
      estado.reloj = true;
      props.clock.setPower(true);
      estado.ultimo.monitor = estado.ultimo.reloj = -Infinity;
    },
    estado, botones, alternarPantalla, alternarReloj,
    // Centro de cada botón en el mundo (para las pruebas y para ubicar ayudas).
    centro: id => {
      const { caja } = botones[id], raiz = id === 'monitor' ? botonMonitor.root : reloj.root;
      raiz.updateWorldMatrix(true, false);
      return caja.getCenter(new THREE.Vector3()).applyMatrix4(raiz.matrixWorld);
    },
    actualizar(puntas, habilitado) {
      botones.monitor.actualizar(puntas, habilitado);
      botones.reloj.actualizar(puntas, habilitado);
    }
  };
}
