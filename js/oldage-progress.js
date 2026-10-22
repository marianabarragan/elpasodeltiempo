(() => {
  'use strict';
  const app = window.TimeExperience;

  /**
   * Progress of scenario 3 (old age), horizontal at the top of the screen from the start.
   * Four milestones with the weights of Config.oldage.progress:
   *   'glasses'  → the glasses are on and the view is sharp
   *   'pot'      → the chosen pot has reached the centre
   *   'watering' → the 4.5 s of watering are complete
   *   'extra'    → first interaction with the coffee cup or the radio (only once for both)
   * Each milestone counts once and the bar never goes back. At 100 % `onComplete` runs after
   * the fill animation. Same markup and look as the scenario 1 bar.
   */
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

    // Registers a milestone; repeated actions do not add progress again.
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
