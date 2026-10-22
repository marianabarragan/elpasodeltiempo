(() => {
  'use strict';
  const app = window.TimeExperience;
  class ChildhoodScene {
    constructor(container, { audio, progressBar, palette, onComplete } = {}) {
      this.container = container;
      this.audio = audio;
      const config = app.Config.childhood;
      this.active = false;
      this.dirty = true;
      this.color = app.Config.colors.green;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#fff2d8');
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.02;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.VSMShadowMap;
      this.renderer.domElement.className = 'three-canvas';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);

      const factory = app.Config.assets.childhoodPropsFactory || app.ChildhoodProps.build;
      this.props = factory();
      this.scene.add(this.props.group);
      // Five 20 % milestones (crayon click, colour, sun, house, tree); see childhood-progress.js.
      this.progress = new app.ChildhoodProgress({ element: progressBar, onComplete });
      this.painting = new app.PaintingSystem({ onProgress: progress => { this.checkFigures(progress); this.invalidate(); } });
      this.tone = new app.PaletteTone({ src: config.audio.paletteHoverSrc, isEnabled: () => this.audio.enabled && this.active });
      this.palette = new app.CrayonPalette({
        element: palette, rows: config.palette,
        onHover: index => this.tone.play(index),
        onSelect: (color, event) => this.chooseColor(color, event),
        onClose: () => this.invalidate()
      });
      this.paperBody = new THREE.Mesh(new THREE.BoxGeometry(8.2, .025, 6.15), new THREE.MeshStandardMaterial({ color: '#fffdf6', roughness: 1 }));
      this.paperBody.position.set(0, this.props.floorY + .0125, 0);
      this.paperBody.scale.set(app.Config.childhood.paperScale, 1, app.Config.childhood.paperScale);
      this.paperBody.receiveShadow = true; this.paperBody.castShadow = true;
      this.scene.add(this.paperBody);
      this.paper = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 6.15), new THREE.MeshStandardMaterial({ map: this.painting.texture, roughness: 1, metalness: 0 }));
      this.paper.rotation.x = -Math.PI / 2;
      this.paper.scale.setScalar(app.Config.childhood.paperScale);
      this.paper.position.set(0, this.props.floorY + .026, 0);
      this.paper.receiveShadow = true;
      this.scene.add(this.paper);
      this.cameraRig = new app.ChildhoodCamera(this.paper.position.y);
      this.addLights();
      this.addWindowLight();
      this.setColor(this.color, true);
      this.scene.updateMatrixWorld(true);
      this.interactions = new app.ObjectInteractions(this);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      this.resize();
      this.frame = this.frame.bind(this);
      this.tick = 0;
    }
    addLights() {
      // World-space afternoon light: diagonal from the upper left, with warm
      // bounce light keeping the shadowed side readable and the palette intact.
      this.scene.add(new THREE.HemisphereLight(0xfff1db, 0x9b8062, 1.55));
      const key = new THREE.DirectionalLight(0xffd39b, 1.85);
      key.position.set(-12, 10, -9);
      key.target.position.set(0, this.props.floorY, 0);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: .5, far: 55 });
      // The paper sits only .001 above its body; a small depth bias avoids VSM
      // self-shadow speckles on that nearly coplanar pair.
      key.shadow.bias = -.0006; key.shadow.normalBias = .018;
      key.shadow.radius = 4;
      key.shadow.blurSamples = 8;
      this.scene.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xffefdc, .55);
      fill.position.set(8, 9, 5); this.scene.add(fill);
      // A broad, feathered patch favours the drawing without clipping the white
      // paper or projecting a competing pattern over the crayon outlines.
      const paperLight = new THREE.SpotLight(0xffedcf, 80, 0, .62, 1, 2);
      paperLight.position.set(-3, 10, -2);
      paperLight.target.position.copy(this.paper.position);
      this.scene.add(paperLight, paperLight.target);
      this.keyLight = key;
    }
    // Warm patches of sunlight on the floor, as if the golden-hour sun came through a window
    // out of view (upper left, like the key light). One window of four panes; it lies
    // just above the foam, below the sheet and the toys, and only brighten what is under them.
    addWindowLight() {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 160;
      const ctx = canvas.getContext('2d');
      const panes = [[18, 14, 104, 58], [134, 14, 104, 58], [18, 88, 104, 58], [134, 88, 104, 58]];
      // Light map: white panes on black, with soft edges (stacked, slightly larger rectangles).
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      for (let k = 6; k >= 0; k--) panes.forEach(([x, y, w, h]) => ctx.fillRect(x - k, y - k, w + k * 2, h + k * 2));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      // "Screen" blending: the floor under the light gets brighter and warmer without the
      // yellow light turning the blue pieces cyan (as plain additive light would).
      const material = new THREE.MeshBasicMaterial({
        map: texture, color: '#f4c486', transparent: true, depthWrite: false, toneMapped: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor
      });
      // Long side along the light's direction across the floor (from the upper left).
      const angle = Math.atan2(9, 12);
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, .38, 0));
      this.windowLight = new THREE.Group();
      this.windowLight.name = 'golden-hour-window-light';
      [[-8.4, 2.6, 8.4, 5.0]].forEach(([x, z, length, width]) => {
        const patch = new THREE.Mesh(geometry, material);
        patch.scale.set(length, 1, width);
        patch.rotation.y = -angle;
        patch.position.set(x, this.props.floorY + .006, z);
        patch.renderOrder = 1;
        this.windowLight.add(patch);
      });
      this.windowLight.userData.dispose = () => { geometry.dispose(); material.dispose(); texture.dispose(); };
      this.scene.add(this.windowLight);
    }
    resize() {
      this.palette?.close({ immediate: true });
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.renderer.setSize(width, height, false);
      this.invalidate();
      if (this.active) this.render();
    }
    // Only the 16 palette colours are accepted (plus the crayon's initial colour).
    setColor(color, initial = false) {
      if (!initial && !this.palette.includes(color)) return;
      this.color = color;
      this.props.crayonColorMaterials.forEach(material => material.color.set(color));
      this.invalidate();
    }
    // First click on the crayon (milestone 1): the 4 × 4 palette opens beside it.
    openPalette() {
      if (!this.active || app.runtime.transitioning) return;
      this.tone.unlock();
      this.progress.mark('crayon');
      const crayon = this.props.crayon;
      crayon.updateWorldMatrix(true, false);
      const point = new THREE.Box3().setFromObject(crayon).getCenter(new THREE.Vector3()).project(this.cameraRig.camera);
      const width = this.container.clientWidth, height = this.container.clientHeight;
      this.palette.show({ x: (point.x * .5 + .5) * width, y: (.5 - point.y * .5) * height }, { width, height });
      this.interact();
    }
    // Choosing a colour (milestone 2): the crayon takes it and becomes the active tool.
    chooseColor(color, event) {
      this.setColor(color);
      this.progress.mark('color');
      const pointer = event && Number.isFinite(event.clientX) && event.clientX + event.clientY > 0
        ? { x: event.clientX, y: event.clientY } : null;
      this.interactions.setTool(pointer || this.interactions.lastPointer);
      this.interact();
    }
    // Milestones 3–5: each whole figure (sun, house, tree) painted at least 25 %.
    checkFigures(progress) {
      const threshold = app.Config.childhood.figureThreshold;
      ['sun', 'house', 'tree'].forEach(figure => { if (progress[figure] >= threshold) this.progress.mark(figure); });
    }
    invalidate() { this.dirty = true; }
    render() {
      this.props.ensureFloorCoverage?.(this.cameraRig.camera);
      this.renderer.render(this.scene, this.cameraRig.camera);
      this.dirty = false;
    }
    enter() {
      if (this.active) return;
      this.active = true;
      this.resize();
      this.lastTime = performance.now();
      this.tick = requestAnimationFrame(this.frame);
    }
    ready() { this.audio.enter(); this.interact(); }
    frame(now) {
      if (!this.active) return;
      const changed = this.cameraRig.update((now - this.lastTime) / 1000);
      this.lastTime = now;
      if ((changed || this.dirty || this.interactions.held || this.interactions.toolActive) && !document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }
    interact() {
      this.hint?.kill();
      clearTimeout(this.hintTimer);
      this.props.crayonColorMaterials.forEach(material => { material.emissive?.setHex(0); });
      this.invalidate();
      this.hintTimer = setTimeout(() => {
        // The glow only invites to pick up the crayon; it stays off once it is the active tool.
        if (!this.active || app.runtime.transitioning || this.interactions.toolActive || this.palette.open) return;
        const pulse = { t: 0 };
        this.hint = gsap.to(pulse, { t: 1, yoyo: true, repeat: 3, duration: .65, onUpdate: () => {
          this.props.crayonColorMaterials.forEach(material => material.emissive?.setRGB(pulse.t * .12, pulse.t * .08, 0));
          this.invalidate();
        } });
      }, 5000);
    }
    exit() {
      this.active = false;
      this.palette.close({ immediate: true });
      this.interactions.release();
      cancelAnimationFrame(this.tick);
      clearTimeout(this.hintTimer); this.hint?.kill();
      this.audio.exit();
    }
    reset() {
      this.palette.close({ immediate: true });
      this.palette.setActive(null);
      this.interactions.reset();
      this.painting.reset();
      this.progress.reset();
      this.cameraRig.reset();
      this.setColor(app.Config.colors.green, true);
      this.invalidate();
    }
    getMemory() { return { canvas: this.painting.canvas, progress: this.painting.getProgress(), complete: this.progress.complete }; }
    dispose() {
      this.exit(); this.interactions.dispose(); this.observer.disconnect();
      this.painting.dispose(); this.props.dispose();
      this.windowLight.userData.dispose();
      [this.paper, this.paperBody].forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
      this.keyLight.shadow.dispose();
      this.renderer.dispose();
    }
  }
  app.ChildhoodScene = ChildhoodScene;
})();
