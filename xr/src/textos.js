// Textos del prototipo XR. Los de los botones y la pregunta de inicio están también en public/ui.
export const TEXTOS = {
  sinSoporte: 'Este navegador no puede entrar en realidad mixta. Abre esta página en el navegador de Meta Quest 3.',
  seleccionar: 'Selecciona una superficie para comenzar',
  buscarOtra: 'Selecciona otra superficie',
  comoSeleccionar: 'Mira hacia la superficie deseada y pon una de tus manos extendida sobre esta.',
  pequena: 'Esta superficie es pequeña: la escena se verá compacta.',
  insuficiente: 'Esta superficie es muy pequeña para la escena. Te sugerimos buscar otra.',
  simulada: 'MESA SIMULADA · solo en el emulador',
  // Frase de la niñez, igual que en index.html de la versión de computador.
  fraseNinez: 'Cuando somos niños el tiempo parece infinito'
};

// Frase final de la adultez en realidad mixta. Es provisional: para cambiarla basta con editar este texto.
export const ADULTHOOD_FINAL_PHRASE = 'En la adultez, el tiempo se llena de pendientes, decisiones y pequeños respiros.';

// Hoja de pendientes de la adultez: título y tareas, de arriba hacia abajo (se marcan en ese orden).
export const PENDIENTES = {
  titulo: 'Pendientes',
  tareas: [
    'Ahorrar 600 mil para el próximo mes.',
    'Actualizar la hoja de vida o el perfil de LinkedIn.',
    'Retomar el contacto con amigos viejos.',
    'Paseo pa’ puebliar el próximo festivo.'
  ]
};

// Sección de aportes (después del escenario 3). Las tarjetas del carrusel van en este orden (circular): la primera
// empieza al centro. `foto`: ruta en assets/ del proyecto original (copiada al compilar, ver recursos.js) o en public/.
export const APORTES = {
  tarjetas: [
    {
      titulo: 'COMPARTE TU TIEMPO',
      resumen: 'UNA CONVERSACIÓN, UNA CAMINATA O UNA TARDE DE JUEGOS PUEDEN CONVERTIRSE EN UN RECUERDO VALIOSO.',
      detalle: 'Empieza con algo sencillo y cercano. Muchas organizaciones realizan encuentros abiertos en los que puedes conversar, leer, caminar o compartir un conocimiento, habilidades, historias y momentos especiales.',
      foto: 'assets/photos/tarjetas/acompana.webp'
    },
    {
      titulo: 'APADRINA',
      resumen: 'SÚMATE COMO VOLUNTARIO ECONÓMICO PARA UN ABUELITO DÁNDOLE ESPERANZAS Y CONSTRUYE UN VÍNCULO.',
      detalle: 'Ellos nos dieron todo; hoy es nuestro turno de abrazarlos. Únete, apadrina a un abuelo y cambia su soledad por sonrisas.',
      // Foto del diseño (el abuelito con el mercado), en public/imagenes de la app.
      foto: 'imagenes/apadrina.jpeg'
    },
    {
      titulo: 'DONA',
      resumen: 'DONA MATERIALES PARA ACTIVIDADES, ALIMENTOS O UN APORTE ECONÓMICO A UNA ORGANIZACIÓN CERCANA',
      detalle: 'Un aporte material o económico ayuda a financiar actividades y espacios de encuentro. Antes de donar, pregunta a la organización qué necesita realmente.',
      foto: 'assets/photos/tarjetas/dona.webp'
    }
  ]
};
