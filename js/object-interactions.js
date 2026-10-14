(() => {
  'use strict';
  const app = window.TimeExperience;
  class ObjectInteractions {
    constructor(world) {
      this.world = world;
      this.canvas = world.renderer.domElement;
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.paper.position.y);
      this.held = false;
      this.pointerId = null;
      this.previous = null;
      this.releaseTween = null;
      this.hovered = false;
      this.hoverTween = null;
      this.listeners = new AbortController();
      const options = { signal: this.listeners.signal };
      this.canvas.addEventListener('pointerdown', event => this.down(event), options);
      this.canvas.addEventListener('pointermove', event => this.move(event), options);
      this.canvas.addEventListener('pointerleave', () => this.clearHover(), options);
      this.canvas.addEventListener('pointerup', event => this.up(event), options);
      this.canvas.addEventListener('pointercancel', event => this.up(event), options);
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
    hitsCrayon(includeRest = false) {
      const crayon = this.world.props.crayon;
      crayon.updateWorldMatrix(true, true);
      if (this.raycaster.intersectObject(crayon, true).length) return true;
      if (!includeRest) return false;
      // Keep the resting silhouette pickable during the tiny hop. Otherwise
      // lifting the geometry out from under the pointer could retrigger hover
      // or make an immediate click miss the object being offered to the user.
      const origin = this.raycaster.ray.origin.clone();
      const restWorld = crayon.parent.localToWorld(this.world.props.crayonRest.position.clone());
      const offset = crayon.getWorldPosition(new THREE.Vector3()).sub(restWorld);
      this.raycaster.ray.origin.add(offset);
      const hit = this.raycaster.intersectObject(crayon, true).length > 0;
      this.raycaster.ray.origin.copy(origin);
      return hit;
    }
    updateHover(event) {
      if (event.pointerType === 'touch' || this.held || this.releaseTween?.isActive()) return;
      this.ray(event);
      const hit = this.hitsCrayon(this.hovered);
      if (!hit) { this.clearHover(); return; }
      if (this.hovered || this.hoverTween?.isActive()) return;
      this.hovered = true;
      this.world.interact();
      const crayon = this.world.props.crayon;
      const rest = this.world.props.crayonRest.position;
      this.hoverTween = gsap.timeline({
        onUpdate: () => this.world.invalidate(),
        onComplete: () => { this.hoverTween = null; }
      }).to(crayon.position, { y: rest.y + .28, duration: .2, ease: 'power2.out' })
        .to(crayon.position, { y: rest.y, duration: .35, ease: 'sine.inOut' });
    }
    clearHover(returnHome = true) {
      if (!this.hovered && !this.hoverTween) return;
      this.hovered = false;
      this.hoverTween?.kill();
      this.hoverTween = null;
      if (!returnHome || this.held) return;
      const crayon = this.world.props.crayon;
      const rest = this.world.props.crayonRest.position;
      if (crayon.position.distanceToSquared(rest) < 1e-8) return;
      this.hoverTween = gsap.to(crayon.position, {
        x: rest.x, y: rest.y, z: rest.z, duration: .18, ease: 'power2.out',
        onUpdate: () => this.world.invalidate(),
        onComplete: () => { this.hoverTween = null; }
      });
    }
    down(event) {
      if (!this.enabled || event.button !== 0 || this.pointerId !== null) return;
      this.world.interact();
      this.ray(event);
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      const hit = this.hitsCrayon(this.hovered);
      this.clearHover(!hit);
      if (hit) {
        this.releaseTween?.kill();
        gsap.killTweensOf(this.world.props.crayon.position);
        this.held = true;
        this.previous = null;
        this.world.painting.breakStroke();
        this.world.cameraRig.freeze();
        this.world.props.crayon.quaternion.setFromEuler(new THREE.Euler(0, -.22, -.82));
        this.moveTool(event, false);
      } else {
        this.world.cameraRig.startDrag(event.clientX, event.clientY);
      }
    }
    move(event) {
      if (!this.enabled) { this.clearHover(); return; }
      if (this.pointerId === null) {
        if (!event.buttons) this.updateHover(event);
        return;
      }
      if (this.pointerId !== event.pointerId) return;
      this.world.interact();
      if (!(event.buttons & 1)) { this.release(); return; }
      if (this.held) this.moveTool(event, true);
      else this.world.cameraRig.dragTo(event.clientX, event.clientY);
    }
    moveTool(event, paint) {
      this.ray(event);
      const point = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.plane, point)) return;
      const crayon = this.world.props.crayon;
      const tipOffset = this.world.props.crayonTip.clone().multiply(crayon.scale).applyQuaternion(crayon.quaternion);
      const localPoint = crayon.parent.worldToLocal(point.clone());
      // The transformed local tip lands exactly on the ray/plane intersection,
      // independent of the new uniform scale or the permitted camera rotation.
      crayon.position.copy(localPoint.sub(tipOffset));
      this.world.invalidate();
      const onCanvas = document.elementFromPoint(event.clientX, event.clientY) === this.canvas;
      const hit = onCanvas ? this.raycaster.intersectObject(this.world.paper, false)[0] : null;
      if (!paint || !hit?.uv) {
        this.previous = null;
        this.world.painting.breakStroke();
        this.world.audio.setPainting(false);
        return;
      }
      const current = { x: hit.uv.x * this.world.painting.width, y: (1 - hit.uv.y) * this.world.painting.height };
      const from = this.previous || current;
      const moving = Math.hypot(current.x - from.x, current.y - from.y) > .5;
      const painted = this.world.painting.stampSegment(from, current, this.world.color);
      this.previous = current;
      this.world.audio.setPainting(painted && moving);
      clearTimeout(this.frictionTimer);
      // Stop friction if the pointer stops, even with the mouse button still held.
      this.frictionTimer = setTimeout(() => this.world.audio.setPainting(false), 95);
    }
    up(event) {
      if (this.pointerId !== event.pointerId) return;
      this.release();
    }
    release() {
      this.clearHover(false);
      clearTimeout(this.frictionTimer);
      this.world.audio.setPainting(false);
      this.world.cameraRig.endDrag();
      this.world.cameraRig.unfreeze();
      const id = this.pointerId;
      this.pointerId = null;
      if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
      if (!this.held) {
        // Cancelling a hover (blur, scene exit or reset) also restores contact.
        if (!this.releaseTween?.isActive()) {
          this.world.props.crayon.position.copy(this.world.props.crayonRest.position);
          this.world.invalidate();
        }
        return;
      }
      this.held = false;
      this.previous = null;
      this.world.painting.breakStroke();
      const crayon = this.world.props.crayon;
      const rest = this.world.props.crayonRest;
      const initial = crayon.quaternion.clone(), pose = { t: 0 };
      this.releaseTween?.kill();
      this.releaseTween = gsap.timeline({ onUpdate: () => this.world.invalidate() });
      this.releaseTween.to(crayon.position, { x: rest.position.x, y: rest.position.y, z: rest.position.z, duration: .42, ease: 'power2.out' });
      this.releaseTween.to(pose, { t: 1, duration: .42, ease: 'power2.out', onUpdate: () => crayon.quaternion.slerpQuaternions(initial, rest.quaternion, pose.t) }, 0);
    }
    dispose() {
      this.release();
      this.releaseTween?.kill();
      this.hoverTween?.kill();
      this.listeners.abort();
    }
  }
  app.ObjectInteractions = ObjectInteractions;
})();
