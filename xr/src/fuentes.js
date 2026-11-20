import { TTFLoader } from '@pmndrs/uikit';

// UIKitML convierte las fuentes TTF de @font-face a MSDF con un juego de caracteres en inglés
// y sin opción para cambiarlo. Se añaden los del español (tildes, ñ, ¿, ¡) a toda conversión TTF.
const CARACTERES = ' \tABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,;:\'"()-[]{}@#$%&*+=/\\<>'
  + 'áéíóúÁÉÍÓÚñÑüÜ¿¡«»·—–‘’“”…°';
const conEspanol = entrada => typeof entrada === 'string'
  ? { url: entrada, charset: CARACTERES, textureSize: [1024, 512] }
  : { charset: CARACTERES, textureSize: [1024, 512], ...entrada };

const cargar = TTFLoader.prototype.loadAsync;
TTFLoader.prototype.loadAsync = function (entrada, alAvanzar) {
  return cargar.call(this, Array.isArray(entrada) ? entrada.map(conEspanol) : conEspanol(entrada), alAvanzar);
};
