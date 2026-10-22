(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  // Warm sunset glow used as the veil while entering the childhood memory.
  const MEMORY_GLOW = 'radial-gradient(circle at 50% 46%, #fff8eb 0%, #ffe7bd 42%, #f6bd7c 100%)';

  class SceneTransition {
    constructor({ intro, enterChildhood, prepareChildhood, enterAdulthood, enterOldAge, requestScene, showBoard, afterEnter, beforeStart }) {
      this.intro = intro;
      this.enterChildhood = enterChildhood;
      this.prepareChildhood = prepareChildhood;
      this.enterAdulthood = enterAdulthood;
      this.enterOldAge = enterOldAge;
      // Stages without a built scene only zoom in and request their scene.
      this.requestScene = requestScene;
      this.showBoard = showBoard;
      this.afterEnter = afterEnter;
      this.beforeStart = beforeStart;
      this.button = document.getElementById('startExperience');
      this.copy = document.querySelector('.intro-copy');
      this.veil = document.getElementById('transitionVeil');
      // Initial board blur comes from styles.css (--intro-blur) so reset() restores the same value.
      this.initialBlur = getComputedStyle(this.intro.container).getPropertyValue('--intro-blur').trim() || '8px';
      this.running = false;
      this.state = 'idle';
      this.timeline = null;
      this.hold = null;
      this.photoPress = null;
      this.button.addEventListener('click', () => this.start());
      const canvas = this.intro.renderer.domElement;
      canvas.addEventListener('pointerdown', event => {
        this.photoPress = null;
        if (this.state !== 'ready' || event.button !== 0 || event.isPrimary === false) return;
        const stage = this.intro.getPhotoStageAt(event.clientX, event.clientY);
        if (this.intro.isPhotoUnlocked(stage)) {
          this.photoPress = { x: event.clientX, y: event.clientY, stage };
        }
      });
      canvas.addEventListener('pointermove', event => {
        if (this.photoPress && Math.hypot(event.clientX - this.photoPress.x, event.clientY - this.photoPress.y) > 6) this.photoPress = null;
      });
      canvas.addEventListener('pointercancel', () => { this.photoPress = null; });
      canvas.addEventListener('click', event => this.selectPhoto(event));
      const section = this.intro.container.closest('[data-scene="intro"]');
      section.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || app.runtime.transitioning || !['waiting', 'ready'].includes(this.state)) return;
        this.intro.setHoveredPhoto(this.intro.getPhotoStageAt(event.clientX, event.clientY, true));
      });
      section.addEventListener('pointerleave', () => this.intro.clearHover());
      window.addEventListener('blur', () => { this.photoPress = null; this.intro.clearHover(); });
    }

    start() {
      if (this.state !== 'idle' || app.runtime.transitioning) return;
      if (!this.intro) return;
      // Count real time from the start click, independently of GSAP's animation clock.
      const waitStarted = performance.now();
      this.beforeStart?.();
      this.running = true;
      this.state = 'revealing';
      this.intro.clearHover();
      this.button.disabled = true;
      app.Interface.setLocked(true);
      app.Interface.setPhase('fade-interface');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const fade = reduced ? .12 : .7;
      const clear = reduced ? .12 : .95;
      let boardRevealed = false;
      let waitElapsed = false;
      const enablePhoto = () => {
        if (!boardRevealed || !waitElapsed || !['revealing', 'waiting'].includes(this.state)) return;
        this.enableBoard();
      };

      // Photographs accept the entry click only once this delay has passed since «Iniciar».
      const delay = app.Config.intro.photoDelayMs;
      const finishWait = () => {
        const remaining = delay - (performance.now() - waitStarted);
        if (remaining > 0) {
          this.hold = window.setTimeout(finishWait, remaining);
          return;
        }
        this.hold = null;
        waitElapsed = true;
        enablePhoto();
      };
      this.hold = window.setTimeout(finishWait, Math.max(0, delay - (performance.now() - waitStarted)));

      this.timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          boardRevealed = true;
          this.prepareChildhood();
          this.timeline = null;
          // The clear board can respond to hover before the three-second gate.
          // Photo presses/navigation still require the separate 'ready' state.
          this.state = 'waiting';
          this.intro.container.classList.add('is-photo-interaction-ready');
          app.Interface.setLocked(false);
          app.Interface.setPhase('board-hold');
          enablePhoto();
        }
      });
      this.timeline
        .to(this.copy, { autoAlpha: 0, duration: fade })
        .call(() => app.Interface.setPhase('clear-board'))
        .to(this.intro.container, { '--intro-blur': '0px', '--intro-scale': 1, duration: clear })
        .to('.intro-veil', { opacity: 0, duration: clear }, '<');
    }

    selectPhoto(event) {
      const press = this.photoPress;
      this.photoPress = null;
      if (this.state !== 'ready' || app.runtime.transitioning || event.button !== 0 || !press) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
      if (this.intro.getPhotoStageAt(event.clientX, event.clientY) !== press.stage) return;
      this.enterPhoto(press.stage);
    }

    enableBoard() {
      this.running = false;
      this.state = 'ready';
      this.intro.container.classList.add('is-photo-interaction-ready');
      app.Interface.setLocked(false);
      app.Interface.setPhase('photo-ready');
    }

    enterPhoto(stage = 'childhood') {
      if (this.state !== 'ready' || app.runtime.transitioning || !this.intro.isPhotoUnlocked(stage)) return false;
      if (!['childhood', 'adulthood', 'oldage'].includes(stage)) return false;
      const enterScene = { childhood: this.enterChildhood, adulthood: this.enterAdulthood, oldage: this.enterOldAge }[stage];
      this.state = 'entering';
      this.running = true;
      this.photoPress = null;
      this.intro.clearHover();
      this.intro.container.classList.remove('is-photo-interaction-ready');
      app.Interface.setLocked(true);
      app.Interface.setPhase('enter-photo');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const fade = reduced ? .12 : .7;
      const enter = reduced ? .15 : 2.7;
      const target = this.intro.getPhotoTarget(stage);

      this.timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          this.running = false;
          this.state = enterScene ? stage : `${stage}-pending`;
          this.timeline = null;
          app.Interface.setPhase(this.state);
          app.Interface.setLocked(false);
          if (enterScene) this.afterEnter?.(stage);
          else this.requestScene?.(stage);
          document.getElementById('experience').focus({ preventScroll: true });
        }
      });
      if (stage === 'childhood') {
        this.enterMemory(target, reduced);
        return true;
      }
      this.timeline
        .to(this.intro.cameraRig.pose, {
          x: target.x, y: target.y, zoomProgress: 1, duration: enter,
          ease: 'power3.inOut', onUpdate: () => this.intro.render()
        });
      if (enterScene) {
        this.timeline
          .call(() => app.Interface.setPhase('scene-fade'))
          .to(this.veil, { opacity: 1, duration: fade * .8 })
          .call(() => enterScene())
          .to(this.veil, { opacity: 0, duration: fade });
      }
      // Until a stage's scene exists, retain the enlarged photograph and invoke its entry hook.
      return true;
    }

    // Entry into the first photograph (childhood). The camera straightens onto the portrait
    // and keeps gliding into it while the golden-hour light swells; a warm glow then covers
    // the screen and the childhood room appears through it. It is added to the timeline built
    // by enterPhoto(), so states, locks and callbacks are the same as before.
    enterMemory(target, reduced) {
      const veil = this.veil;
      const glide = reduced ? .15 : 3.2;
      const glowStart = reduced ? 0 : 1.75;
      const fadeStart = reduced ? .05 : 2.3;
      const glow = { amount: 0 };
      this.timeline
        .to(this.intro.cameraRig.pose, {
          x: target.x, y: target.y, zoomProgress: reduced ? 1 : 1.12,
          roll: reduced ? 0 : this.intro.getPhotoRoll('childhood'),
          duration: glide, ease: 'power3.inOut', onUpdate: () => this.intro.render()
        }, 0)
        .to(glow, {
          amount: 1, duration: glide - glowStart, ease: 'sine.in',
          onUpdate: () => { this.intro.setMemoryGlow(glow.amount); this.intro.render(); }
        }, glowStart)
        .call(() => {
          app.Interface.setPhase('scene-fade');
          gsap.set(veil, { background: MEMORY_GLOW });
        }, null, fadeStart)
        .to(veil, { opacity: 1, duration: glide - fadeStart, ease: 'power1.inOut' }, fadeStart)
        .to(this.intro.container, { '--intro-blur': reduced ? '0px' : '5px', duration: glide - fadeStart, ease: 'power1.in' }, fadeStart)
        .call(() => this.enterChildhood())
        .to(veil, { opacity: 0, duration: reduced ? .12 : 1.05, ease: 'power1.out' })
        .set(veil, { clearProps: 'background' });
    }

    // unlock: stage whose photograph becomes available on arrival ('adulthood', 'oldage').
    returnToBoard({ unlockAdulthood = false, unlock = unlockAdulthood ? 'adulthood' : null } = {}) {
      if (app.runtime.transitioning || this.running) return false;
      this.running = true;
      this.state = 'returning';
      this.photoPress = null;
      this.intro.clearHover();
      this.intro.container.classList.remove('is-photo-interaction-ready');
      app.Interface.setLocked(true);
      app.Interface.setPhase('return-board');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const fade = reduced ? .12 : .7;
      this.timeline = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          this.timeline = null;
          if (unlock && !this.intro.isPhotoUnlocked(unlock)) {
            this.state = 'unlocking';
            app.Interface.setPhase(`unlock-${unlock}`);
            this.intro.unlockPhoto(unlock, {
              duration: reduced ? .15 : 1.1,
              onComplete: () => this.enableBoard()
            });
          } else this.enableBoard();
        }
      });
      this.timeline
        .to(this.veil, { opacity: 1, duration: fade })
        .call(() => {
          this.showBoard();
          gsap.set(this.copy, { autoAlpha: 0 });
          gsap.set(this.intro.container, { '--intro-blur': '0px', '--intro-scale': 1 });
          gsap.set('.intro-veil', { opacity: 0 });
          this.intro.reset();
        })
        .to(this.veil, { opacity: 0, duration: fade });
      return true;
    }

    reset() {
      this.timeline?.kill();
      window.clearTimeout(this.hold);
      this.hold = null;
      this.photoPress = null;
      this.timeline = null; this.running = false; this.state = 'idle';
      this.button.disabled = false;
      this.intro.container.classList.remove('is-photo-interaction-ready');
      gsap.set(this.copy, { autoAlpha: 1 });
      gsap.set(this.intro.container, { '--intro-blur': this.initialBlur, '--intro-scale': 1.025 });
      gsap.set(this.veil, { clearProps: 'background' });
      gsap.set('.intro-veil', { opacity: 1 });
      gsap.set(this.veil, { opacity: 0 });
      this.intro.resetPhotoLocks();
      this.intro.reset();
      app.Interface.setLocked(false); app.Interface.setPhase('intro');
    }
  }
  app.SceneTransition = SceneTransition;
})();
