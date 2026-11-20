(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Todos los objetos usan la paleta de la vejez o sus variantes.
  const PALETTE = Object.freeze({
    butter: '#fadd87', lime: '#cee24c', clay: '#cc7d44', sage: '#cee59d',
    plum: '#5a323a', olive: '#5c5832', sky: '#b7c7ed'
  });

  // Usa modelos de Blender o sustitutos; las animaciones actúan sobre root/visual y sus anclajes.
  const MODEL_SLOTS = app.OldAgeModels?.SOURCES || Object.freeze({});

  const TABLE_TOP = 3.2;
  // Centro delantero de la mesa donde se coloca la maceta elegida.
  const CENTER = Object.freeze({ x: .1, z: 1.75 });
  const tone = (hex, amount, toward = '#000000') => new THREE.Color(hex).lerp(new THREE.Color(toward), amount);
  const css = (hex, amount, toward) => tone(hex, amount, toward).getStyle();

  function build() {
    const group = new THREE.Group();
    group.name = 'oldage-room';
    const geometries = new Set(), materials = new Set(), textures = new Set();
    let seed = 73019;
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
    // Añade pinceladas neutras para conservar la paleta del material.
    const painted = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = random() * w, y = random() * h, radius = 10 + random() * 34;
        const wash = ctx.createRadialGradient(x, y, 0, x, y, radius);
        wash.addColorStop(0, `rgba(120,86,70,${.015 + random() * .03})`);
        wash.addColorStop(1, 'rgba(120,86,70,0)');
        ctx.fillStyle = wash; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = `rgba(${random() < .5 ? '255,250,235' : '90,50,58'},${.03 + random() * .05})`;
        ctx.lineWidth = 1 + random() * 2.5;
        const x = random() * w, y = random() * h, length = 8 + random() * 22, angle = -.5 + random() * .3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
      }
    });
    function material(color, options = {}) {
      const result = new THREE.MeshStandardMaterial({ color, map: painted, roughness: .95, metalness: 0, flatShading: true, ...options });
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
    function lathe(profile, segments = 9) {
      return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
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
    // Caja redondeada en XZ, centrada y con altura en +Y.
    function softBox(width, height, depth, radius = .12) {
      const bevel = Math.min(.04, height * .2);
      const geometry = new THREE.ExtrudeGeometry(roundedRectangle(width - bevel * 2, depth - bevel * 2, radius), {
        depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 2
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -height / 2 + bevel, 0);
      return geometry;
    }
    // Caja redondeada en XY, centrada y con profundidad en Z.
    function frontBox(width, height, depth, radius = .2) {
      const bevel = Math.min(.05, depth * .2);
      const geometry = new THREE.ExtrudeGeometry(roundedRectangle(width - bevel * 2, height - bevel * 2, radius), {
        depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3
      });
      geometry.translate(0, 0, -depth / 2 + bevel);
      return geometry;
    }
    // Margarita de cinco pétalos para decorar regadera y taza.
    function daisy(parent, radius, petalColor, heartColor) {
      const flower = new THREE.Group();
      parent.add(flower);
      const petal = new THREE.CircleGeometry(radius * .42, 6);
      const petalMaterial = material(petalColor, { side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * Math.PI * 2;
        const part = mesh(petal, petalMaterial, flower);
        part.position.set(Math.cos(angle) * radius * .55, Math.sin(angle) * radius * .55, 0);
        part.scale.set(1.3, .85, 1); part.rotation.z = angle; part.castShadow = false;
      }
      const heart = mesh(new THREE.CircleGeometry(radius * .3, 7), material(heartColor), flower);
      heart.position.z = .004; heart.castShadow = false;
      return flower;
    }

    const models = {};
    function prop(name, parent = group) {
      const root = new THREE.Group();
      root.name = name;
      root.userData.modelSource = MODEL_SLOTS[name];
      const visual = new THREE.Group();
      visual.name = `${name}-visual`;
      root.add(visual);
      parent.add(root);
      models[name] = { root, visual };
      return models[name];
    }
    // Apoya el modelo en la superficie según sus límites reales.
    function settle(root, x, z, rotationY = 0, surfaceY = TABLE_TOP, clearance = .002) {
      root.position.set(x, 0, z);
      root.rotation.y = rotationY;
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      root.position.y = surfaceY + clearance - bounds.min.y;
      root.updateMatrixWorld(true);
    }

    // Conserva la composición exportada y ajusta su altura mediante lift.
    const blender = app.OldAgeModels?.status === 'ready' ? app.OldAgeModels.create() : {};
    const lift = TABLE_TOP - (blender.fileTop ?? 0);
    const fromFile = new Set();
    // Centra el pivote de apoyo y devuelve el desplazamiento necesario para apoyar el modelo.
    function useModel(target, object, clearance) {
      object.position.y += lift;
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object, true);
      const base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      object.position.sub(base);
      target.visual.add(object);
      settle(target.root, base.x, base.z, 0, TABLE_TOP, clearance);
      fromFile.add(target);
      return target.root.position.y - base.y;
    }
    function lowestPoint(object) {
      let low = null;
      const point = new THREE.Vector3();
      object.traverse(mesh => {
        if (!mesh.isMesh) return;
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          if (!low || point.y < low.y) low = point.clone();
        }
      });
      return low;
    }
    // Coloca paredes y ventanas según su altura original respecto a la mesa.
    function roomModel(object, name) {
      object.name = name;
      object.position.y += lift;
      room.visual.add(object);
      return object;
    }

    // Habitación con pared floral y ventana hacia la vegetación.
    const room = prop('room');
    const wallpaper = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      // Motivo tenue de enredadera teñido por el material.
      const motif = (x, y, flip) => {
        ctx.strokeStyle = 'rgba(92,88,50,.32)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10 * flip, y - 12, x, y - 26); ctx.stroke();
        ctx.fillStyle = 'rgba(92,88,50,.3)';
        [[-1, -9], [1, -17]].forEach(([side, dy]) => {
          ctx.beginPath(); ctx.ellipse(x + side * 6 * flip, y + dy, 5, 2.5, side * .6, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = 'rgba(204,125,68,.34)';
        ctx.beginPath(); ctx.arc(x, y - 28, 4, 0, Math.PI * 2); ctx.fill();
      };
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        motif(32 + col * 64 + (row % 2) * 32 + (random() - .5) * 6, 52 + row * 64, row % 2 ? 1 : -1);
      }
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(90,50,58,${.015 + random() * .03})`;
        ctx.beginPath(); ctx.ellipse(random() * w, random() * h, 8 + random() * 20, 3 + random() * 6, -.3, 0, Math.PI * 2); ctx.fill();
      }
    }, [9, 5]);
    const floor = mesh(new THREE.PlaneGeometry(46, 40), material(tone(PALETTE.plum, .3, PALETTE.clay)), room.visual);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 9); floor.name = 'floor';
    // Escala la pared desde su borde inferior para cubrir la vista.
    let wallFit = null;
    if (blender.wall) {
      const wall = blender.wall;
      wall.position.y = lift;
      wall.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(wall, true);
      const holder = roomModel(new THREE.Group(), 'back-wall');
      holder.position.set((box.min.x + box.max.x) / 2, box.min.y, box.max.z);
      wall.position.sub(holder.position);
      holder.add(wall);
      wallFit = { object: holder, left: holder.position.x - box.min.x, right: box.max.x - holder.position.x, height: box.max.y - box.min.y };
    } else {
      const backWall = mesh(new THREE.PlaneGeometry(46, 26), material(tone(PALETTE.butter, .62, '#ffffff'), { map: wallpaper, flatShading: false, roughness: 1 }), room.visual);
      backWall.position.set(0, 13, -5.4); backWall.name = 'back-wall';
    }

    // Centra el pivote de la ventana para ampliarla desde su centro.
    const roomWindow = prop('window', room.visual);
    if (blender.windowFrame || blender.windowView) {
      // Desliza la ventana hasta la pared siguiendo la mirada para conservar la composición.
      const parts = [];
      if (blender.windowFrame) parts.push(roomModel(blender.windowFrame, 'window-frame'));
      if (blender.windowView) parts.push(roomModel(blender.windowView, 'window-view'));
      group.updateMatrixWorld(true);
      const wallFront = wallFit ? wallFit.object.position.z : -5.4;
      const back = Math.min(...parts.map(part => new THREE.Box3().setFromObject(part, true).min.z));
      const shift = wallFront + .01 - back, slope = Math.tan(app.Config.oldage.camera.elevation);
      parts.forEach(part => { part.position.z += shift; part.position.y += shift * slope; });
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      parts.forEach(part => bounds.union(new THREE.Box3().setFromObject(part, true)));
      const windowCenter = room.visual.worldToLocal(bounds.getCenter(new THREE.Vector3()));
      roomWindow.root.position.copy(windowCenter);
      parts.forEach(part => { part.position.sub(windowCenter); roomWindow.visual.add(part); });
    } else {
      // Ventana provisional si no está disponible la de Blender.
      const outside = canvasTexture(256, 192, (ctx, w, h) => {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, css(PALETTE.butter, .3, '#ffffff')); sky.addColorStop(1, PALETTE.sage);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        const greens = [PALETTE.lime, PALETTE.sage, css(PALETTE.olive, .35, PALETTE.lime), css(PALETTE.olive, .1, PALETTE.sage), PALETTE.olive];
        for (let i = 0; i < 260; i++) {
          ctx.fillStyle = greens[Math.floor(random() * greens.length)];
          ctx.globalAlpha = .55 + random() * .45;
          const x = random() * w, y = random() * h * 1.05;
          ctx.beginPath(); ctx.ellipse(x, y, 5 + random() * 7, 3 + random() * 4, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = css(PALETTE.plum, .2, PALETTE.olive); ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath(); ctx.moveTo(random() * w, h);
          ctx.quadraticCurveTo(random() * w, h * .5, random() * w, random() * h * .3); ctx.stroke();
        }
      });
      const windowGroup = new THREE.Group();
      roomWindow.root.position.set(-6.2, TABLE_TOP + 3.3, -5.3);
      roomWindow.visual.add(windowGroup);
      const glass = mesh(new THREE.PlaneGeometry(6.6, 4.6), new THREE.MeshBasicMaterial({ map: outside }), windowGroup);
      materials.add(glass.material); glass.castShadow = false;
      const frameMaterial = material(tone(PALETTE.butter, .55, '#ffffff'));
      [[0, 2.45, 7.3, .34], [0, -2.45, 7.3, .34], [-3.45, 0, .34, 5.2], [3.45, 0, .34, 5.2], [0, 0, .26, 4.6]].forEach(([x, y, width, height]) => {
        mesh(new THREE.BoxGeometry(width, height, .26), frameMaterial, windowGroup).position.set(x, y, .12);
      });
      // Travesaños finos sobre cada hoja de la ventana.
      [-1, 1].forEach(side => {
        [-.82, .82].forEach(x => mesh(new THREE.BoxGeometry(.08, 4.6, .12), frameMaterial, windowGroup).position.set(side * 1.65 + x * .5 * side, 0, .08));
        [-1.15, 0, 1.15].forEach(y => mesh(new THREE.BoxGeometry(3.2, .08, .12), frameMaterial, windowGroup).position.set(side * 1.65, y, .08));
      });
      const sill = mesh(softBox(7.8, .24, .8), frameMaterial, windowGroup);
      sill.position.set(0, -2.7, .35);
      [-1, 1].forEach(side => {
        const curtain = new THREE.Group();
        curtain.position.set(side * 4.15, .3, .38);
        windowGroup.add(curtain);
        for (let i = 0; i < 3; i++) {
          const fold = mesh(new THREE.CylinderGeometry(.3, .46, 6.4, 6, 1, true), material(i % 2 ? tone(PALETTE.olive, .45, PALETTE.lime) : tone(PALETTE.olive, .3, PALETTE.butter), { side: THREE.DoubleSide }), curtain);
          fold.position.set(side * (i * .38 - .38), -.3, (i % 2) * .08);
          fold.castShadow = false;
        }
        const tie = mesh(new THREE.TorusGeometry(.62, .06, 4, 8), material(PALETTE.butter), curtain);
        tie.rotation.x = Math.PI / 2; tie.position.set(0, -1.2, .05); tie.scale.set(1, .6, 1);
      });
      const rod = mesh(new THREE.CylinderGeometry(.07, .07, 9.6, 6), material(PALETTE.plum), windowGroup);
      rod.rotation.z = Math.PI / 2; rod.position.set(0, 3.0, .55);
    }

    // Mesa.
    const table = prop('table');
    // Apoya la mesa pintada en TABLE_TOP y conserva su escala uniforme.
    const paintedTable = blender.table;
    let tableFit = null;
    if (paintedTable) {
      paintedTable.object.position.set(paintedTable.x, TABLE_TOP, paintedTable.back);
      table.visual.add(paintedTable.object);
      tableFit = paintedTable;
    } else {
      // Usa la mesa provisional mientras la pintada no esté disponible.
      const TABLE_BACK = -4.4;
      const woodTexture = canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        for (let plank = 0; plank < 6; plank++) {
          const x0 = plank * w / 6;
          ctx.fillStyle = `rgba(90,50,58,${.03 + random() * .07})`; ctx.fillRect(x0, 0, w / 6, h);
          for (let i = 0; i < 9; i++) {
            ctx.strokeStyle = `rgba(90,50,58,${.05 + random() * .1})`; ctx.lineWidth = .8 + random() * 2;
            const x = x0 + 6 + random() * (w / 6 - 12);
            ctx.beginPath(); ctx.moveTo(x, 0);
            for (let y = 0; y <= h; y += 24) ctx.lineTo(x + Math.sin(y * .03 + i) * 3, y);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(70,35,40,.32)'; ctx.fillRect(x0, 0, 2, h);
        }
      });
      const wood = material(tone(PALETTE.clay, .05, '#ffffff'), { map: woodTexture });
      const woodDark = material(tone(PALETTE.clay, .38, PALETTE.plum));
      // Extiende la mesa fuera del encuadre para ocultar el piso en todos los ángulos.
      const TABLE_WIDTH = 100, TABLE_FRONT = 40;
      const top = mesh(softBox(TABLE_WIDTH, .5, TABLE_FRONT - TABLE_BACK, .3), wood, table.visual);
      top.position.set(0, TABLE_TOP - .25, (TABLE_FRONT + TABLE_BACK) / 2); top.name = 'table-top';
      const apron = mesh(new THREE.BoxGeometry(TABLE_WIDTH - 1, .8, TABLE_FRONT - TABLE_BACK - 1), woodDark, table.visual);
      apron.position.set(0, TABLE_TOP - .9, (TABLE_FRONT + TABLE_BACK) / 2);
      const legX = TABLE_WIDTH / 2 - 1, legBack = TABLE_BACK + .9, legFront = TABLE_FRONT - .9;
      [[-legX, legBack], [-legX, legFront], [legX, legBack], [legX, legFront]].forEach(([x, z]) => {
        const leg = mesh(lathe([[.3, 0], [.22, .4], [.32, 1.0], [.24, TABLE_TOP - 1.2], [0, TABLE_TOP - 1.2]], 6), woodDark, table.visual);
        leg.position.set(x, 0, z);
      });
    }
    // El piso queda bajo la mesa para que detrás se vea la pared.
    floor.position.z = (tableFit ? tableFit.back : -4.4) + 20;
    // El mantel marca el destino de la maceta elegida.
    const center = new THREE.Vector3(CENTER.x, TABLE_TOP + .05, CENTER.z);
    if (blender.placemat) {
      const placemat = blender.placemat;
      placemat.name = 'center-placemat';
      placemat.position.y = lift;
      table.visual.add(placemat);
      group.updateMatrixWorld(true);
      placemat.position.y += TABLE_TOP + .002 - new THREE.Box3().setFromObject(placemat, true).min.y;
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(placemat, true);
      center.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    } else {
      const placemat = mesh(new THREE.CylinderGeometry(1.35, 1.38, .05, 12), material(tone(PALETTE.butter, .15, PALETTE.clay)), table.visual);
      placemat.position.set(CENTER.x, TABLE_TOP + .025, CENTER.z); placemat.name = 'center-placemat';
      const placematRing = mesh(new THREE.TorusGeometry(1.08, .045, 4, 14), material(tone(PALETTE.clay, .1)), table.visual);
      placematRing.rotation.x = -Math.PI / 2; placematRing.position.set(CENTER.x, TABLE_TOP + .055, CENTER.z);
    }

    // Gafas: lentes hacia +Z, puente en el origen y varillas hacia -Z.
    const glasses = prop('glasses');
    if (blender.glasses) {
      // Centra el pivote en la montura y conserva la inclinación de reposo en visual.
      const model = blender.glasses, { lean, center: middle } = model.userData;
      model.position.set(-middle.x, -middle.y, -middle.z);
      const upright = new THREE.Group();
      upright.rotation.x = lean;
      upright.add(model);
      glasses.visual.add(upright);
      glasses.visual.rotation.set(-lean, 0, 0);
      settle(glasses.root, middle.x, middle.z, 0, TABLE_TOP, .004);
      fromFile.add(glasses);
    } else {
      const frame = new THREE.Group();
      frame.name = 'glasses-frame';
      glasses.visual.add(frame);
      const frameDark = material(tone(PALETTE.plum, .35), { roughness: .6 });
      const lensMaterial = new THREE.MeshStandardMaterial({ color: tone(PALETTE.sky, .55, '#ffffff'), transparent: true, opacity: .3, roughness: .1, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
      materials.add(lensMaterial);
      [-1, 1].forEach(side => {
        const rim = mesh(new THREE.TorusGeometry(.42, .065, 5, 12), frameDark, frame);
        rim.position.x = side * .56;
        const lens = mesh(new THREE.CircleGeometry(.42, 12), lensMaterial, frame);
        lens.position.x = side * .56;
        lens.castShadow = false; lens.userData.lens = true; lens.name = 'glasses-lens';
        const hinge = mesh(new THREE.BoxGeometry(.14, .1, .12), frameDark, frame);
        hinge.position.set(side * 1.02, .14, -.05);
        const temple = new THREE.Group();
        temple.name = side < 0 ? 'glasses-temple-left' : 'glasses-temple-right';
        temple.position.set(side * 1.04, .14, -.1);
        frame.add(temple);
        const arm = mesh(new THREE.BoxGeometry(.065, .075, 1.5), frameDark, temple);
        arm.position.z = -.75;
        const tip = mesh(new THREE.BoxGeometry(.065, .25, .07), frameDark, temple);
        tip.position.set(0, -.1, -1.48); tip.rotation.x = -.5;
        // Ambas varillas quedan plegadas detrás de las lentes.
        temple.rotation.y = side < 0 ? -1.42 : 1.38;
        temple.position.z -= side < 0 ? .02 : .1;
      });
      const bridge = mesh(new THREE.TorusGeometry(.12, .05, 4, 6, Math.PI), frameDark, frame);
      bridge.position.y = .12;
      // Apoya las gafas en las varillas y los aros con una leve inclinación.
      glasses.visual.rotation.set(-.35, 0, 0);
    }

    // La planta viaja con su maceta y sus hojas se balancean durante el riego.
    function potBody(target, color, rimColor, profile, segments) {
      mesh(lathe(profile, segments), material(color), target.visual).name = `${target.root.name}-body`;
      const top = profile[profile.length - 1];
      const rim = mesh(new THREE.TorusGeometry(top[0], .1, 4, segments), material(rimColor), target.visual);
      rim.rotation.x = -Math.PI / 2; rim.position.y = top[1];
      const soil = mesh(new THREE.CircleGeometry(top[0] - .05, segments), material(tone(PALETTE.plum, .45)), target.visual);
      soil.rotation.x = -Math.PI / 2; soil.position.y = top[1] - .14;
      return top[1] - .14;
    }
    function plantRoot(name, pot, soilY) {
      const plant = prop(name, pot.visual);
      plant.root.position.y = soilY;
      const sway = new THREE.Group();
      sway.name = `${name}-sway`;
      plant.visual.add(sway);
      plant.sway = sway;
      return plant;
    }
    function leafPivot(parent, x, z, yaw, lean) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0, z);
      pivot.rotation.set(0, yaw, lean, 'YXZ');
      pivot.userData.leaf = true;
      parent.add(pivot);
      return pivot;
    }
    // Sitúa la tierra bajo el borde y hace pivotar cada hoja desde su base.
    function modelPot(target, plantName, model) {
      const body = model.getObjectByName('pot-body'), leaves = model.getObjectByName('plant-leaves');
      const moved = useModel(target, body);
      group.updateMatrixWorld(true);
      const rimY = new THREE.Box3().setFromObject(body, true).max.y - target.root.position.y;
      leaves.position.y += lift + moved;
      leaves.updateMatrixWorld(true);
      const leafY = leaves.children.length ? new THREE.Box3().setFromObject(leaves, true).min.y - target.root.position.y : rimY;
      const soilY = Math.min(rimY, leafY) - .05;
      const plant = plantRoot(plantName, target, soilY);
      group.updateMatrixWorld(true);
      [...leaves.children].forEach(leaf => {
        const pivot = new THREE.Group();
        pivot.userData.leaf = true;
        plant.sway.add(pivot);
        pivot.position.copy(plant.sway.worldToLocal(lowestPoint(leaf)));
        pivot.updateMatrixWorld(true);
        pivot.attach(leaf);
      });
      return { plant, soilY, rimY };
    }
    const potTop = pot => new THREE.Box3().setFromObject(pot.visual.children[0]).max.y - pot.root.position.y;

    // Primera maceta: modelo de Blender o sustituto oscuro con sansevieria.
    const pot1 = prop('pot1');
    let plant1, soil1, rim1;
    if (blender.pot1) ({ plant: plant1, soilY: soil1, rimY: rim1 } = modelPot(pot1, 'plant1', blender.pot1));
    else {
      soil1 = potBody(pot1, tone(PALETTE.olive, .55), tone(PALETTE.olive, .35), [[0, 0], [.7, 0], [.76, .08], [.96, 1.35], [1.0, 1.45]], 10);
      plant1 = plantRoot('plant1', pot1, soil1);
      const stripes = canvasTexture(64, 128, (ctx, w, h) => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(60,58,30,.45)'; ctx.lineWidth = 4;
        for (let y = 6; y < h; y += 13) {
          ctx.beginPath(); ctx.moveTo(0, y);
          for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * .25 + y) * 3);
          ctx.stroke();
        }
      });
      const bladeShape = new THREE.Shape();
      bladeShape.moveTo(-.17, 0); bladeShape.quadraticCurveTo(-.24, 1.15, 0, 2.2); bladeShape.quadraticCurveTo(.24, 1.15, .17, 0);
      const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: .05, bevelEnabled: false, curveSegments: 3 });
      blade.translate(0, 0, -.025);
      // Normaliza las UV planas para dibujar las franjas.
      const bladeUv = blade.attributes.uv, bladePosition = blade.attributes.position;
      for (let i = 0; i < bladeUv.count; i++) bladeUv.setXY(i, bladePosition.getX(i) * 2 + .5, bladePosition.getY(i) / 2.2);
      const bladeColors = [tone(PALETTE.olive, .25, PALETTE.lime), tone(PALETTE.olive, .05, PALETTE.lime), tone(PALETTE.lime, .35, PALETTE.olive)];
      const bladeEdge = material(tone(PALETTE.lime, .15, PALETTE.butter), { side: THREE.DoubleSide });
      for (let i = 0; i < 10; i++) {
        const angle = i / 10 * Math.PI * 2 + random() * .3;
        const pivot = leafPivot(plant1.sway, Math.cos(angle) * .3, Math.sin(angle) * .3, -angle + Math.PI / 2, (.1 + random() * .2) * (i % 2 ? 1 : -1));
        const height = .75 + random() * .5;
        const leaf = mesh(blade, material(bladeColors[i % bladeColors.length], { map: stripes, side: THREE.DoubleSide }), pivot);
        leaf.scale.set(1, height, 1);
        // Una hoja ligeramente más ancha detrás forma el borde verde amarillento.
        const edge = mesh(blade, bladeEdge, pivot);
        edge.scale.set(1.14, height * 1.01, .6); edge.position.z = -.012; edge.castShadow = false;
      }
    }

    // Segunda maceta: modelo de Blender o sustituto octagonal con hojas anchas.
    const pot2 = prop('pot2');
    let plant2, soil2, rim2;
    if (blender.pot2) ({ plant: plant2, soilY: soil2, rimY: rim2 } = modelPot(pot2, 'plant2', blender.pot2));
    else {
      soil2 = potBody(pot2, tone(PALETTE.plum, .12, PALETTE.clay), tone(PALETTE.plum, .2, PALETTE.clay), [[0, 0], [.6, 0], [.66, .08], [.86, 1.05], [.92, 1.15]], 8);
      plant2 = plantRoot('plant2', pot2, soil2);
      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.42, .25, .28, .7); leafShape.quadraticCurveTo(.12, .95, 0, 1.05);
      leafShape.quadraticCurveTo(-.12, .95, -.28, .7); leafShape.quadraticCurveTo(-.42, .25, 0, 0);
      const leafGeometry = new THREE.ShapeGeometry(leafShape, 2);
      const stemMaterial = material(tone(PALETTE.olive, .3));
      const leafMaterials = [PALETTE.lime, tone(PALETTE.lime, .3, PALETTE.sage), tone(PALETTE.olive, .3, PALETTE.lime), tone(PALETTE.lime, .4, PALETTE.butter)]
        .map(color => material(color, { side: THREE.DoubleSide }));
      for (let i = 0; i < 4; i++) {
        const angle = i / 4 * Math.PI * 2 + .5;
        const height = 1.3 + i * .32;
        const pivot = leafPivot(plant2.sway, Math.cos(angle) * .14, Math.sin(angle) * .14, -angle, .16 + random() * .14);
        const stem = mesh(new THREE.CylinderGeometry(.035, .05, height, 5), stemMaterial, pivot);
        stem.position.y = height / 2;
        for (let j = 0; j < 3; j++) {
          const leaf = mesh(leafGeometry, leafMaterials[(i + j) % leafMaterials.length], pivot);
          leaf.position.y = height * (.45 + j * .27);
          leaf.rotation.set(-.45 + random() * .3, j * 2.3 + random() * .4, (j % 2 ? 1 : -1) * (.9 + random() * .35));
          leaf.scale.setScalar(.9 + random() * .3);
        }
      }
    }
    if (!blender.pot1) rim1 = potTop(pot1);
    if (!blender.pot2) rim2 = potTop(pot2);

    // Regadera con pico hacia -X y anclaje de gotas en watering-can-spout.
    const wateringCan = prop('wateringCan');
    let spoutTip;
    if (blender.wateringCan) {
      useModel(wateringCan, blender.wateringCan);
      spoutTip = wateringCan.visual.getObjectByName('watering-can-spout');
    } else {
      const canMaterial = material(tone(PALETTE.lime, .18, PALETTE.olive), { roughness: .7 });
      const canDark = material(tone(PALETTE.lime, .42, PALETTE.olive));
      const cream = material(tone(PALETTE.butter, .6, '#ffffff'));
      mesh(lathe([[0, 0], [.8, 0], [.86, .1], [.86, 1.3], [.72, 1.55], [0, 1.6]], 12), canMaterial, wateringCan.visual).name = 'watering-can-body';
      [.28, 1.18].forEach(y => {
        const band = mesh(new THREE.CylinderGeometry(.885, .885, .1, 12, 1, true), canDark, wateringCan.visual);
        band.position.y = y;
      });
      const flower = daisy(wateringCan.visual, .42, tone(PALETTE.butter, .7, '#ffffff'), PALETTE.clay);
      flower.position.set(0, .74, .875);
      const lid = mesh(new THREE.CylinderGeometry(.4, .44, .12, 10), canDark, wateringCan.visual);
      lid.position.y = 1.62;
      const spout = mesh(new THREE.CylinderGeometry(.08, .17, 1.75, 7), canMaterial, wateringCan.visual);
      spout.position.set(-1.33, 1.0, 0); spout.rotation.z = Math.PI / 2 - .78;
      const rose = mesh(new THREE.CylinderGeometry(.24, .1, .28, 8), cream, wateringCan.visual);
      rose.position.set(-1.98, 1.64, 0); rose.rotation.z = Math.PI / 2 - .78;
      spoutTip = new THREE.Object3D();
      spoutTip.name = 'watering-can-spout';
      spoutTip.position.set(-2.08, 1.74, 0);
      wateringCan.visual.add(spoutTip);
      const handle = mesh(new THREE.TorusGeometry(.78, .11, 5, 12, Math.PI * 1.25), canMaterial, wateringCan.visual);
      handle.position.set(.42, 1.3, 0); handle.rotation.z = -.32;
    }

    // La antena de la radio y el cuerpo de la taza tienen pivotes propios.
    const radio = prop('radio');
    let antenna = null;
    if (blender.radio) {
      useModel(radio, blender.radio);
      antenna = radio.visual.getObjectByName('radio-antenna') || null;
    } else {
      const radioBody = mesh(frontBox(2.1, 1.5, 1.0, .28), material(PALETTE.clay), radio.visual);
      radioBody.position.y = .75;
      const panel = mesh(frontBox(1.75, 1.15, .1, .16), material(tone(PALETTE.butter, .55, '#ffffff')), radio.visual);
      panel.position.set(0, .75, .48);
      const dial = mesh(new THREE.BoxGeometry(1.4, .26, .06), material(tone(PALETTE.butter, .1, PALETTE.clay)), radio.visual);
      dial.position.set(0, 1.08, .54);
      [-.22, .55].forEach((x, index) => {
        const knob = mesh(new THREE.CylinderGeometry(.2, .22, .14, 8), material(tone(PALETTE.olive, .4)), radio.visual);
        knob.rotation.x = Math.PI / 2; knob.position.set(x, .55, .58); knob.name = `radio-knob-${index}`;
      });
      [.42, .56, .7].forEach(y => mesh(new THREE.BoxGeometry(.42, .05, .04), material(tone(PALETTE.olive, .4)), radio.visual).position.set(-.6, y + .0, .55));
      antenna = new THREE.Group();
      antenna.name = 'radio-antenna';
      antenna.position.set(.6, 1.5, -.1);
      antenna.rotation.z = -.75;
      radio.visual.add(antenna);
      const rodMesh = mesh(new THREE.CylinderGeometry(.03, .045, 1.5, 5), material(tone(PALETTE.sky, .4, PALETTE.olive)), antenna);
      rodMesh.position.y = .75;
      mesh(new THREE.SphereGeometry(.06, 6, 4), material(tone(PALETTE.sky, .4, PALETTE.olive)), antenna).position.y = 1.5;
    }

    const coffeeCup = prop('coffeeCup');
    let cup;
    if (blender.cup) {
      const both = new THREE.Group();
      if (blender.saucer) both.add(blender.saucer);
      both.add(blender.cup);
      useModel(coffeeCup, both);
      cup = blender.cup;
    } else {
      const china = material(tone(PALETTE.butter, .78, '#ffffff'));
      const saucer = mesh(lathe([[0, 0], [.55, 0], [.82, .08], [.84, .12], [.5, .07], [0, .07]], 12), china, coffeeCup.visual);
      saucer.name = 'saucer';
      cup = new THREE.Group();
      cup.name = 'coffee-cup-body';
      coffeeCup.visual.add(cup);
      mesh(lathe([[0, .07], [.28, .07], [.33, .12], [.52, .62], [.48, .62], [.3, .18], [0, .18]], 12), china, cup);
      const goldRim = mesh(new THREE.TorusGeometry(.505, .02, 3, 12), material(PALETTE.butter), cup);
      goldRim.rotation.x = Math.PI / 2; goldRim.position.y = .62;
      const coffee = mesh(new THREE.CircleGeometry(.47, 12), material(tone(PALETTE.plum, .2, PALETTE.clay)), cup);
      coffee.rotation.x = -Math.PI / 2; coffee.position.y = .55;
      const cupHandle = mesh(new THREE.TorusGeometry(.15, .045, 4, 8, Math.PI * 1.3), china, cup);
      cupHandle.position.set(.5, .38, 0); cupHandle.rotation.z = -Math.PI * .62;
      // Motivo de rosa pintado en el lateral de la taza.
      [[0, .37, .44, PALETTE.clay], [-.17, .3, .4, tone(PALETTE.clay, .3, PALETTE.butter)]].forEach(([x, y, z, color]) => {
        const bud = mesh(new THREE.CircleGeometry(.07, 6), material(color, { side: THREE.DoubleSide }), cup);
        bud.position.set(x, y, z); bud.rotation.x = -.35; bud.castShadow = false;
      });
      const beanMaterial = material(tone(PALETTE.plum, .25));
      for (let i = 0; i < 7; i++) {
        const bean = mesh(new THREE.IcosahedronGeometry(.07, 0), beanMaterial, coffeeCup.visual);
        const angle = random() * Math.PI * 2, distance = .9 + random() * .12;
        bean.position.set(Math.cos(angle) * distance, .035, Math.sin(angle) * distance);
        bean.scale.set(1.3, .6, 1);
      }
    }

    // Conserva las posiciones de Blender y distribuye los sustitutos sobre la mesa.
    const place = (item, ...placement) => { if (!fromFile.has(item)) settle(item.root, ...placement); };
    place(radio, -6.4, -2.5, .2);
    place(glasses, -5.2, .95, .12, TABLE_TOP, .004);
    place(pot1, -2.4, -.9);
    place(wateringCan, 1.1, -2.4, -.15);
    place(pot2, 4.3, -.8);
    place(coffeeCup, 5.9, 2.0, -.5);
    group.updateMatrixWorld(true);

    const interactive = { glasses, pot1, pot2, wateringCan };
    const curiosities = { radio, coffeeCup, window: roomWindow };
    Object.entries({ ...interactive, ...curiosities }).forEach(([name, item]) => { item.root.userData.interactive = name; });
    const rest = {};
    Object.entries({ ...interactive, ...curiosities }).forEach(([name, item]) => {
      rest[name] = { position: item.root.position.clone(), quaternion: item.root.quaternion.clone() };
    });
    // Coloca el indicador de riego a la derecha de la regadera.
    const canRight = new THREE.Box3().setFromObject(wateringCan.visual, true).max.x - wateringCan.root.position.x;

    return {
      group, tableTopY: TABLE_TOP, tableFit, wallFit, models, interactive, curiosities, rest,
      // Destino de la maceta, con su base sobre el mantel.
      center,
      pots: {
        pot1: { pot: pot1, plant: { ...plant1 }, soilY: soil1, rimY: rim1 },
        pot2: { pot: pot2, plant: { ...plant2 }, soilY: soil2, rimY: rim2 }
      },
      glasses: { ...glasses },
      wateringCan: { ...wateringCan, spout: spoutTip, gauge: new THREE.Vector3(canRight + .15, .9, 0) },
      radio: { ...radio, antenna },
      coffeeCup: { ...coffeeCup, cup },
      metadata: { palette: PALETTE, modelSlots: MODEL_SLOTS, axis: 'Y-up', spoutAxis: '-X', glassesFront: '+Z' },
      dispose() {
        // Los modelos de Blender incluyen materiales y texturas.
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
        geometries.clear(); materials.clear(); textures.clear();
        group.clear();
      }
    };
  }

  app.OldAgeProps = { build, PALETTE, MODEL_SLOTS, TABLE_TOP, CENTER };
})();
