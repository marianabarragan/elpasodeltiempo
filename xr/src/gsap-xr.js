import gsap from 'gsap';

// Durante la sesión inmersiva algunos navegadores detienen requestAnimationFrame de la página,
// que es el reloj de GSAP. Si deja de llegar, GSAP avanza con el bucle XR.
let ultimoCuadro = performance.now();
const vigilar = () => { ultimoCuadro = performance.now(); requestAnimationFrame(vigilar); };
requestAnimationFrame(vigilar);

export function avanzarGsap() {
  if (performance.now() - ultimoCuadro > 50) gsap.ticker.tick();
}
