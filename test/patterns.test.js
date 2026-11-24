import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, SIZE, rng, makePattern, drawShapes, voronoi, clipLine, patternRecord } from '../public/lib/patterns.js';

const types = Object.keys(PATTERNS);
const allPoints = p => p.shapes.flatMap(s => (s.t === 'c' ? [[s.x - s.r, s.y - s.r], [s.x + s.r, s.y + s.r]] : s.pts));

test('six pattern types', () => {
  assert.deepEqual(types, ['mandala', 'geometric', 'glass', 'flowers', 'zentangle', 'kaleidoscope']);
});

test('seeded random: same seed, same numbers; ranges stay in bounds', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const x = [a(), a(), a()];
  assert.deepEqual(x, [b(), b(), b()]);
  assert.notDeepEqual(x, [c(), c(), c()]);
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
    const f = r.range(10, 20); assert.ok(f >= 10 && f < 20);
  }
});

test('every type makes a page, same seed gives the same page', () => {
  for (const t of types) {
    for (const d of [1, 3, 5]) {
      const p = makePattern(t, 1234, d);
      assert.equal(p.type, t);
      assert.equal(p.difficulty, d);
      assert.ok(p.shapes.length >= 10, `${t} ${d} has ${p.shapes.length}`);
      assert.deepEqual(makePattern(t, 1234, d), p);
      assert.notDeepEqual(makePattern(t, 999, d).shapes, p.shapes);
      for (const s of p.shapes) {
        if (s.t === 'c') assert.ok(s.r > 0 && Number.isFinite(s.x + s.y + s.r));
        else { assert.ok(s.pts.length >= 2); for (const [x, y] of s.pts) assert.ok(Number.isFinite(x + y)); }
      }
    }
  }
});

test('higher difficulty means more detail', () => {
  for (const t of types) {
    let lo = 0, hi = 0;
    for (let seed = 1; seed <= 5; seed++) { lo += makePattern(t, seed, 1).shapes.length; hi += makePattern(t, seed, 5).shapes.length; }
    assert.ok(hi > lo, `${t}: ${lo} vs ${hi}`);
  }
});

test('patterns stay on the page (geometric is clipped to the border)', () => {
  for (const t of types) for (let seed = 1; seed <= 4; seed++) {
    const p = makePattern(t, seed, 4);
    if (p.clip) { assert.equal(t, 'geometric'); assert.deepEqual(p.clip, [28, 28, SIZE - 28, SIZE - 28]); continue; }
    for (const [x, y] of allPoints(p)) assert.ok(x >= -1 && y >= -1 && x <= SIZE + 1 && y <= SIZE + 1, `${t} point ${x},${y}`);
  }
});

test('any picks a real type; bad difficulty is clamped', () => {
  const p = makePattern('any', 55, 99);
  assert.ok(types.includes(p.type));
  assert.equal(p.difficulty, 5);
  assert.equal(makePattern('nope', 55, 0).difficulty, 1);
  assert.ok(makePattern('mandala', 0, 3).seed >= 1);
});

test('voronoi cells fill the box', () => {
  const box = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const cells = voronoi([[25, 50], [75, 50]], box);
  assert.equal(cells.length, 2);
  const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  assert.ok(Math.abs(area(cells[0]) - 5000) < 1e-6);
  assert.ok(Math.abs(area(cells[0]) + area(cells[1]) - 10000) < 1e-6);
});

test('clipLine cuts lines to a rectangle', () => {
  assert.deepEqual(clipLine(-10, 5, 20, 5, [0, 0, 10, 10]), [[0, 5], [10, 5]]);
  assert.equal(clipLine(-10, -5, 20, -5, [0, 0, 10, 10]), null);
  assert.deepEqual(clipLine(2, 2, 8, 8, [0, 0, 10, 10]), [[2, 2], [8, 8]]);
});

test('drawShapes draws on white with black lines, and clips when asked', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])), set: (o, k, v) => { o[k] = v; return true; } });
  const p = makePattern('geometric', 3, 2);
  drawShapes(ctx, p.shapes, 0.5, 3, p.clip);
  assert.equal(ctx.strokeStyle, '#000000');
  assert.equal(ctx.lineWidth, 1.5);
  assert.deepEqual(calls[0], ['fillRect', 0, 0, SIZE / 2, SIZE / 2]);
  assert.ok(calls.some(c => c[0] === 'clip'));
  assert.equal(calls.filter(c => c[0] === 'stroke').length, p.shapes.length + 1); // + border
});

test('pattern page record works like AI pages', () => {
  const r = patternRecord(makePattern('mandala', 77, 3));
  assert.deepEqual(r, { subject: 'Mandala pattern', theme: '', difficulty: 3, seed: 77, source: 'offline', pattern: 'mandala' });
});
