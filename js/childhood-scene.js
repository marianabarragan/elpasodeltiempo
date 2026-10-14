(() => {
  'use strict';
  const app = window.TimeExperience;
  class ChildhoodScene {
    constructor(container, { audio, onProgress } = {}) {
      this.container = container;
      this.audio = audio;
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
      this.painting = new app.PaintingSystem({ onProgress: progress => { onProgress?.(progress); this.invalidate(); } });
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
      this.setColor(this.color);
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
    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.renderer.setSize(width, height, false);
      this.invalidate();
      if (this.active) this.render();
    }
    setColor(color) {
      if (!Object.values(app.Config.colors).includes(color)) return;
      this.color = color;
      this.props.crayonColorMaterials.forEach(material => material.color.set(color));
      this.invalidate();
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
      if ((changed || this.dirty || this.interactions.held) && !document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }
    interact() {
      this.hint?.kill();
      clearTimeout(this.hintTimer);
      this.props.crayonColorMaterials.forEach(material => { material.emissive?.setHex(0); });
      this.invalidate();
      this.hintTimer = setTimeout(() => {
        if (!this.active || app.runtime.transitioning || this.interactions.held) return;
        const pulse = { t: 0 };
        this.hint = gsap.to(pulse, { t: 1, yoyo: true, repeat: 3, duration: .65, onUpdate: () => {
          this.props.crayonColorMaterials.forEach(material => material.emissive?.setRGB(pulse.t * .12, pulse.t * .08, 0));
          this.invalidate();
        } });
      }, 5000);
    }
    exit() {
      this.active = false;
      this.interactions.release();
      cancelAnimationFrame(this.tick);
      clearTimeout(this.hintTimer); this.hint?.kill();
      this.audio.exit();
    }
    reset() {
      this.interactions.release();
      this.painting.reset();
      this.cameraRig.reset();
      this.setColor(app.Config.colors.green);
      this.invalidate();
    }
    getMemory() { return { canvas: this.painting.canvas, progress: this.painting.getProgress() }; }
    dispose() {
      this.exit(); this.interactions.dispose(); this.observer.disconnect();
      this.painting.dispose(); this.props.dispose();
      [this.paper, this.paperBody].forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
      this.keyLight.shadow.dispose();
      this.renderer.dispose();
    }
  }
  app.ChildhoodScene = ChildhoodScene;
})();
