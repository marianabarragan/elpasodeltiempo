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

1. Inicio: tablero de corcho con volumen, marco cálido, cabuya trenzada y tres retratos provisionales en orden niñez, adultez joven y vejez, colgados de forma ligeramente irregular (`PHOTO_LAYOUT` en `js/intro-scene.js`). Lo ilumina una luz de hora dorada (≈5:00 PM): sol bajo, ámbar y rasante que entra desde una ventana fuera de cuadro, a la izquierda, y proyecta sobre el tablero y la pared la sombra difusa del marco de la ventana y de unas hojas. La cámara ortográfica permanece fija; el fondo tiene un desenfoque medio (≈40 %, `--intro-blur: 8px` en `styles.css`) y la interfaz está nítida.
2. «iniciar experiencia» desvanece la interfaz y elimina el desenfoque sin mover la cámara. No hay acercamiento automático: tras **dos segundos** desde ese clic (`Config.intro.photoDelayMs`), un clic sobre la fotografía de niñez inicia la entrada. La cámara se acerca y endereza la foto mientras la luz de la tarde crece; un resplandor dorado cubre la pantalla y la habitación de la niñez aparece a través de él. Los controles permanecen bloqueados durante la transición.
   Las tres fotografías aumentan un 6% desde su centro al pasar el cursor. Adultez y vejez muestran un candado y no permiten ingresar mientras están bloqueadas.
3. Juventud / adultez joven (escenario 2): habitación de noche en picada, con escritorio, monitor, teclado, reloj digital, termo de café, planta, hoja con pendientes y lapicero. La pantalla del monitor es la luz principal.
5. Vejez (escenario 3): mesa junto a una ventana, vista con la visión deteriorada; gafas, dos macetas, regadera, radio y taza.
4. Niñez: vista ortográfica en picada, cercana a la mirada de una persona dentro de la habitación, con piso de piezas de espuma encajables. La hoja central, ampliada uniformemente un 40%, contiene los contornos de una casa, un árbol y un sol. La torre conserva su tamaño y queda arriba a la izquierda; el xilófono conserva su tamaño y queda a la derecha; la crayola, ampliada un 50%, reposa abajo. La iluminación cálida entra en diagonal desde la izquierda, con relleno ambiental, un foco amplio sobre el papel y sombras difusas VSM. Solo afecta a esta escena.

El moodboard y el boceto mencionados en las instrucciones no estaban entre los archivos recibidos. Las geometrías, retratos y texturas actuales son provisionales y se construyeron siguiendo la descripción escrita. Los archivos anteriores se conservan en `archive/previous-*` y no se cargan en la experiencia actual.

## Interacción y progreso

Selecciona Verde (`#60AE29`), Amarillo (`#F2BB31`) o Café (`#BF5527`) en el panel izquierdo. La crayola cambia de color inmediatamente. Al pasar el cursor por la crayola en reposo, da un único salto suave y vuelve al suelo; el efecto no se repite hasta salir y volver a entrar. Puedes agarrarla durante el salto. Mantén el clic izquierdo sobre la crayola y arrástrala hasta el dibujo para pintar; al soltar, vuelve suavemente a su lugar. Arrastrar el escenario sin agarrarla gira la cámara desde su picada inicial de 38° respecto a la vertical: hasta ±12,5° horizontalmente (25° de recorrido total) y ±20° verticalmente, con amortiguación. Al pintar, la orientación queda estable. Las escalas se editan en `Config.childhood` y los límites de esta cámara en `Config.camera`.

La pintura se limita a las regiones interiores del dibujo, mantiene su grano de crayola y conserva los contornos por encima del color. La cobertura se calcula sobre los mismos píxeles que se pintan; repasar una zona ya cubierta no añade área duplicada.

- Al alcanzar por primera vez el **60% global**, aparece «Cuando somos niños el tiempo parece infinito».
- La flecha derecha aparece cuando el progreso global alcanza el **60%** y **sol, casa y árbol** alcanzan cada uno el **10%**. El mensaje mantiene su condición global independiente.
- La flecha regresa al tablero enfocado, sin repetir la presentación. Cuando el tablero está visible, el candado de adultez desaparece y habilita esa foto; vejez permanece bloqueada. El dibujo y el desbloqueo se conservan durante la navegación.

El botón circular superior derecho alterna el sonido. No se incluyen pistas: la configuración de música y fricción está en `null` hasta que se proporcionen archivos. El cursor representa una mano blanca abierta y se cierra mientras se mantiene el clic izquierdo.

## Escenario 2: juventud / adultez joven

Se entra desde la segunda fotografía cuando está desbloqueada (acercamiento y fundido, como en la niñez). La cámara es una picada en primera persona frente al escritorio: arrastrar el escenario la gira hasta ±30° en horizontal y 25° en vertical (10° hacia abajo y 15° hacia arriba desde el reposo), con amortiguación y un leve deslizamiento contrario al movimiento.

- **Hoja**: muestra «Pendientes» y solo el primer pendiente. Mantén el clic izquierdo sobre el lapicero y arrástralo sobre el renglón para tacharlo. Cuenta como tachado cuando un mismo trazo, mayoritariamente horizontal y dentro de la franja del renglón, cubre al menos el **68%** del ancho del texto (`Config.adulthood.checklist.strikeCoverage`). Los clics, los trazos verticales y los trazos cortos no cuentan. Al tachar un pendiente aparece el siguiente con un fundido; uno tachado no vuelve a activarse y los ocultos no responden. El lapicero no deja marcas fuera del renglón activo: el trazo de prueba se desvanece si no alcanza el umbral. Al soltarlo vuelve a la mesa.
- **Termo y reloj**: crecen al pasar el cursor; el termo da un pequeño rebote y el reloj alterna entre «10:30 PM» y pantalla negra. Ambos reproducen un sonido configurable y no afectan al progreso.
- **Cierre**: al tachar los cuatro pendientes aparece «Cuando crecemos, el tiempo parece ir más rápido que nosotros.» y, después, la flecha derecha. La flecha bloquea la interacción, regresa al tablero ya recorrido (sin textos ni desenfoque), detiene la música y desvanece una sola vez el candado de la vejez.

Los textos de los pendientes, el título, la frase, la hora del reloj y los límites de cámara se editan en `Config.adulthood` de `js/project-config.js`. Para inspeccionar la escena directamente: `http://localhost:4173/?scene=adulthood`.

## Escenario 3: vejez

Se entra desde la tercera fotografía cuando está desbloqueada (acercamiento y fundido, como en la adultez). La cámara es ortográfica, en picada de 40° sobre la horizontal (no cenital); arrastrar el escenario la gira hasta ±10° en horizontal y ±10° en vertical, con amortiguación y un leve deslizamiento contrario. Los límites están en `Config.oldage.camera`.

- **Visión deteriorada**: la escena empieza desenfocada y distorsionada al 60 % (`Config.oldage.vision.initialAmount`). Solo las gafas responden: brillan suavemente en su contorno y, al pasar el cursor, únicamente ellas se ven nítidas.
- **Gafas**: al hacer clic se reproduce la animación en primera persona (las gafas suben, abren las varillas y llegan a los ojos) mientras el fondo recupera la nitidez. Al terminar no queda ninguna gafa en pantalla.
- **Macetas**: después brillan las dos. Al pasar el cursor se alzan y ladean; la elegida viaja al centro de la mesa y la otra queda en su lugar, sin brillo ni interacción.
- **Regadera**: brilla cuando la maceta llega al centro. Un clic la coloca sobre la maceta; manteniendo el clic sobre ella se inclina 40°, caen gotas y la planta se mece. La barra lateral se llena con **4,5 s** de clic acumulado (`Config.oldage.wateringSeconds`) y conserva el progreso al soltar. Al completarse desaparece y la regadera vuelve a su sitio.
- **Curiosidades**: la radio y la taza no muestran ninguna pista; tras ponerse las gafas, un clic las balancea o gira levemente.
- **Cierre**: aparece «Con los años, aprendemos que los pequeños momentos también hacen grande la vida.» y, después, la flecha derecha. `TimeExperience.transitions.leaveOldAge()` guarda `TimeExperience.oldageMemory`, emite `experience:scene-complete` (`detail.from === 'oldage'`) y pasa a la reflexión final: la escena se desvanece con un leve desplazamiento, detiene su render y su música, y aparece el cierre.

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
| `js/intro-camera.js` | Cámara ortográfica del inicio (con giro opcional para enderezar la foto al entrar) |
| `js/scene-transition.js` | Secuencias GSAP entre el tablero y la niñez, selección y desbloqueo de fotografías |
| `js/childhood-scene.js` | Escenario, hoja, luces y ciclo de vida de la niñez |
| `js/childhood-props.js` | Piso, habitación, juguetes y crayola sustituibles |
| `js/childhood-camera.js` | Vista ortográfica en picada, límites de rotación y amortiguación |
| `js/object-interactions.js` | Raycasting, agarre, arrastre, devolución y coordinación con la cámara |
| `js/painting-system.js` | Papel, pigmento, contornos, máscaras y cobertura |
| `js/audio-system.js` | Música, fricción, efectos puntuales, silencio y recuperación ante bloqueo de reproducción |
| `js/adulthood-scene.js` | Escenario 2: renderizado, luces de relleno, ciclo de vida y acciones del termo y el reloj |
| `js/adulthood-props.js` | Habitación y props sustituibles del escenario 2 (`{ root, visual }` por objeto) |
| `js/monitor-light.js` | Haz trapezoidal de la pantalla (inyectado en los materiales) y volumen de luz difuso |
| `js/checklist-system.js` | Papel, escritura a mano, aparición progresiva y detección del tachado |
| `js/adulthood-camera.js` | Picada en primera persona, límites de rotación, amortiguación y deslizamiento |
| `js/adulthood-interactions.js` | Raycasting, hover, agarre del lapicero, clics del termo y el reloj, arrastre de cámara |
| `js/oldage-props.js` | Habitación y props sustituibles del escenario 3 (`{ root, visual }` por objeto) |
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
