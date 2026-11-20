import * as THREE from 'three';
import gsap from 'gsap';

/*
 * Caja abierta de crayolas, en el lenguaje low poly pintado de js/childhood-props.js (sombreado plano,
 * rugosidad 1 y grano de papel). Dos filas de 8 crayolas sobresalen de la caja: la de atrás más alta,
 * así cada punta queda a la vista y se puede tocar o señalar por separado. Los 16 colores llegan de
 * Config.childhood.palette en el orden del proyecto. Medidas en unidades del escenario (la hoja mide 11,5).
 */
const MEDIDA = {
  // Separación entre crayolas, radio y largo de la punta.
  paso: .46, radio: .15, punta: .26,
  // Caja: ancho y fondo interiores, grosor de pared, altura de la pared trasera y de la delantera.
  ancho: 3.86, fondo: 1.08, pared: .07, alturaAtras: 1.62, alturaFrente: 1.08,
  // Altura de la punta de cada fila sobre la base.
  filaAtras: 2.42, filaFrente: 1.92
};
// Colores de la caja tomados de la paleta del escenario (ChildhoodProps.PALETTE) y del papel de la crayola.
const COLORES = { caja: '#F2BB31', franja: '#60AE29', interior: '#fff1c6', canto: '#e8b356', papel: '#fff1c6' };

// Grano de papel como el de childhood-props.js (manchas cálidas y puntos), con semilla propia.
function texturaPintada() {
  let semilla = 52817;
  const azar = () => { semilla = (Math.imul(1664525, semilla) + 1013904223) >>> 0; return semilla / 4294967296; };
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 128;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 28; i++) {
    const x = azar() * 128, y = azar() * 128, r = 12 + azar() * 35;
    const mancha = ctx.createRadialGradient(x, y, 0, x, y, r);
    mancha.addColorStop(0, `rgba(153,120,78,${.012 + azar() * .025})`);
    mancha.addColorStop(1, 'rgba(153,120,78,0)');
    ctx.fillStyle = mancha;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(105,83,53,${.015 + azar() * .035})`;
    ctx.fillRect(azar() * 128, azar() * 128, .5 + azar(), .5 + azar());
  }
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  return textura;
}

export function crearCaja(colores) {
  const grano = texturaPintada();
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, map: grano, roughness: 1, metalness: 0, flatShading: true, ...extra });
  const malla = (geometria, mat, padre) => {
    const m = new THREE.Mesh(geometria, mat);
    m.castShadow = m.receiveShadow = true;
    padre.add(m);
    return m;
  };
  const { ancho, fondo, pared, alturaAtras, alturaFrente } = MEDIDA;

  const grupo = new THREE.Group();
  grupo.name = 'caja-de-crayolas';
  const cuerpo = new THREE.Group();
  cuerpo.name = 'caja-cuerpo';
  grupo.add(cuerpo);
  const carton = material(COLORES.caja), interior = material(COLORES.interior), franja = material(COLORES.franja), canto = material(COLORES.canto);
  const paredes = [
    // [ancho, alto, fondo, x, y, z, material]
    [ancho + pared * 2, alturaAtras, pared, 0, alturaAtras / 2, -fondo / 2 - pared / 2, carton],
    [ancho + pared * 2, alturaFrente, pared, 0, alturaFrente / 2, fondo / 2 + pared / 2, carton],
    [ancho + pared * 2, pared, fondo + pared * 2, 0, pared / 2, 0, canto]
  ];
  // Costados en dos tramos: suben desde la pared delantera hasta la trasera, como el corte de una caja abierta.
  [-1, 1].forEach(lado => {
    const x = lado * (ancho / 2 + pared / 2);
    const perfil = new THREE.Shape([
      new THREE.Vector2(-fondo / 2 - pared, 0), new THREE.Vector2(fondo / 2 + pared, 0),
      new THREE.Vector2(fondo / 2 + pared, alturaFrente), new THREE.Vector2(-fondo / 2 - pared, alturaAtras)
    ]);
    const costado = new THREE.ExtrudeGeometry(perfil, { depth: pared, bevelEnabled: false });
    // El perfil se dibuja con el fondo en x; al girarlo, x pasa a z y el grosor queda centrado en el costado.
    costado.rotateY(-Math.PI / 2).translate(x + pared / 2, 0, 0);
    malla(costado, carton, cuerpo);
  });
  paredes.forEach(([w, h, d, x, y, z, mat]) => { malla(new THREE.BoxGeometry(w, h, d), mat, cuerpo).position.set(x, y, z); });
  // Franja verde al frente y cara interior clara de la pared trasera.
  malla(new THREE.BoxGeometry(ancho + pared * 2.2, alturaFrente * .36, pared * .4), franja, cuerpo).position.set(0, alturaFrente * .5, fondo / 2 + pared * 1.2);
  malla(new THREE.BoxGeometry(ancho, alturaAtras * .96, pared * .3), interior, cuerpo).position.set(0, alturaAtras * .48, -fondo / 2 + pared * .2);
  // Tapa abierta, inclinada hacia atrás desde el canto superior trasero.
  const bisagra = new THREE.Group();
  bisagra.position.set(0, alturaAtras, -fondo / 2 - pared);
  bisagra.rotation.x = -.42;
  cuerpo.add(bisagra);
  malla(new THREE.BoxGeometry(ancho + pared * 2, fondo * 1.15, pared), carton, bisagra).position.set(0, fondo * .575, -pared / 2);
  malla(new THREE.BoxGeometry(ancho * .94, fondo * 1.05, pared * .3), interior, bisagra).position.set(0, fondo * .56, pared * .2);

  // Crayolas: cuerpo de cera y punta del color, con la banda de papel dentro de la caja.
  const papel = material(COLORES.papel);
  const geometrias = { punta: new THREE.ConeGeometry(MEDIDA.radio, MEDIDA.punta, 8) };
  const crayolas = colores.map((hex, i) => {
    const fila = i < 8 ? 'atras' : 'frente', columna = i % 8;
    const alto = fila === 'atras' ? MEDIDA.filaAtras : MEDIDA.filaFrente;
    const largo = alto - MEDIDA.punta - pared;
    const cera = material(hex);
    const crayola = new THREE.Group();
    crayola.name = `crayola-color-${i}`;
    const tronco = malla(new THREE.CylinderGeometry(MEDIDA.radio, MEDIDA.radio, largo, 8), cera, crayola);
    tronco.position.y = largo / 2;
    const banda = malla(new THREE.CylinderGeometry(MEDIDA.radio * 1.04, MEDIDA.radio * 1.04, largo * .55, 8), papel, crayola);
    banda.position.y = largo * .3;
    const punta = malla(geometrias.punta, cera, crayola);
    punta.position.y = largo + MEDIDA.punta / 2;
    const x = (columna - 3.5) * MEDIDA.paso, z = (fila === 'atras' ? -1 : 1) * fondo / 4;
    crayola.position.set(x, pared, z);
    // Un leve abanico separa las puntas para tocar una a la vez.
    crayola.rotation.z = -(columna - 3.5) * .025;
    crayola.rotation.x = fila === 'atras' ? -.06 : .06;
    Object.assign(crayola.userData, { indice: i, color: hex, reposo: crayola.position.y });
    grupo.add(crayola);
    return crayola;
  });

  let elegida = -1;
  const elevar = (i, altura) => {
    const crayola = crayolas[i];
    gsap.to(crayola.position, { y: crayola.userData.reposo + altura, duration: .28, ease: altura > 0 ? 'back.out(2)' : 'power2.out', overwrite: true });
  };
  return {
    grupo, crayolas,
    // Señalar una crayola la asoma un poco; la elegida queda más arriba que las demás.
    senalar(i, activo, alturas) {
      if (i === elegida) return;
      elevar(i, activo ? alturas.senalada : 0);
    },
    elegir(i, alturas) {
      const anterior = elegida;
      elegida = i;
      if (anterior >= 0 && anterior !== i) elevar(anterior, 0);
      elevar(i, alturas.elegida);
    }
  };
}
