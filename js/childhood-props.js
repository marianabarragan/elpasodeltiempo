(() => {
  'use strict';

  const app = window.TimeExperience = window.TimeExperience || {};
  const PALETTE = Object.freeze({
    yellow: '#F2BB31', blue: '#00B2DA', green: '#60AE29',
    lime: '#AFDF36', orange: '#F67500', brown: '#BF5527'
  });

  // All meshes are provisional, replaceable models. They share a Y-up ground
  // convention; the crayon is authored along +X with its tip at (1.5, 0, 0).
  const MODEL_SLOTS = Object.freeze({
    floor: 'assets/models/childhood/foam-floor.glb',
    rings: 'assets/models/childhood/stacking-rings.glb',
    xylophone: 'assets/models/childhood/xylophone.glb',
    crayon: 'assets/models/childhood/crayon.glb',
    surface: 'assets/textures/childhood/painted-surfaces.png'
  });

  function build() {
    const group = new THREE.Group();
    group.name = 'childhood-room';
    const floorY = 0.18;
    const paperSurface = 0.205;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    let randomSeed = 19307;
    const random = () => {
      randomSeed = (Math.imul(1664525, randomSeed) + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    };

    // Gentle painted washes and fine foam grain, deliberately low contrast.
    // The neutral map preserves the specified palette on the material colors.
    function paintedTexture(repeat) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fffdf7';
      context.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 28; i++) {
        const x = random() * 128, y = random() * 128;
        const radius = 12 + random() * 35;
        const wash = context.createRadialGradient(x, y, 0, x, y, radius);
        wash.addColorStop(0, `rgba(153,120,78,${0.012 + random() * 0.025})`);
        wash.addColorStop(1, 'rgba(153,120,78,0)');
        context.fillStyle = wash;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      for (let i = 0; i < 2600; i++) {
        context.fillStyle = `rgba(105,83,53,${0.015 + random() * 0.035})`;
        context.fillRect(random() * 128, random() * 128, 0.5 + random(), 0.5 + random());
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      textures.add(texture);
      return texture;
    }

    const toyTexture = paintedTexture(1);
    const floorTexture = paintedTexture(0.42);
    function material(color, options = {}) {
      const result = new THREE.MeshStandardMaterial({
        color, map: toyTexture, roughness: 1, metalness: 0,
        flatShading: true, ...options
      });
      materials.add(result);
      return result;
    }

    function mesh(geometry, surface, parent = group) {
      geometries.add(geometry);
      const result = new THREE.Mesh(geometry, surface);
      result.castShadow = result.receiveShadow = true;
      parent.add(result);
      return result;
    }

    function roundedRectangle(width, depth, radius) {
      const shape = new THREE.Shape();
      const x = -width / 2, y = -depth / 2;
      shape.moveTo(x + radius, y);
      shape.lineTo(x + width - radius, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + radius);
      shape.lineTo(x + width, y + depth - radius);
      shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
      shape.lineTo(x + radius, y + depth);
      shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
      shape.lineTo(x, y + radius);
      shape.quadraticCurveTo(x, y, x + radius, y);
      shape.closePath();
      return shape;
    }

    function softenedBox(width, height, depth, radius = 0.05) {
      const bevel = Math.min(0.025, height * 0.2);
      const geometry = new THREE.ExtrudeGeometry(
        roundedRectangle(width - bevel * 2, depth - bevel * 2, radius), {
          depth: height - bevel * 2, bevelEnabled: true,
          bevelThickness: bevel, bevelSize: bevel,
          bevelSegments: 1, curveSegments: 3, steps: 1
        }
      );
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -height / 2 + bevel, 0);
      return geometry;
    }

    // Place each fully assembled and oriented model on the actual foam top.
    // This also keeps replacement models from inheriting guessed pivot heights.
    function ground(model, clearance = 0.002) {
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      model.position.y += floorY + clearance - bounds.min.y;
      model.updateMatrixWorld(true);
    }

    const floor = new THREE.Group();
    floor.name = 'interlocking-foam-floor';
    floor.userData.modelSource = MODEL_SLOTS.floor;
    group.add(floor);
    const floorUnderlay = mesh(new THREE.BoxGeometry(1, 0.10, 1), material('#a46b40'), floor);
    floorUnderlay.position.y = 0.005;

    // Opposite edges share the same curve, reversed, with complementary signs.
    // A small uniform inset and bevel create seams without intersecting tiles.
    const tileWidth = 3, tileDepth = 3.2;
    const modulo = (value, period) => ((value % period) + period) % period;
    const verticalJoin = (column, row) => (column + row) % 2 === 0 ? 1 : -1;
    const horizontalJoin = (column, row) => (column + row) % 2 === 0 ? -1 : 1;
    function tileShape(column, row) {
      const shape = new THREE.Shape();
      const x = tileWidth / 2, y = tileDepth / 2;
      shape.moveTo(-x, -y);
      function edge(ax, ay, bx, by, sign) {
        const dx = bx - ax, dy = by - ay;
        const length = Math.hypot(dx, dy);
        const nx = dy / length, ny = -dx / length;
        const point = (t, offset) => [ax + dx * t + nx * offset * sign, ay + dy * t + ny * offset * sign];
        if (!sign) { shape.lineTo(bx, by); return; }
        shape.lineTo(...point(0.40, 0));
        shape.bezierCurveTo(...point(0.45, 0), ...point(0.43, 0.10), ...point(0.39, 0.21));
        shape.bezierCurveTo(...point(0.31, 0.47), ...point(0.69, 0.47), ...point(0.61, 0.21));
        shape.bezierCurveTo(...point(0.57, 0.10), ...point(0.55, 0), ...point(0.60, 0));
        shape.lineTo(bx, by);
      }
      // Every edge continues into its neighbour, including beyond the original
      // six-by-four layout. There are only two alternating piece geometries.
      edge(-x, -y, x, -y, -horizontalJoin(column, row - 1));
      edge(x, -y, x, y, verticalJoin(column, row));
      edge(x, y, -x, y, horizontalJoin(column, row));
      edge(-x, y, -x, -y, -verticalJoin(column - 1, row));
      shape.closePath();
      return shape;
    }

    const foamColors = [PALETTE.yellow, PALETTE.blue, PALETTE.lime, PALETTE.orange, PALETTE.green, PALETTE.brown];
    const foamMaterials = foamColors.map(color => material(new THREE.Color(color).lerp(new THREE.Color('#fff3d4'), 0.30), { map: floorTexture }));
    const tileColors = [
      [0, 2, 1, 0, 4, 1],
      [1, 3, 4, 2, 0, 2],
      [2, 0, 1, 0, 3, 1],
      [0, 4, 2, 1, 2, 0]
    ];
    const tileGeometries = [0, 1].map(parity => {
      const geometry = new THREE.ExtrudeGeometry(tileShape(parity, 0), {
        depth: 0.12, bevelEnabled: true, bevelThickness: 0.016,
        bevelSize: 0.009, bevelSegments: 1, curveSegments: 7, steps: 1
      });
      geometry.scale(0.990, 0.990, 1);
      geometry.rotateX(-Math.PI / 2);
      geometries.add(geometry);
      return geometry;
    });
    const floorBounds = { width: 18, depth: 12.8 };
    let tileRange = null;
    let tileInstances = [];
    const instanceMatrix = new THREE.Matrix4();
    function extendFloor(range) {
      tileInstances.forEach(instance => { floor.remove(instance); instance.dispose(); });
      tileInstances = [];
      // Instancing preserves each piece's size, UVs, seams and bevels while the
      // continued floor needs at most twelve draw calls, not one per new tile.
      const batches = Array.from({ length: 12 }, () => []);
      for (let row = range.minRow; row <= range.maxRow; row++) {
        for (let column = range.minColumn; column <= range.maxColumn; column++) {
          const color = tileColors[modulo(row, 4)][modulo(column, 6)];
          batches[modulo(column + row, 2) * 6 + color].push([column, row]);
        }
      }
      batches.forEach((positions, batch) => {
        if (!positions.length) return;
        const tiles = new THREE.InstancedMesh(tileGeometries[Math.floor(batch / 6)], foamMaterials[batch % 6], positions.length);
        tiles.name = `foam-pieces-${batch}`;
        tiles.castShadow = tiles.receiveShadow = true;
        positions.forEach(([column, row], index) => {
          instanceMatrix.makeTranslation(-9 + (column + 0.5) * tileWidth, floorY - 0.136, 6.4 - (row + 0.5) * tileDepth);
          tiles.setMatrixAt(index, instanceMatrix);
        });
        tiles.instanceMatrix.needsUpdate = true;
        tiles.computeBoundingBox();
        tiles.computeBoundingSphere();
        floor.add(tiles);
        tileInstances.push(tiles);
      });
      const minX = -9 + range.minColumn * tileWidth;
      const maxX = -9 + (range.maxColumn + 1) * tileWidth;
      const minZ = 6.4 - (range.maxRow + 1) * tileDepth;
      const maxZ = 6.4 - range.minRow * tileDepth;
      Object.assign(floorBounds, { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ });
      floorUnderlay.scale.set(floorBounds.width, 1, floorBounds.depth);
      floorUnderlay.position.set((minX + maxX) / 2, 0.005, (minZ + maxZ) / 2);
      tileRange = range;
      floor.updateMatrixWorld(true);
    }
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const coverageRay = new THREE.Raycaster();
    const coveragePoint = new THREE.Vector3();
    const viewportCorners = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, y]) => new THREE.Vector2(x, y));
    function ensureFloorCoverage(camera) {
      // Intersect the *actual* orthographic viewport with the floor before each
      // render. This covers resize and every damped rotation without changing
      // the camera or magnifying any prop. One whole spare tile hides the edge.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const corner of viewportCorners) {
        coverageRay.setFromCamera(corner, camera);
        if (!coverageRay.ray.intersectPlane(floorPlane, coveragePoint)) return;
        minX = Math.min(minX, coveragePoint.x); maxX = Math.max(maxX, coveragePoint.x);
        minZ = Math.min(minZ, coveragePoint.z); maxZ = Math.max(maxZ, coveragePoint.z);
      }
      const range = {
        minColumn: Math.min(tileRange.minColumn, Math.floor((minX + 9) / tileWidth) - 1),
        maxColumn: Math.max(tileRange.maxColumn, Math.floor((maxX + 9) / tileWidth) + 1),
        minRow: Math.min(tileRange.minRow, Math.floor((6.4 - maxZ) / tileDepth) - 1),
        maxRow: Math.max(tileRange.maxRow, Math.floor((6.4 - minZ) / tileDepth) + 1)
      };
      if (Object.keys(range).some(key => range[key] !== tileRange[key])) extendFloor(range);
    }
    extendFloor({ minColumn: 0, maxColumn: 5, minRow: 0, maxRow: 3 });

    const rings = new THREE.Group();
    rings.name = 'stacking-rings';
    rings.userData.modelSource = MODEL_SLOTS.rings;
    rings.position.set(-8.10, 0, -3.95);
    group.add(rings);
    const woodenYellow = material('#e8b356');
    const base = mesh(new THREE.CylinderGeometry(1.07, 1.11, 0.19, 20), woodenYellow, rings);
    base.position.y = 0.095;
    const spindle = mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.54, 10), woodenYellow, rings);
    spindle.position.y = 0.88;
    function ringGeometry(radius) {
      const inner = 0.205, height = 0.245, bevel = 0.058;
      const profile = [
        [inner + bevel, 0], [radius - bevel, 0], [radius, bevel],
        [radius, height - bevel], [radius - bevel, height],
        [inner + bevel, height], [inner, height - bevel], [inner, bevel], [inner + bevel, 0]
      ].map(([r, y]) => new THREE.Vector2(r, y));
      return new THREE.LatheGeometry(profile, 20);
    }
    [
      [0.96, PALETTE.orange], [0.81, PALETTE.blue],
      [0.66, PALETTE.green], [0.50, PALETTE.yellow], [0.35, PALETTE.lime]
    ].forEach(([radius, color], index) => {
      const ring = mesh(ringGeometry(radius), material(color), rings);
      ring.position.y = 0.195 + index * 0.25;
      ring.rotation.y = index * 0.16;
      ring.name = `stacking-ring-${index}`;
    });
    const finial = mesh(new THREE.SphereGeometry(0.195, 12, 6), material(PALETTE.orange), rings);
    finial.position.y = 1.615;
    ground(rings);

    const xylophone = new THREE.Group();
    xylophone.name = 'wooden-xylophone';
    xylophone.userData.modelSource = MODEL_SLOTS.xylophone;
    xylophone.position.set(8.30, 0, -0.55);
    xylophone.rotation.y = -0.12;
    group.add(xylophone);
    const wood = material('#dfaa60');
    const woodDark = material('#af733e');
    [-0.55, 0.55].forEach(x => {
      const rail = mesh(softenedBox(0.23, 0.22, 3.71, 0.055), wood, xylophone);
      rail.position.set(x, 0.16, 0);
    });
    [-1.6, 1.6].forEach(z => {
      const foot = mesh(softenedBox(1.52, 0.13, 0.31, 0.06), woodDark, xylophone);
      foot.position.set(0, 0.065, z);
    });
    const noteColors = [PALETTE.brown, PALETTE.orange, PALETTE.yellow, PALETTE.lime, PALETTE.green, PALETTE.blue, '#56c6df', PALETTE.yellow];
    noteColors.forEach((color, index) => {
      const width = 2.11 - index * 0.108;
      const z = -1.465 + index * 0.42;
      const bar = mesh(softenedBox(width, 0.155, 0.335, 0.06), material(color), xylophone);
      bar.position.set(0, 0.3575, z);
      bar.name = `xylophone-key-${index}`;
      [-0.53, 0.53].forEach(x => {
        const peg = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 8), woodDark, xylophone);
        peg.position.set(x, 0.443, z);
      });
    });
    ground(xylophone);

    const crayon = new THREE.Group();
    crayon.name = 'draggable-crayon';
    crayon.userData.modelSource = MODEL_SLOTS.crayon;
    crayon.userData.interactive = 'crayon';
    group.add(crayon);
    const wax = material(PALETTE.green);
    const colorBand = material(PALETTE.green);
    const paperWrapper = material('#fff1c6');
    const wrapperLine = material('#d5c591');
    function cylinderAlongX(radius, length, x, surface) {
      const result = mesh(new THREE.CylinderGeometry(radius, radius, length, 10), surface, crayon);
      result.rotation.z = -Math.PI / 2;
      result.position.x = x;
      return result;
    }
    cylinderAlongX(0.20, 2.35, -0.275, wax);
    const tip = mesh(new THREE.ConeGeometry(0.20, 0.60, 10), wax, crayon);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 1.20;
    tip.name = 'crayon-wax-tip';
    cylinderAlongX(0.202, 0.05, -1.475, wax);
    cylinderAlongX(0.207, 1.50, -0.29, paperWrapper);
    cylinderAlongX(0.210, 0.70, -0.29, colorBand);
    [-0.96, 0.38].forEach(x => cylinderAlongX(0.211, 0.035, x, wrapperLine));
    crayon.scale.setScalar(app.Config.childhood.crayonScale);
    crayon.position.set(0.80, 0, 6.25);
    crayon.rotation.y = -0.09;
    ground(crayon, 0.004);
    crayon.traverse(object => { if (object.isMesh) object.userData.interactive = 'crayon'; });

    const crayonTip = new THREE.Vector3(1.50, 0, 0);
    const crayonRest = { position: crayon.position.clone(), quaternion: crayon.quaternion.clone() };
    group.updateMatrixWorld(true);

    return {
      group, floorY, paperSurface, crayon,
      crayonColorMaterials: [wax, colorBand],
      crayonTip, crayonTipSpace: 'crayon-local',
      crayonTipRestWorld: crayon.localToWorld(crayonTip.clone()),
      crayonRest, ensureFloorCoverage,
      metadata: {
        palette: PALETTE, modelSlots: MODEL_SLOTS,
        models: { floor, rings, xylophone, crayon },
        paperBounds: {
          minX: -4.1 * app.Config.childhood.paperScale, maxX: 4.1 * app.Config.childhood.paperScale,
          minZ: -3.075 * app.Config.childhood.paperScale, maxZ: 3.075 * app.Config.childhood.paperScale
        },
        axis: 'Y-up', crayonTipAxis: '+X', floorBounds
      },
      dispose() {
        tileInstances.forEach(instance => instance.dispose());
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(surface => surface.dispose());
        textures.forEach(texture => texture.dispose());
        geometries.clear(); materials.clear(); textures.clear();
        group.clear();
      }
    };
  }

  app.ChildhoodProps = { build, PALETTE, MODEL_SLOTS };
})();
