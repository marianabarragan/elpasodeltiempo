(() => {
  'use strict';
  const app = window.TimeExperience;
  // Hover feedback per prop: a small scale-up (the sheet and the calendar barely move).
  // The monitor is special: only its screen zooms in (see setHover).
  const HOVER_SCALE = { checklistPaper: 1.03, wallCalendar: 1.04, monitorPower: 1.3, default: 1.06 };
  const CLICK_TOLERANCE = 6;

  /**
   * Pointer logic of the adulthood scene. It works with prop identifiers
   * ('checklistPaper', 'pen', 'monitor', 'monitorPower', 'wallCalendar', 'coffeeThermos', 'clockDigital')
   * and their { root, visual } groups, so replacing the meshes inside `visual` does not
   * affect this module.
   *
   * Desk mode: hover feedback, clicks on props and camera drag on the rest.
   * Reading mode (sheet lifted, see SheetFocus): a click on the pen takes it, the pen then
   * follows the pointer and a click on a checkbox marks it. A click outside the sheet,
   * the right button or Esc puts the pen back beside the sheet.
   */
  class AdulthoodInteractions {
    constructor(world) {
      this.world = world;
      this.props = world.props;
      this.sheet = world.sheet;
      this.canvas = world.renderer.domElement;
      this.raycaster = new THREE.Raycaster();
      // The sheet and the pen live on their own render layer (sharp over the blur).
      this.raycaster.layers.enableAll();
      this.pointer = new THREE.Vector2();
      this.hovered = null;
      this.hoverTweens = new Map();
      this.screenZoom = { t: 0 };
      this.pointerId = null;
      this.press = null;
      this.listeners = new AbortController();
      const options = { signal: this.listeners.signal };
      this.canvas.addEventListener('pointerdown', event => this.down(event), options);
      this.canvas.addEventListener('pointermove', event => this.move(event), options);
      this.canvas.addEventListener('pointerup', event => this.up(event), options);
      this.canvas.addEventListener('pointercancel', event => this.up(event, true), options);
      this.canvas.addEventListener('pointerleave', () => { if (this.pointerId === null && !this.sheet.held) this.setHover(null); }, options);
      this.canvas.addEventListener('lostpointercapture', () => this.release(), options);
      this.canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
      window.addEventListener('keydown', event => { if (event.key === 'Escape' && this.enabled) this.sheet.dropPen(); }, options);
      window.addEventListener('blur', () => this.release(), options);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
    }

    get enabled() { return this.world.active && !app.runtime.transitioning; }
    get held() { return this.sheet.held; }

    ray(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      this.raycaster.setFromCamera(this.pointer, this.world.cameraRig.camera);
    }

    // Returns the interactive identifier under the pointer, or null. While the sheet is
    // lifted only the pen can be picked (the desk behind is out of focus).
    pick(names = null) {
      // Once the list is complete the sheet and the pen stay on the desk without feedback.
      const finished = this.world.checklist.complete ? ['checklistPaper', 'pen'] : [];
      const entries = Object.entries(this.props.interactive).filter(([name]) => (!names || names.includes(name)) && !finished.includes(name));
      const hit = this.raycaster.intersectObjects(entries.map(([, item]) => item.root), true)[0];
      let object = hit?.object;
      while (object && !object.userData.interactive) object = object.parent;
      return object?.userData.interactive || null;
    }

    setHover(name) {
      if (name === this.hovered) return;
      this.hovered = name;
      Object.entries(this.props.interactive).forEach(([key, item]) => {
        if (key === 'monitor') return;
        const scale = key === name ? HOVER_SCALE[key] || HOVER_SCALE.default : 1;
        if (Math.abs(item.visual.scale.x - scale) < .0001 && !this.hoverTweens.get(key)) return;
        this.hoverTweens.get(key)?.kill();
        this.hoverTweens.set(key, gsap.to(item.visual.scale, {
          x: scale, y: scale, z: scale, duration: .28, ease: 'power2.out',
          onUpdate: () => this.world.invalidate(),
          onComplete: () => this.hoverTweens.delete(key)
        }));
      });
      // Monitor: a subtle zoom of the screen only; the monitor and the desk stay still.
      gsap.to(this.screenZoom, {
        t: name === 'monitor' ? 1 : 0, duration: .35, ease: 'power2.out', overwrite: true,
        onUpdate: () => { this.props.monitorScreen.setZoom(this.screenZoom.t); this.world.invalidate(); }
      });
      this.canvas.dataset.hover = name || '';
    }

    down(event) {
      if (!this.enabled) return;
      const sheet = this.sheet;
      if (sheet.state === 'lifted') {
        if (event.button === 2) { sheet.dropPen(); return; }
        if (event.button === 0) this.readingClick(event);
        return;
      }
      if (sheet.state !== 'desk' || event.button !== 0 || this.pointerId !== null) return;
      this.world.interact();
      this.ray(event);
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      const target = this.pick();
      this.setHover(target);
      if (target) this.press = { target, x: event.clientX, y: event.clientY };
      this.world.cameraRig.startDrag(event.clientX, event.clientY);
    }

    // A click while the sheet is lifted: take the pen, mark a checkbox or drop the pen.
    readingClick(event) {
      const sheet = this.sheet;
      this.world.interact();
      this.ray(event);
      if (!sheet.held) {
        if (this.pick(['pen']) === 'pen') {
          sheet.grabPen();
          sheet.pointTo(this.raycaster.ray);
          this.setHover(null);
        } else if (sheet.sheetPoint(this.raycaster)) {
          this.world.hintPen();
        }
        return;
      }
      const point = sheet.sheetPoint(this.raycaster);
      if (!point) { sheet.dropPen(); return; }
      sheet.pointTo(this.raycaster.ray);
      sheet.pressPen();
      const row = this.world.checklist.hit(point.x, point.y);
      if (row) this.world.checklist.mark(row);
    }

    move(event) {
      if (!this.enabled) return;
      const sheet = this.sheet;
      if (sheet.state === 'lifted') {
        if (event.pointerType === 'touch' && !sheet.held) return;
        this.ray(event);
        if (sheet.held) sheet.pointTo(this.raycaster.ray);
        else this.setHover(this.pick(['pen']));
        return;
      }
      if (sheet.state !== 'desk') return;
      if (this.pointerId === null) {
        if (event.pointerType === 'touch') return;
        this.ray(event);
        this.setHover(this.pick());
        return;
      }
      if (this.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { this.release(); return; }
      if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_TOLERANCE) this.press = null;
      this.world.cameraRig.dragTo(event.clientX, event.clientY);
    }

    up(event, cancelled = false) {
      if (this.pointerId !== event.pointerId) return;
      const press = this.press;
      this.release();
      if (cancelled || !press || !this.enabled) return;
      this.ray(event);
      if (this.pick() === press.target) {
        this.setHover(null);
        this.world.activateProp(press.target);
      }
    }

    release() {
      this.world.cameraRig.endDrag();
      this.press = null;
      const id = this.pointerId;
      this.pointerId = null;
      if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }

    reset() {
      this.release();
      this.setHover(null);
      gsap.killTweensOf(this.screenZoom);
      this.screenZoom.t = 0;
      this.props.monitorScreen.setZoom(0);
    }

    dispose() {
      this.release();
      this.hoverTweens.forEach(tween => tween.kill());
      this.listeners.abort();
    }
  }

  app.AdulthoodInteractions = AdulthoodInteractions;
})();
