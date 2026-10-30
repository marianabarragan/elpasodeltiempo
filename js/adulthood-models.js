(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► OBJETOS DEL ESCENARIO 2 (Blender, exportados en OBJ). Cada `.glb` es la conversión de
  //   tu OBJ con el mismo nombre y carpeta (texturas dentro, en WebP de 1024 px como máximo).
  //   La web conserva su forma y sus proporciones: AdulthoodProps escala cada uno de forma
  //   uniforme al tamaño del objeto que reemplaza y lo pone en su lugar, con sus funciones.
  //   Tras convertir de nuevo un OBJ, `npm run models` actualiza su copia .glb.js.
  const SOURCES = Object.freeze({
    desk: 'assets/models/adulthood/mesa/mesa.glb',
    wall: 'assets/models/adulthood/pared_fondo/pared_fondo.glb',
    monitor: 'assets/models/adulthood/computador/monitor.glb',
    screen: 'assets/models/adulthood/computador/pantalla.glb',
    keyboard: 'assets/models/adulthood/computador/teclado.glb',
    clockDigital: 'assets/models/adulthood/reloj_de_mesa/reloj_de_mesa.glb',
    coffeeThermos: 'assets/models/adulthood/termo/termo.glb',
    plant: 'assets/models/adulthood/matera/matera_y_planta.glb',
    checklistPaper: 'assets/models/adulthood/papel/hoja_pendientes.glb',
    pen: 'assets/models/adulthood/lapicero/lapicero.glb',
    wallCalendar: 'assets/models/adulthood/corcho/corcho_calendario.glb',
    shelf: 'assets/models/adulthood/libros/libros_y_repisa.glb'
  });
  const ANISOTROPY = 8;

  // Every node transform applied to its mesh (see ModelLoader.bake): all templates are flat
  // groups in the coordinates of the exported scene.
  const { bake } = app.ModelLoader;
  const boxOf = object => new THREE.Box3().setFromObject(object, true);
  const meshes = group => group.children.filter(child => child.isMesh);
  const glows = mesh => mesh.material.emissive && mesh.material.emissive.getHSL({}).l > .05;
  const moveGeometry = (mesh, matrix) => { mesh.geometry.applyMatrix4(matrix); return mesh; };
  // Rotation about a vertical (or depth) axis through `center`, applied to every mesh.
  function rotateAbout(group, center, axis, angle) {
    const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    meshes(group).forEach(mesh => moveGeometry(mesh, matrix));
  }
  // Angle (radians) that lines a flat piece up with the axes: the rotation of its
  // smallest-area bounding rectangle in the plane of coordinates `a` and `b` ('x', 'y', 'z').
  function squareAngle(mesh, a, b) {
    const position = mesh.geometry.attributes.position, points = [];
    for (let i = 0; i < position.count; i++) points.push([position[`get${a.toUpperCase()}`](i), position[`get${b.toUpperCase()}`](i)]);
    let best = 0, area = Infinity;
    for (let step = -180; step < 180; step++) {
      const angle = step / 4 * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      points.forEach(([p, q]) => {
        const u = p * c - q * s, v = p * s + q * c;
        a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v);
      });
      if ((a1 - a0) * (b1 - b0) < area - 1e-9) { area = (a1 - a0) * (b1 - b0); best = angle; }
    }
    return best;
  }
  // A sub-part with its own pivot: root at `center` > visual > meshes (geometry around the pivot).
  function pivotPart(name, parts, center) {
    const root = new THREE.Group(), visual = new THREE.Group();
    root.name = name; visual.name = `${name}-visual`;
    root.position.copy(center);
    root.add(visual);
    parts.forEach(mesh => visual.add(moveGeometry(mesh, new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z))));
    return root;
  }

  // ---------- Room ----------
  function prepareSurface(scene) {
    const group = bake([scene]);
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      if (mesh.material.map) mesh.material.map.anisotropy = ANISOTROPY;
    });
    return group;
  }

  // ---------- Monitor ----------
  // The power button (the little disc with the emissive ring) becomes `monitor-power`, with its
  // own pivot, and the ring is `monitor-led` (lit while the screen is on).
  function prepareMonitor(scene) {
    const monitor = bake([scene]);
    const led = meshes(monitor).find(glows);
    if (!led) return monitor;
    const center = boxOf(led).getCenter(new THREE.Vector3());
    const button = meshes(monitor).filter(mesh => mesh === led || (!glows(mesh) && boxOf(mesh).getCenter(new THREE.Vector3()).distanceTo(center) < .05));
    led.name = 'monitor-led';
    led.userData.ignoreScreenLight = true;
    monitor.add(pivotPart('monitor-power', button, center));
    return monitor;
  }

  // The screen picture: unlit (it glows by itself) and centred on its own middle, so the hover
  // zoom grows it in place. Both faces are drawn, as Blender does (its plane faces the wall).
  function prepareScreen(scene) {
    const group = bake([scene]);
    const screen = meshes(group)[0];
    const center = boxOf(screen).getCenter(new THREE.Vector3());
    moveGeometry(screen, new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    screen.position.copy(center);
    screen.name = 'monitor-screen';
    screen.material = new THREE.MeshBasicMaterial({ map: screen.material.map, toneMapped: false, side: THREE.DoubleSide });
    screen.castShadow = false;
    screen.userData.ignoreScreenLight = true;
    return group;
  }

  // ---------- Digital clock ----------
  // Its display is an emissive backlight (`clock-backlight`) behind a transparent layer with the
  // digits (`clock-digits`); switching the clock off darkens the first and hides the second.
  // AdulthoodProps draws the digits on that layer, so its UVs are stretched to cover it exactly
  // (0–1) and `userData.aspect` keeps its width / height.
  function prepareClock(scene) {
    const clock = bake([scene]);
    meshes(clock).forEach(mesh => {
      if (glows(mesh)) mesh.name = 'clock-backlight';
      else if (mesh.material.transparent || mesh.material.alphaTest > 0) {
        mesh.name = 'clock-digits';
        mesh.userData.aspect = fillUV(mesh);
      } else return;
      mesh.castShadow = false;
      mesh.userData.ignoreScreenLight = true;
    });
    return clock;
  }
  // Remaps a flat piece's UVs to 0–1 over its whole face; returns its width / height in the
  // directions of U and V (from the plane through three of its corners).
  function fillUV(mesh) {
    const uv = mesh.geometry.attributes.uv, position = mesh.geometry.attributes.position;
    const u = [Infinity, -Infinity], v = [Infinity, -Infinity];
    for (let i = 0; i < uv.count; i++) {
      u[0] = Math.min(u[0], uv.getX(i)); u[1] = Math.max(u[1], uv.getX(i));
      v[0] = Math.min(v[0], uv.getY(i)); v[1] = Math.max(v[1], uv.getY(i));
    }
    // P = P0 + Δu·A + Δv·B, solved with the first three corners.
    const p = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(position, i));
    const du1 = uv.getX(1) - uv.getX(0), dv1 = uv.getY(1) - uv.getY(0), du2 = uv.getX(2) - uv.getX(0), dv2 = uv.getY(2) - uv.getY(0);
    const det = du1 * dv2 - du2 * dv1, e1 = p[1].clone().sub(p[0]), e2 = p[2].clone().sub(p[0]);
    const alongU = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
    const alongV = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - u[0]) / (u[1] - u[0]), (uv.getY(i) - v[0]) / (v[1] - v[0]));
    uv.needsUpdate = true;
    return alongU.length() * (u[1] - u[0]) / (alongV.length() * (v[1] - v[0]));
  }

  // ---------- Shelf and books ----------
  // Book colours from Config.adulthood.books, by material: the white books turn pastel green or
  // beige, the page edges cream, and the brown books (whose texture read as cork) light greyish
  // blue, with the drawings of their texture in shades of that blue.
  const BOOKS = {
    'Material.010': 'green', 'Material.018': 'beige', 'Material.023': 'green', Material: 'pages',
    'Material.011': 'brown', 'Material.019': 'brown', 'Material.022': 'brown'
  };
  function prepareShelf(scene) {
    const shelf = bake([scene]), colors = app.Config?.adulthood?.books || {}, tinted = new Set();
    meshes(shelf).forEach(({ material }) => {
      const role = BOOKS[material.name], color = colors[role];
      if (!color) return;
      if (!material.map) material.color.set(color);
      else if (!tinted.has(material.map)) { tinted.add(material.map); retint(material.map, color); }
    });
    return shelf;
  }
  // Repaints a texture in `color`: its base tone (the most common brightness) becomes that colour
  // and its speckles and drawings stay as lighter or darker shades of it, a little softened.
  function retint(texture, color) {
    const image = texture.image, canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data;
    const luma = i => .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) histogram[Math.round(luma(i))]++;
    let base = 255;
    for (let value = 0, seen = 0; value < 256; value++) if ((seen += histogram[value]) * 8 >= data.length) { base = Math.max(value, 1); break; }
    const hex = new THREE.Color(color).getHex(), target = [hex >> 16 & 255, hex >> 8 & 255, hex & 255];
    for (let i = 0; i < data.length; i += 4) {
      const shade = 1 + (luma(i) / base - 1) * .7;
      for (let c = 0; c < 3; c++) data[i + c] = target[c] * shade;
    }
    context.putImageData(pixels, 0, 0);
    texture.image = canvas;
    texture.needsUpdate = true;
  }

  // ---------- Checklist paper ----------
  // The sheet (`paper-sheet`) is lined up with the axes, title toward the back (-Z). Its title,
  // tasks and boxes are meshes; `userData.boxes` says where each box falls on the sheet's
  // texture (u, v and half sizes): the checks are drawn there, on the sheet's own picture.
  function preparePaper(scene) {
    const paper = bake([scene]);
    const sheet = meshes(paper).find(mesh => /pendientes/i.test(mesh.name));
    if (!sheet) return paper;
    const center = boxOf(sheet).getCenter(new THREE.Vector3()), up = new THREE.Vector3(0, 1, 0);
    rotateAbout(paper, center, up, -squareAngle(sheet, 'x', 'z'));
    const title = meshes(paper).find(mesh => /titulo/i.test(mesh.name));
    if (title && boxOf(title).getCenter(new THREE.Vector3()).z > center.z) rotateAbout(paper, center, up, Math.PI);
    sheet.name = 'paper-sheet';
    const boxes = meshes(paper).filter(mesh => /casilla/i.test(mesh.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const uvAt = (x, z) => {
      ray.set(new THREE.Vector3(x, center.y + 10, z), down);
      return ray.intersectObject(sheet, false)[0]?.uv;
    };
    paper.userData.boxes = boxes.map((box, index) => {
      box.name = `paper-box-${index + 1}`;
      const { min, max } = boxOf(box), mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(.5);
      const uv = uvAt(mid.x, mid.z), left = uvAt(min.x, mid.z), right = uvAt(max.x, mid.z), back = uvAt(mid.x, min.z), front = uvAt(mid.x, max.z);
      if (!uv || !left || !right || !back || !front) return null;
      return { u: uv.x, v: uv.y, hu: Math.abs(right.x - left.x) / 2, hv: Math.abs(front.y - back.y) / 2 };
    }).filter(Boolean);
    return paper;
  }

  // ---------- Pen ----------
  // Lined up along +X with its tip at +X and the clip on top (+Y), like the provisional pen;
  // `userData.tip` is the tip, on the pen's axis.
  function preparePen(scene) {
    const pen = bake([scene]);
    const clip = meshes(pen).find(mesh => /clip/i.test(mesh.name));
    const body = meshes(pen).find(mesh => mesh !== clip) || meshes(pen)[0];
    const center = boxOf(body).getCenter(new THREE.Vector3());
    // Long axis on the desk: principal direction of the body's points (x, z).
    const position = body.geometry.attributes.position;
    let xx = 0, xz = 0, zz = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) - center.x, z = position.getZ(i) - center.z;
      xx += x * x; xz += x * z; zz += z * z;
    }
    let angle = .5 * Math.atan2(2 * xz, xx - zz);
    // The tip is the end away from the clip.
    if (clip) {
      const toClip = boxOf(clip).getCenter(new THREE.Vector3()).sub(center);
      if (toClip.x * Math.cos(angle) + toClip.z * Math.sin(angle) > 0) angle += Math.PI;
    }
    rotateAbout(pen, center, new THREE.Vector3(0, 1, 0), angle);
    body.name = 'pen-body';
    if (clip) clip.name = 'pen-clip';
    const box = boxOf(body);
    pen.userData.tip = new THREE.Vector3(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    return pen;
  }

  // ---------- Wall calendar ----------
  // The cork board, upright, with its blank sheet as `calendar-sheet`; the month pages are laid
  // over that sheet (AdulthoodProps).
  function prepareCalendar(scene) {
    const calendar = bake([scene]);
    const all = meshes(calendar).map(mesh => ({ mesh, box: boxOf(mesh) }));
    const area = ({ box }) => (box.max.x - box.min.x) * (box.max.y - box.min.y);
    const board = all.reduce((a, b) => (area(b) > area(a) ? b : a));
    const boardHeight = board.box.max.y - board.box.min.y;
    const sheet = all.filter(item => item !== board && item.box.max.y - item.box.min.y > boardHeight * .3)
      .reduce((a, b) => (!a || area(b) > area(a) ? b : a), null);
    if (!sheet) return calendar;
    sheet.mesh.name = 'calendar-sheet';
    const center = sheet.box.getCenter(new THREE.Vector3());
    rotateAbout(calendar, center, new THREE.Vector3(0, 0, 1), squareAngle(sheet.mesh, 'x', 'y'));
    return calendar;
  }

  const PREPARE = {
    desk: prepareSurface,
    wall: prepareSurface,
    monitor: prepareMonitor,
    screen: prepareScreen,
    keyboard: scene => bake([scene]),
    clockDigital: prepareClock,
    coffeeThermos: scene => bake([scene]),
    plant: scene => bake([scene]),
    checklistPaper: preparePaper,
    pen: preparePen,
    wallCalendar: prepareCalendar,
    shelf: prepareShelf
  };

  /**
   * Loads the scene 2 objects after the childhood toys (they are first needed in scenario 2).
   * `AdulthoodProps.build()` uses every one that is ready; any missing one keeps its provisional prop.
   */
  const models = {
    status: 'loading',
    templates: {},
    // Calls back once loading has finished, successfully or not (at once if it already has).
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // Fresh copies of the loaded objects, in the coordinates of the exported scene.
    create() {
      return Object.fromEntries(Object.entries(this.templates).map(([name, template]) => [name, template.clone(true)]));
    }
  };
  models.settled = (app.ChildhoodModels?.settled || Promise.resolve())
    .then(() => Promise.allSettled(Object.entries(SOURCES).map(([name, source]) => app.ModelLoader.load(source)
      .then(gltf => { models.templates[name] = PREPARE[name](gltf.scene); })
      .catch(error => console.warn(`Escenario 2: ${source} no cargó; se usa el objeto provisional.`, error)))))
    .then(() => { models.status = 'ready'; });

  app.AdulthoodModels = Object.assign(models, { SOURCES });
})();
