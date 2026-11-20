(() => {
  'use strict';

  const app = window.TimeExperience = window.TimeExperience || {};

  // Transiciones breves para sonidos que acompañan acciones.
  const LOOP_FADE = { in: .2, out: .45 };
  // La música entra y sale gradualmente con la escena.
  const MUSIC_FADE = { in: 2.5, out: 1.2 };
  // Duración de la reducción y recuperación de la música ante otros sonidos.
  const DUCK_FADE = { down: .15, up: .8 };
  // Duración del silencio al silenciar, ocultar la pestaña o salir.
  const SILENCE_FADE = .2;

  // Reproduce los archivos configurados con el volumen y las transiciones de Config.audio.
  class AudioSystem {
    constructor({ musicSrc = null, frictionSrc = null, frictionVolume = 0.24, effects = {}, onStateChange = () => {} } = {}) {
      this.enabled = true;
      this.active = false;
      this.painting = false;
      this.blocked = false;
      this.disposed = false;
      this.page = typeof document === 'undefined' ? null : document;
      this.hidden = Boolean(this.page && this.page.hidden);
      this.onStateChange = onStateChange;
      this.tracks = [];
      this.sound = { level: .25, fadeIn: .5, fadeOut: 1, music: 1, musicDuck: .3, ...app.Config?.audio };
      this.fades = new Map();
      this.duckEnd = 0;
      this.duckTimer = null;
      this.onVisibilityChange = () => {
        this.hidden = Boolean(this.page.hidden);
        if (this.hidden) this.painting = false;
        this.sync();
      };
      this.onBlur = () => this.setPainting(false);
      // Reintenta el audio bloqueado con el siguiente clic del usuario.
      this.onGesture = event => {
        if (!this.blocked || !this.active || event.target.closest?.('.sound-toggle')) return;
        this.blocked = false;
        this.sync();
      };
      if (window.addEventListener) window.addEventListener('pointerdown', this.onGesture, true);
      if (this.page) this.page.addEventListener('visibilitychange', this.onVisibilityChange);
      if (window.addEventListener) window.addEventListener('blur', this.onBlur);
      this.createTrack('music', musicSrc, this.sound.music);
      this.createTrack('friction', frictionSrc, frictionVolume);
      // Los efectos aceptan ruta, volumen, transiciones y fragmentos; omite rutas nulas.
      this.effects = new Map();
      this.effectVolumes = new Map();
      this.effectFades = new Map();
      this.clips = new Map();
      this.effectTimers = new Map();
      Object.entries(effects).forEach(([name, effect]) => {
        const { src, volume = 0.6, fadeIn, fadeOut, clips = null } = typeof effect === 'string' ? { src: effect } : effect || {};
        if (typeof src !== 'string' || !src.trim()) return;
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = src;
        this.effects.set(name, audio);
        this.effectVolumes.set(name, volume * this.sound.level);
        this.effectFades.set(name, { fadeIn, fadeOut });
        if (!clips?.length) return;
        this.clips.set(name, clips);
        // La copia en memoria permite saltar entre fragmentos aunque el servidor no admita búsquedas.
        fetch(src).then(response => response.blob()).then(blob => { audio.src = URL.createObjectURL(blob); }).catch(() => {});
      });
      this.emit();
    }

    // Reproduce un efecto o fragmento respetando el silencio y el estado de la escena.
    playEffect(name, clip = 0) {
      const audio = this.effects.get(name);
      if (!audio || this.disposed || this.hidden || !this.active || !this.enabled || this.blocked) return;
      const clips = this.clips.get(name), range = clips?.[clip % clips.length];
      clearInterval(this.effectTimers.get(name));
      clearInterval(this.fades.get(audio));
      audio.volume = 0;
      try { audio.currentTime = range ? range[0] : 0; } catch (_) { /* Los metadatos pueden no estar disponibles todavía. */ }
      Promise.resolve(audio.play()).then(() => {
        if (audio.paused) return;
        const length = range ? range[1] - range[0] : audio.duration;
        const known = Number.isFinite(length);
        const own = this.effectFades.get(name);
        this.fade(audio, this.effectVolumes.get(name), own.fadeIn ?? (known ? Math.min(this.sound.fadeIn, length * .25) : .05));
        this.duck(known ? length : 1);
        if (!known) return;
        const out = own.fadeOut ?? Math.min(this.sound.fadeOut, length * .45);
        const end = range ? range[1] : audio.duration;
        clearInterval(this.effectTimers.get(name));
        // Usa la posición real del audio para compensar retrasos de reproducción.
        this.effectTimers.set(name, setInterval(() => {
          if (audio.currentTime < end - out) return;
          clearInterval(this.effectTimers.get(name));
          this.fade(audio, 0, out, () => audio.pause());
        }, 20));
      }).catch(() => {});
    }

    // Cambia el volumen con una curva gradual y sustituye la transición anterior.
    fade(audio, to, seconds, done) {
      clearInterval(this.fades.get(audio));
      const from = audio.volume, start = performance.now();
      this.fades.set(audio, setInterval(() => {
        const t = seconds > 0 ? Math.min(1, (performance.now() - start) / (seconds * 1000)) : 1;
        audio.volume = from + (to - from) * (to > from ? t * t : 1 - (1 - t) * (1 - t));
        if (t < 1) return;
        clearInterval(this.fades.get(audio));
        this.fades.delete(audio);
        done?.();
      }, 16));
    }

    // Reduce la música durante los efectos, la pintura o el riego.
    duck(seconds) {
      this.duckEnd = Math.max(this.duckEnd, performance.now() + seconds * 1000);
      clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(() => this.tracks.forEach(track => this.balance(track)), this.duckEnd - performance.now());
      this.tracks.forEach(track => this.balance(track));
    }

    levelOf(track) {
      const ducked = track.name === 'music' && (this.painting || performance.now() < this.duckEnd);
      return ducked ? track.base * this.sound.musicDuck : track.base;
    }

    // Ajusta gradualmente el volumen de la pista que ya suena.
    balance(track) {
      if (!this.wanted(track) || track.leaving || track.audio.paused || track.audio.muted) return;
      const target = this.levelOf(track);
      if (target === track.target) return;
      this.fade(track.audio, target, target < track.base ? DUCK_FADE.down : DUCK_FADE.up);
      track.target = target;
    }

    silenceEffects() {
      clearTimeout(this.duckTimer);
      this.duckEnd = 0;
      this.effects.forEach((audio, name) => {
        clearInterval(this.effectTimers.get(name));
        if (!audio.paused) this.fade(audio, 0, SILENCE_FADE, () => audio.pause());
      });
    }

    // Desvanece la pista antes de detenerla y permite reactivarla durante la transición.
    leave(track, rewind) {
      if (track.leaving) return;
      if (track.audio.paused || track.audio.muted) { this.stop(track, rewind); return; }
      track.leaving = true;
      track.target = null;
      // Silenciar u ocultar la pestaña interrumpe cualquier pista de inmediato.
      const seconds = this.enabled && !this.hidden ? track.fades.out : SILENCE_FADE;
      this.fade(track.audio, 0, seconds, () => { this.stop(track, rewind); this.emit(); });
    }

    createTrack(name, source, volume) {
      if (typeof source !== 'string' || !source.trim()) return;
      const audio = new Audio();
      // Descarga la música cuando su escena la necesita.
      audio.preload = name === 'music' ? 'metadata' : 'auto';
      audio.loop = true;
      audio.muted = true;
      audio.volume = volume * this.sound.level;
      const track = { name, audio, base: audio.volume, fades: name === 'music' ? MUSIC_FADE : LOOP_FADE, leaving: false, failed: false, pending: false, playing: false, revision: 0, listeners: [] };
      const listen = (type, handler) => {
        audio.addEventListener(type, handler);
        track.listeners.push([type, handler]);
      };
      listen('playing', () => { track.playing = true; this.emit(); });
      ['pause', 'ended', 'waiting'].forEach(type => listen(type, () => { track.playing = false; this.emit(); }));
      listen('error', () => {
        track.failed = true;
        this.stop(track, true);
        this.emit();
      });
      this.tracks.push(track);
      audio.src = source;
    }

    get state() {
      return {
        enabled: this.enabled,
        blocked: this.blocked,
        active: this.active,
        available: this.tracks.some(track => !track.failed),
        playing: this.tracks.some(track => this.wanted(track) && track.playing && !track.audio.paused && !track.audio.muted)
      };
    }

    emit() {
      if (!this.disposed) this.onStateChange(this.state);
    }

    wanted(track) {
      return !this.disposed && !this.hidden && !track.failed && this.active && this.enabled && !this.blocked &&
        (track.name === 'music' || this.painting);
    }

    stop(track, rewind = false) {
      clearInterval(this.fades.get(track.audio));
      track.leaving = false;
      track.target = null;
      track.revision += 1;
      track.playing = false;
      track.audio.muted = true;
      track.audio.pause();
      if (rewind) {
        try { track.audio.currentTime = 0; } catch (_) { /* Los metadatos pueden no estar disponibles todavía. */ }
      }
    }

    play(track, priming = false) {
      if (this.disposed || track.failed || track.pending) return;
      track.pending = true;
      const revision = track.revision;
      let attempt;
      try {
        attempt = track.audio.play();
      } catch (error) {
        attempt = Promise.reject(error);
      }
      // Gestiona el rechazo esperado por las restricciones de reproducción automática.
      Promise.resolve(attempt).then(() => {
        track.pending = false;
        if (this.disposed) return;
        if (this.wanted(track)) {
          track.audio.muted = false;
          // Salir y volver de inmediato puede pausar una reproducción antes de resolver su promesa.
          if (track.audio.paused && revision !== track.revision) this.sync();
        }
        else this.stop(track, priming || !this.active || track.name === 'friction');
        this.emit();
      }).catch(error => {
        track.pending = false;
        if (this.disposed) return;
        if (priming || revision !== track.revision) {
          // Reintenta solo interrupciones de cambios de estado para evitar bucles con AbortError.
          if (this.wanted(track)) this.sync();
        } else if (this.wanted(track)) {
          if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
            this.blocked = true;
            this.tracks.forEach(item => this.stop(item, item.name === 'friction'));
          } else {
            track.failed = true;
            this.stop(track, true);
          }
        }
        this.emit();
      });
    }

    // Prepara el audio en silencio dentro del clic inicial, antes de la transición.
    unlock() {
      if (this.disposed) return;
      if (this.active) {
        this.blocked = false;
        this.sync();
        return;
      }
      this.tracks.forEach(track => {
        track.audio.muted = true;
        this.play(track, true);
      });
    }

    sync() {
      if (this.disposed) return;
      // Detiene los efectos largos al silenciar u ocultar la pestaña.
      if (this.hidden || !this.enabled || this.blocked) this.silenceEffects();
      this.tracks.forEach(track => {
        if (this.wanted(track)) {
          const returning = track.audio.paused || track.leaving;
          track.leaving = false;
          track.audio.muted = false;
          if (track.audio.paused) {
            track.audio.volume = 0;
            this.play(track);
          }
          if (returning) {
            track.target = this.levelOf(track);
            this.fade(track.audio, track.target, track.fades.in);
          } else this.balance(track);
        } else {
          this.leave(track, track.name === 'friction');
        }
      });
      this.emit();
    }

    enter() {
      if (this.disposed) return;
      this.active = true;
      this.painting = false;
      this.sync();
    }

    exit() {
      if (this.disposed) return;
      this.active = false;
      this.painting = false;
      this.tracks.forEach(track => this.leave(track, true));
      this.silenceEffects();
      this.emit();
    }

    toggle() {
      if (this.disposed) return;
      // Tras un bloqueo, el clic reintenta el audio; los demás alternan el sonido.
      this.enabled = this.blocked ? true : !this.enabled;
      this.blocked = false;
      this.sync();
    }

    setPainting(painting) {
      if (this.disposed) return;
      const next = Boolean(painting) && this.active && !this.hidden;
      if (next === this.painting) return;
      this.painting = next;
      this.sync();
    }

    dispose() {
      if (this.disposed) return;
      this.exit();
      this.disposed = true;
      if (this.page) this.page.removeEventListener('visibilitychange', this.onVisibilityChange);
      if (window.removeEventListener) {
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('pointerdown', this.onGesture, true);
      }
      this.tracks.forEach(track => {
        track.listeners.forEach(([type, handler]) => track.audio.removeEventListener(type, handler));
        track.audio.removeAttribute('src');
        track.audio.load();
      });
      this.tracks.length = 0;
      clearTimeout(this.duckTimer);
      this.effectTimers.forEach(timer => clearInterval(timer));
      this.fades.forEach(timer => clearInterval(timer));
      this.effects.forEach(audio => { audio.removeAttribute('src'); audio.load(); });
      this.effects.clear();
    }
  }

  app.AudioSystem = AudioSystem;
})();
