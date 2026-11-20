'use strict';
// npm run obj convierte OBJ a GLB con Blender y actualiza sus copias; busca BLENDER o la instalación local.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Carpetas de OBJ y subcarpetas excluidas de la conversión.
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
