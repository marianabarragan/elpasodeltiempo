import { url } from './rutas.js';

/*
 * Hielo dentro del termo, con Web Audio. En assets/audio no hay una grabación de hielo, así que se sintetiza:
 * - cada cubo que choca es un golpe de ruido breve pasado por dos filtros resonantes a alturas inarmónicas
 *   (el «clac» seco del hielo, sin tonos puros que suenen a campanilla), con su propio volumen y duración;
 * - el recipiente responde con un golpe sordo y grave, más suave;
 * - el líquido se mece con un soplo de ruido filtrado que crece y se apaga.
 * Una sacudida son varios cubos a intervalos irregulares, más y más fuertes cuanto más brusco el movimiento;
 * alturas, tiempos y volúmenes cambian en cada golpe para que no se repita un patrón reconocible.
 *
 * `muestra`: ruta de una grabación de hielo (p. ej. 'assets/audio/adultood/hielo.mp3') para reemplazar la
 * síntesis; se reproduce con variaciones moderadas de velocidad y volumen. Se configura en
 * AJUSTES.adultez.termo.hielo.muestra (y hay que añadirla a recursos.js para la versión compilada).
 */
export function crearSonidoHielo({ habilitado, nivel, muestra = null }) {
  let ctx = null, salida = null, ruido = null, grabacion = null, voces = 0;
  const azar = (a, b) => a + Math.random() * (b - a);
  const MAX_VOCES = 28;

  function construir() {
    salida = ctx.createGain();
    salida.gain.value = 1.3 * nivel;
    // Un compresor suave evita que una sacudida fuerte sature.
    const compresor = ctx.createDynamicsCompressor();
    compresor.threshold.value = -18; compresor.ratio.value = 3; compresor.attack.value = .003; compresor.release.value = .12;
    salida.connect(compresor).connect(ctx.destination);
    const largo = Math.floor(ctx.sampleRate * .5);
    ruido = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = ruido.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    if (muestra) {
      fetch(url(muestra)).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buffer => { grabacion = buffer; }).catch(() => { grabacion = null; });
    }
  }

  // Fuente de ruido que empieza en un punto al azar del búfer (cada golpe suena distinto).
  function fuenteRuido(inicio, dura) {
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    fuente.start(inicio, azar(0, .45), dura + .02);
    voces += 1;
    fuente.onended = () => { voces -= 1; };
    return fuente;
  }

  // Un cubo contra la pared: ruido muy breve por dos resonancias agudas inarmónicas.
  function cubo(inicio, fuerza) {
    if (voces > MAX_VOCES) return;
    const dura = azar(.018, .065), volumen = fuerza * azar(.35, .8);
    const fuente = fuenteRuido(inicio, dura);
    const mezcla = ctx.createGain();
    mezcla.gain.setValueAtTime(0, inicio);
    mezcla.gain.linearRampToValueAtTime(volumen, inicio + .0015);
    mezcla.gain.exponentialRampToValueAtTime(.0001, inicio + dura);
    const grave = azar(1300, 2600);
    [[grave, azar(6, 11), 1], [grave * azar(2.1, 2.9), azar(9, 16), .6]].forEach(([frecuencia, q, peso]) => {
      const banda = ctx.createBiquadFilter(), g = ctx.createGain();
      banda.type = 'bandpass'; banda.frequency.value = frecuencia; banda.Q.value = q;
      g.gain.value = peso;
      fuente.connect(banda).connect(g).connect(mezcla);
    });
    mezcla.connect(salida);
  }

  // El recipiente: golpe sordo y grave.
  function pared(inicio, fuerza) {
    if (voces > MAX_VOCES) return;
    const dura = azar(.03, .07);
    const fuente = fuenteRuido(inicio, dura), filtro = ctx.createBiquadFilter(), g = ctx.createGain();
    filtro.type = 'lowpass'; filtro.frequency.value = azar(350, 750); filtro.Q.value = azar(1.5, 3);
    g.gain.setValueAtTime(fuerza * azar(.25, .45), inicio);
    g.gain.exponentialRampToValueAtTime(.0001, inicio + dura);
    fuente.connect(filtro).connect(g).connect(salida);
  }

  // El líquido: soplo filtrado que crece y se apaga.
  function liquido(inicio, fuerza) {
    if (voces > MAX_VOCES) return;
    const sube = azar(.05, .1), baja = azar(.18, .35);
    const fuente = fuenteRuido(inicio, sube + baja), filtro = ctx.createBiquadFilter(), g = ctx.createGain();
    filtro.type = 'bandpass'; filtro.frequency.setValueAtTime(azar(450, 800), inicio);
    filtro.frequency.linearRampToValueAtTime(azar(300, 500), inicio + sube + baja);
    filtro.Q.value = azar(.8, 1.6);
    g.gain.setValueAtTime(.0001, inicio);
    g.gain.exponentialRampToValueAtTime(fuerza * azar(.08, .16), inicio + sube);
    g.gain.exponentialRampToValueAtTime(.0001, inicio + sube + baja);
    fuente.connect(filtro).connect(g).connect(salida);
  }

  function desdeGrabacion(inicio, fuerza) {
    const fuente = ctx.createBufferSource(), g = ctx.createGain();
    fuente.buffer = grabacion;
    fuente.playbackRate.value = azar(.88, 1.15);
    g.gain.value = fuerza * azar(.7, 1);
    fuente.connect(g).connect(salida);
    fuente.start(inicio);
  }

  return {
    // Se crea dentro del clic de «Entrar en realidad mixta»: el navegador exige un gesto del usuario.
    desbloquear() {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      if (!ctx) { ctx = new Contexto(); construir(); }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    reanudar() { if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); },
    // fuerza 0–1: una sacudida más brusca mueve más cubos, más fuerte. Devuelve cuántos golpes sonaron.
    chocar(fuerza = .6) {
      if (!ctx || !habilitado()) return 0;
      const ahora = ctx.currentTime;
      if (grabacion) { desdeGrabacion(ahora, .4 + fuerza * .6); return 1; }
      const cubos = 3 + Math.round(fuerza * 6 + Math.random() * 2);
      let t = ahora + azar(0, .01);
      for (let i = 0; i < cubos; i++) {
        // Intervalos irregulares (más juntos al principio) y volumen que decae con desorden.
        cubo(t, (.45 + fuerza * .55) * (1 - i / (cubos * 1.6)) * azar(.6, 1));
        t += -Math.log(1 - Math.random()) * azar(.012, .028);
      }
      pared(ahora + azar(0, .008), .35 + fuerza * .65);
      if (fuerza > .3) liquido(ahora + azar(.01, .03), fuerza);
      return cubos;
    }
  };
}
