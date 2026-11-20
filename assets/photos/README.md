# Fotografías del tablero inicial

El tablero muestra una fotografía por escenario, en orden de izquierda a derecha: niñez, adultez joven y vejez. Las rutas están en `Config.assets.photos` (`js/project-config.js`):

```text
assets/photos/childhood.webp
assets/photos/adulthood.webp
assets/photos/oldage.webp
```

Son imágenes livianas (1200 × 1440 px, WebP). Cada una tiene además una copia `.webp.js`, que se usa al abrir la página sin servidor.

Para cambiar una foto:

1. Prepara una imagen vertical con proporción `0.83:1`, por ejemplo `1200 × 1440 px`, en WebP o JPG. Las superficies miden `3.32 × 4.0` unidades y el borde de papel ya se genera en 3D, así que no hace falta incluirlo.
2. Guárdala en esta carpeta y, si cambia el nombre, actualiza su ruta en `Config.assets.photos`.
3. Ejecuta `npm run models`: actualiza las copias `.webp.js`.

Con `null`, o si el archivo no carga, esa etapa usa su retrato provisional de `js/intro-textures.js`.
