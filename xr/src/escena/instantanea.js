import gsap from 'gsap';

/*
 * Pose de todos los objetos de un escenario (posición, giro, tamaño y visibilidad), tomada al construirlo. REPETIR
 * (sección de aportes) la restaura: cada objeto vuelve a donde estaba al empezar y se detienen sus animaciones. El
 * estado de cada interacción (pintura, lista, correo, gafas…) lo reinicia su propio módulo.
 */
export function tomarInstantanea(raiz) {
  const lista = [];
  raiz.traverse(o => lista.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible }));
  return lista;
}

// Lo marcado con `userData.ocultoFijo` (p. ej. los textos del modelo de la hoja, que se ocultan después de tomar la
// instantánea, cuando carga la letra) sigue oculto: si volviera a verse, la hoja mostraría dos escrituras.
export function restaurarInstantanea(lista) {
  lista.forEach(({ o, p, q, s, v }) => {
    gsap.killTweensOf([o, o.position, o.quaternion, o.rotation, o.scale]);
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
    o.visible = o.userData.ocultoFijo ? false : v;
  });
}
