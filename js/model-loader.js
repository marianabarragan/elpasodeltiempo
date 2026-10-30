(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // ► CARGA DE MODELOS .glb (juguetes del escenario 1, mesa del escenario 3).
  //   Con servidor (`npm start`) o en GitHub Pages se lee el .glb. Si la página se abre
  //   directamente desde el disco (file://), el navegador no deja leerlo y se usa su copia en
  //   script `<archivo>.glb.js`. Tras exportar un modelo, `npm run models` actualiza esas copias.

  // The .glb itself (local server, GitHub Pages)…
  function fetchModel(source) {
    return fetch(source).then(response => {
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      return response.arrayBuffer();
    });
  }

  // …or its script copy (scripts/embed-models.cjs), registered under the same path.
  function embeddedModel(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${source}.js`;
      script.onload = () => {
        const base64 = app.embeddedModels?.[source];
        delete app.embeddedModels?.[source];
        script.remove();
        if (!base64) { reject(new Error(`${source}.js vacío`)); return; }
        const binary = atob(base64), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(bytes.buffer);
      };
      script.onerror = () => { script.remove(); reject(new Error(`${source}.js no disponible`)); };
      document.head.appendChild(script);
    });
  }

  // Resolves with the parsed glTF ({ scene, … }) using the classic-script GLTFLoader
  // (js/vendor/three-examples.js).
  function load(source) {
    if (!app.ThreeExamples) return Promise.reject(new Error('js/vendor/three-examples.js no cargó'));
    const data = location.protocol === 'file:' ? embeddedModel(source) : fetchModel(source).catch(() => embeddedModel(source));
    return data.then(buffer => new app.ThreeExamples.GLTFLoader().parseAsync(buffer, ''));
  }

  // ---------- Helpers shared by the scene modules ----------
  function shade(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
    });
    return root;
  }

  // Reverses the triangles of a mirrored geometry (negative scale), so its faces still face out.
  function flipWinding(geometry) {
    if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry.index.needsUpdate = true;
  }

  // Applies every node transform to its mesh: a flat group of meshes in the file's coordinates,
  // each with an identity transform. Glow outlines, hover scaling and pivots then work in scene
  // units, whatever scale or rotation the object had in Blender.
  function bake(objects) {
    const group = new THREE.Group();
    objects.forEach(root => {
      root.updateMatrixWorld(true);
      root.traverse(object => {
        if (!object.isMesh) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        if (object.matrixWorld.determinant() < 0) flipWinding(geometry);
        const mesh = new THREE.Mesh(geometry, object.material);
        mesh.name = object.name;
        group.add(mesh);
      });
    });
    return shade(group);
  }

  app.ModelLoader = { load, bake, shade };
})();
