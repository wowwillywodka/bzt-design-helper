/* Shared pixel operations. Browser + Node, no dependencies. */
(function (root) {
  'use strict';
  const rgbKey = (r, g, b) => `${r},${g},${b}`;
  function dimensions(shape, scale, heightOffset = 0, phase = 0) {
    const half = scale >> 1, quarter = scale >> 2;
    let columns, height;
    switch (shape) {
      case 'small': columns = quarter; height = quarter; break;
      case 'tall': columns = half >> 1; height = half; break;
      case 'tree': columns = half; height = scale; break;
      case 'column': columns = quarter; height = scale; break;
      case 'floorlamp': height = scale - quarter; columns = height >> 1; break;
      case 'stool': columns = half >> 2; height = half; break;
      case 'table': columns = half; height = half - (half >> 2); break;
      case 'lamp': height = quarter; columns = height >> 1; break;
      case 'cap': columns = quarter; height = quarter >> 1; break;
      case 'wide': columns = half; height = half >> 2; break;
      case 'flame': columns = half + (half >> 2); height = scale; break;
      case 'camera': height = half - (half >> 2); columns = height >> 1; break;
      case 'legacy-wide': columns = half; height = quarter; break;
      case 'projectile': height = quarter; columns = height >> 1; break;
      case 'slow-projectile': height = half; columns = height >> 1; break;
      case 'explosion': height = (scale * 2) >> [1,0,1,2,3,4][phase]; columns = height >> 1; break;
      case 'ground-effect': height = (scale * (16 - phase)) >> 4; columns = height >> 1; break;
      case 'charge-fire': height = scale >> phase; columns = height >> 1; break;
      case 'particle-wall':
        height = ((scale * (256 + phase)) >> 8) >> 3;
        columns = ((scale * (256 - phase)) >> 8) >> 4; break;
      case 'particle-floor':
        height = ((scale * (256 - phase)) >> 8) >> 4;
        columns = ((scale * (128 + phase)) >> 7) >> 3; break;
      case 'raw': return {width:32, height:32};
      case 'base':
      case 'fan': columns = half; height = ((half >> 1) * (32 + heightOffset)) >> 6; break;
      default: throw new RangeError('Unknown object profile: ' + shape);
    }
    return {width: columns * 2, height};
  }
  function ratio(width, height) {
    if (!height) return 'высота 0';
    if (!width) return 'ширина 0';
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  }
  function sample(pixels, sw, sh, dw, dh, mirror = false) {
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sx = Math.floor(x * sw / dw);
      const s = (Math.floor(y * sh / dh) * sw + (mirror ? sw - 1 - sx : sx)) * 4;
      out.set(pixels.subarray(s, s + 4), (y * dw + x) * 4);
    }
    return out;
  }
  function gameAxes(widthPairs, height, tables, mirror = false) {
    if (!Number.isInteger(widthPairs) || widthPairs < 1 || widthPairs > 128 || !Number.isInteger(height) || height < 1 || height > 512) {
      throw new RangeError('Invalid BZT tile dimensions');
    }
    const columns = [];
    let offset = mirror ? 480 : 0, accumulator = 0;
    for (let x = 0; x < widthPairs; x++) {
      columns.push(offset / 32);
      if (widthPairs < 16) offset += tables.steps[widthPairs + (mirror ? 16 : 0)][x];
      else {
        accumulator += 16;
        if (accumulator >= widthPairs) {
          accumulator -= widthPairs;
          offset += mirror ? -32 : 32;
        }
      }
    }
    // Above 80 rows, the original column routine increments its 16-bit
    // phase BEFORE writing. Extend that unclipped column for the close-up.
    const step = Math.floor(0x200000 / height);
    const rows = height <= 80 ? tables.rows[height] : Array.from({length:height}, (_, y) => Math.floor((y + 1) * step / 65536));
    return {columns, rows};
  }
  function gameSample(pixels, width, height, tables, mirror = false, overflowPair = null) {
    const out = new Uint8ClampedArray(width * height * 4);
    if (!width || !height) return out;
    const {columns, rows} = gameAxes(width / 2, height, tables, mirror);
    const getPair = (column, row) => {
      // The large-column routine can read row 32: this is the first byte
      // of the next packed column, or the byte immediately after the tile.
      const linear = column * 32 + row;
      if (linear >= 512) return overflowPair;
      const p = ((linear % 32) * 32 + Math.floor(linear / 32) * 2) * 4;
      return pixels.subarray(p, p + 8);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < columns.length; x++) {
      const pair = getPair(columns[x], rows[y]);
      if (!pair || (!pair[3] && !pair[7])) continue;
      for (let nibble = 0; nibble < 2; nibble++) {
        const source = (mirror ? 1 - nibble : nibble) * 4;
        const dest = (y * width + x * 2 + nibble) * 4;
        // A transparent nibble inside a nonzero packed byte is opaque black.
        out.set(pair[source + 3] ? [pair[source],pair[source+1],pair[source+2],255] : [0,0,0,255],dest);
      }
    }
    return out;
  }
  function inspect(pixels, width, height, colors, category) {
    const world = ['world','decor','effects','other'].includes(category);
    const allowed = new Set(colors.slice(world ? 0 : 1).map(c => rgbKey(...c)));
    const used = new Set(), invalid = new Map();
    let semi = 0, transparent = 0, mixedPairs = 0, emptyBlackPairs = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      const alpha = pixels[p+3];
      if (alpha === 0) { transparent++; continue; }
      if (alpha !== 255) semi++;
      const key = rgbKey(pixels[p], pixels[p+1], pixels[p+2]);
      used.add(key);
      if (!allowed.has(key)) invalid.set(key, (invalid.get(key) || 0) + 1);
    }
    if (world) {
      for (let y = 0; y < height; y++) for (let x = 0; x+1 < width; x += 2) {
        const p = (y * width + x)*4, q = p+4;
        if ((pixels[p+3] === 0) !== (pixels[q+3] === 0)) mixedPairs++;
        // Opaque black pairs are encodable using slot F; never map both to 0.
        if (pixels[p+3] && pixels[q+3] && !pixels[p] && !pixels[p+1] && !pixels[p+2] && !pixels[q] && !pixels[q+1] && !pixels[q+2]) emptyBlackPairs++;
      }
    }
    const sizeOK = category === 'held' ? width <= 160 && height <= 96 && width % 8 === 0 && height % 8 === 0 : width === 32 && height === 32;
    return {sizeOK, used: used.size, invalid: [...invalid.entries()], semi, transparent, mixedPairs, emptyBlackPairs};
  }
  const api = {dimensions, ratio, sample, gameAxes, gameSample, inspect};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZTCore = api;
})(typeof window === 'undefined' ? globalThis : window);
