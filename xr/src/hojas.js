import { CanvasTexture, SRGBColorSpace } from 'three';
import { url } from './rutas.js';

// Fondo de los paneles de texto (línea visual de la corrección): amarillo claro y, encima, la foto de hojas
// (public/imagenes/hojas-paneles.jpg) con un 15 % de opacidad.
// El amarillo (#fff9c9) es el background-color de cada panel; esta textura lleva solo las hojas.
const FOTO = 'imagenes/hojas-paneles.jpg';
let foto;
function cargarFoto() {
  foto ??= new Promise(resolve => {
    const imagen = new Image();
    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => resolve(null);
    imagen.src = url(FOTO);
  });
  return foto;
}

// Textura del fondo para un panel de anchoCm × altoCm: la foto cubre el panel entero (recortada, sin deformarse).
// `opacidad`: la de la foto sobre el amarillo (las tarjetas laterales del carrusel la usan más tenue).
export async function texturaHojas(anchoCm, altoCm, { opacidad = .15, pxCm = 16 } = {}) {
  const imagen = await cargarFoto();
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(anchoCm * pxCm);
  lienzo.height = Math.round(altoCm * pxCm);
  const ctx = lienzo.getContext('2d');
  // El amarillo es el color del panel (background-color en su .uikitml): aquí solo van las hojas, así lo que esté
  // encima de la imagen (botones) no queda tapado.
  if (imagen) {
    const k = Math.max(lienzo.width / imagen.width, lienzo.height / imagen.height);
    const w = imagen.width * k, h = imagen.height * k;
    ctx.globalAlpha = opacidad;
    ctx.drawImage(imagen, (lienzo.width - w) / 2, (lienzo.height - h) / 2, w, h);
  }
  const textura = new CanvasTexture(lienzo);
  textura.colorSpace = SRGBColorSpace;
  return textura;
}
