// Se importa justo después de js/model-loader.js: mantiene bake y shade originales
// y redirige la carga de GLB al AssetManager de IWSDK.
import { cargarModelo } from './globales.js';

window.TimeExperience.ModelLoader.load = cargarModelo;
