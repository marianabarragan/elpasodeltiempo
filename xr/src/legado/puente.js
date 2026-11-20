// Reutiliza sin modificarlos los módulos de la experiencia de computador.
// El orden importa: cada script lee lo que dejaron los anteriores en window.TimeExperience.
import './globales.js';
import '../../../js/project-config.js';
import '../../../js/model-loader.js';
import './cargador.js';
import '../../../js/intro-textures.js';
import '../../../js/intro-scene.js';
import '../../../js/intro-models.js';
import '../../../js/intro-hourglass.js';
import '../../../js/childhood-models.js';
import '../../../js/childhood-props.js';
import '../../../js/painting-system.js';
import '../../../js/childhood-progress.js';
import '../../../js/crayon-palette.js';
import '../../../js/object-interactions.js';
import '../../../js/childhood-scene.js';
import '../../../js/audio-system.js';
// Adultez: modelos y composición, lista de pendientes (ChecklistSystem) y progreso.
// La escena web (adulthood-scene.js) no se carga: crea su propio renderizador y cámara.
import '../../../js/adulthood-models.js';
import '../../../js/adulthood-props.js';
import '../../../js/checklist-system.js';
import '../../../js/adulthood-progress.js';
// Vejez: modelos y composición, orden de la actividad (OldAgeActivity), progreso y la escena,
// de la que solo se reutilizan métodos sueltos (halos, taza y radio, balanceo de la planta).
import '../../../js/oldage-models.js';
import '../../../js/oldage-props.js';
import '../../../js/oldage-interactions.js';
import '../../../js/oldage-progress.js';
import '../../../js/oldage-scene.js';

export const original = window.TimeExperience;
