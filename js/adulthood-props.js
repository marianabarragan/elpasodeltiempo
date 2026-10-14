(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Mandatory palette of scenario 2. Every prop color is this set or a tone of it.
  const PALETTE = Object.freeze({
    olive: '#837858', steel: '#91959c', lime: '#c7cf96',
    walnut: '#604427', mint: '#c0dea4', sand: '#e2c99e'
  });

  // Provisional, replaceable props. Proposed .glb paths for the final Blender models.
  // Every prop is { root, visual }: interaction code only touches root (placement)
  // and visual (hover scale / small animations), never the meshes inside visual.
  const MODEL_SLOTS = Object.freeze({
    room: 'assets/models/adulthood/room.glb',
    desk: 'assets/models/adulthood/desk.glb',
    monitor: 'assets/models/adulthood/monitor.glb',
    keyboard: 'assets/models/adulthood/keyboard.glb',
    clockDigital: 'assets/models/adulthood/clock-digital.glb',
    coffeeThermos: 'assets/models/adulthood/coffee-thermos.glb',
    checklistPaper: 'assets/models/adulthood/checklist-paper.glb',
    pen: 'assets/models/adulthood/pen.glb',
    plant: 'assets/models/adulthood/plant.glb'
  });

  const DESK_TOP = 7.4;
  const tone = (hex, amount, toward = '#000000') => new THREE.Color(hex).lerp(new THREE.Color(toward), amount);

  function build() {
    const group = new THREE.Group();
    group.name = 'adulthood-room';
    const geometries = new Set(), materials = new Set(), textures = new Set();
    let seed = 52411;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    function canvasTexture(width, height, draw, repeat = [1, 1]) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      draw(canvas.getContext('2d'), width, height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = 4;
      textures.add(texture);
      return texture;
    }
    function material(color, options = {}) {
      const result = new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0, flatShading: true, ...options });
      materials.add(result);
      return result;
    }
    function mesh(geometry, surface, parent) {
      geometries.add(geometry);
      const result = new THREE.Mesh(geometry, surface);
      result.castShadow = result.receiveShadow = true;
      parent.add(result);
      return result;
    }
    function roundedRectangle(width, height, radius) {
      const shape = new THREE.Shape();
      const x = -width / 2, y = -height / 2;
      shape.moveTo(x + radius, y);
      shape.lineTo(x + width - radius, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + radius);
      shape.lineTo(x + width, y + height - radius);
      shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      shape.lineTo(x + radius, y + height);
      shape.quadraticCurveTo(x, y + height, x, y + height - radius);
      shape.lineTo(x, y + radius);
      shape.quadraticCurveTo(x, y, x + radius, y);
      return shape;
    }
    // Box rounded in the top view (XZ), height along +Y, centred on its origin.
    function softBox(width, height, depth, radius = .06) {
      const bevel = Math.min(.025, height * .2);
      const geometry = new THREE.ExtrudeGeometry(roundedRectangle(width - bevel * 2, depth - bevel * 2, radius), {
        depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -height / 2 + bevel, 0);
      return geometry;
    }
    // Box rounded in the front view (XY), depth along Z, centred on its origin.
    function frontBox(width, height, depth, radius = .1) {
      const bevel = Math.min(.03, depth * .2);
      const geometry = new THREE.ExtrudeGeometry(roundedRectangle(width - bevel * 2, height - bevel * 2, radius), {
        depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4
      });
      geometry.translate(0, 0, -depth / 2 + bevel);
      return geometry;
    }
    function lathe(profile, segments = 28) {
      return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
    }

    // A named root (placement, pivot at the base centre) and a visual child (hover/animation).
    // To use a .glb: clear `visual` and add the loaded scene to it, then call settle().
    const models = {};
    function prop(name) {
      const root = new THREE.Group();
      root.name = name;
      root.userData.modelSource = MODEL_SLOTS[name];
      const visual = new THREE.Group();
      visual.name = `${name}-visual`;
      root.add(visual);
      group.add(root);
      models[name] = { root, visual };
      return models[name];
    }
    // Rest any assembled model on the desk using its real bounds, never guessed pivots.
    function settle(root, x, z, rotationY = 0, surfaceY = DESK_TOP, clearance = .002) {
      root.position.set(x, 0, z);
      root.rotation.y = rotationY;
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      root.position.y = surfaceY + clearance - bounds.min.y;
      root.updateMatrixWorld(true);
    }

    // ---------- Textures ----------
    const wallTexture = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = PALETTE.olive; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1.4;
      for (let i = -h; i < w + h; i += 6) {
        ctx.strokeStyle = `rgba(226,201,158,${.05 + random() * .05})`;
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
        ctx.strokeStyle = `rgba(60,48,30,${.05 + random() * .05})`;
        ctx.beginPath(); ctx.moveTo(i + 3, h); ctx.lineTo(i + 3 + h, 0); ctx.stroke();
      }
    }, [7, 5]);
    const deskTexture = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#a07a50'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const y = random() * h, wave = 2 + random() * 5;
        ctx.strokeStyle = `rgba(70,46,24,${.05 + random() * .12})`;
        ctx.lineWidth = .6 + random() * 1.6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * .013 + i) * wave);
        ctx.stroke();
      }
    });
    const floorTexture = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#8c6a46'; ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) {
        const y = row * 64;
        for (let i = 0; i < 18; i++) {
          ctx.strokeStyle = `rgba(55,36,18,${.05 + random() * .08})`;
          ctx.beginPath(); ctx.moveTo(0, y + 4 + random() * 56); ctx.lineTo(w, y + 4 + random() * 56); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,26,12,.45)'; ctx.fillRect(0, y, w, 2);
        const seam = (row * 97) % w; ctx.fillRect(seam, y, 2, 64);
      }
    }, [6, 6]);

    // ---------- Room ----------
    const room = prop('room');
    const wallMaterial = material('#ffffff', { map: wallTexture, flatShading: false, roughness: 1 });
    const sideWallMaterial = material(tone('#ffffff', .1), { map: wallTexture, flatShading: false, roughness: 1 });
    const floorMaterial = material(tone(PALETTE.walnut, .05, '#ffffff'), { map: floorTexture, flatShading: false, roughness: .95 });
    const floor = mesh(new THREE.PlaneGeometry(34, 34), floorMaterial, room.visual);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 13); floor.name = 'floor';
    const backWall = mesh(new THREE.PlaneGeometry(34, 24), wallMaterial, room.visual);
    backWall.position.set(0, 12, -3.9); backWall.name = 'back-wall';
    [-1, 1].forEach(side => {
      const wall = mesh(new THREE.PlaneGeometry(34, 24), sideWallMaterial, room.visual);
      wall.rotation.y = -side * Math.PI / 2;
      wall.position.set(side * 15.5, 12, 13);
      wall.name = side < 0 ? 'left-wall' : 'right-wall';
    });
    const trim = material(tone(PALETTE.sand, .25));
    const baseboard = mesh(new THREE.BoxGeometry(31, .55, .12), trim, room.visual);
    baseboard.position.set(0, .275, -3.84);
    // Wall shelf with notebooks and a wall calendar of crossed-out days: routine, deadlines.
    const shelfWood = material(tone(PALETTE.walnut, .12, '#ffffff'), { map: deskTexture });
    const shelf = mesh(softBox(4.4, .16, .95), shelfWood, room.visual);
    shelf.position.set(-6.4, 10.85, -3.42); shelf.name = 'wall-shelf';
    [[-1.7, .62, 1.25, PALETTE.lime], [-1.38, .5, 1.05, PALETTE.olive], [-1.08, .55, 1.4, PALETTE.steel],
      [-.74, .45, 1.15, PALETTE.sand], [-.42, .5, 1.3, tone(PALETTE.mint, .35)]].forEach(([x, depth, height, color]) => {
      const book = mesh(new THREE.BoxGeometry(.28, height, depth), material(color), room.visual);
      book.position.set(-6.4 + x, 10.93 + height / 2, -3.48);
    });
    const leaning = mesh(new THREE.BoxGeometry(.26, 1.1, .5), material(tone(PALETTE.walnut, .2, '#ffffff')), room.visual);
    leaning.position.set(-6.4 - .02, 10.93 + .52, -3.48); leaning.rotation.z = -.38;
    const boxOnShelf = mesh(softBox(1.1, .55, .7), material(PALETTE.sand), room.visual);
    boxOnShelf.position.set(-5.1, 10.93 + .275, -3.45);
    const calendarTexture = canvasTexture(256, 320, (ctx, w, h) => {
      ctx.fillStyle = '#f3ead6'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PALETTE.olive; ctx.fillRect(0, 0, w, 58);
      ctx.fillStyle = '#f3ead6'; ctx.font = '700 30px "DM Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('OCTUBRE', w / 2, 40);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
        const x = 14 + col * 33, y = 74 + row * 47;
        ctx.strokeStyle = 'rgba(96,68,39,.35)'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, 30, 42);
        if (row * 7 + col < 23) {
          ctx.strokeStyle = 'rgba(70,64,92,.75)'; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(x + 5, y + 7); ctx.lineTo(x + 25, y + 35); ctx.moveTo(x + 25, y + 8); ctx.lineTo(x + 6, y + 34); ctx.stroke();
        }
      }
    });
    const calendar = mesh(new THREE.BoxGeometry(2.3, 2.9, .05), [trim, trim, trim, trim, material('#ffffff', { map: calendarTexture, flatShading: false }), trim], room.visual);
    calendar.position.set(6.3, 10.75, -3.86); calendar.rotation.z = .02; calendar.name = 'wall-calendar';

    // ---------- Desk ----------
    const desk = prop('desk');
    const deskWood = material(tone(PALETTE.walnut, .34, '#ffffff'), { map: deskTexture, flatShading: false, roughness: .85 });
    const deskDark = material(tone(PALETTE.walnut, .15));
    const top = mesh(softBox(16, .36, 7.2, .1), deskWood, desk.visual);
    top.position.set(0, DESK_TOP - .18, 0); top.name = 'desk-top';
    const legHeight = DESK_TOP - .36;
    [[-7.45, -3.1], [-7.45, 3.1], [7.45, -3.1], [7.45, 3.1]].forEach(([x, z]) => {
      const leg = mesh(new THREE.BoxGeometry(.42, legHeight, .42), deskDark, desk.visual);
      leg.position.set(x, legHeight / 2, z);
    });
    const modesty = mesh(new THREE.BoxGeometry(14.5, 2.6, .12), deskDark, desk.visual);
    modesty.position.set(0, legHeight - 1.3, -3.05);
    const drawers = mesh(new THREE.BoxGeometry(3.1, legHeight - .3, 6.2), deskWood, desk.visual);
    drawers.position.set(5.6, (legHeight - .3) / 2 + .3, -.05);
    [0, 1, 2].forEach(index => {
      const handle = mesh(new THREE.BoxGeometry(.9, .1, .1), material(PALETTE.steel, { metalness: .2, roughness: .5 }), desk.visual);
      handle.position.set(5.6, legHeight - .8 - index * 2.05, 3.1);
    });

    // ---------- Monitor (main light source) ----------
    const monitor = prop('monitor');
    const plastic = material(tone(PALETTE.steel, .62));
    const plasticLight = material(tone(PALETTE.steel, .35));
    const base = mesh(softBox(2.3, .12, 1.25, .3), plasticLight, monitor.visual);
    base.position.y = .06;
    const neck = mesh(softBox(.5, 2.1, .26, .05), plasticLight, monitor.visual);
    neck.position.set(0, 1.17, -.32);
    const head = new THREE.Group();
    head.position.set(0, 2.92, -.1);
    head.rotation.x = -.05;
    monitor.visual.add(head);
    const bezel = mesh(frontBox(6.3, 3.75, .22, .12), plastic, head);
    bezel.name = 'monitor-bezel';
    const housing = mesh(frontBox(5.1, 2.9, .34, .3), plastic, head);
    housing.position.z = -.25;
    const screenTexture = canvasTexture(1024, 560, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#d8efff'); sky.addColorStop(1, '#86bfee');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      const panel = (x, y, width, height, header) => {
        ctx.fillStyle = 'rgba(16,52,92,.16)'; ctx.fillRect(x + 6, y + 8, width, height);
        ctx.fillStyle = '#f2f9ff'; ctx.fillRect(x, y, width, height);
        ctx.fillStyle = header; ctx.fillRect(x, y, width, 30);
      };
      panel(70, 50, 560, 400, '#9ccbee');
      for (let i = 0; i < 11; i++) {
        ctx.fillStyle = i % 4 === 0 ? '#7fa9cc' : '#bcd3e6';
        ctx.fillRect(100, 92 + i * 30, i % 4 === 0 ? 220 : 300 + random() * 190, i % 4 === 0 ? 14 : 9);
      }
      panel(600, 140, 360, 330, '#8fc2e8');
      ['#d7ebd0', '#e8f3fc', '#f0e7d2'].forEach((column, index) => {
        for (let card = 0; card < 4 - index; card++) {
          ctx.fillStyle = column;
          ctx.fillRect(618 + index * 112, 188 + card * 66, 98, 54);
          ctx.fillStyle = 'rgba(70,110,150,.35)'; ctx.fillRect(626 + index * 112, 200 + card * 66, 60, 7);
        }
      });
      ctx.fillStyle = 'rgba(60,110,165,.55)'; ctx.fillRect(0, h - 34, w, 34);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(232,246,255,.75)'; ctx.fillRect(18 + i * 40, h - 26, 24, 18); }
      ctx.fillStyle = 'rgba(235,247,255,.85)'; ctx.font = '600 16px "DM Sans", sans-serif'; ctx.fillText('22:30', w - 66, h - 11);
    });
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: '#eef7ff' });
    materials.add(screenMaterial);
    const screenWidth = 5.95, screenHeight = 3.42;
    const screen = mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), screenMaterial, head);
    screen.position.z = .113; screen.name = 'monitor-screen';
    screen.castShadow = false; screen.userData.ignoreScreenLight = true;
    const screenAnchor = new THREE.Object3D();
    screenAnchor.name = 'monitor-screen-light-anchor';
    screenAnchor.position.z = .12;
    head.add(screenAnchor);
    // Sticky notes on the bezel: accumulating to-dos.
    [[2.55, -1.32, .14, PALETTE.lime], [2.95, -1.05, -.1, PALETTE.sand], [-2.85, 1.3, .08, PALETTE.mint]].forEach(([x, y, angle, color]) => {
      const note = mesh(new THREE.PlaneGeometry(.55, .55), material(color, { side: THREE.DoubleSide }), head);
      note.position.set(x, y, .125); note.rotation.z = angle; note.castShadow = false;
    });

    // ---------- Keyboard ----------
    const keyboard = prop('keyboard');
    const keyboardBody = mesh(softBox(4.7, .16, 1.55, .1), plasticLight, keyboard.visual);
    keyboardBody.position.y = .08;
    const keyGeometry = new THREE.BoxGeometry(.24, .07, .23);
    geometries.add(keyGeometry);
    const keys = new THREE.InstancedMesh(keyGeometry, plastic, 5 * 15);
    keys.castShadow = keys.receiveShadow = true;
    const keyMatrix = new THREE.Matrix4();
    let keyIndex = 0;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 15; col++) {
      if (row === 4 && col > 3 && col < 11) keyMatrix.makeScale(0, 0, 0);
      else keyMatrix.makeTranslation(-2.08 + col * .297 + (row % 2) * .06, .195, -.56 + row * .28);
      keys.setMatrixAt(keyIndex++, keyMatrix);
    }
    keys.instanceMatrix.needsUpdate = true;
    keys.computeBoundingBox(); keys.computeBoundingSphere();
    keyboard.visual.add(keys);
    const spacebar = mesh(new THREE.BoxGeometry(2.0, .07, .23), plastic, keyboard.visual);
    spacebar.position.set(.1, .195, .56);

    // ---------- Digital clock (secondary interaction) ----------
    const clockDigital = prop('clockDigital');
    const clockBody = mesh(frontBox(1.55, .95, .6, .14), material(tone(PALETTE.steel, .7)), clockDigital.visual);
    clockBody.position.y = .045 + .475;
    [-.5, .5].forEach(x => {
      const foot = mesh(new THREE.BoxGeometry(.24, .045, .4), material(tone(PALETTE.steel, .8)), clockDigital.visual);
      foot.position.set(x, .0225, 0);
    });
    const clockButton = mesh(new THREE.BoxGeometry(.32, .05, .14), material(PALETTE.steel), clockDigital.visual);
    clockButton.position.set(.4, .045 + .95 + .02, -.05);
    const clockCanvas = document.createElement('canvas');
    clockCanvas.width = 512; clockCanvas.height = 256;
    const clockTexture = new THREE.CanvasTexture(clockCanvas);
    clockTexture.colorSpace = THREE.SRGBColorSpace;
    textures.add(clockTexture);
    const displayMaterial = new THREE.MeshBasicMaterial({ map: clockTexture, toneMapped: false });
    materials.add(displayMaterial);
    const display = mesh(new THREE.PlaneGeometry(1.24, .62), displayMaterial, clockDigital.visual);
    display.position.set(0, .045 + .5, .302); display.castShadow = false;
    display.userData.ignoreScreenLight = true; display.name = 'clock-display';
    const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
    function drawDigit(ctx, x, y, w, h, segments, color) {
      const t = w * .2, skew = .1;
      const bar = (x1, y1, x2, y2) => {
        const horizontal = y1 === y2;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x1 + t * .5, y1); ctx.lineTo(x1 + t, y1 - t / 2); ctx.lineTo(x2 - t, y1 - t / 2);
          ctx.lineTo(x2 - t * .5, y1); ctx.lineTo(x2 - t, y1 + t / 2); ctx.lineTo(x1 + t, y1 + t / 2);
        } else {
          ctx.moveTo(x1, y1 + t * .5); ctx.lineTo(x1 + t / 2, y1 + t); ctx.lineTo(x1 + t / 2, y2 - t);
          ctx.lineTo(x1, y2 - t * .5); ctx.lineTo(x1 - t / 2, y2 - t); ctx.lineTo(x1 - t / 2, y1 + t);
        }
        ctx.closePath(); ctx.fill();
      };
      ctx.save();
      ctx.translate(x, y); ctx.transform(1, 0, -skew, 1, 0, 0); ctx.fillStyle = color;
      const m = h / 2;
      const map = { a: [0, 0, w, 0], b: [w, 0, w, m], c: [w, m, w, h], d: [0, h, w, h], e: [0, m, 0, h], f: [0, 0, 0, m], g: [0, m, w, m] };
      [...segments].forEach(key => bar(...map[key]));
      ctx.restore();
    }
    function setClockPower(on) {
      const ctx = clockCanvas.getContext('2d'), w = clockCanvas.width, h = clockCanvas.height;
      if (!on) {
        ctx.fillStyle = '#070807'; ctx.fillRect(0, 0, w, h);
        const glare = ctx.createLinearGradient(0, 0, w, h);
        glare.addColorStop(0, 'rgba(255,255,255,.07)'); glare.addColorStop(.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = glare; ctx.fillRect(0, 0, w, h);
      } else {
        const glow = ctx.createLinearGradient(0, 0, 0, h);
        glow.addColorStop(0, PALETTE.mint); glow.addColorStop(1, tone(PALETTE.lime, .08).getStyle());
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
        const { digits, period } = app.Config.adulthood.clockTime;
        const ink = '#1d2617', ghost = 'rgba(29,38,23,.07)';
        let x = 34;
        [...digits].forEach(char => {
          if (char === ':') {
            ctx.fillStyle = ink; ctx.fillRect(x + 6, 92, 14, 14); ctx.fillRect(x, 150, 14, 14); x += 34; return;
          }
          drawDigit(ctx, x, 52, 60, 150, SEGMENTS[8], ghost);
          drawDigit(ctx, x, 52, 60, 150, SEGMENTS[char] || '', ink);
          x += 84;
        });
        ctx.fillStyle = ink; ctx.font = '800 40px "DM Sans", sans-serif'; ctx.fillText(period, x + 4, 100);
      }
      clockTexture.needsUpdate = true;
    }
    setClockPower(true);

    // ---------- Coffee thermos (secondary interaction) ----------
    const coffeeThermos = prop('coffeeThermos');
    const cup = mesh(lathe([[0, 0], [.4, 0], [.41, .04], [.47, 1.45], [0, 1.45]]), material(PALETTE.mint), coffeeThermos.visual);
    cup.name = 'thermos-body';
    const sleeveTexture = canvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = tone(PALETTE.lime, .25).getStyle(); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = tone(PALETTE.lime, .52).getStyle();
      for (let x = 0; x < w; x += 10) ctx.fillRect(x, 0, 4, h);
    }, [3, 1]);
    const sleeve = mesh(new THREE.CylinderGeometry(.468, .433, .72, 36, 1, true), material('#ffffff', { map: sleeveTexture, flatShading: false }), coffeeThermos.visual);
    sleeve.position.y = .73;
    const lidMaterial = material(tone(PALETTE.lime, .45));
    const lid = mesh(lathe([[0, 1.43], [.49, 1.43], [.5, 1.52], [.47, 1.58], [.43, 1.72], [0, 1.74]]), lidMaterial, coffeeThermos.visual);
    lid.name = 'thermos-lid';
    const sip = mesh(new THREE.BoxGeometry(.16, .02, .07), material(tone(PALETTE.walnut, .6)), coffeeThermos.visual);
    sip.position.set(0, 1.74, .3);

    // ---------- Plant (dry leaves: time passing) ----------
    const plant = prop('plant');
    const pot = mesh(lathe([[0, 0], [.4, 0], [.55, .9], [.6, .95], [.6, 1.0], [.5, 1.0], [.48, .9], [0, .9]], 22), material(tone(PALETTE.steel, .55)), plant.visual);
    pot.name = 'plant-pot';
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(.2, .35, 0, 1);
    leafShape.quadraticCurveTo(-.2, .35, 0, 0);
    const leafGeometry = new THREE.ShapeGeometry(leafShape, 5);
    geometries.add(leafGeometry);
    const stemMaterial = material(tone(PALETTE.lime, .5));
    const leafColors = [PALETTE.mint, PALETTE.lime, tone(PALETTE.mint, .25), PALETTE.sand, tone(PALETTE.sand, .3)];
    const leafMaterials = leafColors.map(color => material(color, { side: THREE.DoubleSide }));
    for (let i = 0; i < 4; i++) {
      const height = 1.1 + i * .3, lean = (i - 1.5) * .12;
      const stem = mesh(new THREE.CylinderGeometry(.03, .04, height, 5), stemMaterial, plant.visual);
      stem.position.set(lean * 2, .9 + height / 2, (i % 2 ? .08 : -.08));
      stem.rotation.z = -lean;
      for (let j = 0; j < 3; j++) {
        const leaf = mesh(leafGeometry, leafMaterials[(i * 3 + j) % leafMaterials.length], plant.visual);
        const y = .9 + height * (.55 + j * .2);
        leaf.position.set(lean * 2 + Math.sin(-lean) * (y - .9), y, stem.position.z);
        leaf.rotation.set(-.35 + random() * .3, (i * 3 + j) * 2.2, (j % 2 ? 1 : -1) * (.7 + random() * .5));
        leaf.scale.setScalar(.75 + random() * .3);
        leaf.castShadow = true;
      }
    }

    // ---------- Checklist paper (main interaction surface) ----------
    // The ChecklistSystem owns the texture; this module only owns the shape.
    const checklistPaper = prop('checklistPaper');
    const paperWidth = 2.9, paperHeight = 3.7;
    const paperGeometry = new THREE.PlaneGeometry(paperWidth, paperHeight, 30, 38);
    paperGeometry.rotateX(-Math.PI / 2);
    // Light crumpling: a few crossing creases plus slightly lifted edges. Always above the desk.
    const creases = Array.from({ length: 6 }, () => {
      const angle = random() * Math.PI;
      return { x: Math.cos(angle), z: Math.sin(angle), offset: (random() - .5) * 2.4, amount: .006 + random() * .01 };
    });
    const paperPositions = paperGeometry.attributes.position;
    let paperTop = 0;
    for (let i = 0; i < paperPositions.count; i++) {
      const x = paperPositions.getX(i), z = paperPositions.getZ(i);
      let y = .005;
      creases.forEach(crease => { y += Math.max(0, crease.amount - Math.abs(x * crease.x + z * crease.z - crease.offset) * .02); });
      y += Math.sin(x * 2.1 + 1.3) * Math.sin(z * 1.7) * .006 + .006;
      const edge = Math.max(Math.abs(x) / (paperWidth / 2), Math.abs(z) / (paperHeight / 2));
      y += Math.pow(Math.max(0, edge - .82) / .18, 2) * .028;
      paperPositions.setY(i, y);
      paperTop = Math.max(paperTop, y);
    }
    paperGeometry.computeVertexNormals();
    const paperMaterial = material('#ffffff', { flatShading: false, roughness: 1, alphaTest: .5, side: THREE.DoubleSide });
    const paperMesh = mesh(paperGeometry, paperMaterial, checklistPaper.visual);
    paperMesh.name = 'checklist-paper-sheet';
    paperMesh.castShadow = false;

    // ---------- Pen (main interaction tool) ----------
    // Authored along +X, tip at +X. The tip is derived from the bounds below.
    const pen = prop('pen');
    const penBody = new THREE.Group();
    penBody.name = 'pen-body';
    pen.visual.add(penBody);
    const radius = .07;
    const penBlue = material(new THREE.Color(PALETTE.steel).lerp(new THREE.Color('#3f5c96'), .6));
    const penDark = material(tone(PALETTE.steel, .7));
    const penMetal = material(tone(PALETTE.steel, .3, '#ffffff'), { metalness: .3, roughness: .45 });
    const alongX = (geometry, surface, x) => {
      const part = mesh(geometry, surface, penBody);
      part.rotation.z = -Math.PI / 2; part.position.x = x;
      return part;
    };
    alongX(new THREE.CylinderGeometry(radius, radius, 1.2, 12), penBlue, -.2);
    alongX(new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, .3, 12), penDark, .55);
    alongX(new THREE.ConeGeometry(radius, .14, 12), penMetal, .77);
    const endCap = mesh(new THREE.SphereGeometry(radius, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), penBlue, penBody);
    endCap.rotation.z = Math.PI / 2; endCap.position.x = -.8;
    const clip = mesh(new THREE.BoxGeometry(.48, .025, .04), penMetal, penBody);
    clip.position.set(-.5, radius + .02, 0);
    penBody.position.y = radius;
    const tipMarker = new THREE.Object3D();
    tipMarker.name = 'pen-tip';
    tipMarker.position.set(.84, radius, 0);
    pen.root.add(tipMarker);

    // ---------- Placement on the desk ----------
    settle(monitor.root, .5, -2.35);
    settle(keyboard.root, .55, -.15);
    settle(clockDigital.root, -4.5, -2.45, .32);
    settle(plant.root, -6.75, -2.35);
    settle(coffeeThermos.root, 5.0, -1.0, -.4);
    settle(checklistPaper.root, -4.0, 1.3, .22, DESK_TOP, .004);
    settle(pen.root, -1.75, 1.7, -1.22);
    group.updateMatrixWorld(true);

    ['pen', 'coffeeThermos', 'clockDigital'].forEach(name => {
      models[name].root.userData.interactive = name;
    });
    const penRest = { position: pen.root.position.clone(), quaternion: pen.root.quaternion.clone() };

    return {
      group, deskTopY: DESK_TOP, models,
      interactive: { pen: models.pen, coffeeThermos: models.coffeeThermos, clockDigital: models.clockDigital },
      monitorScreen: { anchor: screenAnchor, width: screenWidth, height: screenHeight },
      paper: { ...checklistPaper, mesh: paperMesh, material: paperMaterial, width: paperWidth, height: paperHeight, surfaceTop: paperTop },
      pen: { ...pen, tip: tipMarker.position.clone(), rest: penRest, materials: [penBlue, penDark] },
      clock: { setPower: setClockPower },
      metadata: { palette: PALETTE, modelSlots: MODEL_SLOTS, axis: 'Y-up', penTipAxis: '+X' },
      dispose() {
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(surface => surface.dispose());
        textures.forEach(texture => texture.dispose());
        keys.dispose();
        geometries.clear(); materials.clear(); textures.clear();
        group.clear();
      }
    };
  }

  app.AdulthoodProps = { build, PALETTE, MODEL_SLOTS, DESK_TOP };
})();
