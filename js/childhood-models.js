(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► MODELOS DE BLENDER DEL ESCENARIO 1 (juego de aros, xilófono y crayón), exportados juntos
  //   en un solo .glb. Cada objeto pertenece a un juguete según su nombre en Blender:
  //   «crayola…» → crayón, «Aro…» / «Aros…» → juego de aros, todo lo demás → xilófono.
  //   Tras exportar desde Blender, `npm run models` actualiza también la copia toys.glb.js
  //   (ver js/model-loader.js).
  const SOURCE = 'assets/models/childhood/toys.glb';
  const toyOf = name => /^crayo/i.test(name) ? 'crayon' : /^aro/i.test(name) ? 'rings' : 'xylophone';
  // Meshes exported with flat shading get smooth normals up to this angle; sharper edges stay.
  const CREASE_ANGLE = 40 * Math.PI / 180;

  // Exported with flat shading: almost every corner is duplicated with its own normal.
  function isFaceted(geometry) {
    const position = geometry.attributes.position;
    const corners = new Set();
    for (let i = 0; i < position.count; i++) {
      corners.add(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
    return corners.size / position.count < .6;
  }

  // Glass-like transmission needs an extra render of the whole scene every frame; a plain
  // translucent material keeps the look (light, clear ring) at the cost of a normal one.
  function simplify(material) {
    if (!material.transmission) return material;
    const light = new THREE.MeshStandardMaterial({
      name: material.name, color: material.color, roughness: Math.max(.15, material.roughness), metalness: 0,
      transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide
    });
    material.dispose();
    return light;
  }

  // Splits the scene into the three toys. Each template is normalised so that its largest
  // measure is 1, centred on the floor (rings, xylophone) or on its axis (crayon, lying along
  // +X with the tip at +X, as the painting controller expects).
  function prepare(gltf, toCreasedNormals) {
    const parts = { rings: new THREE.Group(), xylophone: new THREE.Group(), crayon: new THREE.Group() };
    [...gltf.scene.children].forEach(node => parts[toyOf(node.name)].add(node));
    const templates = {};
    Object.entries(parts).forEach(([toy, part]) => {
      if (!part.children.length) return;
      part.traverse(object => {
        if (!object.isMesh) return;
        if (toCreasedNormals && isFaceted(object.geometry)) {
          const smooth = toCreasedNormals(object.geometry, CREASE_ANGLE);
          object.geometry.dispose();
          object.geometry = smooth;
        }
        object.material = simplify(object.material);
        object.castShadow = !object.material.transparent;
        object.receiveShadow = true;
      });
      // In Blender the crayon stands with its tip up (+Y once exported).
      if (toy === 'crayon') part.rotation.z = -Math.PI / 2;
      part.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(part, true);
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      part.position.set(-center.x, toy === 'crayon' ? -center.y : -box.min.y, -center.z);
      const template = new THREE.Group();
      template.name = `${toy}-model`;
      template.add(part);
      template.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
      templates[toy] = template;
    });
    return templates;
  }

  /**
   * Loads the Blender toys while the start cover is on screen. `ChildhoodProps.build()` uses
   * them when they are ready; otherwise it keeps the provisional toys (js/model-loader.js).
   */
  const models = {
    status: 'loading',
    templates: null,
    ready: false,
    // Calls back once loading has finished, successfully or not (at once if it already has).
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // A fresh copy of one toy (largest measure 1). The crayon gets its own materials so the
    // chosen colour never leaks into the template.
    create(toy) {
      const template = this.templates?.[toy];
      if (!template) return null;
      const copy = template.clone(true);
      if (toy === 'crayon') copy.traverse(object => { if (object.isMesh) object.material = object.material.clone(); });
      return copy;
    }
  };
  // Loads after the start cover's hourglass (js/intro-models.js), the first thing on screen.
  models.settled = (app.IntroModels?.settled || Promise.resolve())
    .then(() => app.ModelLoader.load(SOURCE))
    .then(gltf => prepare(gltf, app.ThreeExamples.toCreasedNormals))
    .then(templates => { models.templates = templates; models.ready = true; models.status = 'ready'; })
    .catch(error => { models.status = 'failed'; console.warn('Escenario 1: se usan los juguetes provisionales.', error); });

  app.ChildhoodModels = models;
})();
