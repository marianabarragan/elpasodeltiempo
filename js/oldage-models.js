(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Carga los GLB de la vejez en su composición original y actualiza copias con npm run models.
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
  // Ajusta la anisotropía al límite de la tarjeta para conservar el detalle de la madera.
  const ANISOTROPY = 8;
  // Identifica las hojas por su nombre en Blender.
  const LEAF = /^hoja/i;

  // Aplica las transformaciones de los nodos a sus mallas.
  const { bake, shade } = app.ModelLoader;
  const boxOf = object => new THREE.Box3().setFromObject(object, true);

  // Reduce la saturación de la mesa en el sombreador para destacar las macetas.
  function desaturate(material, amount) {
    if (!amount) return;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))), ${amount.toFixed(3)});`);
    };
    material.customProgramCacheKey = () => `table-desaturate-${amount}`;
  }

  // Sitúa el origen en el borde trasero superior para escalar sin desplazar el apoyo.
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

  // Obtiene el contorno real de la mesa para calcular su cobertura.
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

  // Suaviza las gafas del prototipo conservando tamaño, posición y material.
  const capsule = (width, length, depth) => {
    const radius = Math.min(width, depth) / 2;
    return new THREE.CapsuleGeometry(radius, length - radius * 2, 8, 20).scale(width / (radius * 2), 1, depth / (radius * 2));
  };
  const GLASSES_PARTS = [
    { size: [.97, .97, .124], make: () => new THREE.TorusGeometry(.42, .065, 20, 72) },        // Aro.
    { size: [.84, .84, 0], make: () => new THREE.CircleGeometry(.42, 72) },                     // Lente.
    { size: [.34, .17, .1], make: () => new THREE.TorusGeometry(.12, .05, 14, 28, Math.PI) },   // Puente.
    { size: [.14, .1, .12], make: () => new THREE.SphereGeometry(.5, 20, 14).scale(.14, .1, .12) }, // Bisagra.
    { size: [.065, .075, 1.5], make: () => capsule(.065, 1.5, .075).rotateX(Math.PI / 2) },    // Varilla.
    { size: [.065, .25, .07], make: () => capsule(.065, .25, .07) }                             // Extremo de la varilla.
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

  // Separa la inclinación de reposo y crea pivotes en las bisagras para abrir las gafas.
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
    // El centro de la montura define el pivote de las gafas.
    const frame = new THREE.Box3(), part = new THREE.Box3();
    scene.traverse(object => {
      if (object.isMesh && !temples.some(temple => temple === object || temple.getObjectById(object.id))) frame.union(part.setFromObject(object, true));
    });
    const center = frame.getCenter(new THREE.Vector3());
    temples.forEach(temple => {
      // La pieza más larga es la varilla; su extremo exterior corresponde a la bisagra.
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

  // Separa maceta y hojas para permitir su balanceo.
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

  // Orienta el pico hacia -X y coloca el origen de las gotas en su extremo.
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

  // Separa la antena con un pivote en la base para animarla al pulsar la radio.
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
    // Conserva el resto de las mallas en su lugar.
    new Set(antenna.map(piece => piece.mesh)).forEach(mesh => {
      const kept = pieces.filter(piece => piece.mesh === mesh && !antenna.includes(piece)).flatMap(piece => piece.triangles);
      const geometry = subset(mesh.geometry, kept);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      if (!kept.length) mesh.removeFromParent();
    });
    return shade(radio);
  }

  // Agrupa triángulos conectados mediante vértices coincidentes.
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

  // Construye una geometría con los triángulos y vértices seleccionados.
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

  // Centra coffee-cup-body en su eje para girar sobre el plato.
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

  // La vista exterior usa su imagen sin iluminación adicional.
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

  /* Carga los modelos de la vejez después de los anteriores y conserva sustitutos si fallan. */
  const models = {
    status: 'loading',
    templates: {},
    // Avisa al terminar la carga, incluso si falla.
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // Clona los objetos; fileTop indica la altura de la mesa exportada.
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
