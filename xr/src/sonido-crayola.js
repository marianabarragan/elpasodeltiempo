import { AJUSTES } from './config.js';
import { url } from './rutas.js';

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ruido rosa (filtro de Paul Kellet): base de la cera raspando el papel.
function ruidoRosa(ctx, segundos) {
  const largo = Math.floor(ctx.sampleRate * segundos), buffer = ctx.createBuffer(1, largo, ctx.sampleRate), datos = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, pico = 0;
  for (let i = 0; i < largo; i++) {
    const blanco = Math.random() * 2 - 1;
    b0 = .99886 * b0 + blanco * .0555179; b1 = .99332 * b1 + blanco * .0750759; b2 = .969 * b2 + blanco * .153852;
    b3 = .8665 * b3 + blanco * .3104856; b4 = .55 * b4 + blanco * .5329522; b5 = -.7616 * b5 - blanco * .016898;
    datos[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + blanco * .5362;
    b6 = blanco * .115926;
    pico = Math.max(pico, Math.abs(datos[i]));
  }
  for (let i = 0; i < largo; i++) datos[i] /= pico;
  return buffer;
}

// Crepitar de las fibras del papel: chasquidos breves a intervalos irregulares sobre un fondo muy bajo.
function crepitar(ctx, segundos) {
  const largo = Math.floor(ctx.sampleRate * segundos), buffer = ctx.createBuffer(1, largo, ctx.sampleRate), datos = buffer.getChannelData(0);
  const caida = Math.max(2, Math.round(ctx.sampleRate * .0008));
  for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * .04;
  for (let i = 0; i < largo; i += Math.round(ctx.sampleRate * (.002 + Math.random() * .012))) {
    const fuerza = (.3 + Math.random() * .7) * (Math.random() < .5 ? -1 : 1);
    for (let k = 0; k < caida * 4 && i + k < largo; k++) datos[i + k] += fuerza * Math.exp(-k / caida) * (Math.random() * .6 + .4);
  }
  return buffer;
}

/*
 * Sonido procedural de la crayola. Solo suena con la punta tocando la hoja y en movimiento:
 * - capa procedural (65 %): ruido rosa por dos filtros —«adelante» (alejándose del usuario: más brillante
 *   y áspero, como empujar la crayola) y «atrás» (hacia el usuario: más grave y suave, como arrastrarla)—
 *   más un crepitar de fibras que crece al empujar;
 * - muestra crayola-pintar.wav (35 %): cada trazo empieza en un punto al azar y a una velocidad distinta,
 *   y pasa por un filtro que también cambia con la dirección.
 * La velocidad de la punta abre el volumen y sube el tono; la continuidad del trazo lo asienta; al
 * empezar a tocar y al invertir la dirección suena un roce breve. Una deriva lenta al azar evita que dos
 * trazos suenen iguales, y un filtro de 6,5 kHz suaviza los agudos para no cansar el oído.
 */
export function crearSonidoCrayola({ habilitado, nivel }) {
  let ctx = null, n = null, muestra = null, voz = null;
  const estado = { contacto: false, mezcla: .5, signo: 0, deriva: 0, trazo: 0 };
  const { volumen, muestra: pesoMuestra, velocidadMin, velocidadMax } = AJUSTES.sonidoCrayola;

  function construir() {
    const filtro = (tipo, frecuencia, q = .7) => { const f = ctx.createBiquadFilter(); f.type = tipo; f.frequency.value = frecuencia; f.Q.value = q; return f; };
    const ganancia = valor => { const g = ctx.createGain(); g.gain.value = valor; return g; };
    n = {
      salida: ganancia(volumen * nivel), suavizar: filtro('lowpass', 6500, .5), envolvente: ganancia(0),
      procedural: ganancia(1 - pesoMuestra), pesoMuestra: ganancia(pesoMuestra),
      ruido: ctx.createBufferSource(), grano: ctx.createBufferSource(),
      altoAdelante: filtro('highpass', 700), bandaAdelante: filtro('bandpass', 3000, .8), adelante: ganancia(.5),
      bandaAtras: filtro('bandpass', 1400, 1.2), bajoAtras: filtro('lowpass', 3200), atras: ganancia(.5),
      bandaGrano: filtro('bandpass', 2400, .7), granoNivel: ganancia(.3),
      brillo: filtro('highshelf', 2500)
    };
    n.ruido.buffer = ruidoRosa(ctx, 2.7);
    n.grano.buffer = crepitar(ctx, 1.9);
    n.ruido.loop = n.grano.loop = true;
    n.ruido.connect(n.altoAdelante).connect(n.bandaAdelante).connect(n.adelante).connect(n.procedural);
    n.ruido.connect(n.bandaAtras).connect(n.bajoAtras).connect(n.atras).connect(n.procedural);
    n.grano.connect(n.bandaGrano).connect(n.granoNivel).connect(n.procedural);
    n.procedural.connect(n.envolvente);
    n.brillo.connect(n.pesoMuestra).connect(n.envolvente);
    n.envolvente.connect(n.salida).connect(n.suavizar).connect(ctx.destination);
    n.ruido.start();
    n.grano.start();
    fetch(url(window.TimeExperience.Config.assets.audio.frictionSrc))
      .then(respuesta => respuesta.arrayBuffer())
      .then(datos => ctx.decodeAudioData(datos))
      .then(buffer => { muestra = buffer; })
      .catch(() => { muestra = null; });
  }

  // Roce breve: ráfaga de ruido de 30 ms con caída rápida.
  function roce(fuerza) {
    if (!n) return;
    const t = ctx.currentTime, fuente = ctx.createBufferSource(), g = ctx.createGain(), paso = ctx.createBiquadFilter();
    fuente.buffer = n.grano.buffer;
    fuente.playbackRate.value = .8 + Math.random() * .5;
    paso.type = 'highpass';
    paso.frequency.value = 1500 + Math.random() * 800;
    g.gain.setValueAtTime(fuerza, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .06);
    fuente.connect(paso).connect(g).connect(n.salida);
    fuente.start(t, Math.random() * (fuente.buffer.duration - .1), .08);
  }

  function iniciarMuestra(rapidez) {
    if (!muestra || voz) return;
    voz = ctx.createBufferSource();
    voz.buffer = muestra;
    voz.loop = true;
    voz.playbackRate.value = .9 + .25 * rapidez + (Math.random() - .5) * .1;
    voz.connect(n.brillo);
    voz.start(ctx.currentTime, Math.random() * muestra.duration);
  }
  function detenerMuestra() {
    if (!voz) return;
    voz.stop(ctx.currentTime + .15);
    voz = null;
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
    // contacto: la punta toca la hoja; velocidad en m/s; adelante: −1 (hacia el usuario) a 1 (alejándose).
    actualizar(dt, contacto, velocidad, adelante) {
      if (!n) return;
      const t = ctx.currentTime, activo = contacto && habilitado();
      const rapidez = suave(velocidadMin, velocidadMax, velocidad);
      estado.trazo = activo && rapidez > 0 ? estado.trazo + dt : 0;
      const continuidad = Math.min(1, estado.trazo / .3);
      estado.deriva = Math.max(-.3, Math.min(.3, (estado.deriva + (Math.random() - .5) * dt * 1.5) * Math.exp(-dt * .8)));
      estado.mezcla += ((adelante + 1) / 2 - estado.mezcla) * (1 - Math.exp(-dt / .08));
      const m = estado.mezcla, amplitud = activo ? rapidez * (.7 + .3 * continuidad) * (1 + estado.deriva * .25) : 0;
      estado.objetivo = {
        amplitud, adelante: m, atras: (1 - m) * .9, grano: .2 + .6 * m * rapidez,
        filtroAdelante: 2600 + 1600 * rapidez + 400 * estado.deriva, filtroAtras: 1150 + 650 * rapidez + 200 * estado.deriva, brillo: -5 + 9 * m
      };
      const o = estado.objetivo;
      n.envolvente.gain.setTargetAtTime(o.amplitud, t, activo ? .03 : .02);
      n.adelante.gain.setTargetAtTime(o.adelante, t, .05);
      n.atras.gain.setTargetAtTime(o.atras, t, .05);
      n.granoNivel.gain.setTargetAtTime(o.grano, t, .05);
      n.bandaAdelante.frequency.setTargetAtTime(o.filtroAdelante, t, .06);
      n.bandaAtras.frequency.setTargetAtTime(o.filtroAtras, t, .06);
      n.brillo.gain.setTargetAtTime(o.brillo, t, .06);
      n.ruido.playbackRate.setTargetAtTime(.85 + .35 * rapidez, t, .08);
      n.grano.playbackRate.setTargetAtTime(.7 + .8 * rapidez, t, .08);
      if (voz) voz.playbackRate.setTargetAtTime(.9 + .25 * rapidez + estado.deriva * .1, t, .1);
      // Cambio de sentido con la crayola en marcha: roce breve.
      const signo = activo && rapidez > .3 && Math.abs(adelante) > .4 ? Math.sign(adelante) : 0;
      if (signo && estado.signo && signo !== estado.signo) roce(.18 * rapidez);
      if (signo) estado.signo = signo;
      if (activo && !estado.contacto) { roce(.1); iniciarMuestra(rapidez); }
      if (!activo && estado.contacto) { detenerMuestra(); estado.signo = 0; }
      estado.contacto = activo;
    },
    get sonando() { return estado.contacto && (n?.envolvente.gain.value ?? 0) > .01; },
    // Estado actual de la mezcla, para revisar el comportamiento sin escucharlo.
    diagnostico() {
      return n && { contacto: estado.contacto, objetivo: estado.objetivo, muestra: !!muestra, contexto: ctx.state };
    }
  };
}
