/*
 * Teclas del computador de la adultez, con Web Audio. En assets/audio no hay una grabación de teclado, así que
 * se sintetiza el «clic» de una tecla: un golpe de ruido muy breve por un filtro de banda agudo (el plástico de
 * la tecla) y un golpe sordo y grave al tocar fondo. Cada pulsación cambia un poco su volumen, su altura y su
 * duración para que no suene siempre igual. Volumen discreto: es un teclado en uso, no un efecto.
 */
export function crearSonidoTeclado({ habilitado, nivel }) {
  let ctx = null, salida = null, ruido = null;
  const azar = (a, b) => a + Math.random() * (b - a);

  function construir() {
    salida = ctx.createGain();
    salida.gain.value = .55 * nivel;
    salida.connect(ctx.destination);
    const largo = Math.floor(ctx.sampleRate * .25);
    ruido = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = ruido.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
  }

  // El plástico de la tecla: ruido breve por una banda aguda.
  function clic(inicio, fuerza) {
    const dura = azar(.018, .032);
    const fuente = ctx.createBufferSource();
    fuente.buffer = ruido;
    const banda = ctx.createBiquadFilter();
    banda.type = 'bandpass';
    banda.frequency.value = azar(2600, 4200);
    banda.Q.value = azar(1.2, 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, inicio);
    g.gain.linearRampToValueAtTime(fuerza * azar(.7, 1), inicio + .002);
    g.gain.exponentialRampToValueAtTime(.0005, inicio + dura);
    fuente.connect(banda).connect(g).connect(salida);
    fuente.start(inicio, azar(0, .2), dura + .02);
  }

  // El fondo de la tecla: un golpe grave y corto, un instante después.
  function fondo(inicio, fuerza) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(azar(150, 210), inicio);
    osc.frequency.exponentialRampToValueAtTime(azar(70, 95), inicio + .04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, inicio);
    g.gain.linearRampToValueAtTime(fuerza * azar(.25, .4), inicio + .003);
    g.gain.exponentialRampToValueAtTime(.0005, inicio + .05);
    osc.connect(g).connect(salida);
    osc.start(inicio);
    osc.stop(inicio + .06);
  }

  return {
    pulsaciones: 0,
    // Se crea dentro del clic de «Entrar en realidad mixta»: el navegador exige un gesto del usuario.
    desbloquear() {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      if (!ctx) { ctx = new Contexto(); construir(); }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    reanudar() { if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); },
    // Una pulsación de tecla (fuerza 0–1).
    tecla(fuerza = .8) {
      this.pulsaciones += 1;
      if (!ctx || !habilitado()) return;
      const ahora = ctx.currentTime + .002;
      clic(ahora, fuerza);
      fondo(ahora + azar(.006, .012), fuerza);
    }
  };
}
