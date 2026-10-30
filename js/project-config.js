(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  app.Config = {
    colors: { green: '#60AE29', yellow: '#F2BB31', blue: '#bf5527' },
    // Niñez: cámara ortográfica en picada. `initialTilt` es la inclinación base
    // desde la vertical; los otros dos ángulos son límites relativos a esa pose.
    camera: {
      initialTilt: 38 * Math.PI / 180,
      // 25° de recorrido horizontal total: 12.5° a cada lado del reposo.
      maxYaw: 12.5 * Math.PI / 180,
      maxTilt: 20 * Math.PI / 180,
      damping: 5.5
    },
    childhood: {
      paperScale: 1.4, crayonScale: 1.5,
      // ► JUGUETES (modelos de Blender): posición en el piso (x, z; la hoja ocupa x ±5,74 y
      //   z ±4,3), giro en radianes y tamaño. `size` multiplica la medida más grande del juguete
      //   provisional (1 = igual, la crayola mide 4,5 de largo); el escalado es uniforme, así
      //   que nunca cambia las proporciones del modelo.
      toys: {
        rings: { x: -8.74, z: -3.83, turn: 0, size: 1.55 },
        xylophone: { x: 10.6, z: 0.54, turn: -0.29, size: 1.3 },
        crayon: { x: 0.12, z: 5.27, turn: -0.09, size: 0.63 }
      },
      // ► 16 COLORES DE LA PALETA DESPLEGABLE DE LA CRAYOLA (4 × 4). Cada fila es una familia
      //   tonal ordenada de oscuro a claro; el orden aquí es el orden en pantalla.
      palette: [
        { family: 'Azules', colors: [['#2e319c', 'Azul índigo'], ['#728ac5', 'Azul lavanda'], ['#47acc2', 'Azul turquesa'], ['#b7c7ed', 'Azul cielo']] },
        { family: 'Verdes', colors: [['#49891b', 'Verde bosque'], ['#afdf36', 'Verde lima'], ['#c0dea4', 'Verde salvia'], ['#e4f098', 'Verde limón claro']] },
        { family: 'Amarillo, naranja, rojo y café', colors: [['#ffc501', 'Amarillo'], ['#f67500', 'Naranja'], ['#ad1414', 'Rojo'], ['#6e4827', 'Café']] },
        { family: 'Magentas y rosados', colors: [['#86034a', 'Vino'], ['#9e098f', 'Magenta oscuro'], ['#eb4097', 'Fucsia'], ['#f0a5e8', 'Rosado']] }
      ],
      // Barra de progreso: cinco hitos de 20 % (clic en la crayola, color elegido, sol, casa y
      // árbol). Cada figura cuenta cuando su área total (p. ej. tronco + copa) llega a este %.
      figureThreshold: 25,
      // Piso de rompecabezas: tres tonos pastel (amarillo, azul y verde), usados tal cual.
      // desaturate y lighten (0–1) permiten suavizarlos más si hiciera falta.
      floor: { colors: ['#ffe085', '#a3c8f2', '#cee59d'], desaturate: 0.35, lighten: 0.08 },
      // Sonidos del escenario 1. paletteHoverSrc: al pasar por los colores; con null suena una nota
      // de xilófono generada en el navegador (para usar un archivo: 'assets/audio/palette-hover.mp3').
      // ► AL HACER CLIC EN LOS JUGUETES: ringsSrc (juego de aros), xylophoneSrc (xilófono) y
      //   crayonSrc (crayola, al tomarla). Con null no suenan; para usar un archivo, escribe su
      //   ruta, p. ej. xylophoneSrc: 'assets/audio/xilofono.mp3'.
      audio: { paletteHoverSrc: null, ringsSrc: null, xylophoneSrc: null, crayonSrc: null }
    },
    // Tablero de inicio: tiempo mínimo, desde el clic en «Iniciar» de la portada, antes de
    // que la primera fotografía acepte el clic de entrada (no hay acercamiento automático).
    // El desenfoque inicial del fondo (≈40 %) se define en styles.css (--intro-blur).
    // ► RELOJ DE ARENA DE LA PORTADA: segundos que tarda en caer la arena (luego se detiene) y
    //   cuánto brilla y alumbra su arena (1 = como está, 0 = sin luz). El brillo del botón
    //   «Iniciar» y la luz cálida sobre la portada se ajustan en styles.css (--glow).
    intro: { photoDelayMs: 2000, hourglass: { drainSeconds: 90, glow: 1 } },
    assets: {
      // Put your files in assets/audio/ and replace null with their relative paths.
      // For example: 'assets/audio/childhood-music.mp3'. No invented audio is shipped.
      // Música ambiental de la niñez (en bucle mientras el escenario 1 está activo). Desactivada
      // por ahora (null); la pista anterior sigue en assets/audio/ por si se quiere volver a usar:
      // 'assets/audio/goldensoundlabs-bouncy-birds-vibrant-solo-501860.mp3'.
      audio: { musicSrc: null, frictionSrc: null },
      photos: { childhood: null, adulthood: null, oldage: null },
      // Optional factory returning the same contract as ChildhoodProps.build().
      // Load your final models in this factory; see assets/models/README.md.
      childhoodPropsFactory: null
    },
    // Escenario 2: juventud / adultez joven.
    adulthood: {
      palette: ['#837858', '#91959c', '#c7cf96', '#604427', '#c0dea4', '#e2c99e'],
      // TEXTOS EDITABLES de la checklist. Todos los pendientes se ven desde el inicio, cada
      // uno con su casilla; solo se puede marcar la casilla siguiente a la última marcada.
      checklist: {
        title: 'Pendientes',
        tasks: [
          'ahorrar 600 mil para el próximo mes',
          'Actualizar el hoja de vida o el perfil de LinkedIn',
          'Retomar el contacto con amigos viejos',
          'Paseo pa’ puebliar el próximo festivo'
        ]
      },
      // Hoja de pendientes: brillo de los bordes (a los `glowDelayMs` de entrar) y lectura
      // levantada. `blurAmount` es el desenfoque del fondo (0–1) sobre `maxBlurPx` px y
      // `liftHeight` la fracción del alto de la pantalla que ocupa la hoja levantada.
      sheet: { glowDelayMs: 3000, blurAmount: 0.6, maxBlurPx: 14, liftHeight: 0.74 },
      // Calendario de pared: mes inicial (0 = enero … 9 = octubre) y año de referencia.
      calendar: { startMonth: 9, startYear: 2026 },
      // ► BARRA DE PROGRESO del escenario 2 (arriba, horizontal). `checklist` es el % de la lista
      //   (repartido entre sus casillas); el resto se reparte entre `propsNeeded` de los `props`
      //   (termo, reloj, calendario), cada uno cuenta una vez. Con propsNeeded: 1 basta con
      //   cualquiera de los tres. La flecha de continuar aparece al llegar al 100 %.
      progress: { checklist: 60, props: ['coffeeThermos', 'clockDigital', 'wallCalendar'], propsNeeded: 3 },
      message: 'Cuando crecemos, el tiempo parece ir más rápido que nosotros.',
      // Cámara ortográfica en picada alrededor del escritorio (radianes).
      camera: { maxYaw: 12 * Math.PI / 180, maxTilt: 12 * Math.PI / 180, damping: 5.5 },
      // Hora fija del reloj digital cuando está encendido (números de 7 segmentos).
      clockTime: { digits: '11:15', period: 'PM' },
      // ► LUZ DE LA PANTALLA sobre el escritorio: color, intensidad, `neutral` (0–1: cuánto se
      //   agrisa el color de la madera bajo la luz, para que no la vuelva cálida) y `haze`
      //   (opacidad del haz de luz en el aire).
      screenLight: { color: '#90ccff', intensity: 2.6, neutral: 0.7, haze: 0.1 },
      // ► LIBROS DE LA REPISA: los que eran blancos (verde pastel y amarillo beige), el canto de
      //   sus hojas y los cafés que parecían corcho (azul grisáceo claro; sus dibujos quedan en
      //   tonos de ese azul).
      books: { green: '#acd8b0', beige: '#e8d5a0', pages: '#f2e8cc', brown: '#98b6d6' },
      // RUTAS DE AUDIO del escenario 2. Sustituye null por rutas relativas a
      // index.html, p. ej. 'assets/audio/adulthood-music.mp3'. No se incluyen archivos.
      audio: { musicSrc: null, thermosSrc: null, clockSrc: null },
      // Fábrica opcional con el mismo contrato que AdulthoodProps.build().
      // Ver assets/models/README.md para sustituir los props por modelos .glb.
      propsFactory: null
    },
    // Escenario 3: vejez.
    oldage: {
      palette: ['#fadd87', '#cee24c', '#cc7d44', '#cee59d', '#5a323a', '#5c5832', '#b7c7ed'],
      message: 'Con los años, aprendemos que los pequeños momentos también hacen grande la vida.',
      // Cámara ortográfica en picada (radianes). `elevation` es el ángulo sobre la horizontal
      // (no cenital); los límites son el giro máximo a cada lado del reposo.
      camera: { elevation: 40 * Math.PI / 180, maxYaw: 10 * Math.PI / 180, maxTilt: 10 * Math.PI / 180, damping: 5.5 },
      // Visión deteriorada inicial: 0 = nítido, 1 = desenfoque máximo (`maxBlurPx` px por lado).
      vision: { initialAmount: 0.6, maxBlurPx: 22 },
      // Mesa pintada: cuánto se le quita de saturación (0 = colores originales, 1 = gris), para
      // que las materas de barro contrasten con la madera.
      table: { desaturate: 0.4 },
      // Segundos de clic sostenido acumulado para completar el riego.
      wateringSeconds: 4.5,
      // Inclinación de la regadera mientras riega (radianes).
      pourAngle: 40 * Math.PI / 180,
      // ► BARRA DE PROGRESO del escenario 3 (arriba, horizontal), en %: ponerse las gafas, elegir
      //   maceta, completar el riego e interactuar con la taza o la radio (cuenta una sola vez).
      //   La flecha de continuar aparece al llegar al 100 %.
      progress: { glasses: 20, pot: 20, watering: 40, extra: 20 },
      // ► MÚSICA AMBIENTAL DEL ESCENARIO 3: sustituye null por la ruta del archivo, p. ej.
      //   musicSrc: 'assets/audio/oldage-music.mp3'. Suena en bucle desde la entrada.
      //   waterSrc: efecto opcional al empezar cada riego.
      audio: { musicSrc: null, waterSrc: null },
      // Fábrica opcional con el mismo contrato que OldAgeProps.build() (modelos .glb precargados).
      propsFactory: null
    },
    // Cierre: reflexión, formas de aportar y agradecimiento (textos en js/closing-content.js).
    closing: {
      // ► Reflexión: segundos que el reloj de arena se ve antes de voltearse (una vez cada vez
      //   que aparece la pantalla). Su arena y su brillo son los de Config.intro.hourglass.
      hourglass: { flipAfterSeconds: 3 },
      // ► DESTINO DE «Salir de la experiencia». Con null se vuelve a la pantalla inicial sin
      //   iniciar las escenas. Para salir a otro sitio, escribe aquí su URL (p. ej. la página
      //   del proyecto) o asigna en TimeExperience.Config.closing.onExit una función propia.
      exitUrl: null,
      onExit: null
    }
  };
})();
