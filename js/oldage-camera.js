(() => {
  'use strict';
  const app = window.TimeExperience;

  // Orthographic, slightly elevated view looking down at the table (picada, never overhead).
  // Like the adulthood camera, it orbits a fixed focus within the configured limits
  // (±maxYaw horizontally, ±maxTilt vertically), with damping and a small slide
  // opposite to the motion that settles back when the pointer is released.
  class OldAgeCamera {
    constructor(target) {
      const limits = app.Config.oldage.camera;
      this.camera = new THREE.OrthographicCamera(-10, 10, 6.5, -6.5, .1, 120);
      this.target = target.clone();
      this.baseElevation = limits.elevation;
      this.maxYaw = limits.maxYaw;
      this.maxTilt = limits.maxTilt;
      this.damping = limits.damping;
      this.distance = 30;
      this.aspect = 16 / 9;
      // Visible area: the whole table (width) and the window above it (height).
      this.viewWidth = 19.5;
      this.viewHeight = 13.4;
      // Extra zoom used by the first-person glasses animation (1 = rest).
      this.zoom = 1;
      this.current = { yaw: 0, tilt: 0 };
      this.desired = { yaw: 0, tilt: 0 };
      this.slide = new THREE.Vector2();
      this.slideTarget = new THREE.Vector2();
      this.offset = new THREE.Vector3();
      this.axis = new THREE.Vector3();
      this.drag = null;
      this.frozen = false;
      this.apply();
    }

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
      this.desired.yaw = THREE.MathUtils.clamp(this.drag.yaw - (x - this.drag.x) * .0012, -this.maxYaw, this.maxYaw);
      this.desired.tilt = THREE.MathUtils.clamp(this.drag.tilt + (y - this.drag.y) * .0012, -this.maxTilt, this.maxTilt);
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
      if (dt <= 0) return;
      const alpha = 1 - Math.exp(-this.damping * dt);
      const yawStep = (this.desired.yaw - this.current.yaw) * alpha;
      const tiltStep = (this.desired.tilt - this.current.tilt) * alpha;
      this.current.yaw += yawStep;
      this.current.tilt += tiltStep;
      // Angular speed pushes the view slightly the other way; a spring brings it back.
      this.slideTarget.set(-yawStep / dt * .5, -tiltStep / dt * .4);
      this.slideTarget.clampLength(0, .32);
      this.slide.lerp(this.slideTarget, 1 - Math.exp(-6 * dt));
      if (Math.abs(yawStep) + Math.abs(tiltStep) < .000004 && this.slide.lengthSq() < .000001) {
        Object.assign(this.current, this.desired);
        this.slide.set(0, 0);
      }
      this.apply();
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
      this.camera.updateMatrixWorld();
      this.offset.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(this.slide.x);
      this.offset.addScaledVector(this.axis.setFromMatrixColumn(this.camera.matrixWorld, 1), this.slide.y);
      this.camera.position.add(this.offset);
      // Fill the screen: keep the table's width on narrow screens and the room's height on wide ones.
      const height = Math.max(this.viewHeight, this.viewWidth / this.aspect);
      this.camera.left = -height * this.aspect / 2;
      this.camera.right = height * this.aspect / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.zoom = this.zoom;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
    }

    reset() {
      Object.assign(this.current, { yaw: 0, tilt: 0 });
      Object.assign(this.desired, this.current);
      this.slide.set(0, 0);
      this.zoom = 1;
      this.frozen = false; this.drag = null;
      this.apply();
    }
  }

  app.OldAgeCamera = OldAgeCamera;
})();
