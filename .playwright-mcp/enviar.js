async (page) => {
  const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd071lc1pEA6bBLcu8bzz1ug010xrFM1Pu0qUAILUr2KXfjsw/viewform';
  const DIR = 'C:\\Users\\sofia\\OneDrive\\Desktop\\elpasodeltiempo\\.playwright-mcp\\';
  const H = [null,
    '1. Visibilidad del estado del sistema',
    '2. Relación entre el sistema y el mundo real',
    '3. Control y libertad del usuario',
    '4. Consistencia y estándares',
    '5. Prevención de errores',
    '6. Reconocer antes que recordar',
    '7. Flexibilidad y eficiencia de uso',
    '8. Diseño estético y minimalista',
    '9. Ayudar a reconocer, diagnosticar y recuperarse de errores',
    '10. Ayuda y documentación'];
  const items = [
    { u: 'Ponentes y Keynotes, iconos de redes en cada tarjeta', h: 9, s: 3, img: 'ev11-redes.jpg',
      o: 'Los iconos de GitHub, LinkedIn, X, Instagram y web de los ponentes no llevan a ningún lado. Pasa igual con "Enviar propuesta", "Quiero mentoría" y las ediciones 2024 y 2023 del footer.',
      p: 'Al hacer clic la página salta arriba sin ningún aviso. El usuario no sabe si falló algo y el sitio se siente sin terminar.',
      f: 'Poner los enlaces reales o quitar los iconos que no existan. Si algo aún no está listo, mostrarlo desactivado con un "Próximamente".' },
    { u: 'Inicio, sección Sobre la conferencia (cifras)', h: 4, s: 2, img: 'ev03a-stats.jpg',
      o: 'Las cifras dicen "5 keynotes", pero en la sección Keynotes solo hay 4 tarjetas y una de ellas es "Por anunciar".',
      p: 'Los datos no coinciden entre secciones y el usuario empieza a dudar de la información del evento.',
      f: 'Usar el mismo número en ambos lugares, o mostrar las 5 keynotes aunque alguna esté por anunciar.' },
    { u: 'Keynotes, perfil de la keynote "Por anunciar"', h: 5, s: 2, img: 'ev04-por-anunciar.jpg',
      o: 'El perfil de la keynote que todavía no se ha anunciado tiene iconos de redes y un botón "Ver la charla".',
      p: 'Invita a hacer clic en cosas que no existen todavía, así que el usuario termina en enlaces vacíos.',
      f: 'Ocultar las redes y el botón hasta que se anuncie la persona. Dejar solo un texto tipo "Te avisamos pronto".' },
    { u: 'Inicio, primera pantalla (hero)', h: 6, s: 2, img: 'ev05-hero-sin-menu.png',
      o: 'Al entrar al sitio no hay menú. Solo aparece cuando uno empieza a bajar.',
      p: 'En la primera pantalla el usuario no ve qué secciones tiene el sitio y le toca explorar a ciegas.',
      f: 'Mostrar el menú desde que carga la página, aunque sea más discreto sobre la ilustración.' },
    { u: 'Agenda, buscador', h: 5, s: 2, img: 'ev06-busqueda.jpg',
      o: 'Busqué "STUART", la charla que la misma página recomienda arriba, y salió "No hay resultados". El buscador solo busca en el día que está seleccionado y la charla es el sábado.',
      p: 'El usuario cree que la charla no existe, cuando en realidad está en otro día.',
      f: 'Buscar en los 3 días a la vez, o avisar algo como "Hay 1 resultado el sábado".' },
    { u: 'Agenda, contadores del día', h: 1, s: 1, img: 'ev06-busqueda.jpg',
      o: 'Con la búsqueda sin resultados arriba dice "0 de 10 bloques", pero el chip de abajo sigue diciendo "Todas (7)". Son dos cifras distintas para el mismo día.',
      p: 'El usuario no sabe cuántos eventos hay realmente ni qué está filtrando.',
      f: 'Dejar un solo contador que se actualice con la búsqueda y los filtros.' },
    { u: 'Agenda, lista de eventos del día', h: 7, s: 2, img: 'ev07-paginacion.jpg',
      o: 'Un día con solo 7 eventos está partido en 2 páginas.',
      p: 'Toca hacer clics extra para ver un solo día y se pierde la vista completa del horario, que es justo lo que uno busca en una agenda.',
      f: 'Mostrar todos los eventos del día en una sola lista, ordenada por hora.' },
    { u: 'Agenda, botón "Inicio" para regresar', h: 4, s: 1, img: 'ev08a-inicio.jpg',
      o: 'El botón "Inicio" es transparente y toma el color de la ilustración que tiene detrás. En la vista de una charla, el botón de regreso ("Volver a los keynotes") es verde sólido.',
      p: 'El mismo tipo de botón se ve distinto según la pantalla y sobre la ilustración se lee peor.',
      f: 'Usar un solo estilo para los botones de regreso, con fondo sólido.' },
    { u: 'Versión móvil, sección Ponentes', h: 8, s: 2, img: 'ev09-movil-ponentes.jpg',
      o: 'En celular cada tarjeta de ponente ocupa casi toda la pantalla por el avatar tan grande. La página completa mide unos 17.000 px de alto.',
      p: 'Hay que hacer mucho scroll para pasar por los ponentes y es fácil cansarse antes de llegar a la agenda o al lugar.',
      f: 'En móvil, poner el avatar pequeño al lado del nombre, o mostrar los ponentes en un carrusel horizontal.' },
    { u: 'Versión móvil, menú desplegable', h: 8, s: 1, img: 'ev10-movil-menu.jpg',
      o: 'El menú en celular es semitransparente y se alcanza a ver el texto de la sección de atrás.',
      p: 'Las opciones del menú se mezclan con el contenido y cuesta leerlas.',
      f: 'Darle un fondo sólido al menú desplegable, o un desenfoque más fuerte.' },
    { u: 'Inicio, Boletas, tarjeta Estudiante', h: 2, s: 1, img: 'ev02-carne.jpg',
      o: '"Requiere carné vigente" aparece con el mismo chulo que los beneficios de la boleta.',
      p: 'Un requisito se lee como si fuera un beneficio y el usuario puede pasarlo por alto.',
      f: 'Mostrarlo aparte como una nota, o con un icono distinto de información.' },
    { u: 'Boletas, versión en inglés', h: 2, s: 1, img: 'ev12-precios-en.jpg',
      o: 'En inglés los precios siguen con el formato de Colombia: "$180.000 COP".',
      p: 'En inglés el punto es decimal, así que alguien de afuera puede leer 180 pesos en vez de 180 mil.',
      f: 'Cambiar el formato según el idioma, por ejemplo "COP 180,000".' },
    { u: 'Preguntas frecuentes y menú principal', h: 10, s: 2, img: 'ev13-faq.jpg',
      o: 'La sección de preguntas frecuentes no está en el menú, solo en el footer. Además no explica cómo comprar la boleta ni cómo aplicar a una beca.',
      p: 'Las dudas más comunes no tienen respuesta y la ayuda que sí existe es difícil de encontrar.',
      f: 'Agregar FAQ al menú y sumar preguntas sobre el proceso de compra, requisitos y fechas de las becas.' },
  ];
  const done = [];
  for (const it of items) {
   try {
    await page.goto(FORM);
    await page.getByRole('textbox', { name: /Ubicación del problema/ }).fill(it.u);
    await page.getByRole('radio', { name: H[it.h], exact: true }).check();
    await page.getByRole('textbox', { name: /Qué observaste/ }).fill(it.o);
    await page.getByRole('textbox', { name: /Por qué representa/ }).fill(it.p);
    await page.getByRole('textbox', { name: /Qué solución/ }).fill(it.f);
    await page.getByRole('radio', { name: new RegExp('^' + it.s + ' ') }).check();
    await page.getByRole('button', { name: /Evidencia visual/ }).click();
    const frame = page.frameLocator('iframe[src*="picker"]').last();
    const chooserP = page.waitForEvent('filechooser', { timeout: 30000 });
    await frame.getByRole('button', { name: 'Examinar' }).click({ timeout: 30000 });
    const chooser = await chooserP;
    await chooser.setFiles(DIR + it.img);
    await page.getByRole('button', { name: 'Quitar archivo' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await page.waitForURL(/formResponse/, { timeout: 30000 });
    done.push(it.u);
   } catch (e) {
    return { done, failedAt: it.u, error: String(e).slice(0, 400) };
   }
  }
  return done;
}
