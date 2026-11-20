(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  const PHOTO_STAGES = ['childhood', 'adulthood', 'oldage'];
  // Configura cómo cuelga cada foto sin alterar sus interacciones.
  const PHOTO_LAYOUT = Object.freeze({
    childhood: { at: .19, tilt: -.085, turn: .05, lean: .03 },
    adulthood: { at: .503, tilt: .03, turn: -.035, lean: -.015 },
    oldage: { at: .81, tilt: -.058, turn: .035, lean: .025 }
  });
  // Mide los bordes del papel desde el centro del agujero.
  const CARD = { width: 3.8, top: .16, bottom: 4.67, thickness: .085, hole: .1 };
  // La imagen comienza a topGap del agujero.
  const PHOTO = { width: 3.32, height: 4, topGap: .16 };
  // La cuerda alterna delante y detrás del papel al atravesar el agujero.
  const THREAD = { depth: .15, through: .14, release: [1.95, 2.6] };
  // Ancho del candado en las fotografías bloqueadas.
  const LOCK_SIZE = 1.5;
  // Usa la copia de la imagen en script al abrir desde disco.
  function photoAddress(source) {
    return location.protocol === 'file:' ? scriptCopy(source) : Promise.resolve(source);
  }
  // Obtiene la imagen como URL de datos desde su copia en script.
  function scriptCopy(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${source}.js`;
      script.onload = () => {
        script.remove();
        const address = app.embeddedPhotos?.[source];
        if (address) resolve(address); else reject(new Error(`${source}.js vacío`));
      };
      script.onerror = () => { script.remove(); reject(new Error(`${source}.js no disponible`)); };
      document.head.appendChild(script);
    });
  }
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, flatShading: true, ...options
  });
  const seeded = seed => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  class IntroScene {
    constructor(container, options = {}) {
      this.container = container;
      this.options = { photoSources: {}, ...options };
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xf1e4d1);
      this.cameraRig = new app.IntroCamera();
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.renderer.shadowMap.enabled = true;
      // Las sombras de varianza suavizan la luz del sol bajo.
      this.renderer.shadowMap.type = THREE.VSMShadowMap;
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);
      this.board = new THREE.Group();
      this.board.rotation.set(-.035, -.07, -.012);
      this.scene.add(this.board);
      this.photos = [];
      this.hoveredPhoto = null;
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.buildLights();
      this.buildBoard();
      this.buildRopeAndPhotos();
      this.projectWindowLight();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      this.resize();
      // El tablero estático solo se dibuja al actualizar o redimensionar.
    }

    mesh(geometry, surface, parent = this.board) {
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // Luz cálida lateral con sombras suaves de ventana y hojas.
    buildLights() {
      const ambient = new THREE.HemisphereLight(0xffe0bd, 0x93613f, 2.25);
      const sun = new THREE.SpotLight(0xffc387, 5.2, 0, .3, .45, 0);
      sun.position.set(-34.5, 11.2, 20.2);
      sun.target.position.set(.5, -.4, 0);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 20;
      sun.shadow.camera.far = 110;
      sun.shadow.bias = -.0005;
      sun.shadow.radius = 10;
      sun.shadow.blurSamples = 20;
      const fill = new THREE.DirectionalLight(0xffe4c8, .32);
      fill.position.set(9, 3, 16);
      this.scene.add(ambient, sun, sun.target, fill);
      this.lighting = {
        ambient, sun, fill,
        base: { exposure: this.renderer.toneMappingExposure, ambient: ambient.intensity, sun: sun.intensity }
      };
    }

    // Proyecta el patrón de ventana usando las esquinas del tablero vistas desde la luz.
    projectWindowLight() {
      const { sun } = this.lighting;
      this.scene.updateMatrixWorld(true);
      sun.shadow.updateMatrices(sun);
      const corner = (x, y) => {
        const point = this.board.localToWorld(new THREE.Vector3(x, y, .2)).applyMatrix4(sun.shadow.matrix);
        return { u: point.x, v: point.y };
      };
      sun.map?.dispose();
      sun.map = app.IntroTextures.windowLight({
        bottomLeft: corner(-9.5, -5.55), bottomRight: corner(9.5, -5.55),
        topLeft: corner(-9.5, 5.55), topRight: corner(9.5, 5.55)
      });
    }

    // Intensidad de la transición: 0 en reposo, 1 al entrar en el recuerdo.
    setMemoryGlow(amount) {
      const { ambient, sun, base } = this.lighting;
      this.renderer.toneMappingExposure = base.exposure * (1 + .42 * amount);
      sun.intensity = base.sun * (1 + .85 * amount);
      ambient.intensity = base.ambient * (1 + .3 * amount);
    }

    buildBoard() {
      const cork = app.IntroTextures.cork();
      const frameTexture = app.IntroTextures.frame();
      const side = material(0xae784e);
      const face = material(0xffffff, { map: cork });
      const panel = this.mesh(new THREE.BoxGeometry(19, 11.1, .4), [side, side, side, side, face, side]);
      panel.name = 'cork-board';
      const frameMaterial = material(0xffffff, { map: frameTexture });
      const frameShape = new THREE.Shape();
      frameShape.moveTo(-10, -6.05); frameShape.lineTo(10, -6.05);
      frameShape.lineTo(10, 6.05); frameShape.lineTo(-10, 6.05); frameShape.closePath();
      const inner = new THREE.Path();
      inner.moveTo(-9.42, -5.47); inner.lineTo(-9.42, 5.47);
      inner.lineTo(9.42, 5.47); inner.lineTo(9.42, -5.47); inner.closePath();
      frameShape.holes.push(inner);
      const frame = this.mesh(new THREE.ExtrudeGeometry(frameShape, {
        depth: .54, bevelEnabled: true, bevelSize: .065, bevelThickness: .065, bevelSegments: 1, steps: 1
      }), frameMaterial);
      frame.position.z = -.18; frame.name = 'warm-frame';
      // La pared recibe la luz de ventana y la sombra del tablero.
      const wall = this.mesh(new THREE.PlaneGeometry(150, 110), material(0xf3e6d3, { flatShading: false }));
      wall.position.z = -.3; wall.castShadow = false; wall.name = 'wall';
    }

    // Forma la cabuya con tres hebras, un núcleo oscuro y fibras sueltas.
    buildRope() {
      const curve = this.ropeCurve;
      const length = curve.getLength();
      const steps = Math.ceil(length / .03);
      const frames = curve.computeFrenetFrames(steps, false);
      const rope = new THREE.Group();
      rope.name = 'cabuya';
      this.board.add(rope);
      this.mesh(new THREE.TubeGeometry(curve, 160, .04, 6, false), material(0x86643f), rope).name = 'cabuya-core';
      const fibre = app.IntroTextures.jute();
      fibre.repeat.set(Math.round(length / .2), 1);
      const pitch = .46, offset = .032, radius = .036;
      [0xcb9f64, 0xb38450, 0xdcb882].forEach((color, strand) => {
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const angle = (u * length / pitch + strand / 3) * Math.PI * 2;
          points.push(curve.getPointAt(u)
            .addScaledVector(frames.normals[i], Math.cos(angle) * offset)
            .addScaledVector(frames.binormals[i], Math.sin(angle) * offset));
        }
        const path = new THREE.CatmullRomCurve3(points);
        path.arcLengthDivisions = steps * 2;
        this.mesh(new THREE.TubeGeometry(path, steps, radius, 5, false), material(color, { map: fibre }), rope).name = `cabuya-strand-${strand}`;
      });
      const next = seeded(9137);
      const hairs = [];
      for (let i = 0; i < 260; i++) {
        const u = next(), index = Math.round(u * steps);
        const around = next() * Math.PI * 2;
        const out = frames.normals[index].clone().multiplyScalar(Math.cos(around)).addScaledVector(frames.binormals[index], Math.sin(around));
        const start = curve.getPointAt(u).addScaledVector(out, .058);
        hairs.push(start, start.clone().addScaledVector(out, .025 + next() * .055).addScaledVector(frames.tangents[index], (next() - .5) * .16));
      }
      const fuzz = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hairs), new THREE.LineBasicMaterial({ color: 0xd6b483, transparent: true, opacity: .65 }));
      fuzz.name = 'cabuya-loose-fibres';
      rope.add(fuzz);
    }

    // Curva la cuerda alrededor de los agujeros de las fotografías.
    threadRope(line) {
      const smooth = THREE.MathUtils.smoothstep;
      const holes = PHOTO_STAGES.map(stage => ({ x: line.getPoint(PHOTO_LAYOUT[stage].at).x, side: Math.sign(PHOTO_LAYOUT[stage].turn) }));
      const points = line.getSpacedPoints(320);
      points.forEach(point => holes.forEach(({ x, side }) => {
        const distance = point.x - x;
        const across = 2 * smooth(distance, -THREAD.through, THREAD.through) - 1;
        point.z += side * THREAD.depth * across * (1 - smooth(Math.abs(distance), ...THREAD.release));
      }));
      return new THREE.CatmullRomCurve3(points);
    }

    cardGeometry() {
      if (this.card) return this.card;
      const half = CARD.width / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-half, -CARD.bottom);
      shape.lineTo(half, -CARD.bottom);
      shape.lineTo(half, CARD.top);
      shape.lineTo(-half, CARD.top);
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, CARD.hole, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      this.card = new THREE.ExtrudeGeometry(shape, { depth: CARD.thickness, bevelEnabled: false, curveSegments: 24 });
      this.card.translate(0, 0, -CARD.thickness / 2);
      return this.card;
    }

    buildRopeAndPhotos() {
      const line = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-9.45, 3.75, .475), new THREE.Vector3(-6, 3.02, .78),
        new THREE.Vector3(0, 2.46, .89), new THREE.Vector3(6, 3.0, .78),
        new THREE.Vector3(9.45, 3.73, .475)
      ]);
      this.ropeCurve = this.threadRope(line);
      this.buildRope();

      PHOTO_STAGES.forEach(stage => {
        const layout = PHOTO_LAYOUT[stage];
        const attachment = line.getPoint(layout.at);
        const hanging = new THREE.Group();
        hanging.position.copy(attachment);
        hanging.rotation.set(layout.lean, layout.turn, layout.tilt);
        this.board.add(hanging);
        // Escala cada foto y su cubierta desde el agujero para mantenerla colgada.
        const visual = new THREE.Group();
        hanging.add(visual);
        const paper = this.mesh(this.cardGeometry(), material(0xfff7e6), visual);
        paper.name = `photo-card-${stage}`;
        paper.userData.stage = stage;
        const texture = this.loadPhoto(stage);
        const image = this.mesh(new THREE.PlaneGeometry(PHOTO.width, PHOTO.height), material(0xffffff, { map: texture }), visual);
        image.position.set(0, -PHOTO.topGap - PHOTO.height / 2, CARD.thickness / 2 + .004);
        image.name = `photo-${stage}`;
        image.userData.stage = stage;
        const unlocked = stage === 'childhood';
        const lock = unlocked ? null : this.buildPhotoLock(visual, image.position, stage);
        this.photos.push({ stage, group: hanging, visual, image, card: paper, lock, unlocked, hoverTween: null, unlockTween: null });
      });
    }

    // Muestra el candado configurado cuando termina de cargar.
    buildPhotoLock(parent, imagePosition, stage) {
      const lock = new THREE.Group();
      lock.name = `photo-lock-${stage}`;
      lock.position.copy(imagePosition);
      lock.position.z += .025;
      parent.add(lock);
      const surface = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
      lock.userData.materials = [surface];
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(LOCK_SIZE, LOCK_SIZE), surface);
      icon.visible = false;
      lock.add(icon);
      scriptCopy(this.options.lockIcon).then(address => new THREE.ImageLoader().load(address, image => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
        surface.map = new THREE.CanvasTexture(canvas);
        surface.map.colorSpace = THREE.SRGBColorSpace;
        surface.needsUpdate = true;
        icon.visible = true;
        this.render();
      })).catch(error => console.warn('Tablero: el candado no cargó.', error));
      return lock;
    }

    loadPhoto(stage) {
      const source = this.options.photoSources[stage];
      if (!source) return app.IntroTextures.photo(stage);
      const texture = new THREE.Texture();
      texture.colorSpace = THREE.SRGBColorSpace;
      // Si falla la foto, conserva el retrato provisional.
      const fallback = error => {
        console.warn(`Tablero: ${source} no cargó; se usa el retrato provisional.`, error);
        this.photos.find(item => item.stage === stage).image.material.map = app.IntroTextures.photo(stage);
        this.render();
      };
      photoAddress(source).then(address => new THREE.ImageLoader().load(address, image => {
        texture.image = image;
        texture.needsUpdate = true;
        this.render();
      }, undefined, fallback)).catch(fallback);
      return texture;
    }

    getPhotoTarget(stage) {
      const photo = this.photos.find(item => item.stage === stage);
      if (!photo) return null;
      this.scene.updateMatrixWorld(true);
      return photo.image.getWorldPosition(new THREE.Vector3());
    }

    getChildhoodTarget() {
      return this.getPhotoTarget('childhood');
    }

    // Obtiene la inclinación de la foto para enderezar la cámara.
    getPhotoRoll(stage) {
      const photo = this.photos.find(item => item.stage === stage);
      if (!photo) return 0;
      this.scene.updateMatrixWorld(true);
      const axis = new THREE.Vector3(1, 0, 0).transformDirection(photo.image.matrixWorld);
      return Math.atan2(axis.y, axis.x);
    }

    setHoveredPhoto(stage, { immediate = false } = {}) {
      const next = this.photos.some(photo => photo.stage === stage) ? stage : null;
      if (next === this.hoveredPhoto && !immediate) return;
      this.hoveredPhoto = next;
      this.photos.forEach(photo => {
        const scale = photo.stage === next ? 1.06 : 1;
        photo.hoverTween?.kill();
        photo.hoverTween = null;
        if (immediate) {
          photo.visual.scale.setScalar(scale);
        } else {
          photo.hoverTween = gsap.to(photo.visual.scale, {
            x: scale, y: scale, z: scale, duration: .3, ease: 'power2.out',
            onUpdate: () => this.render(),
            onComplete: () => { photo.hoverTween = null; }
          });
        }
      });
      if (immediate) this.render();
    }

    clearHover(immediate = false) {
      this.setHoveredPhoto(null, { immediate });
    }

    isPhotoUnlocked(stage) {
      return this.photos.find(photo => photo.stage === stage)?.unlocked === true;
    }

    unlockPhoto(stage, { duration = 1.1, onComplete } = {}) {
      const photo = this.photos.find(item => item.stage === stage);
      if (!photo) return;
      if (photo.unlocked) { onComplete?.(); return; }
      photo.unlockTween?.kill();
      photo.unlockTween = gsap.to(photo.lock.userData.materials, {
        opacity: 0, duration, ease: 'power2.inOut',
        onUpdate: () => this.render(),
        onComplete: () => {
          photo.lock.visible = false;
          photo.unlocked = true;
          photo.unlockTween = null;
          this.render();
          onComplete?.();
        }
      });
    }

    resetPhotoLocks() {
      this.photos.forEach(photo => {
        photo.unlockTween?.kill();
        photo.unlockTween = null;
        photo.unlocked = photo.stage === 'childhood';
        if (!photo.lock) return;
        photo.lock.visible = true;
        photo.lock.userData.materials.forEach(surface => { surface.opacity = 1; });
      });
      this.render();
    }

    getPhotoStageAt(clientX, clientY, includeCard = false) {
      const bounds = this.renderer.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height || clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
      this.pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1
      );
      this.cameraRig.camera.updateMatrixWorld();
      this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.pointer, this.cameraRig.camera);
      const surfaces = includeCard ? this.photos.flatMap(photo => [photo.image, photo.card]) : this.photos.map(photo => photo.image);
      const hit = this.raycaster.intersectObjects(surfaces, false)[0];
      return hit?.object.userData.stage || null;
    }

    render() {
      this.cameraRig.update();
      this.renderer.render(this.scene, this.cameraRig.camera);
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.cameraRig.resize(width, height);
      this.renderer.setSize(width, height, false);
      this.render();
    }

    reset() {
      this.setMemoryGlow(0);
      this.clearHover(true);
      this.cameraRig.reset(); this.resize();
    }

    dispose() {
      this.resizeObserver.disconnect();
      this.photos.forEach(photo => {
        photo.hoverTween?.kill();
        photo.unlockTween?.kill();
      });
      const textures = new Set(), materials = new Set();
      this.scene.traverse(object => {
        object.geometry?.dispose();
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        surfaces.filter(Boolean).forEach(surface => { materials.add(surface); if (surface.map) textures.add(surface.map); });
      });
      textures.forEach(texture => texture.dispose());
      materials.forEach(surface => surface.dispose());
      this.lighting.sun.map?.dispose();
      this.lighting.sun.shadow.dispose();
      this.renderer.dispose();
    }
  }
  app.IntroScene = IntroScene;
})();
