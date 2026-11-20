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
    // Mesa simulada, solo en el emulador cuando no entrega superficies.
    simulada: { ancho: 1.2, fondo: .7, alto: .74, distancia: .8 }
  },
  escala: {
    // La hoja de niñez mide 11,5 unidades: 0,036 m por unidad la deja en ~41 cm.
    ninezMax: .036, ninezMin: .024,
    tablero: .03,
    reloj: .034
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
    // Suavizado del movimiento (1/s; más alto sigue a las manos más de cerca).
    suavizado: 16
  },
  // Crayola principal: estiramiento del cuerpo y de la punta, y grosor (proporción del modelo original).
  crayola: {
    cuerpo: 1.42, punta: .62, grosor: .33,
    // Toma palmar (la de las referencias): la crayola cruza el puño entre el pulgar y el índice y la punta
    // sale por el lado del meñique, hacia abajo. Igual para las dos manos porque se calcula con las
    // articulaciones de la mano que la sostiene; cada mano admite su propio ajuste.
    agarre: {
      // Fracción del largo, desde el extremo trasero, donde la sostienen el pulgar y el índice.
      sujecion: .32,
      // Cuánto se mete la crayola desde la pinza hacia el centro de la palma (0 en la pinza, 1 en la palma).
      haciaPalma: .3,
      // Inclinación de la punta hacia la muñeca (rad) respecto de la línea de los nudillos.
      haciaMuneca: .35,
      // Peso de la vertical: con la mano de lado la punta ya baja; con la palma hacia abajo se inclina hacia abajo.
      haciaAbajo: .7,
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
    // Elevación de una crayola señalada y de la elegida.
    senalada: .16, elegida: .32,
    // Al moverla: holgura (unidades) con la hoja, los juguetes y la crayola, y con el borde del piso.
    holgura: .2, bordePiso: .3,
    // Segundos tras soltarla en que tocar una crayola no elige color (la mano se está retirando).
    pausaColor: .35
  },
  // Oclusión de las manos reales y de los objetos virtuales.
  oclusion: {
    // Profundidad real del visor (WebXR Depth Sensing con DepthSensingSystem de IWSDK), si el navegador la
    // entrega. Sin ella queda la máscara de las manos articuladas.
    profundidad: true,
    // Un objeto virtual se oculta solo si lo real queda más de `tolerancia` m delante de él (del todo a
    // `tolerancia + fundido`): así la base de lo que se apoya en la mesa no se borra con el ruido del sensor.
    tolerancia: .02, fundido: .03
  },
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
      checklistPaper: { escala: 1.15, dx: -.4 },
      pen: { escala: 1.2, dx: .08, dz: .3 },
      // El termo conserva su tamaño: a 0,07–0,085 m/u mide 8–9,8 cm de ancho, lo que una mano alcanza a envolver.
      coffeeThermos: { escala: 1 },
      clockDigital: { escala: 1.05 },
      keyboard: { escala: 1.1 },
      wallCalendar: { escala: 1.15 }
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
    termo: {
      // Agarre envolvente: la palma a menos de `palma` m del eje del termo (además de su radio) y al menos
      // `dedos` puntas de dedo a menos de `puntas` m de su superficie, durante `confirmar` s. Se suelta si
      // quedan menos de dos puntas cerca durante `soltar` s. El pellizco y el botón lateral siguen sirviendo.
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
    // Grosor de la mesa pintada que cubre la mesa real (m) y cuánto excede su borde antes del recorte;
    // cubre la mesa elegida y, como mínimo, la composición con `margenMesa` unidades alrededor.
    grosorMesa: .004, cubrirMesa: 1.25, margenMesa: 1.2,
    // Marco de la ventana: tamaño relativo a la composición y separación detrás de ella (unidades).
    ventana: { escala: .85, detras: 1.2, sobreMesa: .4 },
    // Barra de progreso y frase final por encima del marco de la ventana (m sobre su borde superior).
    paneles: { barra: .17, frase: .08, delante: .05 },
    aparecer: { mesa: 1.1, objetos: .55, intervalo: .12 },
    desenfoque: {
      // Copias desplazadas de cada objeto (visión doble), su separación máxima (m) y su opacidad. Antes eran
      // dos copias a menos de 1 cm, casi transparentes, y parecía un error: ahora la visión doble es clara.
      copias: 3, separacion: .02, opacidad: .42,
      // Detalle de las texturas que se pierde (sesgo de mip) y velo claro sobre los colores.
      sesgo: 8, velo: .5,
      // Segundos que tarda la vista en aclararse, después de la animación de ponerse las gafas.
      aclarar: 1.6
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
