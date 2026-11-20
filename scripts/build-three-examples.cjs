'use strict';
// Genera GLTFLoader para abrir desde disco; ejecuta npm run vendor tras actualizar Three.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const jsm = path.join(root, 'node_modules/three/examples/jsm');
const version = require(path.join(root, 'node_modules/three/package.json')).version;

// Sustituye las importaciones de Three.js por referencias globales y elimina exportaciones.
function classic(file, replacements = []) {
  let source = fs.readFileSync(path.join(jsm, file), 'utf8');
  source = source.replace(/import\s*\{([^}]*)\}\s*from\s*'three';/, (_, names) => `const {${names}} = THREE;`);
  for (const [from, to] of replacements) {
    if (!from.test(source)) throw new Error(`${file}: ${from} not found`);
    source = source.replace(from, to);
  }
  source = source.replace(/^export\s*\{[^}]*\};?\s*$/m, '').replace(/^export\s+(function|class|const)\s/gm, '$1 ');
  if (/^\s*(import|export)\b/m.test(source)) throw new Error(`${file}: module syntax left`);
  return source;
}

const utils = classic('utils/BufferGeometryUtils.js');
const loader = classic('loaders/GLTFLoader.js', [
  [/import\s*\{\s*toTrianglesDrawMode\s*\}\s*from\s*'\.\.\/utils\/BufferGeometryUtils\.js';/, 'const { toTrianglesDrawMode } = BufferGeometryUtils;']
]);
const output = `// Generado por scripts/build-three-examples.cjs desde three@${version} (licencia MIT: https://github.com/mrdoob/three.js); expone GLTFLoader y toCreasedNormals. No editar.
(() => {
  'use strict';
  const BufferGeometryUtils = (() => {
${utils}
    return { toTrianglesDrawMode, toCreasedNormals };
  })();
  const GLTFLoader = (() => {
${loader}
    return GLTFLoader;
  })();
  const app = window.TimeExperience = window.TimeExperience || {};
  app.ThreeExamples = { GLTFLoader, toCreasedNormals: BufferGeometryUtils.toCreasedNormals };
})();
`;
fs.mkdirSync(path.join(root, 'js/vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'js/vendor/three-examples.js'), output);
console.log(`js/vendor/three-examples.js (three@${version}, ${Math.round(output.length / 1024)} KB)`);
