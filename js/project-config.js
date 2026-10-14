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
    childhood: { paperScale: 1.4, crayonScale: 1.5 },
    progress: { narrative: 60, eachObject: 10 },
    // Tablero de inicio: tiempo mínimo, desde el clic en «iniciar experiencia», antes de
    // que la primera fotografía acepte el clic de entrada (no hay acercamiento automático).
    // El desenfoque inicial del fondo (≈40 %) se define en styles.css (--intro-blur).
    intro: { photoDelayMs: 2000 },
    assets: {
      // Put your files in assets/audio/ and replace null with their relative paths.
      // For example: 'assets/audio/childhood-music.mp3'. No invented audio is shipped.
      audio: { musicSrc: null, frictionSrc: null },
      photos: { childhood: null, adulthood: null, oldage: null },
      // Optional factory returning the same contract as ChildhoodProps.build().
      // Load your final models in this factory; see assets/models/README.md.
      childhoodPropsFactory: null
    },
    // Escenario 2: juventud / adultez joven.
    adulthood: {
      palette: ['#837858', '#91959c', '#c7cf96', '#604427', '#c0dea4', '#e2c99e'],
      // TEXTOS EDITABLES de la checklist. El encabezado se muestra desde el inicio;
      // cada tarea aparece solo al tachar la anterior. Admite más o menos de cuatro.
      checklist: {
        title: 'Pendientes',
        tasks: ['pendiente 1', 'pendiente 2', 'pendiente 3', 'pendiente 4'],
        // Fracción mínima del ancho del renglón que debe cubrir un trazo horizontal.
        strikeCoverage: 0.68
      },
      message: 'Cuando crecemos, el tiempo parece ir más rápido que nosotros.',
      // Picada en primera persona alrededor del escritorio (radianes).
      camera: { maxYaw: 30 * Math.PI / 180, maxTilt: 25 * Math.PI / 180, damping: 5.5 },
      // Hora fija del reloj digital cuando está encendido.
      clockTime: { digits: '10:30', period: 'PM' },
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
      // Segundos de clic sostenido acumulado para completar el riego.
      wateringSeconds: 4.5,
      // Inclinación de la regadera mientras riega (radianes).
      pourAngle: 40 * Math.PI / 180,
      // ► MÚSICA AMBIENTAL DEL ESCENARIO 3: sustituye null por la ruta del archivo, p. ej.
      //   musicSrc: 'assets/audio/oldage-music.mp3'. Suena en bucle desde la entrada.
      //   waterSrc: efecto opcional al empezar cada riego.
      audio: { musicSrc: null, waterSrc: null },
      // Fábrica opcional con el mismo contrato que OldAgeProps.build() (modelos .glb precargados).
      propsFactory: null
    },
    // Cierre: reflexión, formas de aportar y agradecimiento (textos en js/closing-content.js).
    closing: {
      // ► DESTINO DE «Salir de la experiencia». Con null se vuelve a la pantalla inicial sin
      //   iniciar las escenas. Para salir a otro sitio, escribe aquí su URL (p. ej. la página
      //   del proyecto) o asigna en TimeExperience.Config.closing.onExit una función propia.
      exitUrl: null,
      onExit: null
    }
  };
})();
