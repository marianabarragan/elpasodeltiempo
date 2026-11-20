(() => {
  'use strict';
  const app = window.TimeExperience;

  // Cámara ortográfica con giro limitado, amortiguación y desplazamiento opuesto al movimiento.
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
      // Encuadra los objetos y la ventana en primera persona, ocultando el piso.
      this.viewWidth = 17.5;
      this.viewHeight = 10.4;
      // Acercamiento adicional de las gafas; 1 indica reposo.
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
      // La sensibilidad baja permite girar con suavidad.
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
      // Compensa la velocidad angular y recupera el reposo con un resorte.
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
      // Conserva el ancho en pantallas estrechas y la altura en las anchas.
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
