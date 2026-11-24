// Offline pattern generator: makes coloring pages with math, no internet or AI needed.
// Pure functions (testable). Every page is drawn on a 1024 × 1024 square from a seed,
// so the same type + seed + difficulty always gives the same page.
import { clampDifficulty } from './core.js';

export const SIZE = 1024;
const C = SIZE / 2;
const M = 28; // outer margin for the frame

export const PATTERNS = {
  mandala: 'Mandala',
  geometric: 'Geometric',
  glass: 'Stained Glass',
  flowers: 'Flower Garden',
  zentangle: 'Zentangle Tiles',
  kaleidoscope: 'Kaleidoscope',
};

// Small seeded random number maker (same seed → same numbers).
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = list => list[Math.floor(next() * list.length)];
  return next;
}

const circle = (x, y, r) => ({ t: 'c', x, y, r });
const poly = (pts, closed = true) => ({ t: 'p', pts, c: closed });
const polar = (r, a, cx = C, cy = C) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const frame = () => poly([[M, M], [SIZE - M, M], [SIZE - M, SIZE - M], [M, SIZE - M]]);

// ---------- Mandala ----------
function mandala(R, d) {
  const out = [];
  const rings = 3 + d * 2;
  const maxR = 480, minR = 34;
  const radii = [minR];
  for (let i = 1; i <= rings; i++) radii.push(minR + (maxR - minR) * (i / rings) ** 0.85);
  let n = R.pick([8, 10, 12]) * (d >= 4 ? 2 : 1);
  out.push(circle(C, C, minR), circle(C, C, minR * 0.45));
  const motifs = ['petal', 'beads', 'spikes', 'scallop', 'leaf', 'double'];
  for (let i = 0; i < rings; i++) {
    const r0 = radii[i], r1 = radii[i + 1];
    if (r1 > 220 && n < 24 && R() < 0.5) n *= 2;
    const motif = i === 0 ? 'petal' : R.pick(motifs);
    const step = (2 * Math.PI) / n, off = (i % 2) * step / 2;
    const ringPetal = (k, width, sharp, inset = 0) => {
      const a = off + k * step, pts = [];
      const lo = r0 + (r1 - r0) * inset, hi = r1 - (r1 - r0) * inset * 0.5;
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        pts.push(polar(lo + (hi - lo) * t, a + width * Math.sin(Math.PI * t) ** sharp * (1 - t * 0.35)));
      }
      for (let s = 12; s >= 0; s--) {
        const t = s / 12;
        pts.push(polar(lo + (hi - lo) * t, a - width * Math.sin(Math.PI * t) ** sharp * (1 - t * 0.35)));
      }
      return poly(pts);
    };
    for (let k = 0; k < n; k++) {
      const a = off + k * step;
      if (motif === 'petal') out.push(ringPetal(k, step * 0.48, 0.6));
      else if (motif === 'leaf') out.push(ringPetal(k, step * 0.42, 1));
      else if (motif === 'double') { out.push(ringPetal(k, step * 0.48, 0.6)); out.push(ringPetal(k, step * 0.22, 0.8, 0.3)); }
      else if (motif === 'beads') {
        const rm = (r0 + r1) / 2, br = Math.min((r1 - r0) / 2, Math.PI * rm / n) * 0.8;
        const [x, y] = polar(rm, a);
        out.push(circle(x, y, br));
        if (d >= 3 && br > 10) out.push(circle(x, y, br * 0.45));
      }
    }
    if (motif === 'spikes') {
      const pts = [];
      for (let k = 0; k < n; k++) { pts.push(polar(r0, off + k * step)); pts.push(polar(r1, off + k * step + step / 2)); }
      out.push(poly(pts));
    } else if (motif === 'scallop') {
      const pts = [];
      for (let k = 0; k < n; k++) for (let s = 0; s < 10; s++) {
        const f = s / 10;
        pts.push(polar(r0 + (r1 - r0) * 0.9 * Math.sin(Math.PI * f), off + (k + f) * step));
      }
      out.push(poly(pts));
    }
    out.push(circle(C, C, r1));
  }
  return out;
}

// ---------- Geometric ----------
function insetPoly(pts, f) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]);
}
const midpoints = pts => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });

function geometric(R, d) {
  const out = [frame()];
  const kind = R.pick(['squares', 'triangles', 'hexes']);
  const n = 2 + d;
  const cells = [];
  const span = SIZE - 2 * M;
  if (kind === 'squares') {
    const s = span / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = M + c * s, y = M + r * s;
      cells.push([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]);
    }
  } else if (kind === 'triangles') {
    const s = span / n, h = span / n;
    for (let r = 0; r < n; r++) for (let c = -1; c <= n; c++) {
      const y = M + r * h, x = M + c * s + (r % 2 ? s / 2 : 0);
      cells.push([[x, y + h], [x + s / 2, y], [x + s, y + h]]);
      cells.push([[x + s / 2, y], [x + s * 1.5, y], [x + s, y + h]]);
    }
  } else {
    const s = span / (n * 1.6), w = Math.sqrt(3) * s;
    for (let r = -1; r * 1.5 * s < span + s; r++) for (let c = -1; c * w < span + w; c++) {
      const cx = M + c * w + (r % 2 ? w / 2 : 0), cy = M + r * 1.5 * s;
      cells.push(Array.from({ length: 6 }, (_, k) => [cx + s * Math.cos(Math.PI / 6 + k * Math.PI / 3), cy + s * Math.sin(Math.PI / 6 + k * Math.PI / 3)]));
    }
  }
  const style = R.pick(['nested', 'midpoint', 'star']);
  const depth = 1 + Math.ceil(d / 2);
  for (const cell of cells) {
    out.push(poly(cell));
    if (style === 'nested') for (let k = 1; k <= depth; k++) out.push(poly(insetPoly(cell, 1 - k / (depth + 1))));
    else if (style === 'midpoint') { let p = cell; for (let k = 0; k < depth; k++) { p = midpoints(p); out.push(poly(p)); } }
    else {
      const cx = cell.reduce((s, p) => s + p[0], 0) / cell.length, cy = cell.reduce((s, p) => s + p[1], 0) / cell.length;
      for (const p of cell) out.push(poly([[cx, cy], p], false));
      out.push(poly(insetPoly(cell, 0.4)));
    }
  }
  return out;
}

// ---------- Stained glass (Voronoi cells) ----------
// Keeps the part of a polygon on the side of the line closer to point a than to b.
function clipHalf(pts, a, b) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
  const side = p => (p[0] - mx) * nx + (p[1] - my) * ny; // <= 0 keeps
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
export function voronoi(points, box) {
  return points.map((p, i) => {
    let cell = box;
    for (let j = 0; j < points.length && cell.length; j++) if (j !== i) cell = clipHalf(cell, p, points[j]);
    return cell;
  }).filter(c => c.length >= 3);
}

function glass(R, d) {
  const box = [[M, M], [SIZE - M, M], [SIZE - M, SIZE - M], [M, SIZE - M]];
  const count = 20 + d * 22;
  const pts = [];
  const radial = R() < 0.5;
  for (let i = 0; i < count; i++) {
    if (radial) { const ring = Math.sqrt(R()) * 470; pts.push(polar(ring, R.range(0, Math.PI * 2))); }
    else pts.push([R.range(M, SIZE - M), R.range(M, SIZE - M)]);
  }
  const out = [frame()];
  for (const cell of voronoi(pts, box)) {
    out.push(poly(cell));
    if (d >= 4 && R() < 0.35) out.push(poly(insetPoly(cell, 0.5)));
  }
  if (radial) out.push(circle(C, C, R.range(60, 110)));
  return out;
}

// ---------- Flower garden ----------
function flower(out, R, x, y, r, d) {
  const petals = R.int(5, 12), kind = R.pick(['round', 'pointed', 'heart']);
  const layers = d >= 3 ? 2 : 1;
  for (let L = 0; L < layers; L++) {
    const rr = r * (1 - L * 0.45), turn = L * Math.PI / petals;
    for (let k = 0; k < petals; k++) {
      const a = turn + (k * 2 * Math.PI) / petals;
      if (kind === 'round') { const [px, py] = polar(rr * 0.62, a, x, y); out.push(circle(px, py, rr * 0.38)); }
      else {
        const w = (Math.PI / petals) * (kind === 'heart' ? 1.05 : 0.85), pts = [];
        for (let s = 0; s <= 10; s++) { const t = s / 10; pts.push(polar(rr * 0.25 + rr * 0.75 * t, a + w * Math.sin(Math.PI * t) ** (kind === 'heart' ? 0.4 : 0.8), x, y)); }
        for (let s = 10; s >= 0; s--) { const t = s / 10; pts.push(polar(rr * 0.25 + rr * 0.75 * t, a - w * Math.sin(Math.PI * t) ** (kind === 'heart' ? 0.4 : 0.8), x, y)); }
        out.push(poly(pts));
      }
    }
  }
  out.push(circle(x, y, r * 0.25));
  if (d >= 2) out.push(circle(x, y, r * 0.12));
}
function leaf(x, y, len, a) {
  const pts = [];
  for (let s = 0; s <= 10; s++) { const t = s / 10; pts.push([x + Math.cos(a) * len * t - Math.sin(a) * len * 0.28 * Math.sin(Math.PI * t), y + Math.sin(a) * len * t + Math.cos(a) * len * 0.28 * Math.sin(Math.PI * t)]); }
  for (let s = 10; s >= 0; s--) { const t = s / 10; pts.push([x + Math.cos(a) * len * t + Math.sin(a) * len * 0.28 * Math.sin(Math.PI * t), y + Math.sin(a) * len * t - Math.cos(a) * len * 0.28 * Math.sin(Math.PI * t)]); }
  return [poly(pts), poly([[x, y], [x + Math.cos(a) * len * 0.85, y + Math.sin(a) * len * 0.85]], false)];
}
function flowers(R, d) {
  const out = [frame()];
  const placed = [];
  const want = 4 + d * 3, maxR = 200 - d * 18, minR = 70 - d * 6;
  const free = (x, y, r) => placed.every(p => Math.hypot(p[0] - x, p[1] - y) > p[2] + r + 6);
  for (let tries = 0; tries < 3000 && placed.length < want; tries++) {
    const r = R.range(minR, maxR), x = R.range(M + r, SIZE - M - r), y = R.range(M + r, SIZE - M - r);
    if (free(x, y, r)) { placed.push([x, y, r]); flower(out, R, x, y, r, d); }
  }
  // leaves and dots in the gaps
  let fillers = 0;
  for (let tries = 0; tries < 2500 && fillers < 6 + d * 5; tries++) {
    const len = R.range(45, 95 - d * 5), x = R.range(M + len, SIZE - M - len), y = R.range(M + len, SIZE - M - len);
    if (!free(x, y, len)) continue;
    placed.push([x, y, len * 0.6]); fillers++;
    if (R() < 0.7) out.push(...leaf(x - len * 0.5, y, len, R.range(-0.6, 0.6)));
    else { out.push(circle(x, y, len * 0.35)); out.push(circle(x, y, len * 0.15)); }
  }
  return out;
}

// ---------- Zentangle tiles ----------
function splitRects(R, d) {
  let rects = [[M, M, SIZE - M, SIZE - M]];
  const want = 4 + d * 3;
  while (rects.length < want) {
    rects.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    const [x0, y0, x1, y1] = rects.shift();
    const f = R.range(0.35, 0.65);
    if (x1 - x0 > y1 - y0) { const x = x0 + (x1 - x0) * f; rects.push([x0, y0, x, y1], [x, y0, x1, y1]); }
    else { const y = y0 + (y1 - y0) * f; rects.push([x0, y0, x1, y], [x0, y, x1, y1]); }
  }
  return rects;
}
// Cuts the line (x0,y0)-(x1,y1) to the rectangle. Returns null if it misses.
export function clipLine(x0, y0, x1, y1, [rx0, ry0, rx1, ry1]) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const edges = [[-dx, x0 - rx0], [dx, rx1 - x0], [-dy, y0 - ry0], [dy, ry1 - y0]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[x0 + dx * t0, y0 + dy * t0], [x0 + dx * t1, y0 + dy * t1]];
}
function zentangle(R, d) {
  const out = [];
  const gap = 60 - d * 6;
  for (const rc of splitRects(R, d)) {
    const [x0, y0, x1, y1] = rc, w = x1 - x0, h = y1 - y0;
    out.push(poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]));
    const kind = R.pick(['lines', 'diag', 'circles', 'concentric', 'zigzag', 'scales', 'grid', 'bubbles']);
    const pad = 4;
    const ix0 = x0 + pad, iy0 = y0 + pad, ix1 = x1 - pad, iy1 = y1 - pad;
    if (kind === 'lines') {
      if (R() < 0.5) for (let y = y0 + gap; y < y1 - 4; y += gap) out.push(poly([[x0, y], [x1, y]], false));
      else for (let x = x0 + gap; x < x1 - 4; x += gap) out.push(poly([[x, y0], [x, y1]], false));
    } else if (kind === 'diag' || kind === 'grid') {
      const dirs = kind === 'grid' ? [1, -1] : [R() < 0.5 ? 1 : -1];
      for (const s of dirs) for (let k = -h; k < w + h; k += gap) {
        const seg = clipLine(x0 + k, y0, x0 + k + s * h, y1, rc);
        if (seg) out.push(poly(seg, false));
      }
    } else if (kind === 'circles') {
      const r = gap * 0.38;
      for (let y = y0 + gap / 2; y + r < y1; y += gap) for (let x = x0 + gap / 2; x + r < x1; x += gap) { out.push(circle(x, y, r)); if (d >= 3) out.push(circle(x, y, r * 0.4)); }
    } else if (kind === 'concentric') {
      for (let k = gap * 0.6; k < Math.min(w, h) / 2 - 4; k += gap * 0.6) out.push(poly([[x0 + k, y0 + k], [x1 - k, y0 + k], [x1 - k, y1 - k], [x0 + k, y1 - k]]));
    } else if (kind === 'zigzag') {
      for (let y = y0 + gap; y < y1; y += gap) {
        const pts = [];
        for (let x = x0, up = true; x <= x1 + 0.1; x += gap / 2, up = !up) pts.push([Math.min(x, x1), up ? y - gap / 2 + 2 : y]);
        out.push(poly(pts, false));
      }
    } else if (kind === 'scales') {
      const r = gap / 2;
      for (let y = y0 + r, row = 0; y <= y1; y += r, row++) for (let x = x0 + (row % 2 ? r : 0); x + 2 * r <= x1; x += 2 * r) {
        const pts = [];
        for (let s = 0; s <= 10; s++) pts.push([x + r - r * Math.cos(Math.PI * s / 10), y - r * Math.sin(Math.PI * s / 10)]);
        out.push(poly(pts, false));
      }
    } else {
      const placed = [];
      for (let tries = 0; tries < 300; tries++) {
        const r = R.range(6, gap * 0.9), x = R.range(ix0 + r, ix1 - r), y = R.range(iy0 + r, iy1 - r);
        if (ix1 - ix0 < 2 * r || iy1 - iy0 < 2 * r) continue;
        if (placed.every(p => Math.hypot(p[0] - x, p[1] - y) > p[2] + r + 3)) { placed.push([x, y, r]); out.push(circle(x, y, r)); }
      }
    }
  }
  return out;
}

// ---------- Kaleidoscope ----------
// Shapes are made in one half-slice, then mirrored and turned all the way around.
function kaleidoscope(R, d) {
  const n = R.pick([6, 8, 10, 12]), a = (2 * Math.PI) / n;
  const base = [];
  const want = 3 + d * 2;
  const used = [];
  for (let tries = 0; tries < 400 && base.length < want; tries++) {
    const r = R.range(70, 430), t = R.range(0.15, 0.85) * a / 2;
    const room = Math.min(r * Math.sin(t), r * Math.sin(a / 2 - t) + 18, 470 - r);
    const size = Math.min(room * 1.4, R.range(40, 110 - d * 8));
    if (size < 14) continue;
    const [x, y] = polar(r, t);
    if (!used.every(u => Math.hypot(u[0] - x, u[1] - y) > u[2] + size * 0.7)) continue;
    used.push([x, y, size]);
    const kind = R.pick(['circle', 'leaf', 'diamond', 'drop']);
    const dir = t + R.range(-0.8, 0.8);
    if (kind === 'circle') { base.push(circle(x, y, size * 0.5)); if (d >= 3) base.push(circle(x, y, size * 0.22)); }
    else if (kind === 'leaf') base.push(leaf(x - Math.cos(dir) * size * 0.6, y - Math.sin(dir) * size * 0.6, size * 1.2, dir)[0]);
    else if (kind === 'diamond') base.push(poly([[x + Math.cos(dir) * size * 0.7, y + Math.sin(dir) * size * 0.7], [x - Math.sin(dir) * size * 0.35, y + Math.cos(dir) * size * 0.35],
      [x - Math.cos(dir) * size * 0.7, y - Math.sin(dir) * size * 0.7], [x + Math.sin(dir) * size * 0.35, y - Math.cos(dir) * size * 0.35]]));
    else {
      const pts = [];
      for (let s2 = 0; s2 < 24; s2++) { const u = (s2 / 24) * Math.PI * 2, rr = size * 0.45 * (1 + 0.5 * Math.cos(u)); pts.push([x + Math.cos(dir + u) * rr, y + Math.sin(dir + u) * rr]); }
      base.push(poly(pts));
    }
  }
  const toPolar = ([x, y]) => [Math.hypot(x - C, y - C), Math.atan2(y - C, x - C)];
  const out = [circle(C, C, 485), circle(C, C, 40)];
  for (let i = 1; i <= Math.min(3, d); i++) out.push(circle(C, C, 40 + i * (445 / (Math.min(3, d) + 1))));
  for (let k = 0; k < n; k++) for (const mirror of [1, -1]) {
    const turn = k * a;
    for (const s of base) {
      if (s.t === 'c') { const [r, t] = toPolar([s.x, s.y]); const [x, y] = polar(r, turn + mirror * t); out.push(circle(x, y, s.r)); }
      else out.push(poly(s.pts.map(p => { const [r, t] = toPolar(p); return polar(r, turn + mirror * t); }), s.c));
    }
  }
  for (let k = 0; k < n; k++) out.push(poly([polar(40, k * a + a / 2), polar(485, k * a + a / 2)], false));
  return out;
}

const MAKERS = { mandala, geometric, glass, flowers, zentangle, kaleidoscope };

// type: a PATTERNS key or 'any'. Returns { type, name, seed, difficulty, shapes }.
export function makePattern(type, seed, difficulty) {
  const d = clampDifficulty(difficulty);
  const s = (Number(seed) >>> 0) || 1;
  const R = rng(s);
  const t = MAKERS[type] ? type : Object.keys(MAKERS)[Math.floor(R() * 6)];
  return { type: t, name: PATTERNS[t], seed: s, difficulty: d, shapes: MAKERS[t](R, d), clip: t === 'geometric' ? [M, M, SIZE - M, SIZE - M] : null };
}

// Draws the shapes on a canvas 2D context (black lines on white).
// clip [x0,y0,x1,y1] keeps lines inside the border.
export function drawShapes(ctx, shapes, scale = 1, lineWidth = 3, clip = null) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE * scale, SIZE * scale);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lineWidth * scale;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save();
  if (clip) { ctx.beginPath(); ctx.rect(clip[0] * scale, clip[1] * scale, (clip[2] - clip[0]) * scale, (clip[3] - clip[1]) * scale); ctx.clip(); }
  for (const s of shapes) {
    ctx.beginPath();
    if (s.t === 'c') { ctx.moveTo((s.x + s.r) * scale, s.y * scale); ctx.arc(s.x * scale, s.y * scale, s.r * scale, 0, Math.PI * 2); }
    else {
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
      if (s.c) ctx.closePath();
    }
    ctx.stroke();
  }
  ctx.restore();
  if (clip) { ctx.beginPath(); ctx.rect(clip[0] * scale, clip[1] * scale, (clip[2] - clip[0]) * scale, (clip[3] - clip[1]) * scale); ctx.stroke(); }
}

// The saved-page fields for a pattern page (same shape as AI pages, so My Pages,
// coloring, line weight, PNG/PDF and the Book all work with it).
export function patternRecord(p) {
  return { subject: `${p.name} pattern`, theme: '', difficulty: p.difficulty, seed: p.seed, source: 'offline', pattern: p.type };
}
