import * as THREE from 'three';
import { GrabSystem, Grabbed, VisibilityState } from '@iwsdk/core';
import { AJUSTES } from './config.js';
import { ADULTHOOD_FINAL_PHRASE, TEXTOS } from './textos.js';
import { SistemaExperiencia } from './sistema.js';
import { avanzarGsap } from './gsap-xr.js';
import { alPulsar, colocar, crearPanel, mostrar, ocultar } from './paneles.js';
import { crearReticula } from './mesa/reticula.js';
import { crearColocacionManual, crearMesaSimulada, leerCandidatas, superficieEn, superficieManual } from './mesa/deteccion.js';
import { aEscena, aMundo, cabezaLocal, crearEspacio, medirFrente } from './mesa/espacio.js';
import { crearManos } from './manos.js';
import { crearOclusion } from './oclusion.js';
import { crearMovilidad } from './mover-paneles.js';
import { crearSuperficies } from './superficies.js';
import { crearSombras } from './escena/sombras.js';
import { crearManipulacion } from './escena/manipulacion.js';
import { crearLuces } from './escena/luces.js';
import { crearReloj } from './escena/reloj.js';
import { crearTablero } from './escena/tablero.js';
import { crearTransicion } from './escena/transicion.js';
import { crearNinez, evaluarMesa, prepararNinez } from './escena/ninez.js';
import { crearCrayola } from './escena/crayola.js';
import { crearProgreso } from './escena/progreso.js';
import { crearFinal } from './escena/final.js';
import { crearVejez, prepararVejez } from './escena/vejez/escenario.js';
import { crearAdultez, prepararAdultez, progresoAdultez } from './escena/adultez/escenario.js';
import { crearSonido } from './sonido.js';

const ETAPAS = ['childhood', 'adulthood', 'oldage'];
const limitar = THREE.MathUtils.clamp;
// Acceso de desarrollo a un escenario sin completar los anteriores: solo con `npm run dev` y la dirección
// terminada en ?escena=adultez (segunda foto) o ?escena=vejez (tercera foto), esa foto aparece
// desbloqueada en el tablero. La versión compilada (`npm run build`) no lo incluye.
const ACCESO_DESARROLLO = import.meta.env.DEV ? { adultez: 'adulthood', vejez: 'oldage' }[new URLSearchParams(location.search).get('escena')] : null;

/*
 * Recorrido del prototipo (diagrama de flujo V01 y storyboards):
 * entrada → seleccion (el usuario señala la superficie) → confirmando → introduccion → tablero
 * → transicion → ninez → regreso → tablero, con la foto de adultez desbloqueada
 * → transicion → adultez → regreso → tablero, con la foto de vejez desbloqueada
 * → transicion → vejez.
 */
export async function iniciarExperiencia(world) {
  const app = window.TimeExperience;
  world.renderer.localClippingEnabled = true;
  // Sin mapas de sombra (dibujaban la escena una segunda vez cada cuadro): sombras de contacto (escena/sombras.js).
  world.renderer.shadowMap.enabled = false;
  world.registerSystem(SistemaExperiencia);
  const sistema = world.getSystem(SistemaExperiencia);
  const sonido = crearSonido(world);
  const transicion = crearTransicion(world);
  const reticula = crearReticula(world);
  // Postura de las manos (gestos y toma de la crayola) y mano virtual (silueta y contorno, al estilo de Meta), que
  // se detiene en la cara de los paneles, del tablero y de la superficie del escenario activo.
  const manos = crearManos(world);
  const oclusion = crearOclusion(world, manos, {
    superficies: crearSuperficies({
      tablero: () => e.tablero?.raiz ?? null,
      escenario: () => ({ ninez: e.manipNinez, adultez: e.manipAdultez, vejez: e.manipVejez })[e.fase] ?? null,
      cuerpos: () => cuerposActivos(),
      // El termo en la mano: los dedos dibujados lo rodean.
      envolturas: () => (e.fase === 'adultez' && e.adultez?.termo.sostenido ? [e.adultez.termo.cilindroMundo(cilindroTermo)] : [])
    })
  });
  const cilindroTermo = {};
  // Paneles de texto con botón de mover (instrucción, confirmación y pregunta inicial). Las barras de progreso no se
  // mueven solas: acompañan a su escenario cuando se traslada.
  const movilidad = crearMovilidad(world, manos);
  const cabeza = () => world.player.head.getWorldPosition(new THREE.Vector3());
  const e = { fase: 'entrada', bloqueado: false, candidata: null, completo: false };
  // Objetos 3D del escenario activo que la mano dibujada no atraviesa; lo que está en la mano no cuenta (`libre`).
  const enLaMano = entidad => !!entidad?.hasComponent?.(Grabbed);
  function cuerposActivos() {
    if (e.fase === 'ninez' && e.ninez) {
      const n = e.ninez, m = n.props.metadata.models;
      return [{ objeto: m.rings }, { objeto: m.xylophone }, { objeto: n.caja.grupo, libre: !n.estadoCaja.sostenida },
        { objeto: n.crayon, libre: ['reposo', 'lista'].includes(e.crayola?.estado.modo) }];
    }
    if (e.fase === 'adultez' && e.adultez) {
      const a = e.adultez, m = a.props.models;
      return [{ objeto: m.monitor.root }, { objeto: m.keyboard.root }, { objeto: m.clockDigital.root }, { objeto: m.plant.root }, { objeto: m.wallCalendar.root },
        { objeto: m.coffeeThermos.root, libre: !a.termo.sostenido }, { objeto: m.pen.root, libre: !a.hoja.estado.sostenido }];
    }
    if (e.fase === 'vejez' && e.vejez) {
      const v = e.vejez, i = v.props.interactive, c = v.props.curiosities;
      return [{ objeto: i.glasses.root, libre: v.gafas.estado.modo === 'mesa' }, { objeto: i.pot1.root, libre: !enLaMano(v.entidades.pot1) },
        { objeto: i.pot2.root, libre: !enLaMano(v.entidades.pot2) }, { objeto: i.wateringCan.root, libre: !enLaMano(v.entidades.regadera) },
        { objeto: c.radio.root, libre: !v.radio.girando }, { objeto: c.coffeeCup.root }, { objeto: c.window.root }];
    }
    if (e.fase === 'introduccion' && e.reloj) return [{ objeto: e.reloj.soporte, libre: !enLaMano(e.reloj.entidad) }];
    return [];
  }
  // Alguna mano sostiene un objeto del escenario (crayola, caja, lapicero, vaso, maceta, regadera…) o un
  // extremo de las gafas de la vejez (que se toman con su propio pellizco a dos manos): entonces el gesto
  // de dos manos no toma el escenario completo.
  const sosteniendo = () => sistema.queries.sostenidos.entities.size > 0
    || (e.fase === 'vejez' && !!e.vejez && Object.values(e.vejez.gafas.estado.manos).some(extremo => extremo !== null));

  // Paneles que existen antes de conocer la mesa.
  const [instruccion, confirmar] = await Promise.all([
    crearPanel(world, 'panel-instruccion', { hojas: [46, 14] }),
    crearPanel(world, 'panel-confirmar', { hojas: [52, 25] })
  ]);
  e.paneles = { instruccion, confirmar };
  movilidad.registrar(instruccion, { alto: .14, ancho: .46 });
  movilidad.registrar(confirmar, { alto: .25, ancho: .52 });
  // La composición de niñez se arma una vez, con los juguetes de Blender ya cargados.
  await new Promise(resolve => app.ChildhoodModels.whenSettled(resolve));
  const base = prepararNinez(world);

  // Punto delante de la cabeza, a `bajar` metros bajo los ojos, fijo en el espacio.
  const frente = (distancia, bajar) => {
    const ojo = cabeza();
    const direccion = new THREE.Vector3(0, 0, -1).applyQuaternion(world.player.head.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    return ojo.addScaledVector(direccion, distancia).setY(ojo.y - bajar);
  };
  const avisar = texto => {
    instruccion.el('texto')?.setProperties({ text: texto });
    instruccion.el('detalle')?.setProperties({ text: TEXTOS.comoSeleccionar });
    colocar(instruccion, frente(1.1, .18), cabeza());
    if (!instruccion.visible) mostrar(instruccion);
  };

  // ---------- Selección de la superficie ----------
  // El usuario la señala con el rayo derecho; si el punto cae sobre una superficie que el visor ya
  // reconoció, se usa esa superficie completa (apoyo interno); si no, una del tamaño manual.
  const manual = crearColocacionManual(world, { alColocar: elegirPunto });

  // Al empezar la sesión la cabeza tarda unos cuadros en tener pose; sin ella los paneles quedarían en el piso.
  const esperarCabeza = () => new Promise(resolve => {
    const inicio = performance.now();
    const revisar = () => (cabeza().y > .4 || performance.now() - inicio > 3000) ? resolve() : setTimeout(revisar, 50);
    revisar();
  });

  async function buscarMesa() {
    e.fase = 'seleccion';
    await esperarCabeza();
    elegirSuperficie();
  }

  function elegirSuperficie(texto = TEXTOS.seleccionar) {
    e.fase = 'seleccion';
    avisar(texto);
    manual.iniciar();
    // En el emulador sin sala sintética se ofrece una mesa simulada, rotulada como tal.
    if (window.IWER_DEVICE && !leerCandidatas(sistema, cabeza()).length) {
      setTimeout(() => {
        if (e.fase !== 'seleccion') return;
        e.simulada ??= crearMesaSimulada(world, cabeza(), TEXTOS.simulada);
        proponer(e.simulada);
      }, 2500);
    }
  }

  function elegirPunto(punto) {
    if (e.fase !== 'seleccion') return;
    proponer(superficieEn(sistema, punto, cabeza()) ?? superficieManual(punto, cabeza()));
  }

  function proponer(candidata) {
    e.fase = 'confirmando';
    e.candidata = candidata;
    manual.detener();
    const { ancho, fondo } = medirFrente(candidata, cabeza());
    const { modo } = evaluarMesa(base, ancho, fondo);
    const aviso = confirmar.el('aviso');
    if (modo === 'normal') aviso?.setProperties({ display: 'none' });
    else aviso?.setProperties({ display: 'flex', text: modo === 'compacta' ? TEXTOS.pequena : TEXTOS.insuficiente });
    reticula.mostrar(candidata);
    if (instruccion.visible) ocultar(instruccion);
    colocar(confirmar, candidata.centro.clone().setY(candidata.centro.y + .3), cabeza());
    mostrar(confirmar, { retraso: .35 });
  }

  // «Buscar otra»: se limpia la selección y se vuelve a señalar.
  function buscarOtra() {
    if (e.fase !== 'confirmando') return;
    e.candidata = null;
    ocultar(confirmar);
    reticula.ocultar();
    elegirSuperficie(TEXTOS.buscarOtra);
  }

  alPulsar(confirmar, 'si', () => confirmarMesa());
  alPulsar(confirmar, 'otra', buscarOtra);

  // ---------- Introducción: reloj de arena y pregunta ----------
  async function confirmarMesa() {
    if (e.fase !== 'confirmando') return;
    e.fase = 'introduccion';
    manual.detener();
    ocultar(confirmar);
    reticula.ocultar(.8);
    const espacio = e.espacio = crearEspacio(world, e.candidata, cabeza());
    e.encaje = evaluarMesa(base, espacio.ancho, espacio.fondo);
    e.luces = crearLuces(world, espacio);
    e.reloj = crearReloj(world, espacio, { escala: AJUSTES.escala.reloj });
    // Sombra de contacto del reloj de arena sobre la mesa real (lo sigue al levantarlo).
    e.sombrasMesa = crearSombras(espacio.raiz, { superficie: () => 0, metros: () => 1 });
    e.sombrasMesa.agregar(e.reloj.soporte);
    e.intro = await crearPanel(world, 'panel-intro', { padre: espacio.entidad, hojas: [62, 33] });
    movilidad.registrar(e.intro, { alto: .33, ancho: .62 });
    alPulsar(e.intro, 'inicia', iniciarRecorrido);
    e.tablero = crearTablero(world, espacio);
    const ojo = cabezaLocal(espacio, cabeza());
    // Reloj a la derecha sobre la mesa; pregunta flotando frente al usuario, a la altura de lectura.
    const x = limitar(espacio.ancho * .3, .12, espacio.ancho / 2 - .1);
    e.reloj.soporte.position.set(x, 0, -espacio.fondo * .1);
    e.reloj.soporte.rotation.y = Math.atan2(ojo.x - x, ojo.z + espacio.fondo * .1);
    const altura = limitar(ojo.y - .2, AJUSTES.intro.panelMin, AJUSTES.intro.panelMax);
    colocar(e.intro, aMundo(espacio, -espacio.ancho * .06, altura, -espacio.fondo * AJUSTES.intro.panelFondo), cabeza());
    await e.reloj.aparecer();
    mostrar(e.intro);
    // El reloj se puede agarrar, levantar y girar mientras la pregunta espera.
    e.reloj.habilitarAgarre(true);
  }
  sistema.manejadores.set('reloj', { sostener: activo => e.reloj?.sostener(activo) });

  async function iniciarRecorrido() {
    if (e.fase !== 'introduccion') return;
    e.fase = 'tablero';
    ocultar(e.intro);
    e.reloj.desaparecer();
    e.tablero.colocar(cabezaLocal(e.espacio, cabeza()));
    await e.tablero.aparecer();
    if (ACCESO_DESARROLLO) e.tablero.desbloquear(ACCESO_DESARROLLO);
  }

  // ---------- Tablero de recuerdos ----------
  ETAPAS.forEach(etapa => sistema.manejadores.set(`foto-${etapa}`, {
    senalar: activo => {
      if (e.fase !== 'tablero' || e.bloqueado) return;
      if (activo) e.tablero.senalar(etapa);
      else if (e.tablero.tablero.hoveredPhoto === etapa) e.tablero.senalar(null);
    },
    // Cada foto desbloqueada abre su escenario.
    presionar: () => {
      if (e.fase !== 'tablero' || e.bloqueado || !e.tablero.estaDesbloqueada(etapa)) return;
      if (etapa === 'childhood') entrarNinez();
      if (etapa === 'adulthood') entrarAdultez();
      if (etapa === 'oldage') entrarVejez();
    }
  }));

  // ---------- Transición y escenario de niñez ----------
  async function entrarNinez() {
    e.fase = 'transicion';
    e.bloqueado = true;
    e.tablero.bloquearInteraccion();
    await e.tablero.destacar('childhood');
    // El entorno se oscurece por completo; en la oscuridad cambia la escena y la luz vuelve con la niñez.
    await transicion.cubrir();
    e.tablero.ocultar();
    if (!e.ninez) await construirNinez();
    e.ninez.preparar();
    await transicion.pausa();
    sonido.entrarEscena();
    const revelado = e.ninez.revelar();
    await transicion.destapar();
    await revelado;
    // La barra se ubica respecto del escenario (que el usuario pudo mover antes) y lo acompaña después.
    e.progreso.mostrar(aEscena(e.ninez.escena, 0, .2, -e.espacio.fondo / 2 + .04), cabeza());
    e.manipNinez.anclar(e.progreso.panel);
    e.fase = 'ninez';
    e.bloqueado = false;
  }

  async function construirNinez() {
    const espacio = e.espacio;
    const ninez = crearNinez(world, espacio, base, e.encaje);
    [e.progreso, e.final] = await Promise.all([
      crearProgreso(world, espacio, { sonido, alCompletar: completarNinez }),
      crearFinal(world, espacio, { alContinuar: volverAlTablero })
    ]);
    e.crayola = crearCrayola({ world, manos, ninez, sonido, alPintar: revisarFiguras });
    // Traslado, giro y escala del escenario completo con las dos manos.
    e.manipNinez = crearManipulacion({ manos, espacio, raiz: ninez.escena, area: ninez.area, superficie: ninez.superficie, cabeza });
    // Cada tecla del xilófono da su propia nota (no mientras se manipula el escenario).
    ninez.alTocarTecla = indice => { if (e.fase === 'ninez' && !e.manipNinez.activo) sonido.nota(indice); };
    // El bucle XR usa e.ninez solo cuando progreso y crayola ya existen.
    e.ninez = ninez;
    sistema.manejadores.set('juguete-rings', {
      senalar: activo => { if (e.fase === 'ninez') e.ninez.senalarJuguete('rings', activo); },
      presionar: () => { if (e.fase === 'ninez') sonido.efecto('rings'); }
    });
    // Tomar la crayola principal es el primer hito; solo se puede tomar después de elegir un color.
    sistema.manejadores.set('crayola', {
      sostener: activo => { if (activo) { e.progreso.marcar('crayon'); e.crayola.tomar(); } else e.crayola.soltar(); }
    });
    // Caja de crayolas: señalar una la asoma y suena su nota (como la paleta web); pulsarla y soltarla elige su
    // color. Mientras la caja está en la mano (o baja, o se manipula el escenario) las crayolas no eligen color, y
    // si entre pulsar y soltar se tomó la caja (un pellizco que empezó rozando una crayola), no se elige.
    base.colores.forEach((hex, indice) => sistema.manejadores.set(`color-${indice}`, {
      senalar: activo => {
        if (e.fase !== 'ninez' || (activo && e.ninez.cajaOcupada)) return;
        e.ninez.caja.senalar(indice, activo, AJUSTES.caja);
        if (activo) sonido.tono.play(indice);
      },
      presionar: () => { if (e.fase === 'ninez' && !e.bloqueado && !e.ninez.cajaOcupada) e.colorPulsado = { hex, indice, cajas: e.ninez.estadoCaja.movimientos }; },
      soltar: () => { if (e.colorPulsado?.indice === indice) { e.colorPendiente = e.colorPulsado; e.colorPulsado = null; } }
    }));
  }
  function revisarColorPendiente() {
    const pendiente = e.colorPendiente;
    if (!pendiente) return;
    e.colorPendiente = null;
    if (e.fase !== 'ninez' || e.bloqueado || e.ninez.cajaOcupada || e.manipNinez.activo || pendiente.cajas !== e.ninez.estadoCaja.movimientos) return;
    elegirColor(pendiente.hex, pendiente.indice);
  }

  // El color elegido tiñe la crayola principal, que queda lista para tomarla y pintar (segundo hito).
  function elegirColor(hex, indice) {
    e.ninez.setColor(hex);
    e.ninez.caja.elegir(indice, AJUSTES.caja);
    e.progreso.marcar('color');
    e.crayola.habilitarAgarre();
  }

  // Cada figura cuenta al cubrir Config.childhood.figureThreshold % de sus regiones.
  function revisarFiguras() {
    const avance = e.ninez.pintura.getProgress(), umbral = app.Config.childhood.figureThreshold;
    ['sun', 'house', 'tree'].forEach(figura => { if (avance[figura] >= umbral) e.progreso.marcar(figura); });
  }

  // Frase y flecha junto al escenario (donde esté) y ancladas a él.
  function mostrarFinal(final, manipulacion, posicionFrase, posicionFlecha) {
    const raiz = manipulacion.raiz;
    final.mostrar(aEscena(raiz, ...posicionFrase), aEscena(raiz, ...posicionFlecha), cabeza());
    manipulacion.anclar(final.paneles.frase);
    manipulacion.anclar(final.paneles.flecha);
  }

  function completarNinez() {
    e.completo = true;
    const { ancho, fondo } = e.espacio;
    mostrarFinal(e.final, e.manipNinez, [0, .32, -fondo / 2 + .04], [limitar(ancho * .4, .2, ancho / 2), .2, -fondo * .15]);
  }

  // La flecha cierra la niñez y regresa al tablero, que desbloquea la adultez.
  async function volverAlTablero() {
    if (e.bloqueado || e.fase !== 'ninez') return;
    e.bloqueado = true;
    e.fase = 'regreso';
    world.getSystem(GrabSystem)?.forceRelease(e.ninez.entidades.crayon);
    e.final.ocultar();
    await transicion.cubrir();
    e.ninez.ocultar();
    e.progreso.ocultar();
    sonido.salirEscena();
    e.tablero.mostrar();
    await transicion.pausa();
    await transicion.destapar();
    e.tablero.desbloquear('adulthood', () => {
      e.tablero.habilitarInteraccion();
      e.fase = 'tablero';
      e.bloqueado = false;
    });
  }

  // ---------- Escenario 2: adultez ----------
  async function entrarAdultez() {
    e.fase = 'transicion';
    e.bloqueado = true;
    e.tablero.bloquearInteraccion();
    await e.tablero.destacar('adulthood');
    // Mismo paso al recuerdo que los otros escenarios: oscuridad completa, cambio de escena y regreso de la luz.
    await transicion.cubrir();
    e.tablero.ocultar();
    if (!e.adultez) await construirAdultez();
    e.adultez.preparar();
    await transicion.pausa();
    sonido.entrarAdultez();
    const revelado = e.adultez.revelar();
    await transicion.destapar();
    await revelado;
    e.progresoAdultez.mostrar(aEscena(e.adultez.escena, ...e.adultez.paneles.barra), cabeza());
    e.manipAdultez.anclar(e.progresoAdultez.panel);
    e.fase = 'adultez';
    e.bloqueado = false;
    // Si se vuelve a un escenario ya completo, la flecha sigue disponible.
    if (e.adultez.terminada) mostrarFinAdultez();
  }

  async function construirAdultez() {
    const espacio = e.espacio;
    const base = await prepararAdultez();
    [e.progresoAdultez, e.finalAdultez] = await Promise.all([
      crearProgreso(world, espacio, { sonido, alCompletar: revisarFinAdultez, Logica: progresoAdultez() }),
      // Frase en panel flotante con el color de .adulthood-message en la web; el texto es ADULTHOOD_FINAL_PHRASE.
      crearFinal(world, espacio, { alContinuar: salirDeAdultez, texto: ADULTHOOD_FINAL_PHRASE, colorTexto: '#4a3520', tarjeta: { maxWidth: 58 } })
    ]);
    e.adultez = crearAdultez(world, espacio, base, {
      sonido: sonido.adultez, hielo: sonido.hielo, cabeza, manos, alHito: paso => { e.progresoAdultez.marcar(paso); revisarFinAdultez(); }
    });
    e.manipAdultez = crearManipulacion({ manos, espacio, raiz: e.adultez.escena, area: e.adultez.area, superficie: e.adultez.superficie, cabeza });
    Object.entries(e.adultez.manejadores).forEach(([id, manejador]) => sistema.manejadores.set(id, {
      presionar: () => { if (e.fase === 'adultez' && !e.bloqueado) manejador.presionar?.(); },
      sostener: activo => { if (e.fase === 'adultez' || !activo) manejador.sostener?.(activo); }
    }));
  }

  // Con los cinco hitos (barra al 100 %) y la hoja de vuelta en la mesa aparece la frase y, después, la flecha.
  function revisarFinAdultez() {
    if (!e.adultez || e.adultez.terminada || !e.progresoAdultez.logica.complete || !e.adultez.lista) return;
    // La barra termina su animación antes de avisar; la frase aparece cuando llega al 100 %.
    if (!e.progresoAdultez.logica.notified) return;
    e.adultez.terminada = true;
    mostrarFinAdultez();
  }
  function mostrarFinAdultez() {
    const { frase, flecha } = e.adultez.paneles;
    mostrarFinal(e.finalAdultez, e.manipAdultez, frase, flecha);
  }

  // La flecha cierra la adultez y regresa al tablero, que desbloquea la vejez.
  async function salirDeAdultez() {
    if (e.bloqueado || e.fase !== 'adultez') return;
    e.bloqueado = true;
    e.fase = 'regreso';
    e.finalAdultez.ocultar();
    await transicion.cubrir();
    e.adultez.ocultar();
    e.progresoAdultez.ocultar();
    sonido.salirAdultez();
    e.tablero.mostrar();
    await transicion.pausa();
    await transicion.destapar();
    e.tablero.desbloquear('oldage', () => {
      e.tablero.habilitarInteraccion();
      e.fase = 'tablero';
      e.bloqueado = false;
    });
  }

  // ---------- Escenario 3: vejez ----------
  async function entrarVejez() {
    e.fase = 'transicion';
    e.bloqueado = true;
    e.tablero.bloquearInteraccion();
    await e.tablero.destacar('oldage');
    // Mismo paso al recuerdo que la niñez: oscuridad completa, cambio de escena y regreso de la luz.
    await transicion.cubrir();
    e.tablero.ocultar();
    if (!e.vejez) await construirVejez();
    e.vejez.preparar();
    await transicion.pausa();
    sonido.entrarVejez();
    const revelado = e.vejez.revelar();
    await transicion.destapar();
    await revelado;
    // La barra va por encima del marco de la ventana, no dentro ni detrás de él.
    e.progresoVejez.mostrar(aEscena(e.vejez.escena, ...e.vejez.paneles.barra), cabeza());
    e.manipVejez.anclar(e.progresoVejez.panel);
    e.fase = 'vejez';
    e.bloqueado = false;
  }

  async function construirVejez() {
    const espacio = e.espacio;
    const base = await prepararVejez();
    [e.progresoVejez, e.finalVejez] = await Promise.all([
      crearProgreso(world, espacio, { sonido, alCompletar: revisarFinVejez, Logica: app.OldAgeProgress }),
      // Frase con los colores de .oldage-message en la web.
      crearFinal(world, espacio, {
        alContinuar: salirDeVejez, texto: app.Config.oldage.message, colorTexto: '#5a323a',
        tarjeta: { backgroundColor: '#fffbef', borderWidth: .2, borderColor: '#fadd87', maxWidth: 64 }
      })
    ]);
    e.vejez = await crearVejez(world, espacio, base, {
      sonido: sonido.vejez, cabeza, manos, luz: () => transicion.nivelLuz, alHito: paso => e.progresoVejez.marcar(paso), alTerminarActividad: revisarFinVejez
    });
    e.manipVejez = crearManipulacion({ manos, espacio, raiz: e.vejez.escena, area: e.vejez.area, superficie: e.vejez.superficie, cabeza });
    Object.entries(e.vejez.manejadores).forEach(([id, manejador]) => sistema.manejadores.set(id, {
      senalar: activo => { if (e.fase === 'vejez') manejador.senalar?.(activo); },
      presionar: () => { if (e.fase === 'vejez' && !e.bloqueado) manejador.presionar?.(); },
      sostener: activo => { if (e.fase === 'vejez' || !activo) manejador.sostener?.(activo); }
    }));
  }

  // Al 100 % y con la regadera de vuelta en su lugar aparece la frase y, después, la flecha.
  function revisarFinVejez() {
    if (!e.vejez || e.vejez.terminada || !e.vejez.completa || !e.progresoVejez.logica.complete) return;
    e.vejez.terminada = true;
    // La frase va por encima del marco de la ventana (no dentro ni detrás).
    mostrarFinal(e.finalVejez, e.manipVejez, e.vejez.paneles.frase, e.vejez.paneles.flecha);
  }

  // Punto de salida del escenario 3. La pantalla siguiente (el cierre) aún no existe en realidad mixta:
  // si experiencia.alSalirDeVejez está definido, la flecha lo llama; mientras tanto se vuelve al tablero.
  async function salirDeVejez() {
    if (e.bloqueado || e.fase !== 'vejez') return;
    if (experiencia.alSalirDeVejez) { experiencia.alSalirDeVejez(); return; }
    e.bloqueado = true;
    e.fase = 'regreso';
    e.finalVejez.ocultar();
    await transicion.cubrir();
    e.vejez.ocultar();
    e.progresoVejez.ocultar();
    sonido.salirVejez();
    e.tablero.mostrar();
    await transicion.pausa();
    await transicion.destapar();
    e.tablero.habilitarInteraccion();
    e.fase = 'tablero';
    e.bloqueado = false;
  }

  // ---------- Bucle XR ----------
  // Escenario activo y su manipulación a dos manos (solo uno a la vez; el tablero no se mueve con ellos).
  const ESCENARIOS = { ninez: 'manipNinez', adultez: 'manipAdultez', vejez: 'manipVejez' };
  sistema.alActualizar = dt => {
    avanzarGsap();
    manos.actualizar();
    movilidad.actualizar(dt);
    e.sombrasMesa?.actualizar();
    e.reloj?.paso(dt);
    if (e.tablero) e.tablero.update(cabeza());
    // Cada escenario se manipula con las dos manos libres; con un objeto en la mano el gesto no lo toma.
    Object.entries(ESCENARIOS).forEach(([fase, clave]) => {
      const manipulacion = e[clave];
      if (!manipulacion) return;
      // En la adultez, un pellizco de cada mano sobre la hoja la escala a ella, no al escenario.
      manipulacion.update(dt, { permitido: e.fase === fase && !e.bloqueado, ocupado: sosteniendo() || movilidad.ocupado || (fase === 'ninez' && !!e.ninez?.cajaOcupada) || (fase === 'adultez' && !!e.adultez?.ocupado) || (fase === 'vejez' && !!e.vejez?.ocupado) });
    });
    if (e.adultez) {
      e.adultez.update(dt, e.fase === 'adultez' && !e.bloqueado && !e.manipAdultez.activo);
      e.progresoAdultez.update();
      if (e.fase === 'adultez' && !e.adultez.terminada) revisarFinAdultez();
    }
    if (e.vejez) {
      e.vejez.update(dt, e.fase === 'vejez' && !e.bloqueado && !e.manipVejez.activo);
      e.progresoVejez.update();
    }
    if (e.ninez) {
      const enEscena = e.fase === 'ninez' && !e.bloqueado;
      // La caja de crayolas se toma con la mano libre (la que no sostiene la crayola ni mueve un panel).
      e.ninez.update(dt, { manos, activa: enEscena && !e.manipNinez.activo, manoLibre: lado => !movilidad.ocupado && !(e.crayola.estado.modo === 'sostenida' && e.crayola.agarre.estado.lado === lado) });
      revisarColorPendiente();
      e.crayola.update(dt);
      e.progreso.update();
      // El halo invita a tomar la crayola cuando ya tiene color y espera en la espuma.
      e.ninez.actualizarHalo(performance.now() / 1000, dt, enEscena && e.crayola.estado.modo === 'lista');
    }
    // Al final, con todo en su lugar (IWSDK devuelve lo agarrado a su pose inicial al empezar el cuadro y los agarres
    // lo llevan a la mano después): la mano dibujada, que rodea o no atraviesa los objetos donde quedaron.
    oclusion.actualizar(dt);
    // Y la visión deteriorada de la vejez dibuja su imagen desenfocada.
    e.vejez?.vision.actualizar(dt, e.vejez.escena.visible);
  };

  // ---------- Entrada y salida de la sesión ----------
  const entrada = document.getElementById('entrada');
  const boton = document.getElementById('entrar');
  const soporte = await (navigator.xr?.isSessionSupported('immersive-ar').catch(() => false) ?? false);
  if (soporte) boton.disabled = false;
  else document.getElementById('entrada-texto').textContent = TEXTOS.sinSoporte;
  boton.addEventListener('click', () => { sonido.desbloquear(); world.launchXR(); });
  world.visibilityState.subscribe(visibilidad => {
    const inmersivo = visibilidad !== VisibilityState.NonImmersive;
    entrada.hidden = inmersivo;
    if (inmersivo && e.fase === 'entrada') { sonido.escucharSesion(world.session); buscarMesa(); }
    // Al salir de la realidad mixta la experiencia vuelve a empezar desde la página de entrada.
    if (!inmersivo && e.fase !== 'entrada') location.reload();
  });

  const experiencia = { world, sistema, estado: e, base, sonido, manos, oclusion, movilidad, alSalirDeVejez: null };
  // Solo en desarrollo: abre el escenario 2 o el 3 desde el tablero sin pasar por la foto (pruebas automáticas).
  if (import.meta.env.DEV) {
    // Ajustes a mano para el emulador (corre a ~1 cuadro por segundo y algunos tiempos no se alcanzan).
    experiencia.ajustes = AJUSTES;
    experiencia.abrirAdultez = () => (e.fase === 'tablero' && !e.bloqueado ? entrarAdultez() : null);
    experiencia.abrirVejez = () => (e.fase === 'tablero' && !e.bloqueado ? entrarVejez() : null);
  }
  return experiencia;
}
