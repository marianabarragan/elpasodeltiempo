import * as THREE from 'three';
import { PANELES } from './paneles.js';

/*
 * Superficies en las que la mano virtual se detiene en vez de hundirse (como al pulsar un panel de Meta):
 * la cara de cada panel a la vista, la del tablero de corcho y la superficie base del escenario activo
 * (piso de rompecabezas con su hoja, escritorio o mesa pintada). Cada una es un rectángulo en el mundo:
 * `centro`, `normal` (hacia donde se mira la cara), ejes `u` y `v` y medios lados `mu` y `mv` (m).
 *
 * `tablero()`: el grupo del tablero o null. `escenario()`: { raiz, area, superficie } del escenario activo o null.
 *
 * Además, los objetos 3D del escenario activo (`cuerpos()`: [{ objeto, libre }]) cuentan como cuerpos: cada malla
 * es una caja orientada ajustada a su geometría (la pantalla del monitor, su base, cada tecla…), así la mano
 * dibujada tampoco los atraviesa. Lo que está en la mano (`libre` falso) no cuenta. `envolturas()`: cilindros de
 * lo que se sostiene envolviéndolo (el termo), que la mano dibujada rodea con los dedos.
 */
export function crearSuperficies({ tablero = () => null, escenario = () => null, cuerpos = () => [], envolturas = () => [] } = {}) {
  const lista = [], reserva = [];
  const cajas = new WeakMap(), inversa = new THREE.Matrix4(), esquina = new THREE.Vector3(), caja = new THREE.Box3();
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
  // `tapa`: la cara oculta lo que está detrás aunque no escriba profundidad (los paneles UIKit no la escriben).
  const nueva = () => reserva.pop() ?? { centro: new THREE.Vector3(), normal: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), mu: 0, mv: 0, tapa: false };

  // Caja del objeto en su propio espacio (se mide cada segundo: el texto de un panel puede cambiar su tamaño).
  function cajaLocal(objeto, ahora) {
    const guardada = cajas.get(objeto);
    if (guardada && ahora - guardada.t < 1000) return guardada.caja;
    objeto.updateWorldMatrix(true, true);
    caja.setFromObject(objeto);
    const local = guardada?.caja ?? new THREE.Box3();
    local.makeEmpty();
    if (!caja.isEmpty() && Number.isFinite(caja.min.x)) {
      inversa.copy(objeto.matrixWorld).invert();
      for (const x of [caja.min.x, caja.max.x]) for (const y of [caja.min.y, caja.max.y]) for (const z of [caja.min.z, caja.max.z]) local.expandByPoint(esquina.set(x, y, z).applyMatrix4(inversa));
    }
    cajas.set(objeto, { caja: local, t: ahora });
    return local;
  }

  // Cara frontal (+Z local) de un objeto vertical, a la profundidad `z` de su espacio.
  function cara(objeto, local, z, tapa = false) {
    if (local.isEmpty()) return;
    const s = nueva();
    s.tapa = tapa;
    objeto.matrixWorld.extractBasis(ex, ey, ez);
    const sx = ex.length(), sy = ey.length();
    if (sx < 1e-4 || sy < 1e-4) { reserva.push(s); return; }
    s.centro.set((local.min.x + local.max.x) / 2, (local.min.y + local.max.y) / 2, z).applyMatrix4(objeto.matrixWorld);
    s.u.copy(ex).divideScalar(sx);
    s.v.copy(ey).divideScalar(sy);
    s.normal.copy(ez).normalize();
    s.mu = (local.max.x - local.min.x) / 2 * sx;
    s.mv = (local.max.y - local.min.y) / 2 * sy;
    lista.push(s);
  }

  // ---------- Cuerpos: una caja orientada por malla ----------
  const mallasDe = new WeakMap(), cajasLista = [], cajasReserva = [];
  const esResplandor = m => m.userData.glowShell || m.userData.sombraContacto || [].concat(m.material).every(x => x && x.depthWrite === false);
  function mallas(objeto) {
    let lista = mallasDe.get(objeto);
    if (lista) return lista;
    lista = [];
    objeto.traverse(m => {
      if (!m.isMesh || m.isInstancedMesh || esResplandor(m)) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      if (b.isEmpty()) return;
      lista.push({ malla: m, centro: b.getCenter(new THREE.Vector3()), mitad: b.getSize(new THREE.Vector3()).multiplyScalar(.5) });
    });
    mallasDe.set(objeto, lista);
    return lista;
  }
  const visibleEn = m => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };
  const nuevaCaja = () => cajasReserva.pop() ?? { centro: new THREE.Vector3(), ejes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], mitad: [0, 0, 0] };
  // Cajas (mundo) de los cuerpos libres que quedan a menos de `alcance` m de `punto`.
  function cajasCerca(punto, alcance) {
    while (cajasLista.length) cajasReserva.push(cajasLista.pop());
    for (const { objeto, libre = true } of cuerpos()) {
      if (!libre || !objeto || !visibleEn(objeto)) continue;
      // Pose de este mismo cuadro (los objetos pudieron moverse después del último dibujo).
      objeto.updateWorldMatrix(true, true);
      for (const { malla, centro, mitad } of mallas(objeto)) {
        if (!malla.visible) continue;
        const c = nuevaCaja();
        malla.matrixWorld.extractBasis(c.ejes[0], c.ejes[1], c.ejes[2]);
        const sx = c.ejes[0].length(), sy = c.ejes[1].length(), sz = c.ejes[2].length();
        c.mitad[0] = mitad.x * sx; c.mitad[1] = mitad.y * sy; c.mitad[2] = mitad.z * sz;
        const radio = Math.hypot(c.mitad[0], c.mitad[1], c.mitad[2]);
        c.centro.copy(centro).applyMatrix4(malla.matrixWorld);
        // Lejos de la mano, o diminuta (menos de 4 mm): no cuenta.
        if (radio < .002 || sx < 1e-6 || sy < 1e-6 || sz < 1e-6 || c.centro.distanceTo(punto) > alcance + radio) { cajasReserva.push(c); continue; }
        c.ejes[0].divideScalar(sx); c.ejes[1].divideScalar(sy); c.ejes[2].divideScalar(sz);
        cajasLista.push(c);
      }
    }
    return cajasLista;
  }

  function superficies() {
    while (lista.length) reserva.push(lista.pop());
    const ahora = performance.now();
    // Paneles: su contenido está en el plano z = 0 de su espacio.
    for (const panel of PANELES) {
      if (!panel.visible || !panel.objeto.visible) continue;
      cara(panel.objeto, cajaLocal(panel.objeto, ahora), 0, true);
    }
    // Tablero de corcho: su cara frontal.
    const t = tablero();
    if (t?.visible) { const local = cajaLocal(t, ahora); cara(t, local, local.max.z); }
    // Superficie base del escenario activo (horizontal, mirando hacia arriba).
    const e = escenario();
    if (e?.raiz?.visible) {
      const { raiz, area, superficie } = e, s = nueva();
      s.tapa = false;
      raiz.updateWorldMatrix(true, false);
      raiz.matrixWorld.extractBasis(ex, ey, ez);
      const k = ex.length();
      s.centro.set(0, superficie, 0).applyMatrix4(raiz.matrixWorld);
      s.u.copy(ex).normalize();
      s.v.copy(ez).normalize();
      s.normal.copy(ey).normalize();
      s.mu = area.ancho / 2 * k;
      s.mv = area.fondo / 2 * k;
      lista.push(s);
    }
    return lista;
  }
  superficies.cajas = cajasCerca;
  superficies.envolturas = envolturas;
  return superficies;
}
