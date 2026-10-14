# Texturas definitivas

Las texturas actuales se generan con Canvas 2D y se aplican a geometrías 3D reales. No hay archivos de textura definitivos incluidos.

Puedes organizar sus futuros reemplazos así:

```text
assets/textures/intro/cork.png
assets/textures/intro/frame.png
assets/textures/childhood/painted-surfaces.png
assets/textures/childhood/paper-grain.png
```

Las rutas son propuestas. No existe una configuración automática de estos archivos: carga cada recurso en el módulo correspondiente y reemplaza su textura procedural.

| Superficie | Punto de sustitución |
|---|---|
| Corcho | `TimeExperience.IntroTextures.cork()` en `js/intro-textures.js` |
| Marco | `TimeExperience.IntroTextures.frame()` en `js/intro-textures.js` |
| Patrón de luz del atardecer (ventana y hojas) | `TimeExperience.IntroTextures.windowLight()` en `js/intro-textures.js`; se proyecta con el `SpotLight` del tablero (`IntroScene.projectWindowLight()`) |
| Fibra de la cabuya | `TimeExperience.IntroTextures.jute()` en `js/intro-textures.js` |
| Espuma y juguetes | `paintedTexture()` y materiales de `js/childhood-props.js` |
| Grano del papel y dibujo | Capas de `js/painting-system.js` |

Asigna `THREE.SRGBColorSpace` a mapas de color. Para superficies que siguen tintándose con la paleta, utiliza texturas neutras y suaves: una textura muy coloreada alteraría el resultado al multiplicarse por el color del material. Conserva la gestión de `dispose()` al reemplazar texturas.

La hoja usa capas independientes para fondo, pigmento y contornos. Sustituir el grano del papel no debe aplanar estas capas: el contorno debe seguir por encima de la pintura. Si modificas las formas del dibujo, también debes actualizar sus máscaras en `painting-system.js` para mantener alineados los límites visibles, las áreas pintables y los porcentajes.

Las fotografías del tablero se configuran por separado; consulta [assets/photos](../photos/README.md).

## Escenario 2: juventud / adultez joven

| Superficie | Punto de sustitución |
|---|---|
| Pared, escritorio, piso, calendario, pantalla del monitor, funda del termo | `canvasTexture()` en `js/adulthood-props.js` |
| Pantalla del reloj (encendido/apagado) | `setClockPower()` en `js/adulthood-props.js` |
| Papel de la checklist (grano, arrugas, renglones) | `ChecklistSystem.paperBase()` en `js/checklist-system.js` |

El texto manuscrito y los tachados se dibujan sobre la capa de papel en cada cambio; si sustituyes el papel por una imagen, dibújala en `paperBase()` para conservar esas capas encima.
