(() => {
  'use strict';
  const app = window.TimeExperience;

  // Cinco hitos del 20 %, contados una sola vez.
  const STEPS = Object.freeze(['crayon', 'color', 'sun', 'house', 'tree']);

  /* Controla el progreso de la niñez y ejecuta onComplete al llegar al 100 %. */
  class ChildhoodProgress {
    constructor({ element, onComplete } = {}) {
      this.element = element;
      this.fill = element?.querySelector('.childhood-progress__fill');
      this.label = element?.querySelector('.childhood-progress__value');
      this.onComplete = onComplete;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.shown = { value: 0 };
      this.reset();
    }

    get value() { return this.done.size / STEPS.length * 100; }
    get complete() { return this.done.size === STEPS.length; }
    has(step) { return this.done.has(step); }

    // Cada hito suma progreso una sola vez.
    mark(step) {
      if (!STEPS.includes(step) || this.done.has(step)) return false;
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

  ChildhoodProgress.STEPS = STEPS;
  app.ChildhoodProgress = ChildhoodProgress;
})();
