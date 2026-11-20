// Prepara las variables globales que esperan los scripts de la experiencia original
// (js/*.js de la carpeta superior). Debe importarse antes que ellos.
import * as THREE from 'three';
import gsap from 'gsap';
import { AssetManager } from '@iwsdk/core';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { url } from '../rutas.js';

let avisar;
// Se cumple cuando World.create termina e inicializa el AssetManager.
export const mundoListo = new Promise(resolve => { avisar = resolve; });
export const marcarMundoListo = world => avisar(world);

const app = window.TimeExperience = window.TimeExperience || {};
window.THREE = THREE;
window.gsap = gsap;
app.ThreeExamples = { toCreasedNormals };
app.runtime = app.runtime || { transitioning: false };

// Los módulos originales piden sus GLB a ModelLoader (js/model-loader.js); se conserva su `bake`
// y aquí solo cambia la lectura de archivos, que pasa al AssetManager de IWSDK.
// La vejez XR no usa pared ni paisaje de ventana (solo el marco), así que no se descargan; el mantel
// figura en js/oldage-models.js con una ruta que no existe y, como en la web, se usa el provisional.
// En la adultez tampoco hay pared; el escritorio (mesa.glb) sí se carga: es la base del escenario.
const NO_SE_USAN_EN_XR = new Set([
  'assets/models/adulthood/pared_fondo/pared_fondo.glb',
  'assets/models/oldage/pared/pared.glb',
  'assets/models/oldage/ventana/ventanaexterior.glb',
  'assets/models/oldage/reposamatera/reposamatera.glb'
]);
export const cargarModelo = ruta => NO_SE_USAN_EN_XR.has(ruta)
  ? Promise.reject(new Error('no se usa en la versión de realidad mixta'))
  : mundoListo.then(() => AssetManager.loadGLTF(url(ruta), ruta));
