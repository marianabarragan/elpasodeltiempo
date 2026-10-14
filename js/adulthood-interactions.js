(() => {
  'use strict';
  const app = window.TimeExperience;
  const HOVER_SCALE = 1.06;
  const CLICK_TOLERANCE = 6;

  /**
   * Pointer logic of the adulthood scene. It works with prop identifiers
   * ('pen', 'coffeeThermos', 'clockDigital') and their { root, visual } groups,
   * so replacing the meshes inside `visual` does not affect this module.
   */
  class AdulthoodInteractions {
    constructor(world) {
      this.world = world;
      this.props = world.props;
      this.canvas = world.renderer.domElement;
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.hovered = null;
      this.hoverTweens = new Map();
      this.held = false;
      this.pointerId = null;
      this.press = null;
      this.releaseTween = null;
      this.point = new THREE.Vector3();
      const paper = this.props.paper;
      // The pen tip moves on a plane just above the sheet and never leaves the sheet's area,
      // so it cannot cross the keyboard, the clock or other props.
      this.penMargin = .32;
      this.penPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(paper.root.position.y + paper.surfaceTop + .012));
      // Pen pose while writing: tip down, top leaning back toward the viewer and to the right.
      this.heldQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(-.62, -.7, -.3).normalize()
      );
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

    // Returns the interactive identifier under the pointer, or null.
    pick() {
      const roots = Object.values(this.props.interactive).map(item => item.root);
      const hit = this.raycaster.intersectObjects(roots, true)[0];
      let object = hit?.object;
      while (object && !object.userData.interactive) object = object.parent;
      return object?.userData.interactive || null;
    }

    setHover(name) {
      if (name === this.hovered) return;
      this.hovered = name;
      Object.entries(this.props.interactive).forEach(([key, item]) => {
        const scale = key === name ? HOVER_SCALE : 1;
        if (Math.abs(item.visual.scale.x - scale) < .0001 && !this.hoverTweens.get(key)) return;
        this.hoverTweens.get(key)?.kill();
        this.hoverTweens.set(key, gsap.to(item.visual.scale, {
          x: scale, y: scale, z: scale, duration: .28, ease: 'power2.out',
          onUpdate: () => this.world.invalidate(),
          onComplete: () => this.hoverTweens.delete(key)
        }));
      });
      this.canvas.dataset.hover = name || '';
    }

    down(event) {
      if (!this.enabled || event.button !== 0 || this.pointerId !== null) return;
      this.world.interact();
      this.ray(event);
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      const target = this.pick();
      this.setHover(target);
      if (target === 'pen') {
        this.grabPen(event);
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
      if (this.held) { this.movePen(event); return; }
      if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_TOLERANCE) this.press = null;
      this.world.cameraRig.dragTo(event.clientX, event.clientY);
    }

    up(event, cancelled = false) {
      if (this.pointerId !== event.pointerId) return;
      const press = this.press;
      this.release();
      if (cancelled || !press || !this.enabled) return;
      this.ray(event);
      if (this.pick() === press.target) this.world.activateProp(press.target);
    }

    grabPen(event) {
      const pen = this.props.pen;
      this.releaseTween?.kill();
      gsap.killTweensOf(pen.root.position);
      this.held = true;
      this.world.cameraRig.freeze();
      pen.root.quaternion.copy(this.heldQuaternion);
      this.world.checklist.beginStroke();
      this.world.onPenGrab?.();
      this.movePen(event);
    }

    movePen(event) {
      const { pen, paper } = this.props;
      this.ray(event);
      // Exact point on the crumpled sheet when the pointer is over it; otherwise the
      // plane above the sheet, clamped to the sheet's surroundings.
      const hit = this.raycaster.intersectObject(paper.mesh, false)[0];
      const point = this.point;
      if (hit) point.copy(hit.point);
      else if (!this.raycaster.ray.intersectPlane(this.penPlane, point)) return;
      const local = paper.root.worldToLocal(point.clone());
      const halfW = paper.width / 2, halfH = paper.height / 2;
      const onSheet = Boolean(hit) && Math.abs(local.x) <= halfW && Math.abs(local.z) <= halfH;
      if (!hit) {
        local.x = THREE.MathUtils.clamp(local.x, -halfW - this.penMargin, halfW + this.penMargin);
        local.z = THREE.MathUtils.clamp(local.z, -halfH - this.penMargin, halfH + this.penMargin);
        local.y = paper.surfaceTop + .012;
        point.copy(paper.root.localToWorld(local.clone()));
      }
      // Place the pen so that its tip (scaled by the hover state) touches the point.
      const tip = pen.tip.clone().multiply(pen.visual.scale).applyQuaternion(pen.root.quaternion);
      const target = pen.root.parent.worldToLocal(point.clone().add(new THREE.Vector3(0, .008, 0)));
      pen.root.position.copy(target.sub(tip));
      this.world.invalidate();
      if (!onSheet) { this.world.checklist.breakStroke(); return; }
      const checklist = this.world.checklist;
      checklist.strokeTo((local.x / paper.width + .5) * checklist.width, (local.z / paper.height + .5) * checklist.height);
    }

    release() {
      this.world.cameraRig.endDrag();
      this.world.cameraRig.unfreeze();
      this.press = null;
      const id = this.pointerId;
      this.pointerId = null;
      if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
      if (!this.held) return;
      this.held = false;
      this.world.checklist.endStroke();
      this.returnPen();
    }

    // Smoothly put the pen back on the desk, lifting it slightly so it clears the sheet.
    returnPen(immediate = false) {
      const { root, rest } = this.props.pen;
      this.releaseTween?.kill();
      if (immediate) {
        root.position.copy(rest.position); root.quaternion.copy(rest.quaternion);
        this.world.invalidate();
        return;
      }
      const from = root.position.clone(), initial = root.quaternion.clone(), pose = { t: 0 };
      const lift = .45;
      this.releaseTween = gsap.to(pose, {
        t: 1, duration: .55, ease: 'power2.inOut',
        onUpdate: () => {
          root.position.lerpVectors(from, rest.position, pose.t);
          root.position.y += Math.sin(pose.t * Math.PI) * lift;
          root.quaternion.slerpQuaternions(initial, rest.quaternion, pose.t);
          this.world.invalidate();
        },
        onComplete: () => { this.releaseTween = null; }
      });
    }

    reset() {
      this.release();
      this.setHover(null);
      this.returnPen(true);
    }

    dispose() {
      this.release();
      this.releaseTween?.kill();
      this.hoverTweens.forEach(tween => tween.kill());
      this.listeners.abort();
    }
  }

  app.AdulthoodInteractions = AdulthoodInteractions;
})();
