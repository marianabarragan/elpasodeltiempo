import { CanvasTexture, SRGBColorSpace } from 'three';
import { url } from './rutas.js';

// Lee el motivo de hojas de assets/Diseño/inicio página.svg (el <pattern> de tus diseños).
let motivo;
function leerMotivo() {
  motivo ??= fetch(url('assets/Diseño/inicio página.svg'))
    .then(respuesta => respuesta.text())
    .then(texto => {
      const patron = new DOMParser().parseFromString(texto, 'image/svg+xml').querySelector('pattern');
      return {
        ancho: parseFloat(patron.getAttribute('width')), alto: parseFloat(patron.getAttribute('height')),
        trazos: [...patron.querySelectorAll('path')].map(path => new Path2D(path.getAttribute('d')))
      };
    })
    .catch(() => null);
  return motivo;
}

// Dibuja el patrón al 12 % sobre transparente para el fondo verde de un panel de anchoCm × altoCm.
export async function texturaHojas(anchoCm, altoCm, { hojaCm = 4.6, opacidad = .12, color = '#7c652a', pxCm = 22 } = {}) {
  const hojas = await leerMotivo();
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(anchoCm * pxCm);
  lienzo.height = Math.round(altoCm * pxCm);
  const ctx = lienzo.getContext('2d');
  if (hojas) {
    const k = hojaCm * pxCm / hojas.ancho, paso = { x: hojas.ancho * k, y: hojas.alto * k };
    ctx.fillStyle = color;
    ctx.globalAlpha = opacidad;
    for (let y = -paso.y * .4; y < lienzo.height; y += paso.y) {
      for (let x = -paso.x * .3; x < lienzo.width + paso.x; x += paso.x) {
        ctx.setTransform(k, 0, 0, k, x, y);
        hojas.trazos.forEach(trazo => ctx.fill(trazo));
      }
    }
  }
  const textura = new CanvasTexture(lienzo);
  textura.colorSpace = SRGBColorSpace;
  return textura;
}
