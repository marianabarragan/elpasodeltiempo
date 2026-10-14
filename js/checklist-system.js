(() => {
  'use strict';
  const app = window.TimeExperience;

  const WIDTH = 900;
  const INK = '#2b3854';
  const HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';

  function seeded(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  /**
   * Handwritten checklist drawn on the paper texture, plus its strike logic.
   * Coordinates are canvas pixels: x to the right, y down from the top edge of the sheet.
   * Only the first visible, unfinished task accepts strokes. A task counts as crossed out
   * when one continuous press of the pen covers `coverage` of the text width with
   * horizontal segments inside that task's row band. Finished tasks never fire again.
   */
  class ChecklistSystem {
    constructor({ title, tasks, coverage = .68, aspect = 1.28, onChange, onStrike, onComplete } = {}) {
      this.title = title;
      this.coverage = coverage;
      this.onChange = onChange;
      this.onStrike = onStrike;
      this.onComplete = onComplete;
      this.width = WIDTH;
      this.height = Math.round(WIDTH * aspect);
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width; this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
      this.base = this.paperBase();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 8;
      this.rows = tasks.map((text, index) => ({ text, index, seed: 811 + index * 97 }));
      this.stroke = null;
      this.preview = null;
      this.tweens = new Set();
      this.complete = false;
      this.layout();
      this.reset();
      // Redraw once the handwriting font is available (it is requested in index.html).
      document.fonts?.load(`600 92px ${HAND}`).then(() => { this.layout(); this.invalidate(); }).catch(() => {});
    }

    layout() {
      const ctx = this.ctx;
      const top = 345, bottom = this.height - 150;
      const step = Math.min(150, (bottom - top) / Math.max(1, this.rows.length - 1));
      ctx.font = `600 92px ${HAND}`;
      this.rows.forEach((row, index) => {
        row.baseline = top + index * step;
        row.x = 215;
        row.textWidth = Math.max(60, ctx.measureText(row.text).width);
        // Generous detection band: from above the ascenders to below the baseline.
        row.band = { top: row.baseline - 100, bottom: row.baseline + 42 };
      });
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
      for (let y = 284; y < this.height - 40; y += 75) {
        ctx.beginPath(); ctx.moveTo(26, y); ctx.lineTo(this.width - 26, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(131,120,88,.45)';
      ctx.beginPath(); ctx.moveTo(112, 96); ctx.lineTo(112, this.height - 30); ctx.stroke();
      // Torn-out spiral notebook holes (transparent: the desk shows through).
      ctx.globalCompositeOperation = 'destination-out';
      for (let x = 58; x < this.width - 30; x += 64) {
        ctx.beginPath(); ctx.arc(x, 46, 18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      return canvas;
    }

    reset() {
      this.tweens.forEach(tween => tween.kill());
      this.tweens.clear();
      this.complete = false;
      this.stroke = null; this.preview = null;
      this.rows.forEach((row, index) => Object.assign(row, {
        visible: index === 0, ready: index === 0, alpha: index === 0 ? 1 : 0, offset: 0, struck: false, strike: 0
      }));
      this.invalidate();
    }

    get activeRow() {
      return this.rows.find(row => !row.struck && row.ready) || null;
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

    beginStroke() {
      this.stroke = { row: this.activeRow, previous: null, intervals: [] };
      this.preview = this.stroke.row ? { row: this.stroke.row, points: [], segments: [[]], alpha: 1 } : null;
    }

    breakStroke() {
      if (this.stroke) this.stroke.previous = null;
      if (this.preview) this.preview.segments.push([]);
    }

    // Returns true while the pen is inside the active task's strike zone.
    strokeTo(x, y) {
      const stroke = this.stroke;
      if (!stroke) return false;
      const active = this.activeRow;
      if (stroke.row !== active) {
        // The next task finished appearing during this press: start measuring it from zero.
        Object.assign(stroke, { row: active, previous: null, intervals: [] });
        if (active) this.preview = { row: active, segments: [[]], alpha: 1 };
      }
      const row = stroke.row;
      if (!row || row.struck) return false;
      const inside = y >= row.band.top && y <= row.band.bottom && x >= row.x - 60 && x <= row.x + row.textWidth + 70;
      if (!inside) { this.breakStroke(); return false; }
      const previous = stroke.previous;
      stroke.previous = { x, y };
      this.preview.segments[this.preview.segments.length - 1].push({ x, y });
      this.invalidate();
      if (!previous) return true;
      const dx = Math.abs(x - previous.x), dy = Math.abs(y - previous.y);
      // Only mostly-horizontal motion counts; a tap or a vertical scribble does not.
      if (dx < .5 || dy > dx * 1.2) return true;
      const start = Math.max(row.x, Math.min(x, previous.x));
      const end = Math.min(row.x + row.textWidth, Math.max(x, previous.x));
      if (end > start) stroke.intervals.push([start, end]);
      if (this.covered(stroke.intervals) >= this.coverage * row.textWidth) this.strike(row);
      return true;
    }

    covered(intervals) {
      const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
      let total = 0, start = 0, end = 0;
      sorted.forEach(([a, b]) => {
        if (a > end) { total += Math.max(0, end - start); start = a; end = b; } else end = Math.max(end, b);
      });
      return total + Math.max(0, end - start);
    }

    endStroke() {
      const preview = this.preview;
      this.stroke = null;
      if (!preview) return;
      // An unfinished attempt fades away: the pen leaves no marks besides strikes.
      this.tween(preview, { alpha: 0, duration: .45, ease: 'power1.out', onComplete: () => { if (this.preview === preview) this.preview = null; } });
    }

    strike(row) {
      row.struck = true; // Locks the task immediately: no repeated events.
      this.stroke.row = null;
      const preview = this.preview;
      this.tween(preview, { alpha: 0, duration: .3, onComplete: () => { if (this.preview === preview) this.preview = null; } });
      this.onStrike?.(row.index, row.text);
      this.tween(row, { strike: 1, duration: .38, ease: 'power2.out', onComplete: () => {
        const next = this.rows[row.index + 1];
        if (next) {
          next.visible = true; next.offset = 14;
          this.tween(next, { alpha: 1, offset: 0, duration: .7, delay: .25, ease: 'power2.out', onComplete: () => { next.ready = true; } });
        } else if (!this.complete) {
          this.complete = true;
          this.onComplete?.();
        }
      } });
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.drawImage(this.base, 0, 0);
      ctx.fillStyle = INK; ctx.strokeStyle = INK;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.font = `700 128px ${HAND}`;
      ctx.fillText(this.title, 140, 200);
      const titleWidth = ctx.measureText(this.title).width;
      this.wobbleLine(140, 224, 140 + titleWidth, 218, 4, seeded(77), 1);
      ctx.font = `600 92px ${HAND}`;
      this.rows.forEach(row => {
        if (!row.visible || row.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = row.alpha * (row.struck ? .62 + .38 * (1 - row.strike) : 1);
        ctx.translate(0, row.offset);
        this.checkbox(row);
        ctx.fillText(row.text, row.x, row.baseline);
        ctx.restore();
        if (row.strike > 0) {
          ctx.save();
          const random = seeded(row.seed);
          const y = row.baseline - 30 + (random() - .5) * 6;
          const x0 = row.x - 16, x1 = row.x + row.textWidth + 18;
          this.wobbleLine(x0, y, x0 + (x1 - x0) * row.strike, y - 6 + random() * 4, 5, random, 1);
          if (row.strike >= 1) this.tick(row);
          ctx.restore();
        }
      });
      const preview = this.preview;
      if (preview && preview.alpha > 0) {
        const row = preview.row;
        ctx.save();
        ctx.beginPath();
        ctx.rect(row.x - 60, row.band.top, row.textWidth + 130, row.band.bottom - row.band.top);
        ctx.clip();
        ctx.globalAlpha = .85 * preview.alpha;
        ctx.lineWidth = 4.5; ctx.lineCap = ctx.lineJoin = 'round';
        preview.segments.forEach(points => {
          if (points.length < 2) return;
          ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
        });
        ctx.restore();
      }
      this.texture.needsUpdate = true;
    }

    checkbox(row) {
      const ctx = this.ctx, random = seeded(row.seed + 3);
      const x = 140, y = row.baseline - 54, s = 46;
      ctx.lineWidth = 3.2; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + random() * 3, y + random() * 3);
      ctx.lineTo(x + s + random() * 3, y + random() * 4);
      ctx.lineTo(x + s - random() * 2, y + s + random() * 3);
      ctx.lineTo(x - random() * 2, y + s - random() * 2);
      ctx.closePath(); ctx.stroke();
    }

    tick(row) {
      const ctx = this.ctx, x = 140, y = row.baseline - 54;
      ctx.lineWidth = 5; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x + 7, y + 24); ctx.lineTo(x + 20, y + 40); ctx.lineTo(x + 54, y - 8); ctx.stroke();
    }

    wobbleLine(x0, y0, x1, y1, width, random, alpha) {
      const ctx = this.ctx, steps = Math.max(2, Math.round(Math.abs(x1 - x0) / 24));
      ctx.save();
      ctx.globalAlpha *= alpha;
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
      return { complete: this.complete, tasks: this.rows.map(row => ({ text: row.text, visible: row.visible, struck: row.struck })) };
    }

    dispose() {
      this.tweens.forEach(tween => tween.kill());
      this.texture.dispose();
    }
  }

  app.ChecklistSystem = ChecklistSystem;
})();
