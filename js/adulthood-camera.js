(() => {
  'use strict';
  const app = window.TimeExperience;
  const DEG = Math.PI / 180;

  // Cámara ortográfica en picada que mantiene el escritorio dentro del encuadre.
  class AdulthoodCamera {
    constructor(target) {
      const limits = app.Config.adulthood.camera;
      this.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 120);
      this.target = target.clone();
      this.baseElevation = 31 * DEG;
      // Reparte el giro vertical alrededor del reposo para conservar repisa y calendario a la vista.
      this.tiltRange = [-limits.maxTilt / 2, limits.maxTilt / 2];
      this.maxYaw = limits.maxYaw;
      this.damping = limits.damping;
      this.distance = 30;
      this.aspect = 16 / 9;
      // Encuadra desde el borde del escritorio hasta el calendario.
      this.viewWidth = 16.2;
      this.viewHeight = 8.6;
      this.maxViewHeight = 12.5;
      this.current = { yaw: 0, tilt: 0 };
      this.desired = { yaw: 0, tilt: 0 };
      // Añade un desplazamiento opuesto al giro que vuelve al reposo.
      this.slide = new THREE.Vector2();
      this.slideTarget = new THREE.Vector2();
      this.offset = new THREE.Vector3();
      this.axis = new THREE.Vector3();
      this.drag = null;
      this.frozen = false;
      this.apply();
    }

    // Altura visible usada para dimensionar la hoja levantada.
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
      // La sensibilidad baja permite girar con suavidad.
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
      // Compensa la velocidad angular y recupera el reposo con un resorte.
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
      // Desplaza cámara y foco sobre los ejes de la vista.
      this.camera.updateMatrixWorld();
      this.offset.setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(this.slide.x);
      this.offset.addScaledVector(this.axis.setFromMatrixColumn(this.camera.matrixWorld, 1), this.slide.y);
      this.camera.position.add(this.offset);
      // Conserva el ancho del escritorio y limita la altura visible con maxViewHeight.
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
