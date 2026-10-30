(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► OBJETOS DEL ESCENARIO 3 (Blender). Cada archivo trae su objeto ya ubicado en la
  //   composición de la escena (exportada sobre la referencia de Blender). La web los usa tal
  //   cual: mismo tamaño, forma, texturas y lugar; solo los apoya sobre la mesa y ajusta la
  //   escala de la mesa (y de la pared, si hace falta) para cubrir la vista.
  //   Tras exportar de nuevo un archivo con el mismo nombre, `npm run models` actualiza su copia .glb.js.
  //   `matera1-web.glb` y `taza-web.glb` son copias corregidas de tus exportaciones (la matera 1
  //   con su maceta, que faltaba en matera1.glb; la taza con texturas de 1024 px en vez de 4096).
  const SOURCES = Object.freeze({
    table: 'assets/models/oldage/mesa/mesa.glb',
    wall: 'assets/models/oldage/pared/pared.glb',
    windowFrame: 'assets/models/oldage/ventana/ventanamarco.glb',
    windowView: 'assets/models/oldage/ventana/ventanaexterior.glb',
    placemat: 'assets/models/oldage/reposamatera/reposamatera.glb',
    glasses: 'assets/models/oldage/gafas/gafas.glb',
    pot1: 'assets/models/oldage/matera 1/matera1-web.glb',
    pot2: 'assets/models/oldage/maatera 2/matera2.glb',
    wateringCan: 'assets/models/oldage/regadera/regadera.glb',
    radio: 'assets/models/oldage/radio/radio.glb',
    cup: 'assets/models/oldage/taza/taza-web.glb',
    saucer: 'assets/models/oldage/taza/platotaza.glb'
  });
  // Sharper painted wood at the grazing view angle (capped by the graphics card's maximum).
  const ANISOTROPY = 8;
  // Leaves of a pot's plant: objects whose name starts with «hoja».
  const LEAF = /^hoja/i;

  // Every node transform applied to its mesh (see ModelLoader.bake).
  const { bake, shade } = app.ModelLoader;
  const boxOf = object => new THREE.Box3().setFromObject(object, true);

  // ---------- Table ----------
  // The painted wood loses part of its saturation (Config.oldage.table.desaturate) in the
  // shader, so its grain stays as painted and the clay pots stand out against it.
  function desaturate(material, amount) {
    if (!amount) return;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))), ${amount.toFixed(3)});`);
    };
    material.customProgramCacheKey = () => `table-desaturate-${amount}`;
  }

  // Template with its origin at the middle of the back edge of the top surface: scaling it
  // keeps the top at the table height and the back edge in place. `x`, `back` and `top` say
  // where that point is in the file; `top` is the height every other object is measured from.
  function prepareTable(scene) {
    scene.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const material = object.material;
      [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap]
        .forEach(texture => { if (texture) texture.anisotropy = ANISOTROPY; });
      desaturate(material, app.Config?.oldage?.table?.desaturate || 0);
    });
    scene.updateMatrixWorld(true);
    const box = boxOf(scene), size = box.getSize(new THREE.Vector3());
    const x = (box.min.x + box.max.x) / 2;
    scene.position.set(-x, -box.max.y, -box.min.z);
    const template = new THREE.Group();
    template.name = 'table-model';
    template.add(scene);
    return { template, width: size.x, depth: size.z, outline: topOutline(template, size.y), x, back: box.min.z, top: box.max.y };
  }

  // The real outline of the top surface (x, z; hand-made, so not a perfect rectangle), in the
  // template's space, ordered around its centre. Used to check what the table really covers.
  function topOutline(template, thickness) {
    template.updateMatrixWorld(true);
    const corners = new Map(), vertex = new THREE.Vector3();
    template.traverse(object => {
      if (!object.isMesh) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        if (vertex.y > -thickness * .5) corners.set(`${vertex.x.toFixed(3)},${vertex.z.toFixed(3)}`, [vertex.x, vertex.z]);
      }
    });
    const points = [...corners.values()];
    const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length, cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    return points.sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx));
  }

  // ---------- Glasses ----------
  // The glasses in the file are the prototype's low-poly parts (12-sided rims, boxy temples).
  // Each part with exactly one of these sizes gets a smooth, rounded version of the same shape:
  // same size, place and material. Glasses modelled differently are left as they are.
  const capsule = (width, length, depth) => {
    const radius = Math.min(width, depth) / 2;
    return new THREE.CapsuleGeometry(radius, length - radius * 2, 8, 20).scale(width / (radius * 2), 1, depth / (radius * 2));
  };
  const GLASSES_PARTS = [
    { size: [.97, .97, .124], make: () => new THREE.TorusGeometry(.42, .065, 20, 72) },        // rim
    { size: [.84, .84, 0], make: () => new THREE.CircleGeometry(.42, 72) },                     // lens
    { size: [.34, .17, .1], make: () => new THREE.TorusGeometry(.12, .05, 14, 28, Math.PI) },   // bridge
    { size: [.14, .1, .12], make: () => new THREE.SphereGeometry(.5, 20, 14).scale(.14, .1, .12) }, // hinge
    { size: [.065, .075, 1.5], make: () => capsule(.065, 1.5, .075).rotateX(Math.PI / 2) },    // temple arm
    { size: [.065, .25, .07], make: () => capsule(.065, .25, .07) }                             // ear tip
  ];
  function smoothGlasses(scene) {
    const size = new THREE.Vector3();
    scene.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      object.geometry.boundingBox.getSize(size);
      const part = GLASSES_PARTS.find(({ size: [x, y, z] }) => Math.abs(size.x - x) < .02 && Math.abs(size.y - y) < .02 && Math.abs(size.z - z) < .02);
      if (!part) return;
      object.geometry.dispose();
      object.geometry = part.make();
    });
  }

  // They lie leaning back on the table in the file. The web needs them upright (lenses facing
  // +Z) for the first-person animation, so the lean is kept apart (`userData.lean`, applied by
  // OldAgeProps) and each temple gets a pivot on its hinge: rotation.y = folded angle, 0 = open.
  function prepareGlasses(scene) {
    smoothGlasses(scene);
    scene.updateMatrixWorld(true);
    let lens = null;
    scene.traverse(object => {
      if (!object.isMesh || !/^glasses-lens/.test(object.name)) return;
      object.userData.lens = true;
      object.castShadow = false;
      lens = lens || object;
    });
    const normal = new THREE.Vector3(0, 0, 1);
    if (lens) normal.transformDirection(lens.matrixWorld);
    const lean = Math.atan2(normal.y, normal.z);
    const upright = new THREE.Matrix4().makeRotationX(lean);
    const temples = ['glasses-temple-left', 'glasses-temple-right'].map(name => scene.getObjectByName(name)).filter(Boolean);
    // Frame centre (rims, lenses, bridge): the glasses' pivot, as in the provisional ones.
    const frame = new THREE.Box3(), part = new THREE.Box3();
    scene.traverse(object => {
      if (object.isMesh && !temples.some(temple => temple === object || temple.getObjectById(object.id))) frame.union(part.setFromObject(object, true));
    });
    const center = frame.getCenter(new THREE.Vector3());
    temples.forEach(temple => {
      // The longest part is the arm; its outer end (farthest from the centre) is the hinge.
      let arm = null, armLength = 0;
      temple.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.computeBoundingBox();
        const length = object.geometry.boundingBox.getSize(new THREE.Vector3()).toArray().reduce((a, b) => Math.max(a, b));
        if (length > armLength) { arm = object; armLength = length; }
      });
      if (!arm) return;
      const local = arm.geometry.boundingBox, size = local.getSize(new THREE.Vector3()), mid = local.getCenter(new THREE.Vector3());
      const axis = size.toArray().indexOf(Math.max(...size.toArray()));
      const half = new THREE.Vector3().setComponent(axis, size.getComponent(axis) / 2);
      const ends = [mid.clone().add(half), mid.clone().sub(half)].map(end => end.applyMatrix4(arm.matrixWorld));
      ends.sort((a, b) => Math.abs(b.x - center.x) - Math.abs(a.x - center.x));
      const [hinge, tip] = ends;
      const along = tip.clone().sub(hinge).transformDirection(upright);
      const pivot = new THREE.Group();
      pivot.name = temple.name;
      pivot.position.copy(hinge);
      pivot.rotation.set(-lean, Math.atan2(-along.x, -along.z), 0);
      temple.parent.add(pivot);
      pivot.updateMatrixWorld(true);
      [...temple.children].forEach(child => pivot.attach(child));
      temple.removeFromParent();
    });
    shade(scene);
    scene.traverse(object => { if (object.userData.lens) object.castShadow = false; });
    scene.userData.lean = lean;
    scene.userData.center = center;
    return scene;
  }

  // ---------- Pots ----------
  // The pot (baked) and its plant's leaves (kept as they are, so each one can sway).
  function preparePot(scene) {
    const leaves = scene.children.filter(object => LEAF.test(object.name));
    const body = bake(scene.children.filter(object => !leaves.includes(object)));
    body.name = 'pot-body';
    const plant = new THREE.Group();
    plant.name = 'plant-leaves';
    leaves.forEach(leaf => plant.add(shade(leaf)));
    const template = new THREE.Group();
    template.add(body, plant);
    return template;
  }

  // ---------- Watering can ----------
  // Spout pointing to -X, as the provisional can. Its tip (`watering-can-spout`, where the
  // drops come from) is the middle of the can's leftmost points.
  function prepareCan(scene) {
    const can = bake([scene]);
    const box = boxOf(can), sum = new THREE.Vector3(), point = new THREE.Vector3();
    let count = 0;
    const limit = box.min.x + (box.max.x - box.min.x) * .03;
    can.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        if (point.x <= limit) { sum.add(point); count++; }
      }
    });
    const spout = new THREE.Object3D();
    spout.name = 'watering-can-spout';
    spout.position.copy(count ? sum.divideScalar(count) : box.min);
    can.add(spout);
    return can;
  }

  // ---------- Radio ----------
  // The antenna (every loose piece above the body) becomes its own `radio-antenna`, turning on
  // its base, so it still swings when the radio is clicked.
  function prepareRadio(scene) {
    const radio = bake([scene]);
    const pieces = [];
    radio.children.forEach(mesh => looseParts(mesh.geometry).forEach(triangles => {
      const geometry = subset(mesh.geometry, triangles);
      geometry.computeBoundingBox();
      pieces.push({ mesh, triangles, geometry, box: geometry.boundingBox });
    }));
    const volume = box => { const s = box.getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
    const body = pieces.reduce((a, b) => (volume(b.box) > volume(a.box) ? b : a), pieces[0]);
    const antenna = pieces.filter(piece => piece.box.getCenter(new THREE.Vector3()).y > body.box.max.y);
    if (!antenna.length) return radio;
    const group = new THREE.Group();
    group.name = 'radio-antenna';
    let base = null;
    antenna.forEach(({ geometry }) => {
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        if (!base || position.getY(i) < base.y) base = new THREE.Vector3().fromBufferAttribute(position, i);
      }
    });
    group.position.copy(base);
    radio.add(group);
    antenna.forEach(({ mesh, geometry }) => {
      const part = new THREE.Mesh(geometry.translate(-base.x, -base.y, -base.z), mesh.material);
      part.name = `${mesh.name}-antenna`;
      group.add(part);
    });
    // The rest of each mesh stays in place.
    new Set(antenna.map(piece => piece.mesh)).forEach(mesh => {
      const kept = pieces.filter(piece => piece.mesh === mesh && !antenna.includes(piece)).flatMap(piece => piece.triangles);
      const geometry = subset(mesh.geometry, kept);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      if (!kept.length) mesh.removeFromParent();
    });
    return shade(radio);
  }

  // Triangles grouped by connected piece (vertices welded by position).
  function looseParts(geometry) {
    const position = geometry.attributes.position, index = geometry.index?.array;
    const triangleCount = (index ? index.length : position.count) / 3;
    const weld = new Map(), id = new Int32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
      if (!weld.has(key)) weld.set(key, weld.size);
      id[i] = weld.get(key);
    }
    const parent = Array.from({ length: weld.size }, (_, i) => i);
    const find = a => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    const corner = (t, k) => id[index ? index[t * 3 + k] : t * 3 + k];
    for (let t = 0; t < triangleCount; t++) {
      parent[find(corner(t, 1))] = find(corner(t, 0));
      parent[find(corner(t, 2))] = find(corner(t, 0));
    }
    const parts = new Map();
    for (let t = 0; t < triangleCount; t++) {
      const root = find(corner(t, 0));
      if (!parts.has(root)) parts.set(root, []);
      parts.get(root).push(t);
    }
    return [...parts.values()];
  }

  // A new geometry with only the given triangles (and the vertices they use).
  function subset(geometry, triangles) {
    const index = geometry.index?.array, remap = new Map(), order = [], faces = [];
    triangles.forEach(t => {
      for (let k = 0; k < 3; k++) {
        const vertex = index ? index[t * 3 + k] : t * 3 + k;
        if (!remap.has(vertex)) { remap.set(vertex, order.length); order.push(vertex); }
        faces.push(remap.get(vertex));
      }
    });
    const result = new THREE.BufferGeometry();
    Object.entries(geometry.attributes).forEach(([name, attribute]) => {
      const size = attribute.itemSize, array = new attribute.array.constructor(order.length * size);
      order.forEach((vertex, i) => { for (let c = 0; c < size; c++) array[i * size + c] = attribute.array[vertex * size + c]; });
      result.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    });
    result.setIndex(faces);
    return result;
  }

  // ---------- Cup ----------
  // `coffee-cup-body` turns on the cup's own axis (the centre of its largest part, the body),
  // so it spins in place on the saucer.
  function prepareCup(scene) {
    const cup = bake([scene]);
    let body = null;
    cup.children.forEach(mesh => { if (!body || mesh.geometry.attributes.position.count > body.geometry.attributes.position.count) body = mesh; });
    const bodyBox = boxOf(body), box = boxOf(cup);
    const axis = new THREE.Vector3((bodyBox.min.x + bodyBox.max.x) / 2, box.min.y, (bodyBox.min.z + bodyBox.max.z) / 2);
    cup.children.forEach(mesh => mesh.geometry.translate(-axis.x, -axis.y, -axis.z));
    cup.position.copy(axis);
    cup.name = 'coffee-cup-body';
    return cup;
  }

  // ---------- Room ----------
  // The view outside the window is a picture: unlit, as bright as painted.
  function prepareWindowView(scene) {
    const view = bake([scene]);
    view.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.material = new THREE.MeshBasicMaterial({ map: mesh.material.map, color: mesh.material.color });
      mesh.castShadow = false;
    });
    return view;
  }
  const receiveOnly = group => {
    group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
    return group;
  };

  const PREPARE = {
    table: prepareTable,
    wall: scene => receiveOnly(bake([scene])),
    windowFrame: scene => bake([scene]),
    windowView: prepareWindowView,
    placemat: scene => receiveOnly(bake([scene])),
    glasses: prepareGlasses,
    pot1: preparePot,
    pot2: preparePot,
    wateringCan: prepareCan,
    radio: prepareRadio,
    cup: prepareCup,
    saucer: scene => bake([scene])
  };

  /**
   * Loads the scene 3 objects after the scene 1 and 2 models (they are first needed in scenario 3).
   * `OldAgeProps.build()` uses every one that is ready; any missing one keeps its provisional prop.
   */
  const models = {
    status: 'loading',
    templates: {},
    // Calls back once loading has finished, successfully or not (at once if it already has).
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // Fresh copies of the loaded objects, in the file's coordinates. `fileTop` is the height of
    // the table top in the file; `table` is { object, width, depth, outline, x, back } (or null).
    create() {
      const { table, ...rest } = this.templates;
      const copies = Object.fromEntries(Object.entries(rest).map(([name, template]) => [name, template.clone(true)]));
      return {
        ...copies,
        fileTop: table ? table.top : 0,
        table: table ? { object: table.template.clone(true), width: table.width, depth: table.depth, outline: table.outline, x: table.x, back: table.back } : null
      };
    }
  };
  models.settled = (app.AdulthoodModels?.settled || app.ChildhoodModels?.settled || Promise.resolve())
    .then(() => Promise.allSettled(Object.entries(SOURCES).map(([name, source]) => app.ModelLoader.load(source)
      .then(gltf => { models.templates[name] = PREPARE[name](gltf.scene); })
      .catch(error => console.warn(`Escenario 3: ${source} no cargó; se usa el objeto provisional.`, error)))))
    .then(() => { models.status = 'ready'; });

  app.OldAgeModels = Object.assign(models, { SOURCES });
})();
