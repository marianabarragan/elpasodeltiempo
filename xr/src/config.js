// Ajustes del prototipo de realidad mixta. Medidas en metros y tiempos en segundos.
// Las escalas convierten unidades del escenario original a metros.
export const AJUSTES = {
  mesa: {
    // Altura de la superficie sobre el piso para considerarla mesa o escritorio.
    alturaMin: .45, alturaMax: 1.25,
    // Lado mínimo de una superficie detectada.
    ladoMin: .35,
    // Un punto señalado pertenece a una superficie detectada si queda a menos de `ajusteAltura`
    // de su altura y a menos de `ajusteBorde` fuera de su contorno.
    ajusteAltura: .06, ajusteBorde: .05,
    // Puntos señalados más bajos que esto se ignoran (piso).
    alturaSenalMin: .25,
    // Borde libre entre el escenario y el canto de la mesa.
    margen: .03,
    // Ancho y fondo de la superficie elegida cuando el punto no cae sobre una superficie detectada.
    tamanoManual: [.9, .6],
    // Elegir la superficie poniendo una mano extendida sobre ella (mesa/mano-superficie.js), izquierda o derecha.
    mano: {
      // Mano extendida y plana: al menos `dedos` de los cuatro dedos estirados (la punta a más de `extendido` veces
      // la distancia del nudillo a la muñeca), la palma hacia abajo (coseno con la vertical) y los dedos casi
      // horizontales (seno máximo de su inclinación).
      dedos: 4, extendido: 1.55, palmaAbajo: .75, inclinacion: .45,
      // Sobre una superficie reconocida por el visor, la palma debe quedar a menos de `apoyo` m de ella; sin
      // superficies reconocidas, la altura de la superficie se toma de la mano apoyada (la articulación más baja).
      apoyo: .06,
      // La mano debe quedar quieta (se mueve menos de `quieta` m) durante `sostener` s; el círculo se llena en ese
      // tiempo y se vacía `vaciar` veces más rápido si la mano se levanta o se mueve.
      quieta: .025, sostener: 1, vaciar: 3,
      // Círculo blanco bajo la mano: radio, grosor del anillo (m) y opacidad de la pista y del relleno.
      circulo: { radio: .11, grosor: .012, pista: .3, relleno: .95 }
    },
    // Panel de instrucción: distancia delante de los ojos (m), cuánto más abajo de ellos y tamaño relativo.
    panel: { distancia: .8, bajar: .18, escala: 1.3 },
    // Mesa simulada, solo en el emulador cuando no entrega superficies (`auto`: se propone sola a los 2,5 s).
    simulada: { ancho: 1.2, fondo: .7, alto: .74, distancia: .8, auto: true }
  },
  escala: {
    // La hoja de niñez mide 11,5 unidades: 0,036 m por unidad la deja en ~41 cm.
    ninezMax: .036, ninezMin: .024,
    tablero: .03,
    // Reloj de arena de la introducción: 1,4 veces el tamaño anterior (0,034), como en la corrección.
    reloj: .0476
  },
  intro: {
    // Altura del centro del panel sobre la mesa, limitada a este rango.
    panelMin: .34, panelMax: .7,
    // Distancia hacia el fondo de la mesa, como fracción del fondo.
    panelFondo: .14
  },
  reloj: {
    // Segundos que tarda en volver a apoyarse sobre la mesa al soltarlo.
    asentar: .7,
    // Separación mínima entre el reloj y la mesa, y distancia a los cantos al apoyarlo.
    holgura: .003, bordeMesa: .06,
    // La arena se invierte cuando el reloj pasa de este coseno con la vertical (histéresis).
    volteo: .2,
    // Con el reloj más inclinado que esto (coseno), la arena deja de caer.
    inclinado: .6
  },
  tablero: {
    // Altura del centro sobre la mesa, distancia hacia el fondo y límites al moverlo con dos manos.
    alturaMin: .3, alturaMax: .8, fondo: .2,
    separacionMesa: .06, distanciaMin: .3, distanciaMax: 1.6
  },
  // Paso al recuerdo: el entorno se oscurece por completo y vuelve con el escenario nuevo.
  transicion: {
    oscurecer: 1.4, pausa: .9, aclarar: 2,
    // Radio de la cúpula oscura alrededor del usuario y luz virtual que queda en el punto más oscuro.
    radio: 6, luzMinima: 0
  },
  transformacion: { piso: 1.9, pieza: .45, hoja: .55, juguetes: .5, crayola: .5 },
  // Manipulación de cada escenario completo con las dos manos (guía de gestos manuales):
  // las dos palmas abiertas hacia arriba lo trasladan y lo giran; un pellizco con cada mano lo amplía o reduce.
  manipulacion: {
    // Factor de escala respecto del tamaño con que apareció (amplio; solo evita valores extremos).
    escalaMin: .5, escalaMax: 3,
    // Las manos cuentan si quedan sobre el escenario o a menos de `margen` m de su borde, y entre
    // `alturaMin` m por debajo y `alturaMax` m por encima de su superficie.
    margen: .15, alturaMin: -.3, alturaMax: .22,
    // Separación mínima entre las manos (m) para empezar.
    separacionMin: .12,
    // Palma hacia arriba: coseno mínimo entre la normal de la palma y la vertical; dedo extendido: la punta
    // queda a más de `extendido` veces la distancia del nudillo a la muñeca. Hacen falta `dedos` de cuatro.
    palmaArriba: .5, extendido: 1.5, dedos: 3,
    // Segundos que las dos palmas deben sostener el gesto antes de tomar el escenario, y tolerancia a
    // perder el gesto un instante sin soltarlo.
    espera: .2, gracia: .3,
    // Cambio mínimo de separación entre los pellizcos antes de escalar.
    zonaMuerta: .05,
    // Escalar solo desde los bordes: cada pellizco debe empezar a menos de `bordeDentro` m hacia adentro o
    // `bordeFuera` m hacia afuera del contorno de la superficie base, y entre `bordeAbajo` y `bordeArriba` m de
    // su altura. Mientras dura, el gesto sigue aunque las manos se alejen del borde.
    bordeDentro: .06, bordeFuera: .09, bordeAbajo: -.1, bordeArriba: .12,
    // Señal de escalado: cuatro esquinas (forma de L, blancas con un borde gris como en el diseño) que aparecen
    // junto a las esquinas de la superficie con una mano cerca del borde. Largo de cada brazo, grosor y
    // separación por fuera de la esquina (m), margen extra para que se apague (evita parpadeos) y fundido (1/s).
    esquinas: { brazo: .045, grosor: .011, separacion: .012, relleno: '#f7f5f1', borde: '#5f5a54', histeresis: .03, fundido: 9 },
    // Suavizado del movimiento (1/s; más alto sigue a las manos más de cerca).
    suavizado: 16
  },
  // Crayola principal: estiramiento del cuerpo y de la punta, y grosor (proporción del modelo original).
  crayola: {
    cuerpo: 1.42, punta: .62, grosor: .33,
    // Toma de escritura, la misma del lapicero de la adultez (perfil 'escritura' de agarre.js): la crayola pasa
    // entre las yemas del pulgar y el índice, se apoya en el pliegue entre ellos y en el dedo medio, y la punta
    // sale delante, inclinada hacia la hoja. Igual para las dos manos porque se calcula con las articulaciones
    // de la mano que la sostiene; cada mano admite su propio ajuste.
    agarre: {
      perfil: 'escritura',
      // Fracción del largo, desde el extremo trasero, donde la sostienen el pulgar y el índice: un poco más
      // arriba de la punta (~3 cm de crayola asoman delante de los dedos).
      sujecion: .76,
      // Peso de la vertical en la dirección de la punta (más alto, más inclinada hacia la hoja).
      haciaAbajo: .35,
      // Cuánto se acerca el punto de sujeción a la falange distal del dedo medio (0 en la pinza), como mucho
      // `medioMax` m: con el medio doblado lejos, la crayola sigue entre el pulgar y el índice.
      haciaMedio: .2, medioMax: .006,
      // Ajuste fino por mano: desplazamiento en metros (x hacia el meñique, y hacia el dorso, z hacia los dedos).
      izquierda: { desplazamiento: [0, 0, 0] },
      derecha: { desplazamiento: [0, 0, 0] },
      // Con controles (sin articulaciones): dirección de la punta y desplazamiento en el espacio de agarre.
      control: { direccion: [0, -.6, .8], desplazamiento: [0, -.01, .02] },
      // Segundos en que la crayola se acomoda en la mano al tomarla, y suavizado posterior (1/s).
      acomodar: .15, suavizado: 40
    }
  },
  // Xilófono: aumento sobre su tamaño original y hundimiento de la tecla al tocarla (unidades del modelo).
  xilofono: { aumento: 1.55, hundir: .03 },
  // Caja de crayolas, en unidades del escenario original (la hoja mide 11,5 de ancho): en el lateral
  // izquierdo, junto al borde de la hoja y delante de la torre de anillos, girada hacia el usuario.
  caja: {
    normal: { x: -8.25, z: 1.9, giro: .2 },
    compacta: { x: -8.1, z: 1.6, giro: .14 },
    // Elevación de una crayola señalada (solo con el rayo de un control) y de la elegida.
    senalada: .16, elegida: .32,
    // Elegir color con la mano: solo cuenta la yema de un dedo que toca la punta de una crayola desde arriba. La yema
    // (su centro) debe quedar a menos de su radio más `margen` m de la punta, y no más abajo que la base del cono.
    // Para volver a elegir, esa yema se aleja `rearme` m de todas las puntas. El color se confirma `confirmar` s
    // después del toque si en ese tiempo no se tomó la caja.
    toque: { margen: .004, rearme: .02, confirmar: .08 },
    // Al moverla: holgura (unidades) con la hoja, los juguetes y la crayola, y con el borde del piso.
    holgura: .2, bordePiso: .3,
    // Segundos tras soltarla en que tocar una crayola no elige color (la mano se está retirando). Además, la
    // mano que la soltó no elige color hasta alejarse `retirar` m de la caja (o pasados `retirarMax` s).
    pausaColor: .35, retirar: .06, retirarMax: 2,
    // Agarre por la parte alta del cuerpo (pellizco con la mano, botón lateral con el control): el pellizco debe
    // quedar entre `desde` (fracción de la altura de las paredes) y `arriba` m sobre su canto, y a menos de
    // `costado` m fuera de su huella. Las puntas de las crayolas quedan por encima de esa zona.
    zona: { desde: .4, arriba: .012, costado: .015, control: .03 },
    // En la mano: se alza `alzar` m al tomarla, sigue a la mano con este suavizado (1/s), gira solo alrededor
    // de la vertical hasta `giroMax` rad de su orientación original, y un pellizco puede perderse `gracia` s.
    alzar: .012, suavizado: 22, giroMax: .9, gracia: .12,
    // Al soltarla baja hasta el piso del escenario: segundos mínimos y máximos según la altura.
    bajar: [.28, .6]
  },
  // Mano virtual al estilo de los paneles de Meta (oclusion.js): silueta suave sobre lo virtual y contorno
  // blanco, sin recortar lo virtual alrededor de la mano real. Se arma cada cuadro con las 25 articulaciones de
  // WebXR Hand Input y el radio que el visor da a cada una. No se usa el sensor de profundidad del visor.
  manos: {
    // Multiplica el radio de cada articulación: menos de 1 ajusta la silueta, más de 1 la engruesa.
    ajuste: 1,
    // La palma es más ancha que gruesa: su grosor es esta fracción del radio de sus articulaciones.
    aplanado: .62,
    // Membrana entre el pulgar y el índice (fracción del radio del pulgar).
    membrana: .55,
    // Contorno blanco que marca el borde de los dedos (grosor en m y opacidad; 0 lo apaga).
    contorno: { grosor: .0025, opacidad: .7 },
    // Silueta de la mano sobre lo virtual (paneles, objetos, superficies): color y opacidad. Sobre la habitación
    // real no se pinta. Opacidad 0 la apaga.
    silueta: { color: '#2b2620', opacidad: .42 },
    // Se detiene en la cara de paneles, tablero y superficie base del escenario: margen (m) alrededor de cada cara,
    // hundimiento máximo (m) que se corrige (más hondo, la mano queda oculta detrás) y suavizado al soltarse (1/s).
    // Con la muñeca detrás de un panel (a menos de `detras` m) y dentro de su contorno, la mano no se dibuja.
    // Los objetos 3D cuentan si alguna de sus piezas está a menos de `alcance` m de la muñeca.
    superficie: { margen: .02, max: .12, suavizado: 25, detras: .6, alcance: .35 }
  },
  // Sombras de contacto: una mancha suave bajo cada objeto (sin mapas de sombra ni un segundo dibujo de la
  // escena). Se encoge y se aclara cuando el objeto se levanta.
  sombras: {
    opacidad: .4, color: '#24170e',
    // Cuánto excede la mancha la huella del objeto, y altura (m) a la que ya no se ve.
    extension: 1.45, alturaMax: .22,
    // Separación (m) entre la mancha y la superficie, para que no parpadee.
    elevacion: .0015
  },
  // Paneles de texto que el usuario puede mover con el botón de mover (círculo bajo el panel).
  paneles: {
    // Diámetro del botón y separación entre el borde inferior del panel y el botón (m).
    diametro: .046, separacion: .013,
    // Un pellizco a menos de `alcance` m del botón lo pulsa; con el modo de mover activo, un pellizco a
    // menos de `alcancePanel` m del panel lo toma. El modo se apaga solo tras `espera` s sin moverlo.
    alcance: .035, alcancePanel: .05, espera: 8,
    // Desplazamiento (m) por debajo del cual soltar cuenta como pulsar (activar el modo) y no como mover.
    pulsar: .012,
    // Suavizado del movimiento (1/s).
    suavizado: 22,
    // Escalar un panel con las dos manos: cada pellizco debe empezar junto a su borde (entre `bordeDentro` m hacia
    // adentro y `bordeFuera` m hacia afuera de su contorno, a menos de `profundidad` m de su plano). Con una mano
    // cerca del borde aparecen las cuatro esquinas (AJUSTES.manipulacion.esquinas). Tamaño entre `escalaMin` y
    // `escalaMax` veces el original.
    bordeDentro: .035, bordeFuera: .07, profundidad: .08, escalaMin: .6, escalaMax: 2.2
  },
  // Barra de progreso, frase y flecha de cada escenario: la barra arriba, la frase debajo con `separacion` m entre
  // ellas, y la flecha a la derecha de la frase con `separacionFlecha` m (medidas al tamaño original del escenario;
  // crecen y se reducen con él).
  cierre: { separacion: .02, separacionFlecha: .02 },
  pintura: {
    // La punta pinta al acercarse a menos de `contacto` y deja de pintar al alejarse más de `separacion`.
    contacto: .004, separacion: .009,
    // Hundimiento aceptado bajo el papel (la mesa real queda unos milímetros más abajo).
    hundimiento: .05,
    // Suavizado de la posición de la punta (0 sin filtro, 1 inmóvil).
    suavizado: .5
  },
  // Escenario 2 (adultez). Las «unidades» son las del escritorio original (js/adulthood-props.js, ~22,6 de ancho).
  adultez: {
    // Metros por unidad: los objetos llenan el área útil de la mesa dentro de estos límites. Antes el mínimo
    // era 0,045 y en mesas pequeñas todo quedaba en miniatura (lapicero de ~8 cm, termo de 5 cm de ancho);
    // a 0,07 el monitor mide ~45 cm y la hoja ~27 × 33 cm antes de su ajuste propio. Si la composición
    // no cabe en la mesa, el escritorio la sobrepasa: el usuario puede moverlo y escalarlo con las manos.
    escalaMax: .085, escalaMin: .07,
    // Ajuste propio de cada objeto respecto de la manos (no un mismo porcentaje para todos): factor de tamaño
    // (desde su base, sin despegarlo del escritorio) y desplazamiento en unidades para que nada se cruce.
    objetos: {
      // Hoja, lapicero y termo se apartan del teclado grande (ver keyboard).
      checklistPaper: { escala: 1.15, dx: -1.6, dz: 1.5 },
      pen: { escala: 1.2, dx: .08, dz: .85 },
      // El termo conserva su tamaño: a 0,07–0,085 m/u mide 8–9,8 cm de ancho, lo que una mano alcanza a envolver.
      coffeeThermos: { escala: 1, dx: 1.3 },
      clockDigital: { escala: 1.05 },
      // El teclado es grande desde el inicio: sus teclas (~3 cm) se pulsan cómodamente con la yema de cada dedo.
      keyboard: { escala: 1.6 },
      // El corcho del calendario, al costado derecho del monitor y a su misma profundidad (antes quedaba ~1,4 u más
      // atrás y costaba alcanzarlo); queda detrás del termo sin tocarlo.
      wallCalendar: { escala: 1.15, dz: 1.41 }
    },
    // Escritorio (mesa.glb con su textura de madera): cubre la mesa elegida, y como mínimo la composición con
    // `margen` unidades alrededor; `grosor` m de canto. Los objetos se apoyan sobre su cara superior.
    escritorio: { grosor: .03, margen: 1.2 },
    aparecer: { objetos: .55, intervalo: .1 },
    hoja: {
      // Una casilla se marca con la punta del lapicero a menos de `delante` m del papel (o hasta `detras` m
      // por debajo, porque el escritorio no la frena), con `margen` m alrededor del borde.
      delante: .012, detras: .03, margen: .008,
      // Luz intermitente leve de la hoja mientras se sostiene el lapicero: opacidad mínima, máxima y medio ciclo (s).
      brillo: [.2, .62], pulso: 1.1,
      // Pausa tras la última marca antes de soltar y devolver el lapicero, y regreso del lapicero (s).
      pausaFinal: .7, regresoLapicero: .6,
      // Manipulación propia de la hoja: un pellizco a menos de `alcance` m de su superficie (y dentro de su
      // contorno con `borde` m de margen) la desliza; un pellizco de cada mano la amplía o reduce.
      alcance: .06, borde: .03,
      // Factor de escala respecto de su tamaño inicial: desde aquí las casillas siguen siendo cómodas de tocar.
      escalaMin: .75, escalaMax: 2.2,
      // Holgura (unidades) con los demás objetos y con el borde del escritorio.
      holgura: .1
    },
    // Botones del monitor y del reloj: cualquier punta de dedo a menos de `margen` m del botón lo pulsa;
    // se rearma cuando todas las puntas salen a más de `rearme` veces ese margen.
    boton: { margen: .016, rearme: 1.6, hundir: .03 },
    // Computador (computador.js): correo que se escribe pulsando el teclado con el monitor encendido.
    computador: {
      // Pulsaciones válidas para terminar el correo y cuántas forman el primer renglón (el resto, el segundo).
      pulsaciones: 15, primerRenglon: 6,
      // Largo final de cada renglón, como fracción del ancho del cuerpo del correo (el primero, más corto).
      renglones: [.3, .8],
      // Teclas: la yema pulsa al llegar a `contacto` m de la cara de una tecla y se rearma al subir más de `rearme` m;
      // `margen` (m) alrededor de cada tecla, `hundir` (m) que baja la tecla y `pausa` (s) mínima entre pulsaciones.
      // Una yema que aparece más de `profundo` m dentro del teclado no pulsa (llegó desde dentro, no desde arriba).
      tecla: { contacto: .003, rearme: .012, margen: .002, hundir: .003, pausa: .09, profundo: .02 },
      // Correo: segundos que crece un renglón, pausa tras la última pulsación, desvanecer los renglones y mostrar el
      // mensaje final, y el mensaje.
      correo: { crecer: .18, pausa: .35, ocultar: .35, mostrar: .5, texto: 'Correo recibido. Muchas gracias.' }
    },
    termo: {
      // Agarre envolvente: la palma a menos de `palma` m del eje del termo (además de su radio) y al menos
      // `dedos` puntas de dedo a menos de `puntas` m de su superficie, durante `confirmar` s. Se suelta si
      // quedan menos de dos puntas cerca durante `soltar` s. Con las manos el pellizco no lo toma (solo
      // rodeándolo); con controles, el botón lateral.
      palma: .05, puntas: .03, dedos: 3, confirmar: .1, soltar: .25,
      // En la mano (perfil 'envolvente' de agarre.js): el eje del termo sigue los nudillos (la tapa hacia el
      // pulgar) y queda `holgura` m delante de la palma, `haciaDedos` fracción del radio hacia los dedos;
      // la mano lo sujeta a `sujecion` de su altura desde la base. Ajuste fino por mano en metros.
      agarre: {
        sujecion: .45, holgura: .008, haciaDedos: .25, haciaAbajo: 0,
        izquierda: { desplazamiento: [0, 0, 0] }, derecha: { desplazamiento: [0, 0, 0] },
        control: { direccion: [0, 0, -1], desplazamiento: [0, -.01, .03] },
        acomodar: .15, suavizado: 30
      },
      // Beber: la tapa a menos de `boca` m de la boca (estimada `bajoOjos` m bajo los ojos y `delante` m
      // delante) e inclinado más de `inclinacion` rad. Para repetir, alejarlo más de `boca × rearme` o enderezarlo.
      boca: .12, bajoOjos: .075, delante: .05, inclinacion: .6, rearme: 1.6,
      // Sonido del sorbo (null: el de la web, assets/audio/adultood/bebercafe.mp3).
      sorbo: null,
      // Hielo al sacudirlo (no suma progreso): golpes a partir de `velocidad` m/s; `muestra` es la ruta de una
      // grabación de hielo para reemplazar la síntesis (p. ej. 'assets/audio/adultood/hielo.mp3'), null = síntesis.
      hielo: { velocidad: .35, muestra: null },
      // Segundos que tarda en volver a su sitio al soltarlo.
      regreso: .6
    },
    lapicero: {
      // Toma de escritura (perfil 'escritura' de agarre.js): el lapicero pasa por la pinza y se apoya en el
      // pliegue entre pulgar e índice; la pinza lo sostiene a `sujecion` de su largo desde atrás (cerca de la
      // punta) y la punta se inclina hacia abajo con peso `haciaAbajo`. Igual para las dos manos.
      agarre: {
        sujecion: .78, haciaAbajo: .35,
        izquierda: { desplazamiento: [0, 0, 0] }, derecha: { desplazamiento: [0, 0, 0] },
        control: { direccion: [0, -.6, .8], desplazamiento: [0, -.01, .02] },
        acomodar: .15, suavizado: 40
      }
    },
    calendario: {
      // El índice toca la hoja del mes a menos de `delante` m (o `detras` m al otro lado) y la arrastra;
      // se suelta si se aleja más de `soltar` m del papel.
      delante: .015, detras: .03, soltar: .05,
      // La hoja se desprende al arrastrarla esta fracción de su ancho hacia la derecha (o de su alto hacia abajo).
      derecha: .32, abajo: .4
    }
  },
  // Escenario 3 (vejez). Las distancias en «unidades» son del escenario original (js/oldage-props.js).
  vejez: {
    // Metros por unidad: la composición llena el área útil de la mesa dentro de estos límites. Antes el mínimo
    // era 0,05 y en mesas pequeñas todo quedaba diminuto; a 0,075 las gafas miden ~16 cm de ancho, la taza
    // ~11 cm y la radio ~24 cm. Si no cabe en la mesa, la mesa pintada la sobrepasa (el usuario puede
    // mover y escalar el escenario con las manos).
    escalaMax: .09, escalaMin: .075,
    // Ajuste propio de cada objeto respecto de las manos: la radio crece para que sus perillas se puedan girar.
    objetos: { radio: { escala: 1.25 } },
    // Taza de café (escena/vejez/taza.js): se toma con un pellizco (en el asa o el cuerpo; queda en la mano tal como
    // se tomó) o rodeándola con toda la mano (perfil 'envolvente' de agarre.js, como el termo: la palma a menos de
    // `palma` m de su eje y al menos `dedos` puntas a menos de `puntas` m de su superficie durante `confirmar` s;
    // se suelta si quedan menos de dos puntas durante `soltar` s). Se bebe con el borde a menos de `boca` m de la
    // boca (estimada `bajoOjos` m bajo los ojos y `delante` m delante) e inclinada más de `inclinacion` rad: el café
    // baja poco a poco mientras dura el gesto (`beber` s la vacían) y el sorbo de la web suena cada `sorbo` s. El
    // primer sorbo suma el hito «extra» (el mismo de la radio). Al soltarla vuelve a su plato en `regreso` s.
    taza: {
      palma: .045, puntas: .03, dedos: 3, confirmar: .1, soltar: .25,
      agarre: {
        sujecion: .55, holgura: .006, haciaDedos: .2, haciaAbajo: 0,
        izquierda: { desplazamiento: [0, 0, 0] }, derecha: { desplazamiento: [0, 0, 0] },
        control: { direccion: [0, 0, -1], desplazamiento: [0, -.01, .03] },
        acomodar: .15, suavizado: 30
      },
      boca: .11, bajoOjos: .075, delante: .05, inclinacion: .5,
      beber: 4, sorbo: 1.4,
      // Café: baja `profundidad` (fracción del alto de la taza) desde su nivel inicial y se estrecha hasta
      // `estrechar` de su radio; vacía, la superficie del café desaparece.
      liquido: { profundidad: .42, estrechar: .8 },
      regreso: .6
    },
    // Grosor de la mesa pintada que cubre la mesa real (m) y cuánto excede su borde antes del recorte;
    // cubre la mesa elegida y, como mínimo, la composición con `margenMesa` unidades alrededor.
    grosorMesa: .004, cubrirMesa: 1.25, margenMesa: 1.2,
    // Marco de la ventana: tamaño relativo a la composición y separación detrás de ella (unidades).
    ventana: { escala: .85, detras: 1.2, sobreMesa: .4 },
    // Barra de progreso por encima del marco de la ventana (m sobre su borde superior; la frase va debajo de ella).
    paneles: { barra: .17, delante: .05 },
    aparecer: { mesa: 1.1, objetos: .55, intervalo: .12 },
    // Visión deteriorada al entrar (escena/vejez/vision.js). Todo menos las gafas.
    vision: {
      // 'posproceso': los objetos del escenario se dibujan aparte a baja resolución, se desenfocan y se
      // componen sobre la vista (un desenfoque real de lo virtual). 'material': respaldo más simple, sin
      // dibujo aparte (texturas sin detalle y colores apagados). Cambiar aquí si el visor tuviera problemas.
      modo: 'posproceso',
      // Resolución del dibujo aparte respecto de la del visor, paso del filtro (en píxeles de ese dibujo; más de
      // ~1,2 deja bandas) y pasadas: más pasadas desenfocan más (cada una es un dibujo pequeño, barato).
      resolucion: .2, radio: 1, pasadas: 4,
      // Capa translúcida de «vista nublada» sobre todo (lo virtual y el entorno real del passthrough):
      // color y opacidad inicial. No desenfoca la cámara del visor: es un velo superpuesto.
      velo: { color: '#ece7dc', opacidad: .6 },
      // Respaldo 'material': detalle de las texturas que se pierde (sesgo de mip) y velo sobre los colores.
      sesgo: 8, apagado: .5,
      // Segundos que tarda la vista en aclararse, después de la animación de ponerse las gafas. En el último
      // tramo (`fundido` del nivel) la imagen desenfocada cede su lugar a los objetos nítidos.
      aclarar: 1.6, fundido: .3
    },
    gafas: {
      // Distancia (m) entre el pellizco y un extremo de la montura para sujetarla.
      alcance: .09,
      // Se empiezan a poner a menos de `rostro` m del visor; si el seguimiento se pierde con las gafas
      // a menos de `tolerancia` m, también. Un pellizco puede perderse `gracia` s sin soltar.
      rostro: .24, tolerancia: .32, gracia: .4,
      // Rapidez con la que giran hacia la posición de uso mientras se acercan al rostro.
      giro: 5,
      // Animación de ponérselas (segundos y metros delante de los ojos): llegan frente a los ojos, se calzan
      // sobre el rostro (la montura enmarca la vista), se quedan un instante y se desvanecen.
      // `ancho`: ancho de la montura (m) mientras se las pone, como unas gafas reales aunque el escenario esté escalado.
      animacion: { llegar: .6, calzar: .5, mantener: .45, desvanecer: .55, frente: .13, puestas: .028, bajo: .006, ancho: .15 }
    },
    radio: {
      // Una perilla se toma con un pellizco a menos de `alcance` m de su centro y gira con la muñeca (alrededor
      // de su eje). Pasados `encender` rad suena la radio; volviéndola por debajo de `apagar` rad se apaga.
      alcance: .04, encender: 1.2, apagar: .5, maximo: 4.7,
      // Al acercar la mano la perilla se agranda un poco para indicar que se puede girar.
      senal: .07, agrandar: 1.25
    },
    macetas: {
      // Radio (unidades) alrededor del mantel en que la maceta se acomoda sola al soltarla.
      iman: 1.7,
      senalar: { alzar: .15, inclinar: .07 }
    },
    regadera: {
      // El agua empieza al superar esta fracción de Config.oldage.pourAngle y se corta por debajo de la otra.
      empezar: .9, parar: .75,
      // El pico debe quedar a menos de `cerca` unidades (en horizontal) de la planta y no más de `alto` sobre la tierra.
      cerca: 2.6, alto: 6,
      // Mientras cae agua, segundos que el sonido sigue después de la última gota.
      sonido: .15
    }
  },
  // Sonido procedural de la crayola (Web Audio).
  sonidoCrayola: {
    // Volumen general, relativo a Config.audio.level, y peso de la muestra crayola-pintar.wav en la mezcla.
    volumen: 1.6, muestra: .35,
    // Velocidad de la punta (m/s) desde la que empieza a sonar y con la que llega al máximo.
    velocidadMin: .008, velocidadMax: .14
  }
};

// Capas de dibujo de three.js. `vision`: lo que entra al dibujo aparte que se desenfoca en la vejez
// (objetos del escenario y luces). La cámara del visor usa la capa 0.
export const CAPAS = { vision: 3 };
