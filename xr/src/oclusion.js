import { DepthOccludable, DepthSensingSystem, OcclusionShadersMode } from '@iwsdk/core';
import { AJUSTES } from './config.js';

// Línea del sombreador de DepthSensingSystem (IWSDK 1.0.1) que decide cuánto se ve un fragmento según
// la profundidad real: lo oculta en cuanto lo real queda delante, con un fundido de 5 cm.
const MUESTRA_IWSDK = 'return smoothstep(0.0, 0.05, sampleDepth - vOcclusionViewDepth);';

/*
 * Oclusión de las manos reales y de los objetos virtuales, en dos capas:
 *
 * 1. Máscara de las manos articuladas (siempre). IWSDK ya dibuja cada mano seguida con dos mallas: una
 *    «máscara» que no pinta color pero escribe profundidad, y el contorno blanco. La máscara es
 *    transparente, así que se dibuja después de los objetos opacos y no puede taparlos: la mano real
 *    queda detrás de todo. Aquí la máscara pasa a ser lo primero que se dibuja (opaca, sin color y con
 *    orden de dibujo mínimo): lo virtual que quede detrás de la mano no se pinta y se ve la mano real
 *    del passthrough. Lo virtual que esté delante de la mano se sigue viendo delante.
 *
 * 2. Profundidad real del visor (si el navegador concede «depth-sensing»). DepthSensingSystem de IWSDK
 *    oculta los fragmentos de los objetos marcados con DepthOccludable que quedan detrás de algo real
 *    (antebrazos, otra persona, un objeto de la mesa). Su fundido de 5 cm borraría la base de todo lo que
 *    se apoya en la mesa, así que se reemplaza por una tolerancia configurable. No se marca lo plano que
 *    descansa sobre la mesa (piso, hoja, mesa pintada): ahí el ruido del sensor lo haría parpadear.
 *
 * Es oclusión visual: no añade colisiones ni contacto físico.
 */
export function crearOclusion(world) {
  const cfg = AJUSTES.oclusion;
  if (cfg.profundidad) world.registerSystem(DepthSensingSystem);
  const sistema = cfg.profundidad ? world.getSystem(DepthSensingSystem) : null;
  const mascaras = new WeakSet();
  const estado = { mascaras: 0 };

  // Ajusta la máscara de cada mano en cuanto IWSDK crea su modelo (y otra vez si lo recrea).
  function revisarManos() {
    for (const lado of ['left', 'right']) {
      const modelo = world.input?.xr?.visualAdapters?.hand?.[lado]?.visual?.model;
      modelo?.traverse(malla => {
        if (!malla.isSkinnedMesh || mascaras.has(malla)) return;
        const material = malla.material;
        // La máscara es el material sin color de IWSDK (escribe profundidad); el contorno no la escribe.
        if (!material?.isShaderMaterial || !material.depthWrite || !material.uniforms?.outlineThickness) return;
        material.transparent = false;
        material.colorWrite = false;
        material.needsUpdate = true;
        malla.renderOrder = -1000;
        mascaras.add(malla);
        estado.mascaras += 1;
      });
    }
  }

  // Tolerancia: el fragmento se oculta del todo si lo real queda `tolerancia + fundido` m delante.
  const tolerante = `return smoothstep(${(-(cfg.tolerancia + cfg.fundido)).toFixed(4)}, ${(-cfg.tolerancia).toFixed(4)}, sampleDepth - vOcclusionViewDepth);`;
  function conTolerancia(material) {
    if (!material || material.isShaderMaterial || material.userData.oclusionTolerante) return;
    material.userData.oclusionTolerante = true;
    const previo = material.onBeforeCompile, clave = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previo?.call(material, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(MUESTRA_IWSDK, tolerante);
    };
    material.customProgramCacheKey = () => `${clave.call(material)}|oclusion-tolerante`;
    material.needsUpdate = true;
  }

  return {
    estado,
    get profundidad() { return !!sistema; },
    // Profundidad concedida por el navegador en esta sesión (solo se sabe dentro de la sesión).
    get profundidadActiva() { return !!world.session?.enabledFeatures?.includes('depth-sensing'); },
    // Marca entidades (objetos que se paran sobre la superficie) para la oclusión por profundidad.
    ocluir(...entidades) {
      if (!sistema) return;
      entidades.forEach(entidad => {
        if (!entidad || entidad.hasComponent(DepthOccludable)) return;
        entidad.addComponent(DepthOccludable, { mode: OcclusionShadersMode.SoftOcclusion });
        // DepthSensingSystem ya envolvió el onBeforeCompile de cada material: la tolerancia va por fuera.
        entidad.object3D?.traverse(malla => { if (malla.isMesh) [].concat(malla.material).forEach(conTolerancia); });
      });
    },
    actualizar: revisarManos
  };
}
