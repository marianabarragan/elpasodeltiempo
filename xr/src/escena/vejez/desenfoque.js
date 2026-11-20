import * as THREE from 'three';
import { AJUSTES } from '../../config.js';

/*
 * Visión borrosa de la vejez sobre los objetos virtuales (el passthrough no se puede desenfocar).
 * En la web, OldAgeVision desenfoca la imagen completa; en realidad mixta se aproxima así:
 * - las texturas pierden detalle (sesgo de mip) y los colores quedan bajo un velo claro y apagado;
 * - cada objeto muestra copias translúcidas levemente desplazadas que se mecen (visión doble),
 *   lo que suaviza sus bordes.
 * `nivel` va de 1 (borroso, al entrar) a 0 (nítido, con las gafas puestas). Lo excluido (las gafas)
 * se ve siempre nítido.
 */
export function crearDesenfoque(raiz, { excluir = [], sinCopias = [] } = {}) {
  const { copias, separacion, opacidad, sesgo, velo } = AJUSTES.vejez.desenfoque;
  const uniforme = { value: 1 };
  const dentroDe = (objeto, lista) => { for (let o = objeto; o; o = o.parent) if (lista.includes(o)) return true; return false; };

  // Materiales: el sesgo y el velo dependen de un único uniforme compartido.
  const materiales = new Set(), mallas = [];
  raiz.traverse(objeto => {
    if (!objeto.isMesh || objeto.userData.glowShell || dentroDe(objeto, excluir)) return;
    mallas.push(objeto);
    [].concat(objeto.material).forEach(material => { if (material && !material.isShaderMaterial) materiales.add(material); });
  });
  materiales.forEach(material => {
    const previo = material.onBeforeCompile, clave = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previo?.call(material, shader, renderer);
      shader.uniforms.uDesenfoque = uniforme;
      shader.fragmentShader = `uniform float uDesenfoque;\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          diffuseColor *= texture2D( map, vMapUv, uDesenfoque * ${sesgo.toFixed(2)} );
        #endif`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float gris = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(gris), vec3(.96, .93, .86), .6), uDesenfoque * ${velo.toFixed(2)});`);
    };
    material.customProgramCacheKey = () => `${clave ? clave.call(material) : ''}|desenfoque`;
    material.needsUpdate = true;
  });

  // Copias desplazadas (visión doble) de los objetos, no de la mesa ni de lo excluido.
  const fantasmas = [], copiaDe = new Map(), escalaMundo = new THREE.Vector3();
  raiz.updateMatrixWorld(true);
  mallas.filter(malla => !dentroDe(malla, sinCopias)).forEach(malla => {
    const original = [].concat(malla.material)[0];
    if (!copiaDe.has(original)) {
      copiaDe.set(original, new THREE.MeshBasicMaterial({
        color: original.color ?? new THREE.Color('#ffffff'), map: original.map ?? null, transparent: true, opacity: 0,
        depthWrite: false, side: original.side ?? THREE.FrontSide, toneMapped: false
      }));
    }
    // La separación se pide en metros; se convierte a las unidades locales de cada malla. Algunas hojas
    // vienen de Blender con escala negativa o distinta por eje: se usa el eje de mayor escala absoluta.
    malla.getWorldScale(escalaMundo);
    const metro = 1 / Math.max(1e-6, Math.abs(escalaMundo.x), Math.abs(escalaMundo.y), Math.abs(escalaMundo.z));
    for (let i = 0; i < copias; i++) {
      const fantasma = new THREE.Mesh(malla.geometry, copiaDe.get(original));
      fantasma.name = `${malla.name || 'malla'}-desenfoque`;
      fantasma.userData.desenfoque = true;
      fantasma.castShadow = fantasma.receiveShadow = false;
      fantasma.renderOrder = 2;
      malla.add(fantasma);
      fantasmas.push({ fantasma, fase: i * Math.PI * 2 / copias + Math.random() * .6, metro });
    }
  });

  let tiempo = 0;
  return {
    uniforme, fantasmas,
    get nivel() { return uniforme.value; },
    set nivel(valor) { uniforme.value = THREE.MathUtils.clamp(valor, 0, 1); },
    update(dt) {
      tiempo += dt;
      const nivel = uniforme.value, visibles = nivel > .002;
      copiaDe.forEach(material => { material.opacity = opacidad * Math.min(1, nivel * 1.4); });
      fantasmas.forEach(({ fantasma, fase, metro }) => {
        fantasma.visible = visibles;
        if (!visibles) return;
        // Cada copia gira despacio alrededor del objeto, como un enfoque que no termina de asentarse.
        const angulo = fase + tiempo * .7, r = separacion * nivel * metro * (.75 + .25 * Math.sin(tiempo * 1.3 + fase));
        fantasma.position.set(Math.cos(angulo) * r, Math.sin(angulo * 1.3) * r * .5, Math.sin(angulo) * r);
      });
    }
  };
}
