import * as THREE from 'three';
import { AJUSTES } from '../config.js';
import { leerCandidatas, superficieEn } from './deteccion.js';

const LADOS = ['left', 'right'];
const DEDOS = ['index', 'middle', 'ring', 'pinky'];
const ABAJO = new THREE.Vector3(0, -1, 0);

// Anillo plano que se llena en el sentido del reloj (visto desde arriba) desde el lado opuesto al usuario.
function crearCirculo() {
  const { radio, grosor, pista, relleno } = AJUSTES.mesa.mano.circulo;
  const geometria = new THREE.RingGeometry(radio - grosor / 2, radio + grosor / 2, 96, 1).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uProgreso: { value: 0 }, uPista: { value: pista }, uRelleno: { value: relleno }, uOpacidad: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vPlano;
      void main() {
        vPlano = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uProgreso, uPista, uRelleno, uOpacidad;
      varying vec2 vPlano;
      void main() {
        // 0 al fondo (−Z, lejos del usuario) y creciendo hacia la derecha del usuario.
        float vVuelta = fract(atan(vPlano.x, -vPlano.y) / 6.2831853 + 1.0);
        float lleno = step(vVuelta, uProgreso);
        gl_FragColor = vec4(1.0, 1.0, 1.0, mix(uPista, uRelleno, lleno) * uOpacidad);
      }`
  });
  const circulo = new THREE.Mesh(geometria, material);
  circulo.name = 'circulo-mano-superficie';
  circulo.renderOrder = 9005;
  circulo.visible = false;
  circulo.raycast = () => {};
  return circulo;
}

/*
 * Elegir la superficie poniendo una mano extendida sobre ella (corrección de la selección): con cualquiera de las
 * dos manos, abierta, plana, con la palma hacia abajo y quieta. Bajo la mano aparece un círculo blanco que se
 * llena en `sostener` s; al completarse se entrega el punto de la superficie bajo la palma. Si la mano se levanta,
 * se cierra o se mueve, el círculo se vacía.
 *
 * La altura de la superficie: si la palma queda sobre una superficie que el visor reconoció (plano o mueble
 * «table»), la de esa superficie; si no (sin configuración del espacio), la de la mano apoyada (su articulación más
 * baja menos el radio de esa articulación). No se usa el sensor de profundidad.
 */
export function crearManoSobreSuperficie(world, manos, sistema, { cabeza, alElegir }) {
  const A = AJUSTES.mesa.mano;
  const circulo = crearCirculo();
  world.createTransformEntity(circulo, { persistent: true });
  const estado = { activo: false, lado: null, progreso: 0, opacidad: 0, elecciones: 0, ultima: null };
  const seguimiento = Object.fromEntries(LADOS.map(lado => [lado, { ancla: new THREE.Vector3(), con: false, progreso: 0, punto: new THREE.Vector3() }]));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), centro = new THREE.Vector3();

  // Mano extendida, plana y con la palma hacia abajo. Devuelve el punto de la superficie bajo la palma, o null.
  // `motivo` guarda por qué una mano no cuenta (diagnóstico y pruebas).
  const motivo = { left: '', right: '' };
  function evaluar(mano, destino) {
    const no = razon => { motivo[mano.lado] = razon; return null; };
    if (!mano.seguida) return no('sin seguimiento');
    const p = nombre => mano.puntos.get(nombre);
    const muneca = p('wrist');
    if (!muneca) return no('sin muñeca');
    const extendidos = DEDOS.filter(dedo => {
      const nudillo = p(`${dedo}-finger-phalanx-proximal`), punta = p(`${dedo}-finger-tip`);
      return nudillo && punta && a.subVectors(punta, muneca).length() > A.extendido * b.subVectors(nudillo, muneca).length();
    }).length;
    if (extendidos < A.dedos) return no(`${extendidos} dedos extendidos`);
    if (mano.palma.dot(ABAJO) < A.palmaAbajo) return no('la palma no mira hacia abajo');
    if (Math.abs(mano.dedos.y) > A.inclinacion) return no('la mano está inclinada');
    // Centro de la palma y la articulación más baja (su piel inferior).
    centro.copy(p('middle-finger-metacarpal') ?? mano.centro);
    let piso = Infinity;
    mano.puntos.forEach((punto, nombre) => { piso = Math.min(piso, punto.y - (mano.radios.get(nombre) ?? .008)); });
    if (piso < AJUSTES.mesa.alturaSenalMin) return no('a la altura del piso');
    destino.set(centro.x, piso, centro.z);
    // Sobre una superficie reconocida, la palma debe estar apoyada en ella (a menos de `apoyo` m).
    const reconocida = superficieEn(sistema, destino, cabeza());
    if (reconocida) {
      if (centro.y - reconocida.centro.y > A.apoyo + .03) return no('no está apoyada en la superficie');
      destino.y = reconocida.centro.y;
    }
    motivo[mano.lado] = '';
    return destino;
  }

  function reiniciar() {
    estado.progreso = 0;
    estado.lado = null;
    LADOS.forEach(lado => { seguimiento[lado].progreso = 0; seguimiento[lado].con = false; });
  }

  return {
    estado, circulo, motivo,
    iniciar() { estado.activo = true; reiniciar(); },
    detener() { estado.activo = false; reiniciar(); },
    // Hay superficies reconocidas por el visor (para las pruebas y el diagnóstico).
    reconocidas: () => leerCandidatas(sistema, cabeza()).length,
    actualizar(dt) {
      let mejor = null;
      if (estado.activo) {
        for (const lado of LADOS) {
          const s = seguimiento[lado], punto = evaluar(manos[lado], s.punto);
          if (!punto) { s.con = false; s.progreso = Math.max(0, s.progreso - dt * A.vaciar / A.sostener); continue; }
          // Quieta: si se aleja del punto donde empezó, vuelve a empezar desde ahí.
          if (!s.con || s.ancla.distanceTo(punto) > A.quieta) {
            s.ancla.copy(punto);
            if (s.con) s.progreso = Math.max(0, s.progreso - .5);
            s.con = true;
          }
          s.progreso = Math.min(1, s.progreso + dt / A.sostener);
          if (!mejor || s.progreso > seguimiento[mejor].progreso) mejor = lado;
        }
        if (!mejor) {
          // Ninguna mano válida: el círculo de la última se vacía en su sitio.
          const ultimo = estado.lado ? seguimiento[estado.lado] : null;
          estado.progreso = ultimo ? ultimo.progreso : 0;
        } else {
          estado.lado = mejor;
          estado.progreso = seguimiento[mejor].progreso;
          const punto = seguimiento[mejor].punto;
          circulo.position.set(punto.x, punto.y + .003, punto.z);
          // El inicio del relleno queda al fondo, visto por el usuario.
          const ojo = cabeza();
          circulo.rotation.set(0, Math.atan2(ojo.x - punto.x, ojo.z - punto.z), 0);
          if (estado.progreso >= 1) {
            estado.elecciones += 1;
            estado.ultima = punto.clone();
            estado.activo = false;
            estado.opacidad = 1;
            circulo.material.uniforms.uProgreso.value = 1;
            const elegido = punto.clone();
            reiniciar();
            alElegir(elegido);
            return;
          }
        }
      }
      // Aparece con una mano válida (o mientras quede algo de relleno) y se desvanece al terminar.
      const meta = estado.activo && (mejor || estado.progreso > 0) ? 1 : 0;
      estado.opacidad += (meta - estado.opacidad) * (1 - Math.exp(-(meta ? 12 : 5) * dt));
      if (estado.opacidad < .01 && !meta) estado.opacidad = 0;
      circulo.material.uniforms.uOpacidad.value = estado.opacidad;
      if (estado.activo) circulo.material.uniforms.uProgreso.value = estado.progreso;
      circulo.visible = estado.opacidad > 0;
    }
  };
}
