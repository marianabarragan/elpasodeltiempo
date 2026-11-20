(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  app.Config = {
    colors: { green: '#60AE29', yellow: '#F2BB31', blue: '#bf5527' },
    // Configura volumen general, transiciones y reducción de música durante los efectos.
    audio: { level: 0.25, fadeIn: 0.5, fadeOut: 1, music: 1, musicDuck: 0.3 },
    // Cámara ortográfica de niñez con giros relativos a initialTilt.
    camera: {
      initialTilt: 38 * Math.PI / 180,
      // Recorrido horizontal de 25°, repartido alrededor del reposo.
      maxYaw: 12.5 * Math.PI / 180,
      maxTilt: 20 * Math.PI / 180,
      damping: 5.5
    },
    childhood: {
      paperScale: 1.4, crayonScale: 1.5,
      // Configura posición, giro y escala uniforme de los juguetes.
      toys: {
        rings: { x: -8.74, z: -3.83, turn: 0, size: 1.55 },
        xylophone: { x: 10.6, z: 0.54, turn: -0.29, size: 1.3 },
        crayon: { x: 0.12, z: 5.27, turn: -0.09, size: 0.63 }
      },
      // Paleta de 16 colores por familias, de oscuro a claro y en orden visual.
      palette: [
        { family: 'Azules', colors: [['#2e319c', 'Azul índigo'], ['#728ac5', 'Azul lavanda'], ['#47acc2', 'Azul turquesa'], ['#b7c7ed', 'Azul cielo']] },
        { family: 'Verdes', colors: [['#49891b', 'Verde bosque'], ['#afdf36', 'Verde lima'], ['#c0dea4', 'Verde salvia'], ['#e4f098', 'Verde limón claro']] },
        { family: 'Amarillo, naranja, rojo y café', colors: [['#ffc501', 'Amarillo'], ['#f67500', 'Naranja'], ['#ad1414', 'Rojo'], ['#6e4827', 'Café']] },
        { family: 'Magentas y rosados', colors: [['#86034a', 'Vino'], ['#9e098f', 'Magenta oscuro'], ['#eb4097', 'Fucsia'], ['#f0a5e8', 'Rosado']] }
      ],
      // Cinco hitos del 20 %; las figuras cuentan al alcanzar figureThreshold.
      figureThreshold: 25,
      // Colores del piso; desaturate y lighten suavizan sus tonos.
      floor: { colors: ['#ffe085', '#a3c8f2', '#cee59d'], desaturate: 0.35, lighten: 0.08 },
      // Sonidos de paleta y juguetes; sin archivo de paleta se genera una nota de xilófono.
      audio: {
        paletteHoverSrc: null,
        ringsSrc: { src: 'assets/audio/1childhoold/juego de anillos.mp3', fadeIn: .06 },
        xylophoneSrc: 'assets/audio/1childhoold/xilofono.mp3'
      }
    },
    // Configura la espera de las fotos y la caída de arena; los brillos se ajustan en CSS.
    intro: { photoDelayMs: 2000, hourglass: { drainSeconds: 90, glow: 1 } },
    assets: {
      // Música ambiental en bucle y fricción solo mientras la crayola pinta.
      audio: { musicSrc: 'assets/audio/ambiental.mp3', frictionSrc: 'assets/audio/1childhoold/crayola-pintar.wav' },
      // Candado de las fotos; npm run models actualiza su copia.
      photoLock: 'assets/Iconos/cafe/candado fotos.svg',
      // Fotos por escenario; npm run models actualiza sus copias para abrir desde disco.
      photos: { childhood: 'assets/photos/childhood.webp', adulthood: 'assets/photos/adulthood.webp', oldage: 'assets/photos/oldage.webp' },
      // Fábrica opcional compatible con ChildhoodProps.build(); consulta assets/models/README.md.
      childhoodPropsFactory: null
    },
    // Escenario de juventud y adultez joven.
    adulthood: {
      palette: ['#837858', '#91959c', '#c7cf96', '#604427', '#c0dea4', '#e2c99e'],
      // Textos de la lista; las casillas se habilitan en orden.
      checklist: {
        title: 'Pendientes',
        tasks: [
          'ahorrar 600 mil para el próximo mes',
          'Actualizar el hoja de vida o el perfil de LinkedIn',
          'Retomar el contacto con amigos viejos',
          'Paseo pa’ puebliar el próximo festivo'
        ]
      },
      // Configura espera del brillo, desenfoque y altura de la hoja levantada.
      sheet: { glowDelayMs: 3000, blurAmount: 0.6, maxBlurPx: 14, liftHeight: 0.74 },
      // Mes inicial del calendario, contado desde cero, y año de referencia.
      calendar: { startMonth: 9, startYear: 2026 },
      // Reparte el progreso entre la lista y propsNeeded objetos distintos; al 100 % habilita continuar.
      progress: { checklist: 60, props: ['coffeeThermos', 'clockDigital', 'wallCalendar'], propsNeeded: 3 },
      message: 'Cuando crecemos, el tiempo parece ir más rápido que nosotros.',
      // Cámara ortográfica en picada alrededor del escritorio, con ángulos en radianes.
      camera: { maxYaw: 12 * Math.PI / 180, maxTilt: 12 * Math.PI / 180, damping: 5.5 },
      // Hora fija del reloj digital de siete segmentos.
      clockTime: { digits: '11:15', period: 'PM' },
      // Configura color, intensidad, neutralización de la madera y neblina del monitor.
      screenLight: { color: '#90ccff', intensity: 2.6, neutral: 0.7, haze: 0.1 },
      // Colores de los libros claros, sus cantos y los libros antes marrones.
      books: { green: '#acd8b0', beige: '#e8d5a0', pages: '#f2e8cc', brown: '#98b6d6' },
      // Los efectos aceptan una ruta o fragmentos en segundos; volume ajusta su nivel.
      audio: {
        musicSrc: 'assets/audio/ambiental.mp3',
        thermosSrc: { src: 'assets/audio/adultood/bebercafe.mp3', fadeIn: .1 },
        screenSrc: { src: 'assets/audio/adultood/encender-apagarpantalla.mp3', fadeIn: .02 },
        clockSrc: { src: 'assets/audio/adultood/reloj digital.mp3', volume: 1, clips: [[.34, .98]] },
        calendarSrc: { src: 'assets/audio/adultood/calendario.mp3', clips: [[.52, 1.1], [2.56, 3.12], [4.58, 5.1]] },
        // El primer fragmento suena al levantar la hoja; los demás, al marcar casillas.
        listSrc: { src: 'assets/audio/adultood/lista.mp3', clips: [[.08, .3], [1, 1.3], [2.14, 2.52], [3.18, 3.6], [4.32, 4.94]] }
      },
      // Fábrica opcional compatible con AdulthoodProps.build().
      propsFactory: null
    },
    // Escenario de vejez.
    oldage: {
      palette: ['#fadd87', '#cee24c', '#cc7d44', '#cee59d', '#5a323a', '#5c5832', '#b7c7ed'],
      message: 'Con los años, aprendemos que los pequeños momentos también hacen grande la vida.',
      // Cámara en picada; elevation parte de la horizontal y los límites del reposo.
      camera: { elevation: 40 * Math.PI / 180, maxYaw: 10 * Math.PI / 180, maxTilt: 10 * Math.PI / 180, damping: 5.5 },
      // Visión inicial: 0 nítida, 1 desenfoque máximo según maxBlurPx.
      vision: { initialAmount: 0.6, maxBlurPx: 22 },
      // Reduce la saturación de la mesa para destacar las macetas.
      table: { desaturate: 0.4 },
      // Segundos acumulados de clic sostenido para completar el riego.
      wateringSeconds: 4.5,
      // Inclinación de la regadera al regar, en radianes.
      pourAngle: 40 * Math.PI / 180,
      // Progreso por gafas, maceta, riego y taza o radio; al 100 % habilita continuar.
      progress: { glasses: 20, pot: 20, watering: 40, extra: 20 },
      // Música en bucle, agua durante la caída de gotas y sonido al elegir planta.
      audio: {
        musicSrc: 'assets/audio/ambiental.mp3',
        // Transiciones cortas para conservar los golpes del sonido.
        potSrc: { src: 'assets/audio/ageold/elegir-planta.wav', fadeIn: .05, fadeOut: .2 },
        waterSrc: 'assets/audio/ageold/regadera-agua.wav',
        cupSrc: { src: 'assets/audio/ageold/bebercafe.mp3', fadeIn: .1 },
        radioSrc: 'assets/audio/ageold/radio.mp3',
        windowSrc: 'assets/audio/ageold/ventana-fuerte.wav'
      },
      // Fábrica opcional compatible con OldAgeProps.build(), con modelos precargados.
      propsFactory: null
    },
    // Pantallas finales con textos de js/closing-content.js.
    closing: {
      // Espera antes de girar el reloj de la reflexión; usa la arena y el brillo de la portada.
      hourglass: { flipAfterSeconds: 3 },
      // Salir usa exitUrl u onExit; con null vuelve a la portada.
      exitUrl: null,
      onExit: null
    }
  };
})();
