(() => {
  'use strict';
  const app = window.TimeExperience;
  const DEG = Math.PI / 180;

  // Orthographic, slightly elevated view looking down at the desk (picada, not overhead).
  // The camera orbits the desk focus within the configured limits, so the desk always
  // stays in frame. The visible area is fixed to the desk and the props on it: the
  // floor never comes into view; narrow screens see more of the wall and the desk instead.
  class AdulthoodCamera {
    constructor(target) {
      const limits = app.Config.adulthood.camera;
      this.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 120);
      this.target = target.clone();
      this.baseElevation = 31 * DEG;
      // The vertical range (Config.adulthood.camera.maxTilt) is split evenly around the resting
      // view, so the wall shelf and the calendar never leave the frame.
      this.tiltRange = [-limits.maxTilt / 2, limits.maxTilt / 2];
      this.maxYaw = limits.maxYaw;
      this.damping = limits.damping;
      this.distance = 30;
      this.aspect = 16 / 9;
      // Visible area in world units: the desk's width, from its front edge to the wall
      // calendar above the monitor (no legs, no floor).
      this.viewWidth = 16.2;
      this.viewHeight = 8.6;
      this.maxViewHeight = 12.5;
      this.current = { yaw: 0, tilt: 0 };
      this.desired = { yaw: 0, tilt: 0 };
      // Small slide opposite to the rotation, which then settles back (inertia).
      this.slide = new THREE.Vector2();
      this.slideTarget = new THREE.Vector2();
      this.offset = new THREE.Vector3();
      this.axis = new THREE.Vector3();
      this.drag = null;
      this.frozen = false;
      this.apply();
    }

    // Height of the visible area in world units (used to size the lifted sheet).
    get viewSize() { return this.camera.top - this.camera.bottom; }

    resize(width, height) {
      this.aspect = width / height;
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
      this.offset.addScaledVector(this.axis.setFromMatrixColumn(this.camera.matrixWorld, 1), this.slide.y);
      this.camera.position.add(this.offset);
      // Keep the desk area's width on any screen: narrow screens show more height (more wall
      // and more desk, never the floor) up to maxViewHeight.
      const height = THREE.MathUtils.clamp(this.viewWidth / this.aspect, this.viewHeight, this.maxViewHeight);
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
      this.slide.set(0, 0);
      this.frozen = false; this.drag = null;
      this.apply();
    }
  }

  app.AdulthoodCamera = AdulthoodCamera;
})();
