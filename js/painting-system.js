(function (global) {
  'use strict';

  const experience = global.TimeExperience = global.TimeExperience || {};
  const WIDTH = 768;
  const HEIGHT = 576;
  const COVERAGE_ALPHA = 35;
  const BRUSH_RADIUS = 20;
  const BRUSH_SIZE = BRUSH_RADIUS * 2 + 1;
  const STAMP_SPACING = 4.5;
  const REGION_IDS = Object.freeze({ sun: 1, house: 2, tree: 3 });

  function surface() {
    const result = document.createElement('canvas');
    result.width = WIDTH;
    result.height = HEIGHT;
    return result;
  }

  function random(seed) {
    return function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function closedPath(ctx, points) {
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index) ctx.lineTo(point[0], point[1]);
      else ctx.moveTo(point[0], point[1]);
    });
    ctx.closePath();
  }

  // Catmull-Rom samples retain the individual, uneven lobes of a child's tree.
  // The very same samples define both the permitted paint area and its outline.
  function rounded(points) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      const d = points[(i + 2) % points.length];
      for (let step = 0; step < 6; step++) {
        const t = step / 6;
        const t2 = t * t;
        const t3 = t2 * t;
        const point = [];
        for (let axis = 0; axis < 2; axis++) {
          point.push(0.5 * (2 * b[axis] + (-a[axis] + c[axis]) * t +
            (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 +
            (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3));
        }
        result.push(point);
      }
    }
    return result;
  }

  function sunContour() {
    const points = [];
    for (let i = 0; i < 96; i++) {
      const angle = i / 96 * Math.PI * 2;
      const radius = 46 + Math.sin(angle * 3 + 0.7) * 1.1 + Math.sin(angle * 7) * 0.6;
      points.push([377 + Math.cos(angle) * radius, 116 + Math.sin(angle) * radius]);
    }
    return points;
  }

  function artwork() {
    return {
      sun: sunContour(),
      walls: [[120, 334], [251, 331], [383, 335], [385, 406], [383, 485], [255, 487], [119, 488], [120, 409]],
      roof: [[92, 346], [170, 282], [251, 217], [322, 277], [321, 243], [351, 245], [353, 302], [415, 342], [252, 339]],
      trunk: [[548, 375], [546, 431], [535, 491], [563, 488], [593, 490], [581, 442], [577, 375]],
      crown: rounded([[502, 373], [485, 365], [478, 345], [482, 326], [463, 317], [458, 297],
        [470, 277], [491, 267], [495, 246], [511, 231], [532, 237], [543, 221], [564, 218],
        [584, 232], [603, 236], [616, 257], [638, 254], [655, 267], [656, 286], [676, 302],
        [674, 325], [661, 337], [659, 357], [646, 372], [625, 374], [614, 390], [591, 394],
        [574, 386], [552, 393], [530, 389], [519, 377]])
    };
  }

  function crayonLine(ctx, points, closed, seed, width) {
    const next = random(seed);
    const samples = [];
    const segments = closed ? points.length : points.length - 1;
    for (let i = 0; i < segments; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j < count; j++) {
        const t = j / count;
        samples.push([a[0] + (b[0] - a[0]) * t + (next() - 0.5) * 0.8,
          a[1] + (b[1] - a[1]) * t + (next() - 0.5) * 0.8]);
      }
    }
    if (!closed) samples.push(points[points.length - 1]);

    ctx.save();
    ctx.strokeStyle = '#58554f';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // A readable dark backbone, plus broken, irregular wax around the edge.
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = width * 0.72;
    ctx.beginPath();
    samples.forEach(function (point, i) {
      if (i) ctx.lineTo(point[0], point[1]);
      else ctx.moveTo(point[0], point[1]);
    });
    if (closed) ctx.closePath();
    ctx.stroke();

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      ctx.globalAlpha = 0.18 + next() * 0.28;
      ctx.lineWidth = 0.5 + next() * width * 0.8;
      ctx.beginPath();
      const offsetX = (next() - 0.5) * 1.4;
      const offsetY = (next() - 0.5) * 1.4;
      ctx.moveTo(a[0] + offsetX, a[1] + offsetY);
      ctx.lineTo(b[0] + offsetX, b[1] + offsetY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function createBrushes() {
    const next = random(63194);
    const brushes = [];
    for (let variant = 0; variant < 12; variant++) {
      const stamp = new Uint8Array(BRUSH_SIZE * BRUSH_SIZE);
      for (let y = 0; y < BRUSH_SIZE; y++) {
        for (let x = 0; x < BRUSH_SIZE; x++) {
          const dx = (x - BRUSH_RADIUS) / BRUSH_RADIUS;
          const dy = (y - BRUSH_RADIUS) / BRUSH_RADIUS;
          const angle = Math.atan2(dy, dx);
          const edge = 0.95 + Math.sin(angle * 5 + variant) * 0.045 + Math.sin(angle * 11 - variant) * 0.025;
          const distance = Math.hypot(dx, dy * 1.07) / edge;
          if (distance > 1) continue;
          const grain = next();
          // Discrete deposits and tiny gaps, without any smooth base stroke.
          if (grain < 0.23) continue;
          const falloff = Math.min(1, Math.max(0, (1 - distance) * 4.5));
          const striation = 0.74 + Math.sin(x * 2.4 + variant * 0.6) * 0.26;
          stamp[y * BRUSH_SIZE + x] = Math.round((48 + next() * 145) * falloff * striation);
        }
      }
      brushes.push(stamp);
    }
    return brushes;
  }

  class PaintingSystem {
    constructor(options) {
      options = options || {};
      this.width = WIDTH;
      this.height = HEIGHT;
      this.coverageAlpha = COVERAGE_ALPHA;
      this.regionIds = REGION_IDS;
      this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      this.canvas = surface();
      this.paperCanvas = surface();
      this.paintCanvas = surface();
      this.outlineCanvas = surface();
      this._context = this.canvas.getContext('2d');
      this._paintContext = this.paintCanvas.getContext('2d');
      this._paintImage = this._paintContext.createImageData(WIDTH, HEIGHT);

      // Region zero is the non-paintable paper. Arrays are exposed for inspection;
      // callers must treat them as read-only. Only alpha >= coverageAlpha counts.
      this.regionMask = new Uint8Array(WIDTH * HEIGHT);
      this.regionTotals = new Uint32Array(4);
      this.paintedCounts = new Uint32Array(4);
      this.coveredPixels = new Uint8Array(WIDTH * HEIGHT);
      this._paperGrain = new Uint8Array(WIDTH * HEIGHT);
      this._brushes = createBrushes();
      this._stampIndex = 0;
      this._lastPoint = null;
      this._distanceToNextStamp = 0;
      this._cachedColor = null;
      this._rgb = [96, 174, 41];
      this._disposed = false;

      const drawing = artwork();
      this._makePaper();
      this._makeMasks(drawing);
      this._makeOutlines(drawing);
      this._compose(0, 0, WIDTH, HEIGHT);
      this.texture = new global.THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = global.THREE.SRGBColorSpace;
      this.texture.minFilter = global.THREE.LinearFilter;
      this.texture.magFilter = global.THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.texture.name = 'childhood-paper-live-crayon';
    }

    _makePaper() {
      const ctx = this.paperCanvas.getContext('2d');
      const pixels = ctx.createImageData(WIDTH, HEIGHT);
      const next = random(80551);
      for (let i = 0; i < this._paperGrain.length; i++) {
        const paperNoise = next();
        const fiber = next();
        const shade = Math.round(253 + paperNoise * 2);
        const offset = i * 4;
        pixels.data[offset] = shade;
        pixels.data[offset + 1] = shade;
        pixels.data[offset + 2] = shade - 1;
        pixels.data[offset + 3] = 255;
        // Some paper fibers accept less pigment. They can still build up during
        // later passes, unlike permanently excluded pixels or a fake progress cap.
        this._paperGrain[i] = fiber < 0.16 ? 14 + Math.round(fiber * 290) : 115 + Math.round(paperNoise * 140);
      }
      ctx.putImageData(pixels, 0, 0);
    }

    _makeMasks(drawing) {
      const maskCanvas = surface();
      const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
      const regions = [null, [drawing.sun], [drawing.walls, drawing.roof], [drawing.trunk, drawing.crown]];
      for (let id = 1; id <= 3; id++) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#fff';
        regions[id].forEach(function (points) {
          closedPath(ctx, points);
          ctx.fill();
        });
        const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        for (let index = 0; index < this.regionMask.length; index++) {
          // Quantize antialiasing once. Rendering and counting subsequently use
          // this identical binary mask, so partial edge pixels cannot disagree.
          if (pixels[index * 4 + 3] >= 128) {
            const previous = this.regionMask[index];
            if (previous) this.regionTotals[previous]--;
            this.regionMask[index] = id;
            this.regionTotals[id]++;
          }
        }
      }
      maskCanvas.width = maskCanvas.height = 1;
    }

    _makeOutlines(drawing) {
      const ctx = this.outlineCanvas.getContext('2d');
      crayonLine(ctx, drawing.walls, true, 52, 2.8);
      crayonLine(ctx, drawing.roof, true, 58, 3.1);
      crayonLine(ctx, [[320, 254], [336, 253], [352, 256]], false, 62, 2.1);
      crayonLine(ctx, [[155, 368], [209, 369], [209, 418], [154, 420]], true, 76, 2.5);
      crayonLine(ctx, [[182, 369], [181, 420]], false, 77, 2.1);
      crayonLine(ctx, [[155, 394], [207, 393]], false, 79, 2.1);
      crayonLine(ctx, [[277, 486], [279, 396], [334, 398], [337, 486]], false, 93, 2.6);
      crayonLine(ctx, [[321, 441], [323, 439], [325, 442], [322, 444]], true, 95, 1.4);
      crayonLine(ctx, [[226, 298], [250, 276], [275, 298], [253, 320]], true, 111, 2.2);

      // Trunk sides and branches join the foliage without a horizontal seam.
      crayonLine(ctx, [[548, 385], [546, 431], [535, 491], [563, 488], [593, 490], [581, 442], [577, 385]], false, 148, 2.8);
      crayonLine(ctx, [[562, 451], [562, 397], [548, 371], [525, 357]], false, 151, 2.0);
      crayonLine(ctx, [[562, 400], [591, 373], [608, 346]], false, 158, 2.0);
      crayonLine(ctx, drawing.crown, true, 176, 3.0);
      crayonLine(ctx, drawing.sun, true, 211, 2.8);
      const next = random(386);
      for (let i = 0; i < 13; i++) {
        const angle = i / 13 * Math.PI * 2 + 0.08;
        const inner = 56 + next() * 2;
        const outer = 71 + next() * 10;
        crayonLine(ctx, [[377 + Math.cos(angle) * inner, 116 + Math.sin(angle) * inner],
          [377 + Math.cos(angle + 0.025) * outer, 116 + Math.sin(angle + 0.025) * outer]], false, 218 + i, 2.5);
      }
    }

    _color(color) {
      if (color === this._cachedColor) return this._rgb;
      let css = color || '#60AE29';
      if (color && color.isColor) css = color.getStyle(global.THREE.SRGBColorSpace);
      const ctx = this._colorContext || (this._colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
      if (!this._colorContextSized) {
        ctx.canvas.width = ctx.canvas.height = 1;
        this._colorContextSized = true;
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#60AE29';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      this._rgb = [pixel[0], pixel[1], pixel[2]];
      this._cachedColor = color;
      return this._rgb;
    }

    _stamp(x, y, rgb, dirty) {
      const variant = this._stampIndex++ % this._brushes.length;
      const brush = this._brushes[variant];
      const left = Math.round(x) - BRUSH_RADIUS;
      const top = Math.round(y) - BRUSH_RADIUS;
      const minX = Math.max(0, left);
      const minY = Math.max(0, top);
      const maxX = Math.min(WIDTH, left + BRUSH_SIZE);
      const maxY = Math.min(HEIGHT, top + BRUSH_SIZE);
      const data = this._paintImage.data;
      for (let py = minY; py < maxY; py++) {
        for (let px = minX; px < maxX; px++) {
          const index = py * WIDTH + px;
          const id = this.regionMask[index];
          if (!id) continue;
          const sourceAlpha = Math.round(brush[(py - top) * BRUSH_SIZE + px - left] * this._paperGrain[index] / 255);
          if (sourceAlpha < 2) continue;
          const offset = index * 4;
          const oldAlpha = data[offset + 3];
          const remaining = oldAlpha * (1 - sourceAlpha / 255);
          const combined = sourceAlpha + remaining;
          const alpha = Math.round(combined);
          const red = Math.round((rgb[0] * sourceAlpha + data[offset] * remaining) / combined);
          const green = Math.round((rgb[1] * sourceAlpha + data[offset + 1] * remaining) / combined);
          const blue = Math.round((rgb[2] * sourceAlpha + data[offset + 2] * remaining) / combined);
          if (alpha === oldAlpha && red === data[offset] && green === data[offset + 1] && blue === data[offset + 2]) continue;
          data[offset] = red;
          data[offset + 1] = green;
          data[offset + 2] = blue;
          data[offset + 3] = alpha;
          if (!this.coveredPixels[index] && alpha >= COVERAGE_ALPHA) {
            this.coveredPixels[index] = 1;
            this.paintedCounts[id]++;
          }
          dirty.left = Math.min(dirty.left, px);
          dirty.top = Math.min(dirty.top, py);
          dirty.right = Math.max(dirty.right, px + 1);
          dirty.bottom = Math.max(dirty.bottom, py + 1);
        }
      }
    }

    // Input coordinates are canvas pixels, obtained by the interaction layer from
    // raycast UVs. No DOM events, camera state, sound, or unlock policy live here.
    stampSegment(from, to, color) {
      if (this._disposed || !to || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return false;
      from = from || to;
      if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return false;
      const rgb = this._color(color);
      const dirty = { left: WIDTH, top: HEIGHT, right: 0, bottom: 0 };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (!Number.isFinite(distance)) return false;
      if (!this._lastPoint || Math.hypot(this._lastPoint.x - from.x, this._lastPoint.y - from.y) > STAMP_SPACING * 2) {
        this._stamp(from.x, from.y, rgb, dirty);
        this._distanceToNextStamp = STAMP_SPACING;
      }
      // Constant physical spacing keeps deposit density independent of pointer
      // event frequency. Resting the mouse does not generate additional paint.
      let travelled = this._distanceToNextStamp;
      while (distance > 0 && travelled <= distance) {
        const t = travelled / distance;
        this._stamp(from.x + dx * t, from.y + dy * t, rgb, dirty);
        travelled += STAMP_SPACING;
      }
      this._distanceToNextStamp = travelled - distance;
      this._lastPoint = { x: to.x, y: to.y };
      if (dirty.right <= dirty.left || dirty.bottom <= dirty.top) return false;

      const width = dirty.right - dirty.left;
      const height = dirty.bottom - dirty.top;
      // Update only the changed rectangle. No full-canvas pixel readback occurs
      // on pointer moves: counts are maintained alongside the actual alpha blend.
      this._paintContext.putImageData(this._paintImage, 0, 0, dirty.left, dirty.top, width, height);
      this._compose(dirty.left, dirty.top, width, height);
      this.texture.needsUpdate = true;
      if (this.onProgress) this.onProgress(this.getProgress());
      return true;
    }

    _compose(x, y, width, height) {
      const ctx = this._context;
      ctx.drawImage(this.paperCanvas, x, y, width, height, x, y, width, height);
      ctx.drawImage(this.paintCanvas, x, y, width, height, x, y, width, height);
      ctx.drawImage(this.outlineCanvas, x, y, width, height, x, y, width, height);
    }

    getProgress() {
      const total = this.regionTotals[1] + this.regionTotals[2] + this.regionTotals[3];
      const painted = this.paintedCounts[1] + this.paintedCounts[2] + this.paintedCounts[3];
      return {
        global: total ? painted / total * 100 : 0,
        sun: this.regionTotals[1] ? this.paintedCounts[1] / this.regionTotals[1] * 100 : 0,
        house: this.regionTotals[2] ? this.paintedCounts[2] / this.regionTotals[2] * 100 : 0,
        tree: this.regionTotals[3] ? this.paintedCounts[3] / this.regionTotals[3] * 100 : 0
      };
    }

    breakStroke() {
      this._lastPoint = null;
      this._distanceToNextStamp = 0;
    }

    reset() {
      if (this._disposed) return;
      this._paintImage.data.fill(0);
      this.coveredPixels.fill(0);
      this.paintedCounts.fill(0);
      this._stampIndex = 0;
      this._paintContext.clearRect(0, 0, WIDTH, HEIGHT);
      this.breakStroke();
      this._compose(0, 0, WIDTH, HEIGHT);
      this.texture.needsUpdate = true;
      if (this.onProgress) this.onProgress(this.getProgress());
    }

    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      this.onProgress = null;
      this.texture.dispose();
      [this.canvas, this.paperCanvas, this.paintCanvas, this.outlineCanvas].forEach(function (canvas) {
        canvas.width = canvas.height = 1;
      });
      this._paintImage = null;
      this._paperGrain = null;
      this._brushes.length = 0;
      this.breakStroke();
    }
  }

  experience.PaintingSystem = PaintingSystem;
}(window));
