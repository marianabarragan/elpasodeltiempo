# Audio de la niñez

La música ambiental del escenario 1 está desactivada por ahora (`Config.assets.audio.musicSrc: null`). La pista anterior, `goldensoundlabs-bouncy-birds-vibrant-solo-501860.mp3`, sigue en esta carpeta por si se quiere volver a usar. No hay sonido de fricción de crayola (`frictionSrc: null`).

Para cambiar o añadir pistas, coloca tus archivos, por ejemplo:

- `assets/audio/childhood-music.mp3`: música instrumental ambiental.
- `assets/audio/crayon-friction.mp3`: fricción de crayola, preferentemente un fragmento que pueda repetirse sin cortes perceptibles.

En `js/project-config.js`, sustituye los valores `null` por rutas relativas a `index.html`:

```javascript
audio: {
  musicSrc: 'assets/audio/childhood-music.mp3',
  frictionSrc: 'assets/audio/crayon-friction.mp3'
}
```

Puedes configurar solo una pista y dejar la otra en `null`. El motor no solicita archivos para valores nulos. Sirve el proyecto con `npm start` y recarga la página después de modificar la configuración.

La música intenta comenzar al entrar a niñez y se reproduce en bucle. El clic inicial prepara silenciosamente los elementos de audio para aprovechar el permiso del navegador. Si la reproducción automática queda bloqueada, el botón de audio permite volver a intentarlo mediante un clic.

La fricción suena únicamente mientras la crayola se mueve sobre una región pintable. Se detiene al soltarla, detener el movimiento, salir de la región permitida, perder el foco o salir de la escena. El control de silencio afecta a ambas pistas. La música también se pausa al ocultar la pestaña y el ciclo de salida la detiene y rebobina.

`js/audio-system.js` concentra estas reglas y los volúmenes iniciales: `0.32` para música y `0.24` para fricción. Sin archivos configurados, el botón sigue permitiendo cambiar la preferencia de sonido, pero no hay audio que reproducir.

### Sonidos de los juguetes

Un clic en el juego de aros, en el xilófono o en la crayola (al tomarla) reproduce una vez el archivo de `Config.childhood.audio`. Por ahora están en `null` y no suenan:

```javascript
audio: {
  paletteHoverSrc: null,                      // nota al pasar por los colores (null: generada)
  ringsSrc: 'assets/audio/aros.mp3',          // clic en el juego de aros
  xylophoneSrc: 'assets/audio/xilofono.mp3',  // clic en el xilófono
  crayonSrc: 'assets/audio/crayola.mp3'       // clic en la crayola
}
```

Se reproducen con `AudioSystem.playEffect(nombre)` y respetan el botón de silencio de la escena.

## Escenario 2: juventud / adultez joven

Tampoco se incluyen archivos. Las rutas se editan en `js/project-config.js`, dentro de `Config.adulthood.audio`:

```javascript
audio: {
  musicSrc: 'assets/audio/adulthood-music.mp3',   // música ambiental en bucle
  thermosSrc: 'assets/audio/thermos.mp3',         // clic sobre el termo
  clockSrc: 'assets/audio/clock-button.mp3'       // clic sobre el reloj (encender/apagar)
}
```

La escena usa una instancia propia de `AudioSystem` (`TimeExperience.adulthoodAudio`). La música suena en bucle solo mientras la escena 2 está activa y se detiene y rebobina al volver al tablero. El botón circular superior derecho de esta escena la silencia o la reactiva. Los efectos se reproducen una vez por clic mediante `AudioSystem.playEffect(nombre)` y respetan el mismo estado de silencio. Cualquier valor `null` se omite sin solicitar archivos.

## Escenario 3: vejez

En `js/project-config.js`, dentro de `Config.oldage.audio`:

```javascript
audio: {
  musicSrc: 'assets/audio/oldage-music.mp3',   // música instrumental ambiental en bucle
  waterSrc: 'assets/audio/watering.mp3'        // opcional: suena al empezar cada riego
}
```

La escena usa su propia instancia de `AudioSystem` (`TimeExperience.oldageAudio`). La música suena por defecto al entrar, se repite en bucle y se detiene al salir del escenario. El botón circular superior derecho la silencia o la reactiva.
