(() => {
  'use strict';
  const app = window.TimeExperience;
  const CLICK_TOLERANCE = 6;
  // Altura de la punta sobre la hoja cuando sigue al puntero sin pintar.
  const HOVER_LIFT = .32;
  // Configura elevación, escala y balanceo de los juguetes al señalarlos.
  const TOY_HOVER = { lift: .35, grow: 1.08, sway: .05 };
  // Prolonga brevemente el sonido entre marcas para evitar cortes en trazos lentos.
  const FRICTION_HOLD = 250;

  /* Controla juguetes y crayola: elegir color, pintar con clic izquierdo y devolver con clic fuera o Esc. */
  class ObjectInteractions {
    constructor(world) {
      this.world = world;
      this.canvas = world.renderer.domElement;
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2();
      this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.paper.position.y);
      this.mode = 'rest';
      this.held = false; // Trazo de pintura en curso.
      this.pointerId = null;
      this.press = null;
      this.previous = null;
      this.releaseTween = null;
      this.glide = null;
      this.hovered = false;
      this.hoverTween = null;
      this.hoveredToy = null;
      this.lift = { y: HOVER_LIFT };
      this.lastPointer = null;
      this.toolQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -.22, -.82));
      this.listeners = new AbortController();
      const options = { signal: this.listeners.signal };
      this.canvas.addEventListener('pointerdown', event => this.down(event), options);
      this.canvas.addEventListener('pointermove', event => this.move(event), options);
      this.canvas.addEventListener('pointerleave', () => { this.clearHover(); this.setToyHover(null); }, options);
      this.canvas.addEventListener('pointerup', event => this.up(event), options);
      this.canvas.addEventListener('pointercancel', event => this.up(event, true), options);
      this.canvas.addEventListener('lostpointercapture', () => this.release(), options);
      this.canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
      window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.mode === 'tool' && this.enabled) this.setRest();
      }, options);
      window.addEventListener('blur', () => this.release(), options);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
    }

    get enabled() { return this.world.active && !app.runtime.transitioning; }
    get toolActive() { return this.mode === 'tool'; }

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
      // Detecta el juguete en reposo para que su salto no interrumpa el puntero.
      const origin = this.raycaster.ray.origin.clone();
      const restWorld = crayon.parent.localToWorld(this.world.props.crayonRest.position.clone());
      const offset = crayon.getWorldPosition(new THREE.Vector3()).sub(restWorld);
      this.raycaster.ray.origin.add(offset);
      const hit = this.raycaster.intersectObject(crayon, true).length > 0;
      this.raycaster.ray.origin.copy(origin);
      return hit;
    }

    hitsPaper() {
      return this.raycaster.intersectObject(this.world.paper, false)[0] || null;
    }

    // Salto al señalar en reposo.
    updateHover(event) {
      if (event.pointerType === 'touch' || this.mode !== 'rest' || this.releaseTween?.isActive()) return;
      this.ray(event);
      const hit = this.hitsCrayon(this.hovered);
      // La crayola situada delante tiene prioridad sobre el juguete de atrás.
      this.setToyHover(hit ? null : this.toyAt());
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
      if (!returnHome || this.mode !== 'rest') return;
      const crayon = this.world.props.crayon;
      const rest = this.world.props.crayonRest.position;
      if (crayon.position.distanceToSquared(rest) < 1e-8) return;
      this.hoverTween = gsap.to(crayon.position, {
        x: rest.x, y: rest.y, z: rest.z, duration: .18, ease: 'power2.out',
        onUpdate: () => this.world.invalidate(),
        onComplete: () => { this.hoverTween = null; }
      });
    }

    // Respuesta visual y sonido de los juguetes.
    get toys() {
      const models = this.world.props.metadata?.models || {};
      return { rings: models.rings, xylophone: models.xylophone };
    }

    // Detecta el juguete en su pose de reposo para evitar perderlo al elevarse.
    toyAt() {
      let found = null, nearest = Infinity;
      Object.entries(this.toys).forEach(([name, toy]) => {
        const rest = toy?.userData.rest;
        if (!rest) return;
        const pose = [toy.position.clone(), toy.quaternion.clone(), toy.scale.clone()];
        toy.position.copy(rest.position); toy.quaternion.copy(rest.quaternion); toy.scale.copy(rest.scale);
        toy.updateMatrixWorld(true);
        const hit = this.raycaster.intersectObject(toy, true)[0];
        toy.position.copy(pose[0]); toy.quaternion.copy(pose[1]); toy.scale.copy(pose[2]);
        toy.updateMatrixWorld(true);
        if (hit && hit.distance < nearest) { nearest = hit.distance; found = name; }
      });
      return found;
    }

    setToyHover(name) {
      if (name === this.hoveredToy) return;
      if (this.hoveredToy) this.poseToy(this.hoveredToy, false);
      this.hoveredToy = name;
      if (name) { this.poseToy(name, true); this.world.interact(); }
    }

    // Eleva y balancea el juguete señalado; al salir vuelve al piso.
    poseToy(name, hovered, immediate = false) {
      const toy = this.toys[name], rest = toy?.userData.rest;
      if (!rest) return;
      gsap.killTweensOf([toy.position, toy.scale, toy.rotation]);
      const y = rest.position.y + (hovered ? TOY_HOVER.lift : 0), scale = rest.scale.x * (hovered ? TOY_HOVER.grow : 1);
      const onUpdate = () => this.world.invalidate();
      if (immediate) {
        toy.position.y = y; toy.scale.setScalar(scale); toy.rotation.z = 0;
        onUpdate();
        return;
      }
      const motion = hovered ? { duration: .4, ease: 'back.out(2.2)' } : { duration: .3, ease: 'power2.out' };
      gsap.to(toy.position, { y, ...motion, onUpdate });
      gsap.to(toy.scale, { x: scale, y: scale, z: scale, ...motion, onUpdate });
      if (hovered) {
        gsap.to(toy.rotation, { keyframes: [{ z: TOY_HOVER.sway, duration: .16 }, { z: -TOY_HOVER.sway * .6, duration: .2 }, { z: 0, duration: .22 }], ease: 'sine.inOut', onUpdate });
      } else gsap.to(toy.rotation, { z: 0, duration: .2, ease: 'power2.out', onUpdate });
    }

    // Restaura todos los juguetes al salir o reiniciar.
    restToys() {
      this.hoveredToy = null;
      Object.keys(this.toys).forEach(name => this.poseToy(name, false, true));
    }

    // Puntero.
    down(event) {
      if (!this.enabled || this.pointerId !== null) return;
      // Pulsar el escenario cierra la paleta abierta.
      if (this.world.palette.open) { this.world.palette.close(); return; }
      if (event.button === 2 && this.mode === 'tool') { this.setRest(); return; }
      if (event.button !== 0) return;
      this.world.interact();
      this.ray(event);
      this.pointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (this.mode === 'tool') {
        this.followPointer(event);
        if (this.hitsPaper() && !this.glide) {
          // Pulsar la hoja baja la punta e inicia un trazo.
          this.held = true;
          this.previous = null;
          this.world.painting.beginStroke();
          this.world.cameraRig.freeze();
          gsap.to(this.lift, { y: 0, duration: .08, ease: 'power2.out', overwrite: true, onUpdate: () => this.placeCrayon(this.lastEvent) });
          this.moveTool(event, true);
          return;
        }
        this.press = { kind: 'drop', x: event.clientX, y: event.clientY };
        this.world.cameraRig.startDrag(event.clientX, event.clientY);
        return;
      }
      const hit = this.hitsCrayon(this.hovered);
      this.clearHover(!hit);
      const toy = hit ? null : this.toyAt();
      if (hit) this.press = { kind: 'crayon', x: event.clientX, y: event.clientY };
      else if (toy) this.press = { kind: 'toy', toy, x: event.clientX, y: event.clientY };
      this.world.cameraRig.startDrag(event.clientX, event.clientY);
    }

    move(event) {
      if (!this.enabled) { this.clearHover(); this.setToyHover(null); return; }
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (this.pointerId === null) {
        if (this.mode === 'tool') this.followPointer(event);
        else if (!event.buttons) this.updateHover(event);
        return;
      }
      if (this.pointerId !== event.pointerId) return;
      this.world.interact();
      if (!(event.buttons & 1)) { this.release(); return; }
      if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_TOLERANCE) this.press = null;
      if (this.held) { this.moveTool(event, true); return; }
      this.world.cameraRig.dragTo(event.clientX, event.clientY);
      if (this.mode === 'tool') this.followPointer(event);
    }

    up(event, cancelled = false) {
      if (this.pointerId !== event.pointerId) return;
      const press = this.press;
      this.release();
      if (cancelled || !press || !this.enabled) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) return;
      if (press.kind === 'crayon') this.world.openPalette();
      else if (press.kind === 'toy') this.world.audio.playEffect(press.toy);
      else if (press.kind === 'drop') this.setRest();
    }

    // La punta sigue el plano de la hoja y se eleva al soltar el botón.
    followPointer(event) {
      if (!event || this.mode !== 'tool') return;
      this.lastEvent = event;
      if (this.glide) return;
      this.moveTool(event, false);
    }

    tipTarget(event) {
      this.ray(event);
      const point = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.plane, point)) return null;
      const crayon = this.world.props.crayon;
      const tipOffset = this.world.props.crayonTip.clone().multiply(crayon.scale).applyQuaternion(crayon.quaternion);
      const local = crayon.parent.worldToLocal(point.clone()).sub(tipOffset);
      local.y += this.lift.y;
      return local;
    }

    // Mueve la crayola sin pintar ni interrumpir el trazo.
    placeCrayon(event) {
      if (!event || this.mode !== 'tool' || this.glide) return false;
      const target = this.tipTarget(event);
      if (!target) return false;
      // Sitúa la punta en la intersección del rayo con el plano, considerando escala y giro.
      this.world.props.crayon.position.copy(target);
      this.world.invalidate();
      return true;
    }

    moveTool(event, paint) {
      this.lastEvent = event;
      if (!this.placeCrayon(event)) return;
      const onCanvas = document.elementFromPoint(event.clientX, event.clientY) === this.canvas;
      const hit = onCanvas ? this.hitsPaper() : null;
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
      if (!painted || !moving) return;
      this.world.audio.setPainting(true);
      clearTimeout(this.frictionTimer);
      // Detiene la fricción si el puntero deja de moverse.
      this.frictionTimer = setTimeout(() => this.world.audio.setPainting(false), FRICTION_HOLD);
    }

    // Desplaza la crayola hasta el puntero y comienza a seguirlo.
    setTool(pointer) {
      this.clearHover(false);
      this.setToyHover(null);
      this.releaseTween?.kill();
      this.glide?.kill();
      gsap.killTweensOf(this.world.props.crayon.position);
      this.mode = 'tool';
      this.lift.y = HOVER_LIFT;
      const crayon = this.world.props.crayon;
      const fromPosition = crayon.position.clone(), fromQuaternion = crayon.quaternion.clone();
      crayon.quaternion.copy(this.toolQuaternion);
      const event = pointer ? { clientX: pointer.x, clientY: pointer.y } : null;
      const target = event ? this.tipTarget(event) : null;
      crayon.quaternion.copy(fromQuaternion);
      if (!target) { crayon.quaternion.copy(this.toolQuaternion); this.world.invalidate(); return; }
      const pose = { t: 0 };
      this.lastEvent = event;
      this.glide = gsap.to(pose, {
        t: 1, duration: .38, ease: 'power2.out',
        onUpdate: () => {
          crayon.quaternion.slerpQuaternions(fromQuaternion, this.toolQuaternion, pose.t);
          const goal = this.tipTarget(this.lastEvent) || target;
          crayon.position.lerpVectors(fromPosition, goal, pose.t);
          crayon.position.y += Math.sin(pose.t * Math.PI) * .5;
          this.world.invalidate();
        },
        onComplete: () => { this.glide = null; this.followPointer(this.lastEvent); }
      });
    }

    // Devuelve la crayola a su lugar conservando el color elegido.
    setRest(immediate = false) {
      this.release();
      this.glide?.kill();
      this.glide = null;
      if (this.mode === 'rest' && !immediate) return;
      this.mode = 'rest';
      gsap.killTweensOf(this.lift);
      this.lift.y = HOVER_LIFT;
      const crayon = this.world.props.crayon;
      const rest = this.world.props.crayonRest;
      this.releaseTween?.kill();
      if (immediate) {
        crayon.position.copy(rest.position); crayon.quaternion.copy(rest.quaternion);
        this.world.invalidate();
        return;
      }
      const initial = crayon.quaternion.clone(), from = crayon.position.clone(), pose = { t: 0 };
      this.releaseTween = gsap.to(pose, {
        t: 1, duration: .5, ease: 'power2.inOut',
        onUpdate: () => {
          crayon.position.lerpVectors(from, rest.position, pose.t);
          crayon.position.y += Math.sin(pose.t * Math.PI) * .4;
          crayon.quaternion.slerpQuaternions(initial, rest.quaternion, pose.t);
          this.world.invalidate();
        }
      });
    }

    // Finaliza el trazo o arrastre sin soltar la crayola.
    release() {
      this.clearHover(false);
      clearTimeout(this.frictionTimer);
      this.world.audio.setPainting(false);
      this.world.cameraRig.endDrag();
      this.world.cameraRig.unfreeze();
      this.press = null;
      const id = this.pointerId;
      this.pointerId = null;
      if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
      if (this.held) {
        this.held = false;
        this.previous = null;
        this.world.painting.endStroke();
      }
      if (this.mode === 'tool') {
        gsap.to(this.lift, { y: HOVER_LIFT, duration: .14, ease: 'power2.out', overwrite: true, onUpdate: () => this.placeCrayon(this.lastEvent) });
      } else if (!this.releaseTween?.isActive() && !this.hoverTween?.isActive()) {
        // Al cancelar la respuesta al puntero, restaura el contacto con el piso.
        this.world.props.crayon.position.copy(this.world.props.crayonRest.position);
        this.world.invalidate();
      }
    }

    reset() {
      this.release();
      this.setRest(true);
      this.restToys();
    }

    dispose() {
      this.release();
      this.releaseTween?.kill();
      this.hoverTween?.kill();
      this.glide?.kill();
      Object.values(this.toys).forEach(toy => { if (toy) gsap.killTweensOf([toy.position, toy.scale, toy.rotation]); });
      this.listeners.abort();
    }
  }
  app.ObjectInteractions = ObjectInteractions;
})();
