import * as THREE from 'three';
import { EnvironmentRaycastTarget, RaycastSpace, XRMesh, XRPlane } from '@iwsdk/core';
import { AJUSTES } from '../config.js';

// Etiquetas semánticas que nunca son una mesa (registro de etiquetas de WebXR).
const DESCARTADAS = new Set(['floor', 'ceiling', 'wall', 'door', 'window', 'couch', 'bed', 'storage', 'screen', 'lamp', 'plant', 'wall art', 'shelf']);
const ARRIBA = new THREE.Vector3(0, 1, 0);
const horizontal = v => v.setY(0).normalize();

// Superficie horizontal detectada: polígono en el espacio del plano y su pose.
function desdePlano(entidad) {
  const plano = entidad.getValue(XRPlane, '_plane'), objeto = entidad.object3D;
  if (!plano?.polygon?.length || !objeto) return null;
  if (plano.orientation && plano.orientation !== 'horizontal') return null;
  const etiqueta = (plano.semanticLabel || '').toLowerCase();
  if (DESCARTADAS.has(etiqueta)) return null;
  objeto.updateWorldMatrix(true, false);
  if (new THREE.Vector3(0, 1, 0).transformDirection(objeto.matrixWorld).y < .9) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const punto of plano.polygon) {
    minX = Math.min(minX, punto.x); maxX = Math.max(maxX, punto.x);
    minZ = Math.min(minZ, punto.z); maxZ = Math.max(maxZ, punto.z);
  }
  return {
    clave: `plano:${objeto.uuid}`, fuente: 'plano', etiqueta,
    centro: objeto.localToWorld(new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2)),
    ejeX: horizontal(new THREE.Vector3(1, 0, 0).transformDirection(objeto.matrixWorld)),
    ejeZ: horizontal(new THREE.Vector3(0, 0, 1).transformDirection(objeto.matrixWorld)),
    ancho: maxX - minX, fondo: maxZ - minZ
  };
}

// Mueble acotado con etiqueta «table». Su eje vertical local puede ser cualquiera: se busca en el mundo.
function desdeMalla(entidad) {
  if (!entidad.getValue(XRMesh, 'isBounded3D') || entidad.getValue(XRMesh, 'semanticLabel') !== 'table') return null;
  const objeto = entidad.object3D;
  if (!objeto) return null;
  objeto.updateWorldMatrix(true, false);
  const min = entidad.getVectorView(XRMesh, 'min'), max = entidad.getVectorView(XRMesh, 'max');
  const ejes = [0, 1, 2].map(i => new THREE.Vector3().setFromMatrixColumn(objeto.matrixWorld, i).normalize());
  const vertical = [0, 1, 2].reduce((mejor, i) => Math.abs(ejes[i].y) > Math.abs(ejes[mejor].y) ? i : mejor, 0);
  const [a, b] = [0, 1, 2].filter(i => i !== vertical);
  const centro = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  centro.setComponent(vertical, ejes[vertical].y > 0 ? max[vertical] : min[vertical]);
  return {
    clave: `malla:${objeto.uuid}`, fuente: 'malla', etiqueta: 'table',
    centro: objeto.localToWorld(centro),
    ejeX: horizontal(ejes[a].clone()), ejeZ: horizontal(ejes[b].clone()),
    ancho: max[a] - min[a], fondo: max[b] - min[b]
  };
}

// Lista las superficies reconocidas, mejor puntuadas primero. Plano y malla de una misma mesa se fusionan.
export function leerCandidatas(sistema, cabeza) {
  const lista = [];
  for (const entidad of sistema.queries.planos.entities) {
    const candidata = desdePlano(entidad);
    if (candidata) lista.push(candidata);
  }
  for (const entidad of sistema.queries.mallas.entities) {
    const candidata = desdeMalla(entidad);
    if (!candidata) continue;
    const igual = lista.find(c => Math.hypot(c.centro.x - candidata.centro.x, c.centro.z - candidata.centro.z) < .3 && Math.abs(c.centro.y - candidata.centro.y) < .08);
    if (igual) igual.etiqueta ||= 'table';
    else lista.push(candidata);
  }
  const { alturaMin, alturaMax, ladoMin } = AJUSTES.mesa;
  return lista
    .filter(c => c.centro.y >= alturaMin && c.centro.y <= alturaMax && Math.min(c.ancho, c.fondo) >= ladoMin)
    .map(c => {
      const distancia = Math.hypot(c.centro.x - cabeza.x, c.centro.z - cabeza.z);
      const trabajo = c.centro.y >= .62 && c.centro.y <= .95;
      c.puntaje = (c.etiqueta === 'table' ? 100 : 0) + (trabajo ? 25 : 0) + Math.min(c.ancho * c.fondo, 1.2) * 10 - distancia * 8;
      return c;
    })
    .sort((x, y) => y.puntaje - x.puntaje);
}

/*
 * Apoyo interno a la selección manual: si el punto señalado cae sobre una superficie que el visor
 * ya reconoció (plano o mueble «table»), se usa esa superficie completa con sus bordes reales.
 * Devuelve null si el punto no pertenece a ninguna.
 */
export function superficieEn(sistema, punto, cabeza) {
  const { ajusteAltura, ajusteBorde } = AJUSTES.mesa;
  const relativo = new THREE.Vector3();
  return leerCandidatas(sistema, cabeza).find(c => {
    relativo.subVectors(punto, c.centro);
    return Math.abs(relativo.y) <= ajusteAltura
      && Math.abs(relativo.dot(c.ejeX)) <= c.ancho / 2 + ajusteBorde
      && Math.abs(relativo.dot(c.ejeZ)) <= c.fondo / 2 + ajusteBorde;
  }) ?? null;
}

// Superficie del tamaño de AJUSTES.mesa.tamanoManual centrada en el punto señalado y orientada al usuario.
export function superficieManual(centro, cabeza) {
  const ejeZ = horizontal(new THREE.Vector3(cabeza.x - centro.x, 0, cabeza.z - centro.z));
  const [ancho, fondo] = AJUSTES.mesa.tamanoManual;
  return { clave: `manual:${Date.now()}`, fuente: 'manual', etiqueta: '', centro: centro.clone(), ejeX: new THREE.Vector3().crossVectors(ARRIBA, ejeZ), ejeZ, ancho, fondo };
}

/*
 * Selección manual, ruta principal para elegir la superficie: un aro sigue el rayo de la mano o el
 * control derechos sobre superficies reales (hit test) y el pellizco o el gatillo de esa mano
 * entrega el punto señalado. Los puntos a la altura del piso se ignoran.
 */
export function crearColocacionManual(world, { alColocar }) {
  const aro = new THREE.Mesh(new THREE.RingGeometry(.035, .05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fb3d3', transparent: true, opacity: .9, toneMapped: false }));
  aro.name = 'aro-colocacion';
  aro.visible = false;
  const entidad = world.createTransformEntity(aro, { persistent: true });
  const estado = { activo: false };
  const alSeleccionar = evento => {
    if (!estado.activo || !entidad.getValue(EnvironmentRaycastTarget, 'xrHitTestResult')) return;
    if (evento?.inputSource?.handedness && evento.inputSource.handedness !== 'right') return;
    const punto = aro.getWorldPosition(new THREE.Vector3());
    if (punto.y < AJUSTES.mesa.alturaSenalMin) return;
    alColocar(punto);
  };
  return {
    iniciar() {
      estado.activo = true;
      if (!entidad.hasComponent(EnvironmentRaycastTarget)) entidad.addComponent(EnvironmentRaycastTarget, { space: RaycastSpace.Right });
      world.session?.addEventListener('select', alSeleccionar);
    },
    detener() {
      estado.activo = false;
      world.session?.removeEventListener('select', alSeleccionar);
      if (entidad.hasComponent(EnvironmentRaycastTarget)) entidad.removeComponent(EnvironmentRaycastTarget);
      aro.visible = false;
    }
  };
}

// Mesa visible solo en el emulador, para probar el recorrido cuando no entrega superficies.
export function crearMesaSimulada(world, cabeza, texto) {
  const { ancho, fondo, alto, distancia } = AJUSTES.mesa.simulada;
  const ojo = cabeza.clone().setY(0);
  const adelante = new THREE.Vector3(0, 0, -1);
  const centro = ojo.clone().addScaledVector(adelante, distancia + fondo / 2).setY(alto);
  const madera = new THREE.MeshStandardMaterial({ color: '#b9a48a', roughness: .9 });
  const mesa = new THREE.Group();
  mesa.name = 'mesa-simulada';
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(ancho, .03, fondo), madera);
  tablero.position.y = alto - .015;
  mesa.add(tablero);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
    const pata = new THREE.Mesh(new THREE.BoxGeometry(.04, alto - .03, .04), madera);
    pata.position.set(x * (ancho / 2 - .05), (alto - .03) / 2, z * (fondo / 2 - .05));
    mesa.add(pata);
  });
  // Rótulo claramente identificado sobre el canto frontal.
  const lienzo = document.createElement('canvas');
  lienzo.width = 1024; lienzo.height = 96;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 512, 50);
  const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(.6, .056), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lienzo), toneMapped: false }));
  rotulo.position.set(0, alto - .05, fondo / 2 + .002);
  mesa.add(rotulo);
  mesa.position.set(centro.x, 0, centro.z);
  world.createTransformEntity(mesa, { persistent: true });
  return {
    clave: 'simulada', fuente: 'simulada', etiqueta: 'table',
    centro: new THREE.Vector3(centro.x, alto, centro.z),
    ejeX: new THREE.Vector3(1, 0, 0), ejeZ: new THREE.Vector3(0, 0, 1), ancho, fondo
  };
}
