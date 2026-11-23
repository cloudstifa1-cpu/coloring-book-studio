// Tap-to-fill coloring. Pure functions on pixel arrays (testable).
// lines: Uint8Array (1 = black line). fill: Uint32Array of colors (RGBA packed, little-endian).
import { dilate } from './cleanup.js';

export const WHITE = 0xffffffff;
export const BLACK = 0xff000000;

export function hexToColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return WHITE;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// Finds the white area you tapped (stops at lines). 4 directions so it can't slip through diagonal corners.
export function floodRegion(blocked, w, h, x, y) {
  const start = y * w + x;
  if (x < 0 || y < 0 || x >= w || y >= h || blocked[start]) return null;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  let top = 0;
  stack[top++] = start; seen[start] = 1;
  while (top) {
    const i = stack[--top];
    out.push(i);
    const px = i % w;
    if (px > 0 && !seen[i - 1] && !blocked[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
    if (px < w - 1 && !seen[i + 1] && !blocked[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
    if (i >= w && !seen[i - w] && !blocked[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
    if (i < w * (h - 1) && !seen[i + w] && !blocked[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
  }
  return Int32Array.from(out);
}

// Leak guard: lines are thickened by `gap` pixels while finding the area, so color
// doesn't leak through small breaks. Then the color grows back out to the real lines.
export function fillArea(lines, w, h, x, y, gap = 1) {
  const idx = y * w + x;
  if (x < 0 || y < 0 || x >= w || y >= h || lines[idx]) return null;
  let blocked = lines;
  for (let i = 0; i < gap; i++) blocked = dilate(blocked, w, h);
  let region = floodRegion(blocked, w, h, x, y);
  if (!region) return floodRegion(lines, w, h, x, y); // tapped right beside a line
  if (gap === 0) return region;
  const inSet = new Uint8Array(w * h);
  for (const i of region) inSet[i] = 1;
  let edge = Array.from(region);
  const all = Array.from(region);
  for (let s = 0; s < gap; s++) {
    const nextEdge = [];
    for (const i of edge) {
      const px = i % w, py = (i / w) | 0;
      // 8 directions, matching how the lines were thickened.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!inSet[j] && !lines[j]) { inSet[j] = 1; nextEdge.push(j); all.push(j); }
      }
    }
    edge = nextEdge;
  }
  return Int32Array.from(all);
}

// Colors the area and returns what's needed to undo it.
export function applyFill(fill, indices, color) {
  const prev = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) { prev[k] = fill[indices[k]]; fill[indices[k]] = color; }
  return { indices, prev, color };
}

export function compose(lines, fill, out = new Uint32Array(fill.length)) {
  for (let i = 0; i < fill.length; i++) out[i] = lines[i] ? BLACK : fill[i];
  return out;
}

export class History {
  constructor(limit = 40) { this.limit = limit; this.done = []; this.undone = []; }
  push(step) { this.done.push(step); if (this.done.length > this.limit) this.done.shift(); this.undone = []; }
  undo(fill) {
    const s = this.done.pop(); if (!s) return false;
    for (let k = 0; k < s.indices.length; k++) fill[s.indices[k]] = s.prev[k];
    this.undone.push(s); return true;
  }
  redo(fill) {
    const s = this.undone.pop(); if (!s) return false;
    for (let k = 0; k < s.indices.length; k++) fill[s.indices[k]] = s.color;
    this.done.push(s); return true;
  }
  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
}

export function addRecent(list, hex, max = 8) {
  const h = hex.toLowerCase();
  return [h, ...list.filter(x => x !== h)].slice(0, max);
}

export const PALETTE = [
  '#000000', '#5c3a1e', '#8b5a2b', '#d2a679', '#ffffff', '#9e9e9e',
  '#b71c1c', '#e53935', '#ff7043', '#ffa726', '#ffd54f', '#fff176',
  '#1b5e20', '#43a047', '#9ccc65', '#00897b', '#4dd0e1', '#81d4fa',
  '#0d47a1', '#1e88e5', '#3949ab', '#6a1b9a', '#ab47bc', '#f48fb1',
  '#ad1457', '#f8bbd0', '#ffe0b2', '#c5e1a5', '#b3e5fc', '#d1c4e9',
];
