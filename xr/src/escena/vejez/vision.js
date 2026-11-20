import * as THREE from 'three';
import { AJUSTES, CAPAS } from '../../config.js';

// Filtro gaussiano de 9 muestras (5 lecturas con filtrado lineal) en una dirección. La imagen tiene los dos
// ojos lado a lado: las muestras no cruzan la mitad, así un ojo no se mezcla con el otro.
const DESENFOQUE = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tMapa;
    uniform vec2 uPaso;
    uniform float uTexel;
    varying vec2 vUv;
    vec4 muestra(vec2 uv, float lado) {
      uv.x = clamp(uv.x, lado * 0.5 + uTexel, lado * 0.5 + 0.5 - uTexel);
      return texture2D(tMapa, uv);
    }
    void main() {
      float lado = step(0.5, vUv.x);
      vec2 a = uPaso * 1.3846153846, b = uPaso * 3.2307692308;
      vec4 c = texture2D(tMapa, vUv) * 0.2270270270;
      c += (muestra(vUv + a, lado) + muestra(vUv - a, lado)) * 0.3162162162;
      c += (muestra(vUv + b, lado) + muestra(vUv - b, lado)) * 0.0702702703;
      gl_FragColor = c;
    }`
};

// Composición sobre la vista de cada ojo: la imagen desenfocada (premultiplicada, lineal) y encima el velo.
// Con varias vistas a la vez (multiview del Quest) el ojo es VIEW_ID; dibujando un ojo por vez, uOjo.
const COMPOSICION = {
  vertexShader: /* glsl */`
    uniform float uOjo;
    varying vec2 vUv;
    varying float vOjo;
    void main() {
      vUv = position.xy * 0.5 + 0.5;
      #ifdef VIEW_ID
        vOjo = float(VIEW_ID);
      #else
        vOjo = uOjo;
      #endif
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDesenfoque;
    uniform float uPeso;
    uniform float uVelo;
    uniform vec3 uColorVelo;
    varying vec2 vUv;
    varying float vOjo;
    void main() {
      vec4 b = uPeso > 0.0 ? texture2D(tDesenfoque, vec2((vUv.x + clamp(vOjo, 0.0, 1.0)) * 0.5, vUv.y)) : vec4(0.0);
      vec3 color = b.a > 0.0001 ? linearToOutputTexel(vec4(b.rgb / b.a, 1.0)).rgb : vec3(0.0);
      float a = clamp(b.a, 0.0, 1.0) * uPeso;
      // Resultado premultiplicado: velo sobre (imagen desenfocada sobre lo que ya hay).
      gl_FragColor = vec4(uColorVelo * uVelo + (1.0 - uVelo) * color * a, 1.0 - (1.0 - uVelo) * (1.0 - a));
    }`
};

const dentroDe = (objeto, lista) => { for (let o = objeto; o; o = o.parent) if (lista.includes(o)) return true; return false; };

/*
 * Visión deteriorada de la vejez, en dos partes:
 *
 * A. Desenfoque de lo virtual ('posproceso'). Cada cuadro, los objetos del escenario (no las gafas) se
 *    dibujan aparte, solo ellos, a baja resolución (AJUSTES.vejez.vision.resolucion de la del visor) en una
 *    imagen con los dos ojos lado a lado, con la pose y la proyección reales de cada ojo; esa imagen pasa por
 *    un filtro gaussiano (dos pasadas horizontales y verticales) y se compone sobre la vista. Mientras la vista
 *    está borrosa del todo, esos objetos no se dibujan nítidos (salen de la capa 0 de la cámara y quedan en
 *    CAPAS.vision). La mano virtual también entra a ese dibujo: recorta la imagen donde está la mano real.
 *    WebXR no deja aplicar un posprocesado convencional (EffectComposer) a la vista estéreo; así se logra el
 *    mismo efecto con un costo acotado: un dibujo pequeño de unas decenas de objetos y una sola pasada de
 *    pantalla completa, que además lleva el velo (B). 'material' es un respaldo sin dibujo aparte.
 *
 * B. Velo de «vista nublada»: en la misma pasada final, un color claro con opacidad AJUSTES.vejez.vision.velo
 *    cubre todo lo que se ve, lo virtual y el passthrough. No desenfoca la cámara del visor (WebXR no lo
 *    permite): es una capa translúcida superpuesta que baja el contraste de toda la vista.
 *
 * Las gafas quedan fuera de los dos: no entran al dibujo aparte y se dibujan después de la pasada final,
 * nítidas y sin velo. `nivel` va de 1 (borroso) a 0 (nítido): el radio del filtro y el velo bajan con él, y en
 * el último tramo la imagen desenfocada cede su lugar a los objetos nítidos.
 */
export function crearVision(world, { raiz, excluir = [], luz = () => 1 }) {
  const cfg = AJUSTES.vejez.vision, renderer = world.renderer;
  const posproceso = cfg.modo === 'posproceso';
  const estado = { nivel: 1, activo: false, dibujos: 0 };

  // ---------- Respaldo 'material': texturas sin detalle y colores apagados en los propios materiales ----------
  const uniformeMaterial = { value: 0 };
  if (!posproceso) {
    const materiales = new Set();
    raiz.traverse(o => {
      if (!o.isMesh || o.userData.glowShell || o.userData.sombraContacto || dentroDe(o, excluir)) return;
      [].concat(o.material).forEach(m => { if (m && !m.isShaderMaterial) materiales.add(m); });
    });
    materiales.forEach(material => {
      const previo = material.onBeforeCompile, clave = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, r) => {
        previo?.call(material, shader, r);
        shader.uniforms.uVision = uniformeMaterial;
        shader.fragmentShader = `uniform float uVision;\n${shader.fragmentShader}`
          .replace('#include <map_fragment>', `#ifdef USE_MAP
            diffuseColor *= texture2D( map, vMapUv, uVision * ${cfg.sesgo.toFixed(2)} );
          #endif`)
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            float gris = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gris), uVision * ${cfg.apagado.toFixed(2)});`);
      };
      material.customProgramCacheKey = () => `${clave ? clave.call(material) : ''}|vision`;
      material.needsUpdate = true;
    });
  }

  // ---------- Pasada final (desenfoque compuesto + velo) ----------
  const tipo = renderer.extensions?.has('EXT_color_buffer_float') || renderer.extensions?.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opciones = { type: tipo, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
  const imagen = new THREE.WebGLRenderTarget(2, 1, { ...opciones, depthBuffer: true });
  const auxiliar = new THREE.WebGLRenderTarget(2, 1, { ...opciones, depthBuffer: false });
  const colorVelo = new THREE.Color(cfg.velo.color);
  const composicion = new THREE.ShaderMaterial({
    ...COMPOSICION,
    uniforms: { tDesenfoque: { value: imagen.texture }, uPeso: { value: 0 }, uVelo: { value: 0 }, uColorVelo: { value: new THREE.Color() }, uOjo: { value: 0 } },
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
  });
  const triangulo = new THREE.BufferGeometry();
  triangulo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const pantalla = new THREE.Mesh(triangulo, composicion);
  pantalla.name = 'vision-vejez';
  pantalla.frustumCulled = false;
  pantalla.renderOrder = 9000;
  pantalla.visible = false;
  pantalla.raycast = () => {};
  pantalla.pointerEvents = 'none';
  // Dibujando un ojo por vez (sin multiview), cada llamada recibe la cámara de ese ojo.
  pantalla.onBeforeRender = (r, escena, camara) => {
    const camaras = renderer.xr.getCamera().cameras;
    composicion.uniforms.uOjo.value = camaras.length > 1 && camara === camaras[1] ? 1 : 0;
    composicion.uniformsNeedUpdate = true;
  };
  world.scene.add(pantalla);

  // Las gafas se dibujan después de la pasada final: nítidas y sin velo.
  excluir.forEach(objeto => objeto.traverse(o => {
    if (!o.isMesh) return;
    o.renderOrder = 9100;
    [].concat(o.material).forEach(m => { if (m && !m.transparent) { m.transparent = true; m.needsUpdate = true; } });
  }));

  // ---------- Dibujo aparte desenfocado ----------
  const filtro = new THREE.ShaderMaterial({
    ...DESENFOQUE, uniforms: { tMapa: { value: null }, uPaso: { value: new THREE.Vector2() }, uTexel: { value: 0 } },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false
  });
  const escenaFiltro = new THREE.Scene(), camaraFiltro = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cuadro = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), filtro);
  cuadro.frustumCulled = false;
  escenaFiltro.add(cuadro);
  const ojos = [0, 1].map(() => {
    const camara = new THREE.PerspectiveCamera();
    camara.matrixAutoUpdate = false;
    camara.matrixWorldAutoUpdate = false;
    camara.layers.set(CAPAS.vision);
    return camara;
  });
  const colorPrevio = new THREE.Color();

  // Capas: los objetos del escenario entran a CAPAS.vision; mientras la vista está borrosa del todo, salen de
  // la capa 0 (no se dibujan nítidos). Se revisa cada medio segundo por si aparecen objetos nuevos.
  const capasOriginales = new Map();
  let modoCapas = 'normal', revision = 0;
  function marcarCapas(modo) {
    modoCapas = modo;
    raiz.traverse(o => {
      if (o.isLight) { o.layers.enable(CAPAS.vision); return; }
      if (!(o.isMesh || o.isLine || o.isPoints) || dentroDe(o, excluir)) return;
      if (!capasOriginales.has(o)) capasOriginales.set(o, o.layers.mask);
      const original = capasOriginales.get(o);
      if (modo === 'normal') o.layers.mask = original;
      else if (modo === 'ambas') o.layers.mask = original | (1 << CAPAS.vision);
      else o.layers.mask = 1 << CAPAS.vision;
    });
  }
  // Las luces de la escena (la cálida de la mesa) también iluminan el dibujo aparte.
  const encenderLuces = () => world.scene.traverse(o => { if (o.isLight) o.layers.enable(CAPAS.vision); });

  function dibujarAparte() {
    const xr = renderer.xr;
    if (!xr.isPresenting) return false;
    xr.updateCamera(world.camera);
    const camaras = xr.getCamera().cameras;
    if (camaras.length < 2) return false;
    const vista = camaras[0].viewport;
    const w = Math.max(32, Math.round(vista.z * cfg.resolucion)), h = Math.max(32, Math.round(vista.w * cfg.resolucion));
    if (imagen.width !== 2 * w || imagen.height !== h) { imagen.setSize(2 * w, h); auxiliar.setSize(2 * w, h); }
    ojos.forEach((ojo, i) => {
      const fuente = camaras[i];
      ojo.matrixWorld.copy(fuente.matrixWorld);
      ojo.matrixWorldInverse.copy(fuente.matrixWorldInverse);
      ojo.projectionMatrix.copy(fuente.projectionMatrix);
      ojo.projectionMatrixInverse.copy(fuente.projectionMatrixInverse);
    });
    // Estado del renderizador que se restaura al terminar (como el Reflector de three.js).
    const destino = renderer.getRenderTarget(), conXR = xr.enabled, autoClear = renderer.autoClear;
    const alfa = renderer.getClearAlpha(), sombras = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(colorPrevio);
    xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    imagen.scissorTest = false;
    imagen.viewport.set(0, 0, 2 * w, h);
    renderer.setRenderTarget(imagen);
    renderer.clear(true, true, false);
    // Solo el escenario de la vejez cambia de lugar entre cuadros: se actualizan sus matrices y no las de toda
    // la escena (el dibujo principal las actualiza después, como siempre).
    raiz.updateWorldMatrix(true, true);
    const autoMundo = world.scene.matrixWorldAutoUpdate;
    world.scene.matrixWorldAutoUpdate = false;
    ojos.forEach((ojo, i) => {
      imagen.viewport.set(i * w, 0, w, h);
      imagen.scissor.set(i * w, 0, w, h);
      imagen.scissorTest = true;
      renderer.setRenderTarget(imagen);
      renderer.render(world.scene, ojo);
    });
    world.scene.matrixWorldAutoUpdate = autoMundo;
    imagen.scissorTest = false;
    imagen.viewport.set(0, 0, 2 * w, h);
    // Filtro: horizontal (imagen → auxiliar) y vertical (auxiliar → imagen), `pasadas` veces.
    const radio = cfg.radio * estado.nivel;
    if (radio > .05) {
      filtro.uniforms.uTexel.value = 1 / (2 * w);
      for (let i = 0; i < cfg.pasadas; i++) {
        filtro.uniforms.tMapa.value = imagen.texture;
        filtro.uniforms.uPaso.value.set(radio / (2 * w), 0);
        renderer.setRenderTarget(auxiliar);
        renderer.render(escenaFiltro, camaraFiltro);
        filtro.uniforms.tMapa.value = auxiliar.texture;
        filtro.uniforms.uPaso.value.set(0, radio / h);
        renderer.setRenderTarget(imagen);
        renderer.render(escenaFiltro, camaraFiltro);
      }
    }
    renderer.setRenderTarget(destino);
    xr.enabled = conXR;
    renderer.autoClear = autoClear;
    renderer.setClearColor(colorPrevio, alfa);
    renderer.shadowMap.autoUpdate = sombras;
    estado.dibujos += 1;
    return true;
  }

  return {
    estado, pantalla, imagen,
    get nivel() { return estado.nivel; },
    set nivel(valor) { estado.nivel = THREE.MathUtils.clamp(valor, 0, 1); },
    get posproceso() { return posproceso; },
    /*
     * Cada cuadro, al final de la actualización (con todo ya en su lugar). `visible`: el escenario se ve.
     * La luz de la escena (que la transición oscurece) también oscurece el velo: así no queda una niebla
     * clara sobre la oscuridad al entrar o salir del recuerdo.
     */
    actualizar(dt, visible) {
      const nivel = visible ? estado.nivel : 0;
      const activo = nivel > .001;
      if (activo && !estado.activo) encenderLuces();
      // Mientras la vista está borrosa, los objetos no se dibujan nítidos: sus sombreadores para la vista del visor
      // se preparan ahora (en la transición a oscuras), así no hay un tirón cuando la vista se aclare.
      if (activo && posproceso && !estado.precompilado && renderer.xr.isPresenting) {
        estado.precompilado = true;
        renderer.compileAsync?.(raiz, world.camera, world.scene)?.catch?.(() => {});
      }
      estado.activo = activo;
      pantalla.visible = activo;
      uniformeMaterial.value = nivel;
      // Peso de la imagen desenfocada: completo hasta el último tramo, luego cede a los objetos nítidos.
      const peso = posproceso ? THREE.MathUtils.smoothstep(nivel, 0, cfg.fundido) : 0;
      const modo = !activo || !posproceso ? 'normal' : peso >= .999 ? 'solo-vision' : 'ambas';
      revision -= dt;
      if (modo !== modoCapas || (activo && revision <= 0)) { marcarCapas(modo); revision = .5; }
      if (!activo) return;
      const claridad = THREE.MathUtils.clamp(luz(), 0, 1);
      composicion.uniforms.uVelo.value = cfg.velo.opacidad * nivel;
      composicion.uniforms.uColorVelo.value.copy(colorVelo).multiplyScalar(claridad);
      composicion.uniforms.uPeso.value = peso > .001 && dibujarAparte() ? peso : 0;
    }
  };
}
