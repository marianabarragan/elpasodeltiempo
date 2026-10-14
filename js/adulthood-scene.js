(() => {
  'use strict';
  const app = window.TimeExperience;

  /**
   * Scenario 2 (youth / young adulthood): a desk at night lit by the monitor.
   * Visual props come from AdulthoodProps.build() (or Config.adulthood.propsFactory),
   * the checklist logic from ChecklistSystem and pointer logic from AdulthoodInteractions.
   */
  class AdulthoodScene {
    constructor(container, { audio, onComplete } = {}) {
      this.container = container;
      this.audio = audio;
      this.onComplete = onComplete;
      this.active = false;
      this.dirty = true;
      this.clockOn = true;
      const config = app.Config.adulthood;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#3a3326');
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.domElement.className = 'three-canvas';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);

      const factory = config.propsFactory || app.AdulthoodProps.build;
      this.props = factory();
      this.scene.add(this.props.group);
      this.scene.updateMatrixWorld(true);

      const paper = this.props.paper;
      this.checklist = new app.ChecklistSystem({
        ...config.checklist,
        coverage: config.checklist.strikeCoverage,
        aspect: paper.height / paper.width,
        onChange: () => this.invalidate(),
        onStrike: () => this.interact(),
        onComplete: () => this.onComplete?.()
      });
      paper.material.map = this.checklist.texture;
      paper.material.needsUpdate = true;

      this.addLights();
      this.monitorLight = new app.MonitorLight({
        anchor: this.props.monitorScreen.anchor,
        width: this.props.monitorScreen.width,
        height: this.props.monitorScreen.height,
        deskY: this.props.deskTopY
      });
      this.monitorLight.apply(this.props.group);

      const desk = this.props.deskTopY;
      this.cameraRig = new app.AdulthoodCamera(new THREE.Vector3(-.35, desk + 1.35, -.2));
      this.interactions = new app.AdulthoodInteractions(this);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      this.resize();
      this.frame = this.frame.bind(this);
      this.tick = 0;
    }

    // Soft, legible night ambience. The monitor beam (MonitorLight) is the dominant light;
    // these fills only keep the room readable and shadows gentle.
    addLights() {
      const palette = app.AdulthoodProps.PALETTE;
      this.scene.add(new THREE.HemisphereLight(palette.sand, palette.walnut, 2.1));
      const screenKey = new THREE.DirectionalLight('#cfe6ff', .75);
      const screen = this.props.monitorScreen.anchor.getWorldPosition(new THREE.Vector3());
      screenKey.position.copy(screen).add(new THREE.Vector3(0, 6, 2.5));
      screenKey.target.position.set(screen.x - .3, this.props.deskTopY, screen.z + 4);
      screenKey.castShadow = true;
      screenKey.shadow.mapSize.set(2048, 2048);
      Object.assign(screenKey.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: .5, far: 30 });
      screenKey.shadow.bias = -.0003; screenKey.shadow.normalBias = .02;
      this.scene.add(screenKey, screenKey.target);
      const warm = new THREE.DirectionalLight(palette.sand, .95);
      warm.position.set(-9, 16, 12);
      this.scene.add(warm);
      const glow = new THREE.PointLight('#a8d6ff', 6, 9, 1.6);
      glow.position.copy(screen).add(new THREE.Vector3(0, .2, 1.2));
      this.scene.add(glow);
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.renderer.setSize(width, height, false);
      this.invalidate();
      if (this.active) this.render();
    }

    invalidate() { this.dirty = true; }

    render() {
      this.checklist.update();
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
      if ((changed || this.dirty || this.checklist.needsDraw) && !document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }

    // Secondary props: ambience only, never touching the checklist.
    activateProp(name) {
      const item = this.props.interactive[name];
      if (!item) return;
      this.interact();
      if (name === 'coffeeThermos') {
        this.audio.playEffect('thermos');
        gsap.killTweensOf([item.visual.position, item.visual.rotation]);
        gsap.timeline({ onUpdate: () => this.invalidate() })
          .to(item.visual.position, { y: .26, duration: .16, ease: 'power2.out' })
          .to(item.visual.rotation, { z: .08, duration: .16, ease: 'power1.out' }, 0)
          .to(item.visual.position, { y: 0, duration: .5, ease: 'bounce.out' })
          .to(item.visual.rotation, { z: 0, duration: .45, ease: 'elastic.out(1, .45)' }, '<');
      } else if (name === 'clockDigital') {
        this.audio.playEffect('clock');
        this.clockOn = !this.clockOn;
        this.props.clock.setPower(this.clockOn);
        gsap.fromTo(item.visual.position, { y: -.03 }, { y: 0, duration: .25, ease: 'power2.out', onUpdate: () => this.invalidate() });
      }
      this.invalidate();
    }

    onPenGrab() {
      this.hint?.kill();
      clearTimeout(this.hintTimer);
      this.props.pen.materials.forEach(material => material.emissive.setHex(0));
    }

    // After a pause the pen glows faintly, as the crayon does in the childhood scene.
    interact() {
      this.hint?.kill();
      clearTimeout(this.hintTimer);
      this.props.pen.materials.forEach(material => material.emissive.setHex(0));
      this.invalidate();
      if (this.checklist.complete) return;
      this.hintTimer = setTimeout(() => {
        if (!this.active || app.runtime.transitioning || this.interactions.held) return;
        const pulse = { t: 0 };
        this.hint = gsap.to(pulse, { t: 1, yoyo: true, repeat: 3, duration: .65, onUpdate: () => {
          this.props.pen.materials.forEach(material => material.emissive.setRGB(pulse.t * .1, pulse.t * .12, pulse.t * .16));
          this.invalidate();
        } });
      }, 6000);
    }

    exit() {
      this.active = false;
      this.interactions.release();
      this.interactions.setHover(null);
      cancelAnimationFrame(this.tick);
      clearTimeout(this.hintTimer); this.hint?.kill();
      this.audio.exit();
    }

    reset() {
      this.interactions.reset();
      this.checklist.reset();
      this.cameraRig.reset();
      this.clockOn = true;
      this.props.clock.setPower(true);
      this.invalidate();
    }

    getMemory() { return this.checklist.getState(); }

    dispose() {
      this.exit(); this.interactions.dispose(); this.observer.disconnect();
      this.checklist.dispose(); this.monitorLight.dispose(); this.props.dispose();
      this.renderer.dispose();
    }
  }

  app.AdulthoodScene = AdulthoodScene;
})();
