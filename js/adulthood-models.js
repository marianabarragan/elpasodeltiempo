(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Carga los GLB de la adultez; npm run models actualiza sus copias para abrir desde disco.
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

  // Aplica las transformaciones a las mallas en coordenadas de la escena exportada.
  const { bake } = app.ModelLoader;
  const boxOf = object => new THREE.Box3().setFromObject(object, true);
  const meshes = group => group.children.filter(child => child.isMesh);
  const glows = mesh => mesh.material.emissive && mesh.material.emissive.getHSL({}).l > .05;
  const moveGeometry = (mesh, matrix) => { mesh.geometry.applyMatrix4(matrix); return mesh; };
  // Gira todas las mallas alrededor del eje que pasa por center.
  function rotateAbout(group, center, axis, angle) {
    const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    meshes(group).forEach(mesh => moveGeometry(mesh, matrix));
  }
  // Calcula el ángulo del rectángulo mínimo para alinear la pieza con los ejes.
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
  // Centra la geometría de cada pieza en su propio pivote.
  function pivotPart(name, parts, center) {
    const root = new THREE.Group(), visual = new THREE.Group();
    root.name = name; visual.name = `${name}-visual`;
    root.position.copy(center);
    root.add(visual);
    parts.forEach(mesh => visual.add(moveGeometry(mesh, new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z))));
    return root;
  }

  // Habitación.
  function prepareSurface(scene) {
    const group = bake([scene]);
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      if (mesh.material.map) mesh.material.map.anisotropy = ANISOTROPY;
    });
    return group;
  }

  // Separa el botón del monitor y su indicador luminoso.
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

  // Centra la pantalla y dibuja ambas caras para ampliarla en su sitio.
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

  // El reloj usa luz de fondo y dígitos separados para controlar su encendido.
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
  // Normaliza las UV de la cara y devuelve su proporción.
  function fillUV(mesh) {
    const uv = mesh.geometry.attributes.uv, position = mesh.geometry.attributes.position;
    const u = [Infinity, -Infinity], v = [Infinity, -Infinity];
    for (let i = 0; i < uv.count; i++) {
      u[0] = Math.min(u[0], uv.getX(i)); u[1] = Math.max(u[1], uv.getX(i));
      v[0] = Math.min(v[0], uv.getY(i)); v[1] = Math.max(v[1], uv.getY(i));
    }
    // Resuelve P = P0 + Δu·A + Δv·B con las primeras tres esquinas.
    const p = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(position, i));
    const du1 = uv.getX(1) - uv.getX(0), dv1 = uv.getY(1) - uv.getY(0), du2 = uv.getX(2) - uv.getX(0), dv2 = uv.getY(2) - uv.getY(0);
    const det = du1 * dv2 - du2 * dv1, e1 = p[1].clone().sub(p[0]), e2 = p[2].clone().sub(p[0]);
    const alongU = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
    const alongV = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - u[0]) / (u[1] - u[0]), (uv.getY(i) - v[0]) / (v[1] - v[0]));
    uv.needsUpdate = true;
    return alongU.length() * (u[1] - u[0]) / (alongV.length() * (v[1] - v[0]));
  }

  // Aplica a libros y cantos los colores de Config.adulthood.books.
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
  // Tiñe la textura conservando sus variaciones de brillo.
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

  // Alinea la hoja y localiza sus casillas en la textura para dibujar las marcas.
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

  // Alinea el lapicero con la punta en +X y el clip en +Y.
  function preparePen(scene) {
    const pen = bake([scene]);
    const clip = meshes(pen).find(mesh => /clip/i.test(mesh.name));
    const body = meshes(pen).find(mesh => mesh !== clip) || meshes(pen)[0];
    const center = boxOf(body).getCenter(new THREE.Vector3());
    // Obtiene el eje longitudinal del cuerpo sobre el plano XZ.
    const position = body.geometry.attributes.position;
    let xx = 0, xz = 0, zz = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) - center.x, z = position.getZ(i) - center.z;
      xx += x * x; xz += x * z; zz += z * z;
    }
    let angle = .5 * Math.atan2(2 * xz, xx - zz);
    // La punta está en el extremo opuesto al clip.
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

  // Endereza el corcho y coloca los meses sobre calendar-sheet.
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

  /* Carga los modelos de la adultez y conserva sustitutos para los que fallen. */
  const models = {
    status: 'loading',
    templates: {},
    // Avisa al terminar la carga, incluso si falla.
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // Devuelve copias de los objetos en las coordenadas exportadas.
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
