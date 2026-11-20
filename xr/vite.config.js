import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';
import { RECURSOS_ORIGINALES } from './src/recursos.js';

// El complemento de IWSDK abre por defecto su propio Chromium (lo descarga la primera vez).
// Sin esta variable, `npm run dev` usa el navegador habitual con el emulador IWER.
process.env.IWSDK_DEV_OPEN ??= 'false';

const proyecto = fileURLToPath(new URL('..', import.meta.url));
const assets = path.join(proyecto, 'assets');
const TIPOS = {
  '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.js': 'text/javascript; charset=utf-8', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

// Sirve los recursos de la experiencia original sin duplicarlos y copia al compilar solo los que se usan.
function recursosOriginales() {
  return {
    name: 'recursos-originales',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        let archivo;
        try { archivo = path.resolve(assets, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname)); }
        catch { return next(); }
        if (!archivo.startsWith(assets + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return next();
        res.setHeader('Content-Type', TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        // Rangos de bytes (206), como un servidor estático: cada reproductor de música pide solo lo que
        // necesita. Sin esto, cada <audio> descarga el archivo entero y deja de leerlo; con tres pistas de
        // 6 MB se llena la ventana de la conexión HTTP/2 de Chrome y los modelos dejan de llegar.
        const { size } = fs.statSync(archivo);
        res.setHeader('Accept-Ranges', 'bytes');
        const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        let inicio = 0, fin = size - 1;
        if (rango && (rango[1] || rango[2])) {
          if (rango[1]) { inicio = Number(rango[1]); if (rango[2]) fin = Math.min(Number(rango[2]), size - 1); }
          else inicio = Math.max(0, size - Number(rango[2]));
          if (inicio >= size || fin < inicio) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${inicio}-${fin}/${size}`);
        }
        res.setHeader('Content-Length', fin - inicio + 1);
        const flujo = fs.createReadStream(archivo, { start: inicio, end: fin });
        // Si el navegador cancela la descarga, se deja de leer el archivo.
        res.on('close', () => flujo.destroy());
        flujo.pipe(res);
      });
    },
    writeBundle(opciones) {
      for (const ruta of RECURSOS_ORIGINALES) {
        const destino = path.join(opciones.dir, 'assets', ruta);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(path.join(assets, ruta), destino);
      }
    }
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), recursosOriginales()],
  // ABRIR_NAVEGADOR=0 evita abrir una pestaña al iniciar el servidor (pruebas automáticas).
  server: { host: '0.0.0.0', port: 8081, open: process.env.ABRIR_NAVEGADOR !== '0', fs: { allow: [proyecto] } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
    // Los recursos originales van en dist/assets; el código compilado, aparte.
    assetsDir: 'app',
    rollupOptions: { input: './index.html' }
  },
  esbuild: { target: 'esnext' },
  // Una sola copia de three y uikit: duplicados rompen los paneles de UIKitML.
  resolve: { dedupe: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide'] },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: ['three', '@pmndrs/uikit', '@pmndrs/uikit-horizon', '@pmndrs/uikit-lucide', '@drawcall/uikitml', 'gsap'],
    esbuildOptions: { target: 'esnext' }
  },
  publicDir: 'public',
  base: './'
});
