(function (global) {
  'use strict';

  // Provisional, replaceable artwork. Each caller owns and disposes its texture.
  const experience = global.TimeExperience = global.TimeExperience || {};

  function random(seed) {
    return function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function canvas(width, height) {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    return surface;
  }

  function texture(surface, name) {
    const result = new global.THREE.CanvasTexture(surface);
    result.colorSpace = global.THREE.SRGBColorSpace;
    result.name = name;
    return result;
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index) ctx.lineTo(point[0], point[1]);
      else ctx.moveTo(point[0], point[1]);
    });
    ctx.closePath();
    ctx.fill();
  }

  function ellipse(ctx, x, y, rx, ry, color, angle) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle || 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function stroke(ctx, points, color, width) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo.apply(ctx, points.slice(2));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function grain(surface, seed, strength) {
    const ctx = surface.getContext('2d');
    const pixels = ctx.getImageData(0, 0, surface.width, surface.height);
    const next = random(seed);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = (next() - 0.5) * strength;
      pixels.data[i] += value;
      pixels.data[i + 1] += value;
      pixels.data[i + 2] += value;
    }
    ctx.putImageData(pixels, 0, 0);
  }

  function brushwork(ctx, width, height, seed, count, light, dark) {
    const next = random(seed);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = next() * width;
      const y = next() * height;
      ctx.globalAlpha = 0.025 + next() * 0.025;
      ctx.strokeStyle = i % 2 ? light : dark;
      ctx.lineWidth = 2 + next() * 13;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8 + next() * 70, y - 3 + next() * 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function cork() {
    const surface = canvas(1024, 1024);
    const ctx = surface.getContext('2d');
    const next = random(8327);
    const wash = ctx.createLinearGradient(0, 0, 1024, 1024);
    wash.addColorStop(0, '#caa275');
    wash.addColorStop(0.55, '#bf9768');
    wash.addColorStop(1, '#c5a078');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 1024, 1024);
    const flecks = ['#9d784e', '#d4b28c', '#e2c6a2', '#ac8659', '#b38d64'];
    for (let i = 0; i < 16500; i++) {
      const x = next() * 1024;
      const y = next() * 1024;
      const r = 1.1 + next() * 5.1;
      ctx.globalAlpha = 0.13 + next() * 0.2;
      polygon(ctx, [[x - r, y], [x - r * 0.35, y - r], [x + r * 0.7, y - r * 0.55], [x + r, y + r * 0.6], [x - r * 0.2, y + r]], flecks[i % flecks.length]);
    }
    ctx.globalAlpha = 1;
    brushwork(ctx, 1024, 1024, 82, 340, '#edd4ae', '#936d49');
    grain(surface, 7401, 8);
    return texture(surface, 'intro-cork-hand-painted');
  }

  function frame() {
    const surface = canvas(512, 512);
    const ctx = surface.getContext('2d');
    const wash = ctx.createLinearGradient(0, 0, 512, 512);
    wash.addColorStop(0, '#efad62');
    wash.addColorStop(0.45, '#e79645');
    wash.addColorStop(1, '#d8893e');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 512, 512);
    brushwork(ctx, 512, 512, 190, 800, '#ffe3a4', '#af682d');
    grain(surface, 947, 5);
    return texture(surface, 'intro-orange-frame-hand-painted');
  }

  const stages = {
    childhood: { seed: 41, background: '#b9ccbe', backgroundLight: '#dce3c8', shirt: '#dfaa45', shirtLight: '#efd17a', shirtDark: '#bc8536', hair: '#57372e', hairLight: '#805440', hairDark: '#3c2826', skin: '#d99b73', skinLight: '#f0bf8e', skinDark: '#ba7e5d', faceY: 260 },
    adulthood: { seed: 81, background: '#c1cec9', backgroundLight: '#e7dfbc', shirt: '#b86953', shirtLight: '#d98b6c', shirtDark: '#925444', hair: '#4c302b', hairLight: '#795140', hairDark: '#322322', skin: '#d69a75', skinLight: '#efbd92', skinDark: '#b77959', faceY: 267 },
    oldage: { seed: 109, background: '#dac7a6', backgroundLight: '#f0dfbd', shirt: '#597e77', shirtLight: '#86a49a', shirtDark: '#3f645f', hair: '#c5c3b3', hairLight: '#e6e3cf', hairDark: '#969c92', skin: '#cb9978', skinLight: '#e5b791', skinDark: '#ad785c', faceY: 277 }
  };

  function drawBody(ctx, p, stage) {
    if (stage === 'adulthood') {
      ctx.fillStyle = p.hairDark;
      ctx.beginPath();
      ctx.moveTo(156, 228);
      ctx.bezierCurveTo(131, 327, 152, 376, 132, 430);
      ctx.lineTo(368, 439);
      ctx.bezierCurveTo(348, 354, 383, 263, 354, 204);
      ctx.fill();
    }
    polygon(ctx, [[223, 358], [294, 357], [298, 434], [258, 457], [216, 425]], p.skinDark);
    polygon(ctx, [[223, 363], [265, 379], [258, 450], [216, 425]], p.skin);
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.moveTo(80, 600);
    ctx.lineTo(98, 501);
    ctx.bezierCurveTo(111, 454, 167, 440, 218, 414);
    ctx.bezierCurveTo(230, 441, 282, 455, 299, 417);
    ctx.bezierCurveTo(344, 438, 405, 447, 422, 493);
    ctx.lineTo(449, 600);
    ctx.fill();
    polygon(ctx, [[111, 505], [216, 433], [208, 600], [80, 600]], p.shirtLight);
    polygon(ctx, [[309, 437], [418, 488], [449, 600], [354, 600]], p.shirtDark);
    stroke(ctx, [216, 423, 232, 456, 280, 455, 297, 427], p.shirtDark, 7);
    stroke(ctx, [146, 496, 165, 524, 160, 559, 152, 583], p.shirt, 8);
    if (stage === 'oldage') {
      polygon(ctx, [[214, 415], [258, 451], [230, 490], [185, 437]], '#9ab5a7');
      polygon(ctx, [[300, 418], [258, 451], [283, 488], [326, 437]], '#8eaa9c');
    }
  }

  function drawFace(ctx, p, stage) {
    const isChild = stage === 'childhood';
    const isOld = stage === 'oldage';
    ctx.save();
    ctx.translate(260, p.faceY);
    const cheekWidth = isChild ? 100 : 86;
    const chin = isChild ? 108 : 123;

    // Hair is a layered silhouette; the face uses broad, gently faceted paint areas.
    ellipse(ctx, -2, -26, isChild ? 113 : 108, isChild ? 119 : 140, p.hair, -0.05);
    if (isOld) ellipse(ctx, 78, -101, 34, 33, p.hairDark, 0.35);
    ellipse(ctx, -cheekWidth + 2, 9, 14, 26, p.skinDark, -0.12);
    ellipse(ctx, cheekWidth - 1, 12, 14, 26, p.skinDark, 0.16);

    function facePath() {
      ctx.beginPath();
      ctx.moveTo(-78, -88);
      ctx.lineTo(-42, -115);
      ctx.lineTo(38, -114);
      ctx.lineTo(79, -79);
      ctx.bezierCurveTo(94, -31, cheekWidth, 15, cheekWidth - 12, 50);
      ctx.lineTo(65, 91);
      ctx.quadraticCurveTo(12, chin + 22, -42, chin - 14);
      ctx.lineTo(-79, 70);
      ctx.bezierCurveTo(-cheekWidth - 3, 23, -91, -52, -78, -88);
      ctx.closePath();
    }
    facePath();
    ctx.fillStyle = p.skin;
    ctx.fill();
    ctx.save();
    facePath();
    ctx.clip();
    polygon(ctx, [[-104, -120], [-3, -127], [10, -39], [-21, 49], [-99, 23]], p.skinLight);
    polygon(ctx, [[55, -118], [119, -38], [113, 123], [43, 137], [58, 43]], p.skinDark);
    polygon(ctx, [[-98, 41], [-33, 66], [17, 47], [61, 84], [14, 137], [-75, 102]], isChild ? '#dea17d' : p.skin);
    ellipse(ctx, -50, 36, isChild ? 23 : 17, isChild ? 14 : 9, isChild ? '#db8d72' : '#cc927b');
    ellipse(ctx, 54, 38, 17, 10, '#bc8068');
    ctx.restore();

    const eyeY = isChild ? -7 : -4;
    const eyeWidth = isChild ? 15 : 12;
    ellipse(ctx, -37, eyeY, eyeWidth, isOld ? 4 : 6, '#f5d7b4', -0.07);
    ellipse(ctx, 40, eyeY + 2, eyeWidth - 1, isOld ? 4 : 6, '#eed0ae', 0.1);
    ellipse(ctx, -34, eyeY, isChild ? 5 : 4, isOld ? 4 : 6, '#40312b');
    ellipse(ctx, 42, eyeY + 2, isChild ? 5 : 4, isOld ? 4 : 6, '#40312b');
    stroke(ctx, [-52, -18, -41, -23, -32, -24, -23, -18], isOld ? '#878678' : p.hair, isChild ? 4 : 5);
    stroke(ctx, [26, -18, 37, -21, 47, -18, 54, -15], isOld ? '#878678' : p.hair, 4);
    polygon(ctx, [[8, 3], [6, 29], [21, 30], [13, 35], [1, 31]], p.skinDark);
    stroke(ctx, [-22, isChild ? 59 : 68, -7, isChild ? 72 : 78, 14, isChild ? 74 : 78, 27, isChild ? 57 : 66], '#8f594b', 4);
    stroke(ctx, [-8, isChild ? 76 : 85, 1, isChild ? 78 : 87, 10, isChild ? 78 : 87, 16, isChild ? 75 : 83], p.skinLight, 3);

    if (isOld) {
      const wrinkle = '#b38366';
      stroke(ctx, [-57, 9, -44, 17, -33, 16, -24, 12], wrinkle, 2);
      stroke(ctx, [25, 14, 37, 21, 49, 20, 59, 13], wrinkle, 2);
      stroke(ctx, [-33, -60, -10, -67, 19, -66, 38, -60], '#bb8e71', 2);
      stroke(ctx, [-27, -47, -3, -53, 18, -52, 33, -48], '#bb8e71', 2);
      stroke(ctx, [-24, 45, -37, 52, -33, 70, -27, 78], wrinkle, 2);
      stroke(ctx, [27, 45, 37, 51, 40, 71, 31, 79], wrinkle, 2);
    }

    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.moveTo(-105, -32);
    ctx.bezierCurveTo(-121, -102, -68, -161, 8, -159);
    ctx.bezierCurveTo(74, -153, 104, -101, 99, -40);
    if (isChild) {
      ctx.lineTo(78, -53);
      ctx.lineTo(62, -86);
      ctx.lineTo(36, -60);
      ctx.lineTo(9, -89);
      ctx.lineTo(-21, -65);
      ctx.lineTo(-50, -86);
      ctx.lineTo(-79, -49);
    } else {
      ctx.lineTo(75, -65);
      ctx.bezierCurveTo(56, -78, 33, -99, 17, -119);
      ctx.bezierCurveTo(-11, -76, -53, -60, -79, -43);
      ctx.lineTo(-86, 17);
    }
    ctx.closePath();
    ctx.fill();
    polygon(ctx, [[-94, -88], [-56, -129], [9, -142], [-20, -113], [-77, -63]], p.hairLight);
    polygon(ctx, [[30, -141], [67, -117], [89, -72], [65, -88]], p.hairDark);
    if (isOld) {
      stroke(ctx, [-81, -90, -46, -130, -8, -124, 18, -138], p.hairLight, 5);
      stroke(ctx, [-69, -73, -39, -110, 2, -104, 24, -126], p.hairLight, 4);
    }
    ctx.restore();
  }

  function photo(stage) {
    const p = stages[stage];
    if (!p) throw new TypeError('Unknown introductory portrait stage: ' + stage);
    const surface = canvas(512, 600);
    const ctx = surface.getContext('2d');
    const wash = ctx.createLinearGradient(0, 0, 512, 600);
    wash.addColorStop(0, p.backgroundLight);
    wash.addColorStop(0.6, p.background);
    wash.addColorStop(1, p.background);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 512, 600);
    ctx.globalAlpha = 0.2;
    polygon(ctx, [[0, 0], [231, 0], [122, 600], [0, 600]], '#fff6d8');
    polygon(ctx, [[401, 0], [512, 0], [512, 600], [332, 600]], '#778c83');
    ctx.globalAlpha = 1;
    brushwork(ctx, 512, 600, p.seed, 270, '#fff7d9', '#6d7970');
    drawBody(ctx, p, stage);
    drawFace(ctx, p, stage);
    // One light glazing pass ties the hand-painted figure to its paper background.
    brushwork(ctx, 512, 600, p.seed + 62, 180, '#f4dfba', '#776753');
    grain(surface, p.seed + 1700, 7);
    return texture(surface, 'intro-portrait-' + stage);
  }

  // Blurs a layer onto an opaque base so the projected light never gets hard edges.
  function soften(target, layer, radius) {
    const ctx = target.getContext('2d');
    if ('filter' in ctx) {
      ctx.filter = 'blur(' + radius + 'px)';
      ctx.drawImage(layer, 0, 0);
      ctx.filter = 'none';
      return;
    }
    // Fallback without canvas filters: down- and up-sampling also diffuses the shapes.
    const small = canvas(Math.max(8, Math.round(layer.width / radius)), Math.max(8, Math.round(layer.height / radius)));
    const smallCtx = small.getContext('2d');
    smallCtx.imageSmoothingQuality = 'high';
    smallCtx.drawImage(layer, 0, 0, small.width, small.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, layer.width, layer.height);
  }

  // Sunlight cookie for the board's golden-hour SpotLight. Its RGB multiplies the light:
  // a honey window patch, the soft shadow of the window bars and a few leaf silhouettes.
  // Shapes are authored in board units (x: -9.5..9.5, y: -5.55..5.55) and mapped through
  // `corners`, the board corners as seen from the light (0..1 texture coordinates).
  function windowLight(corners) {
    const size = 1024;
    const next = random(5021);
    const toCanvas = function (x, y) {
      const s = (x + 9.5) / 19;
      const t = (y + 5.55) / 11.1;
      const u = (1 - s) * (1 - t) * corners.bottomLeft.u + s * (1 - t) * corners.bottomRight.u + (1 - s) * t * corners.topLeft.u + s * t * corners.topRight.u;
      const v = (1 - s) * (1 - t) * corners.bottomLeft.v + s * (1 - t) * corners.bottomRight.v + (1 - s) * t * corners.topLeft.v + s * t * corners.topRight.v;
      return [u * size, (1 - v) * size];
    };
    const shape = function (ctx, points, color) {
      polygon(ctx, points.map(function (point) { return toCanvas(point[0], point[1]); }), color);
    };
    const leaf = function (ctx, x, y, length, width, angle, color) {
      const points = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const side = i <= 8 ? 1 : -1;
        const along = i <= 8 ? t * 2 : 2 - t * 2;
        const local = [along * length, side * Math.sin(along * Math.PI) * width * (1 - along * 0.25)];
        points.push([x + local[0] * Math.cos(angle) - local[1] * Math.sin(angle), y + local[0] * Math.sin(angle) + local[1] * Math.cos(angle)]);
      }
      shape(ctx, points, color);
    };
    const sprig = function (ctx, x, y, angle, count, scale, color) {
      for (let i = 0; i < count; i++) {
        const along = i * 0.55 * scale;
        const px = x + Math.cos(angle) * along;
        const py = y + Math.sin(angle) * along;
        const side = i % 2 ? 1 : -1;
        leaf(ctx, px, py, (0.9 + next() * 0.6) * scale, (0.22 + next() * 0.1) * scale, angle + side * (0.55 + next() * 0.45), color);
      }
      shape(ctx, [[x, y], [x + Math.cos(angle) * count * 0.55 * scale, y + Math.sin(angle) * count * 0.55 * scale],
        [x + Math.cos(angle) * count * 0.55 * scale, y + Math.sin(angle) * count * 0.55 * scale + 0.06], [x, y + 0.06]], color);
    };

    const surface = canvas(size, size);
    const ctx = surface.getContext('2d');
    // Indirect room light outside the window opening: warm and only moderately dimmer.
    ctx.fillStyle = '#c2967a';
    ctx.fillRect(0, 0, size, size);

    // Window opening, its top edge sloping like late raking sunlight.
    const patch = canvas(size, size);
    const patchCtx = patch.getContext('2d');
    const [x0, y0] = toCanvas(-12, 7.5);
    const [x1, y1] = toCanvas(9, -7.5);
    const honey = patchCtx.createLinearGradient(x0, y0, x1, y1);
    honey.addColorStop(0, '#fff6e6');
    honey.addColorStop(0.55, '#ffe9c4');
    honey.addColorStop(1, '#ffcf96');
    shape(patchCtx, [[-13, 7.4], [6.8, 5.9], [8.9, -7.6], [-13, -7.6]], honey);
    soften(surface, patch, 26);

    // Window bars: two slanted verticals and one horizontal transom, very diffuse.
    const bars = canvas(size, size);
    const barsCtx = bars.getContext('2d');
    const barColor = 'rgba(140,96,64,0.66)';
    shape(barsCtx, [[-3.0, 7.6], [-2.2, 7.6], [-0.7, -7.6], [-1.5, -7.6]], barColor);
    shape(barsCtx, [[-13, 2.05], [9, 0.85], [9, 0.2], [-13, 1.4]], barColor);
    shape(barsCtx, [[3.8, 7.6], [4.45, 7.6], [5.85, -7.6], [5.2, -7.6]], 'rgba(140,96,64,0.5)');
    soften(surface, bars, 5);

    // Leaves of a plant by the window: corners only, away from the portraits' faces.
    const leaves = canvas(size, size);
    const leavesCtx = leaves.getContext('2d');
    const leafColor = 'rgba(122,80,52,0.68)';
    sprig(leavesCtx, -11.6, 6.1, -0.3, 6, 1.45, leafColor);
    sprig(leavesCtx, -11.2, 4.1, 0.02, 4, 1.15, leafColor);
    sprig(leavesCtx, -11.4, -6.6, 0.55, 5, 1.4, leafColor);
    sprig(leavesCtx, 1.4, 7.2, -1.2, 4, 1.15, 'rgba(122,80,52,0.52)');
    soften(surface, leaves, 3.5);

    const result = texture(surface, 'intro-golden-hour-window-cookie');
    result.generateMipmaps = true;
    return result;
  }

  // Neutral fibre streaks for the twisted strands of the cabuya (tinted by each material).
  function jute() {
    const surface = canvas(128, 32);
    const ctx = surface.getContext('2d');
    const next = random(611);
    ctx.fillStyle = '#efe2cc';
    ctx.fillRect(0, 0, 128, 32);
    for (let i = 0; i < 46; i++) {
      const y = next() * 32;
      ctx.globalAlpha = 0.25 + next() * 0.45;
      ctx.strokeStyle = i % 3 ? '#a8865d' : '#fff8ea';
      ctx.lineWidth = 0.8 + next() * 1.6;
      ctx.beginPath();
      ctx.moveTo(next() * 40, y);
      ctx.lineTo(60 + next() * 68, y + (next() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const result = texture(surface, 'intro-cabuya-fibre');
    result.wrapS = result.wrapT = global.THREE.RepeatWrapping;
    return result;
  }

  experience.IntroTextures = { cork: cork, frame: frame, photo: photo, windowLight: windowLight, jute: jute };
}(window));
