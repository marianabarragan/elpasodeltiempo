(() => {
  'use strict';
  const app = window.TimeExperience;

  const QUAD_VERTEX = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;
  // Horizontal pass: blur plus a slow, wavy distortion (deteriorated sight).
  const BLUR_H = `
    uniform sampler2D tInput;
    uniform vec2 uTexel;
    uniform float uRadius;
    uniform float uWarp;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv + uWarp * .0055 * vec2(
        sin(vUv.y * 14.0 + uTime * 1.2) + .5 * sin(vUv.y * 33.0 - uTime * .7),
        cos(vUv.x * 11.0 + uTime * .9));
      vec4 sum = vec4(0.0); float total = 0.0;
      for (int i = -6; i <= 6; i++) {
        float f = float(i) / 6.0, w = exp(-f * f * 2.5);
        sum += texture2D(tInput, uv + vec2(uTexel.x * uRadius * f, 0.0)) * w; total += w;
      }
      gl_FragColor = sum / total;
    }
  `;
  // Vertical pass to the screen: mixes in the sharp image where the focus mask is set,
  // adds a soft warm haze to the blurred areas and applies tone mapping / sRGB output.
  const BLUR_V = `
    uniform sampler2D tInput;
    uniform sampler2D tSharp;
    uniform sampler2D tMask;
    uniform vec2 uTexel;
    uniform float uRadius;
    uniform float uAmount;
    uniform float uFocus;
    varying vec2 vUv;
    void main() {
      vec4 sum = vec4(0.0); float total = 0.0;
      for (int i = -6; i <= 6; i++) {
        float f = float(i) / 6.0, w = exp(-f * f * 2.5);
        sum += texture2D(tInput, vUv + vec2(0.0, uTexel.y * uRadius * f)) * w; total += w;
      }
      vec3 color = sum.rgb / total;
      float mask = texture2D(tMask, vUv).r * uFocus;
      color = mix(color, texture2D(tSharp, vUv).rgb, mask);
      float haze = uAmount * (1.0 - mask) * .32;
      vec3 milky = vec3(dot(color, vec3(.3, .55, .15))) * vec3(1.05, 1.0, .86) + .05;
      gl_FragColor = vec4(mix(color, milky, haze), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  /**
   * Post-processing of the old-age scene: blur/distortion (amount 0–1) and an optional
   * sharp "focus" mask for the objects on `maskLayer` (the glasses on hover).
   * With amount 0 the scene is rendered directly, identical to a normal render.
   */
  class OldAgeVision {
    constructor(renderer, { maxBlurPx = 22, maskLayer = 1 } = {}) {
      this.renderer = renderer;
      this.maxBlurPx = maxBlurPx;
      this.maskLayer = maskLayer;
      this.size = new THREE.Vector2(1, 1);
      const options = { type: THREE.HalfFloatType, depthBuffer: true };
      this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { ...options, samples: 4 });
      this.blurTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      this.maskTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      this.quad.frustumCulled = false;
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      const texel = new THREE.Vector2(1, 1);
      this.horizontal = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX, fragmentShader: BLUR_H, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { tInput: { value: null }, uTexel: { value: texel }, uRadius: { value: 0 }, uWarp: { value: 0 }, uTime: { value: 0 } }
      });
      this.vertical = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX, fragmentShader: BLUR_V, depthTest: false, depthWrite: false,
        uniforms: {
          tInput: { value: null }, tSharp: { value: null }, tMask: { value: null }, uTexel: { value: texel },
          uRadius: { value: 0 }, uAmount: { value: 0 }, uFocus: { value: 0 }
        }
      });
      this.maskMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      this.black = new THREE.Color('#000000');
      this.clearColor = new THREE.Color();
    }

    setSize(width, height) {
      this.size.set(Math.max(1, width), Math.max(1, height));
      this.sceneTarget.setSize(this.size.x, this.size.y);
      this.blurTarget.setSize(this.size.x, this.size.y);
      this.maskTarget.setSize(Math.ceil(this.size.x / 2), Math.ceil(this.size.y / 2));
      this.horizontal.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
    }

    render(scene, camera, { amount = 0, focus = 0, time = 0 } = {}) {
      const renderer = this.renderer;
      if (amount <= .001) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      const pixelRatio = renderer.getPixelRatio();
      const radius = amount * this.maxBlurPx * pixelRatio;
      renderer.setRenderTarget(this.sceneTarget);
      renderer.render(scene, camera);
      if (focus > .001) this.renderMask(scene, camera);
      this.horizontal.uniforms.tInput.value = this.sceneTarget.texture;
      this.horizontal.uniforms.uRadius.value = radius;
      this.horizontal.uniforms.uWarp.value = amount;
      this.horizontal.uniforms.uTime.value = time;
      this.quad.material = this.horizontal;
      renderer.setRenderTarget(this.blurTarget);
      renderer.render(this.quadScene, this.quadCamera);
      const v = this.vertical.uniforms;
      v.tInput.value = this.blurTarget.texture;
      v.tSharp.value = this.sceneTarget.texture;
      v.tMask.value = this.maskTarget.texture;
      v.uRadius.value = radius;
      v.uAmount.value = amount;
      v.uFocus.value = focus > .001 ? focus : 0;
      this.quad.material = this.vertical;
      renderer.setRenderTarget(null);
      renderer.render(this.quadScene, this.quadCamera);
    }

    // White silhouette of the objects on the mask layer over black.
    renderMask(scene, camera) {
      const renderer = this.renderer;
      const background = scene.background, override = scene.overrideMaterial, layers = camera.layers.mask;
      const clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(this.clearColor);
      scene.background = null;
      scene.overrideMaterial = this.maskMaterial;
      camera.layers.set(this.maskLayer);
      renderer.setRenderTarget(this.maskTarget);
      renderer.setClearColor(this.black, 1);
      renderer.clear();
      renderer.render(scene, camera);
      camera.layers.mask = layers;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.setClearColor(this.clearColor, clearAlpha);
    }

    dispose() {
      [this.sceneTarget, this.blurTarget, this.maskTarget].forEach(target => target.dispose());
      [this.horizontal, this.vertical, this.maskMaterial].forEach(material => material.dispose());
      this.quad.geometry.dispose();
    }
  }

  /**
   * First-person "putting on the glasses": a copy of the glasses model rendered with its own
   * perspective camera over the scene. It rises from the table into view, opens its temples,
   * turns to face the viewer and comes up to the eyes until the frame leaves the screen.
   * It works with any model placed in the glasses' `visual` (lenses facing +Z); temples are
   * animated only when the model provides `glasses-temple-left/right`.
   */
  class FirstPersonGlasses {
    constructor(source) {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 16 / 9, .01, 20);
      this.scene.add(new THREE.HemisphereLight('#fff6dc', '#5a323a', 2.2));
      const key = new THREE.DirectionalLight('#ffe2b0', 1.6);
      key.position.set(-2, 3, 2);
      this.scene.add(key);
      this.model = source.clone(true);
      const remove = [];
      this.model.traverse(object => {
        if (object.userData.glowShell) remove.push(object);
        object.layers.set(0);
        if (object.isMesh) { object.castShadow = object.receiveShadow = false; }
      });
      remove.forEach(object => object.parent.remove(object));
      // Seen from the wearer: lenses face away (+Z turned to -Z), temples come toward the eyes.
      this.model.rotation.set(0, Math.PI, 0);
      this.model.position.set(0, 0, 0);
      this.model.scale.setScalar(1);
      this.holder = new THREE.Group();
      this.holder.add(this.model);
      this.holder.visible = false;
      this.scene.add(this.holder);
      this.temples = ['glasses-temple-left', 'glasses-temple-right']
        .map(name => this.model.getObjectByName(name)).filter(Boolean)
        .map(object => ({ object, folded: object.rotation.y, open: 0 }));
      this.timeline = null;
    }

    get visible() { return this.holder.visible; }

    resize(aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }

    // Returns the GSAP timeline; `onUnblur(progress)` receives 0→1 while the view sharpens.
    play({ reduced = false, onUnblur, onComplete } = {}) {
      this.timeline?.kill();
      const holder = this.holder, unfold = { t: 0 }, sharpen = { t: 0 };
      holder.visible = true;
      holder.position.set(.1, -1.25, -2.4);
      holder.rotation.set(-1.2, .25, .12);
      this.temples.forEach(temple => { temple.object.rotation.y = temple.folded; });
      const unfoldTemples = () => this.temples.forEach(temple => {
        temple.object.rotation.y = THREE.MathUtils.lerp(temple.folded, temple.open, unfold.t);
      });
      const k = reduced ? .2 : 1;
      this.timeline = gsap.timeline({
        onComplete: () => { holder.visible = false; this.timeline = null; onComplete?.(); }
      });
      this.timeline
        // Picked up from the table: rises into view, still lying down.
        .to(holder.position, { x: 0, y: -.42, z: -1.75, duration: .95 * k, ease: 'power2.out' }, 0)
        .to(holder.rotation, { x: -.12, y: 0, z: -.03, duration: 1.0 * k, ease: 'power2.inOut' }, 0)
        // Both hands open the temples while turning it toward the face.
        .to(unfold, { t: 1, duration: .75 * k, ease: 'power1.inOut', onUpdate: unfoldTemples }, .3 * k)
        // A small hesitation, then up to the eyes: the frame leaves the field of view.
        .to(holder.position, { y: -.06, z: -1.05, duration: .5 * k, ease: 'sine.inOut' }, 1.0 * k)
        .to(holder.rotation, { x: .04, z: .015, duration: .5 * k, ease: 'sine.inOut' }, 1.0 * k)
        .to(holder.position, { y: .03, z: -.02, duration: .85 * k, ease: 'power2.in' }, 1.5 * k)
        .to(holder.rotation, { x: 0, z: 0, duration: .85 * k, ease: 'power2.in' }, 1.5 * k)
        .to(sharpen, { t: 1, duration: 1.75 * k, ease: 'power2.inOut', onUpdate: () => onUnblur?.(sharpen.t) }, .85 * k);
      return this.timeline;
    }

    render(renderer) {
      if (!this.holder.visible) return;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
      renderer.autoClear = autoClear;
    }

    stop() {
      this.timeline?.kill();
      this.timeline = null;
      this.holder.visible = false;
    }
  }

  app.OldAgeVision = OldAgeVision;
  app.FirstPersonGlasses = FirstPersonGlasses;
})();
