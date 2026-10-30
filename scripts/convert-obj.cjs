'use strict';
// Converts the OBJ files the web uses into a .glb next to each one, with Blender
// (scripts/convert-obj.py), then updates the .glb.js copies:
// - scene 2: every OBJ in assets/models/adulthood, except the whole-scene export;
// - start cover: the whole hourglass in assets/models/Inicio/reloj de arena (not its loose
//   parts nor the background).
// Run it after exporting OBJ files again:
//   npm run obj
// Blender is looked for in BLENDER, in "C:/Program Files/Blender Foundation" and on the PATH.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Folders with OBJ files and the subfolders skipped in each (references or loose parts).
const FOLDERS = [
  { dir: 'assets/models/adulthood', skip: ['escena_completa'] },
  { dir: 'assets/models/Inicio/reloj de arena', skip: ['partes', 'fondo'] }
];

function blender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const base = 'C:/Program Files/Blender Foundation';
  if (fs.existsSync(base)) {
    const versions = fs.readdirSync(base).filter(name => fs.existsSync(path.join(base, name, 'blender.exe')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (versions.length) return path.join(base, versions[versions.length - 1], 'blender.exe');
  }
  return 'blender';
}

function objFiles(dir, skip) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return skip.includes(entry.name) ? [] : objFiles(full, skip);
    return /\.obj$/i.test(entry.name) ? [full] : [];
  });
}

const pairs = FOLDERS.flatMap(({ dir, skip }) => objFiles(path.join(root, dir), skip))
  .flatMap(source => [source, source.replace(/\.obj$/i, '.glb')]);
if (!pairs.length) { console.log('No hay archivos .obj para convertir.'); process.exit(0); }
const output = execFileSync(blender(), ['--background', '--factory-startup', '--python', path.join(__dirname, 'convert-obj.py'), '--', ...pairs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
output.split('\n').filter(line => line.startsWith('GLB ')).forEach(line => console.log(path.relative(root, line.slice(4).trim()).split(path.sep).join('/')));
require('./embed-models.cjs');
