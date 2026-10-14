(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXTOS EDITABLES DEL CIERRE (reflexión, formas de aportar, ventanas y agradecimiento).
  // La interfaz se construye a partir de esta estructura (js/closing-screens.js), así que
  // basta con cambiar estos valores. En los títulos, `highlight: true` marca el tramo que
  // se destaca con color. Cada tarjeta lleva su ventana emergente en `modal`.
  // ─────────────────────────────────────────────────────────────────────────────
  app.ClosingContent = Object.freeze({
    reflection: {
      eyebrow: 'EL TIEMPO COMPARTIDO',
      title: [{ text: 'Hay momentos que duran porque alguien ' }, { text: 'decidió estar.', highlight: true }],
      description: 'Para muchas personas mayores, una conversación, una visita o una actividad compartida puede transformar un día entero.',
      question: '¿Te gustaría conocer cómo puedes aportar?',
      accept: 'Sí, quiero conocer',
      decline: 'Ahora no'
    },
    contribute: {
      title: [{ text: 'Pequeños gestos, ' }, { text: 'grandes momentos.', highlight: true }],
      description: 'No existe una única manera de acompañar. Encuentra la que se parezca más a ti.',
      continueLabel: 'Continuar al cierre',
      impactLabel: 'IMPACTO',
      // accent: 'yellow' | 'blue' | 'brown' (colores definidos en styles.css). icon: 'sun' | 'infinity' | 'heart'.
      cards: [
        {
          id: 'share-time', number: '01', icon: 'sun', accent: 'yellow',
          category: 'COMPROMISO FLEXIBLE',
          title: 'Comparte tu tiempo',
          description: 'Una conversación, una caminata o una tarde de juegos pueden convertirse en un recuerdo valioso.',
          impact: 'Crear compañía y alegría',
          action: 'Conocer más',
          modal: {
            eyebrow: 'UNA FORMA DE EMPEZAR',
            title: 'Comparte tu tiempo',
            description: 'Empieza con algo sencillo y cercano. Muchas organizaciones realizan encuentros abiertos en los que puedes conversar, leer, caminar o compartir un saber.',
            examples: ['Una llamada o visita acordada.', 'Una tarde de juegos o lectura.', 'Enseñar o aprender algo juntos.']
          }
        },
        {
          id: 'accompany', number: '02', icon: 'infinity', accent: 'blue',
          category: 'COMPROMISO CONSTANTE',
          title: 'Acompaña un proceso',
          description: 'Súmate como voluntario a una causa y construye un vínculo que crece con cada encuentro.',
          impact: 'Fortalecer vínculos duraderos',
          action: 'Conocer más',
          modal: {
            eyebrow: 'UNA FORMA DE EMPEZAR',
            title: 'Acompaña un proceso',
            description: 'El acompañamiento frecuente permite que la confianza aparezca poco a poco. Puedes vincularte a un programa de voluntariado local y elegir una frecuencia posible para ti.',
            examples: ['Consulta programas en tu comunidad.', 'Define una frecuencia sostenible.', 'Escucha y construye el vínculo con respeto.']
          }
        },
        {
          id: 'contribute', number: '03', icon: 'heart', accent: 'brown',
          category: 'APORTE PUNTUAL',
          title: 'Haz un aporte',
          description: 'Dona materiales para actividades, alimentos o un aporte económico a una organización cercana.',
          impact: 'Hacer posibles más encuentros',
          action: 'Conocer más',
          modal: {
            eyebrow: 'UNA FORMA DE EMPEZAR',
            title: 'Haz un aporte',
            description: 'Un aporte material o económico ayuda a sostener actividades y espacios de encuentro. Antes de donar, pregunta a la organización qué necesita realmente.',
            examples: ['Materiales para talleres.', 'Alimentos o elementos de cuidado.', 'Apoyo económico a una entidad verificada.']
          }
        }
      ]
    },
    thanks: {
      eyebrow: 'LLEGAMOS AL FINAL DE ESTE RECORRIDO',
      title: [{ text: 'Gracias por regalarnos unos minutos de ' }, { text: 'tu tiempo.', highlight: true }],
      description: 'Acompañar también es una forma de transformar la manera en que vivimos el tiempo.',
      repeat: 'Repetir experiencia',
      contribute: 'Ver formas de aportar',
      exit: 'Salir de la experiencia',
      closingLine: 'El tiempo que damos también permanece.'
    },
    closeLabel: 'Cerrar ventana'
  });
})();
