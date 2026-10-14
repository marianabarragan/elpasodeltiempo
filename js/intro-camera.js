(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};

  class IntroCamera {
    constructor() {
      this.camera = new THREE.OrthographicCamera(-12, 12, 7.4, -7.4, .1, 80);
      // roll turns the view around its axis (only used to straighten a photo while entering it).
      this.pose = { x: 0, y: 0, zoomProgress: 0, roll: 0 };
      this.baseHeight = 14.8;
      this.aspect = 1;
      this.photoWidth = 3.32;
      this.photoHeight = 4.0;
      this.update();
    }

    resize(width, height) {
      this.aspect = width / height;
      // Keep the whole board in view at narrower desktop aspect ratios.
      this.baseHeight = Math.max(14.8, 22 / this.aspect);
      this.camera.left = -this.baseHeight * this.aspect / 2;
      this.camera.right = this.baseHeight * this.aspect / 2;
      this.camera.top = this.baseHeight / 2;
      this.camera.bottom = -this.baseHeight / 2;
      this.update();
    }

    update() {
      const coverZoom = Math.max(this.baseHeight * this.aspect / this.photoWidth, this.baseHeight / this.photoHeight) * 1.06;
      this.camera.zoom = THREE.MathUtils.lerp(1, coverZoom, this.pose.zoomProgress);
      this.camera.position.set(this.pose.x, this.pose.y, 24);
      this.camera.up.set(-Math.sin(this.pose.roll), Math.cos(this.pose.roll), 0);
      this.camera.lookAt(this.pose.x, this.pose.y, 0);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
    }

    reset() {
      Object.assign(this.pose, { x: 0, y: 0, zoomProgress: 0, roll: 0 });
      this.update();
    }
  }
  app.IntroCamera = IntroCamera;
})();
