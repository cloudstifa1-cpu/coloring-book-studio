// Line cleanup for AI coloring pages. Pure functions on pixel arrays (testable).
// A "bin" is a Uint8Array, 1 = black line, 0 = white paper.

// Tuned on a real level-5 page: closing gaps by default merged fine detail into blobs.
export const DEFAULTS = { threshold: 155, speckSize: 8, closeGaps: false, thickness: 0 };

// RGBA pixels -> black/white. Anything darker than threshold becomes black.
export function toBinary(rgba, w, h, threshold = DEFAULTS.threshold) {
  const out = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * a + 255 * (1 - a);
    out[i] = lum < threshold ? 1 : 0;
  }
  return out;
}

export function toRGBA(bin) {
  const out = new Uint8ClampedArray(bin.length * 4);
  for (let i = 0, p = 0; i < bin.length; i++, p += 4) {
    const v = bin[i] ? 0 : 255;
    out[p] = out[p + 1] = out[p + 2] = v;
    out[p + 3] = 255;
  }
  return out;
}

// Removes black specks smaller than minSize pixels (touching pixels, 8 directions).
export function removeSpecks(bin, w, h, minSize = DEFAULTS.speckSize) {
  if (minSize <= 1) return bin.slice();
  const out = bin.slice();
  const seen = new Uint8Array(bin.length);
  const stack = new Int32Array(bin.length);
  const group = new Int32Array(bin.length);
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || seen[start]) continue;
    let top = 0, n = 0;
    stack[top++] = start; seen[start] = 1;
    while (top) {
      const i = stack[--top];
      group[n++] = i;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (bin[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
        }
      }
    }
    if (n < minSize) for (let k = 0; k < n; k++) out[group[k]] = 0;
  }
  return out;
}

// Grow black lines by 1 pixel.
export function dilate(bin, w, h) {
  const out = new Uint8Array(bin.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        if (bin[yy * w + xx]) { v = 1; break; }
      }
    }
    out[y * w + x] = v;
  }
  return out;
}

// Shrink black lines by 1 pixel.
export function erode(bin, w, h) {
  const out = new Uint8Array(bin.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let dy = -1; dy <= 1 && v; dy++) {
      const yy = y + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        // Outside the page counts as white paper.
        if (yy < 0 || yy >= h || xx < 0 || xx >= w || !bin[yy * w + xx]) { v = 0; break; }
      }
    }
    out[y * w + x] = v;
  }
  return out;
}

// Closes 1-2 pixel gaps in lines so areas can be filled.
export const closeGaps = (bin, w, h) => erode(dilate(bin, w, h), w, h);

// thickness: -1 thinner, 0 normal, +1 / +2 thicker
export function adjustThickness(bin, w, h, thickness = 0) {
  let out = bin;
  for (let i = 0; i < thickness; i++) out = dilate(out, w, h);
  for (let i = 0; i < -thickness; i++) out = erode(out, w, h);
  return out;
}

export function cleanPixels(rgba, w, h, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let bin = toBinary(rgba, w, h, o.threshold);
  bin = removeSpecks(bin, w, h, o.speckSize);
  if (o.closeGaps) bin = closeGaps(bin, w, h);
  bin = adjustThickness(bin, w, h, o.thickness);
  return toRGBA(bin);
}
