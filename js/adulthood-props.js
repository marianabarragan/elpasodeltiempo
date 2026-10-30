(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Mandatory palette of scenario 2. Every prop color is this set or a tone of it.
  const PALETTE = Object.freeze({
    olive: '#837858', steel: '#91959c', lime: '#c7cf96',
    walnut: '#604427', mint: '#c0dea4', sand: '#e2c99e'
  });

  // Blender models (js/adulthood-models.js), with a provisional prop for any that does not load.
  // Every prop is { root, visual }: interaction code only touches root (placement)
  // and visual (hover scale / small animations), never the meshes inside visual.
  const MODEL_SLOTS = app.AdulthoodModels?.SOURCES || Object.freeze({});

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

    // ---------- Blender models (js/adulthood-models.js) ----------
    // Each one keeps its shape and proportions: it is scaled uniformly so its largest measure
    // is `size` (that of the provisional prop it replaces) and goes in the prop's place.
    const blender = app.AdulthoodModels?.status === 'ready' ? app.AdulthoodModels.create() : {};
    const WALL_FRONT = -3.9;
    const baseOf = box => new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    // Puts `object` (in the exported scene's coordinates) in `parent`, scaled, with the point
    // `pivotOf(box)` at the parent's origin. Returns the scale and a converter from the
    // object's coordinates to the parent's.
    function useModel(parent, object, size, pivotOf = baseOf) {
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object, true), measure = box.getSize(new THREE.Vector3());
      const pivot = pivotOf(box), holder = new THREE.Group();
      holder.scale.setScalar(size ? size / Math.max(measure.x, measure.y, measure.z) : 1);
      object.position.sub(pivot);
      holder.add(object);
      parent.add(holder);
      const scale = holder.scale.x;
      return { holder, box, scale, local: point => new THREE.Vector3(point.x, point.y, point.z).sub(pivot).multiplyScalar(scale) };
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
    // Back wall: from Blender, its bottom on the desk's back edge (AdulthoodScene.fitBackdrop()
    // enlarges it uniformly only if a very wide or tall screen sees past it), or provisional.
    let wallFit = null;
    if (blender.wall) {
      const { holder, box } = useModel(room.visual, blender.wall, 0, box => new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, box.max.z));
      holder.position.set(0, DESK_TOP, WALL_FRONT);
      holder.name = 'back-wall';
      const size = box.getSize(new THREE.Vector3());
      wallFit = { object: holder, left: size.x / 2, right: size.x / 2, height: size.y };
    } else {
      const backWall = mesh(new THREE.PlaneGeometry(34, 24), wallMaterial, room.visual);
      backWall.position.set(0, 12, WALL_FRONT); backWall.name = 'back-wall';
    }
    // Side walls only frame the provisional room: the Blender desk and wall cover the view alone.
    if (!blender.wall) [-1, 1].forEach(side => {
      const wall = mesh(new THREE.PlaneGeometry(34, 24), sideWallMaterial, room.visual);
      wall.rotation.y = -side * Math.PI / 2;
      wall.position.set(side * 15.5, 12, 13);
      wall.name = side < 0 ? 'left-wall' : 'right-wall';
    });
    const trim = material(tone(PALETTE.sand, .25));
    const baseboard = mesh(new THREE.BoxGeometry(31, .55, .12), trim, room.visual);
    baseboard.position.set(0, .275, -3.84);
    // Wall shelf with notebooks and a wall calendar of crossed-out days: routine, deadlines.
    // Both hang low enough to stay inside the view at every camera angle.
    const SHELF_X = -4.9, SHELF_Y = 9.6;
    if (blender.shelf) {
      // Shelf and books from Blender, on the wall where the provisional shelf was.
      const { holder } = useModel(room.visual, blender.shelf, 4.4, box => new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, box.min.z));
      holder.position.set(SHELF_X, SHELF_Y - .08, WALL_FRONT + .005);
      holder.name = 'wall-shelf';
    } else {
      const shelfWood = material(tone(PALETTE.walnut, .12, '#ffffff'), { map: deskTexture });
      const shelf = mesh(softBox(4.4, .16, .95), shelfWood, room.visual);
      shelf.position.set(SHELF_X, SHELF_Y, -3.42); shelf.name = 'wall-shelf';
      [[-1.7, .62, 1.25, PALETTE.lime], [-1.38, .5, 1.05, PALETTE.olive], [-1.08, .55, 1.4, PALETTE.steel],
        [-.74, .45, 1.15, PALETTE.sand], [-.42, .5, 1.3, tone(PALETTE.mint, .35)]].forEach(([x, depth, height, color]) => {
        const book = mesh(new THREE.BoxGeometry(.28, height, depth), material(color), room.visual);
        book.position.set(SHELF_X + x, SHELF_Y + .08 + height / 2, -3.48);
      });
      const leaning = mesh(new THREE.BoxGeometry(.26, 1.1, .5), material(tone(PALETTE.walnut, .2, '#ffffff')), room.visual);
      leaning.position.set(SHELF_X - .02, SHELF_Y + .08 + .52, -3.48); leaning.rotation.z = -.38;
      const boxOnShelf = mesh(softBox(1.1, .55, .7), material(PALETTE.sand), room.visual);
      boxOnShelf.position.set(SHELF_X + 1.3, SHELF_Y + .08 + .275, -3.45);
    }
    // ---------- Wall calendar (interactive: one sheet per month) ----------
    // A backing board with binding rings and a pad of month sheets. Each sheet hangs from
    // a pivot on its top edge; `calendar.pages.front` is the visible month and `under` the next.
    const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const calendarStart = app.Config.adulthood.calendar;
    const monthTextures = new Map();
    // `index` counts months from the configured start (0 = start month). The layout was drawn
    // for a 320 × 380 page; vertical measures follow the real page's proportions (`k`).
    function monthTexture(index) {
      if (monthTextures.has(index)) return monthTextures.get(index);
      const absolute = calendarStart.startYear * 12 + calendarStart.startMonth + index;
      const year = Math.floor(absolute / 12), month = absolute % 12;
      const texture = canvasTexture(320, Math.round(320 * pageHeight / pageWidth), (ctx, w, h) => {
        const k = h / 380, font = (weight, size) => `${weight} ${Math.round(size * Math.min(1, k))}px "DM Sans", sans-serif`;
        ctx.fillStyle = '#f3ead6'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = PALETTE.olive; ctx.fillRect(0, 0, w, 70 * k);
        ctx.fillStyle = '#f3ead6'; ctx.font = font(700, 36); ctx.textAlign = 'center';
        ctx.fillText(MONTHS[month], w / 2, 48 * k);
        ctx.fillStyle = 'rgba(96,68,39,.7)'; ctx.font = font(700, 16);
        ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((day, col) => ctx.fillText(day, 34 + col * 42, 92 * k));
        const first = (new Date(year, month, 1).getDay() + 6) % 7;
        const days = new Date(year, month + 1, 0).getDate();
        ctx.font = font(600, 14); ctx.textAlign = 'left';
        for (let cell = 0; cell < 42; cell++) {
          const col = cell % 7, row = Math.floor(cell / 7), day = cell - first + 1;
          const x = 15 + col * 42, y = (102 + row * 45) * k;
          ctx.strokeStyle = 'rgba(96,68,39,.3)'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, 38, 41 * k);
          if (day < 1 || day > days) continue;
          ctx.fillStyle = 'rgba(96,68,39,.75)'; ctx.fillText(String(day), x + 4, y + 15 * k);
          // The starting month keeps its crossed-out days: routine and deadlines.
          if (index === 0 && day <= 23) {
            ctx.strokeStyle = 'rgba(70,64,92,.75)'; ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(x + 9, y + 9 * k); ctx.lineTo(x + 31, y + 36 * k); ctx.moveTo(x + 31, y + 9 * k); ctx.lineTo(x + 9, y + 35 * k); ctx.stroke();
          }
        }
      });
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      monthTextures.set(index, texture);
      return texture;
    }
    const wallCalendar = prop('wallCalendar');
    // Month pages hang from the top edge of the pad: over the blank sheet of the Blender cork
    // board, or over the provisional board.
    let pageWidth = 2.14, pageHeight = 2.62, pageGap = [.024, .032];
    const pageTop = new THREE.Vector3(0, 1.3, 0);
    if (blender.wallCalendar) {
      const model = blender.wallCalendar;
      const { local } = useModel(wallCalendar.visual, model, 2.95, box => new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z));
      const blank = model.getObjectByName('calendar-sheet');
      if (blank) {
        blank.geometry.computeBoundingBox();
        const a = local(blank.geometry.boundingBox.min), b = local(blank.geometry.boundingBox.max);
        pageWidth = b.x - a.x; pageHeight = b.y - a.y;
        pageTop.set((a.x + b.x) / 2, b.y, b.z);
        pageGap = [.006, .014];
      }
    } else {
      const board = mesh(new THREE.BoxGeometry(2.3, 2.95, .04), trim, wallCalendar.visual);
      board.name = 'calendar-board'; board.castShadow = false;
      const ringMaterial = material(tone(PALETTE.steel, .2), { metalness: .35, roughness: .45 });
      [-.75, -.25, .25, .75].forEach(x => {
        const ring = mesh(new THREE.TorusGeometry(.07, .018, 6, 14, Math.PI * 1.3), ringMaterial, wallCalendar.visual);
        ring.position.set(x, 1.33, .05); ring.rotation.set(0, Math.PI / 2, Math.PI * .85);
      });
    }
    const pageGeometry = new THREE.PlaneGeometry(pageWidth, pageHeight);
    pageGeometry.translate(0, -pageHeight / 2, 0);
    geometries.add(pageGeometry);
    // `rest` is where the page hangs; AdulthoodScene brings a turned page back there.
    function page(name, z) {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(pageTop.x, pageTop.y, pageTop.z + z);
      const surface = material('#ffffff', { flatShading: false, transparent: true, side: THREE.DoubleSide });
      const sheet = mesh(pageGeometry, surface, pivot);
      sheet.castShadow = false;
      wallCalendar.visual.add(pivot);
      return { pivot, sheet, material: surface, rest: pivot.position.clone() };
    }
    const calendarPages = { under: page('calendar-page-under', pageGap[0]), front: page('calendar-page-front', pageGap[1]) };
    // Shows month `index` on the front sheet and the following month underneath.
    function setCalendarMonth(index) {
      calendarPages.front.material.map = monthTexture(index);
      calendarPages.under.material.map = monthTexture(index + 1);
      [calendarPages.front, calendarPages.under].forEach(item => { item.material.needsUpdate = true; });
      // Keep only the textures that can still be shown.
      monthTextures.forEach((texture, key) => {
        if (key < index || key > index + 1) { texture.dispose(); textures.delete(texture); monthTextures.delete(key); }
      });
    }
    setCalendarMonth(0);
    wallCalendar.root.position.set(5.75, 9.5, blender.wallCalendar ? WALL_FRONT + .005 : -3.84);
    wallCalendar.root.rotation.z = .02;

    // ---------- Desk ----------
    const desk = prop('desk');
    // The Blender desk top runs from the wall forward, its top at DESK_TOP; AdulthoodScene.
    // fitBackdrop() scales it uniformly so it covers everything the camera can see.
    let deskFit = null;
    if (blender.desk) {
      const { holder, box } = useModel(desk.visual, blender.desk, 0, box => new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, box.min.z));
      holder.position.set(0, DESK_TOP, WALL_FRONT);
      holder.name = 'desk-top';
      const size = box.getSize(new THREE.Vector3());
      deskFit = { object: holder, width: size.x, depth: size.z, back: WALL_FRONT };
    } else {
      const deskWood = material(tone(PALETTE.walnut, .34, '#ffffff'), { map: deskTexture, flatShading: false, roughness: .85 });
      const deskDark = material(tone(PALETTE.walnut, .15));
      // A long, deep top: from the back wall (z = -3.6) well past the bottom of the view and
      // wider than it on both sides, so the camera only ever sees the desk, never the floor.
      const DESK_WIDTH = 26, DESK_BACK = -3.6, DESK_FRONT = 12;
      const top = mesh(softBox(DESK_WIDTH, .36, DESK_FRONT - DESK_BACK, .1), deskWood, desk.visual);
      top.position.set(0, DESK_TOP - .18, (DESK_FRONT + DESK_BACK) / 2); top.name = 'desk-top';
      const legHeight = DESK_TOP - .36;
      const legX = DESK_WIDTH / 2 - .45;
      [[-legX, DESK_BACK + .5], [-legX, DESK_FRONT - .3], [legX, DESK_BACK + .5], [legX, DESK_FRONT - .3]].forEach(([x, z]) => {
        const leg = mesh(new THREE.BoxGeometry(.42, legHeight, .42), deskDark, desk.visual);
        leg.position.set(x, legHeight / 2, z);
      });
      const modesty = mesh(new THREE.BoxGeometry(DESK_WIDTH - 1.5, 2.6, .12), deskDark, desk.visual);
      modesty.position.set(0, legHeight - 1.3, -3.05);
      const drawers = mesh(new THREE.BoxGeometry(3.1, legHeight - .3, 6.2), deskWood, desk.visual);
      drawers.position.set(5.6, (legHeight - .3) / 2 + .3, DESK_FRONT - 3.4);
      [0, 1, 2].forEach(index => {
        const handle = mesh(new THREE.BoxGeometry(.9, .1, .1), material(PALETTE.steel, { metalness: .2, roughness: .5 }), desk.visual);
        handle.position.set(5.6, legHeight - .8 - index * 2.05, DESK_FRONT - .25);
      });
    }

    // ---------- Monitor (main light source) ----------
    const monitor = prop('monitor');
    const plastic = material(tone(PALETTE.steel, .62));
    const plasticLight = material(tone(PALETTE.steel, .35));
    // Switched-off panel: dark glass with a faint reflection.
    const screenOffTexture = canvasTexture(512, 280, (ctx, w, h) => {
      ctx.fillStyle = '#15191e'; ctx.fillRect(0, 0, w, h);
      const glare = ctx.createLinearGradient(0, 0, w * .8, h);
      glare.addColorStop(0, 'rgba(255,255,255,.08)'); glare.addColorStop(.45, 'rgba(255,255,255,.015)'); glare.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glare; ctx.fillRect(0, 0, w, h);
    });
    // The screen light starts just in front of the screen's centre.
    const screenAnchor = new THREE.Object3D();
    screenAnchor.name = 'monitor-screen-light-anchor';
    let screen, screenMaterial, screenTexture, screenOnColor, screenWidth, screenHeight, powerButton, setLed;
    if (blender.monitor && blender.screen) {
      // Blender monitor with its screen picture; the little button under the screen (and the
      // screen itself, see AdulthoodScene) switches it, and its ring is the status light.
      const both = new THREE.Group();
      both.add(blender.monitor, blender.screen);
      const { local, scale } = useModel(monitor.visual, both, 6.4);
      screen = both.getObjectByName('monitor-screen');
      screenMaterial = screen.material;
      screenTexture = screenMaterial.map;
      screenOnColor = '#ffffff';
      materials.add(screenMaterial);
      screen.geometry.computeBoundingBox();
      const size = screen.geometry.boundingBox.getSize(new THREE.Vector3());
      screenWidth = size.x * scale; screenHeight = size.y * scale;
      screenAnchor.position.copy(local(screen.position)).add(new THREE.Vector3(0, 0, .12));
      monitor.visual.add(screenAnchor);
      const button = both.getObjectByName('monitor-power');
      powerButton = { root: button || new THREE.Group(), visual: button ? button.children[0] : new THREE.Group() };
      const led = both.getObjectByName('monitor-led');
      const lit = led && { intensity: led.material.emissiveIntensity, color: led.material.color.clone() };
      setLed = on => {
        if (!led) return;
        led.material.emissiveIntensity = on ? lit.intensity : 0;
        led.material.color.copy(on ? lit.color : tone(PALETTE.steel, .6));
      };
    } else {
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
      screenTexture = canvasTexture(1024, 560, (ctx, w, h) => {
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
      screenOnColor = '#eef7ff';
      screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: screenOnColor });
      materials.add(screenMaterial);
      screenWidth = 5.95; screenHeight = 3.42;
      screen = mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), screenMaterial, head);
      screen.position.z = .113; screen.name = 'monitor-screen';
      screen.castShadow = false; screen.userData.ignoreScreenLight = true;
      // Power button on the bottom edge of the bezel, with a small status light beside it.
      powerButton = { root: new THREE.Group(), visual: new THREE.Group() };
      powerButton.root.name = 'monitorPower';
      powerButton.root.add(powerButton.visual);
      powerButton.root.position.set(0, -1.79, .11);
      head.add(powerButton.root);
      const powerIcon = canvasTexture(128, 128, (ctx, w) => {
        ctx.fillStyle = tone(PALETTE.steel, .45).getStyle(); ctx.fillRect(0, 0, w, w);
        ctx.strokeStyle = '#eef3f6'; ctx.lineWidth = 11; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(64, 68, 30, -Math.PI * .32, Math.PI * 1.32); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(64, 26); ctx.lineTo(64, 64); ctx.stroke();
      });
      powerIcon.wrapS = powerIcon.wrapT = THREE.ClampToEdgeWrapping;
      const buttonBody = mesh(new THREE.CylinderGeometry(.13, .13, .05, 24), material(tone(PALETTE.steel, .45)), powerButton.visual);
      buttonBody.rotation.x = Math.PI / 2;
      const buttonFace = mesh(new THREE.CircleGeometry(.12, 24), material('#ffffff', { map: powerIcon, flatShading: false }), powerButton.visual);
      buttonFace.position.z = .027;
      buttonFace.castShadow = false;
      const ledMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.mint, toneMapped: false });
      materials.add(ledMaterial);
      const led = mesh(new THREE.CircleGeometry(.035, 12), ledMaterial, head);
      led.position.set(.27, -1.79, .114);
      led.castShadow = false; led.userData.ignoreScreenLight = true;
      setLed = on => ledMaterial.color.set(on ? PALETTE.mint : tone(PALETTE.steel, .6));
      screenAnchor.position.z = .12;
      head.add(screenAnchor);
      // Sticky notes on the bezel: accumulating to-dos.
      [[2.55, -1.32, .14, PALETTE.lime], [2.95, -1.05, -.1, PALETTE.sand], [-2.85, 1.3, .08, PALETTE.mint]].forEach(([x, y, angle, color]) => {
        const note = mesh(new THREE.PlaneGeometry(.55, .55), material(color, { side: THREE.DoubleSide }), head);
        note.position.set(x, y, .125); note.rotation.z = angle; note.castShadow = false;
      });
    }
    // Hover emphasis on the screen only (0 = rest, 1 = hover): the panel grows slightly
    // inside its bezel and its content zooms in a little.
    function setScreenZoom(amount) {
      screen.scale.set(1 + .035 * amount, 1 + .035 * amount, 1);
      const repeat = 1 / (1 + .07 * amount);
      [screenTexture, screenOffTexture].forEach(texture => {
        texture.repeat.set(repeat, repeat);
        texture.offset.set((1 - repeat) / 2, (1 - repeat) / 2);
      });
    }
    function setScreenPower(on) {
      screenMaterial.map = on ? screenTexture : screenOffTexture;
      screenMaterial.color.set(on ? screenOnColor : '#ffffff');
      screenMaterial.needsUpdate = true;
      setLed(on);
    }

    // ---------- Keyboard ----------
    const keyboard = prop('keyboard');
    let keys = null;
    if (blender.keyboard) useModel(keyboard.visual, blender.keyboard, 4.7);
    else {
      const keyboardBody = mesh(softBox(4.7, .16, 1.55, .1), plasticLight, keyboard.visual);
      keyboardBody.position.y = .08;
      const keyGeometry = new THREE.BoxGeometry(.24, .07, .23);
      geometries.add(keyGeometry);
      keys = new THREE.InstancedMesh(keyGeometry, plastic, 5 * 15);
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
    }

    // ---------- Digital clock (secondary interaction) ----------
    const clockDigital = prop('clockDigital');
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
    // Config.adulthood.clockTime in slanted 7-segment digits, with the unlit segments faintly
    // behind them, laid out on 512 × 256 and centred on the canvas (`fill` < 1 leaves a margin).
    function drawClockTime(ctx, w, h, fill = 1) {
      const scale = fill * Math.min(w / 512, h / 256);
      ctx.save();
      ctx.translate((w - 512 * scale) / 2, (h - 256 * scale) / 2); ctx.scale(scale, scale);
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
      ctx.restore();
    }
    let setClockPower;
    if (blender.clockDigital) {
      // Blender clock: switching it off darkens its backlight and hides its digits, which are
      // drawn here (drawClockTime) over its backlight instead of the ones in its texture.
      const model = blender.clockDigital;
      useModel(clockDigital.visual, model, 1.55);
      const backlight = model.getObjectByName('clock-backlight'), digits = model.getObjectByName('clock-digits');
      const lit = backlight && { intensity: backlight.material.emissiveIntensity, color: backlight.material.color.clone() };
      if (digits) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = Math.round(1024 / (digits.userData.aspect || 2));
        drawClockTime(canvas.getContext('2d'), canvas.width, canvas.height, .9);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.anisotropy = 4;
        textures.add(texture);
        digits.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: digits.material.side });
        materials.add(digits.material);
      }
      setClockPower = on => {
        if (digits) digits.visible = on;
        if (!backlight) return;
        backlight.material.emissiveIntensity = on ? lit.intensity : 0;
        backlight.material.color.copy(on ? lit.color : new THREE.Color('#0b0d0b'));
      };
    } else {
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
      setClockPower = on => {
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
          drawClockTime(ctx, w, h);
        }
        clockTexture.needsUpdate = true;
      };
    }
    setClockPower(true);

    // ---------- Coffee thermos (secondary interaction) ----------
    const coffeeThermos = prop('coffeeThermos');
    if (blender.coffeeThermos) useModel(coffeeThermos.visual, blender.coffeeThermos, 1.75);
    else {
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
    }

    // ---------- Plant (dry leaves: time passing) ----------
    const plant = prop('plant');
    if (blender.plant) useModel(plant.visual, blender.plant, 3.27);
    else {
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
    }

    // ---------- Checklist paper (main interaction surface) ----------
    // The ChecklistSystem owns the texture; this module only owns the shape.
    const checklistPaper = prop('checklistPaper');
    let paperWidth = 2.9, paperHeight = 3.7, paperTop = 0, paperMesh, paperMaterial, paperSheet = null;
    if (blender.checklistPaper?.userData.boxes?.length >= app.Config.adulthood.checklist.tasks.length) {
      // Blender sheet: its paper, title, tasks and boxes are its own; the checks are drawn on its
      // paper picture, at its boxes (`paperSheet`, see ChecklistSystem).
      const model = blender.checklistPaper, { scale, local } = useModel(checklistPaper.visual, model, 3.7);
      paperMesh = model.getObjectByName('paper-sheet');
      paperMaterial = paperMesh.material;
      materials.add(paperMaterial);
      paperMesh.geometry.computeBoundingBox();
      const { min, max } = paperMesh.geometry.boundingBox;
      paperWidth = (max.x - min.x) * scale; paperHeight = (max.z - min.z) * scale;
      paperTop = local(max).y;
      paperSheet = { image: paperMaterial.map?.image || null, boxes: model.userData.boxes };
    } else {
      const paperGeometry = new THREE.PlaneGeometry(paperWidth, paperHeight, 30, 38);
      paperGeometry.rotateX(-Math.PI / 2);
      // Light crumpling: a few crossing creases plus slightly lifted edges. Always above the desk.
      const creases = Array.from({ length: 6 }, () => {
        const angle = random() * Math.PI;
        return { x: Math.cos(angle), z: Math.sin(angle), offset: (random() - .5) * 2.4, amount: .006 + random() * .01 };
      });
      const paperPositions = paperGeometry.attributes.position;
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
      paperMaterial = material('#ffffff', { flatShading: false, roughness: 1, alphaTest: .5, side: THREE.DoubleSide });
      paperMesh = mesh(paperGeometry, paperMaterial, checklistPaper.visual);
      paperMesh.name = 'checklist-paper-sheet';
      paperMesh.castShadow = false;
    }
    // Call-to-action glow: soft light around the sheet's edges only (transparent inside,
    // so it never covers the writing), a thin cream halo like the glow of the props in the
    // other scenes. Its opacity is animated by the scene.
    const glowMargin = .2;
    const glowTexture = canvasTexture(256, 320, (ctx, w, h) => {
      const image = ctx.createImageData(w, h);
      const totalW = paperWidth + glowMargin * 2, totalH = paperHeight + glowMargin * 2;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const x = Math.abs((px + .5) / w - .5) * totalW, y = Math.abs((py + .5) / h - .5) * totalH;
        const dx = Math.max(0, x - paperWidth / 2), dy = Math.max(0, y - paperHeight / 2);
        const inside = dx === 0 && dy === 0;
        const d = Math.hypot(dx, dy) / glowMargin;
        const alpha = inside ? 0 : Math.exp(-d * d * 3.5);
        const k = (py * w + px) * 4;
        image.data[k] = 255; image.data[k + 1] = 243; image.data[k + 2] = 196; image.data[k + 3] = Math.round(alpha * 255);
      }
      ctx.putImageData(image, 0, 0);
    });
    glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false
    });
    materials.add(glowMaterial);
    const glowGeometry = new THREE.PlaneGeometry(paperWidth + glowMargin * 2, paperHeight + glowMargin * 2);
    glowGeometry.rotateX(-Math.PI / 2);
    const paperGlow = mesh(glowGeometry, glowMaterial, checklistPaper.visual);
    paperGlow.name = 'checklist-paper-glow';
    paperGlow.position.y = .003;
    paperGlow.castShadow = paperGlow.receiveShadow = false;
    paperGlow.renderOrder = 2;
    paperGlow.visible = false;
    paperGlow.raycast = () => {};
    paperGlow.userData.ignoreScreenLight = true;

    // ---------- Pen (main interaction tool) ----------
    // Authored along +X, tip at +X. The tip is derived from the bounds below.
    const pen = prop('pen');
    const tipMarker = new THREE.Object3D();
    tipMarker.name = 'pen-tip';
    let penMaterials;
    if (blender.pen) {
      // Blender pen, along +X with its tip at +X and the clip on top (js/adulthood-models.js).
      const model = blender.pen, { local } = useModel(pen.visual, model, 1.71);
      tipMarker.position.copy(local(model.userData.tip));
      penMaterials = [];
      model.traverse(object => { if (object.isMesh && !penMaterials.includes(object.material)) penMaterials.push(object.material); });
    } else {
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
      tipMarker.position.set(.84, radius, 0);
      penMaterials = [penBlue, penDark];
    }
    pen.root.add(tipMarker);

    // ---------- Placement on the desk ----------
    settle(monitor.root, .5, -2.35);
    settle(keyboard.root, .55, -.15);
    settle(clockDigital.root, -4.5, -2.45, .32);
    // At the far left end of the desk, forward, clear of the wall shelf.
    settle(plant.root, -8.25, -.8);
    settle(coffeeThermos.root, 5.0, -1.0, -.4);
    settle(checklistPaper.root, -4.0, 1.3, .22, DESK_TOP, .004);
    settle(pen.root, -1.75, 1.7, -1.22);
    group.updateMatrixWorld(true);

    const interactive = ['checklistPaper', 'pen', 'monitor', 'wallCalendar', 'coffeeThermos', 'clockDigital'];
    interactive.forEach(name => { models[name].root.userData.interactive = name; });
    // Nested inside the monitor: the raycast finds the button before the monitor itself.
    powerButton.root.userData.interactive = 'monitorPower';
    const penRest = { position: pen.root.position.clone(), quaternion: pen.root.quaternion.clone() };
    const paperRest = { position: checklistPaper.root.position.clone(), quaternion: checklistPaper.root.quaternion.clone() };

    return {
      group, deskTopY: DESK_TOP, deskFit, wallFit, models,
      interactive: { ...Object.fromEntries(interactive.map(name => [name, models[name]])), monitorPower: powerButton },
      monitorScreen: { anchor: screenAnchor, width: screenWidth, height: screenHeight, setZoom: setScreenZoom, setPower: setScreenPower },
      paper: {
        ...checklistPaper, mesh: paperMesh, material: paperMaterial, width: paperWidth, height: paperHeight,
        surfaceTop: paperTop, rest: paperRest, glow: paperGlow, sheet: paperSheet
      },
      calendar: { ...wallCalendar, pages: calendarPages, setMonth: setCalendarMonth },
      pen: { ...pen, tip: tipMarker.position.clone(), rest: penRest, materials: penMaterials },
      clock: { setPower: setClockPower },
      metadata: { palette: PALETTE, modelSlots: MODEL_SLOTS, axis: 'Y-up', penTipAxis: '+X' },
      dispose() {
        // Blender models bring their own geometries, materials and textures.
        group.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          [].concat(object.material || []).forEach(surface => {
            materials.add(surface);
            Object.values(surface).forEach(value => { if (value?.isTexture) textures.add(value); });
          });
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(surface => surface.dispose());
        textures.forEach(texture => texture.dispose());
        keys?.dispose();
        geometries.clear(); materials.clear(); textures.clear();
        group.clear();
      }
    };
  }

  app.AdulthoodProps = { build, PALETTE, MODEL_SLOTS, DESK_TOP };
})();
