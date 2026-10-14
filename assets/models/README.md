# Modelos 3D definitivos

Los modelos de la niñez se generan actualmente en `js/childhood-props.js`. Son geometrías provisionales; no se recibieron el moodboard ni el boceto mencionados. Los puntos de sustitución propuestos son:

```text
assets/models/childhood/foam-floor.glb
assets/models/childhood/stacking-rings.glb
assets/models/childhood/xylophone.glb
assets/models/childhood/crayon.glb
```

Estas rutas aparecen en `TimeExperience.ChildhoodProps.MODEL_SLOTS` como metadatos. No hay cargador GLTF conectado ni archivos GLB incluidos; colocar un modelo en esas rutas no lo activa por sí solo.

## Contrato de sustitución

`ChildhoodScene` llama sin argumentos a `TimeExperience.Config.assets.childhoodPropsFactory`, o a `TimeExperience.ChildhoodProps.build()` cuando aquella es `null`. La fábrica debe ser **síncrona** y devolver un objeto con este contrato:

```javascript
{
  group,                   // THREE.Group raíz, con eje Y hacia arriba
  floorY: 0.18,            // altura de la superficie del piso
  paperSurface: 0.205,     // referencia del acabado superior del cuerpo de papel
  crayon,                  // THREE.Group agarrable, hijo de group
  crayonColorMaterials,    // materiales con .color.set() para el cambio inmediato
  crayonTip,               // THREE.Vector3 de la punta, LOCAL A LA CRAYOLA
  crayonRest: {
    position,              // THREE.Vector3 local al padre, postura de reposo
    quaternion             // THREE.Quaternion local al padre
  },
  metadata,                // metadatos opcionales, modelos y rutas de sustitución
  dispose()                // liberar geometrías, materiales y texturas propias
}
```

Con el modelo actual, `crayonTip` es `(1.5, 0, 0)` y el eje longitudinal apunta a `+X`. La crayola usa escala uniforme `1.5` (`Config.childhood.crayonScale`); su punta local no se multiplica por adelantado. `crayonRest` se captura después de escalar, orientar y apoyar el modelo sobre el piso con su caja delimitadora. El controlador transforma la punta con la escala y el cuaternión del objeto; conserva esa convención al reemplazarlo.

La hoja y su textura dinámica pertenecen a `childhood-scene.js` y `painting-system.js`; no deben duplicarse dentro del modelo de habitación. Su geometría base mide `8.2 × 6.15` unidades; una escala uniforme en el plano de `1.4` (`Config.childhood.paperScale`) la lleva a `11.48 × 8.61` unidades, centrada en `x=0, z=0`. Su grosor se conserva. La superficie interactiva está en `floorY + 0.026`; `paperSurface` es un dato de referencia y no sustituye ese cálculo. La textura, máscaras y UV conservan sus coordenadas originales.

## Carga de GLTF

Al incorporar un cargador GLTF, precarga y prepara los modelos **antes de construir la niñez**. Después asigna una fábrica que devuelva los objetos preparados:

```javascript
TimeExperience.Config.assets.childhoodPropsFactory = () => {
  // Construir el contrato usando modelos ya cargados y transformados.
  return buildPropsFromPreparedModels();
};
```

`buildPropsFromPreparedModels` representa tu futura función de adaptación; no existe actualmente. No asignes una función `async` a la fábrica, porque el consumidor espera el objeto inmediatamente, no una promesa. El arranque deberá coordinar la precarga antes de permitir iniciar la transición, o antes de la entrada directa de desarrollo `?scene=childhood`.

Conserva el grupo raíz sin desplazamientos ni rotaciones adicionales, la crayola alineada con `+X` y el piso en `y=0.18`. Normaliza escala y pivotes de los modelos definitivos. Apóyalos usando sus límites reales, como hace el prototipo con `THREE.Box3`, para evitar flotación o intersecciones con el suelo.

La composición reserva `x ∈ [-5.74, 5.74]`, `z ∈ [-4.305, 4.305]` para la hoja; esos límites se derivan de `Config.childhood.paperScale` en los metadatos. La torre se ubica en `x=-8.10, z=-3.95`, el xilófono en `x=8.30, z=-0.55` y la crayola en `x=0.80, z=6.25`. Todas las alturas de reposo de los juguetes se calculan con `THREE.Box3`. Mantén materiales mate, iluminación compatible con sombras suaves y una cantidad de polígonos adecuada para la interacción continua.

## Escenario 2: juventud / adultez joven

Los props provisionales se generan en `js/adulthood-props.js`. Rutas propuestas (metadatos en `TimeExperience.AdulthoodProps.MODEL_SLOTS`):

```text
assets/models/adulthood/room.glb
assets/models/adulthood/desk.glb
assets/models/adulthood/monitor.glb
assets/models/adulthood/keyboard.glb
assets/models/adulthood/clock-digital.glb
assets/models/adulthood/coffee-thermos.glb
assets/models/adulthood/checklist-paper.glb
assets/models/adulthood/pen.glb
assets/models/adulthood/plant.glb
```

Cada prop es un par `{ root, visual }` con nombre identificable (`monitor`, `keyboard`, `clockDigital`, `coffeeThermos`, `checklistPaper`, `pen`, `plant`, `desk`, `room`):

- `root`: colocación sobre el escritorio, con el pivote en el centro de la base. `settle()` lo apoya usando su `THREE.Box3` real, de modo que un modelo nuevo no flota ni atraviesa la mesa.
- `visual`: hijo de `root` que recibe el hover (escala) y las animaciones (rebote del termo, pulsación del reloj). Para sustituir un prop, en `build()` añade la escena del `.glb` a su `visual` en lugar de las geometrías provisionales; la llamada a `settle()` de la sección «Placement on the desk» lo apoyará igual.

La interacción (`js/adulthood-interactions.js`) solo usa estos identificadores y grupos; no depende de las mallas internas.

### Contrato de `AdulthoodProps.build()`

`AdulthoodScene` llama a `Config.adulthood.propsFactory` o, si es `null`, a `AdulthoodProps.build()`. La fábrica debe ser **síncrona** (precarga los `.glb` antes) y devolver:

```javascript
{
  group,                 // THREE.Group raíz, eje Y hacia arriba
  deskTopY,              // altura de la superficie del escritorio
  models,                // { monitor, keyboard, clockDigital, ... } → { root, visual }
  interactive: { pen, coffeeThermos, clockDigital },   // { root, visual }
  monitorScreen: { anchor, width, height },  // Object3D en el centro de la pantalla, +Z hacia fuera
  paper: { root, visual, mesh, material, width, height, surfaceTop },
  pen: { root, visual, tip, rest: { position, quaternion }, materials },
  clock: { setPower(on) },                   // dibuja 10:30 PM o la pantalla negra
  metadata, dispose()
}
```

- **Lapicero**: modelado a lo largo de `+X`, con la punta en `+X`. `tip` es la punta en coordenadas locales de `root`; `rest` se captura después de apoyarlo.
- **Hoja**: `mesh` debe tener UV estándar (0–1 cubre la hoja entera, parte superior hacia `-Z` local). Su `material.map` lo asigna `ChecklistSystem`; `width × height` (2.9 × 3.7) definen la correspondencia con el lienzo. Mantén `alphaTest` si conservas los agujeros del cuaderno.
- **Monitor**: `monitorScreen.anchor` define el origen y la dirección del haz trapezoidal. Para que un `.glb` reciba la luz de la pantalla, llama a `scene.monitorLight.apply(modelo)`; `build()` ya se aplica a todo el grupo. Marca con `userData.ignoreScreenLight = true` las superficies emisivas (pantallas).
- **Reloj**: `clock.setPower(on)` debe actualizar la pantalla; con un `.glb`, asigna la `CanvasTexture` del reloj al material de su pantalla.
