(() => {
  'use strict';
  const app = window.TimeExperience;

  const WIDTH = 900;
  const INK = '#2b3854';
  const HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
  // Notebook ruling shared by the paper base and the handwriting (canvas pixels).
  const RULE_TOP = 250, RULE_STEP = 72;
  const TEXT_X = 205, TEXT_RIGHT = WIDTH - 46;
  const BOX_X = 128, BOX_SIZE = 44, BOX_TOLERANCE = 34;

  function seeded(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  /**
   * Handwritten checklist drawn on the paper texture, plus its checkbox logic.
   * Coordinates are canvas pixels: x to the right, y down from the top edge of the sheet.
   * Every task is visible from the start, left aligned, with its own checkbox. Only the
   * checkbox of the first unchecked task can be marked; a checked task never fires again.
   * A Blender sheet (`sheet`: { image, boxes }) brings its own paper picture, title, tasks and
   * boxes as meshes: then only the checks (and the flash of the enabled box) are drawn, on that
   * picture, at its boxes (given in texture coordinates: u, v and half sizes hu, hv).
   */
  class ChecklistSystem {
    constructor({ title, tasks, aspect = 1.28, sheet = null, onChange, onCheck, onComplete } = {}) {
      this.title = title;
      this.sheet = sheet;
      this.onChange = onChange;
      this.onCheck = onCheck;
      this.onComplete = onComplete;
      this.width = WIDTH;
      this.height = Math.round(WIDTH * aspect);
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width; this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
      this.base = sheet ? this.pictureBase(sheet.image) : this.paperBase();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 8;
      // glTF texture coordinates start at the picture's top edge.
      if (sheet) this.texture.flipY = false;
      this.rows = tasks.map((text, index) => ({ text, index, seed: 811 + index * 97 }));
      this.tweens = new Set();
      this.complete = false;
      this.layout();
      this.reset();
      // Redraw once the handwriting font is available (it is requested in index.html).
      document.fonts?.load(`600 56px ${HAND}`).then(() => { this.layout(); this.invalidate(); }).catch(() => {});
    }

    // Wraps every task inside the text column and places its lines on the ruling,
    // with one empty ruled line between tasks. The size shrinks if the list would overflow.
    // On a Blender sheet the boxes are its own.
    layout() {
      if (this.sheet) {
        this.rows.forEach((row, index) => {
          const { u, v, hu } = this.sheet.boxes[index], size = hu * 2 * this.width;
          const { x, y } = this.uvToCanvas({ x: u, y: v });
          row.box = { x: x - size / 2, y: y - size / 2, size };
        });
        return;
      }
      const ctx = this.ctx;
      const lastRule = Math.floor((this.height - 60 - RULE_TOP) / RULE_STEP);
      for (let size = 58; size >= 38; size -= 4) {
        ctx.font = `600 ${size}px ${HAND}`;
        let rule = 1;
        this.rows.forEach(row => {
          const lines = [];
          row.text.split(/\s+/).forEach(word => {
            const last = lines[lines.length - 1];
            if (last && ctx.measureText(`${last} ${word}`).width <= TEXT_RIGHT - TEXT_X) lines[lines.length - 1] = `${last} ${word}`;
            else lines.push(word);
          });
          row.lines = lines;
          row.baselines = lines.map((_, k) => RULE_TOP + (rule + k) * RULE_STEP - 12);
          row.box = { x: BOX_X, y: row.baselines[0] - 40, size: BOX_SIZE };
          rule += lines.length + 1;
        });
        this.fontSize = size;
        if (rule - 2 <= lastRule) break;
      }
    }

    paperBase() {
      const canvas = document.createElement('canvas');
      canvas.width = this.width; canvas.height = this.height;
      const ctx = canvas.getContext('2d');
      const random = seeded(4401);
      ctx.fillStyle = '#f4ecdb';
      ctx.fillRect(0, 0, this.width, this.height);
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = `rgba(110,90,60,${.015 + random() * .035})`;
        ctx.fillRect(random() * this.width, random() * this.height, 1 + random() * 1.5, 1 + random() * 1.5);
      }
      // Soft crumple patches and creases (a lit side and a shaded side per fold).
      for (let i = 0; i < 14; i++) {
        const x = random() * this.width, y = random() * this.height, r = 80 + random() * 200;
        const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
        patch.addColorStop(0, `rgba(${random() > .5 ? '255,255,250' : '150,125,90'},${.05 + random() * .06})`);
        patch.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = patch; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let x = random() * this.width, y = random() * this.height;
        const angle = random() * Math.PI, points = [[x, y]];
        for (let s = 0; s < 6; s++) {
          x += Math.cos(angle + (random() - .5) * .5) * 70; y += Math.sin(angle + (random() - .5) * .5) * 70;
          points.push([x, y]);
        }
        [['rgba(120,96,62,.12)', 2.5, 0], ['rgba(255,255,250,.5)', 2, 2.5]].forEach(([color, width, offset]) => {
          ctx.strokeStyle = color; ctx.lineWidth = width;
          ctx.beginPath(); points.forEach(([px, py], k) => k ? ctx.lineTo(px + offset, py + offset) : ctx.moveTo(px + offset, py + offset)); ctx.stroke();
        });
      }
      // Notebook ruling and margin, very faint, in the scene's steel/olive tones.
      ctx.strokeStyle = 'rgba(145,149,156,.42)'; ctx.lineWidth = 2;
      for (let y = RULE_TOP; y < this.height - 40; y += RULE_STEP) {
        ctx.beginPath(); ctx.moveTo(26, y); ctx.lineTo(this.width - 26, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(131,120,88,.45)';
      ctx.beginPath(); ctx.moveTo(104, 96); ctx.lineTo(104, this.height - 30); ctx.stroke();
      // Torn-out spiral notebook holes (transparent: the desk shows through).
      ctx.globalCompositeOperation = 'destination-out';
      for (let x = 58; x < this.width - 30; x += 64) {
        ctx.beginPath(); ctx.arc(x, 46, 18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      return canvas;
    }

    // The Blender sheet's own paper picture, covering the whole texture.
    pictureBase(image) {
      const canvas = document.createElement('canvas');
      canvas.width = this.width; canvas.height = this.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4ecdb';
      ctx.fillRect(0, 0, this.width, this.height);
      if (image) ctx.drawImage(image, 0, 0, this.width, this.height);
      return canvas;
    }

    // Canvas pixels of a point of the sheet given by its texture coordinates.
    uvToCanvas(uv) {
      return { x: uv.x * this.width, y: (this.texture.flipY ? 1 - uv.y : uv.y) * this.height };
    }

    reset() {
      this.tweens.forEach(tween => tween.kill());
      this.tweens.clear();
      this.complete = false;
      this.rows.forEach(row => Object.assign(row, { checked: false, check: 0, flash: 0 }));
      this.invalidate();
    }

    // The only task whose checkbox can be marked now.
    get activeRow() {
      return this.rows.find(row => !row.checked) || null;
    }

    invalidate() {
      this.needsDraw = true;
      this.onChange?.();
    }

    // Called by the scene once per frame; uploads the texture only when something changed.
    update() {
      if (!this.needsDraw) return false;
      this.needsDraw = false;
      this.draw();
      return true;
    }

    tween(target, vars) {
      const tween = gsap.to(target, { ...vars, onUpdate: () => { vars.onUpdate?.(); this.invalidate(); }, onComplete: () => {
        this.tweens.delete(tween); vars.onComplete?.(); this.invalidate();
      } });
      this.tweens.add(tween);
      return tween;
    }

    // Task whose checkbox is under (x, y), with a small margin around the box.
    hit(x, y) {
      return this.rows.find(({ box }) => {
        const margin = BOX_TOLERANCE * box.size / BOX_SIZE;
        return x >= box.x - margin && x <= box.x + box.size + margin && y >= box.y - margin && y <= box.y + box.size + margin;
      }) || null;
    }

    // Marks `row` if it is the enabled task. Returns 'checked', 'locked' (an earlier task is
    // still open; the enabled box flashes briefly) or 'done' (already checked: no effect).
    mark(row) {
      if (!row || row.checked) return 'done';
      const active = this.activeRow;
      if (row !== active) {
        if (active) this.tween(active, { flash: 1, duration: .22, yoyo: true, repeat: 1, ease: 'sine.inOut' });
        return 'locked';
      }
      row.checked = true; // Locks the task immediately: no repeated events.
      this.onCheck?.(row.index, row.text);
      this.tween(row, { check: 1, duration: .34, ease: 'power2.out', onComplete: () => {
        if (!this.complete && this.rows.every(item => item.checked)) {
          this.complete = true;
          this.onComplete?.();
        }
      } });
      return 'checked';
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.drawImage(this.base, 0, 0);
      ctx.fillStyle = INK; ctx.strokeStyle = INK;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      if (!this.sheet) {
        ctx.font = `700 112px ${HAND}`;
        ctx.fillText(this.title, BOX_X, RULE_TOP - 70);
        const titleWidth = ctx.measureText(this.title).width;
        this.wobbleLine(BOX_X, RULE_TOP - 50, BOX_X + titleWidth, RULE_TOP - 55, 4, seeded(77));
      }
      ctx.font = `600 ${this.fontSize}px ${HAND}`;
      this.rows.forEach(row => {
        if (row.flash > 0) {
          const { x, y, size } = row.box, pad = 12 * size / BOX_SIZE;
          ctx.save();
          ctx.fillStyle = `rgba(242,187,49,${.38 * row.flash})`;
          ctx.beginPath(); ctx.roundRect(x - pad, y - pad, size + pad * 2, size + pad * 2, pad); ctx.fill();
          ctx.restore();
        }
        if (this.sheet) {
          if (row.check > 0) this.tick(row);
          return;
        }
        this.checkbox(row);
        // A barely varying slant per line gives the handwriting a pen-on-paper feel.
        const random = seeded(row.seed);
        row.lines.forEach((line, k) => {
          ctx.save();
          ctx.translate(TEXT_X, row.baselines[k]);
          ctx.rotate((random() - .5) * .012);
          ctx.fillText(line, 0, (random() - .5) * 3);
          ctx.restore();
        });
        if (row.check > 0) this.tick(row);
      });
      this.texture.needsUpdate = true;
    }

    checkbox(row) {
      const ctx = this.ctx, random = seeded(row.seed + 3);
      const { x, y, size: s } = row.box;
      ctx.lineWidth = 3.2; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + random() * 3, y + random() * 3);
      ctx.lineTo(x + s + random() * 3, y + random() * 4);
      ctx.lineTo(x + s - random() * 2, y + s + random() * 3);
      ctx.lineTo(x - random() * 2, y + s - random() * 2);
      ctx.closePath(); ctx.stroke();
    }

    // Pen check mark, drawn progressively while `row.check` goes from 0 to 1 (sized to the box).
    tick(row) {
      const ctx = this.ctx, { x, y } = row.box, k = row.box.size / BOX_SIZE;
      const points = [[x + 7 * k, y + 22 * k], [x + 19 * k, y + 38 * k], [x + 54 * k, y - 10 * k]];
      const lengths = [Math.hypot(12, 16) * k, Math.hypot(35, 48) * k];
      let left = row.check * (lengths[0] + lengths[1]);
      ctx.save();
      ctx.lineWidth = 5.5 * k; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (let i = 0; i < 2 && left > 0; i++) {
        const t = Math.min(1, left / lengths[i]);
        ctx.lineTo(points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t);
        left -= lengths[i];
      }
      ctx.stroke();
      ctx.restore();
    }

    wobbleLine(x0, y0, x1, y1, width, random) {
      const ctx = this.ctx, steps = Math.max(2, Math.round(Math.abs(x1 - x0) / 24));
      ctx.save();
      ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * 9 + random() * .6) * 1.6;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    getState() {
      return { complete: this.complete, tasks: this.rows.map(row => ({ text: row.text, checked: row.checked })) };
    }

    dispose() {
      this.tweens.forEach(tween => tween.kill());
      this.texture.dispose();
    }
  }

  app.ChecklistSystem = ChecklistSystem;
})();
