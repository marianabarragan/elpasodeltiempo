(() => {
  'use strict';
  const app = window.TimeExperience;
  class ChildhoodCamera {
    // minWidth: world width always kept in view (wide enough for the toys at either side).
    constructor(targetY, { minWidth = 21.5 } = {}) {
      this.minWidth = minWidth;
      this.camera = new THREE.OrthographicCamera(-11, 11, 7.3, -7.3, .1, 70);
      this.target = new THREE.Vector3(0, targetY, 0);
      // Rotation values are offsets from the initial oblique pose. Keeping the
      // base inclination separate makes reset() return to the intended view and
      // prevents the vertical range from ever reaching an overhead shot.
      this.initialTilt = app.Config.camera.initialTilt;
      this.current = { yaw: 0, tilt: 0 };
      this.desired = { yaw: 0, tilt: 0 };
      this.aspect = 1.6;
      this.drag = null;
      this.frozen = false;
      this.apply();
    }
    resize(width, height) {
      this.aspect = width / height;
      this.apply();
    }
    startDrag(x, y) {
      this.drag = { x, y, yaw: this.desired.yaw, tilt: this.desired.tilt };
    }
    dragTo(x, y) {
      if (!this.drag || this.frozen) return;
      // Deliberate drag sensitivity; damping preserves the small glide after
      // release while all motion remains inside the relative angle limits.
      this.desired.yaw = THREE.MathUtils.clamp(this.drag.yaw - (x - this.drag.x) * .0011, -app.Config.camera.maxYaw, app.Config.camera.maxYaw);
      this.desired.tilt = THREE.MathUtils.clamp(this.drag.tilt + (y - this.drag.y) * .00175, -app.Config.camera.maxTilt, app.Config.camera.maxTilt);
    }
    endDrag() { this.drag = null; }
    freeze() {
      this.frozen = true;
      this.drag = null;
      Object.assign(this.desired, this.current);
    }
    unfreeze() { this.frozen = false; }
    update(dt) {
      if (this.frozen) return false;
      const alpha = 1 - Math.exp(-app.Config.camera.damping * Math.min(dt, .05));
      const difference = Math.abs(this.current.yaw - this.desired.yaw) + Math.abs(this.current.tilt - this.desired.tilt);
      if (difference < .000005) return false;
      this.current.yaw = THREE.MathUtils.lerp(this.current.yaw, this.desired.yaw, alpha);
      this.current.tilt = THREE.MathUtils.lerp(this.current.tilt, this.desired.tilt, alpha);
      if (difference < .00005) Object.assign(this.current, this.desired);
      this.apply();
      return true;
    }
    apply() {
      const { yaw, tilt } = this.current;
      const inclination = this.initialTilt + tilt;
      const s = Math.sin(inclination), c = Math.cos(inclination), sy = Math.sin(yaw), cy = Math.cos(yaw);
      this.camera.position.set(22 * s * sy, this.target.y + 22 * c, 22 * s * cy);
      // Stable roll-free up vector for an orbiting orthographic camera.
      this.camera.up.set(-c * sy, s, -c * cy);
      this.camera.lookAt(this.target);
      // The oblique view shortens the paper on screen, so use a closer base
      // framing while reserving extra height as yaw mixes the room's width into
      // the vertical axis. This keeps both side toys and the foreground crayon
      // visible throughout the permitted orbit.
      const rotatedHeight = 13.2 * Math.cos(Math.abs(yaw)) + 8.6 * Math.sin(Math.abs(yaw));
      const height = Math.max(13.2, this.minWidth / this.aspect, rotatedHeight);
      this.camera.left = -height * this.aspect / 2;
      this.camera.right = height * this.aspect / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
    }
    reset() {
      Object.assign(this.current, { yaw: 0, tilt: 0 });
      Object.assign(this.desired, this.current);
      this.frozen = false; this.drag = null;
      this.apply();
    }
  }
  app.ChildhoodCamera = ChildhoodCamera;
})();
