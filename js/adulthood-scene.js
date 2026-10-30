(() => {
  'use strict';
  const app = window.TimeExperience;

  /**
   * Scenario 2 (youth / young adulthood): a desk at night lit by the monitor.
   * Visual props come from AdulthoodProps.build() (or Config.adulthood.propsFactory),
   * the checklist logic from ChecklistSystem, the lifted reading mode (with background
   * blur) from SheetFocus and pointer logic from AdulthoodInteractions.
   */
  class AdulthoodScene {
    constructor(container, { audio, progressBar, onComplete } = {}) {
      this.container = container;
      this.audio = audio;
      this.onComplete = onComplete;
      this.active = false;
      this.dirty = true;
      this.clockOn = true;
      this.screenOn = true;
      this.screenLevel = { value: 1 };
      this.finished = false;
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

      // Progress bar: each checked box and each secondary prop (see Config.adulthood.progress).
      this.progress = new app.AdulthoodProgress({
        element: progressBar, tasks: config.checklist.tasks.length, onComplete: () => this.finish()
      });
      const paper = this.props.paper;
      this.checklist = new app.ChecklistSystem({
        ...config.checklist,
        aspect: paper.height / paper.width,
        sheet: paper.sheet,
        onChange: () => this.invalidate(),
        onCheck: index => { this.interact(); this.progress.mark(`task${index}`); },
        // The fourth check stays in view for a moment, then sheet and pen go back to the desk.
        onComplete: () => {
          this.completeCall = gsap.delayedCall(.7, () => this.sheet.lowerSheet(() => this.finish()));
        }
      });
      paper.material.map = this.checklist.texture;
      // Same texture as emission (off on the desk): the lifted sheet brightens, the ink stays dark.
      paper.material.emissiveMap = this.checklist.texture;
      paper.material.needsUpdate = true;

      this.addLights();
      this.monitorLight = new app.MonitorLight({
        ...app.Config.adulthood.screenLight,
        anchor: this.props.monitorScreen.anchor,
        width: this.props.monitorScreen.width,
        height: this.props.monitorScreen.height,
        deskY: this.props.deskTopY
      });
      this.monitorLight.apply(this.props.group);

      const desk = this.props.deskTopY;
      // Orthographic picada centred on the desk top and the props standing on it.
      this.cameraRig = new app.AdulthoodCamera(new THREE.Vector3(.1, desk + 1.75, 0));
      // The plant stands at the far left end of the desk: the view is always wide enough for it.
      const plant = new THREE.Box3().setFromObject(this.props.models.plant.root);
      this.cameraRig.viewWidth = Math.max(this.cameraRig.viewWidth, 2 * (this.cameraRig.target.x - plant.min.x) + .5);
      this.sheet = new app.SheetFocus(this);
      this.calendarMonth = 0;
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
      const hemisphere = new THREE.HemisphereLight(palette.sand, palette.walnut, 2.1);
      this.scene.add(hemisphere);
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
      this.lights = { hemisphere, screenKey, warm, glow };
    }

    // Screen light level (0 = off, 1 = on). With the screen off its beam, haze and glow fade
    // out while the warm room fills rise a little, so the desk stays clearly visible.
    applyScreenLevel() {
      const level = this.screenLevel.value, dark = 1 - level;
      const { hemisphere, screenKey, warm, glow } = this.lights;
      this.monitorLight.setLevel(level);
      glow.intensity = 6 * level;
      screenKey.intensity = .75 * (.3 + .7 * level);
      hemisphere.intensity = 2.1 + .55 * dark;
      warm.intensity = .95 + .45 * dark;
      this.invalidate();
    }

    toggleScreen() {
      this.screenOn = !this.screenOn;
      this.props.monitorScreen.setPower(this.screenOn);
      gsap.to(this.screenLevel, {
        value: this.screenOn ? 1 : 0, duration: .5, ease: 'power2.out', overwrite: true,
        onUpdate: () => this.applyScreenLevel()
      });
    }

    // The scene is complete when the bar reaches 100 % and the sheet is back on the desk.
    finish() {
      if (this.finished || !this.progress.complete || this.sheet.state !== 'desk') return;
      this.finished = true;
      this.onComplete?.();
    }

    // The Blender desk and wall (props.deskFit / wallFit) are scaled uniformly, never stretched,
    // just enough to cover everything the camera can show on this screen shape at any permitted
    // angle: the desk from the wall forward (never smaller than modelled), the wall only when a
    // very wide or tall screen sees past its edges.
    fitBackdrop() {
      const desk = this.props.deskFit, wall = this.props.wallFit;
      if (!desk && !wall) return;
      const rig = this.cameraRig, pose = { ...rig.current };
      const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.props.deskTopY);
      const back = desk ? desk.back : -Infinity;
      const wallPlane = wall && new THREE.Plane(new THREE.Vector3(0, 0, 1), -wall.object.position.z);
      const ray = new THREE.Raycaster(), point = new THREE.Vector3(), screen = new THREE.Vector2();
      let deskScale = 1, wallScale = 1;
      for (const yaw of [-1, 0, 1]) for (const tilt of [rig.tiltRange[0], 0, rig.tiltRange[1]]) {
        rig.current.yaw = yaw * rig.maxYaw; rig.current.tilt = tilt;
        rig.apply();
        for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
          ray.setFromCamera(screen.set(i / 8 - 1, j / 8 - 1), rig.camera);
          // Margins of a few percent cover the camera's small slide while it turns.
          if (ray.ray.intersectPlane(top, point) && point.z >= back) {
            if (desk) deskScale = Math.max(deskScale, 2 * Math.abs(point.x - desk.object.position.x) / desk.width * 1.06, (point.z - back) / desk.depth * 1.06);
          } else if (wall && ray.ray.intersectPlane(wallPlane, point)) {
            const x = point.x - wall.object.position.x, y = point.y - wall.object.position.y;
            wallScale = Math.max(wallScale, (x < 0 ? -x / wall.left : x / wall.right) * 1.04, y / wall.height * 1.04);
          }
        }
      }
      Object.assign(rig.current, pose);
      rig.apply();
      desk?.object.scale.setScalar(deskScale);
      wall?.object.scale.setScalar(wallScale);
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.fitBackdrop();
      this.renderer.setSize(width, height, false);
      const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.sheet.setSize(buffer.x, buffer.y);
      this.invalidate();
      if (this.active) this.render();
    }

    invalidate() { this.dirty = true; }

    render() {
      this.checklist.update();
      this.sheet.update();
      this.sheet.render(this.scene, this.cameraRig.camera);
      this.dirty = false;
    }

    enter() {
      if (this.active) return;
      this.active = true;
      this.resize();
      this.lastTime = performance.now();
      this.tick = requestAnimationFrame(this.frame);
    }

    // Called once the entry transition has finished: the sheet's glow starts after its delay.
    ready() { this.audio.enter(); this.interact(); this.sheet.scheduleGlow(); }

    frame(now) {
      if (!this.active) return;
      const changed = this.cameraRig.update((now - this.lastTime) / 1000);
      this.lastTime = now;
      if ((changed || this.dirty || this.checklist.needsDraw) && !document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }

    // Click on a desk prop. The sheet (or the pen lying next to it) opens the reading mode;
    // the calendar turns a month and the screen (or the monitor's button) switches the screen.
    // The thermos, the clock and the calendar also add their share to the progress bar (once each).
    activateProp(name) {
      const item = this.props.interactive[name];
      if (!item) return;
      this.interact();
      if (name === 'checklistPaper' || name === 'pen') {
        if (this.sheet.liftSheet()) this.interact();
      } else if (name === 'monitor') {
        this.toggleScreen();
      } else if (name === 'monitorPower') {
        this.toggleScreen();
        gsap.fromTo(item.visual.position, { z: -.03 }, { z: 0, duration: .25, ease: 'power2.out', onUpdate: () => this.invalidate() });
      } else if (name === 'wallCalendar') {
        this.flipCalendar();
      } else if (name === 'coffeeThermos') {
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
      this.progress.mark(name);
      this.invalidate();
    }

    // Wall calendar: the current sheet lifts off the pad and falls away, showing the next
    // month (October → November → December → January …). A click during the animation
    // finishes it at once and turns the following sheet.
    flipCalendar() {
      this.calendarFlip?.progress(1);
      const { pages, setMonth } = this.props.calendar;
      const front = pages.front;
      const k = matchMedia('(prefers-reduced-motion: reduce)').matches ? .3 : 1;
      this.calendarFlip = gsap.timeline({
        onUpdate: () => this.invalidate(),
        onComplete: () => {
          this.calendarMonth += 1;
          setMonth(this.calendarMonth);
          this.restCalendarPage();
          this.calendarFlip = null;
        }
      })
        .to(front.pivot.rotation, { x: -.7, z: .05, duration: .3 * k, ease: 'power2.out' })
        .to(front.pivot.position, { x: '+=.35', y: '-=2.4', z: '+=1.5', duration: .8 * k, ease: 'power2.in' }, '>-.04')
        .to(front.pivot.rotation, { x: -1.45, z: .45, duration: .8 * k, ease: 'power1.in' }, '<')
        .to(front.material, { opacity: 0, duration: .42 * k, ease: 'power1.in' }, `<${.38 * k}`);
    }

    restCalendarPage() {
      const front = this.props.calendar.pages.front;
      front.pivot.position.copy(front.rest);
      front.pivot.rotation.set(0, 0, 0);
      front.material.opacity = 1;
      this.invalidate();
    }

    // Immediate pulse of the pen beside the lifted sheet (a click on the sheet without it).
    hintPen() {
      clearTimeout(this.hintTimer);
      this.pulsePen(1);
    }

    pulsePen(repeat) {
      this.hint?.kill();
      const pulse = { t: 0 };
      this.hint = gsap.to(pulse, { t: 1, yoyo: true, repeat, duration: .45, onUpdate: () => {
        this.props.pen.materials.forEach(material => material.emissive.setRGB(pulse.t * .16, pulse.t * .19, pulse.t * .25));
        this.invalidate();
      } });
    }

    // With the sheet lifted and the pen still beside it, the pen glows faintly after a pause.
    interact() {
      this.hint?.kill();
      clearTimeout(this.hintTimer);
      this.props.pen.materials.forEach(material => material.emissive.setHex(0));
      this.invalidate();
      if (this.checklist.complete) return;
      this.hintTimer = setTimeout(() => {
        if (!this.active || app.runtime.transitioning || this.sheet.state !== 'lifted' || this.sheet.held) return;
        this.pulsePen(3);
      }, 4000);
    }

    exit() {
      this.active = false;
      this.interactions.release();
      this.interactions.setHover(null);
      cancelAnimationFrame(this.tick);
      clearTimeout(this.hintTimer); this.hint?.kill();
      this.sheet.pause();
      this.audio.exit();
    }

    reset() {
      this.interactions.reset();
      this.completeCall?.kill();
      this.checklist.reset();
      this.sheet.reset();
      this.calendarFlip?.kill();
      this.calendarFlip = null;
      this.calendarMonth = 0;
      this.props.calendar.setMonth(0);
      this.restCalendarPage();
      this.cameraRig.reset();
      this.clockOn = true;
      this.props.clock.setPower(true);
      this.props.pen.materials.forEach(material => material.emissive.setHex(0));
      this.progress.reset();
      this.finished = false;
      gsap.killTweensOf(this.screenLevel);
      this.screenOn = true;
      this.screenLevel.value = 1;
      this.props.monitorScreen.setPower(true);
      this.applyScreenLevel();
      this.invalidate();
    }

    getMemory() {
      return { ...this.checklist.getState(), complete: this.progress.complete && this.finished, progress: this.progress.value };
    }

    dispose() {
      this.exit(); this.interactions.dispose(); this.observer.disconnect();
      this.checklist.dispose(); this.sheet.dispose(); this.monitorLight.dispose(); this.props.dispose();
      this.renderer.dispose();
    }
  }

  app.AdulthoodScene = AdulthoodScene;
})();
