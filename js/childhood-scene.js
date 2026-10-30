(() => {
  'use strict';
  const app = window.TimeExperience;
  // ► BRILLO DE LOS JUGUETES DE BLENDER: intensidad de los reflejos, color del estudio que se
  //   refleja (más oscuro = reflejos más contrastados y colores más vivos) y rugosidad máxima
  //   (0 = espejo, 1 = mate). Solo afecta a los modelos; el piso, la hoja y las luces de la
  //   escena no cambian.
  const TOY_GLOSS = { reflection: .9, studio: '#2b2420', roughness: .3 };
  // ► BRILLO DE LA CRAYOLA EN REPOSO (indica que es interactiva): color, margen alrededor de
  //   la crayola (unidades del mundo) y opacidad mínima y máxima de su pulso lento.
  const CRAYON_GLOW = { color: '#fff3c4', margin: .09, min: .22, max: .55 };
  const GLOW_VERTEX = `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const GLOW_FRAGMENT = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec3 vNormal;
    void main() {
      float rim = 1.0 - abs(normalize(vNormal).z);
      gl_FragColor = vec4(uColor, uOpacity * (.35 + .65 * rim));
    }
  `;
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
      this.addToyReflections();
      this.crayonGlow = this.buildCrayonGlow();
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
      this.cameraRig = new app.ChildhoodCamera(this.paper.position.y, { minWidth: this.toysWidth() });
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
    // The Blender toys keep the glossy look of their material preview: a soft studio
    // environment reflected only on them, with a cap on their roughness (TOY_GLOSS).
    addToyReflections() {
      const models = this.props.metadata?.models;
      if (!models) return;
      const toys = [models.rings, models.xylophone, models.crayon].filter(toy => toy?.userData.blenderModel);
      if (!toys.length) return;
      // A dark, warm studio with three small, very bright softboxes (upper left like the key
      // light, right and a strip above): crisp highlights on the plastic, but little extra
      // diffuse light, so the colours keep their strength.
      const studio = new THREE.Scene();
      studio.background = new THREE.Color(TOY_GLOSS.studio);
      const panel = new THREE.PlaneGeometry(1, 1);
      [[4, 3, 14, [-7, 9, 5]], [3, 2.5, 7, [8, 5, 6]], [6, .8, 3, [0, 10, -5]]].forEach(([width, height, power, position]) => {
        const softbox = new THREE.Mesh(panel, new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(power), side: THREE.DoubleSide }));
        softbox.scale.set(width, height, 1);
        softbox.position.set(...position);
        softbox.lookAt(0, 0, 0);
        studio.add(softbox);
      });
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.toyEnvironment = pmrem.fromScene(studio, .02).texture;
      pmrem.dispose();
      panel.dispose();
      studio.traverse(object => object.material?.dispose());
      toys.forEach(toy => toy.traverse(object => {
        const material = object.isMesh && object.material;
        if (!material?.isMeshStandardMaterial) return;
        material.envMap = this.toyEnvironment;
        material.envMapIntensity = TOY_GLOSS.reflection;
        material.roughness = Math.min(material.roughness, TOY_GLOSS.roughness);
        material.needsUpdate = true;
      }));
    }
    // A soft halo around the crayon while it rests (CRAYON_GLOW): a slightly larger copy of
    // it, drawn from behind and brighter at the silhouette, with the same margin all round
    // whatever the crayon's proportions. It never catches the pointer.
    buildCrayonGlow() {
      const crayon = this.props.crayon;
      crayon.updateMatrixWorld(true);
      const bounds = new THREE.Box3(), part = new THREE.Box3(), toCrayon = crayon.matrixWorld.clone().invert(), matrix = new THREE.Matrix4();
      crayon.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        bounds.union(part.copy(object.geometry.boundingBox).applyMatrix4(matrix.multiplyMatrices(toCrayon, object.matrixWorld)));
      });
      const material = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Color(CRAYON_GLOW.color) }, uOpacity: { value: 0 } },
        side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false
      });
      const halo = new THREE.Group();
      halo.name = 'crayon-glow';
      crayon.children.forEach(child => halo.add(child.clone()));
      halo.traverse(object => {
        if (!object.isMesh) return;
        object.material = material;
        object.castShadow = object.receiveShadow = false;
        object.raycast = () => {};
        object.renderOrder = -1;
      });
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const margin = CRAYON_GLOW.margin / crayon.scale.x;
      halo.scale.set(1 + 2 * margin / size.x, 1 + 2 * margin / size.y, 1 + 2 * margin / size.z);
      // Scaled about the crayon's centre: p' = centre + scale · (p − centre).
      halo.position.copy(center).sub(center.clone().multiply(halo.scale));
      halo.visible = false;
      crayon.add(halo);
      return { halo, material, value: 0 };
    }
    // Visible while the crayon rests and can be picked up; it fades out when it becomes the
    // tool or the palette is open. Returns true while it needs new frames.
    updateCrayonGlow(time, dt) {
      const glow = this.crayonGlow;
      const on = this.interactions.mode === 'rest' && !this.palette.open && !app.runtime.transitioning;
      glow.value += ((on ? 1 : 0) - glow.value) * (1 - Math.exp(-6 * dt));
      const pulse = .5 + .5 * Math.sin(time * 2.4);
      glow.material.uniforms.uOpacity.value = glow.value * (CRAYON_GLOW.min + (CRAYON_GLOW.max - CRAYON_GLOW.min) * pulse);
      glow.halo.visible = glow.value > .005;
      return glow.halo.visible;
    }
    // World width the camera keeps in view: every toy at both ends of the permitted yaw.
    toysWidth() {
      const maxYaw = app.Config.camera.maxYaw, models = this.props.metadata?.models || {};
      const box = new THREE.Box3();
      let half = 0;
      [models.rings, models.xylophone, this.props.crayon].forEach(toy => {
        if (!toy) return;
        box.setFromObject(toy);
        [box.min.x, box.max.x].forEach(x => [box.min.z, box.max.z].forEach(z => [-maxYaw, maxYaw].forEach(yaw => {
          half = Math.max(half, Math.abs(x * Math.cos(yaw) - z * Math.sin(yaw)));
        })));
      });
      return Math.max(21.5, 2 * half + 1);
    }
    addLights() {
      // World-space afternoon light: diagonal from the upper left, warm (amber sun, peach sky
      // and bounce) while the light on the paper stays paler, so the drawing reads untinted.
      this.scene.add(new THREE.HemisphereLight(0xffd7a4, 0xa8683a, 1.55));
      const key = new THREE.DirectionalLight(0xffb470, 1.85);
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
      const fill = new THREE.DirectionalLight(0xffcf9c, .55);
      fill.position.set(8, 9, 5); this.scene.add(fill);
      // A broad, feathered patch favours the drawing without clipping the white
      // paper or projecting a competing pattern over the crayon outlines.
      const paperLight = new THREE.SpotLight(0xffe4bd, 80, 0, .62, 1, 2);
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
      const dt = Math.min(.1, Math.max(0, (now - this.lastTime) / 1000));
      const changed = this.cameraRig.update(dt);
      this.lastTime = now;
      const glowing = this.updateCrayonGlow(now / 1000, dt);
      if ((changed || glowing || this.dirty || this.interactions.held || this.interactions.toolActive) && !document.hidden) this.render();
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
      this.interactions.restToys();
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
      this.crayonGlow.material.dispose();
      this.toyEnvironment?.dispose();
      [this.paper, this.paperBody].forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
      this.keyLight.shadow.dispose();
      this.renderer.dispose();
    }
  }
  app.ChildhoodScene = ChildhoodScene;
})();
