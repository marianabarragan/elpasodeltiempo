(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► COLORES del reloj de arena provisional (solo si el de Blender no carga).
  const COLORS = {
    wood: 0xdaa66a, glass: 0xfdf2d6, sand: 0xf9b421, vine: 0x8c6e2d,
    leafLight: '#c3cf80', leaf: '#aebe69', leafDark: '#597a06',
    violetCore: '#2a0d4a', violetDeep: '#3d1766', violet: '#592e8e', violetEdge: '#7d5bb5',
    lilacCore: '#f6f1ff', lilac: '#9b88c9', lilacTip: '#b9a9e3'
  };
  // ► LUZ DE LA ARENA: color de la luz cálida que da al reloj (madera, enredadera y flores), del
  //   resplandor alrededor de la arena, y sus intensidades. Todo se multiplica por
  //   Config.intro.hourglass.glow.
  const WARM = { light: 0xffae45, haloColor: 0xff8f24, sandGlow: .95, lamp: 5, halo: .3 };
  const TAU = Math.PI * 2;
  // Provisional hourglass measures (units): each bulb is GLASS_HALF tall with the neck at y = 0;
  // the caps (CAP_T thick, CAP_R radius) close it and three turned posts stand at POST_R from the
  // axis. The Blender hourglass is brought to the same bulb height (js/intro-models.js).
  const GLASS_HALF = 2.3, CAP_T = .6, CAP_R = 1.85, POST_R = 1.5;
  // Bulb outline (radius, height) from the neck to the cap; the lower bulb mirrors it.
  const BULB = [[.1, 0], [.13, .12], [.28, .38], [.55, .75], [.83, 1.12], [1.02, 1.5], [1.08, 1.8], [1.05, 2.05], [.94, 2.22], [.86, 2.3]];
  const PROFILE = new THREE.SplineCurve(BULB.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48);
  // Provisional sand at the start, as in the illustration: little left on top, lower bulb almost full.
  const PROVISIONAL_SAND = { top: .79, bottom: -.98, mound: .13 };
  // Sand shape: gap to the glass wall, depth of the crater on top (share of its radius) and the
  // falling stream and grains. It drains for Config.intro.hourglass.drainSeconds while the cover
  // is on screen (keeping its amount: what leaves the top bulb fills the bottom one) and stops.
  const SAND = { wall: .04, crater: .35, stream: .026, grain: .03 };
  // Idle sway (radians, seconds) and how much the pointer tilts the hourglass.
  const SWAY = { yaw: .12, period: 16 }, POINTER_TILT = { x: .07, y: .16 };
  const ELEVATION = 11 * Math.PI / 180;
  // Share of the canvas the model may use: height (as in the illustration) and width.
  const FIT = { height: .86, width: .8 };
  // Offset of the point the camera aims at from the middle of the hourglass.
  const AIM_Y = -.25;
  // Turning over (reflection of the closing): duration (s), how much it shrinks and rises while
  // it turns, as if lifted by hand, and the share of the turn in which the sand slides to the
  // other end of each bulb.
  const FLIP = { duration: 1.8, dip: .26, lift: .3, slide: [.2, .85] };
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const seeded = seed => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const v2 = (r, y) => new THREE.Vector2(r, y);

  // Inner radius of the provisional glass at height y (both bulbs).
  function bulbRadius(y) {
    y = Math.min(GLASS_HALF, Math.abs(y));
    for (let i = 1; i < PROFILE.length; i++) {
      const a = PROFILE[i - 1], b = PROFILE[i];
      if (y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1e-6, b.y - a.y);
    }
    return PROFILE[PROFILE.length - 1].x;
  }

  // Linear interpolation in a table with increasing xs.
  function interpolate(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / Math.max(1e-9, xs[i] - xs[i - 1]);
    }
    return ys[ys.length - 1];
  }

  // Sand volume of a bulb between `from` and each height up to `to` (from < to), and the
  // height that holds a given volume.
  function bulbVolume(radius, from, to, steps = 160) {
    const heights = [from], volumes = [0], step = (to - from) / steps;
    for (let i = 1; i <= steps; i++) {
      const r = radius(from + step * (i - .5));
      heights.push(from + step * i);
      volumes.push(volumes[i - 1] + Math.PI * r * r * step);
    }
    return { at: level => interpolate(heights, volumes, level), level: volume => interpolate(volumes, heights, volume) };
  }

  // Canvas texture drawn in a 128 × 256 box (base at the bottom, tip at the top).
  function paintTexture(draw, width = 128, height = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  // Soft round glow: full at the centre, fading to nothing at the edge.
  function haloTexture() {
    return paintTexture((g, w, h) => {
      const fill = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      fill.addColorStop(0, 'rgba(255,255,255,1)'); fill.addColorStop(.25, 'rgba(255,255,255,.55)');
      fill.addColorStop(.6, 'rgba(255,255,255,.14)'); fill.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fill; g.fillRect(0, 0, w, h);
    }, 128, 128);
  }

  function leafTexture() {
    return paintTexture(g => {
      const outline = new Path2D('M64 252 C8 206 0 86 64 4 C128 86 120 206 64 252 Z');
      const fill = g.createLinearGradient(20, 256, 108, 0);
      fill.addColorStop(0, '#93ad4c'); fill.addColorStop(.55, COLORS.leaf); fill.addColorStop(1, COLORS.leafLight);
      g.fillStyle = fill; g.fill(outline);
      g.save(); g.clip(outline);
      g.fillStyle = 'rgba(89,122,6,.16)'; g.fillRect(64, 0, 64, 256);
      g.strokeStyle = COLORS.leafDark; g.lineCap = 'round';
      g.lineWidth = 4.5; g.beginPath(); g.moveTo(64, 252); g.quadraticCurveTo(60, 128, 64, 12); g.stroke();
      g.lineWidth = 2.4;
      for (let i = 0; i < 6; i++) {
        const y = 214 - i * 33, reach = 44 - i * 5;
        g.beginPath();
        g.moveTo(63, y); g.quadraticCurveTo(63 - reach * .55, y - 12, 63 - reach, y - 34);
        g.moveTo(65, y); g.quadraticCurveTo(65 + reach * .55, y - 12, 65 + reach, y - 34);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = 'rgba(89,122,6,.6)'; g.lineWidth = 2.5; g.stroke(outline);
    });
  }

  // Violet: broad rounded petal, dark at the heart and lighter at the edge.
  function violetPetalTexture() {
    return paintTexture(g => {
      const outline = new Path2D('M64 254 C14 214 -4 92 22 30 C34 4 56 6 64 22 C72 6 94 4 106 30 C132 92 114 214 64 254 Z');
      const fill = g.createRadialGradient(64, 254, 4, 64, 254, 250);
      fill.addColorStop(0, COLORS.violetCore); fill.addColorStop(.3, COLORS.violetDeep);
      fill.addColorStop(.62, COLORS.violet); fill.addColorStop(1, COLORS.violetEdge);
      g.fillStyle = fill; g.fill(outline);
      g.save(); g.clip(outline);
      g.strokeStyle = 'rgba(32,8,58,.35)'; g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath(); g.moveTo(64, 250); g.quadraticCurveTo(64 + i * 9, 150, 64 + i * 17, 40); g.stroke();
      }
      g.restore();
    });
  }

  // Star flower (borage-like): pointed lilac petal with a pale base.
  function starPetalTexture() {
    return paintTexture(g => {
      const outline = new Path2D('M64 254 C16 196 20 82 64 2 C108 82 112 196 64 254 Z');
      const fill = g.createLinearGradient(0, 256, 0, 0);
      fill.addColorStop(0, COLORS.lilacCore); fill.addColorStop(.2, '#d4c9f0');
      fill.addColorStop(.45, COLORS.lilac); fill.addColorStop(1, COLORS.lilacTip);
      g.fillStyle = fill; g.fill(outline);
      g.save(); g.clip(outline);
      g.strokeStyle = 'rgba(86,66,150,.45)'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(64, 230); g.lineTo(64, 20); g.stroke();
      g.restore();
    });
  }

  // Plane (base at the origin, pointing +y, facing +z) bent into a gentle cup and curl.
  function bentPlane(width, length, cup, curl) {
    const geometry = new THREE.PlaneGeometry(width, length, 6, 10);
    geometry.translate(0, length / 2, 0);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) / (width / 2), y = position.getY(i) / length;
      position.setZ(i, cup * x * x * Math.sin(Math.PI * Math.min(1, y * 1.15)) + curl * y * y);
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * 3D hourglass of the start cover and of the closing reflection: the Blender model of
   * js/intro-models.js (or, if it does not load, a provisional one with purple flowers). Its
   * golden sand glows and falls through the neck, and its warm light reaches the frame, the vine
   * and, through `--sand-x/y/size` on the container (.hourglass-stage in styles.css), the page
   * around it. It sways slowly, leans towards the pointer over `cover` and only renders while
   * `cover` is visible; each time it comes back the sand starts again.
   * - overflow: extra canvas on each side, as a share of the container's width, so the hourglass
   *   (framed for the container) is not cut while it turns over.
   * - flipAfter: seconds on screen before it turns over once (null: never).
   * - fit: share of the container's height and width the hourglass may use (FIT by default).
   */
  class IntroHourglass {
    constructor(container, { cover = container.closest('.intro-copy'), overflow = 0, flipAfter = null, fit = FIT } = {}) {
      this.container = container;
      this.cover = cover;
      this.overflow = overflow;
      this.fit = fit;
      this.flipAfter = flipAfter;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.settings = { drainSeconds: 90, glow: 1, ...app.Config?.intro?.hourglass };
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(24, 1, .5, 80);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      if (overflow > 0) {
        Object.assign(this.renderer.domElement.style, { position: 'absolute', top: '0', left: `${-overflow * 100}%`, width: `${(1 + 2 * overflow) * 100}%` });
      }
      container.appendChild(this.renderer.domElement);

      this.root = new THREE.Group();     // float and pointer tilt
      this.turn = new THREE.Group();     // turning over, around the neck
      this.spin = new THREE.Group();     // idle sway around the axis
      this.shine = new THREE.Group();    // glass highlights: tilt with the root, never sway or turn
      this.turn.add(this.spin);
      this.root.add(this.turn, this.shine);
      this.scene.add(this.root);
      this.random = seeded(20261021);
      this.time = 0;
      this.drain = 0;
      this.flip = null;
      this.built = false;
      this.buildLights();

      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      this.hidden = true;
      this.last = performance.now();
      this.onPointerMove = event => {
        if (event.pointerType === 'touch') return;
        this.pointer.tx = event.clientX / window.innerWidth * 2 - 1;
        this.pointer.ty = event.clientY / window.innerHeight * 2 - 1;
      };
      this.onPointerLeave = () => { this.pointer.tx = this.pointer.ty = 0; };
      (cover || container).addEventListener('pointermove', this.onPointerMove);
      (cover || container).addEventListener('pointerleave', this.onPointerLeave);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);

      // The Blender hourglass as soon as it has loaded; the provisional one if it does not load.
      const models = app.IntroModels;
      const build = () => {
        try {
          if (models?.template) this.useModel(models.template);
          else this.buildProvisional();
        } catch (error) {
          console.warn('Portada: el reloj de arena de Blender no se pudo armar; se usa el provisional.', error);
          this.spin.clear(); this.shine.clear();
          this.buildProvisional();
        }
        this.built = true;
        this.measure();
        this.resize();
        container.classList.add('is-lit');
      };
      if (models?.status === 'loading') models.settled.then(build);
      else build();
      this.tick = this.tick.bind(this);
      this.frame = requestAnimationFrame(this.tick);
    }

    // Soft daylight balanced so the surfaces keep their colours: lit tops show the base colour
    // and the sides facing the viewer a darker shade. The sand adds its warm light (buildGlow).
    buildLights() {
      const sky = new THREE.HemisphereLight(0xfffaf0, 0xc9da9c, .9);
      const key = new THREE.DirectionalLight(0xfff4e4, 2.35);
      key.position.set(-3, 10, 4);
      const front = new THREE.DirectionalLight(0xffffff, .85);
      front.position.set(0, 2, 10);
      const rim = new THREE.DirectionalLight(0xf4ffe6, .5);
      rim.position.set(6, 3, -5);
      this.scene.add(sky, key, front, rim);
    }

    mesh(geometry, material, parent = this.spin) {
      const mesh = new THREE.Mesh(geometry, material);
      parent.add(mesh);
      return mesh;
    }

    // ---------- Blender hourglass ----------
    useModel({ group, glass, sand }) {
      const model = group.clone();
      this.spin.add(model);
      // Clear glass, so the glowing sand reads through it, with the same white reflections as
      // the provisional glass.
      const mesh = model.getObjectByName(glass.name);
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: .06, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide
      });
      mesh.renderOrder = 2;
      this.addReflections(glass.radius, glass.top);
      this.buildSand(glass, sand, sand.color);
    }

    // ---------- Provisional hourglass ----------
    buildProvisional() {
      this.buildFrame();
      this.buildGlass();
      this.buildVine();
      this.buildSand({ radius: bulbRadius, bottom: -GLASS_HALF, top: GLASS_HALF }, PROVISIONAL_SAND, COLORS.sand);
    }

    buildFrame() {
      const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: .86 });
      // Caps: thick discs with rounded edges (profile from the bottom face to the top face).
      const half = CAP_T / 2, bevel = .1;
      const capProfile = [
        v2(0, -half), v2(CAP_R - bevel, -half), v2(CAP_R - bevel * .3, -half + bevel * .3), v2(CAP_R, -half + bevel),
        v2(CAP_R, half - bevel), v2(CAP_R - bevel * .3, half - bevel * .3), v2(CAP_R - bevel, half), v2(0, half)
      ];
      const capGeometry = new THREE.LatheGeometry(capProfile, 72);
      for (const sign of [1, -1]) this.mesh(capGeometry, wood).position.y = sign * (GLASS_HALF + half);
      // Turned posts with beads near the caps, two rings and a bead in the middle.
      const h = GLASS_HALF;
      const postProfile = [
        [0, -h], [.2, -h], [.2, -h + .1], [.13, -h + .18], [.17, -h + .36], [.11, -h + .52], [.095, -1.2], [.135, -1.05], [.095, -.9],
        [.09, -.26], [.15, -.12], [.15, .12], [.09, .26], [.095, .9], [.135, 1.05], [.095, 1.2], [.11, h - .52], [.17, h - .36], [.13, h - .18], [.2, h - .1], [.2, h], [0, h]
      ].map(([r, y]) => v2(r, y));
      const postGeometry = new THREE.LatheGeometry(postProfile, 18);
      // Two posts flank the glass at the front and the third stands behind it.
      for (const angle of [-70, 70, 180]) {
        const a = angle * Math.PI / 180;
        this.mesh(postGeometry, wood).position.set(Math.sin(a) * POST_R, 0, Math.cos(a) * POST_R);
      }
    }

    buildGlass() {
      const outline = [...PROFILE.slice().reverse().map(p => v2(p.x, -p.y)), ...PROFILE.slice(1).map(p => v2(p.x, p.y))];
      const geometry = new THREE.LatheGeometry(outline, 72);
      // The glass reads cream: its far inner wall is an opaque cream backdrop (the sand stands out
      // against it) and the near wall only adds a light sheen.
      this.mesh(geometry, new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.glass).multiplyScalar(.35), emissive: COLORS.glass, emissiveIntensity: .8,
        roughness: .9, side: THREE.BackSide
      }));
      this.mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: .08, transparent: true, opacity: .1, depthWrite: false
      })).renderOrder = 2;
      this.addReflections(bulbRadius, GLASS_HALF);
    }

    // Two white reflections on the left of each bulb, just outside the glass of radius `radius`.
    addReflections(radius, top) {
      const shine = this.shineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide });
      const strip = (from, to) => {
        const points = [];
        for (let i = 0; i <= 16; i++) {
          const y = from + (to - from) * i / 16;
          points.push(v2(radius(y) + .012, y));
        }
        return points;
      };
      const k = top / GLASS_HALF;
      for (const sign of [1, -1]) {
        const [a, b] = (sign > 0 ? [.55, 2.05] : [-2.05, -.55]).map(y => y * k);
        this.mesh(new THREE.LatheGeometry(strip(a, b), 6, -1.02, .2), shine, this.shine).renderOrder = 3;
        this.mesh(new THREE.LatheGeometry(strip(a + .25 * sign * k, b - .3 * sign * k), 3, -.72, .06), shine, this.shine).renderOrder = 3;
      }
    }

    buildVine() {
      // Main stem: from behind the lower right, across the lower bulb, round the left post,
      // behind the glass and up to the large violet over the upper right corner.
      const path = new THREE.CatmullRomCurve3([
        [1.62, -2.24, -.55], [1.3, -2.2, .78], [.45, -1.95, 1.18], [-.5, -1.55, 1.1], [-1.22, -1.05, .82],
        [-1.36, -.35, .22], [-.92, .42, -.78], [.2, .95, -1.05], [1.1, 1.32, -.24], [1.22, 1.82, .76], [1.52, 1.86, 1.12]
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      // Short sprig that hangs in front of the neck on the right.
      const sprig = new THREE.CatmullRomCurve3([[1.08, 1.3, -.1], [.95, 1.0, .5], [.62, .66, .72], [.42, .4, .62]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const stem = new THREE.MeshStandardMaterial({ color: COLORS.vine, roughness: .8 });
      this.mesh(new THREE.TubeGeometry(path, 180, .045, 7, false), stem);
      this.mesh(new THREE.TubeGeometry(sprig, 40, .03, 6, false), stem);

      this.leafMaterial = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: .5, side: THREE.DoubleSide, roughness: .75 });
      this.leafGeometry = bentPlane(.6, 1, .08, .16);
      const random = this.random;
      // Leaves along the stem, alternating sides and turned outwards and towards the viewer.
      for (let i = 0; i < 24; i++) {
        const t = .03 + i * .04 + (random() - .5) * .015;
        const side = i % 2 ? 1 : -1;
        this.addLeafOnCurve(path, t, side, .48 + random() * .24);
      }
      [.2, .42, .64, .84, .99].forEach((t, i) => this.addLeafOnCurve(sprig, t, i % 2 ? 1 : -1, .4 + random() * .14));
      // Leaves that drape over the front edge of the lower cap and round the large violet.
      const leaves = [
        [[.55, -2.24, 1.66], [.35, -1, .35], .66], [[1.0, -2.25, 1.45], [.65, -.9, .45], .58], [[.1, -2.22, 1.72], [-.4, -.95, .45], .52],
        [[1.18, 2.02, 1.12], [-.75, .55, .35], .55], [[1.95, 1.48, .88], [.85, -.5, .2], .52], [[-1.32, -.48, .62], [.35, .9, .3], .58],
        [[-1.2, -1.15, .95], [-.9, -.35, .3], .55], [[-1.0, -1.5, 1.05], [.25, -.95, .35], .5]
      ];
      for (const [at, dir, size] of leaves) this.addLeaf(new THREE.Vector3(...at), new THREE.Vector3(...dir), size, 0);

      // Purple flowers on the left, a large violet over the upper right corner and lilac stars.
      this.petals = {
        violet: { geometry: bentPlane(.88, 1, .1, .1), material: new THREE.MeshStandardMaterial({ map: violetPetalTexture(), alphaTest: .5, side: THREE.DoubleSide, roughness: .6 }) },
        star: { geometry: bentPlane(.56, 1, .05, .06), material: new THREE.MeshStandardMaterial({ map: starPetalTexture(), alphaTest: .5, side: THREE.DoubleSide, roughness: .6 }) }
      };
      const flowers = [
        ['violet', [1.66, 1.78, 1.3], [.32, -.12, 1], .7],
        ['violet', [-1.3, -1.32, 1.12], [-.35, .05, 1], .46],
        ['star', [-1.66, -.78, .82], [-.45, .15, 1], .4],
        ['star', [1.32, -2.0, 1.12], [.35, -.05, 1], .38],
        ['star', [-.55, .62, -.95], [-.2, .2, 1], .26]
      ];
      for (const [kind, at, facing, radius] of flowers) this.addFlower(kind, new THREE.Vector3(...at), new THREE.Vector3(...facing), radius);
    }

    addLeafOnCurve(curve, t, side, size) {
      const at = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const outward = new THREE.Vector3(at.x, 0, at.z).normalize();
      const across = new THREE.Vector3().crossVectors(tangent, outward).normalize();
      const dir = tangent.multiplyScalar(.35).addScaledVector(across, side * .9).addScaledVector(outward, .4);
      this.addLeaf(at, dir, size);
    }

    // Leaf with its base at `at`, pointing along `dir`, facing outwards and towards the viewer.
    addLeaf(at, dir, size, twist = (this.random() - .5) * .5) {
      const y = dir.clone().normalize();
      const facing = new THREE.Vector3(at.x, 0, at.z).normalize().multiplyScalar(.6).add(new THREE.Vector3(0, .15, .85));
      const z = facing.addScaledVector(y, -facing.dot(y)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      const leaf = this.mesh(this.leafGeometry, this.leafMaterial);
      leaf.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      leaf.rotateY(twist);
      leaf.position.copy(at);
      leaf.scale.setScalar(size);
    }

    addFlower(kind, at, facing, radius) {
      const { geometry, material } = this.petals[kind];
      const flower = new THREE.Group();
      const turn = this.random() * TAU;
      for (let i = 0; i < 5; i++) {
        const pivot = new THREE.Group();
        pivot.rotation.z = turn + i * TAU / 5;
        const petal = new THREE.Mesh(geometry, material);
        // Each petal opens a little differently and sits at its own depth (no flicker).
        petal.rotation.x = (kind === 'violet' ? .2 : -.06) + i * .025;
        petal.position.z = i * .012;
        pivot.add(petal);
        flower.add(pivot);
      }
      if (kind === 'violet') {
        this.mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf3e9c8, roughness: .6 }), flower).position.z = .07;
      } else {
        this.mesh(new THREE.CircleGeometry(.16, 5), new THREE.MeshStandardMaterial({ color: 0xfbf7ff, roughness: .6, side: THREE.DoubleSide }), flower).position.z = .07;
        const cone = this.mesh(new THREE.ConeGeometry(.08, .22, 10), new THREE.MeshStandardMaterial({ color: 0x3b2440, roughness: .5 }), flower);
        cone.rotation.x = Math.PI / 2; cone.position.z = .17;
      }
      flower.lookAt(facing.normalize());
      flower.position.copy(at);
      flower.scale.setScalar(radius);
      this.spin.add(flower);
    }

    // ---------- Sand ----------
    // Glowing sand inside `glass` ({ radius(y), bottom, top }, neck at y = 0), starting at the
    // levels of `start` ({ top, bottom, mound }): a pile in each bulb, the stream and its grains,
    // plus the halos and the warm lights it casts (buildGlow). It lives in `sandFrame`, which is
    // mirrored when the hourglass turns over, so the sand's top bulb is always the upper one.
    buildSand(glass, start, color) {
      this.sandFrame = new THREE.Group();
      this.spin.add(this.sandFrame);
      this.sand = { glass, start };
      // It shines with its own deeper gold, so the daylight never washes it out to white.
      const glow = this.settings.glow, gold = new THREE.Color(color);
      this.sandMaterial = new THREE.MeshStandardMaterial({
        color: gold.clone().multiplyScalar(.22), emissive: gold.clone().lerp(new THREE.Color(0xff9d1c), .62),
        emissiveIntensity: WARM.sandGlow * glow, roughness: .95, side: THREE.DoubleSide
      });
      this.topSand = this.mesh(new THREE.BufferGeometry(), this.sandMaterial, this.sandFrame);
      this.bottomSand = this.mesh(new THREE.BufferGeometry(), this.sandMaterial, this.sandFrame);
      // Thin falling stream plus a few grains that run down it.
      this.stream = this.mesh(new THREE.CylinderGeometry(SAND.stream, SAND.stream, 1, 10, 1, true), this.sandMaterial, this.sandFrame);
      const grainGeometry = new THREE.SphereGeometry(SAND.grain, 8, 6);
      this.grains = Array.from({ length: 9 }, (_, i) => {
        const grain = this.mesh(grainGeometry, this.sandMaterial, this.sandFrame);
        grain.userData = { offset: i / 9, drift: (this.random() - .5) * .03 };
        return grain;
      });
      this.buildGlow(glass);
      this.resetSand();
    }

    // The sand's light: a soft halo over each pile and the stream, and a warm point light in each
    // bulb that lights the frame, the vine and the flowers from inside.
    buildGlow(glass) {
      const texture = haloTexture(), width = Math.max(glass.radius(glass.top * .6), glass.radius(glass.bottom * .6));
      const halo = (opacity, size) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture, color: WARM.haloColor, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        sprite.scale.setScalar(size * width);
        sprite.renderOrder = 4;
        sprite.userData.opacity = opacity;
        this.sandFrame.add(sprite);
        return sprite;
      };
      const lamp = () => {
        const light = new THREE.PointLight(WARM.light, 0, 0, 2);
        this.sandFrame.add(light);
        return light;
      };
      this.glow = {
        halos: { bottom: halo(WARM.halo, 3), top: halo(WARM.halo, 2.6), stream: halo(WARM.halo * .8, 1.4) },
        lamps: { bottom: lamp(), top: lamp() },
        width, level: 1
      };
    }

    // Sand back to its starting amounts, with the hourglass upright.
    resetSand() {
      const sand = this.sand, { start } = sand;
      this.flip = null;
      this.flipped = false;
      this.turn.rotation.z = 0;
      this.turn.scale.setScalar(1);
      this.turn.position.y = 0;
      if (this.shineMaterial) this.shineMaterial.opacity = .78;
      this.orient(1);
      sand.volume = { top: sand.tables.top.at(Math.max(0, start.top)), bottom: sand.tables.bottom.at(start.bottom) };
      sand.total = sand.volume.top + sand.volume.bottom;
      sand.mound = start.mound;
      sand.grown = 1;
      this.drain = 0;
      this.updateSand(0);
    }

    // The glass as the sand sees it (in sandFrame): `sign` 1 upright, -1 turned over (the frame is
    // mirrored, so its top bulb is the one that is up).
    orient(sign) {
      const sand = this.sand, { glass } = sand;
      const radius = y => Math.max(.02, glass.radius(y * sign) - SAND.wall);
      const bottom = sign > 0 ? glass.bottom : -glass.top, top = sign > 0 ? glass.top : -glass.bottom;
      this.sandFrame.scale.y = sign;
      this.topSand.userData.key = this.bottomSand.userData.key = null;
      Object.assign(sand, { sign, radius, bottom, top, tables: { top: bulbVolume(radius, 0, top), bottom: bulbVolume(radius, bottom, 0) } });
    }

    // A pile of sand as a lathe: up the glass wall from `low` to `high`, then a mound (`bump` > 0)
    // or a crater (`bump` < 0) in the middle of its surface. Rebuilt only when it changes.
    shapeSand(mesh, low, high, bump) {
      mesh.visible = high - low + Math.max(0, bump) > .02;
      const key = [low, high, bump].map(value => Math.round(value * 300)).join();
      if (!mesh.visible || mesh.userData.key === key) return;
      mesh.userData.key = key;
      const radius = this.sand.radius, points = [v2(.001, low)];
      for (let i = 0; i <= 14; i++) { const y = low + (high - low) * i / 14; points.push(v2(radius(y), y)); }
      const rim = radius(high), mound = bump > 0;
      points.push(v2(rim * (mound ? .5 : .55), high + bump * (mound ? .6 : .45)), v2(.001, high + bump));
      mesh.geometry.dispose();
      mesh.geometry = new THREE.LatheGeometry(points, 44);
    }

    // Levels for `progress` (0–1 of the drain): what leaves the top bulb fills the bottom one. The
    // falling sand opens a crater on top and, after turning over, builds up its mound below.
    updateSand(progress) {
      const sand = this.sand, { tables, volume } = sand;
      const left = volume.top * (1 - progress), pile = volume.bottom + volume.top * progress;
      const top = tables.top.level(left);
      const bottom = Math.min(-.06, tables.bottom.level(pile));
      const mound = sand.mound * Math.min(1, sand.grown + progress * 8);
      const crater = Math.min(Math.max(0, top - .04), SAND.crater * sand.radius(top) * Math.min(1, progress * 8));
      this.shapeSand(this.topSand, .03, top, -crater);
      this.shapeSand(this.bottomSand, sand.bottom + .02, bottom, mound);
      // The stream runs from the neck to the top of the mound while there is sand above.
      const flowing = progress < 1 && this.topSand.visible;
      const peak = bottom + mound, length = Math.max(0, -peak);
      this.stream.visible = flowing;
      this.stream.scale.y = Math.max(length, 1e-3);
      this.stream.position.y = peak / 2;
      this.grains.forEach(grain => {
        grain.visible = flowing && !this.reduced;
        const t = (grain.userData.offset + this.time * .9) % 1;
        grain.position.set(grain.userData.drift * t, -t * length, 0);
      });
      this.placeGlow([.03, top, left], [sand.bottom + .02, bottom, pile], flowing ? peak : null);
    }

    // While it turns over, the sand of each bulb slides to the other end of it (`slide` 0 → 1),
    // keeping its amount: the pile goes to the neck (it will be the sand on top) and what was left
    // on top goes to the far cap (it will be the pile). Its mound and crater flatten out.
    updateSlide(slide) {
      const sand = this.sand, { tables, volume } = sand, progress = this.drain;
      const left = volume.top * (1 - progress), pile = volume.bottom + volume.top * progress;
      const neck = .03, base = sand.bottom + .02, cap = sand.top - .02;
      const pileLow = THREE.MathUtils.lerp(base, tables.bottom.level(tables.bottom.at(-neck) - pile), slide);
      const pileHigh = Math.min(-neck, tables.bottom.level(tables.bottom.at(pileLow) + pile));
      const topLow = THREE.MathUtils.lerp(neck, tables.top.level(tables.top.at(cap) - left), slide);
      const topHigh = Math.min(cap, tables.top.level(tables.top.at(topLow) + left));
      const top = tables.top.level(left);
      const crater = Math.min(Math.max(0, top - .04), SAND.crater * sand.radius(top) * Math.min(1, progress * 8));
      const mound = sand.mound * Math.min(1, sand.grown + progress * 8);
      this.shapeSand(this.topSand, topLow, topHigh, -crater * (1 - slide));
      this.shapeSand(this.bottomSand, pileLow, pileHigh, mound * (1 - slide));
      this.stream.visible = false;
      this.grains.forEach(grain => { grain.visible = false; });
      this.placeGlow([topLow, topHigh, left], [pileLow, pileHigh, pile], null);
    }

    // Light follows the sand: each halo and lamp sits on its pile ([low, high, amount]) and glows
    // with its amount; the stream's halo runs from the neck down to `peak` while it flows.
    placeGlow(top, bottom, peak) {
      const { halos, lamps, level, width } = this.glow, glow = this.settings.glow * level, total = this.sand.total;
      const weight = amount => Math.min(1, Math.sqrt(Math.max(0, amount) / (.1 * total)));
      for (const [name, [low, high, amount]] of [['top', top], ['bottom', bottom]]) {
        halos[name].position.y = lamps[name].position.y = (low + high) / 2;
        halos[name].material.opacity = halos[name].userData.opacity * glow * weight(amount);
        lamps[name].intensity = WARM.lamp * glow * weight(amount);
      }
      const stream = halos.stream;
      stream.visible = peak !== null;
      if (stream.visible) {
        stream.position.y = peak / 2;
        stream.scale.set(width * .9, Math.max(-peak, 1e-3) * 1.1, 1);
        stream.material.opacity = stream.userData.opacity * glow;
      }
      this.sandMaterial.emissiveIntensity = WARM.sandGlow * glow;
    }

    // ---------- Turning over ----------
    // Around the neck (FLIP): it shrinks and rises a little, as if lifted by hand, while the sand
    // slides inside; the light reflections fade out meanwhile.
    updateFlip(dt) {
      const flip = this.flip;
      flip.t = Math.min(1, flip.t + dt / FLIP.duration);
      const arc = Math.sin(Math.PI * flip.t);
      this.turn.rotation.z = flip.from - Math.PI * easeInOut(flip.t);
      this.turn.scale.setScalar(1 - FLIP.dip * arc);
      this.turn.position.y = FLIP.lift * arc;
      if (this.shineMaterial) this.shineMaterial.opacity = .78 * (1 - Math.min(1, arc * 3));
      this.updateSlide(THREE.MathUtils.smoothstep(flip.t, ...FLIP.slide));
      if (flip.t >= 1) this.finishFlip();
    }

    // End of the turn: the sand's frame is mirrored so its top bulb is the upper one again; the
    // pile becomes the sand on top and starts falling again.
    finishFlip() {
      const sand = this.sand, progress = this.drain;
      const left = sand.volume.top * (1 - progress), pile = sand.volume.bottom + sand.volume.top * progress;
      this.orient(-sand.sign);
      sand.volume = { top: pile, bottom: left };
      sand.grown = 0;
      this.drain = 0;
      this.flip = null;
      this.turn.scale.setScalar(1);
      this.turn.position.y = 0;
      if (this.shineMaterial) this.shineMaterial.opacity = .78;
      this.updateSand(0);
    }

    // Model extent over the whole sway, used to frame the camera: only the hourglass's meshes, not
    // the halos of its sand.
    measure() {
      const box = new THREE.Box3(), part = new THREE.Box3();
      for (const yaw of [-SWAY.yaw, 0, SWAY.yaw]) {
        this.spin.rotation.y = yaw;
        this.root.updateMatrixWorld(true);
        this.spin.traverse(object => { if (object.isMesh) box.union(part.setFromObject(object, true)); });
      }
      this.spin.rotation.y = 0;
      this.aimY = (box.min.y + box.max.y) / 2 + AIM_Y;
      this.extent = {
        halfWidth: Math.max(-box.min.x, box.max.x) * 1.04,
        halfHeight: Math.max(this.aimY - box.min.y, box.max.y - this.aimY) * 1.03,
        depth: Math.max(-box.min.z, box.max.z)
      };
    }

    // Framed for the container; with `overflow` the canvas only adds room on both sides.
    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      const canvasWidth = width * (1 + 2 * this.overflow);
      this.renderer.setSize(canvasWidth, height, false);
      if (!this.built) return;
      const { halfWidth, halfHeight, depth } = this.extent;
      const half = Math.max(halfHeight / this.fit.height, halfWidth / (this.fit.width * width / height));
      const distance = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + depth * .5;
      this.camera.aspect = canvasWidth / height;
      this.camera.position.set(0, this.aimY + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
      this.camera.lookAt(0, this.aimY, 0);
      this.camera.updateProjectionMatrix();
      this.placeCoverLight(canvasWidth, height, width * this.overflow);
      this.render();
    }

    // Centre and size, on the container, of the warm light the sand casts on the page (styles.css,
    // .hourglass-stage::before): over the neck, a little wider than the glass is tall.
    placeCoverLight(width, height, offset) {
      this.root.updateMatrixWorld(true);
      const glass = this.sand.glass;
      const project = y => new THREE.Vector3(0, y, 0).project(this.camera);
      const centre = project((glass.bottom + glass.top) / 2 * .5), low = project(glass.bottom), high = project(glass.top);
      const style = this.container.style;
      style.setProperty('--sand-x', `${(centre.x + 1) / 2 * width - offset}px`);
      style.setProperty('--sand-y', `${(1 - centre.y) / 2 * height}px`);
      style.setProperty('--sand-size', `${Math.abs(high.y - low.y) / 2 * height * 2.1}px`);
    }

    // The cover fades out with «Iniciar» (GSAP autoAlpha) and the whole section is hidden
    // inside the scenes: rendering pauses until it is shown again.
    isShown() {
      return !document.hidden && this.container.clientWidth > 0 && this.container.clientHeight > 0
        && (!this.cover || getComputedStyle(this.cover).visibility !== 'hidden');
    }

    tick(now) {
      this.frame = requestAnimationFrame(this.tick);
      const dt = THREE.MathUtils.clamp((now - this.last) / 1000, 0, .1);
      this.last = now;
      if (!this.built || !this.isShown()) { this.hidden = true; return; }
      // Each time it comes back (e.g. «Repetir experiencia») the sand starts again, upright.
      if (this.hidden) { this.hidden = false; this.time = 0; this.resetSand(); this.resize(); }
      this.time += dt;
      const pointer = this.pointer, follow = 1 - Math.exp(-dt * 3);
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;
      const motion = this.reduced ? 0 : 1;
      this.spin.rotation.y = motion * SWAY.yaw * Math.sin(this.time * TAU / SWAY.period);
      this.root.rotation.y = motion * pointer.x * POINTER_TILT.y;
      this.root.rotation.x = motion * pointer.y * POINTER_TILT.x;
      this.root.position.y = motion * .05 * Math.sin(this.time * .9);
      // The light breathes slowly, with a faint shimmer, like a warm flame.
      this.glow.level = 1 + motion * (.07 * Math.sin(this.time * 1.3) + .025 * Math.sin(this.time * 4.1));
      // Once, `flipAfter` seconds after it appears, it turns over (at once with reduced motion).
      if (this.flipAfter !== null && !this.flipped && this.time >= this.flipAfter) {
        this.flipped = true;
        if (this.reduced) { this.turn.rotation.z -= Math.PI; this.finishFlip(); }
        else this.flip = { t: 0, from: this.turn.rotation.z };
      }
      if (this.flip) this.updateFlip(dt);
      else {
        this.drain = Math.min(1, this.drain + dt / this.settings.drainSeconds);
        this.updateSand(this.reduced ? 0 : this.drain);
      }
      this.render();
    }

    render() { this.renderer.render(this.scene, this.camera); }
  }

  app.IntroHourglass = IntroHourglass;
})();
