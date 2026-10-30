# Assets del reloj de arena

Modelos exportados desde Blender 5.1 (`reloj5.1_UV.blend`) en formato **OBJ + MTL**, con sus texturas
PNG copiadas junto a cada OBJ. Sirven para reemplazar el reloj de arena de un proyecto de código.

## Estructura

| Archivo | Qué es |
|---|---|
| `reloj_de_arena_completo/reloj_de_arena_completo.obj` | **El reloj entero**, todas las piezas ya colocadas (lo normal es usar este) |
| `partes/base_inferior.obj` | Base de madera de abajo |
| `partes/base_superior.obj` | Base de madera de arriba |
| `partes/columnas.obj` | Las columnas torneadas de madera |
| `partes/cristal.obj` | Ampolla de cristal (semitransparente: `d 0.33` en el `.mtl`) |
| `partes/arena.obj` | Arena dentro del cristal |
| `partes/enredadera_tallo.obj` | Tallo de la enredadera que rodea el reloj |
| `partes/enredadera_hojas.obj` | Hojas de la enredadera |
| `partes/enredadera_esferas.obj` | Esferas/brotes verdes de la enredadera |
| `partes/flores.obj` | 7 florecitas blancas |
| `fondo/fondo_suelo_y_pared.obj` | Suelo y pared de fondo de la escena del reloj (opcional, no es parte del reloj) |
| `manifiesto.json` | Por archivo: objetos de Blender que contiene, caja envolvente y tamaño |

Cada carpeta es autónoma (`.obj` + `.mtl` + imágenes, rutas relativas). Mueve siempre la carpeta completa.

## Coordenadas y escala

- Ejes de los OBJ: **Y arriba**, **-Z hacia delante**.
- Cada OBJ conserva su posición: las partes cargadas juntas encajan sin moverlas.
- Tamaño del reloj completo: ~1.96 × 2.11 × 2.32 unidades de Blender (el manifiesto usa ejes de
  Blender, Z arriba). Si el código usa otra escala, aplica un mismo factor a todo.
- El reloj no está centrado en el origen (está en X ≈ -1.15 en Blender). Si necesitas centrarlo,
  usa la caja envolvente del manifiesto.

## Materiales

- **Horneados a imagen** (se ven igual que en Blender):
  - Madera procedural de las bases y las columnas: `Base_Inferior_color.png`, `Base_Superior_color.png`,
    `Columna_color.png`. Todas las columnas comparten la misma textura.
  - Las 7 flores (`Flor_1_color.png` … `Flor_7_color.png`): pétalos blancos, centro amarillo y hoja.
- **Color plano** (`Kd`), a propósito: cristal, arena, tallo, hojas, esferas y fondo.
- El **cristal** en Blender es vidrio con transmisión; en OBJ solo puede ir como blanco semitransparente.
  Para un vidrio real en el motor usa un material de transmisión/refracción (en three.js,
  `MeshPhysicalMaterial` con `transmission: 1`).
- En three.js, pon `texture.colorSpace = THREE.SRGBColorSpace` en las texturas.
