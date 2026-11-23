import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToColor, floodRegion, fillArea, applyFill, compose, History, addRecent, WHITE, BLACK, PALETTE } from '../public/lib/color.js';

const grid = rows => ({ w: rows[0].length, h: rows.length, lines: Uint8Array.from(rows.join('').split('').map(c => c === '#' ? 1 : 0)) });

test('hex colors pack correctly', () => {
  const c = hexToColor('#ff8000');
  const bytes = new Uint8Array(new Uint32Array([c]).buffer);
  assert.deepEqual([...bytes], [255, 128, 0, 255]);
  assert.equal(hexToColor('junk'), WHITE);
});

test('fill stays inside a closed shape', () => {
  const g = grid(['#####...', '#...#...', '#...#...', '#####...']);
  const r = floodRegion(g.lines, g.w, g.h, 2, 1);
  assert.equal(r.length, 6);
});

test('tapping a line fills nothing', () => {
  const g = grid(['###', '#.#', '###']);
  assert.equal(fillArea(g.lines, 3, 3, 0, 0), null);
});

test('fill does not slip through diagonal corners', () => {
  const g = grid(['.#.', '#..', '...']);
  const r = floodRegion(g.lines, 3, 3, 0, 0);
  assert.equal(r.length, 1);
});

test('leak guard stops color escaping through a 1-pixel gap', () => {
  const rows = ['############', '#....#.....#', '#....#.....#', '#..........#', '#....#.....#', '#....#.....#', '############'];
  // gap in the middle wall at row 3
  const g = grid(rows);
  const noGuard = fillArea(g.lines, g.w, g.h, 2, 2, 0);
  const guard = fillArea(g.lines, g.w, g.h, 2, 2, 1);
  assert.ok(noGuard.length > guard.length, 'guard should keep color on one side');
  // left room is 4 wide x 5 tall = 20 pixels; guarded fill covers the left room (and at most the gap pixel)
  assert.ok(guard.length >= 20 && guard.length <= 21, `got ${guard.length}`);
});

test('leak guard still colors right up to the lines', () => {
  const g = grid(['#######', '#.....#', '#.....#', '#.....#', '#######']);
  assert.equal(fillArea(g.lines, g.w, g.h, 3, 2, 1).length, 15);
  assert.equal(fillArea(g.lines, g.w, g.h, 3, 2, 2).length, 15);
});

test('tapping right beside a line still works', () => {
  const g = grid(['#####', '#...#', '#####']);
  assert.equal(fillArea(g.lines, 5, 3, 1, 1, 1).length, 3);
});

test('undo and redo', () => {
  const fill = new Uint32Array(4).fill(WHITE);
  const h = new History();
  const red = hexToColor('#ff0000');
  h.push(applyFill(fill, Int32Array.from([0, 1]), red));
  assert.equal(fill[0], red);
  assert.ok(h.undo(fill)); assert.equal(fill[0], WHITE);
  assert.ok(h.redo(fill)); assert.equal(fill[1], red);
  assert.ok(!h.canRedo);
  h.undo(fill); h.push(applyFill(fill, Int32Array.from([3]), red));
  assert.ok(!h.canRedo, 'new color clears redo');
});

test('undo history has a limit (protects phone memory)', () => {
  const fill = new Uint32Array(2).fill(WHITE);
  const h = new History(3);
  for (let i = 0; i < 10; i++) h.push(applyFill(fill, Int32Array.from([0]), i));
  assert.equal(h.done.length, 3);
});

test('lines always draw on top of colors', () => {
  const lines = Uint8Array.from([1, 0]);
  const fill = Uint32Array.from([123, 456]);
  assert.deepEqual([...compose(lines, fill)], [BLACK, 456]);
});

test('recent colors: newest first, no repeats, max 8', () => {
  let r = [];
  for (const c of ['#111111', '#222222', '#111111']) r = addRecent(r, c);
  assert.deepEqual(r, ['#111111', '#222222']);
  for (let i = 0; i < 20; i++) r = addRecent(r, '#0000' + String(i).padStart(2, '0'));
  assert.equal(r.length, 8);
});

test('palette colors are all valid', () => {
  assert.ok(PALETTE.length >= 24);
  for (const c of PALETTE) assert.match(c, /^#[0-9a-f]{6}$/);
});
