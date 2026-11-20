// Prototipo de realidad mixta de El paso del tiempo para Meta Quest 3.
// Primero se cargan los módulos originales (js/legado/puente.js) y luego el mundo de IWSDK.
import './legado/puente.js';
import './fuentes.js';
import './parche-puntero.js';
import { marcarMundoListo } from './legado/globales.js';
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { iniciarExperiencia } from './narrativa.js';

const world = await World.create(document.getElementById('scene-container'), projectOptions);
marcarMundoListo(world);
const experiencia = await iniciarExperiencia(world);
// Acceso para inspeccionar el estado desde la consola durante el desarrollo.
if (import.meta.env.DEV) window.__xr = experiencia;
