(() => {
  'use strict';
  const app = window.TimeExperience;

  // Capa nítida de la hoja, su halo y el lapicero.
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

  /* Desenfoca el fondo y dibuja encima la hoja y el lapicero nítidos. */
  class SheetBlur {
    constructor(renderer) {
      this.renderer = renderer;
      this.size = new THREE.Vector2(1, 1);
      // Desenfoca a media resolución y sin multimuestreo.
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
      // Dibuja el fondo desenfocado sin la capa de enfoque.
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
      // Superpone la hoja y el lapicero sin borrar el fondo.
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

  /* Levanta la hoja para escribir y devuelve hoja y lapicero al completar la lista. */
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
      // Las luces alcanzan la capa de enfoque y las sombras conservan todas las capas.
      world.scene.traverse(object => {
        if (!object.isLight) return;
        object.layers.enable(FOCUS_LAYER);
        if (object.shadow) object.shadow.camera.layers.enableAll();
      });
      this.penMeshes = [];
      this.pen.root.traverse(object => { if (object.isMesh) this.penMeshes.push(object); });
      this.lift = { t: 0 };       // Hoja: 0 sobre la mesa, 1 frente a la cámara.
      this.carry = { t: 0 };      // Lapicero: 0 sobre la mesa, 1 junto a la hoja.
      this.grip = { t: 0 };       // Lapicero: 0 junto a la hoja, 1 en el puntero.
      this.tap = { t: 0 };        // Presión breve de la punta sobre la hoja.
      this.tipTarget = new THREE.Vector3();
      this.state = 'desk';
      this.held = false;
      this.timeline = null;
      // Objetos temporales reutilizables.
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
      // Dibuja la hoja al final durante el movimiento para evitar que otros objetos la tapen.
      this.blur.render(scene, camera, Math.max(radius, .06));
    }

    // Señal de interacción.
    scheduleGlow() {
      clearTimeout(this.glowTimer);
      if (this.world.checklist.complete || this.state !== 'desk' || this.glowTween) return;
      this.glowTimer = setTimeout(() => {
        if (!this.world.active || this.state !== 'desk' || this.world.checklist.complete) return;
        const glow = this.paper.glow;
        glow.visible = true;
        // Anima lentamente el brillo de los bordes.
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

    // Levantar y bajar la hoja.
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

    // Lapicero.
    grabPen() {
      if (this.state !== 'lifted' || this.held) return;
      this.held = true;
      // Oculta la mano para que el lapicero sea el puntero.
      this.setPointerHidden(true);
      gsap.to(this.grip, { t: 1, duration: .16, ease: 'power2.out', overwrite: true, onUpdate: () => this.world.invalidate() });
    }

    dropPen() {
      if (!this.held) return;
      this.held = false;
      this.setPointerHidden(false);
      gsap.to(this.grip, { t: 0, duration: .4, ease: 'power2.inOut', overwrite: true, onUpdate: () => this.world.invalidate() });
    }

    // Coloca la punta donde el rayo cruza la hoja, dentro de sus alrededores.
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

    // Devuelve coordenadas del lienzo o null fuera de la hoja.
    sheetPoint(raycaster) {
      const hit = raycaster.intersectObject(this.paper.mesh, false)[0];
      if (!hit?.uv) return null;
      return this.world.checklist.uvToCanvas(hit.uv);
    }

    // Posiciones y orientaciones.
    update() {
      if (!this.active) return;
      const { paper, pen, v, q } = this;
      const rig = this.world.cameraRig, camera = rig.camera;
      const right = v.right.setFromMatrixColumn(camera.matrixWorld, 0);
      const up = v.up.setFromMatrixColumn(camera.matrixWorld, 1);
      const back = v.a.setFromMatrixColumn(camera.matrixWorld, 2);
      // Inclina ligeramente la hoja hacia atrás respecto a la vista.
      const lean = 7 * Math.PI / 180;
      const normal = v.back.copy(back).multiplyScalar(Math.cos(lean)).addScaledVector(up, Math.sin(lean));
      const top = v.b.copy(up).multiplyScalar(Math.cos(lean)).addScaledVector(back, -Math.sin(lean));
      const scale = this.config.liftHeight * rig.viewSize / paper.height;
      // Coloca la hoja delante del escritorio, bajo el centro de la vista.
      v.center.copy(camera.position).addScaledVector(back, -(rig.distance - 9)).addScaledVector(up, -.02 * rig.viewSize);
      this.basisMatrix.makeBasis(right, normal, v.c.copy(top).negate());
      q.sheet.setFromRotationMatrix(this.basisMatrix);

      // Eleva la hoja en arco; v.back conserva la normal del plano de escritura.
      const t = this.lift.t;
      paper.root.position.lerpVectors(paper.rest.position, v.center, t);
      paper.root.position.y += Math.sin(t * Math.PI) * 1.1;
      paper.root.quaternion.slerpQuaternions(paper.rest.quaternion, q.sheet, t);
      paper.root.scale.setScalar(1 + (scale - 1) * t);
      paper.root.updateMatrixWorld(true);
      // Aclara la hoja orientada al usuario para facilitar la lectura.
      paper.material.emissive.setScalar(.2 * t);

      // Lapicero a la derecha de la hoja, con la punta hacia abajo.
      const half = paper.width * scale / 2;
      const floatPosition = new THREE.Vector3().copy(v.center).addScaledVector(right, half + .55 * scale).addScaledVector(top, -.12 * scale);
      this.orient(q.float, new THREE.Vector3().copy(top).multiplyScalar(-.9).addScaledVector(right, -.4), normal);
      // Sitúa la punta en el puntero y el cuerpo hacia la derecha y el usuario.
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
      // Evita que el lapicero flotante proyecte sombras sobre el escritorio.
      const onDesk = c < .02;
      this.penMeshes.forEach(mesh => { mesh.castShadow = onDesk; });
    }

    // Orienta el eje X hacia direction y el eje Y hacia facing.
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
