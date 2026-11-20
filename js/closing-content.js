(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Textos editables del cierre, usados por closing-screens.js.
  app.ClosingContent = Object.freeze({
    // Después del escenario 3: `title` y su segunda línea, `description` por líneas y la pregunta.
    reflection: {
      title: 'Hay momentos que duran',
      subtitle: 'Porque alguien decidió estar',
      description: ['Para muchas personas mayores, una conversación, una visita', 'o una actividad compartida puede transformar un día entero'],
      question: '¿Te gustaría aprender cómo puedes aportar?',
      accept: 'Quiero aprender',
      decline: 'Ahora no',
      hourglass: 'Reloj de arena de madera con arena dorada luminosa, rodeado por una enredadera con flores blancas. A los pocos segundos se voltea y la arena vuelve a caer.'
    },
    // Aportes: cada tarjeta muestra `title` y `description`; al abrirse, `photo` y `detail`.
    contribute: {
      title: 'Pequeños gestos',
      subtitle: 'Grandes momentos',
      continueLabel: 'Continuar al cierre',
      cards: [
        {
          id: 'share-time',
          title: 'Comparte tu tiempo',
          description: 'Una conversación, una caminata o una tarde de juegos pueden convertirse en un recuerdo valioso.',
          photo: 'assets/photos/tarjetas/comparte.webp',
          detail: 'Empieza con algo sencillo y cercano. Muchas organizaciones realizan encuentros abiertos en los que puedes conversar, leer, caminar o compartir un saber.'
        },
        {
          id: 'accompany',
          title: 'Acompaña',
          description: 'Súmate como voluntario a una causa y construye un vínculo que crece con cada encuentro.',
          photo: 'assets/photos/tarjetas/acompana.webp',
          detail: 'El acompañamiento frecuente permite que la confianza aparezca poco a poco. Puedes vincularte a un programa de voluntariado local y elegir una frecuencia posible para ti.'
        },
        {
          id: 'contribute',
          title: 'Dona',
          description: 'Dona materiales para actividades, alimentos o un aporte económico a una organización cercana.',
          photo: 'assets/photos/tarjetas/dona.webp',
          detail: 'Un aporte material o económico ayuda a sostener actividades y espacios de encuentro. Antes de donar, pregunta a la organización qué necesita realmente.'
        }
      ]
    },
    // Cierre: título por líneas y sus tres botones.
    thanks: {
      title: ['Gracias por regalarnos', 'un minuto de tu tiempo'],
      contribute: 'Ver formas de aportar',
      repeat: 'Repetir',
      exit: 'Salir'
    }
  });
})();
