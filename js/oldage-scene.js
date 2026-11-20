(() => {
  'use strict';
  const app = window.TimeExperience;
  const MASK_LAYER = 1;
  const POT_HOVER = { lift: .3, tilt: .14 };
  // La taza se eleva y la radio crece ligeramente al señalarlas.
  const CUP_HOVER = { lift: .12, scale: 1.05 };
  const RADIO_HOVER = 1.045;
  const WINDOW_HOVER = 1.03;
  // Prolonga el sonido del agua entre gotas para evitar cortes.
  const WATER_HOLD = .15;
  // Intensidades del sol y relleno, resolución y suavidad de sombras.
  const SHADOW = { sun: 1.95, ambient: 2, fill: .55, mapSize: [1536, 980], radius: 3 };

  // Dibuja un contorno suave detrás de las mallas del objeto.
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

  /* Coordina actividad, progreso y respuestas visuales de la vejez. */
  class OldAgeScene {
    // progressBar indica el riego; sceneProgress, el progreso de la escena.
    constructor(container, { audio, progressBar, sceneProgress, onComplete } = {}) {
      this.container = container;
      this.audio = audio;
      this.progressBar = progressBar;
      this.onComplete = onComplete;
      this.finished = false;
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
      // PCF permite suavizar los bordes mediante shadow.radius.
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.domElement.className = 'three-canvas';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);

      const factory = config.propsFactory || app.OldAgeProps.build;
      this.props = factory();
      this.scene.add(this.props.group);
      this.scene.updateMatrixWorld(true);
      this.addLights();

      // La máscara mantiene nítidas las gafas al señalarlas.
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
      // Posición del pico usada para situar la regadera sobre la maceta.
      const can = this.props.wateringCan;
      this.spoutLocal = can.visual.worldToLocal(can.spout.getWorldPosition(new THREE.Vector3()));

      this.vision = new app.OldAgeVision(this.renderer, { maxBlurPx: config.vision.maxBlurPx, maskLayer: MASK_LAYER });
      this.visionState = { amount: config.vision.initialAmount, focus: 0 };
      // Enfoca encima de los objetos, con la ventana al fondo.
      this.cameraRig = new app.OldAgeCamera(new THREE.Vector3(.1, this.props.tableTopY + 2.9, .35));
      this.activity = new app.OldAgeActivity({ wateringSeconds: config.wateringSeconds });
      this.progress = new app.OldAgeProgress({ element: sceneProgress, onComplete: () => this.finish() });
      this.interactions = new app.OldAgeInteractions(this);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
      this.resize();
      this.frame = this.frame.bind(this);
      this.tick = 0;
      this.time = 0;
    }

    // Luz cálida de atardecer con sombras suaves sobre la mesa.
    addLights() {
      const palette = app.OldAgeProps.PALETTE;
      const top = this.props.tableTopY;
      this.lights = [];
      const hemisphere = new THREE.HemisphereLight('#fff4dc', new THREE.Color(palette.plum).lerp(new THREE.Color(palette.clay), .55), SHADOW.ambient);
      const sun = new THREE.DirectionalLight('#ffd9a0', SHADOW.sun);
      sun.position.set(-7, 15, -9);
      sun.target.position.set(.5, top, 1);
      sun.castShadow = true;
      // La sombra cubre toda la mesa visible para evitar cambios bruscos de iluminación.
      sun.shadow.mapSize.set(...SHADOW.mapSize);
      sun.shadow.radius = SHADOW.radius;
      Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 15, bottom: -13, near: .5, far: 50 });
      sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
      const fill = new THREE.DirectionalLight(new THREE.Color(palette.butter).lerp(new THREE.Color(palette.clay), .3), SHADOW.fill);
      fill.position.set(8, 9, 12);
      const bounce = new THREE.PointLight(palette.butter, 10, 14, 1.6);
      bounce.position.set(0, top + 4.5, 3);
      this.lights.push(hemisphere, sun, fill, bounce);
      this.lights.forEach(light => this.scene.add(light));
      this.scene.add(sun.target);
    }

    // Cada objeto tiene su halo; taza y radio brillan si falta su hito.
    buildGlows() {
      const palette = app.OldAgeProps.PALETTE;
      const thickness = { glasses: .045, pot1: .07, pot2: .07, wateringCan: .065, radio: .06, coffeeCup: .04 };
      const glows = {};
      Object.entries({ ...this.props.interactive, ...this.props.curiosities }).forEach(([id, item]) => {
        if (id === 'window') return;
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

    // Reutiliza un pequeño conjunto de gotas durante el riego.
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
      return { drops, geometry, material, spawn: 0, floor: 0, lastHit: -Infinity };
    }

    // Escala la mesa uniformemente para cubrir la vista y ocultar el piso.
    fitTable() {
      const fit = this.props.tableFit;
      if (!fit) return;
      const rig = this.cameraRig, pose = { ...rig.current }, zoom = rig.zoom;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.props.tableTopY);
      const ray = new THREE.Raycaster(), point = new THREE.Vector3(), screen = new THREE.Vector2();
      const origin = fit.object.position, needed = [];
      rig.zoom = 1;
      for (const yaw of [-1, 0, 1]) for (const tilt of [-1, 0, 1]) {
        rig.current.yaw = yaw * rig.maxYaw; rig.current.tilt = tilt * rig.maxTilt;
        rig.apply();
        for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
          ray.setFromCamera(screen.set(i / 8 - 1, j / 8 - 1), rig.camera);
          if (ray.ray.intersectPlane(plane, point) && point.z >= fit.back) needed.push([point.x - origin.x, point.z - origin.z]);
        }
      }
      Object.assign(rig.current, pose);
      rig.zoom = zoom;
      rig.apply();
      // Amplía hasta cubrir el contorno visible, con margen para el movimiento de cámara.
      const inside = (x, z, outline) => {
        let hit = false;
        for (let a = 0, b = outline.length - 1; a < outline.length; b = a++) {
          const [xa, za] = outline[a], [xb, zb] = outline[b];
          if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) hit = !hit;
        }
        return hit;
      };
      let scale = Math.max(...needed.map(([x, z]) => Math.max(2 * Math.abs(x) / fit.width, z / fit.depth)), .01);
      for (let step = 0; step < 80 && needed.some(([x, z]) => !inside(x / scale, Math.max(z, .02) / scale, fit.outline)); step++) scale *= 1.01;
      fit.object.scale.setScalar(scale * 1.04);
    }

    // Amplía la pared desde el borde inferior solo cuando el encuadre lo exige.
    fitWall() {
      const fit = this.props.wallFit, table = this.props.tableFit;
      if (!fit) return;
      const rig = this.cameraRig, pose = { ...rig.current }, zoom = rig.zoom;
      const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.props.tableTopY);
      const wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), -fit.object.position.z);
      const back = table ? table.back : -Infinity;
      const ray = new THREE.Raycaster(), point = new THREE.Vector3(), screen = new THREE.Vector2();
      let scale = 1;
      rig.zoom = 1;
      for (const yaw of [-1, 0, 1]) for (const tilt of [-1, 0, 1]) {
        rig.current.yaw = yaw * rig.maxYaw; rig.current.tilt = tilt * rig.maxTilt;
        rig.apply();
        for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
          ray.setFromCamera(screen.set(i / 8 - 1, j / 8 - 1), rig.camera);
          // Los rayos que alcanzan la mesa no necesitan comprobar la pared.
          if (ray.ray.intersectPlane(top, point) && point.z >= back) continue;
          if (!ray.ray.intersectPlane(wall, point)) continue;
          const x = point.x - fit.object.position.x, y = point.y - fit.object.position.y;
          scale = Math.max(scale, x < 0 ? -x / fit.left : x / fit.right, y / fit.height);
        }
      }
      Object.assign(rig.current, pose);
      rig.zoom = zoom;
      rig.apply();
      fit.object.scale.setScalar(scale > 1 ? scale * 1.03 : 1);
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.fitTable();
      this.fitWall();
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

    // La música se repite desde la entrada hasta salir de la escena.
    ready() { this.audio.enter(); }

    frame(now) {
      if (!this.active) return;
      const elapsed = Math.max(0, (now - this.lastTime) / 1000);
      const dt = Math.min(.05, elapsed);
      this.lastTime = now;
      this.time += dt;
      this.cameraRig.update(dt);
      this.updateGlows(dt);
      // Mide el riego en segundos reales, independientemente de los fotogramas.
      this.updateWatering(Math.min(elapsed, .25));
      this.updateWater(dt);
      this.updateSway(dt);
      if (!document.hidden) this.render();
      this.tick = requestAnimationFrame(this.frame);
    }

    // El brillo indica el siguiente paso; tras regar, señala taza y radio si falta ese hito.
    updateGlows(dt) {
      const glowing = this.activity.complete && !this.progress.has('extra') ? ['radio', 'coffeeCup'] : this.activity.glowing;
      const pulse = .5 + .5 * Math.sin(this.time * 2.4);
      Object.entries(this.glows).forEach(([id, glow]) => {
        const target = glowing.includes(id) ? 1 : 0;
        glow.value += (target - glow.value) * (1 - Math.exp(-5 * dt));
        glow.material.uniforms.uOpacity.value = glow.value * (.28 + .55 * pulse);
      });
    }

    // Respuesta al puntero.
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
      // Los objetos secundarios se habilitan después de ponerse las gafas.
      const cup = this.props.coffeeCup.visual, cupOn = name === 'coffeeCup';
      gsap.to(cup.position, { y: cupOn ? CUP_HOVER.lift : 0, duration: .3, ease: 'power2.out', overwrite: 'auto' });
      const cupScale = cupOn ? CUP_HOVER.scale : 1;
      gsap.to(cup.scale, { x: cupScale, y: cupScale, z: cupScale, duration: .3, ease: 'power2.out', overwrite: 'auto' });
      const radioScale = name === 'radio' ? RADIO_HOVER : 1;
      gsap.to(this.props.radio.visual.scale, { x: radioScale, y: radioScale, z: radioScale, duration: .3, ease: 'power2.out', overwrite: 'auto' });
      // Amplía la ventana sobre el plano de la pared sin atravesarla.
      const windowScale = name === 'window' ? WINDOW_HOVER : 1;
      gsap.to(this.props.curiosities.window.visual.scale, { x: windowScale, y: windowScale, duration: .3, ease: 'power2.out', overwrite: 'auto' });
    }

    // Radio y taza suman el hito extra una vez; la ventana solo reproduce sonido.
    poke(name) {
      if (name === 'window') { this.audio.playEffect('window'); return; }
      this.progress.mark('extra');
      if (name === 'radio') {
        const { visual, antenna } = this.props.radio;
        if (gsap.isTweening(visual.rotation)) return;
        this.audio.playEffect('radio');
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
        this.audio.playEffect('cup');
        gsap.timeline()
          .to(cup.rotation, { y: cup.rotation.y + Math.PI * .5, duration: .9, ease: 'power2.inOut' })
          .to(cup.rotation, { x: .07, duration: .18, ease: 'sine.out' }, 0)
          .to(cup.rotation, { x: 0, duration: .55, ease: 'elastic.out(1, .45)' }, .2);
      }
    }

    // Primer paso: gafas.
    wearGlasses(done) {
      const glasses = this.props.glasses;
      gsap.to(this.visionState, { focus: 0, duration: .3, overwrite: 'auto' });
      // Retira las gafas de la mesa mientras asciende la copia en primera persona.
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
          // La vista queda nítida y la montura sale del encuadre.
          this.visionState.amount = 0;
          camera.zoom = 1;
          this.progress.mark('glasses');
          done?.();
        }
      });
    }

    // Segundo paso: maceta.
    choosePot(id, done) {
      this.audio.playEffect('pot');
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
          this.progress.mark('pot');
          done?.();
        }
      });
    }

    // Tercer paso: coloca el pico inclinado sobre la tierra de la maceta elegida.
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
      if (on) this.showProgress();
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
      this.progress.mark('watering');
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
          this.finish();
        }
      });
    }

    // Completa la escena con la barra al 100 % y la regadera en reposo.
    finish() {
      if (this.finished || !this.progress.complete || !this.activity.complete) return;
      this.finished = true;
      this.onComplete?.();
    }

    // Indicador de riego junto a la regadera.
    showProgress() {
      const bar = this.progressBar;
      if (!bar || !bar.hidden) return;
      bar.hidden = false;
      this.placeProgress();
      gsap.fromTo(bar, { autoAlpha: 0, scale: .9 }, { autoAlpha: 1, scale: 1, duration: .3, ease: 'power2.out' });
    }

    setProgress(value) {
      if (!this.progressBar) return;
      this.progressBar.style.setProperty('--progress', String(value));
      this.progressBar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    }

    placeProgress() {
      const bar = this.progressBar;
      if (!bar || bar.hidden) return;
      const can = this.props.wateringCan.root;
      const point = can.localToWorld((this.props.wateringCan.gauge || new THREE.Vector3(1.35, .9, 0)).clone()).project(this.cameraRig.camera);
      const rect = this.container.getBoundingClientRect();
      bar.style.left = `${(point.x * .5 + .5) * rect.width}px`;
      bar.style.top = `${(.5 - point.y * .5) * rect.height}px`;
    }

    // Gotas de agua.
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
        if (drop.mesh.position.y <= water.floor) { drop.alive = false; drop.mesh.visible = false; water.lastHit = this.time; }
      });
      // La regadera suena solo cuando el agua cae sobre la planta.
      this.audio.setPainting(this.time - water.lastHit < WATER_HOLD);
    }

    // Respuesta de la planta al riego.
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
      const windowVisual = this.props.curiosities.window.visual;
      gsap.killTweensOf([coffeeCup.visual.position, coffeeCup.visual.scale, radio.visual.scale, windowVisual.scale]);
      windowVisual.scale.set(1, 1, 1);
      coffeeCup.visual.position.set(0, 0, 0);
      coffeeCup.visual.scale.set(1, 1, 1);
      radio.visual.scale.set(1, 1, 1);
      this.progress.reset();
      this.finished = false;
      Object.values(this.glows).forEach(glow => { glow.value = 0; });
      this.water.drops.forEach(drop => { drop.alive = false; drop.mesh.visible = false; });
      this.water.lastHit = -Infinity;
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
      return { complete: this.finished, chosen: this.activity.chosen, progress: this.progress.value };
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
