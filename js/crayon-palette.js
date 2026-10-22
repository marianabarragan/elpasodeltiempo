(() => {
  'use strict';
  const app = window.TimeExperience;

  // C major scale from C5 to D7, one bar per swatch in on-screen order (like a toy xylophone).
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const noteFrequency = index => 523.25 * Math.pow(2, (SCALE[index % 7] + 12 * Math.floor(index / 7)) / 12);
  // A wooden bar: strong fundamental, its tuned third partial and a faint high mode.
  const PARTIALS = [[1, 1, 1], [3, .32, .3], [6.27, .08, .12]];
  const MAX_VOICES = 5;

  /**
   * Short xylophone note for hovering a colour. Without a configured file it is generated
   * with Web Audio: a mallet tap plus a few decaying partials, one note per swatch. Notes may
   * ring over each other like real bars, but fast passes are throttled and voices are capped.
   */
  class PaletteTone {
    constructor({ src = null, isEnabled = () => true } = {}) {
      this.isEnabled = isEnabled;
      this.last = 0;
      this.voices = [];
      if (typeof src === 'string' && src.trim()) {
        this.sample = new Audio(src);
        this.sample.preload = 'auto';
        this.sample.volume = .35;
      }
    }

    // Call inside a user gesture (the crayon click) so the browser allows audio.
    unlock() {
      if (this.sample) return;
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = this.context || new Context();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    }

    play(index = 0) {
      const now = performance.now();
      if (!this.isEnabled() || now - this.last < 70) return;
      this.last = now;
      if (this.sample) {
        try { this.sample.currentTime = 0; } catch (_) { /* metadata not ready */ }
        Promise.resolve(this.sample.play()).catch(() => {});
        return;
      }
      const ctx = this.context;
      if (!ctx) return;
      // The first hover can arrive while the context is still resuming from the crayon click.
      if (ctx.state !== 'running') {
        ctx.resume().then(() => this.strike(index)).catch(() => {});
        return;
      }
      this.strike(index);
    }

    strike(index) {
      const ctx = this.context;
      if (!this.output) {
        this.output = ctx.createGain();
        this.output.gain.value = .5;
        this.output.connect(ctx.destination);
        const length = Math.ceil(ctx.sampleRate * .03);
        this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const frequency = noteFrequency(index);
      const t = ctx.currentTime + .005;
      // Higher bars ring shorter and sound louder to the ear, so they are trimmed a little.
      const ring = .55 * Math.sqrt(523.25 / frequency);
      const level = .2 * Math.pow(523.25 / frequency, .25);
      while (this.voices.length >= MAX_VOICES) this.fade(this.voices.shift(), t);
      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(this.output);
      const sources = PARTIALS.map(([ratio, amount, decay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency * ratio;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(level * amount, t + .003);
        gain.gain.setTargetAtTime(0, t + .003, ring * decay);
        osc.connect(gain).connect(bus);
        osc.start(t);
        osc.stop(t + ring * 6);
        return osc;
      });
      // Mallet tap: a few milliseconds of filtered noise.
      const tap = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const tapGain = ctx.createGain();
      tap.buffer = this.noise;
      filter.type = 'bandpass';
      filter.frequency.value = Math.min(frequency * 2.5, 9000);
      filter.Q.value = 1.4;
      tapGain.gain.value = level * .55;
      tap.connect(filter).connect(tapGain).connect(bus);
      tap.start(t);
      const voice = { bus, sources };
      this.voices.push(voice);
      sources[0].onended = () => {
        bus.disconnect();
        this.voices = this.voices.filter(v => v !== voice);
      };
    }

    // Damps a ringing bar quickly so a new note can take its place.
    fade(voice, t) {
      voice.bus.gain.cancelScheduledValues(t);
      voice.bus.gain.setTargetAtTime(0, t, .015);
      voice.sources.forEach(osc => { try { osc.stop(t + .1); } catch (_) { /* already stopped */ } });
    }
  }

  /**
   * 4 × 4 colour menu that opens next to the crayon (Config.childhood.palette).
   * It only reports hovers and choices; the scene decides what they mean.
   */
  class CrayonPalette {
    constructor({ element, rows, onHover, onSelect, onClose } = {}) {
      this.element = element;
      this.onHover = onHover;
      this.onSelect = onSelect;
      this.onClose = onClose;
      this.open = false;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.colors = rows.flatMap(row => row.colors.map(([hex]) => hex.toLowerCase()));
      const grid = element.querySelector('.crayon-palette__grid');
      let index = 0;
      rows.forEach(row => {
        const group = document.createElement('div');
        group.className = 'crayon-palette__row';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', row.family);
        row.colors.forEach(([hex, name]) => {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.className = 'crayon-palette__swatch';
          swatch.style.setProperty('--swatch', hex);
          swatch.dataset.color = hex.toLowerCase();
          swatch.dataset.index = String(index++);
          swatch.setAttribute('aria-label', name);
          swatch.setAttribute('aria-pressed', 'false');
          swatch.title = name;
          group.append(swatch);
        });
        grid.append(group);
      });
      this.swatches = [...grid.querySelectorAll('.crayon-palette__swatch')];
      this.swatches.forEach(swatch => {
        swatch.addEventListener('pointerenter', () => this.onHover?.(Number(swatch.dataset.index)));
        // Keyboard navigation sounds too; the programmatic focus on opening does not.
        swatch.addEventListener('focus', () => { if (swatch.matches(':focus-visible')) this.onHover?.(Number(swatch.dataset.index)); });
        swatch.addEventListener('click', event => this.choose(swatch.dataset.color, event));
      });
      element.addEventListener('keydown', event => { if (event.key === 'Escape') this.close(); });
    }

    includes(color) { return this.colors.includes(String(color).toLowerCase()); }

    // `anchor` is the crayon's position in the stage, in CSS pixels.
    show(anchor, stage) {
      const el = this.element;
      el.hidden = false;
      this.open = true;
      const width = el.offsetWidth, height = el.offsetHeight;
      const margin = 14;
      let left = anchor.x + 56, top = anchor.y - height - 18;
      if (left + width > stage.width - margin) left = anchor.x - width - 56;
      left = Math.min(Math.max(margin, left), stage.width - width - margin);
      top = Math.min(Math.max(margin, top), stage.height - height - margin);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.transformOrigin = `${anchor.x < left ? 0 : 100}% 100%`;
      gsap.fromTo(el, { autoAlpha: 0, scale: .9, y: 8 }, { autoAlpha: 1, scale: 1, y: 0, duration: this.reduced ? .1 : .32, ease: 'back.out(1.6)', overwrite: true });
      (this.swatches.find(s => s.getAttribute('aria-pressed') === 'true') || this.swatches[0]).focus({ preventScroll: true });
    }

    choose(color, event) {
      if (!this.open) return;
      this.setActive(color);
      this.close();
      this.onSelect?.(color, event);
    }

    setActive(color) {
      const value = color ? String(color).toLowerCase() : null;
      this.swatches.forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color === value)));
    }

    close({ immediate = false } = {}) {
      if (!this.open) return;
      this.open = false;
      const el = this.element;
      if (immediate) { gsap.killTweensOf(el); el.hidden = true; gsap.set(el, { clearProps: 'opacity,visibility,transform' }); }
      else gsap.to(el, { autoAlpha: 0, scale: .94, duration: this.reduced ? .08 : .18, ease: 'power2.in', overwrite: true, onComplete: () => { if (!this.open) el.hidden = true; } });
      this.onClose?.();
    }
  }

  app.PaletteTone = PaletteTone;
  app.CrayonPalette = CrayonPalette;
})();
