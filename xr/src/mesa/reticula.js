import * as THREE from 'three';
import gsap from 'gsap';

// Retícula del storyboard P1: red de rombos cian con puntos en los cruces y un barrido que «lee» la superficie.
const VERTICE = /* glsl */`
  uniform vec2 uTam;
  varying vec2 vPos;
  void main() {
    vPos = (uv - .5) * uTam;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;
const FRAGMENTO = /* glsl */`
  uniform vec3 uColor;
  uniform vec2 uTam;
  uniform float uOpacidad, uBarrido, uPaso;
  varying vec2 vPos;
  void main() {
    vec2 r = vec2(vPos.x + vPos.y, vPos.x - vPos.y) / (uPaso * 1.41421);
    vec2 aLinea = min(fract(r), 1. - fract(r)) * uPaso * 1.41421;
    float lineas = max(smoothstep(.0028, .0009, aLinea.x), smoothstep(.0028, .0009, aLinea.y));
    float punto = smoothstep(.0085, .0055, length(aLinea));
    vec2 borde = uTam * .5 - abs(vPos);
    float contorno = smoothstep(.007, .0025, min(borde.x, borde.y));
    float trazo = max(max(lineas * .75, punto), contorno);
    float banda = exp(-pow((vPos.y - uBarrido) / .06, 2.));
    gl_FragColor = vec4(uColor, (trazo * (1. + banda) + banda * .12) * uOpacidad);
  }
`;

export function crearReticula(world) {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTICE, fragmentShader: FRAGMENTO,
    uniforms: {
      uColor: { value: new THREE.Color('#3fb3d3') }, uTam: { value: new THREE.Vector2(1, 1) },
      uOpacidad: { value: 0 }, uBarrido: { value: 0 }, uPaso: { value: .085 }
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const geometria = new THREE.PlaneGeometry(1, 1);
  geometria.rotateX(-Math.PI / 2);
  const malla = new THREE.Mesh(geometria, material);
  malla.name = 'reticula-superficie';
  malla.renderOrder = 5;
  malla.visible = false;
  world.createTransformEntity(malla, { persistent: true });
  const estado = { barrido: null };

  return {
    malla,
    // Cubre la superficie candidata: centro sobre la cara superior y ejes de la mesa.
    mostrar(candidata) {
      malla.position.copy(candidata.centro).y += .003;
      // Base derecha (X × Y = Z) aunque los ejes de una malla lleguen invertidos.
      const arriba = new THREE.Vector3(0, 1, 0);
      malla.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(candidata.ejeX, arriba, new THREE.Vector3().crossVectors(candidata.ejeX, arriba)));
      malla.scale.set(candidata.ancho, 1, candidata.fondo);
      material.uniforms.uTam.value.set(candidata.ancho, candidata.fondo);
      malla.visible = true;
      gsap.killTweensOf(material.uniforms.uOpacidad);
      gsap.to(material.uniforms.uOpacidad, { value: .95, duration: .6, ease: 'power2.out' });
      estado.barrido?.kill();
      const mitad = candidata.fondo / 2 + .1;
      estado.barrido = gsap.fromTo(material.uniforms.uBarrido, { value: -mitad }, { value: mitad, duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
    },
    ocultar(duracion = .4) {
      estado.barrido?.kill();
      gsap.killTweensOf(material.uniforms.uOpacidad);
      return new Promise(resolve => gsap.to(material.uniforms.uOpacidad, {
        value: 0, duration: duracion, ease: 'power2.in', onComplete: () => { malla.visible = false; resolve(); }
      }));
    }
  };
}
