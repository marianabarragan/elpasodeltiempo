(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXTOS EDITABLES DEL CIERRE (reflexión, formas de aportar y agradecimiento).
  // La interfaz se construye a partir de esta estructura (js/closing-screens.js), así que
  // basta con cambiar estos valores.
  // ─────────────────────────────────────────────────────────────────────────────
  app.ClosingContent = Object.freeze({
    // Reflexión: `title` en letra gruesa verde y `script` debajo, a mano en morado.
    reflection: {
      title: 'Hay momentos que duran',
      script: 'porque alguien decidió estar',
      description: 'Para muchas personas mayores, una conversación, una visita o una actividad compartida puede transformar un día entero.',
      question: '¿Te gustaría aprender cómo puedes aportar?',
      accept: 'Quiero aprender',
      decline: 'Ahora no.',
      hourglass: 'Reloj de arena de madera con arena dorada luminosa, rodeado por una enredadera con flores blancas. A los pocos segundos se voltea y la arena vuelve a caer.'
    },
    // Formas de aportar: `title` en mayúsculas moradas y `script` debajo, a mano en verde. Cada
    // tarjeta muestra su `title` y su `description`; al pasar el cursor (o con el teclado o un
    // toque) se amplía y muestra su `detail`: otro título, una descripción y ejemplos.
    contribute: {
      title: 'Pequeños gestos,',
      script: 'grandes momentos',
      continueLabel: 'Continuar al cierre',
      cards: [
        {
          id: 'share-time',
          title: 'Dona tu tiempo',
          description: 'Una conversación, una caminata o una tarde de juegos pueden convertirse en un recuerdo valioso.',
          detail: {
            title: 'Comparte tu tiempo',
            description: 'Empieza con algo sencillo y cercano. Muchas organizaciones realizan encuentros abiertos en los que puedes conversar, leer, caminar o compartir un saber.',
            examples: ['Una llamada o visita acordada.', 'Una tarde de juegos o lectura.', 'Enseñar o aprender algo juntos.']
          }
        },
        {
          id: 'accompany',
          title: 'Acompaña',
          description: 'Súmate como voluntario a una causa y construye un vínculo que crece con cada encuentro.',
          detail: {
            title: 'Acompaña un proceso',
            description: 'El acompañamiento frecuente permite que la confianza aparezca poco a poco. Puedes vincularte a un programa de voluntariado local y elegir una frecuencia posible para ti.',
            examples: ['Consulta programas en tu comunidad.', 'Define una frecuencia sostenible.', 'Escucha y construye el vínculo.']
          }
        },
        {
          id: 'contribute',
          title: 'Haz un aporte',
          description: 'Dona materiales para actividades, alimentos o un aporte económico a una organización cercana.',
          detail: {
            title: 'Haz un aporte',
            description: 'Un aporte material o económico ayuda a sostener actividades y espacios de encuentro. Antes de donar, pregunta a la organización qué necesita realmente.',
            examples: ['Materiales para talleres.', 'Alimentos o elementos de cuidado.', 'Apoyo económico a una entidad verificada.']
          }
        }
      ]
    },
    // Agradecimiento: `eyebrow` en mayúsculas moradas sobre una línea, `title` en verde (cada
    // elemento es una línea), los tres botones y, debajo, `description` en morado.
    thanks: {
      eyebrow: 'Llegamos al final de este recorrido',
      title: ['Gracias por regalarnos', 'unos minutos de tu tiempo.'],
      contribute: 'Ver formas de aportar',
      repeat: 'Repetir experiencia',
      exit: 'Salir de la experiencia',
      description: 'Acompañar también es una forma de transformar la manera en que vivimos el tiempo.'
    }
  });
})();
