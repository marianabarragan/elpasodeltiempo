# El paso del tiempo

Prototipo narrativo 3D para computador: pantalla de inicio, transiciones y escenarios interactivos de la niñez (escenario 1) , la juventud / adultez joven (escenario 2) y la vejez (escenario 3), seguidos de la reflexión final, las formas de aportar y el agradecimiento.

## Ejecutar

Desde esta carpeta, con Node.js y npm instalados:

```powershell
npm install
npm start
```

Abre **http://localhost:4173** en un navegador de escritorio con WebGL. Si ya existe `node_modules`, puedes omitir `npm install`. El servidor local se detiene con `Ctrl+C`.

Three.js y GSAP se sirven desde `node_modules`; las familias Nunito y DM Sans se solicitan a Google Fonts. Se recomienda el servidor local para que las futuras fotografías, texturas, modelos y pistas de audio carguen desde el mismo origen.

Para comprobar la sintaxis de los módulos JavaScript:

```powershell
npm run check
```

## Alcance actual

1. Inicio: primero una portada que cubre la pantalla, con el fondo verde partido en diagonal, un reloj de arena 3D a la izquierda y, a la derecha, «El paso del tiempo», la pregunta y el botón «Iniciar», con una línea verde abajo. El reloj (`js/intro-hourglass.js`) es de madera y vidrio crema, con arena que cae y una enredadera con hojas y flores moradas. Se balancea despacio, se inclina hacia el cursor y su arena baja durante 90 s. En ventanas altas o casi cuadradas el reloj queda arriba y el texto debajo. Colores y medidas de la portada en `.intro-copy` (`styles.css`). Detrás de la portada está el tablero: tablero de corcho con volumen, marco cálido, cabuya trenzada y tres retratos provisionales en orden niñez, adultez joven y vejez, colgados de forma ligeramente irregular (`PHOTO_LAYOUT` en `js/intro-scene.js`). Lo ilumina una luz de hora dorada (≈5:00 PM): sol bajo, ámbar y rasante que entra desde una ventana fuera de cuadro, a la izquierda, y proyecta sobre el tablero y la pared la sombra difusa del marco de la ventana y de unas hojas. La cámara ortográfica permanece fija y el tablero espera con un desenfoque medio (≈40 %, `--intro-blur: 8px` en `styles.css`).
2. «Iniciar» desvanece la portada y elimina el desenfoque del tablero sin mover la cámara; mientras la portada está oculta, el reloj de arena no se renderiza. No hay acercamiento automático: tras **dos segundos** desde ese clic (`Config.intro.photoDelayMs`), un clic sobre la fotografía de niñez inicia la entrada. La cámara se acerca y endereza la foto mientras la luz de la tarde crece; un resplandor dorado cubre la pantalla y la habitación de la niñez aparece a través de él. Los controles permanecen bloqueados durante la transición.
   Las tres fotografías aumentan un 6% desde su centro al pasar el cursor. Adultez y vejez muestran un candado y no permiten ingresar mientras están bloqueadas.
3. Juventud / adultez joven (escenario 2): habitación de noche en picada, con escritorio, monitor, teclado, reloj digital, termo de café, planta, hoja con pendientes y lapicero. La pantalla del monitor es la luz principal.
5. Vejez (escenario 3): mesa junto a una ventana, vista con la visión deteriorada; gafas, dos macetas, regadera, radio y taza.
4. Niñez: vista ortográfica en picada, cercana a la mirada de una persona dentro de la habitación, con piso de piezas de espuma encajables. La hoja central, ampliada uniformemente un 40%, contiene los contornos de una casa, un árbol y un sol. La torre conserva su tamaño y queda arriba a la izquierda; el xilófono conserva su tamaño y queda a la derecha; la crayola, ampliada un 50%, reposa abajo. La iluminación cálida entra en diagonal desde la izquierda, con relleno ambiental, un foco amplio sobre el papel y sombras difusas VSM. Solo afecta a esta escena.

El moodboard y el boceto mencionados en las instrucciones no estaban entre los archivos recibidos. Las geometrías, retratos y texturas actuales son provisionales y se construyeron siguiendo la descripción escrita. Los archivos anteriores se conservan en `archive/previous-*` y no se cargan en la experiencia actual.

## Interacción y progreso

- **Barra de progreso**: visible arriba, en horizontal, durante toda la interacción. Cinco hitos de 20 %, cada uno contado una sola vez: clic en la crayola, color elegido, y sol, casa y árbol pintados al menos un 25 % de su figura completa (la casa suma muros + techo; el árbol, tronco + copa). Al 100 % aparece «Cuando somos niños el tiempo parece infinito» (se desvanece a los pocos segundos) y, después, la flecha de continuar (más grande que el botón de sonido). Lógica y barra: `js/childhood-progress.js`; umbral en `Config.childhood.figureThreshold`.
- **Paleta**: al hacer clic en la crayola se abre a su lado una paleta de 4 × 4 colores (una fila por familia tonal). Pasar por un color hace sonar una nota de xilófono (escala de do mayor, de do5 a re7, en el orden de la paleta), generada en el navegador con un golpe de baqueta y armónicos de barra de madera. Al elegir, la crayola toma el color y la paleta se cierra. Los 16 colores y su orden se editan en `Config.childhood.palette` (`js/project-config.js`); `Config.childhood.audio.paletteHoverSrc` permite usar un archivo para el sonido.
- **Crayola**: con un color elegido sigue al ratón sin mantener el clic y **solo pinta mientras se mantiene el clic izquierdo** empezando sobre la hoja. Un clic fuera de la hoja (o el botón derecho, o Esc) la devuelve a su lugar; volver a hacer clic en ella reabre la paleta. En reposo conserva el salto suave al pasar el cursor.
- **Regiones**: sol, muros, techo, tronco y copa son regiones independientes. Cada trazo colorea solo la región donde empieza, así el color no pasa del techo a los muros aunque se vean unidos.
- **Cámara**: arrastrar fuera de la hoja gira la vista desde su picada de 38° (±12,5° horizontal, ±20° vertical) con amortiguación. Mientras se pinta, la orientación queda estable.
- **Piso**: rompecabezas de goma en tres tonos pastel (amarillo `#ffe085`, azul `#a3c8f2` y verde `#cee59d`, `Config.childhood.floor`), con la luz cálida de una ventana fuera de cuadro.

La flecha regresa al tablero, desbloquea la adultez y conserva el dibujo.

El botón circular superior derecho alterna el sonido. No se incluyen pistas: la configuración de música y fricción está en `null` hasta que se proporcionen archivos. El cursor representa una mano blanca abierta y se cierra mientras se mantiene el clic izquierdo.

## Escenario 2: juventud / adultez joven

Se entra desde la segunda fotografía cuando está desbloqueada (acercamiento y fundido, como en la niñez). La cámara es ortográfica, en picada de 31° frente al escritorio (no cenital). El escritorio es más largo y profundo que el encuadre, así que solo se ve la mesa y la pared, nunca el piso; la repisa con libros y el calendario cuelgan lo bastante bajo para no salirse de la vista. En pantallas estrechas se ve más alto (más pared y más mesa) en lugar de recortar los lados. Arrastrar el escenario la gira hasta ±12° en horizontal y 12° en vertical (6° hacia cada lado), con amortiguación y un leve deslizamiento contrario al movimiento (`Config.adulthood.camera`).

- **Barra de progreso**: horizontal en la parte superior durante toda la escena, con el mismo diseño que en la niñez. La checklist vale el 60% (15% por casilla) y el 40% restante se reparte entre el termo, el reloj y el calendario (≈13% cada uno, una sola vez por objeto). Los porcentajes y cuántos de esos objetos hacen falta (`propsNeeded`; con 1 basta cualquiera) están en `Config.adulthood.progress`.
- **Hoja**: papel con textura y arrugado leve. Muestra «Pendientes» y los cuatro pendientes a la vez, alineados a la izquierda, cada uno con su casilla y escritos a mano en tinta de bolígrafo. A los 3 s de entrar, sus bordes emiten un brillo suave y pausado (`Config.adulthood.sheet.glowDelayMs`) que se mantiene hasta el primer clic sobre la hoja (o sobre el lapicero que está junto a ella).
- **Hoja levantada**: con el clic, la hoja se eleva desde la mesa en un arco suave y queda frente a la vista, casi a 90° y a una distancia cómoda (ocupa el 74% del alto de la pantalla, `liftHeight`). El lapicero sube con ella y queda a su derecha. El resto del escenario se desenfoca al 60% (`blurAmount` sobre `maxBlurPx`); la hoja y el lapicero siguen nítidos.
- **Lapicero y casillas**: un clic en el lapicero lo toma, y desde ahí su punta sigue al mouse sobre la hoja. Un clic sobre una casilla la marca con un visto de bolígrafo, solo en orden: la 2 no se marca hasta marcar la 1, y así sucesivamente (si se intenta una posterior, la casilla habilitada destella). Una casilla marcada no vuelve a activarse, y no hay que trazar líneas. Un clic fuera de la hoja, el botón derecho o Esc devuelven el lapicero a su sitio junto a la hoja. Un clic en la hoja sin el lapicero lo hace brillar como pista.
- **Fin de la lista**: tras la cuarta casilla, la hoja y el lapicero vuelven a la mesa con la animación inversa y el desenfoque desaparece.
- **Computador**: al pasar el cursor, la pantalla hace un pequeño zoom (el panel crece levemente dentro del marco y su contenido se acerca). El botón de encendido, en el borde inferior del marco junto a un piloto verde, apaga y enciende la pantalla: al apagarla se desvanecen su haz de luz y su resplandor, y la luz cálida de la habitación sube un poco para que la escena siga viéndose bien. No suma progreso.
- **Calendario**: cada clic desprende la hoja del mes, que cae y se desvanece mostrando el siguiente (octubre → noviembre → diciembre → enero…). El mes inicial está en `Config.adulthood.calendar`. Suma su parte de la barra con la primera hoja.
- **Termo y reloj**: crecen al pasar el cursor; el termo da un pequeño rebote y el reloj alterna entre «10:30 PM» y pantalla negra. Ambos reproducen un sonido configurable y suman su parte de la barra la primera vez.
- **Cierre**: cuando la barra llega al 100% y la hoja está de vuelta en la mesa, aparece «Cuando crecemos, el tiempo parece ir más rápido que nosotros.» y, después, la flecha derecha; unos segundos más tarde la frase se desvanece lentamente (como en la niñez). La flecha bloquea la interacción, regresa al tablero ya recorrido (sin textos ni desenfoque), detiene la música y desvanece una sola vez el candado de la vejez.

Los textos de los pendientes, el título, la frase, la hora del reloj, los parámetros de la hoja, el calendario, el reparto de la barra de progreso y los límites de cámara se editan en `Config.adulthood` de `js/project-config.js`. Para inspeccionar la escena directamente: `http://localhost:4173/?scene=adulthood`.

## Escenario 3: vejez

Se entra desde la tercera fotografía cuando está desbloqueada (acercamiento y fundido, como en la adultez). La cámara es ortográfica, en picada de 40° sobre la horizontal (no cenital), con un encuadre cercano, casi en primera persona: los objetos de la mesa y, detrás, la ventana. La mesa es más ancha y profunda que la vista por los lados y por delante, así que el piso nunca aparece. Arrastrar el escenario la gira hasta ±10° en horizontal y ±10° en vertical, con amortiguación y un leve deslizamiento contrario. Los límites están en `Config.oldage.camera`.

- **Composición**: sobre la mesa solo quedan objetos con los que se interactúa (radio, gafas, dos macetas, regadera y taza) junto a la ventana y el papel tapiz; se retiraron el estuche bajo las gafas, la manta tejida y el cuadro de la pared para que lo interactivo se reconozca de inmediato.
- **Barra de progreso**: horizontal en la parte superior desde el inicio (mismo diseño que en la niñez, en la paleta de la vejez). Hitos: gafas puestas y vista nítida 20 %, maceta en el centro 20 %, riego completo 40 % y primera interacción con la taza o la radio 20 % (una sola vez para ambas). Cada hito cuenta una vez y la barra nunca baja. Los valores están en `Config.oldage.progress`.
- **Visión deteriorada**: la escena empieza desenfocada y distorsionada al 60 % (`Config.oldage.vision.initialAmount`). Solo las gafas responden: brillan suavemente en su contorno y, al pasar el cursor, únicamente ellas se ven nítidas.
- **Gafas**: descansan directamente sobre la mesa, a la izquierda. Al hacer clic se reproduce la animación en primera persona (las gafas suben, abren las varillas y llegan a los ojos) mientras el fondo recupera la nitidez. Al terminar no queda ninguna gafa en pantalla.
- **Macetas**: después brillan las dos. Al pasar el cursor se alzan y ladean; la elegida viaja al centro de la mesa y la otra queda en su lugar, sin brillo ni interacción.
- **Regadera**: brilla cuando la maceta llega al centro. Un clic la coloca sobre la maceta; manteniendo el clic sobre ella se inclina 40°, caen gotas y la planta se mece. La barra lateral se llena con **4,5 s** de clic acumulado (`Config.oldage.wateringSeconds`) y conserva el progreso al soltar. Al completarse desaparece y la regadera vuelve a su sitio.
- **Taza y radio**: después de ponerse las gafas responden al pasar el cursor (la taza se eleva un poco, la radio crece levemente en su sitio) y al clic (la taza gira sobre el plato, la radio se balancea y su antena oscila). La primera vez que se usa cualquiera de las dos suma el 20 % complementario. Si al terminar el riego todavía falta, ambas brillan suavemente hasta que se use una.
- **Cierre**: cuando la barra llega al 100 % y la regadera está de vuelta, aparece «Con los años, aprendemos que los pequeños momentos también hacen grande la vida.» y, después, la flecha derecha. `TimeExperience.transitions.leaveOldAge()` guarda `TimeExperience.oldageMemory`, emite `experience:scene-complete` (`detail.from === 'oldage'`) y pasa a la reflexión final: la escena se desvanece con un leve desplazamiento, detiene su render y su música, y aparece el cierre.

Para inspeccionar la escena directamente: `http://localhost:4173/?scene=oldage`.

## Cierre: reflexión, formas de aportar y agradecimiento

Interfaz HTML/CSS animada con GSAP, con la paleta café `#604427`, verde `#C0DEA4`, amarillo `#F2BB31` y azul `#47ACC2`, y las mismas dos familias del proyecto (Nunito y DM Sans).

- **Reflexión** («El tiempo compartido»): círculo cálido con dos manecillas que giran muy despacio. «Sí, quiero conocer» abre las formas de aportar; «Ahora no» va directamente al agradecimiento.
- **Formas de aportar**: tres tarjetas. Al pasar el cursor se elevan levemente; «Conocer más» abre su ventana emergente (fondo oscurecido y desenfocado; se cierra con la X, con Esc o con un clic fuera). «Continuar al cierre» no exige abrir ninguna.
- **Agradecimiento**: «Repetir experiencia» reinicia internamente todo el recorrido (escenas, progreso, pintura, checklist, riego y candados) y muestra la pantalla inicial sin recargar. «Ver formas de aportar» vuelve a las tarjetas. «Salir de la experiencia» usa `Config.closing.onExit` o `Config.closing.exitUrl`; si ambos son `null`, vuelve a la pantalla inicial sin iniciar ninguna escena.

Todos los textos (incluidas las tres tarjetas y sus ventanas) se editan en `js/closing-content.js`. Para inspeccionar el cierre directamente: `http://localhost:4173/?scene=closing`.

## Dónde añadir los recursos definitivos

La configuración central está en `js/project-config.js`. Las rutas siguientes son propuestas de integración, no archivos multimedia incluidos:

| Recurso | Carpeta y documentación | Configuración o módulo |
|---|---|---|
| Música y fricción | [assets/audio](assets/audio/README.md) | `Config.assets.audio.musicSrc` y `frictionSrc` |
| Música, termo y reloj (escenario 2) | [assets/audio](assets/audio/README.md) | `Config.adulthood.audio.musicSrc`, `thermosSrc` y `clockSrc` |
| Modelos 3D | [assets/models](assets/models/README.md) | `Config.assets.childhoodPropsFactory` y `ChildhoodProps.build()` |
| Modelos 3D (escenario 2) | [assets/models](assets/models/README.md) | `Config.adulthood.propsFactory` y `AdulthoodProps.build()` |
| Texturas | [assets/textures](assets/textures/README.md) | `intro-textures.js`, `childhood-props.js`, `painting-system.js` |
| Música y agua (escenario 3) | [assets/audio](assets/audio/README.md) | `Config.oldage.audio.musicSrc` y `waterSrc` |
| Modelos 3D (escenario 3) | [assets/models](assets/models/README.md) | `Config.oldage.propsFactory` y `OldAgeProps.build()` |
| Fotografías iniciales | [assets/photos](assets/photos/README.md) | `Config.assets.photos.childhood`, `adulthood`, `oldage` |

Cambiar archivos o configuración requiere recargar la página. Los modelos y las texturas no se cargan automáticamente por ponerlos en una carpeta: sus documentos indican los puntos de sustitución.

## Organización del código

| Módulo | Responsabilidad |
|---|---|
| `js/project-config.js` | Paleta, límites, porcentajes y rutas de recursos |
| `js/intro-scene.js` | Tablero, pared, cabuya, disposición de retratos, luz de hora dorada y renderizado inicial |
| `js/intro-textures.js` | Corcho, marco, retratos, fibra de la cabuya y patrón de luz (ventana y hojas) procedurales |
| `js/intro-hourglass.js` | Reloj de arena 3D de la portada: madera, vidrio, arena que cae, enredadera, hojas y flores |
| `js/intro-camera.js` | Cámara ortográfica del inicio (con giro opcional para enderezar la foto al entrar) |
| `js/scene-transition.js` | Secuencias GSAP entre el tablero y la niñez, selección y desbloqueo de fotografías |
| `js/childhood-scene.js` | Escenario, hoja, luces y ciclo de vida de la niñez |
| `js/childhood-props.js` | Piso, habitación, juguetes y crayola sustituibles |
| `js/childhood-camera.js` | Vista ortográfica en picada, límites de rotación y amortiguación |
| `js/object-interactions.js` | Crayola: reposo con salto, herramienta que sigue al ratón, pintura solo con clic sostenido, devolución y cámara |
| `js/childhood-progress.js` | Hitos del escenario 1 y barra de progreso (vertical → horizontal al 100 %) |
| `js/crayon-palette.js` | Paleta desplegable de 16 colores y nota de xilófono al pasar por ellos |
| `js/painting-system.js` | Papel, pigmento, contornos, máscaras y cobertura |
| `js/audio-system.js` | Música, fricción, efectos puntuales, silencio y recuperación ante bloqueo de reproducción |
| `js/adulthood-scene.js` | Escenario 2: renderizado, luces de relleno, ciclo de vida, progreso, encendido de la pantalla y acciones del termo, el reloj y el calendario |
| `js/adulthood-props.js` | Habitación y props sustituibles del escenario 2 (`{ root, visual }` por objeto) |
| `js/monitor-light.js` | Haz trapezoidal de la pantalla (inyectado en los materiales) y volumen de luz difuso |
| `js/checklist-system.js` | Papel, escritura a mano, casillas y su marcado en orden |
| `js/adulthood-sheet.js` | Brillo de la hoja, hoja levantada con el lapicero, desenfoque del fondo |
| `js/adulthood-progress.js` | Barra de progreso del escenario 2 (checklist + termo, reloj y calendario) |
| `js/adulthood-camera.js` | Picada ortográfica centrada en la mesa, límites de rotación, amortiguación y deslizamiento |
| `js/adulthood-interactions.js` | Raycasting, hover (zoom de la pantalla), lapicero y casillas, clics de los props, arrastre de cámara |
| `js/oldage-props.js` | Habitación y props sustituibles del escenario 3 (`{ root, visual }` por objeto) |
| `js/oldage-progress.js` | Barra de progreso del escenario 3 (gafas, maceta, riego, taza o radio) |
| `js/oldage-vision.js` | Desenfoque y distorsión en posproceso, nitidez solo de las gafas y animación en primera persona |
| `js/oldage-camera.js` | Picada ortográfica, límites de ±10°, amortiguación y deslizamiento |
| `js/oldage-interactions.js` | Orden narrativo (gafas → maceta → regadera → riego) y lógica del puntero |
| `js/closing-content.js` | Textos editables de la reflexión, las tarjetas, sus ventanas y el agradecimiento |
| `js/closing-screens.js` | Construcción de las tres pantallas, ventanas emergentes, navegación y transiciones GSAP del cierre |
| `js/oldage-scene.js` | Escenario 3: renderizado, luces, brillo, movimientos, gotas, respuesta de la planta y barra de progreso |
| `js/interface.js` | Cursor y bloqueo de controles durante transiciones |
| `script.js` | Integración, colores, condiciones de finalización y futuras transiciones |

## Integración de una escena futura

`TimeExperience.transitions.returnFromAdulthood()` comprueba que la checklist esté completa, guarda su estado en `TimeExperience.adulthoodMemory` y regresa al tablero desbloqueando la vejez (`returnToBoard({ unlock: 'oldage' })`). `toOldAge()` acerca la tercera fotografía y entra al escenario 3 con un fundido.

`TimeExperience.transitions.returnToBoard()` comprueba los umbrales de finalización de niñez, guarda el recuerdo en `TimeExperience.memory` y regresa al tablero. `memory` contiene el canvas del dibujo y sus porcentajes de cobertura. El candado de adultez se desvanece una sola vez por experiencia.

El clic sobre adultez desbloqueada (o `TimeExperience.transitions.toAdulthood()` desde el tablero habilitado) acerca la cámara a la segunda fotografía y entra al escenario 2 con un fundido. La vejez, una vez desbloqueada, entra igual al escenario 3, y su flecha lleva al cierre.

Para inspeccionar directamente la niñez durante desarrollo, abre `http://localhost:4173/?scene=childhood`. El acceso normal comienza en el tablero. `TimeExperience.reset()` reinicia la experiencia desde la consola; no añade un control visible a esta fase.
