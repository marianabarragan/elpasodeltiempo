import { VisibilityState } from '@iwsdk/core';
import { AJUSTES } from './config.js';
import { crearSonidoCrayola } from './sonido-crayola.js';
import { crearSonidoHielo } from './sonido-hielo.js';

// Volumen de las notas del xilófono, relativo a Config.audio.level (los demás efectos usan 0,6).
const NIVEL_XILOFONO = 3;

/*
 * Sonido de la niñez con el AudioSystem original (js/audio-system.js): música ambiental en bucle y
 * efecto de los aros. La crayola usa sonido procedural (sonido-crayola.js) en lugar del bucle de
 * crayola-pintar.wav; mientras pinta, la música baja como en la web. Cada tecla del xilófono da su nota
 * con el sintetizador de lámina de madera de PaletteTone (js/crayon-palette.js), que también suena al
 * señalar las crayolas de la caja. En la sesión inmersiva la pausa depende de la visibilidad de la sesión.
 */
export function crearSonido(world) {
  const app = window.TimeExperience, cfg = app.Config;
  const audio = new app.AudioSystem({
    ...cfg.assets.audio,
    // Sin pista de fricción: setPainting solo baja la música; el roce lo genera sonido-crayola.js.
    frictionSrc: null,
    effects: { rings: cfg.childhood.audio.ringsSrc }
  });
  const disponible = () => audio.enabled && audio.active && !audio.hidden && !audio.blocked;
  const tono = new app.PaletteTone({ src: cfg.childhood.audio.paletteHoverSrc, isEnabled: () => audio.enabled && audio.active });
  const xilofono = new app.PaletteTone({ src: null, isEnabled: disponible });
  // PaletteTone crea su salida en el primer golpe; aquí solo se sube su volumen al de un efecto.
  const golpe = xilofono.strike.bind(xilofono);
  xilofono.strike = indice => { golpe(indice); xilofono.output.gain.value = NIVEL_XILOFONO * cfg.audio.level; };
  const crayola = crearSonidoCrayola({ habilitado: disponible, nivel: cfg.audio.level });
  // Vejez: el mismo AudioSystem que app.oldageAudio en script.js (música, agua en bucle mientras cae
  // sobre la planta, y efectos de maceta, taza y radio).
  const old = cfg.oldage.audio;
  const vejez = new app.AudioSystem({
    musicSrc: old.musicSrc, frictionSrc: old.waterSrc, frictionVolume: 1,
    effects: { pot: old.potSrc, cup: old.cupSrc, radio: old.radioSrc }
  });
  // Adultez: el mismo AudioSystem que app.adulthoodAudio en script.js (música y sonidos de pantalla,
  // reloj, calendario, lista y el sorbo del termo, con sus fragmentos). El sorbo se puede cambiar en
  // AJUSTES.adultez.termo.sorbo; el hielo es procedural (sonido-hielo.js) salvo que se indique una grabación.
  const adu = cfg.adulthood.audio;
  const adultez = new app.AudioSystem({
    musicSrc: adu.musicSrc,
    effects: { screen: adu.screenSrc, clock: adu.clockSrc, calendar: adu.calendarSrc, list: adu.listSrc, thermos: AJUSTES.adultez.termo.sorbo ?? adu.thermosSrc }
  });
  const hielo = crearSonidoHielo({
    habilitado: () => adultez.enabled && adultez.active && !adultez.hidden && !adultez.blocked, nivel: cfg.audio.level, muestra: AJUSTES.adultez.termo.hielo.muestra
  });
  const pagina = {
    get hidden() {
      const visibilidad = world.visibilityState.peek();
      return visibilidad === VisibilityState.NonImmersive ? document.hidden : visibilidad === VisibilityState.Hidden;
    },
    addEventListener: (...args) => document.addEventListener(...args),
    removeEventListener: (...args) => document.removeEventListener(...args)
  };
  const escenarios = [audio, adultez, vejez];
  escenarios.forEach(sistema => { sistema.page = pagina; });
  world.visibilityState.subscribe(() => escenarios.forEach(sistema => sistema.onVisibilityChange()));
  // Un pellizco o gatillo dentro de la sesión también reintenta el audio si el navegador lo bloqueó.
  const reintentar = () => {
    escenarios.forEach(sistema => { if (sistema.blocked && sistema.active) { sistema.blocked = false; sistema.sync(); } });
    crayola.reanudar();
    hielo.reanudar();
  };
  return {
    audio, tono, crayola, vejez, adultez, hielo,
    desbloquear() { escenarios.forEach(sistema => sistema.unlock()); tono.unlock(); xilofono.unlock(); crayola.desbloquear(); hielo.desbloquear(); },
    entrarAdultez: () => adultez.enter(),
    salirAdultez: () => adultez.exit(),
    entrarVejez: () => vejez.enter(),
    salirVejez: () => vejez.exit(),
    escucharSesion(sesion) { sesion?.addEventListener('selectstart', reintentar); },
    entrarEscena: () => audio.enter(),
    salirEscena: () => audio.exit(),
    efecto: nombre => audio.playEffect(nombre),
    // Teclas de la más larga (do5) a la más corta (do6): escala de do mayor de PaletteTone.
    nota(indice) {
      if (!disponible()) return;
      xilofono.play(indice);
      audio.duck(.8);
    },
    pintando: activo => audio.setPainting(activo),
    // El botón de sonido silencia o activa todos los escenarios a la vez.
    alternar() {
      audio.toggle();
      [adultez, vejez].forEach(sistema => {
        sistema.enabled = audio.enabled;
        sistema.blocked = false;
        sistema.sync();
      });
    },
    get activo() { return audio.state.enabled && !audio.state.blocked; }
  };
}
