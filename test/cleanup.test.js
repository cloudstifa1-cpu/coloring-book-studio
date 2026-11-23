import test from 'node:test';
import assert from 'node:assert/strict';
import { toBinary, toRGBA, removeSpecks, dilate, erode, closeGaps, adjustThickness, cleanPixels } from '../public/lib/cleanup.js';

const grid = rows => ({ w: rows[0].length, h: rows.length, bin: Uint8Array.from(rows.join('').split('').map(c => c === '#' ? 1 : 0)) });
const show = (bin, w) => Array.from({ length: bin.length / w }, (_, y) => Array.from(bin.slice(y * w, y * w + w), v => v ? '#' : '.').join(''));
const rgba = vals => Uint8ClampedArray.from(vals.flatMap(v => [v, v, v, 255]));

test('gray turns pure black or white', () => {
  const b = toBinary(rgba([0, 100, 169, 171, 255]), 5, 1, 170);
  assert.deepEqual([...b], [1, 1, 1, 0, 0]);
});

test('see-through pixels count as white paper', () => {
  const b = toBinary(Uint8ClampedArray.from([0, 0, 0, 0]), 1, 1);
  assert.deepEqual([...b], [0]);
});

test('output is only pure black or white', () => {
  const out = toRGBA(Uint8Array.from([1, 0]));
  assert.deepEqual([...out], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('small specks removed, real lines kept', () => {
  const g = grid(['#.......', '........', '.#####..', '........']);
  assert.deepEqual(show(removeSpecks(g.bin, g.w, g.h, 3), g.w), ['........', '........', '.#####..', '........']);
});

test('diagonal pixels count as one line', () => {
  const g = grid(['#...', '.#..', '..#.', '...#']);
  assert.deepEqual([...removeSpecks(g.bin, g.w, g.h, 4)], [...g.bin]);
});

test('1-pixel gap in a line gets closed', () => {
  const g = grid(['.......', '.##.##.', '.......']);
  assert.equal(show(closeGaps(g.bin, g.w, g.h), g.w)[1], '.#####.');
});

test('thicker and thinner lines', () => {
  const g = grid(['.....', '.....', '..#..', '.....', '.....']);
  assert.equal(adjustThickness(g.bin, 5, 5, 1).reduce((a, b) => a + b), 9);
  assert.equal(adjustThickness(g.bin, 5, 5, 2).reduce((a, b) => a + b), 25);
  const t = grid(['###', '###', '###']);
  assert.equal(adjustThickness(t.bin, 3, 3, -1).reduce((a, b) => a + b), 1);
  assert.deepEqual([...adjustThickness(g.bin, 5, 5, 0)], [...g.bin]);
});

test('dilate then erode keeps a solid block the same', () => {
  const g = grid(['......', '.###..', '.###..', '......']);
  assert.deepEqual([...erode(dilate(g.bin, 6, 4), 6, 4)], [...g.bin]);
});

test('full cleanup gives pure black/white with no specks', () => {
  const w = 20, h = 20, vals = new Array(w * h).fill(255);
  for (let x = 2; x < 18; x++) vals[10 * w + x] = 60;   // line
  vals[2 * w + 2] = 0;                                   // speck
  vals[5 * w + 5] = 200;                                 // light gray
  const out = cleanPixels(rgba(vals), w, h);
  for (let i = 0; i < out.length; i += 4) assert.ok(out[i] === 0 || out[i] === 255);
  assert.equal(out[(2 * w + 2) * 4], 255);
  assert.equal(out[(10 * w + 10) * 4], 0);
});

test('default cleanup keeps two close lines apart (no blobs)', () => {
  const w = 9, h = 5, vals = new Array(w * h).fill(255);
  for (let y = 0; y < h; y++) { vals[y * w + 3] = 0; vals[y * w + 5] = 0; }
  const out = cleanPixels(rgba(vals), w, h);
  assert.equal(out[(2 * w + 4) * 4], 255);
});
