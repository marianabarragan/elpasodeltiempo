(() => {
  'use strict';
  const app = window.TimeExperience;
  const DEG = Math.PI / 180;

  // First-person, slightly elevated view looking down at the desk (picada, not overhead).
  // The camera orbits the desk focus within the configured limits, so the desk always
  // stays in frame and the camera never leaves the open space in front of it.
  class AdulthoodCamera {
    constructor(target) {
      const limits = app.Config.adulthood.camera;
      this.camera = new THREE.PerspectiveCamera(40, 16 / 9, .1, 120);
      this.target = target.clone();
      this.baseElevation = 31 * DEG;
      // The 25° vertical range is split around the resting view: 10° lower, 15° higher.
      this.tiltRange = [-limits.maxTilt * .4, limits.maxTilt * .6];
      this.maxYaw = limits.maxYaw;
      this.damping = limits.damping;
      this.focusHalfWidth = 6.9;
      this.distance = 12.3;
      this.current = { yaw: 0, tilt: 0 };
      this.desired = { yaw: 0, tilt: 0 };
      // Small slide opposite to the rotation, which then settles back (inertia).
      this.slide = new THREE.Vector2();
      this.slideTarget = new THREE.Vector2();
      this.offset = new THREE.Vector3();
      this.drag = null;
      this.frozen = false;
      this.apply();
    }

    resize(width, height) {
      this.camera.aspect = width / height;
      const halfHorizontal = Math.atan(Math.tan(this.camera.fov * DEG / 2) * this.camera.aspect);
      // Wide screens keep the resting distance; narrow ones step back so the desk fits.
      this.distance = Math.min(24, Math.max(12.3, this.focusHalfWidth / Math.tan(halfHorizontal)));
      this.camera.updateProjectionMatrix();
      this.apply();
    }

    startDrag(x, y) {
      if (this.frozen) return;
      this.drag = { x, y, yaw: this.desired.yaw, tilt: this.desired.tilt };
    }

    dragTo(x, y) {
      if (!this.drag || this.frozen) return;
      // Low sensitivity keeps the rotation slow and controlled.
      this.desired.yaw = THREE.MathUtils.clamp(this.drag.yaw - (x - this.drag.x) * .0021, -this.maxYaw, this.maxYaw);
      this.desired.tilt = THREE.MathUtils.clamp(this.drag.tilt + (y - this.drag.y) * .0017, ...this.tiltRange);
    }

    endDrag() { this.drag = null; }

    freeze() {
      this.frozen = true;
      this.drag = null;
      Object.assign(this.desired, this.current);
    }

    unfreeze() { this.frozen = false; }

    update(dt) {
      dt = Math.min(dt, .05);
      if (dt <= 0) return false;
      const alpha = 1 - Math.exp(-this.damping * dt);
      const yawStep = (this.desired.yaw - this.current.yaw) * alpha;
      const tiltStep = (this.desired.tilt - this.current.tilt) * alpha;
      this.current.yaw += yawStep;
      this.current.tilt += tiltStep;
      // Angular speed pushes the view slightly the other way; a spring brings it back.
      this.slideTarget.set(-yawStep / dt * .32, -tiltStep / dt * .22);
      this.slideTarget.clampLength(0, .38);
      this.slide.lerp(this.slideTarget, 1 - Math.exp(-6 * dt));
      const moving = Math.abs(yawStep) + Math.abs(tiltStep) > .000004 || this.slide.lengthSq() > .000001;
      if (!moving) {
        if (this.slide.lengthSq() || this.current.yaw !== this.desired.yaw || this.current.tilt !== this.desired.tilt) {
          Object.assign(this.current, this.desired);
          this.slide.set(0, 0);
          this.apply();
          return true;
        }
        return false;
      }
      this.apply();
      return true;
    }

    apply() {
      const elevation = this.baseElevation + this.current.tilt;
      const yaw = this.current.yaw;
      const ce = Math.cos(elevation);
      this.camera.position.set(
        this.target.x + this.distance * ce * Math.sin(yaw),
        this.target.y + this.distance * Math.sin(elevation),
        this.target.z + this.distance * ce * Math.cos(yaw)
      );
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.target);
      // Slide camera and focus together along the view's right/up axes.
      this.camera.updateMatrixWorld();
      this.offset.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(this.slide.x);
      this.offset.addScaledVector(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1), this.slide.y);
      this.camera.position.add(this.offset);
      this.camera.updateMatrixWorld();
    }

    reset() {
      Object.assign(this.current, { yaw: 0, tilt: 0 });
      Object.assign(this.desired, this.current);
      this.slide.set(0, 0);
      this.frozen = false; this.drag = null;
      this.apply();
    }
  }

  app.AdulthoodCamera = AdulthoodCamera;
})();
