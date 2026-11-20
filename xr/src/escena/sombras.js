import * as THREE from 'three';
import { AJUSTES } from '../config.js';

// Mancha redonda que se desvanece hacia el borde (una sola textura pequeña para todas las sombras).
let textura = null;
function texturaMancha() {
  if (textura) return textura;
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 64;
  const ctx = lienzo.getContext('2d');
  const gradiente = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradiente.addColorStop(0, 'rgba(255,255,255,1)');
  gradiente.addColorStop(.35, 'rgba(255,255,255,.82)');
  gradiente.addColorStop(.7, 'rgba(255,255,255,.3)');
  gradiente.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, 64, 64);
  textura = new THREE.CanvasTexture(lienzo);
  return textura;
}
const plano = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

// Halos y resplandores (transparentes que no escriben profundidad) no cuentan para la huella.
const esResplandor = malla => malla.userData.glowShell || [].concat(malla.material).every(m => m && m.depthWrite === false);

// Caja de las mallas de `objeto` en su propio espacio, sin su transformación (aunque esté encogido para
// aparecer): se encadenan las matrices locales desde cada malla hasta el objeto.
function cajaPropia(objeto) {
  objeto.updateMatrixWorld(true);
  const caja = new THREE.Box3(), parte = new THREE.Box3(), m = new THREE.Matrix4();
  objeto.traverse(malla => {
    if (!malla.isMesh || malla.userData.sombraContacto || !malla.visible || esResplandor(malla)) return;
    if (!malla.geometry.boundingBox) malla.geometry.computeBoundingBox();
    m.identity();
    for (let o = malla; o && o !== objeto; o = o.parent) m.premultiply(o.matrix);
    caja.union(parte.copy(malla.geometry.boundingBox).applyMatrix4(m));
  });
  return caja.isEmpty() ? null : caja;
}

/*
 * Sombras de contacto económicas, en lugar de las sombras de la luz (que dibujaban la escena una segunda
 * vez cada cuadro, con un mapa de 1024 px filtrado). Cada objeto tiene una mancha suave sobre la superficie
 * en la que se apoya (piso de la niñez, escritorio, mesa pintada o la mesa real): un plano con una textura
 * compartida, transparente y sin escribir profundidad. Cada cuadro se proyecta la caja del objeto sobre la
 * superficie (en el espacio de `padre`): la mancha toma su huella y su giro, sigue al objeto cuando se mueve
 * y se encoge y se aclara cuando se levanta, hasta desaparecer a `alturaMax` m.
 *
 * `superficie(x, z)`: altura de la superficie en el espacio de `padre`. `metros()`: metros por unidad de `padre`.
 */
export function crearSombras(padre, { superficie, metros }) {
  const cfg = AJUSTES.sombras;
  const color = new THREE.Color(cfg.color);
  const entradas = [];
  const inversa = new THREE.Matrix4(), t = new THREE.Matrix4(), centro = new THREE.Vector3();
  const ux = new THREE.Vector3(), uy = new THREE.Vector3(), uz = new THREE.Vector3();

  function agregar(objeto, { opacidad = 1, extension = 1 } = {}) {
    const material = new THREE.MeshBasicMaterial({
      color, map: texturaMancha(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mancha = new THREE.Mesh(plano, material);
    mancha.name = `sombra-${objeto.name || 'objeto'}`;
    mancha.userData.sombraContacto = true;
    mancha.raycast = () => {};
    mancha.pointerEvents = 'none';
    mancha.matrixAutoUpdate = true;
    mancha.visible = false;
    padre.add(mancha);
    entradas.push({ objeto, mancha, material, caja: null, opacidad, extension });
  }

  // El objeto y sus antecesores hasta `padre` están visibles.
  const visible = objeto => { for (let o = objeto; o && o !== padre; o = o.parent) if (!o.visible) return false; return true; };

  function actualizar() {
    padre.updateWorldMatrix(true, false);
    inversa.copy(padre.matrixWorld).invert();
    const metro = metros();
    for (const e of entradas) {
      // La caja se mide la primera vez que el objeto tiene mallas (algunos modelos terminan de armarse tarde).
      if (!e.caja) e.caja = cajaPropia(e.objeto);
      if (!e.caja || !visible(e.objeto)) { e.mancha.visible = false; continue; }
      e.objeto.updateWorldMatrix(true, false);
      t.multiplyMatrices(inversa, e.objeto.matrixWorld);
      e.caja.getCenter(centro).applyMatrix4(t);
      // Semiejes de la caja del objeto en el espacio de `padre` (incluyen su giro y su escala).
      t.extractBasis(ux, uy, uz);
      const hx = (e.caja.max.x - e.caja.min.x) / 2, hy = (e.caja.max.y - e.caja.min.y) / 2, hz = (e.caja.max.z - e.caja.min.z) / 2;
      ux.multiplyScalar(hx); uy.multiplyScalar(hy); uz.multiplyScalar(hz);
      const base = superficie(centro.x, centro.z);
      const fondo = centro.y - Math.abs(ux.y) - Math.abs(uy.y) - Math.abs(uz.y);
      const altura = Math.max(0, fondo - base) * metro;
      const lejos = THREE.MathUtils.clamp(altura / cfg.alturaMax, 0, 1);
      // Huella: elipse con la dispersión de los semiejes proyectados sobre la superficie (x, z).
      const sxx = ux.x * ux.x + uy.x * uy.x + uz.x * uz.x, szz = ux.z * ux.z + uy.z * uy.z + uz.z * uz.z, sxz = ux.x * ux.z + uy.x * uy.z + uz.x * uz.z;
      const medio = (sxx + szz) / 2, diferencia = Math.sqrt(Math.max(0, (sxx - szz) * (sxx - szz) / 4 + sxz * sxz));
      const r1 = Math.sqrt(medio + diferencia), r2 = Math.sqrt(Math.max(medio - diferencia, 0));
      if (r1 * metro < .002) { e.mancha.visible = false; continue; }
      const k = cfg.extension * e.extension * (1 + .35 * lejos);
      e.mancha.visible = true;
      e.mancha.position.set(centro.x, base + cfg.elevacion / metro, centro.z);
      e.mancha.rotation.set(0, -.5 * Math.atan2(2 * sxz, sxx - szz), 0);
      e.mancha.scale.set(r1 * k, 1, Math.max(r2, r1 * .2) * k);
      e.material.opacity = cfg.opacidad * e.opacidad * (1 - lejos) * (1 - lejos);
    }
  }

  return { agregar, actualizar, entradas };
}

/*
 * Borde de sombra alrededor de una base plana y grande que se apoya en la mesa real (el escritorio de la
 * adultez): una franja de `franja` m que va de `opacidad` junto al borde a 0 hacia afuera. Son 8 vértices con
 * color y transparencia propios; debajo de la base no hace falta sombra porque no se ve. Medidas en metros,
 * en el plano XZ de su padre, centrada en el origen.
 */
export function crearBordeSombra(ancho, fondo, { franja = .035, opacidad = AJUSTES.sombras.opacidad * .8 } = {}) {
  const cfg = AJUSTES.sombras, color = new THREE.Color(cfg.color);
  const ax = ancho / 2, az = fondo / 2, bx = ax + franja, bz = az + franja;
  const posiciones = [-ax, 0, -az, ax, 0, -az, ax, 0, az, -ax, 0, az, -bx, 0, -bz, bx, 0, -bz, bx, 0, bz, -bx, 0, bz];
  const colores = [];
  for (let i = 0; i < 8; i++) colores.push(color.r, color.g, color.b, i < 4 ? 1 : 0);
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setAttribute('color', new THREE.Float32BufferAttribute(colores, 4));
  // Cuatro trapecios (dos triángulos cada uno) entre el contorno interior (0–3) y el exterior (4–7), hacia arriba.
  geometria.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4]);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: opacidad, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const borde = new THREE.Mesh(geometria, material);
  borde.name = 'borde-de-sombra';
  borde.userData.sombraContacto = true;
  borde.userData.opacidad = opacidad;
  borde.raycast = () => {};
  borde.pointerEvents = 'none';
  return borde;
}
