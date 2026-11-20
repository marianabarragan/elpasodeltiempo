(() => {
  'use strict';
  const app = window.TimeExperience;

  /* Suma gafas, maceta, riego y taza o radio; al completar la barra ejecuta onComplete. */
  class OldAgeProgress {
    constructor({ element, onComplete } = {}) {
      this.weights = new Map(Object.entries(app.Config.oldage.progress));
      this.element = element;
      this.label = element?.querySelector('.childhood-progress__value');
      this.onComplete = onComplete;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      if (!this.weights.has(step) || this.done.has(step)) return false;
      this.done.add(step);
      const target = this.value, finished = this.complete;
      this.element?.setAttribute('aria-valuenow', String(Math.round(target)));
      gsap.to(this.shown, {
        value: target, duration: this.reduced ? .1 : .7, ease: 'power2.out', overwrite: true,
        onUpdate: () => this.draw(),
        onComplete: () => { if (finished && !this.notified) { this.notified = true; this.onComplete?.(); } }
      });
      return true;
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

  app.OldAgeProgress = OldAgeProgress;
})();
