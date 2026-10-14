# Audio de la niñez

Esta carpeta no contiene música ni efectos definitivos. No se sintetiza ni se selecciona una canción provisional.

Coloca tus archivos, por ejemplo:

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
