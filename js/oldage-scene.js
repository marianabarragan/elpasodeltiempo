(() => {
  'use strict';
  const app = window.TimeExperience;
  const MASK_LAYER = 1;
  const POT_HOVER = { lift: .3, tilt: .14 };

  // Soft outline drawn behind an object (back faces pushed out along the normals).
  // It is built from whatever meshes the prop's `visual` holds, so .glb models get it too.
  const GLOW_VERTEX = `
    uniform float uThickness;
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uThickness, 1.0);
    }
  `;
  const GLOW_FRAGMENT = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec3 vNormal;
    void main() {
      float rim = 1.0 - abs(normalize(vNormal).z);
      gl_FragColor = vec4(uColor, uOpacity * (.4 + .6 * rim));
    }
  `;

  /**
   * Scenario 3 (old age): a table by the window, seen through deteriorated sight.
   * Visual props come from OldAgeProps.build() (or Config.oldage.propsFactory),
   * the narrative order from OldAgeActivity and pointer logic from OldAgeInteractions.
   * This class owns every visual response: glow, hover, movements, water and blur.
   */
  class OldAgeScene {
    constructor(container, { audio, progressBar, onComplete } = {}) {
      this.container = container;
      this.audio = audio;
      this.progressBar = progressBar;
      this.progressFill = progressBar?.querySelector('span');
      this.onComplete = onComplete;
      this.active = false;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const config = app.Config.oldage;
      this.config = config;
      const palette = app.OldAgeProps.PALETTE;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(palette.sage).lerp(new THREE.Color(palette.olive), .12);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.domElement.className = 'three-canvas';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);

      const factory = config.propsFactory || app.OldAgeProps.build;
      this.props = factory();
      this.scene.add(this.props.group);
      this.scene.updateMatrixWorld(true);
      this.addLights();

      // Glasses meshes also live on the mask layer: on hover only they are drawn sharp.
      this.props.glasses.visual.traverse(object => { if (object.isMesh) object.layers.enable(MASK_LAYER); });
      this.firstPerson = new app.FirstPersonGlasses(this.props.glasses.visual);
      this.glows = this.buildGlows();
      this.water = this.buildWater();
      this.sway = { amount: 0, target: 0, time: 0 };
      this.leaves = {};
      Object.entries(this.props.pots).forEach(([id, { plant }]) => {
        const leaves = [];
        plant.visual.traverse(object => { if (object.userData.leaf) leaves.push({ object, base: object.rotation.clone(), phase: Math.random() * 6 }); });
        this.leaves[id] = leaves;
      });
      // Spout position in the can's visual space (used to place the can over the pot).
      const can = this.props.wateringCan;
      this.spoutLocal = can.visual.worldToLocal(can.spout.getWorldPosition(new THREE.Vector3()));

      this.vision = new app.OldAgeVision(this.renderer, { maxBlurPx: config.vision.maxBlurPx, maskLayer: MASK_LAYER });
      this.visionState = { amount: config.vision.initialAmount, focus: 0 };
      this.cameraRig = new app.OldAgeCamera(new THREE.Vector3(.1, this.props.tableTopY + 2.2, .35));
      this.activity = new app.OldAgeActivity({ wateringSeconds: config.wateringSeconds });
      this.interactions = new app.OldAgeInteractions(this);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      this.resize();
      this.frame = this.frame.bind(this);
      this.tick = 0;
      this.time = 0;
    }

    // Warm late-afternoon light entering through the window behind the table.
    addLights() {
      const palette = app.OldAgeProps.PALETTE;
      const top = this.props.tableTopY;
      this.lights = [];
      const hemisphere = new THREE.HemisphereLight('#fff4dc', palette.plum, 1.9);
      const sun = new THREE.DirectionalLight('#ffd9a0', 2.1);
      sun.position.set(-7, 15, -9);
      sun.target.position.set(.5, top, 1);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 50 });
      sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
      const fill = new THREE.DirectionalLight(palette.sky, .55);
      fill.position.set(8, 9, 12);
      const bounce = new THREE.PointLight(palette.butter, 10, 14, 1.6);
      bounce.position.set(0, top + 4.5, 3);
      this.lights.push(hemisphere, sun, fill, bounce);
      this.lights.forEach(light => this.scene.add(light));
      this.scene.add(sun.target);
    }

    // One glow per interactive id. Pots glow without their plant (the plant is its own prop).
    buildGlows() {
      const palette = app.OldAgeProps.PALETTE;
      const thickness = { glasses: .045, pot1: .07, pot2: .07, wateringCan: .065 };
      const glows = {};
      Object.entries(this.props.interactive).forEach(([id, item]) => {
        const material = new THREE.ShaderMaterial({
          vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT,
          uniforms: { uColor: { value: new THREE.Color(palette.butter).lerp(new THREE.Color('#ffffff'), .35) }, uOpacity: { value: 0 }, uThickness: { value: thickness[id] } },
          side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false
        });
        const meshes = [];
        const skip = new Set(Object.values(this.props.pots).map(({ plant }) => plant.root));
        const collect = object => {
          if (skip.has(object)) return;
          if (object.isMesh && !object.userData.lens) meshes.push(object);
          object.children.forEach(collect);
        };
        collect(item.visual);
        meshes.forEach(source => {
          const shell = new THREE.Mesh(source.geometry, material);
          shell.userData.glowShell = true;
          shell.castShadow = shell.receiveShadow = false;
          shell.renderOrder = -1;
          source.add(shell);
        });
        glows[id] = { material, value: 0 };
      });
      return glows;
    }

    // Small pool of low-poly drops reused while pouring.
    buildWater() {
      const palette = app.OldAgeProps.PALETTE;
      const geometry = new THREE.IcosahedronGeometry(.075, 0);
      geometry.scale(1, 1.6, 1);
      const water = new THREE.Color(palette.sky).offsetHSL(0, .2, -.12);
      const material = new THREE.MeshStandardMaterial({ color: water, emissive: water, emissiveIntensity: .25, roughness: .2, transparent: true, opacity: .9 });
      const drops = Array.from({ length: 70 }, () => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        this.scene.add(mesh);
        return { mesh, velocity: new THREE.Vector3(), alive: false };
      });
      return { drops, geometry, material, spawn: 0, floor: 0 };
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.firstPerson.resize(width / height);
      this.renderer.setSize(width, height, false);
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.vision.setSize(size.x, size.y);
      if (this.active) this.render();
    }

    render() {
      this.vision.render(this.scene, this.cameraRig.camera, { ...this.visionState, time: this.time });
      this.firstPerson.render(this.renderer);
    }

    enter() {
      if (this.active) return;
      this.active = true;
      this.resize();
      this.lastTime = performance.now();
      this.tick = requestAnimationFrame(this.frame);
    }

    // Music starts with the scene and loops until the user leaves it.
    ready() { this.audio.enter(); }

    frame(now) {
      if (!this.active) return;
      const elapsed = Math.max(0, (now - this.lastTime) / 1000);
      const dt = Math.min(.05, elapsed);
      this.lastTime = now;
      this.time += dt;
      this.cameraRig.update(dt);
      this.updateGlows(dt);
      // Held time counts in real seconds, so 4.5 s are 4.5 s at any frame rate.
      this.updateWatering(Math.min(elapsed, .25));
      this.updateWater(dt);
      this.updateSway(dt);
      if (!document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }

    // Soft, slow blinking (≈2.6 s per cycle) on the objects that invite the next action.
    updateGlows(dt) {
      const glowing = this.activity.glowing;
      const pulse = .5 + .5 * Math.sin(this.time * 2.4);
      Object.entries(this.glows).forEach(([id, glow]) => {
        const target = glowing.includes(id) ? 1 : 0;
        glow.value += (target - glow.value) * (1 - Math.exp(-5 * dt));
        glow.material.uniforms.uOpacity.value = glow.value * (.28 + .55 * pulse);
      });
    }

    // ---------- Hover ----------
    setHover(name) {
      const step = this.activity.step;
      gsap.to(this.visionState, { focus: name === 'glasses' && step === 'glasses' ? 1 : 0, duration: .35, ease: 'power2.out', overwrite: 'auto' });
      ['pot1', 'pot2'].forEach(id => {
        const visual = this.props.interactive[id].visual;
        const on = name === id && step === 'choose';
        gsap.to(visual.position, { y: on ? POT_HOVER.lift : 0, duration: .45, ease: on ? 'back.out(2)' : 'power2.out', overwrite: 'auto' });
        gsap.to(visual.rotation, { z: on ? POT_HOVER.tilt : 0, x: on ? .05 : 0, duration: .5, ease: 'power2.out', overwrite: 'auto' });
      });
      const can = this.props.wateringCan.visual;
      const scale = name === 'wateringCan' && step === 'can' ? 1.06 : 1;
      gsap.to(can.scale, { x: scale, y: scale, z: scale, duration: .3, ease: 'power2.out', overwrite: 'auto' });
    }

    // ---------- Hidden curiosities (click only) ----------
    // Radio: a little rock on its base while the antenna swings. Cup: a slow turn on the saucer.
    poke(name) {
      if (name === 'radio') {
        const { visual, antenna } = this.props.radio;
        if (gsap.isTweening(visual.rotation)) return;
        gsap.timeline()
          .to(visual.rotation, { z: .09, duration: .18, ease: 'power2.out' })
          .to(visual.rotation, { z: -.06, duration: .22, ease: 'sine.inOut' })
          .to(visual.rotation, { z: 0, duration: .6, ease: 'elastic.out(1, .4)' });
        if (antenna) {
          const rest = antenna.userData.restZ ?? (antenna.userData.restZ = antenna.rotation.z);
          gsap.timeline()
            .to(antenna.rotation, { z: rest + .5, duration: .35, ease: 'power2.out' })
            .to(antenna.rotation, { z: rest, duration: 1.1, ease: 'elastic.out(1, .3)' });
        }
      } else if (name === 'coffeeCup') {
        const cup = this.props.coffeeCup.cup || this.props.coffeeCup.visual;
        if (gsap.isTweening(cup.rotation)) return;
        gsap.timeline()
          .to(cup.rotation, { y: cup.rotation.y + Math.PI * .5, duration: .9, ease: 'power2.inOut' })
          .to(cup.rotation, { x: .07, duration: .18, ease: 'sine.out' }, 0)
          .to(cup.rotation, { x: 0, duration: .55, ease: 'elastic.out(1, .45)' }, .2);
      }
    }

    // ---------- 1. Glasses ----------
    wearGlasses(done) {
      const glasses = this.props.glasses;
      gsap.to(this.visionState, { focus: 0, duration: .3, overwrite: 'auto' });
      // Picked up from the book: the table copy leaves while the first-person copy rises.
      gsap.timeline()
        .to(glasses.visual.position, { y: .45, duration: .3, ease: 'power2.out' })
        .to(glasses.visual.scale, { x: .001, y: .001, z: .001, duration: .25, ease: 'power2.in' }, .12)
        .set(glasses.root, { visible: false });
      const camera = this.cameraRig;
      gsap.timeline()
        .to(camera, { zoom: 1.035, duration: 1.2, ease: 'sine.inOut', delay: .4 })
        .to(camera, { zoom: 1, duration: 1.1, ease: 'sine.inOut' });
      const start = this.visionState.amount;
      this.firstPerson.play({
        reduced: this.reduced,
        onUnblur: t => { this.visionState.amount = start * (1 - t); },
        onComplete: () => {
          // Fully sharp; the frame is no longer visible anywhere on screen.
          this.visionState.amount = 0;
          camera.zoom = 1;
          done?.();
        }
      });
    }

    // ---------- 2. Pots ----------
    choosePot(id, done) {
      const { root, visual } = this.props.interactive[id];
      const target = this.props.center;
      const from = root.position.clone();
      const pose = { t: 0 };
      gsap.killTweensOf([visual.position, visual.rotation]);
      gsap.to(visual.position, { y: 0, duration: .5, ease: 'power2.inOut' });
      gsap.to(visual.rotation, { x: 0, z: 0, duration: .5, ease: 'power2.inOut' });
      gsap.to(pose, {
        t: 1, duration: this.reduced ? .2 : 1.5, ease: 'power2.inOut',
        onUpdate: () => {
          root.position.lerpVectors(from, target, pose.t);
          root.position.y += Math.sin(pose.t * Math.PI) * .9;
        },
        onComplete: () => {
          gsap.fromTo(visual.scale, { y: .94 }, { y: 1, duration: .45, ease: 'elastic.out(1, .5)' });
          done?.();
        }
      });
    }

    // ---------- 3. Watering can ----------
    // Root pose that puts the tilted spout right above the chosen pot's soil.
    pourPose(potId) {
      const pot = this.props.pots[potId];
      const tilt = this.config.pourAngle;
      const tipped = this.spoutLocal.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      const center = this.props.center;
      return new THREE.Vector3(center.x - tipped.x - .1, center.y + pot.rimY + 1.15 - tipped.y, center.z - tipped.z);
    }

    bringCan(potId, done) {
      const can = this.props.wateringCan;
      const target = this.pourPose(potId);
      const from = can.root.position.clone(), fromQuaternion = can.root.quaternion.clone();
      const facing = new THREE.Quaternion();
      const pose = { t: 0 };
      gsap.to(can.visual.scale, { x: 1, y: 1, z: 1, duration: .3, overwrite: 'auto' });
      gsap.to(pose, {
        t: 1, duration: this.reduced ? .2 : 1.4, ease: 'power2.inOut',
        onUpdate: () => {
          can.root.position.lerpVectors(from, target, pose.t);
          can.root.position.y += Math.sin(pose.t * Math.PI) * .6;
          can.root.quaternion.slerpQuaternions(fromQuaternion, facing, pose.t);
        },
        onComplete: () => done?.()
      });
    }

    setPouring(on) {
      const visual = this.props.wateringCan.visual;
      gsap.to(visual.rotation, { z: on ? this.config.pourAngle : 0, duration: on ? .45 : .4, ease: 'power2.out', overwrite: 'auto' });
      this.sway.target = on ? 1 : 0;
      if (on) {
        this.audio.playEffect('water');
        this.showProgress();
      }
    }

    updateWatering(dt) {
      const activity = this.activity;
      if (activity.step !== 'water') return;
      if (activity.pouring) {
        const finished = activity.addWatering(dt);
        this.setProgress(activity.progress);
        if (finished) this.finishWatering();
      }
      this.placeProgress();
    }

    finishWatering() {
      const activity = this.activity;
      this.interactions.release();
      activity.set('returning');
      this.setProgress(1);
      const bar = this.progressBar;
      if (bar) gsap.to(bar, { autoAlpha: 0, duration: .45, delay: .25, ease: 'power2.out', onComplete: () => { bar.hidden = true; } });
      const can = this.props.wateringCan;
      const rest = this.props.rest.wateringCan;
      const from = can.root.position.clone(), fromQuaternion = can.root.quaternion.clone();
      const pose = { t: 0 };
      gsap.to(can.visual.rotation, { z: 0, duration: .4, overwrite: 'auto' });
      gsap.to(pose, {
        t: 1, duration: this.reduced ? .2 : 1.4, delay: .35, ease: 'power2.inOut',
        onUpdate: () => {
          can.root.position.lerpVectors(from, rest.position, pose.t);
          can.root.position.y += Math.sin(pose.t * Math.PI) * .5;
          can.root.quaternion.slerpQuaternions(fromQuaternion, rest.quaternion, pose.t);
        },
        onComplete: () => {
          activity.set('complete');
          this.onComplete?.();
        }
      });
    }

    // ---------- Progress bar (DOM, beside the can) ----------
    showProgress() {
      const bar = this.progressBar;
      if (!bar || !bar.hidden) return;
      bar.hidden = false;
      this.placeProgress();
      gsap.fromTo(bar, { autoAlpha: 0, scale: .9 }, { autoAlpha: 1, scale: 1, duration: .3, ease: 'power2.out' });
    }

    setProgress(value) {
      if (!this.progressBar) return;
      this.progressFill.style.transform = `scaleY(${value})`;
      this.progressBar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    }

    placeProgress() {
      const bar = this.progressBar;
      if (!bar || bar.hidden) return;
      const can = this.props.wateringCan.root;
      const point = can.localToWorld(new THREE.Vector3(1.35, .9, 0)).project(this.cameraRig.camera);
      const rect = this.container.getBoundingClientRect();
      bar.style.left = `${(point.x * .5 + .5) * rect.width}px`;
      bar.style.top = `${(.5 - point.y * .5) * rect.height}px`;
    }

    // ---------- Water drops ----------
    updateWater(dt) {
      const water = this.water;
      const pouring = this.activity.pouring && this.activity.step === 'water';
      const can = this.props.wateringCan;
      if (pouring && can.visual.rotation.z > this.config.pourAngle * .6) {
        const potId = this.activity.chosen;
        water.floor = this.props.center.y + this.props.pots[potId].soilY;
        water.spawn += dt * 60;
        const origin = can.spout.getWorldPosition(new THREE.Vector3());
        const direction = new THREE.Vector3(-1, -.15, 0).applyQuaternion(can.root.quaternion);
        while (water.spawn >= 1) {
          water.spawn -= 1;
          const drop = water.drops.find(item => !item.alive);
          if (!drop) break;
          drop.alive = true;
          drop.mesh.visible = true;
          drop.mesh.position.copy(origin).add(new THREE.Vector3((Math.random() - .5) * .18, (Math.random() - .5) * .08, (Math.random() - .5) * .18));
          drop.velocity.copy(direction).multiplyScalar(.9 + Math.random() * .6)
            .add(new THREE.Vector3((Math.random() - .5) * .5, -.2, (Math.random() - .5) * .5));
          drop.mesh.scale.setScalar(.7 + Math.random() * .6);
        }
      } else water.spawn = 0;
      water.drops.forEach(drop => {
        if (!drop.alive) return;
        drop.velocity.y -= 9.5 * dt;
        drop.mesh.position.addScaledVector(drop.velocity, dt);
        if (drop.mesh.position.y <= water.floor) { drop.alive = false; drop.mesh.visible = false; }
      });
    }

    // ---------- Plant response ----------
    updateSway(dt) {
      const sway = this.sway;
      sway.amount += (sway.target - sway.amount) * (1 - Math.exp(-(sway.target > sway.amount ? 2.5 : 1.1) * dt));
      sway.time += dt * (1 + sway.amount * 1.6);
      const breeze = .012;
      Object.entries(this.props.pots).forEach(([id, { plant }]) => {
        const watered = id === this.activity.chosen ? sway.amount : 0;
        const amplitude = breeze + watered * .13;
        plant.sway.rotation.z = Math.sin(sway.time * 2.2 + (id === 'pot2' ? 1.3 : 0)) * amplitude;
        plant.sway.rotation.x = Math.sin(sway.time * 1.7 + .6) * amplitude * .45;
        this.leaves[id].forEach(({ object, base, phase }) => {
          object.rotation.x = base.x + Math.sin(sway.time * 3.1 + phase) * (amplitude * .9);
          object.rotation.z = base.z + Math.sin(sway.time * 2.6 + phase * 1.3) * (amplitude * .7);
        });
      });
    }

    exit() {
      this.active = false;
      this.interactions.release();
      this.interactions.setHover(null);
      cancelAnimationFrame(this.tick);
      this.audio.exit();
    }

    reset() {
      this.interactions.reset();
      this.firstPerson.stop();
      this.activity.reset();
      const tweened = [this.visionState, this.cameraRig];
      Object.values(this.props.interactive).forEach(({ root, visual }) => tweened.push(root.position, root.quaternion, visual.position, visual.rotation, visual.scale));
      gsap.killTweensOf(tweened);
      Object.entries(this.props.interactive).forEach(([id, { root, visual }]) => {
        root.position.copy(this.props.rest[id].position);
        root.quaternion.copy(this.props.rest[id].quaternion);
        root.visible = true;
        visual.position.set(0, 0, 0);
        visual.scale.set(1, 1, 1);
        visual.rotation.z = 0;
        if (id !== 'glasses') visual.rotation.x = 0;
      });
      const { radio, coffeeCup } = this.props;
      const curious = [radio.visual.rotation, radio.antenna?.rotation, (coffeeCup.cup || coffeeCup.visual).rotation].filter(Boolean);
      gsap.killTweensOf(curious);
      radio.visual.rotation.z = 0;
      if (radio.antenna?.userData.restZ !== undefined) radio.antenna.rotation.z = radio.antenna.userData.restZ;
      (coffeeCup.cup || coffeeCup.visual).rotation.set(0, 0, 0);
      Object.values(this.glows).forEach(glow => { glow.value = 0; });
      this.water.drops.forEach(drop => { drop.alive = false; drop.mesh.visible = false; });
      Object.assign(this.sway, { amount: 0, target: 0 });
      Object.assign(this.visionState, { amount: this.config.vision.initialAmount, focus: 0 });
      if (this.progressBar) {
        gsap.killTweensOf(this.progressBar);
        this.progressBar.hidden = true;
        this.setProgress(0);
      }
      this.cameraRig.reset();
    }

    getMemory() {
      return { complete: this.activity.complete, chosen: this.activity.chosen };
    }

    dispose() {
      this.exit(); this.interactions.dispose(); this.observer.disconnect();
      Object.values(this.glows).forEach(glow => glow.material.dispose());
      this.water.geometry.dispose(); this.water.material.dispose();
      this.vision.dispose(); this.props.dispose();
      this.renderer.dispose();
    }
  }

  app.OldAgeScene = OldAgeScene;
})();
