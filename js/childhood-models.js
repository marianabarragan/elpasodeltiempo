(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Clasifica los juguetes por nombre en toys.glb; npm run models actualiza su copia.
  const SOURCE = 'assets/models/childhood/toys.glb';
  const toyOf = name => /^crayo/i.test(name) ? 'crayon' : /^aro/i.test(name) ? 'rings' : 'xylophone';
  // Suaviza las normales hasta este ángulo y conserva las aristas más marcadas.
  const CREASE_ANGLE = 40 * Math.PI / 180;

  // Detecta el sombreado plano por las esquinas duplicadas con normales propias.
  function isFaceted(geometry) {
    const position = geometry.attributes.position;
    const corners = new Set();
    for (let i = 0; i < position.count; i++) {
      corners.add(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
    return corners.size / position.count < .6;
  }

  // Usa transparencia sencilla para evitar un render adicional por fotograma.
  function simplify(material) {
    if (!material.transmission) return material;
    const light = new THREE.MeshStandardMaterial({
      name: material.name, color: material.color, roughness: Math.max(.15, material.roughness), metalness: 0,
      transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide
    });
    material.dispose();
    return light;
  }

  // Separa y normaliza los juguetes; la crayola queda alineada con +X.
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
      // La crayola exportada tiene la punta hacia +Y.
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

  /* Carga los juguetes durante la portada y usa sustitutos si no están disponibles. */
  const models = {
    status: 'loading',
    templates: null,
    ready: false,
    // Avisa al terminar la carga, incluso si falla.
    whenSettled(callback) {
      if (this.status !== 'loading') callback();
      else this.settled.then(() => callback());
    },
    // Clona el juguete; la crayola usa materiales propios para cambiar de color.
    create(toy) {
      const template = this.templates?.[toy];
      if (!template) return null;
      const copy = template.clone(true);
      if (toy === 'crayon') copy.traverse(object => { if (object.isMesh) object.material = object.material.clone(); });
      return copy;
    }
  };
  // Carga los juguetes después del reloj de la portada.
  models.settled = (app.IntroModels?.settled || Promise.resolve())
    .then(() => app.ModelLoader.load(SOURCE))
    .then(gltf => prepare(gltf, app.ThreeExamples.toCreasedNormals))
    .then(templates => { models.templates = templates; models.ready = true; models.status = 'ready'; })
    .catch(error => { models.status = 'failed'; console.warn('Escenario 1: se usan los juguetes provisionales.', error); });

  app.ChildhoodModels = models;
})();
