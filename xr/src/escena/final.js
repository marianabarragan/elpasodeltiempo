import gsap from 'gsap';
import { iconoSvg } from '../iconos.js';
import { TEXTOS } from '../textos.js';
import { alPulsar, colocar, crearPanel, mostrar, ocultar } from '../paneles.js';

const esperar = segundos => new Promise(resolve => gsap.delayedCall(segundos, resolve));

/*
 * Cierre de la niñez con los tiempos de la web: aparece la frase, 0,6 s después la flecha,
 * y la frase se desvanece a los 4 s. La flecha se pulsa con el índice o con el rayo.
 */
export async function crearFinal(world, espacio, { alContinuar, texto = TEXTOS.fraseNinez, tarjeta = null, colorTexto = null }) {
  const [frase, flecha] = await Promise.all([
    crearPanel(world, 'panel-frase', { padre: espacio.entidad }),
    crearPanel(world, 'panel-flecha', { padre: espacio.entidad })
  ]);
  frase.el('texto')?.setProperties({ text: texto, ...(colorTexto ? { color: colorTexto } : {}) });
  // Cada escenario puede usar los colores de su mensaje en la web (p. ej. .oldage-message).
  if (tarjeta) frase.el('tarjeta')?.setProperties(tarjeta);
  iconoSvg('assets/Iconos/cafe/botón de continuar.svg').then(src => flecha.el('icono')?.setProperties({ src }));
  alPulsar(flecha, 'flecha', alContinuar);
  return {
    paneles: { frase, flecha },
    // Tamaño de la tarjeta de la frase (m, a escala 1) según su diseño ya calculado; si aún no hay, una estimación.
    medidaFrase() {
      const tam = frase.el('tarjeta')?.size?.value;
      if (tam?.[0] > 0 && tam?.[1] > 0) return [tam[0] / 100, tam[1] / 100];
      const ancho = (tarjeta?.maxWidth ?? 50) / 100;
      return [ancho, texto.length * .011 > ancho ? .097 : .068];
    },
    // Sin posiciones, la frase y la flecha ya están ubicadas (junto a la barra de progreso).
    async mostrar(posicionFrase = null, posicionFlecha = null, cabeza = null) {
      if (posicionFrase) colocar(frase, posicionFrase, cabeza);
      if (posicionFlecha) colocar(flecha, posicionFlecha, cabeza);
      mostrar(frase, { duracion: .75 });
      await esperar(.75 + .6);
      mostrar(flecha, { duracion: .55 });
      await esperar(4);
      if (frase.visible) ocultar(frase, { duracion: .8 });
    },
    ocultar() {
      if (frase.visible) ocultar(frase);
      if (flecha.visible) ocultar(flecha);
    }
  };
}
