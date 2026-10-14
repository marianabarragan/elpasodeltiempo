(() => {
  'use strict';

  const app = window.TimeExperience = window.TimeExperience || {};

  // Only configured files are requested. This module never synthesizes music.
  // Suggested files: assets/audio/childhood-music.mp3 and crayon-friction.mp3.
  class AudioSystem {
    constructor({ musicSrc = null, frictionSrc = null, effects = {}, onStateChange = () => {} } = {}) {
      this.enabled = true;
      this.active = false;
      this.painting = false;
      this.blocked = false;
      this.disposed = false;
      this.page = typeof document === 'undefined' ? null : document;
      this.hidden = Boolean(this.page && this.page.hidden);
      this.onStateChange = onStateChange;
      this.tracks = [];
      this.onVisibilityChange = () => {
        this.hidden = Boolean(this.page.hidden);
        if (this.hidden) this.painting = false;
        this.sync();
      };
      this.onBlur = () => this.setPainting(false);
      if (this.page) this.page.addEventListener('visibilitychange', this.onVisibilityChange);
      if (window.addEventListener) window.addEventListener('blur', this.onBlur);
      this.createTrack('music', musicSrc, 0.32);
      this.createTrack('friction', frictionSrc, 0.24);
      // One-shot effects (e.g. { thermos: 'assets/audio/thermos.mp3' }). Null paths are skipped.
      this.effects = new Map();
      Object.entries(effects).forEach(([name, source]) => {
        if (typeof source !== 'string' || !source.trim()) return;
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = 0.6;
        audio.src = source;
        this.effects.set(name, audio);
      });
      this.emit();
    }

    // Plays a configured effect once, respecting mute, visibility and the scene lifecycle.
    playEffect(name) {
      const audio = this.effects.get(name);
      if (!audio || this.disposed || this.hidden || !this.active || !this.enabled || this.blocked) return;
      try { audio.currentTime = 0; } catch (_) { /* Metadata may not exist yet. */ }
      Promise.resolve(audio.play()).catch(() => {});
    }

    createTrack(name, source, volume) {
      if (typeof source !== 'string' || !source.trim()) return;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = true;
      audio.muted = true;
      audio.volume = volume;
      const track = { name, audio, failed: false, pending: false, playing: false, revision: 0, listeners: [] };
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
      track.revision += 1;
      track.playing = false;
      track.audio.muted = true;
      track.audio.pause();
      if (rewind) {
        try { track.audio.currentTime = 0; } catch (_) { /* Metadata may not exist yet. */ }
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
      // Always handle the promise: rejection is normal under autoplay policies.
      Promise.resolve(attempt).then(() => {
        track.pending = false;
        if (this.disposed) return;
        if (this.wanted(track)) {
          track.audio.muted = false;
          // An exit followed immediately by re-entry can pause an already
          // resolved request before its promise callback reaches this point.
          if (track.audio.paused && revision !== track.revision) this.sync();
        }
        else this.stop(track, priming || !this.active || track.name === 'friction');
        this.emit();
      }).catch(error => {
        track.pending = false;
        if (this.disposed) return;
        if (priming || revision !== track.revision) {
          // Retry only when an earlier state change interrupted this request.
          // A fresh AbortError must not create an endless promise retry loop.
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

    // Call synchronously inside the initial button's click, before the GSAP
    // transition. Priming both reusable elements is silent, including music.
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
      this.tracks.forEach(track => {
        if (this.wanted(track)) {
          track.audio.muted = false;
          if (track.audio.paused) this.play(track);
        } else {
          this.stop(track, track.name === 'friction');
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
      this.tracks.forEach(track => this.stop(track, true));
      this.effects.forEach(audio => audio.pause());
      this.emit();
    }

    toggle() {
      if (this.disposed) return;
      // A click after blocked autoplay retries playback instead of disabling an
      // already silent scene. Other clicks alternate the user's preference.
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
      if (window.removeEventListener) window.removeEventListener('blur', this.onBlur);
      this.tracks.forEach(track => {
        track.listeners.forEach(([type, handler]) => track.audio.removeEventListener(type, handler));
        track.audio.removeAttribute('src');
        track.audio.load();
      });
      this.tracks.length = 0;
      this.effects.forEach(audio => { audio.removeAttribute('src'); audio.load(); });
      this.effects.clear();
    }
  }

  app.AudioSystem = AudioSystem;
})();
