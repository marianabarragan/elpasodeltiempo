(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Carga GLB mediante servidor o sus copias .glb.js desde disco; npm run models las actualiza.

  // Lee el GLB desde el servidor.
  function fetchModel(source) {
    return fetch(source).then(response => {
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      return response.arrayBuffer();
    });
  }

  // Carga la copia en script registrada con la misma ruta.
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

  // Analiza el glTF con el GLTFLoader de js/vendor/three-examples.js.
  function load(source) {
    if (!app.ThreeExamples) return Promise.reject(new Error('js/vendor/three-examples.js no cargó'));
    const data = location.protocol === 'file:' ? embeddedModel(source) : fetchModel(source).catch(() => embeddedModel(source));
    return data.then(buffer => new app.ThreeExamples.GLTFLoader().parseAsync(buffer, ''));
  }

  // Utilidades compartidas por las escenas.
  function shade(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
    });
    return root;
  }

  // Invierte los triángulos de geometrías reflejadas para conservar sus caras exteriores.
  function flipWinding(geometry) {
    if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geometry.index.needsUpdate = true;
  }

  // Aplica las transformaciones a la geometría para trabajar en unidades de escena.
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
