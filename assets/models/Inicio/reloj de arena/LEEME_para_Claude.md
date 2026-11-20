# Assets del reloj de arena

Modelos exportados desde Blender 5.1 (`reloj5.1_UV.blend`) en formato **OBJ + MTL**, con sus texturas
PNG copiadas junto a cada OBJ. Sirven para reemplazar el reloj de arena de un proyecto de código.

## Estructura

| Archivo | Qué es |
|---|---|
| `reloj_de_arena_completo/reloj_de_arena_completo.obj` | **El reloj entero**, todas las piezas ya colocadas (lo normal es usar este) |
| `manifiesto.json` | Por archivo: objetos de Blender que contiene, caja envolvente y tamaño |

Cada carpeta es autónoma (`.obj` + `.mtl` + imágenes, rutas relativas). Mueve siempre la carpeta completa.

## Coordenadas y escala

- Ejes de los OBJ: **Y arriba**, **-Z hacia delante**.
- El OBJ completo conserva las posiciones relativas de todas las piezas.
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
