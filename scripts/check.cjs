'use strict';
const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['script.js', ...readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).map(file => 'js/' + file)];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Sintaxis correcta: ${files.length} módulos.`);
