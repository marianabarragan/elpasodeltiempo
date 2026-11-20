import { url } from './rutas.js';

// Los iconos de assets/Iconos solo declaran viewBox; WebGL necesita un tamaño propio para usarlos
// como textura (scripts/embed-models.cjs hace lo mismo con el candado). Se cargan con 256 × 256.
const cache = new Map();
export function iconoSvg(ruta) {
  if (!cache.has(ruta)) {
    cache.set(ruta, fetch(url(ruta))
      .then(respuesta => respuesta.text())
      .then(svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg width="256" height="256" '))}`));
  }
  return cache.get(ruta);
}
