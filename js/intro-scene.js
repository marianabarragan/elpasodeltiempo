(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  const PHOTO_STAGES = ['childhood', 'adulthood', 'oldage'];
  // Hand-hung composition: each photograph has its own point on the rope (`at`), how far
  // it hangs below it (`drop`), its tilt (`tilt`, radians) and a slight turn/lean in depth.
  // Only these hanging transforms change; hover, locks, raycasts and camera targets keep
  // using the same meshes. Tilts stay small so the camera's cover zoom still fills the frame.
  const PHOTO_LAYOUT = Object.freeze({
    childhood: { at: .19, drop: .02, tilt: -.085, turn: .05, lean: .03 },
    adulthood: { at: .503, drop: -.12, tilt: .03, turn: -.035, lean: -.015 },
    oldage: { at: .81, drop: .2, tilt: -.058, turn: .035, lean: .025 }
  });
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
      // Variance shadow maps give the low sun wide, smooth penumbras with low contrast.
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
      // The initial scene is static: render on resize/update, not in an idle loop.
    }

    mesh(geometry, surface, parent = this.board) {
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // Late golden hour (about 5 PM): low, raking amber sunlight that enters from a window
    // outside the frame, on the left. Its cookie (projectWindowLight) adds the diffuse shadow
    // of the window bars and of a plant's leaves. A warm sky fill keeps shadows light.
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

    // Maps the window/leaf pattern onto the board: the board corners are projected into the
    // sunlight's view so the cookie is authored in board units, whatever the light position.
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

    // Transition helper: 0 = resting golden hour, 1 = the light swells into the memory.
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
      // The wall the board hangs on, in the former background tone: it catches the window
      // light and the board's soft shadow, so the sunlight reads as part of the room.
      const wall = this.mesh(new THREE.PlaneGeometry(150, 110), material(0xf3e6d3, { flatShading: false }));
      wall.position.z = -.3; wall.castShadow = false; wall.name = 'wall';
    }

    // Cabuya: three twisted strands of natural fibre around a darker core, plus a few loose
    // hairs. Flat-shaded and simplified to stay in the project's hand-painted low-poly style.
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

    buildRopeAndPhotos() {
      this.ropeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-9.45, 3.75, .475), new THREE.Vector3(-6, 3.02, .78),
        new THREE.Vector3(0, 2.46, .89), new THREE.Vector3(6, 3.0, .78),
        new THREE.Vector3(9.45, 3.73, .475)
      ]);
      this.buildRope();

      PHOTO_STAGES.forEach(stage => {
        const layout = PHOTO_LAYOUT[stage];
        const attachment = this.ropeCurve.getPoint(layout.at);
        const hanging = new THREE.Group();
        hanging.position.copy(attachment);
        hanging.rotation.set(layout.lean, layout.turn, layout.tilt);
        this.board.add(hanging);
        const width = 3.8, height = 4.75, thickness = .085;
        // Keep the rope anchor fixed, while scaling the card and its overlay about its center.
        // The card sits just behind the thicker twisted rope instead of crossing it.
        const visual = new THREE.Group();
        visual.position.set(0, -height / 2 - layout.drop, -.125);
        hanging.add(visual);
        const paper = this.mesh(new THREE.BoxGeometry(width, height, thickness), material(0xfff7e6), visual);
        paper.name = `photo-card-${stage}`;
        paper.userData.stage = stage;
        const texture = this.loadPhoto(stage);
        const image = this.mesh(new THREE.PlaneGeometry(3.32, 4.0), material(0xffffff, { map: texture }), visual);
        image.position.set(0, height / 2 - 2.24, .09 - .044);
        image.name = `photo-${stage}`;
        image.userData.stage = stage;
        const unlocked = stage === 'childhood';
        const lock = unlocked ? null : this.buildPhotoLock(visual, image.position, stage);
        this.photos.push({ stage, group: hanging, visual, image, card: paper, lock, unlocked, hoverTween: null, unlockTween: null });
      });
    }

    buildPhotoLock(parent, imagePosition, stage) {
      const lock = new THREE.Group();
      lock.name = `photo-lock-${stage}`;
      lock.position.copy(imagePosition);
      lock.position.z += .025;
      parent.add(lock);
      const ink = new THREE.MeshBasicMaterial({ color: 0x161616, transparent: true, depthWrite: false });
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
      lock.userData.materials = [ink, white];
      const add = (geometry, surface, z, y = 0) => {
        const part = new THREE.Mesh(geometry, surface);
        part.position.set(0, y, z);
        lock.add(part);
      };
      const shackle = (outer, inner) => {
        const shape = new THREE.Shape();
        shape.moveTo(-outer, 0);
        shape.lineTo(-outer, .28);
        shape.absarc(0, .28, outer, Math.PI, 0, true);
        shape.lineTo(outer, 0);
        shape.lineTo(inner, 0);
        shape.lineTo(inner, .28);
        shape.absarc(0, .28, inner, 0, Math.PI, false);
        shape.lineTo(-inner, 0);
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      };
      const body = (width, height, radius) => {
        const x = -width / 2, y = -height / 2;
        const shape = new THREE.Shape();
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
        return new THREE.ShapeGeometry(shape);
      };
      add(shackle(.29, .17), ink, 0);
      add(shackle(.26, .20), white, .002);
      add(body(.78, .60, .065), ink, .004, -.15);
      add(body(.71, .53, .04), white, .006, -.15);
      add(new THREE.CircleGeometry(.058, 20), ink, .008, -.11);
      add(new THREE.PlaneGeometry(.055, .11), ink, .008, -.18);
      return lock;
    }

    loadPhoto(stage) {
      const source = this.options.photoSources[stage];
      if (source) {
        const texture = new THREE.TextureLoader().load(source, () => this.render());
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      }
      return app.IntroTextures.photo(stage);
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

    // On-screen tilt of a photograph (radians), so the camera can straighten onto it.
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
