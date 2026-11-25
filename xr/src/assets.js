import { AssetType, defineAssets } from '@iwsdk/core';

const publico = ruta => `${import.meta.env.BASE_URL}${ruta.replace(/^\/+/u, '')}`;
const panel = (archivo, nombre) => ({ url: publico(`ui/${archivo}.uikitml`), type: AssetType.UIKitML, name: nombre });

// Paneles espaciales en public/ui. Los modelos del proyecto original se cargan desde js/legado.
export default defineAssets({
  'panel-instruccion': panel('instruccion', 'Instrucción'),
  'panel-confirmar': panel('confirmar', 'Confirmar superficie'),
  'panel-intro': panel('intro', 'Pregunta introductoria'),
  'panel-progreso': panel('progreso', 'Progreso de niñez'),
  'panel-frase': panel('frase', 'Frase de niñez'),
  'panel-flecha': panel('flecha', 'Continuar'),
  'panel-riego': panel('riego', 'Indicador de riego'),
  'panel-aportes-inicio': panel('aportes-inicio', 'Inicio de aportes'),
  'panel-aportes-carrusel': panel('aportes-carrusel', 'Carrusel de aportes'),
  'panel-aportes-central': panel('aportes-central', 'Tarjeta central de aportes'),
  'panel-aportes-lateral': panel('aportes-lateral', 'Tarjeta lateral de aportes'),
  'panel-aportes-final': panel('aportes-final', 'Cierre')
});
