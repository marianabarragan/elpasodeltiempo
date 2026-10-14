(() => {
  'use strict';
  const app = window.TimeExperience;
  const CLICK_TOLERANCE = 6;

  /**
   * Narrative order of scenario 3, independent of any mesh or animation:
   *   glasses → (wearing) → choose → (moving-pot) → can → (moving-can) → water → (returning) → complete
   * Steps in parentheses are animations driven by the scene; nothing is interactive meanwhile.
   * Identifiers: 'glasses', 'pot1', 'pot2', 'wateringCan'.
   */
  class OldAgeActivity {
    constructor({ wateringSeconds = 4.5, onChange } = {}) {
      this.wateringSeconds = wateringSeconds;
      this.onChange = onChange;
      this.reset();
    }

    reset() {
      this.step = 'glasses';
      this.chosen = null;
      this.watered = 0;
      this.pouring = false;
    }

    set(step) {
      this.step = step;
      this.onChange?.(step);
    }

    // Objects that respond to the pointer in the current step. Before the glasses are on,
    // only the glasses respond; once a pot is chosen the other one never responds again.
    get interactive() {
      return {
        glasses: ['glasses'],
        choose: ['pot1', 'pot2'],
        can: ['wateringCan'],
        water: ['wateringCan']
      }[this.step] || [];
    }

    // Hidden curiosities ('radio', 'coffeeCup'): no glow and no hover, they only answer a
    // click, and only once the glasses are on (nothing else responds before that).
    get curiosities() {
      return ['glasses', 'wearing'].includes(this.step) ? [] : ['radio', 'coffeeCup'];
    }

    // Objects whose soft blinking glow invites the next action.
    get glowing() {
      if (this.step === 'water') return this.pouring || this.watered > 0 ? [] : ['wateringCan'];
      return this.interactive;
    }

    get progress() { return Math.min(1, this.watered / this.wateringSeconds); }
    get complete() { return this.step === 'complete'; }

    // Adds held time while pouring; returns true exactly once, when the bar fills up.
    addWatering(dt) {
      if (this.step !== 'water' || !this.pouring) return false;
      this.watered = Math.min(this.wateringSeconds, this.watered + dt);
      return this.watered >= this.wateringSeconds;
    }
  }

  /**
   * Pointer logic of the old-age scene. Works only with identifiers and the
   * { root, visual } groups of the props, never with the meshes inside them.
   * The scene (`world`) performs every visual response.
   */
  class OldAgeInteractions {
    constructor(world) {
      this.world = world;
      this.activity = world.activity;
      this.canvas = world.renderer.domElement;
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.hovered = null;
      this.pointerId = null;
      this.press = null;
      this.listeners = new AbortController();
      const options = { signal: this.listeners.signal };
      this.canvas.addEventListener('pointerdown', event => this.down(event), options);
      this.canvas.addEventListener('pointermove', event => this.move(event), options);
      this.canvas.addEventListener('pointerup', event => this.up(event), options);
      this.canvas.addEventListener('pointercancel', event => this.up(event, true), options);
      this.canvas.addEventListener('pointerleave', () => { if (this.pointerId === null) this.setHover(null); }, options);
      this.canvas.addEventListener('lostpointercapture', () => this.release(), options);
      this.canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
      window.addEventListener('blur', () => this.release(), options);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
    }

    get enabled() { return this.world.active && !app.runtime.transitioning; }

    ray(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      this.raycaster.setFromCamera(this.pointer, this.world.cameraRig.camera);
    }

    // Identifier under the pointer among the objects allowed in the current step, or null.
    // Curiosities are only considered for clicks, so hovering them reveals nothing.
    pick(withCuriosities = false) {
      const props = this.world.props;
      const allowed = this.activity.interactive.map(name => props.interactive[name]);
      if (withCuriosities) allowed.push(...this.activity.curiosities.map(name => props.curiosities[name]));
      if (!allowed.length) return null;
      const roots = allowed.map(item => item.root);
      const hits = this.raycaster.intersectObjects(roots, true);
      for (const hit of hits) {
        let object = hit.object;
        if (object.userData.glowShell) continue;
        while (object && !object.userData.interactive) object = object.parent;
        if (object) return object.userData.interactive;
      }
      return null;
    }

    setHover(name) {
      if (name === this.hovered) return;
      this.hovered = name;
      this.world.setHover(name);
      this.canvas.dataset.hover = name || '';
    }

    refreshHover() {
      if (!this.activity.interactive.includes(this.hovered)) this.setHover(null);
    }

    down(event) {
      if (!this.enabled || event.button !== 0 || this.pointerId !== null) return;
      this.ray(event);
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      const target = this.pick(true);
      this.setHover(this.activity.interactive.includes(target) ? target : null);
      // Watering: hold the click on the can positioned over the pot.
      if (target === 'wateringCan' && this.activity.step === 'water') {
        this.world.cameraRig.freeze();
        this.activity.pouring = true;
        this.world.setPouring(true);
        return;
      }
      if (target) this.press = { target, x: event.clientX, y: event.clientY };
      this.world.cameraRig.startDrag(event.clientX, event.clientY);
    }

    move(event) {
      if (!this.enabled) return;
      if (this.pointerId === null) {
        if (event.pointerType === 'touch') return;
        this.ray(event);
        this.setHover(this.pick());
        return;
      }
      if (this.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { this.release(); return; }
      if (this.activity.pouring) return;
      if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_TOLERANCE) this.press = null;
      this.world.cameraRig.dragTo(event.clientX, event.clientY);
    }

    up(event, cancelled = false) {
      if (this.pointerId !== event.pointerId) return;
      const press = this.press;
      this.release();
      if (cancelled || !press || !this.enabled) return;
      this.ray(event);
      if (this.pick(true) === press.target) this.activate(press.target);
    }

    // Single clicks advance the activity; each step accepts only its own objects.
    activate(name) {
      const activity = this.activity;
      if (activity.curiosities.includes(name)) { this.world.poke(name); return; }
      if (!activity.interactive.includes(name)) return;
      if (activity.step === 'glasses' && name === 'glasses') {
        activity.set('wearing');
        this.setHover(null);
        this.world.wearGlasses(() => activity.set('choose'));
      } else if (activity.step === 'choose' && (name === 'pot1' || name === 'pot2')) {
        // The choice is fixed for this run of the scene.
        activity.chosen = name;
        activity.set('moving-pot');
        this.setHover(null);
        this.world.choosePot(name, () => activity.set('can'));
      } else if (activity.step === 'can' && name === 'wateringCan') {
        activity.set('moving-can');
        this.setHover(null);
        this.world.bringCan(activity.chosen, () => activity.set('water'));
      }
      this.refreshHover();
    }

    stopPouring() {
      if (!this.activity.pouring) return;
      this.activity.pouring = false;
      this.world.setPouring(false);
    }

    release() {
      this.world.cameraRig.endDrag();
      this.world.cameraRig.unfreeze();
      this.stopPouring();
      this.press = null;
      const id = this.pointerId;
      this.pointerId = null;
      if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }

    reset() {
      this.release();
      this.setHover(null);
    }

    dispose() {
      this.release();
      this.listeners.abort();
    }
  }

  app.OldAgeActivity = OldAgeActivity;
  app.OldAgeInteractions = OldAgeInteractions;
})();
