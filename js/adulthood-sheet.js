(() => {
  'use strict';
  const app = window.TimeExperience;

  // Objects that stay sharp while the sheet is lifted (sheet, its glow and the pen).
  const FOCUS_LAYER = 1;

  const QUAD_VERTEX = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;
  const BLUR = `
    uniform sampler2D tInput;
    uniform vec2 uStep;
    varying vec2 vUv;
    void main() {
      vec4 sum = vec4(0.0); float total = 0.0;
      for (int i = -8; i <= 8; i++) {
        float f = float(i) / 8.0, w = exp(-f * f * 3.0);
        sum += texture2D(tInput, vUv + uStep * f) * w; total += w;
      }
      gl_FragColor = sum / total;
      #ifdef TO_SCREEN
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      #endif
    }
  `;

  /**
   * Background blur used while the sheet is lifted. The scene without the focus layer is
   * rendered to a target, blurred in two passes to the screen, and then the focus layer
   * (sheet + pen) is drawn on top, sharp. With amount 0 the scene is rendered directly.
   */
  class SheetBlur {
    constructor(renderer) {
      this.renderer = renderer;
      this.size = new THREE.Vector2(1, 1);
      // The background is blurred anyway: no multisampling, and the blur runs at half size.
      this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      this.blurTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      this.quad.frustumCulled = false;
      this.quadScene = new THREE.Scene();
      this.quadScene.add(this.quad);
      const pass = toScreen => new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX, fragmentShader: BLUR, depthTest: false, depthWrite: false, toneMapped: toScreen,
        defines: toScreen ? { TO_SCREEN: '' } : {},
        uniforms: { tInput: { value: null }, uStep: { value: new THREE.Vector2() } }
      });
      this.horizontal = pass(false);
      this.vertical = pass(true);
    }

    setSize(width, height) {
      this.size.set(Math.max(1, width), Math.max(1, height));
      this.sceneTarget.setSize(this.size.x, this.size.y);
      this.blurTarget.setSize(Math.ceil(this.size.x / 2), Math.ceil(this.size.y / 2));
    }

    render(scene, camera, radiusPx) {
      const renderer = this.renderer, layers = camera.layers.mask;
      if (radiusPx <= .05) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      // 1. Everything except the focus layer, blurred.
      camera.layers.set(0);
      renderer.setRenderTarget(this.sceneTarget);
      renderer.render(scene, camera);
      this.horizontal.uniforms.tInput.value = this.sceneTarget.texture;
      this.horizontal.uniforms.uStep.value.set(radiusPx / this.size.x, 0);
      this.quad.material = this.horizontal;
      renderer.setRenderTarget(this.blurTarget);
      renderer.render(this.quadScene, this.quadCamera);
      this.vertical.uniforms.tInput.value = this.blurTarget.texture;
      this.vertical.uniforms.uStep.value.set(0, radiusPx / this.size.y);
      this.quad.material = this.vertical;
      renderer.setRenderTarget(null);
      renderer.render(this.quadScene, this.quadCamera);
      // 2. The sheet and the pen on top, sharp. (A colour background would clear the screen.)
      camera.layers.set(FOCUS_LAYER);
      const autoClear = renderer.autoClear, background = scene.background;
      renderer.autoClear = false;
      scene.background = null;
      renderer.clearDepth();
      renderer.render(scene, camera);
      scene.background = background;
      renderer.autoClear = autoClear;
      camera.layers.mask = layers;
    }

    dispose() {
      [this.sceneTarget, this.blurTarget].forEach(target => target.dispose());
      [this.horizontal, this.vertical].forEach(material => material.dispose());
      this.quad.geometry.dispose();
    }
  }

  const axisX = new THREE.Vector3(1, 0, 0);

  /**
   * The checklist sheet's reading mode. On the desk the sheet glows from its edges after
   * `glowDelayMs`; a click lifts it (with the pen) in front of the view, almost at 90°
   * to the line of sight, while the background blurs. The pen can then be taken with a
   * click: it follows the pointer over the sheet and marks checkboxes. When the list is
   * complete everything returns to the desk. Poses are computed from the camera every
   * frame, so they stay right on any screen size.
   */
  class SheetFocus {
    constructor(world) {
      this.world = world;
      this.paper = world.props.paper;
      this.pen = world.props.pen;
      this.config = app.Config.adulthood.sheet;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.blur = new SheetBlur(world.renderer);
      [this.paper.root, this.pen.root].forEach(root => root.traverse(object => object.layers.set(FOCUS_LAYER)));
      world.cameraRig.camera.layers.enable(FOCUS_LAYER);
      // Lights must reach the focus layer; shadow cameras keep seeing every layer.
      world.scene.traverse(object => {
        if (!object.isLight) return;
        object.layers.enable(FOCUS_LAYER);
        if (object.shadow) object.shadow.camera.layers.enableAll();
      });
      this.penMeshes = [];
      this.pen.root.traverse(object => { if (object.isMesh) this.penMeshes.push(object); });
      this.lift = { t: 0 };       // sheet: 0 on the desk → 1 in front of the view
      this.carry = { t: 0 };      // pen: 0 on the desk → 1 beside the lifted sheet
      this.grip = { t: 0 };       // pen: 0 beside the sheet → 1 held at the pointer
      this.tap = { t: 0 };        // short press of the pen tip into the sheet
      this.tipTarget = new THREE.Vector3();
      this.state = 'desk';
      this.held = false;
      this.timeline = null;
      // Scratch objects.
      this.v = { right: new THREE.Vector3(), up: new THREE.Vector3(), back: new THREE.Vector3(), center: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
      this.q = { sheet: new THREE.Quaternion(), float: new THREE.Quaternion(), held: new THREE.Quaternion() };
      this.basisMatrix = new THREE.Matrix4();
      this.plane = new THREE.Plane();
    }

    get active() { return this.lift.t > 0 || this.carry.t > 0; }
    get blurAmount() { return this.lift.t * this.config.blurAmount; }

    setSize(width, height) { this.blur.setSize(width, height); }

    render(scene, camera) {
      const radius = this.blurAmount * this.config.maxBlurPx * this.world.renderer.getPixelRatio();
      if (!this.active) {
        this.world.renderer.setRenderTarget(null);
        this.world.renderer.render(scene, camera);
        return;
      }
      // While lifting/lowering the sheet is always drawn last so nothing on the desk covers it.
      this.blur.render(scene, camera, Math.max(radius, .06));
    }

    // ---------- Call to action ----------
    scheduleGlow() {
      clearTimeout(this.glowTimer);
      if (this.world.checklist.complete || this.state !== 'desk' || this.glowTween) return;
      this.glowTimer = setTimeout(() => {
        if (!this.world.active || this.state !== 'desk' || this.world.checklist.complete) return;
        const glow = this.paper.glow;
        glow.visible = true;
        // Slow, gentle breathing of the edges (about 2.6 s per cycle, like the glow of the props
        // in the other scenes).
        this.glowTween = gsap.fromTo(glow.material, { opacity: .25 }, {
          opacity: .6, duration: this.reduced ? 2.6 : 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1,
          onUpdate: () => this.world.invalidate()
        });
      }, this.config.glowDelayMs);
    }

    stopGlow() {
      clearTimeout(this.glowTimer);
      this.glowTween?.kill();
      this.glowTween = null;
      const glow = this.paper.glow;
      if (!glow.visible) return;
      gsap.to(glow.material, { opacity: 0, duration: .25, onUpdate: () => this.world.invalidate(), onComplete: () => { glow.visible = false; } });
    }

    // ---------- Lift / lower ----------
    liftSheet() {
      if (this.state !== 'desk' || this.world.checklist.complete) return false;
      this.stopGlow();
      this.state = 'lifting';
      this.world.cameraRig.freeze();
      this.timeline?.kill();
      const k = this.reduced ? .25 : 1;
      this.timeline = gsap.timeline({ onUpdate: () => this.world.invalidate(), onComplete: () => { this.state = 'lifted'; this.timeline = null; } })
        .to(this.lift, { t: 1, duration: 1.15 * k, ease: 'power2.inOut' }, 0)
        .to(this.carry, { t: 1, duration: 1.1 * k, ease: 'power2.inOut' }, .14 * k);
      return true;
    }

    lowerSheet(onDone) {
      if (this.state !== 'lifted') return;
      this.state = 'lowering';
      this.held = false;
      this.setPointerHidden(false);
      this.timeline?.kill();
      const k = this.reduced ? .25 : 1;
      this.timeline = gsap.timeline({
        onUpdate: () => this.world.invalidate(),
        onComplete: () => {
          this.state = 'desk'; this.timeline = null;
          this.world.cameraRig.unfreeze();
          this.restPoses();
          onDone?.();
        }
      })
        .to(this.grip, { t: 0, duration: .3 * k, ease: 'power2.out' }, 0)
        .to(this.carry, { t: 0, duration: 1.05 * k, ease: 'power2.inOut' }, .35 * k)
        .to(this.lift, { t: 0, duration: 1.15 * k, ease: 'power2.inOut' }, .45 * k);
    }

    // ---------- Pen ----------
    grabPen() {
      if (this.state !== 'lifted' || this.held) return;
      this.held = true;
      // The hand cursor would cover the pen tip: the pen itself is the pointer now.
      this.setPointerHidden(true);
      gsap.to(this.grip, { t: 1, duration: .16, ease: 'power2.out', overwrite: true, onUpdate: () => this.world.invalidate() });
    }

    dropPen() {
      if (!this.held) return;
      this.held = false;
      this.setPointerHidden(false);
      gsap.to(this.grip, { t: 0, duration: .4, ease: 'power2.inOut', overwrite: true, onUpdate: () => this.world.invalidate() });
    }

    // Moves the pen tip to where `ray` meets the sheet, kept within the sheet's surroundings.
    pointTo(ray) {
      const paper = this.paper;
      this.plane.setFromNormalAndCoplanarPoint(this.v.back, paper.root.position);
      if (!ray.intersectPlane(this.plane, this.v.a)) return;
      const local = paper.root.worldToLocal(this.v.a.clone());
      const margin = .35;
      local.x = THREE.MathUtils.clamp(local.x, -paper.width / 2 - margin, paper.width / 2 + margin);
      local.z = THREE.MathUtils.clamp(local.z, -paper.height / 2 - margin, paper.height / 2 + margin);
      local.y = paper.surfaceTop + .02;
      this.tipTarget.copy(paper.root.localToWorld(local));
      this.world.invalidate();
    }

    pressPen() {
      gsap.fromTo(this.tap, { t: 0 }, { t: 1, duration: .09, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: true, onUpdate: () => this.world.invalidate() });
    }

    // Canvas coordinates of the checklist under `ray`, or null outside the sheet.
    sheetPoint(raycaster) {
      const hit = raycaster.intersectObject(this.paper.mesh, false)[0];
      if (!hit?.uv) return null;
      return this.world.checklist.uvToCanvas(hit.uv);
    }

    // ---------- Poses ----------
    update() {
      if (!this.active) return;
      const { paper, pen, v, q } = this;
      const rig = this.world.cameraRig, camera = rig.camera;
      const right = v.right.setFromMatrixColumn(camera.matrixWorld, 0);
      const up = v.up.setFromMatrixColumn(camera.matrixWorld, 1);
      const back = v.a.setFromMatrixColumn(camera.matrixWorld, 2);
      // Leaned back a few degrees: almost, not exactly, perpendicular to the view.
      const lean = 7 * Math.PI / 180;
      const normal = v.back.copy(back).multiplyScalar(Math.cos(lean)).addScaledVector(up, Math.sin(lean));
      const top = v.b.copy(up).multiplyScalar(Math.cos(lean)).addScaledVector(back, -Math.sin(lean));
      const scale = this.config.liftHeight * rig.viewSize / paper.height;
      // In front of everything on the desk, slightly below the centre of the view.
      v.center.copy(camera.position).addScaledVector(back, -(rig.distance - 9)).addScaledVector(up, -.02 * rig.viewSize);
      this.basisMatrix.makeBasis(right, normal, v.c.copy(top).negate());
      q.sheet.setFromRotationMatrix(this.basisMatrix);

      // Sheet: from its resting pose to the reading pose, rising in a soft arc.
      // (v.back keeps the sheet's normal: pointTo() uses it as the writing plane.)
      const t = this.lift.t;
      paper.root.position.lerpVectors(paper.rest.position, v.center, t);
      paper.root.position.y += Math.sin(t * Math.PI) * 1.1;
      paper.root.quaternion.slerpQuaternions(paper.rest.quaternion, q.sheet, t);
      paper.root.scale.setScalar(1 + (scale - 1) * t);
      paper.root.updateMatrixWorld(true);
      // Facing the viewer, away from the desk lamp-light, the sheet is brightened a little to read.
      paper.material.emissive.setScalar(.2 * t);

      // Pen beside the sheet: on its right, tip down and slightly toward the sheet.
      const half = paper.width * scale / 2;
      const floatPosition = new THREE.Vector3().copy(v.center).addScaledVector(right, half + .55 * scale).addScaledVector(top, -.12 * scale);
      this.orient(q.float, new THREE.Vector3().copy(top).multiplyScalar(-.9).addScaledVector(right, -.4), normal);
      // Held pen: tip on the pointer, body toward the lower right and the viewer, like writing.
      const heldDirection = new THREE.Vector3().copy(top).multiplyScalar(.6).addScaledVector(right, -.5).addScaledVector(normal, -.42);
      this.orient(q.held, heldDirection, normal);
      const s = 1 + (scale - 1) * this.carry.t;
      if (!this.held && this.grip.t === 0) this.tipTarget.copy(floatPosition);
      const tip = pen.tip.clone().multiply(pen.visual.scale).multiplyScalar(scale);
      const pressed = this.tipTarget.clone().addScaledVector(normal, -.06 * scale * this.tap.t);
      const heldPosition = pressed.sub(tip.applyQuaternion(q.held));
      const liftedPosition = new THREE.Vector3().lerpVectors(floatPosition, heldPosition, this.grip.t);
      const liftedQuaternion = new THREE.Quaternion().slerpQuaternions(q.float, q.held, this.grip.t);
      const c = this.carry.t;
      pen.root.position.lerpVectors(pen.rest.position, liftedPosition, c);
      pen.root.position.y += Math.sin(c * Math.PI) * .9;
      pen.root.quaternion.slerpQuaternions(pen.rest.quaternion, liftedQuaternion, c);
      pen.root.scale.setScalar(s);
      // A pen floating near the viewer would throw a stray shadow on the blurred desk.
      const onDesk = c < .02;
      this.penMeshes.forEach(mesh => { mesh.castShadow = onDesk; });
    }

    // Pen authored along +X (tip) with its clip on +Y: aim X along `direction`, Y toward `facing`.
    orient(target, direction, facing) {
      const x = direction.clone().normalize();
      const y = facing.clone().addScaledVector(x, -facing.dot(x)).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      target.setFromRotationMatrix(this.basisMatrix.makeBasis(x, y, z));
      return target;
    }

    restPoses() {
      const { paper, pen } = this;
      paper.root.position.copy(paper.rest.position);
      paper.root.quaternion.copy(paper.rest.quaternion);
      paper.root.scale.setScalar(1);
      paper.material.emissive.setScalar(0);
      pen.root.position.copy(pen.rest.position);
      pen.root.quaternion.copy(pen.rest.quaternion);
      pen.root.scale.setScalar(1);
      this.penMeshes.forEach(mesh => { mesh.castShadow = true; });
      this.world.invalidate();
    }

    reset() {
      this.timeline?.kill();
      this.timeline = null;
      clearTimeout(this.glowTimer);
      this.glowTween?.kill();
      this.glowTween = null;
      gsap.killTweensOf([this.grip, this.tap, this.paper.glow.material]);
      this.paper.glow.visible = false;
      this.paper.glow.material.opacity = 0;
      this.lift.t = this.carry.t = this.grip.t = this.tap.t = 0;
      this.held = false;
      this.setPointerHidden(false);
      this.state = 'desk';
      this.restPoses();
    }

    setPointerHidden(hidden) {
      document.body.classList.toggle('is-holding-pen', hidden);
    }

    pause() {
      clearTimeout(this.glowTimer);
      this.setPointerHidden(false);
    }

    dispose() {
      this.reset();
      this.blur.dispose();
    }
  }

  SheetFocus.FOCUS_LAYER = FOCUS_LAYER;
  app.SheetFocus = SheetFocus;
})();
