# Assets del "Escenario 2" (escritorio)

Modelos exportados desde Blender 5.1 en formato **OBJ + MTL**, con sus texturas PNG/JPEG copiadas
junto a cada OBJ. Sirven para reemplazar los objetos equivalentes de un proyecto de código.

## Estructura

| Archivo | Qué es |
|---|---|
| `computador/monitor.obj` | Marco y base del monitor, botón de encendido, webcam y notas adhesivas pegadas al monitor |
| `computador/pantalla.obj` | Pantalla del monitor (un plano con la imagen de la pantalla) |
| `computador/teclado.obj` | Teclado: carcasa + teclas en una sola malla |
| `corcho/corcho_calendario.obj` | Tablero de corcho de la pared con la hoja de calendario y sus anillas |
| `libros/libros_y_repisa.obj` | Repisa de pared con los libros (una sola malla) |
| `matera/matera_y_planta.obj` | Matera, borde, tierra y las hojas de la planta |
| `mesa/mesa.obj` | Tablero del escritorio |
| `pared_fondo/pared_fondo.obj` | Pared del fondo |
| `reloj_de_mesa/reloj_de_mesa.obj` | Reloj digital: cuerpo, botones y pantalla |
| `termo/termo.obj` | Vaso/termo con tapa |
| `lapicero/lapicero.obj` | Lapicero (cuerpo + clip) |
| `papel/hoja_pendientes.obj` | Hoja "Pendientes": papel, título, 4 textos y 4 casillas (los textos ya son malla) |
| `escena_completa/escena_completa.obj` | Todo lo anterior junto, ya colocado |
| `manifiesto.json` | Por archivo: objetos de Blender que contiene, caja envolvente, tamaño y centro de la base |

Cada carpeta es autónoma: el `.obj`, su `.mtl` y las imágenes que el `.mtl` usa están juntos
(rutas relativas). Mueve siempre la carpeta completa.

## Coordenadas y escala

- Ejes de los OBJ: **Y arriba**, **-Z hacia delante** (estándar de three.js, Unity, Godot, etc.).
- **Cada OBJ conserva su posición dentro de la escena**: si cargas varios, encajan entre sí sin
  moverlos (la mesa, el teclado sobre la mesa, etc.). Si necesitas cada objeto centrado en el origen,
  resta el `centro_base_blender` del manifiesto (ojo: el manifiesto está en ejes de Blender,
  Z arriba; en el OBJ ese eje es Y, y la Y de Blender pasa a ser -Z).
- Escala: unidades de Blender. El escritorio mide ~22.6 unidades de ancho, así que normalmente
  habrá que escalar todo el conjunto (por ejemplo ~0.06 para que el escritorio mida ~1.4 m).
  Escala todos los assets con el mismo factor para que mantengan sus proporciones.

## Materiales: qué viaja y qué no

- Los materiales con **imagen** (`map_Kd` en el `.mtl`) se ven igual que en Blender.
  En three.js, pon `texture.colorSpace = THREE.SRGBColorSpace` en esas texturas.
- Los materiales **procedurales** de Blender se **hornearon a imágenes PNG** (color base):
  - `lapicero/Lapicero_color.png` y `Lapicero_Clip_color.png`: el lapicero con su efecto pintado a mano
    (materiales `Lapicero_Horneado` y `Lapicero_Clip_Horneado`).
  - `papel/Hoja_Papel_color.png`: textura del papel.
  - `libros/Repisa_Madera_color.png`: madera de la repisa.
  - `matera/Matera_Borde_Madera_color.png`: madera del borde de la matera.
- El resto de materiales sin imagen son **colores planos** a propósito (`Kd`): tintas de la hoja,
  hojas de la planta, tierra, botón del monitor, anillas del calendario, etc.
- Aviso: en `libros_y_repisa.obj`, los materiales `Material.010`, `.018` y `.023` no tenían shader
  conectado en Blender (allí se veían negros); en el OBJ llegan con un color plano por defecto.
  Si un libro sale gris o raro, dale un color en el código.

## Cómo cargarlos (ejemplo three.js)

```js
const mtl = await new MTLLoader().setPath('assets/teclado/').loadAsync('teclado.mtl');
mtl.preload();
const obj = await new OBJLoader().setMaterials(mtl).setPath('assets/teclado/').loadAsync('teclado.obj');
scene.add(obj);
```
