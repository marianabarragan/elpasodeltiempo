(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► COLORES del reloj de arena de la portada, tomados de la ilustración de referencia.
  const COLORS = {
    wood: 0xdaa66a, glass: 0xfdf2d6, sand: 0xf9b421, sandShade: 0xdd9611, vine: 0x8c6e2d,
    leafLight: '#c3cf80', leaf: '#aebe69', leafDark: '#597a06',
    violetCore: '#2a0d4a', violetDeep: '#3d1766', violet: '#592e8e', violetEdge: '#7d5bb5',
    lilacCore: '#f6f1ff', lilac: '#9b88c9', lilacTip: '#b9a9e3'
  };
  const TAU = Math.PI * 2;
  // Hourglass measures (units): each bulb is GLASS_HALF tall with the neck at y = 0; the caps
  // (CAP_T thick, CAP_R radius) close it and three turned posts stand at POST_R from the axis.
  const GLASS_HALF = 2.3, CAP_T = .6, CAP_R = 1.85, POST_R = 1.5;
  // Bulb outline (radius, height) from the neck to the cap; the lower bulb mirrors it.
  const BULB = [[.1, 0], [.13, .12], [.28, .38], [.55, .75], [.83, 1.12], [1.02, 1.5], [1.08, 1.8], [1.05, 2.05], [.94, 2.22], [.86, 2.3]];
  const PROFILE = new THREE.SplineCurve(BULB.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48);
  // Sand: starting levels as in the illustration (little left on top, lower bulb almost full);
  // it drains slowly for DRAIN_SECONDS while the cover is on screen and then stops.
  const SAND = { top: [.79, .04], bottom: [-.98, -.8], mound: .13, crater: .3 };
  const DRAIN_SECONDS = 90;
  // Idle sway (radians, seconds) and how much the pointer tilts the hourglass.
  const SWAY = { yaw: .12, period: 16 }, POINTER_TILT = { x: .07, y: .16 };
  const ELEVATION = 11 * Math.PI / 180;
  // Share of the canvas the model may use: height (as in the illustration) and width.
  const FIT = { height: .86, width: .8 };
  // Height the camera aims at, so the hourglass sits centred like in the illustration.
  const AIM_Y = -.25;

  const seeded = seed => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const v2 = (r, y) => new THREE.Vector2(r, y);

  // Inner radius of the glass at height y (both bulbs).
  function bulbRadius(y) {
    y = Math.min(GLASS_HALF, Math.abs(y));
    for (let i = 1; i < PROFILE.length; i++) {
      const a = PROFILE[i - 1], b = PROFILE[i];
      if (y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / Math.max(1e-6, b.y - a.y);
    }
    return PROFILE[PROFILE.length - 1].x;
  }
  const sandRadius = y => Math.max(.02, bulbRadius(y) - .045);

  // Canvas texture drawn in a 128 × 256 box (base at the bottom, tip at the top).
  function paintTexture(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
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
   * 3D hourglass of the start cover: wooden caps and turned posts, cream glass, falling sand
   * and a vine with leaves and purple flowers. It sways slowly, leans towards the pointer and
   * only renders while the cover is visible (the photo board behind it keeps its own renderer).
   */
  class IntroHourglass {
    constructor(container, { cover = container.closest('.intro-copy') } = {}) {
      this.container = container;
      this.cover = cover;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(24, 1, .5, 80);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      container.appendChild(this.renderer.domElement);

      this.root = new THREE.Group();     // float and pointer tilt
      this.spin = new THREE.Group();     // idle sway around the axis
      this.shine = new THREE.Group();    // glass highlights: tilt with the root, never sway
      this.root.add(this.spin, this.shine);
      this.scene.add(this.root);
      this.random = seeded(20261021);
      this.time = 0;
      this.drain = 0;
      this.buildLights();
      this.buildFrame();
      this.buildGlass();
      this.buildSand();
      this.buildVine();
      this.measure();

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
      this.resize();
      this.tick = this.tick.bind(this);
      this.frame = requestAnimationFrame(this.tick);
    }

    // Soft daylight balanced so the surfaces keep the illustration's colours: lit tops show the
    // base colour and the sides facing the viewer the illustration's darker shade.
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
      // As in the illustration the glass reads cream: its far inner wall is an opaque cream
      // backdrop (the sand stands out against it) and the near wall only adds a light sheen.
      this.mesh(geometry, new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.glass).multiplyScalar(.35), emissive: COLORS.glass, emissiveIntensity: .8,
        roughness: .9, side: THREE.BackSide
      }));
      this.mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: .08, transparent: true, opacity: .1, depthWrite: false
      })).renderOrder = 2;
      // Two white reflections on the left of each bulb, as in the illustration.
      const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide });
      const strip = (from, to) => {
        const points = [];
        for (let i = 0; i <= 16; i++) {
          const y = from + (to - from) * i / 16;
          points.push(v2(bulbRadius(y) + .012, y));
        }
        return points;
      };
      for (const sign of [1, -1]) {
        const [a, b] = sign > 0 ? [.55, 2.05] : [-2.05, -.55];
        this.mesh(new THREE.LatheGeometry(strip(a, b), 6, -1.02, .2), shine, this.shine).renderOrder = 3;
        this.mesh(new THREE.LatheGeometry(strip(a + .25 * sign, b - .3 * sign), 3, -.72, .06), shine, this.shine).renderOrder = 3;
      }
    }

    buildSand() {
      this.sandMaterial = new THREE.MeshStandardMaterial({ color: COLORS.sand, emissive: COLORS.sandShade, emissiveIntensity: .2, roughness: .95, side: THREE.DoubleSide });
      this.topSand = this.mesh(new THREE.BufferGeometry(), this.sandMaterial);
      this.bottomSand = this.mesh(new THREE.BufferGeometry(), this.sandMaterial);
      // Thin falling stream plus a few grains that run down it.
      const streamMaterial = new THREE.MeshStandardMaterial({ color: COLORS.sand, emissive: COLORS.sandShade, emissiveIntensity: .15, roughness: .9 });
      this.stream = this.mesh(new THREE.CylinderGeometry(.026, .026, 1, 10, 1, true), streamMaterial);
      const grainGeometry = new THREE.SphereGeometry(.03, 8, 6);
      this.grains = Array.from({ length: 9 }, (_, i) => {
        const grain = this.mesh(grainGeometry, streamMaterial);
        grain.userData = { offset: i / 9, drift: (this.random() - .5) * .03 };
        return grain;
      });
      this.levels = { top: null, bottom: null };
      this.updateSand(0);
    }

    // Rebuilds the sand surfaces only when a level actually moves.
    updateSand(progress) {
      const ease = 1 - (1 - progress) * (1 - progress);
      const top = THREE.MathUtils.lerp(SAND.top[0], SAND.top[1], ease);
      const bottom = THREE.MathUtils.lerp(SAND.bottom[0], SAND.bottom[1], ease);
      if (this.levels.top === null || Math.abs(top - this.levels.top) > .003) {
        this.levels.top = top;
        // From the neck up the glass wall, then down into the crater left by the draining sand.
        const points = [v2(.001, .03)];
        for (let i = 0; i <= 12; i++) { const y = .03 + (top - .03) * i / 12; points.push(v2(sandRadius(y), y)); }
        const rim = sandRadius(top), floor = Math.max(.04, top - SAND.crater);
        points.push(v2(rim * .55, top - (top - floor) * .45), v2(.001, floor));
        this.topSand.geometry.dispose();
        this.topSand.geometry = new THREE.LatheGeometry(points, 40);
      }
      if (this.levels.bottom === null || Math.abs(bottom - this.levels.bottom) > .003) {
        this.levels.bottom = bottom;
        // From the bottom of the glass up the wall, then over the small mound under the stream.
        const base = -GLASS_HALF + .02, points = [v2(.001, base)];
        for (let i = 0; i <= 14; i++) { const y = base + (bottom - base) * i / 14; points.push(v2(sandRadius(y), y)); }
        const rim = sandRadius(bottom);
        points.push(v2(rim * .5, bottom + SAND.mound * .6), v2(.001, bottom + SAND.mound));
        this.bottomSand.geometry.dispose();
        this.bottomSand.geometry = new THREE.LatheGeometry(points, 48);
      }
      // The stream runs from the neck to the top of the mound while there is sand above.
      const flowing = progress < 1;
      const peak = bottom + SAND.mound, length = -peak;
      this.stream.visible = flowing;
      this.stream.scale.y = length;
      this.stream.position.y = peak / 2;
      this.grains.forEach(grain => {
        grain.visible = flowing && !this.reduced;
        const t = (grain.userData.offset + this.time * .9) % 1;
        grain.position.set(grain.userData.drift * t, -t * length, 0);
      });
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

    // Model extent over the whole sway, used to frame the camera.
    measure() {
      const box = new THREE.Box3(), part = new THREE.Box3();
      for (const yaw of [-SWAY.yaw, 0, SWAY.yaw]) {
        this.spin.rotation.y = yaw;
        this.root.updateMatrixWorld(true);
        box.union(part.setFromObject(this.spin, true));
      }
      this.spin.rotation.y = 0;
      this.extent = {
        halfWidth: Math.max(-box.min.x, box.max.x) * 1.04,
        halfHeight: Math.max(-box.min.y, box.max.y) * 1.03,
        depth: Math.max(-box.min.z, box.max.z)
      };
    }

    resize() {
      const width = this.container.clientWidth, height = this.container.clientHeight;
      if (!width || !height) return;
      this.renderer.setSize(width, height, false);
      const aspect = width / height;
      const { halfWidth, halfHeight, depth } = this.extent;
      const half = Math.max(halfHeight / FIT.height, halfWidth / (FIT.width * aspect));
      const distance = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) + depth * .5;
      this.camera.aspect = aspect;
      this.camera.position.set(0, AIM_Y + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance);
      this.camera.lookAt(0, AIM_Y, 0);
      this.camera.updateProjectionMatrix();
      this.render();
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
      if (!this.isShown()) { this.hidden = true; return; }
      // Each time the cover comes back (e.g. «Repetir experiencia») the sand starts again.
      if (this.hidden) { this.hidden = false; this.drain = 0; this.time = 0; this.resize(); }
      this.time += dt;
      this.drain = Math.min(1, this.drain + dt / DRAIN_SECONDS);
      const pointer = this.pointer, follow = 1 - Math.exp(-dt * 3);
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;
      const motion = this.reduced ? 0 : 1;
      this.spin.rotation.y = motion * SWAY.yaw * Math.sin(this.time * TAU / SWAY.period);
      this.root.rotation.y = motion * pointer.x * POINTER_TILT.y;
      this.root.rotation.x = motion * pointer.y * POINTER_TILT.x;
      this.root.position.y = motion * .05 * Math.sin(this.time * .9);
      this.updateSand(this.reduced ? 0 : this.drain);
      this.render();
    }

    render() { this.renderer.render(this.scene, this.camera); }
  }

  app.IntroHourglass = IntroHourglass;
})();
