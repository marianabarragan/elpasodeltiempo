# Fotografías del tablero inicial

El inicio presenta tres retratos procedurales provisionales, en orden de izquierda a derecha: niñez, adultez joven y vejez. Se generan en `js/intro-textures.js`; no son fotografías definitivas aportadas al proyecto.

Coloca tus imágenes, por ejemplo:

```text
assets/photos/childhood.jpg
assets/photos/adulthood.jpg
assets/photos/oldage.jpg
```

Configura las rutas en `js/project-config.js`:

```javascript
photos: {
  childhood: 'assets/photos/childhood.jpg',
  adulthood: 'assets/photos/adulthood.jpg',
  oldage: 'assets/photos/oldage.jpg'
}
```

Las claves conservan el orden del tablero. Puedes sustituir una sola imagen: los valores que permanezcan en `null` siguen usando el retrato procedural de esa etapa. Usa rutas relativas a `index.html` y recarga la página desde `npm start` después de cambiarlas.

Las superficies de imagen miden `3.32 × 4.0` unidades. Para evitar deformación, prepara archivos verticales con proporción aproximada `0.83:1`, por ejemplo `830 × 1000 px`, con el encuadre resuelto dentro del propio archivo. El borde de papel ya se genera en 3D; no hace falta incluirlo en la imagen. No añadas rótulos de las etapas sobre las fotografías.

`IntroScene.loadPhoto()` usa `THREE.TextureLoader` y vuelve a renderizar al terminar la carga. Cuando configuras una ruta, debe existir y ser accesible: el reemplazo configurado no tiene recuperación automática al retrato procedural si el archivo falta.
