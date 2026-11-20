(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  // Carga primero el reloj de Blender; la web calcula y anima su arena.
  const SOURCE = 'assets/models/Inicio/reloj de arena/reloj_de_arena_completo/reloj_de_arena_completo.glb';
  // La altura de las ampollas coincide con la del reloj provisional.
  const BULB_HEIGHT = 2.3;

  const { bake } = app.ModelLoader;
  const radial = (position, i) => Math.hypot(position.getX(i), position.getZ(i));

  // Obtiene el perfil del cristal por altura y radio máximo.
  function rings(mesh) {
    const position = mesh.geometry.attributes.position, byHeight = new Map();
    for (let i = 0; i < position.count; i++) {
      const y = Math.round(position.getY(i) * 1e4) / 1e4;
      byHeight.set(y, Math.max(byHeight.get(y) || 0, radial(position, i)));
    }
    return [...byHeight].sort((a, b) => a[0] - b[0]);
  }

  // Interpola el radio entre anillos y limita los extremos.
  function outline(points) {
    return y => {
      if (y <= points[0][0]) return points[0][1];
      for (let i = 1; i < points.length; i++) {
        const [y1, r1] = points[i];
        if (y <= y1) {
          const [y0, r0] = points[i - 1];
          return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0);
        }
      }
      return points[points.length - 1][1];
    };
  }

  /* Centra el cuello, orienta el frente hacia +Z y separa la arena del modelo. */
  function prepare(scene) {
    const group = bake([scene]);
    const meshes = group.children.filter(child => child.isMesh);
    const glass = meshes.find(mesh => mesh.material.transparent);
    if (!glass) throw new Error('el modelo no tiene un cristal transparente');
    // Identifica la arena como la pieza interior del cristal.
    const glassBox = new THREE.Box3().setFromObject(glass);
    const sand = meshes.find(mesh => mesh !== glass && glassBox.containsBox(new THREE.Box3().setFromObject(mesh)));

    // El cuello es el anillo más estrecho de la mitad central.
    const axis = glassBox.getCenter(new THREE.Vector3());
    glass.geometry.translate(-axis.x, 0, -axis.z);
    const raw = rings(glass);
    glass.geometry.translate(axis.x, 0, axis.z);
    const low = glassBox.min.y + (glassBox.max.y - glassBox.min.y) / 4, high = glassBox.max.y - (glassBox.max.y - glassBox.min.y) / 4;
    const neck = raw.filter(([y]) => y > low && y < high).reduce((best, ring) => ring[1] < best[1] ? ring : best)[0];
    const scale = BULB_HEIGHT / ((glassBox.max.y - glassBox.min.y) / 2);
    const matrix = new THREE.Matrix4().makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-axis.x, -neck, -axis.z));
    meshes.forEach(mesh => {
      mesh.geometry.applyMatrix4(matrix);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    });

    const points = rings(glass), radius = outline(points);
    const levels = { top: 0, bottom: points[0][0], mound: 0 };
    let color = new THREE.Color('#ffd08a');
    if (sand) {
      color = sand.material.color.clone();
      // Mide la arena superior y el montón inferior sin incluir el flujo fino.
      const position = sand.geometry.attributes.position, wide = .25 * Math.max(...points.map(([, r]) => r));
      let peak = -Infinity;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i), r = radial(position, i);
        if (y > .05 * BULB_HEIGHT) levels.top = Math.max(levels.top, y);
        else if (y < 0) {
          if (r >= .85 * radius(y)) levels.bottom = Math.max(levels.bottom, y);
          if (r > wide) peak = Math.max(peak, y);
        }
      }
      levels.mound = Math.max(0, peak - levels.bottom);
      sand.removeFromParent();
      sand.geometry.dispose();
    }
    glass.name = 'hourglass-glass';
    return {
      group,
      glass: { name: glass.name, radius, bottom: points[0][0], top: points[points.length - 1][0] },
      sand: { color, ...levels }
    };
  }

  const models = { status: 'loading', template: null, SOURCE };
  models.settled = app.ModelLoader.load(SOURCE)
    .then(gltf => { models.template = prepare(gltf.scene); models.status = 'ready'; })
    .catch(error => { models.status = 'failed'; console.warn('Portada: se usa el reloj de arena provisional.', error); });

  app.IntroModels = models;
})();
