'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json' };
http.createServer((req, res) => {
  let target;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  } catch (_) { res.writeHead(400).end(); return; }
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log(`El paso del tiempo: http://localhost:${port}`));
