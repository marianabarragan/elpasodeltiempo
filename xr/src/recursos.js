// Archivos de la carpeta assets/ de la experiencia original que usa la app XR.
// En desarrollo se sirven desde ../assets; al compilar se copian a dist/assets.
// Este módulo solo contiene datos porque también lo lee vite.config.js.
export const RECURSOS_ORIGINALES = [
  'models/Inicio/reloj de arena/reloj_de_arena_completo/reloj_de_arena_completo.glb',
  'models/childhood/toys.glb',
  'photos/childhood.webp',
  'photos/adulthood.webp',
  'photos/oldage.webp',
  // El tablero original carga el candado desde su copia en script.
  'Iconos/cafe/candado fotos.svg.js',
  'Iconos/cafe/boton volumen.svg',
  'Iconos/cafe/mute volumen.svg',
  'Iconos/cafe/botón de continuar.svg',
  'audio/ambiental.mp3',
  'audio/1childhoold/juego de anillos.mp3',
  // Base sampleada del sonido procedural de la crayola (sonido-crayola.js).
  'audio/1childhoold/crayola-pintar.wav',
  // Adultez: escritorio (la base del escenario), monitor y pantalla, teclado, reloj, termo, planta, hoja,
  // lapicero, calendario y repisa, con los sonidos de pantalla, reloj, calendario, lista y sorbo de café
  // (sin pared de fondo).
  'models/adulthood/mesa/mesa.glb',
  'audio/adultood/bebercafe.mp3',
  'models/adulthood/computador/monitor.glb',
  'models/adulthood/computador/pantalla.glb',
  'models/adulthood/computador/teclado.glb',
  'models/adulthood/reloj_de_mesa/reloj_de_mesa.glb',
  'models/adulthood/termo/termo.glb',
  'models/adulthood/matera/matera_y_planta.glb',
  'models/adulthood/papel/hoja_pendientes.glb',
  'models/adulthood/lapicero/lapicero.glb',
  'models/adulthood/corcho/corcho_calendario.glb',
  'models/adulthood/libros/libros_y_repisa.glb',
  'audio/adultood/encender-apagarpantalla.mp3',
  'audio/adultood/reloj digital.mp3',
  'audio/adultood/calendario.mp3',
  'audio/adultood/lista.mp3',
  // Vejez: mesa, marco de la ventana, gafas, macetas, regadera, radio y taza, con sus sonidos.
  'models/oldage/mesa/mesa.glb',
  'models/oldage/ventana/ventanamarco.glb',
  'models/oldage/gafas/gafas.glb',
  'models/oldage/matera 1/matera1-web.glb',
  'models/oldage/maatera 2/matera2.glb',
  'models/oldage/regadera/regadera.glb',
  'models/oldage/radio/radio.glb',
  'models/oldage/taza/taza-web.glb',
  'models/oldage/taza/platotaza.glb',
  'audio/ageold/elegir-planta.wav',
  'audio/ageold/regadera-agua.wav',
  'audio/ageold/bebercafe.mp3',
  'audio/ageold/radio.mp3',
  // Fotos de las tarjetas del carrusel de aportes (textos.js, APORTES).
  'photos/tarjetas/acompana.webp',
  'photos/tarjetas/dona.webp'
];
