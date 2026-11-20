import { iconoSvg } from '../iconos.js';
import { alPulsar, colocar, crearPanel, mostrar, ocultar } from '../paneles.js';

const ICONOS = { sonido: 'assets/Iconos/cafe/boton volumen.svg', mudo: 'assets/Iconos/cafe/mute volumen.svg' };

/*
 * Barra de progreso espacial. La lógica es la de la web: ChildhoodProgress (js/childhood-progress.js,
 * cinco hitos del 20 %) en la niñez u OldAgeProgress (js/oldage-progress.js) en la vejez; aquí solo
 * cambia su dibujo, que pasa a una barra horizontal sobre el fondo de la mesa.
 */
export async function crearProgreso(world, espacio, { sonido, alCompletar, Logica = window.TimeExperience.ChildhoodProgress }) {
  const logica = new Logica({ element: null, onComplete: alCompletar });
  const panel = await crearPanel(world, 'panel-progreso', { padre: espacio.entidad });
  const relleno = panel.el('relleno'), valor = panel.el('valor'), icono = panel.el('icono');
  const actualizarIcono = () => iconoSvg(sonido.activo ? ICONOS.sonido : ICONOS.mudo).then(src => icono?.setProperties({ src }));
  alPulsar(panel, 'sonido', () => { sonido.alternar(); actualizarIcono(); });
  let dibujado = -1;
  return {
    logica, panel,
    marcar: paso => logica.mark(paso),
    mostrar(posicion, cabeza) { colocar(panel, posicion, cabeza); actualizarIcono(); return mostrar(panel); },
    ocultar: () => ocultar(panel),
    // Misma geometría que la barra web: relleno de 2,7 cm más 31,5 cm por el avance.
    update() {
      const avance = logica.shown.value;
      if (!panel.visible || Math.abs(avance - dibujado) < .05) return;
      dibujado = avance;
      relleno?.setProperties({ width: 2.7 + 31.5 * avance / 100 });
      valor?.setProperties({ text: `${Math.round(avance)}%` });
    }
  };
}
