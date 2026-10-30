(() => {
  'use strict';
  const app = window.TimeExperience;
  const ENABLE_MONITOR_LIGHT = true; 

  // Cool screen emission close to 8500 K, nudged toward ice/cyan (not primary blue).
  const SCREEN_LIGHT_COLOR = '#86c4ff';

  const BEAM_PARS = /* glsl */`
uniform mat4 uBeamInverse;
uniform vec3 uBeamOrigin;
uniform vec3 uBeamColor;
uniform float uBeamIntensity;
uniform vec4 uBeamShape;    // screen half width, screen half height, spread per unit, reach
uniform vec2 uBeamSoftness; // penumbra at the screen, penumbra growth per unit
uniform float uBeamFloor;   // world height of the desk top: the beam does not pass through it
uniform float uBeamNeutral; // 0–1: how much of the surface colour is greyed under the beam
varying vec3 vBeamWorld;
// Trapezoid in front of the screen: it widens with distance and its lateral
// edges blur progressively instead of ending in a hard cut.
float monitorBeam(vec3 worldPosition) {
  vec3 p = (uBeamInverse * vec4(worldPosition, 1.0)).xyz;
  float d = p.z;
  if (d <= 0.0) return 0.0;
  float halfWidth = uBeamShape.x + d * uBeamShape.z;
  float soft = uBeamSoftness.x + d * uBeamSoftness.y;
  float lateral = 1.0 - smoothstep(halfWidth - soft, halfWidth + soft, abs(p.x));
  float vertical = 1.0 - smoothstep(uBeamShape.y, uBeamShape.y + 0.7 + d * 0.12, p.y);
  float start = smoothstep(0.0, 0.45, d);
  float end = 1.0 - smoothstep(uBeamShape.w * 0.42, uBeamShape.w, d);
  float above = smoothstep(uBeamFloor - 0.4, uBeamFloor - 0.04, worldPosition.y);
  return lateral * vertical * start * end * above / (1.0 + 0.03 * d * d);
}
`;

  const BEAM_APPLY = /* glsl */`
{
  float beam = monitorBeam(vBeamWorld);
  if (beam > 0.0) {
    vec3 beamNormal = inverseTransformDirection(normal, viewMatrix);
    float facing = dot(beamNormal, normalize(uBeamOrigin - vBeamWorld));
    // Grazing desk surfaces still read the projected trapezoid; back faces do not.
    float lambert = mix(0.5, 1.0, max(facing, 0.0)) * smoothstep(-0.3, 0.05, facing);
    // Reflected screen light plus a faint albedo-independent glow so dark wood still shows the beam.
    // The surface colour is partly greyed first, so warm wood does not turn the cool light warm.
    vec3 beamAlbedo = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), uBeamNeutral);
    outgoingLight += (beamAlbedo + 0.05) * uBeamColor * (uBeamIntensity * beam * lambert);
  }
}
`;

  /**
   * Main light of the adulthood scene: the monitor's screen.
   * - patch(material) / apply(root): adds the trapezoidal beam to MeshStandardMaterials.
   *   Call apply(model) again for any replacement .glb so it receives the same light.
   * - volume: a subtle additive haze between the screen and the desk (not raycastable).
   * The anchor is an Object3D at the screen centre with +Z pointing out of the screen.
   */
  class MonitorLight {
    constructor({ anchor, width, height, deskY, color = SCREEN_LIGHT_COLOR, intensity = 4.2, neutral = 0, haze = .16, spread = .42, reach = 10 }) {
      this.anchor = anchor;
      this.size = { width, height, spread, reach };
      this.uniforms = {
        uBeamInverse: { value: new THREE.Matrix4() },
        uBeamOrigin: { value: new THREE.Vector3() },
        uBeamColor: { value: new THREE.Color(color) },
        uBeamIntensity: { value: intensity },
        uBeamShape: { value: new THREE.Vector4(width / 2, height / 2, spread, reach) },
        uBeamSoftness: { value: new THREE.Vector2(.32, .17) },
        uBeamFloor: { value: deskY },
        uBeamNeutral: { value: neutral }
      };
      this.haze = haze;
      this.patched = new Set();
this.update();
this.volume = this.buildVolume(deskY);

// Guardar la intensidad original
this.originalIntensity = intensity;

// Aplicar configuración de encendido/apagado
this.uniforms.uBeamIntensity.value =
  ENABLE_MONITOR_LIGHT ? this.originalIntensity : 0;

this.volume.visible = ENABLE_MONITOR_LIGHT;
    }

    // Screen power (0 = off, 1 = on): scales the beam on the desk and the light haze.
    setLevel(level) {
      this.uniforms.uBeamIntensity.value = ENABLE_MONITOR_LIGHT ? this.originalIntensity * level : 0;
      this.volume.material.uniforms.uOpacity.value = this.haze * level;
      this.volume.visible = ENABLE_MONITOR_LIGHT && level > .001;
    }

    update() {
      this.anchor.updateWorldMatrix(true, false);
      this.uniforms.uBeamInverse.value.copy(this.anchor.matrixWorld).invert();
      this.anchor.getWorldPosition(this.uniforms.uBeamOrigin.value);
    }

    apply(root) {
      root.traverse(object => {
        if (!object.isMesh || object.userData.ignoreScreenLight) return;
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => this.patch(material));
      });
    }

    patch(material) {
      if (!material?.isMeshStandardMaterial || this.patched.has(material)) return;
      this.patched.add(material);
      const uniforms = this.uniforms;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vBeamWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 beamWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    beamWorld = instanceMatrix * beamWorld;
  #endif
  vBeamWorld = (modelMatrix * beamWorld).xyz;`);
        shader.fragmentShader = BEAM_PARS + shader.fragmentShader.replace('#include <opaque_fragment>', BEAM_APPLY + '#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => 'adulthood-monitor-beam';
      material.needsUpdate = true;
    }

    // Wedge from the screen edges down to the far end of the beam on the desk.
    buildVolume(deskY) {
      const { width, height, spread, reach } = this.size;
      const hw = width / 2, hh = height / 2;
      const local = new THREE.Vector3(0, deskY, 0);
      this.anchor.worldToLocal(local);
      const far = reach * .62, floorY = local.y + .02;
      const farHalf = hw + far * spread;
      const v = (x, y, z) => [x, y, z];
      const nearTL = v(-hw, hh, .03), nearTR = v(hw, hh, .03), nearBL = v(-hw, -hh, .03), nearBR = v(hw, -hh, .03);
      const farL = v(-farHalf, floorY, far), farR = v(farHalf, floorY, far);
      const positions = [
        ...nearTL, ...nearTR, ...farR, ...nearTL, ...farR, ...farL, // upper sheet
        ...nearTL, ...farL, ...nearBL, // left side
        ...nearTR, ...nearBR, ...farR // right side
      ];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: this.uniforms.uBeamColor.value.clone().lerp(new THREE.Color('#ffffff'), .35) },
          uOpacity: { value: this.haze },
          uShape: this.uniforms.uBeamShape,
          uSoftness: this.uniforms.uBeamSoftness,
          uFar: { value: far }
        },
        vertexShader: `varying vec3 vLocal;
void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform vec4 uShape; uniform vec2 uSoftness; uniform float uFar;
varying vec3 vLocal;
void main() {
  float d = max(vLocal.z, 0.0);
  float halfWidth = uShape.x + d * uShape.z;
  float soft = uSoftness.x * 2.0 + d * uSoftness.y * 2.0;
  float lateral = 1.0 - smoothstep(halfWidth - soft * 1.6, halfWidth, abs(vLocal.x));
  float along = smoothstep(0.0, 0.5, d) * (1.0 - smoothstep(uFar * 0.35, uFar, d));
  gl_FragColor = vec4(uColor, uOpacity * lateral * along);
}`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false
      });
      const volume = new THREE.Mesh(geometry, material);
      volume.name = 'monitor-light-volume';
      volume.renderOrder = 5;
      volume.userData.ignoreScreenLight = true;
      volume.raycast = () => {};
      this.anchor.add(volume);
      return volume;
    }

    dispose() {
      this.volume.removeFromParent();
      this.volume.geometry.dispose();
      this.volume.material.dispose();
      this.patched.clear();
    }
  }

  MonitorLight.COLOR = SCREEN_LIGHT_COLOR;
  app.MonitorLight = MonitorLight;
})();
