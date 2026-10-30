# Modelos 3D definitivos

## Portada: reloj de arena

El reloj de arena de la portada viene de Blender en OBJ + MTL, en `assets/models/Inicio/reloj de arena/` (ver su `LEEME_para_Claude.md`). La web usa el reloj completo: `npm run obj` convierte `reloj_de_arena_completo/reloj_de_arena_completo.obj` en un `.glb` al lado, con las texturas dentro en WebP de 1024 px como máximo (1,5 MB), y actualiza su copia `.glb.js`. Las carpetas `partes/` y `fondo/` no se usan. `js/intro-models.js` lo carga antes que los demás modelos, porque es lo primero que se ve.

- **Orientación y tamaño**: el frente es el lado de las flores (el -X de los OBJ, frente a la pared de `fondo/`), y en la web mira a la cámara. Se centra en el cuello del cristal y se escala de forma uniforme, sin cambiar sus proporciones.
- **Arena**: la pieza que queda dentro del cristal es la arena. La web no la muestra tal cual: toma su color y cuánta hay arriba y abajo, y dibuja su propia arena animada dentro del cristal (con la forma del cristal del modelo). Esa arena cae en un hilo con granos y pasa de arriba abajo conservando su cantidad. Además brilla: su luz cálida alumbra el reloj y la portada.
- **Cristal**: la pieza transparente. Se cambia por un vidrio más claro, para que la arena luminosa se vea a través de él, con dos reflejos blancos en cada ampolla.
- **Reflexión del cierre**: usa el mismo reloj, que a los 3 s se voltea. Gira sobre el cuello, así que sus flores quedan abajo, y su arena pasa a la ampolla de arriba y vuelve a caer.
- Si el modelo no carga, la portada y la reflexión usan el reloj provisional de `js/intro-hourglass.js`.

## Escenario 1: juguetes hechos en Blender

El juego de aros, el xilófono y la crayola son los modelos de Blender, exportados juntos en un solo archivo:

```text
assets/models/childhood/toys.glb
```

`js/childhood-models.js` lo carga mientras se ve la portada (con el cargador GLTF de Three.js en `js/vendor/three-examples.js`) y `ChildhoodProps.build()` pone cada juguete en el lugar del provisional. Con servidor (`npm start`) o en GitHub Pages se lee el `.glb`; si la página se abre directamente desde el disco (doble clic en `index.html`), el navegador no deja leerlo y se usa su copia `toys.glb.js`. Para actualizarlos:

1. En Blender: **Archivo › Exportar › glTF 2.0 (.glb)** y guarda encima de `assets/models/childhood/toys.glb`. Después ejecuta `npm run models` en la carpeta del proyecto (actualiza la copia `toys.glb.js`) y recarga la página. Para publicarlo, sube ambos archivos.
2. **Nombres**: los objetos cuyo nombre empieza por «crayola» forman la crayola; los que empiezan por «Aro» (`Aro_…`, `Aros_…`), el juego de aros; todos los demás, el xilófono.
3. **La crayola** se modela de pie, con la punta hacia arriba (eje Z de Blender). En la web se acuesta con la punta hacia +X, que es la que pinta.
4. **Tamaño y posición**: la posición, la escala y las unidades de Blender no importan. Cada juguete se centra y se escala de forma uniforme (sin cambiar sus proporciones) hasta la medida más grande del juguete provisional: aros 2,22, xilófono 3,71 y crayola 4,5. Después se coloca según `Config.childhood.toys` en `js/project-config.js`: `x` y `z` en el piso (la hoja ocupa x ±5,74 y z ±4,3), `turn` (giro en radianes) y `size`, que multiplica esa medida (ahora aros 1,55, xilófono 1,3 y crayola 0,63). Por último se apoya en el piso. La punta de la crayola que pinta se ajusta sola al tamaño, y la cámara se abre lo necesario para que los juguetes nunca se corten, en ninguna pantalla ni giro.
5. **Ajustes automáticos**: las piezas exportadas con sombreado plano se suavizan hasta 40° (las aristas más marcadas se conservan); los materiales con transmisión (tipo vidrio, como el aro transparente) se cambian por una transparencia simple que no proyecta sombra; y el color elegido en la paleta tiñe toda la crayola (todos sus materiales).
6. **Brillo**: para parecerse a la vista previa de materiales de Blender, los modelos reflejan un estudio oscuro con tres paneles de luz y su rugosidad se limita a 0,3. Se ajusta en `TOY_GLOSS` (`js/childhood-scene.js`) y solo afecta a los modelos. La crayola en reposo tiene además un halo cálido que palpita despacio y se apaga mientras se usa (`CRAYON_GLOW`).
7. Si el archivo no carga, se usan los juguetes provisionales de `js/childhood-props.js`, en las mismas posiciones y tamaños.

El piso de espuma sigue siendo procedural; `assets/models/childhood/foam-floor.glb` en `TimeExperience.ChildhoodProps.MODEL_SLOTS` es solo un metadato.

## Escenario 1: sustituir toda la habitación con una fábrica propia

Lo siguiente solo hace falta para reemplazar también el piso o cambiar la composición completa.

### Contrato de sustitución

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

Con la crayola actual (de Blender o provisional), `crayonTip` es `(1.5, 0, 0)` y el eje longitudinal apunta a `+X`. La crayola usa escala uniforme `1.5` (`Config.childhood.crayonScale`); su punta local no se multiplica por adelantado. `crayonRest` se captura después de escalar, orientar y apoyar el modelo sobre el piso con su caja delimitadora. El controlador transforma la punta con la escala y el cuaternión del objeto; conserva esa convención al reemplazarlo.

La hoja y su textura dinámica pertenecen a `childhood-scene.js` y `painting-system.js`; no deben duplicarse dentro del modelo de habitación. Su geometría base mide `8.2 × 6.15` unidades; una escala uniforme en el plano de `1.4` (`Config.childhood.paperScale`) la lleva a `11.48 × 8.61` unidades, centrada en `x=0, z=0`. Su grosor se conserva. La superficie interactiva está en `floorY + 0.026`; `paperSurface` es un dato de referencia y no sustituye ese cálculo. La textura, máscaras y UV conservan sus coordenadas originales.

### Carga de GLTF

El cargador GLTF ya está conectado (`js/childhood-models.js`): `TimeExperience.ChildhoodModels.whenSettled(callback)` avisa cuando terminó la carga y `TimeExperience.ChildhoodModels.create('rings' | 'xylophone' | 'crayon')` devuelve una copia preparada de cada juguete. Una fábrica propia debe usar modelos ya cargados **antes de construir la niñez**; el arranque ya espera a `whenSettled` para preconstruirla y para `?scene=childhood`:

```javascript
TimeExperience.Config.assets.childhoodPropsFactory = () => {
  // Construir el contrato usando modelos ya cargados y transformados.
  return buildPropsFromPreparedModels();
};
```

`buildPropsFromPreparedModels` representa tu función de adaptación; no existe en el proyecto. No asignes una función `async` a la fábrica, porque el consumidor espera el objeto inmediatamente, no una promesa.

Conserva el grupo raíz sin desplazamientos ni rotaciones adicionales, la crayola alineada con `+X` y el piso en `y=0.18`. Normaliza escala y pivotes de los modelos definitivos. Apóyalos usando sus límites reales, como hace el prototipo con `THREE.Box3`, para evitar flotación o intersecciones con el suelo.

La composición reserva `x ∈ [-5.74, 5.74]`, `z ∈ [-4.305, 4.305]` para la hoja; esos límites se derivan de `Config.childhood.paperScale` en los metadatos. El juego de aros se ubica en `x=-8.10, z=-3.95`, el xilófono en `x=8.30, z=-0.55` y la crayola en `x=0.80, z=6.25`. Todas las alturas de reposo de los juguetes se calculan con `THREE.Box3`. Mantén materiales mate, iluminación compatible con sombras suaves y una cantidad de polígonos adecuada para la interacción continua.

## Escenario 2: juventud / adultez joven

Los objetos vienen de Blender en OBJ + MTL, una carpeta por objeto en `assets/models/adulthood/` (ver `LEEME_para_Claude.md` y `manifiesto.json`). `npm run obj` convierte cada OBJ en un `.glb` al lado, con Blender: texturas dentro, en WebP de 1024 px como máximo (todo el escenario pesa unos 4 MB). `js/adulthood-models.js` carga esos `.glb` (lista `SOURCES`) y `js/adulthood-props.js` los coloca. Si alguno no carga, ese objeto usa su versión provisional. `escena_completa/` es solo de referencia: la web no la usa.

| Objeto | Archivo | Tamaño en la escena (medida mayor) |
|---|---|---|
| Escritorio | `mesa/mesa.glb` | se escala para cubrir la vista |
| Pared | `pared_fondo/pared_fondo.glb` | a su tamaño (más grande solo si la pantalla lo necesita) |
| Monitor y pantalla | `computador/monitor.glb`, `computador/pantalla.glb` | 6,4 de ancho |
| Teclado | `computador/teclado.glb` | 4,7 |
| Reloj digital | `reloj_de_mesa/reloj_de_mesa.glb` | 1,55 |
| Termo | `termo/termo.glb` | 1,75 |
| Matera con planta | `matera/matera_y_planta.glb` | 3,27 |
| Hoja de pendientes | `papel/hoja_pendientes.glb` | 3,7 |
| Lapicero | `lapicero/lapicero.glb` | 1,71 |
| Corcho con calendario | `corcho/corcho_calendario.glb` | 2,95 |
| Repisa con libros | `libros/libros_y_repisa.glb` | 4,4 de ancho |

### Cómo se colocan

Cada objeto conserva su forma y sus proporciones: se escala de forma uniforme para que su medida mayor sea la del objeto provisional que reemplaza, y va en el mismo lugar, con el mismo giro. Así el encuadre, la hoja levantada y el lapicero siguen como estaban. La excepción es la matera: está en el extremo izquierdo del escritorio, más adelante, separada de la repisa, y la cámara siempre abre el encuadre lo suficiente para mostrarla completa. El escritorio empieza en la pared y `AdulthoodScene.fitBackdrop()` lo escala (nunca por debajo de su tamaño) para cubrir todo lo visible en cualquier ángulo; la pared solo crece si una pantalla muy ancha o vertical ve más allá de sus bordes. Con la pared de Blender no se crean las paredes laterales provisionales.

### Lo que la web prepara para las funciones

- **Monitor**: la pantalla (`pantalla.glb`) se dibuja sin luces, como una imagen que brilla, y por sus dos caras (en el OBJ mira hacia la pared). Al apagarla se ve vidrio oscuro. El disco con el anillo verde emisivo del marco es el botón de encendido (`monitor-power`) y su anillo el piloto (`monitor-led`), que se apaga con la pantalla. Un clic en la pantalla o en el botón la apaga y la enciende.
- **Reloj**: su pantalla es una luz de fondo emisiva (`clock-backlight`) detrás de una capa transparente (`clock-digits`). En esa capa la web dibuja la hora de `Config.adulthood.clockTime` con números digitales de 7 segmentos inclinados, como los del reloj provisional; los números de la textura no se usan. Apagado, la luz se oscurece y los dígitos se ocultan.
- **Repisa con libros**: los colores salen de `Config.adulthood.books`, por material. Los libros blancos (`Material.010`, `.023` y `.018`) pasan a verde pastel y amarillo beige. El canto de las hojas (`Material`) pasa a crema. Los cafés que parecían corcho (`Material.011`, `.019` y `.022`, con la textura `UV_Cube018`) se tiñen de azul grisáceo claro, y los dibujos de su textura quedan en tonos de ese azul. Tus archivos no cambian. Si en Blender cambias los nombres de esos materiales, actualiza la lista `BOOKS` de `js/adulthood-models.js`.
- **Hoja**: la hoja (`paper-sheet`) se alinea con los ejes, con el título hacia atrás. El título, los pendientes y las casillas son mallas del modelo; la web ubica cada casilla en la textura de la hoja y dibuja allí las marcas del lapicero, sobre la imagen de su papel. Las casillas se marcan en orden (la de arriba primero).
- **Lapicero**: se alinea a lo largo de `+X`, con la punta (el extremo opuesto al clip) en `+X` y el clip arriba.
- **Calendario**: el corcho se endereza y las hojas de los meses cuelgan sobre su hoja en blanco (`calendar-sheet`), del mismo tamaño y desde su borde superior, bajo las anillas. El dibujo del mes se adapta a la proporción de esa hoja.
- **Termo**: el mismo rebote al hacer clic.

Las transformaciones de cada objeto se aplican a su malla, así que los pivotes y las animaciones funcionan en las unidades de la escena.

### Exportar de nuevo

1. Exporta el OBJ (con su `.mtl` y sus imágenes) en la **misma carpeta y con el mismo nombre**.
2. Ejecuta `npm run obj`: convierte los OBJ a `.glb` y actualiza las copias `.glb.js` (para abrir la página sin servidor). Usa Blender (lo busca en `C:/Program Files/Blender Foundation`, o en la variable `BLENDER`).
3. En la hoja, nombra las casillas `Hoja_Casilla_1`, `_2`… y el papel `Hoja_Pendientes`, como ahora: la web las encuentra por esos nombres.

`Config.adulthood.checklist` (título y pendientes) solo se ve con la hoja provisional: la de Blender muestra sus propios textos. `Config.adulthood.clockTime` es la hora de los dos relojes.

### Contrato de `AdulthoodProps.build()`

`AdulthoodScene` llama a `Config.adulthood.propsFactory` o, si es `null`, a `AdulthoodProps.build()`. La fábrica debe ser **síncrona** (precarga los `.glb` antes) y devolver:

```javascript
{
  group,                 // THREE.Group raíz, eje Y hacia arriba
  deskTopY,              // altura de la superficie del escritorio
  deskFit, wallFit,      // escritorio y pared de Blender que fitBackdrop() escala (o null)
  models,                // { monitor, keyboard, clockDigital, ... } → { root, visual }
  interactive: { checklistPaper, pen, monitor, monitorPower, wallCalendar, coffeeThermos, clockDigital },  // { root, visual }
  monitorScreen: { anchor, width, height, setZoom(t), setPower(on) },  // anchor: centro de la pantalla, +Z hacia fuera; setZoom: hover 0–1; setPower: pantalla encendida/apagada
  paper: { root, visual, mesh, material, width, height, surfaceTop, rest, glow, sheet },  // glow: brillo de los bordes; sheet: { image, boxes } de la hoja de Blender (o null)
  calendar: { root, visual, pages: { front, under }, setMonth(index) },  // index 0 = mes inicial; cada página guarda su `rest`
  pen: { root, visual, tip, rest: { position, quaternion }, materials },
  clock: { setPower(on) },
  metadata, dispose()
}
```

- **Lapicero**: a lo largo de `+X`, con la punta en `+X`. `tip` es la punta en coordenadas locales de `root`; `rest` se captura después de apoyarlo.
- **Hoja**: `ChecklistSystem` asigna su `material.map`. Sin `sheet`, `mesh` debe tener UV estándar (0–1 cubre la hoja, parte superior hacia `-Z` local) y se dibujan título, pendientes y casillas; con `sheet`, solo las marcas, en las casillas dadas en coordenadas de textura.
- **Monitor**: `monitorScreen.anchor` define el origen y la dirección del haz trapezoidal. `MonitorLight.apply()` se aplica a todo el grupo, así que los modelos reciben la luz de la pantalla. Las superficies emisivas (pantallas) llevan `userData.ignoreScreenLight = true`.

## Escenario 3: vejez

Todos los objetos son modelos de Blender, uno por carpeta en `assets/models/oldage/`. `js/oldage-models.js` los carga después de los juguetes del escenario 1 (lista `SOURCES`) y `js/oldage-props.js` los coloca. Si alguno no carga, ese objeto usa su versión provisional.

| Objeto | Archivo que usa la web |
|---|---|
| Mesa (textura UV de Photoshop) | `mesa/mesa.glb` |
| Pared | `pared/pared.glb` |
| Ventana: marco y vista exterior | `ventana/ventanamarco.glb`, `ventana/ventanaexterior.glb` |
| Reposamatera (donde se pone la matera elegida) | `reposamatera/reposamatera.glb` |
| Gafas | `gafas/gafas.glb` |
| Matera 1 (`pot1`) | `matera 1/matera1-web.glb` |
| Matera 2 (`pot2`) | `maatera 2/matera2.glb` |
| Regadera | `regadera/regadera.glb` |
| Radio | `radio/radio.glb` |
| Taza y plato | `taza/taza-web.glb`, `taza/platotaza.glb` |

`matera1-web.glb` y `taza-web.glb` son copias corregidas de tus exportaciones:

- a `matera1.glb` le faltaba la maceta (solo traía las hojas), así que se exportó de nuevo desde `escenario3.glb`;
- la taza traía texturas de 4096 px (11,5 MB) y su copia las tiene a 1024 px (1 MB).

`escenario3.glb` y la carpeta `taza PT` son archivos de trabajo: la web no los usa.

### Cómo se colocan

1. **Composición del archivo.** Cada objeto se exporta en el lugar que tiene en la escena (sobre la referencia de Blender). La web conserva su tamaño, forma, texturas y posición; solo sube todo a la altura de la mesa (la cara superior de `mesa.glb` marca esa altura) y apoya cada objeto sobre ella.
2. **Mesa.** Solo se escala de forma uniforme: en cada tamaño de ventana, `OldAgeScene.fitTable()` calcula la escala mínima con la que su contorno real cubre todo lo visible, en cualquier ángulo permitido de la cámara. En un computador normal queda casi a su tamaño (×1,04). Su textura pierde un 40 % de saturación (`Config.oldage.table.desaturate`) para que las materas de barro contrasten con la madera.
3. **Pared.** Queda a su tamaño salvo que una pantalla muy ancha o vertical vea más allá de sus bordes; entonces `OldAgeScene.fitWall()` la agranda de forma uniforme desde el centro de su borde inferior, lo justo. El piso provisional solo pasa por debajo de la mesa: por el hueco entre la mesa y la pared se ve la pared, nunca el piso.
4. **Ventana.** En el archivo está de pie delante de la pared, sobre la mesa. La web la lleva hasta la pared deslizándola a lo largo de la línea de visión de la cámara: en reposo se ve exactamente donde la compusiste y, al girar la cámara, se mueve con la pared. La vista exterior se dibuja sin las luces de la escena (como una imagen), para que conserve sus colores.

### Lo que la web prepara para las interacciones

- **Gafas**: `gafas.glb` trae las piezas del prototipo (aros de 12 lados, varillas en forma de caja); la web cambia cada una por una versión lisa y redondeada del mismo tamaño, lugar y material. Unas gafas modeladas de otra forma se usan tal cual. En el archivo están acostadas sobre la mesa. La web guarda esa inclinación aparte y deja cada varilla (`glasses-temple-left`, `glasses-temple-right`) con su pivote en la bisagra, para que en la animación en primera persona las gafas queden derechas y las varillas se abran. Las lentes (`glasses-lens…`) no reciben contorno de brillo.
- **Materas**: los objetos cuyo nombre empieza por `hoja` son la planta; el resto es la maceta. La tierra se sitúa justo debajo del borde o de la hoja más baja, y cada hoja se mece desde su punto más bajo al regar.
- **Regadera**: el pico debe apuntar hacia `-X` (a la izquierda en la vista frontal). La punta (`watering-can-spout`, origen de las gotas) es el centro de sus puntos más a la izquierda.
- **Radio**: las piezas sueltas que quedan por encima del cuerpo (varilla y bola) se separan como `radio-antenna`, con el pivote en su base, para que se balanceen al hacer clic.
- **Taza**: gira sobre el eje de su cuerpo (la pieza más grande), encima del plato.

Las transformaciones de cada objeto (escala, rotación) se aplican a su malla, así que el contorno de brillo y los movimientos funcionan en las unidades de la escena aunque en Blender el objeto tenga otra escala.

### Exportar de nuevo

1. Exporta el objeto con el **mismo nombre y carpeta**. Al exportar con *Objetos seleccionados*, selecciona también los hijos (a `matera1.glb` le faltó la maceta, hija de «Matera con flor»). Si exportas de nuevo la matera 1 o la taza con su nombre original, cambia su ruta en `SOURCES` (`js/oldage-models.js`).
2. Texturas de **1024 px** como máximo: `npm run models` avisa si alguna es mayor.
3. Ejecuta `npm run models`: actualiza las copias `.glb.js` (para abrir la página sin servidor) solo de los modelos que usa la web.

### Contrato de la fábrica

Cada prop es un par `{ root, visual }`. Las interacciones (`js/oldage-interactions.js`) solo usan los identificadores `glasses`, `pot1`, `pot2`, `wateringCan`, `radio` y `coffeeCup`. El brillo se genera a partir de las mallas que haya en `visual`.

`OldAgeScene` llama a `Config.oldage.propsFactory` o, si es `null`, a `OldAgeProps.build()`. La fábrica debe ser **síncrona** (precarga los `.glb` antes) y devolver `{ group, tableTopY, tableFit, wallFit, models, interactive, curiosities, rest, center, pots, glasses, wateringCan, radio, coffeeCup, metadata, dispose() }`, con la misma forma que el prototipo.
