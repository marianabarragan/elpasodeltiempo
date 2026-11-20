(() => {
  'use strict';
  const app = window.TimeExperience;

  /* Reparte el progreso entre casillas y objetos; al llegar al 100 % ejecuta onComplete. */
  class AdulthoodProgress {
    constructor({ element, tasks, onComplete } = {}) {
      const config = app.Config.adulthood.progress;
      this.element = element;
      this.fill = element?.querySelector('.childhood-progress__fill');
      this.label = element?.querySelector('.childhood-progress__value');
      this.onComplete = onComplete;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const share = Math.min(100, Math.max(0, config.checklist));
      const needed = Math.max(1, Math.min(config.propsNeeded, config.props.length));
      this.weights = new Map();
      for (let i = 0; i < tasks; i++) this.weights.set(`task${i}`, share / tasks);
      config.props.forEach(name => this.weights.set(name, (100 - share) / needed));
      this.shown = { value: 0 };
      this.reset();
    }

    get value() {
      let total = 0;
      this.done.forEach(step => { total += this.weights.get(step); });
      return Math.min(100, total);
    }
    get complete() { return this.value >= 99.999; }
    has(step) { return this.done.has(step); }

    // Cada hito suma progreso una sola vez.
    mark(step) {
      if (!this.weights.has(step) || this.done.has(step) || this.complete) return false;
      this.done.add(step);
      this.animate();
      return true;
    }

    animate() {
      const target = this.value, finished = this.complete;
      this.element?.setAttribute('aria-valuenow', String(Math.round(target)));
      gsap.to(this.shown, {
        value: target, duration: this.reduced ? .1 : .7, ease: 'power2.out', overwrite: true,
        onUpdate: () => this.draw(),
        onComplete: () => { if (finished && !this.notified) { this.notified = true; this.onComplete?.(); } }
      });
    }

    draw() {
      if (!this.element) return;
      this.element.style.setProperty('--progress', String(this.shown.value / 100));
      if (this.label) this.label.textContent = `${Math.round(this.shown.value)}%`;
    }

    reset() {
      this.done = new Set();
      this.notified = false;
      gsap.killTweensOf(this.shown);
      this.shown.value = 0;
      this.element?.setAttribute('aria-valuenow', '0');
      this.draw();
    }
  }

  app.AdulthoodProgress = AdulthoodProgress;
})();
