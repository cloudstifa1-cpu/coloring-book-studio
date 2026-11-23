import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBook, addPage, removePage, movePage, keepExisting, buildSequence, loadBook, saveBook } from '../public/lib/book.js';

const memStore = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test('add pages without duplicates', () => {
  let b = defaultBook();
  b = addPage(addPage(addPage(b, 'a'), 'b'), 'a');
  assert.deepEqual(b.pageIds, ['a', 'b']);
});

test('move up / down, and not past the ends', () => {
  let b = { ...defaultBook(), pageIds: ['a', 'b', 'c'] };
  b = movePage(b, 'c', -1); assert.deepEqual(b.pageIds, ['a', 'c', 'b']);
  b = movePage(b, 'a', -1); assert.deepEqual(b.pageIds, ['a', 'c', 'b']);
  b = movePage(b, 'b', 1); assert.deepEqual(b.pageIds, ['a', 'c', 'b']);
});

test('remove and clean out deleted pages', () => {
  let b = { ...defaultBook(), pageIds: ['a', 'b', 'c'] };
  assert.deepEqual(removePage(b, 'b').pageIds, ['a', 'c']);
  assert.deepEqual(keepExisting(b, ['c', 'a']).pageIds, ['a', 'c']);
});

test('single-sided puts a blank behind every printed page', () => {
  const b = { ...defaultBook(), pageIds: ['a', 'b'] };
  assert.deepEqual(buildSequence(b).map(p => p.type), ['cover', 'blank', 'title', 'blank', 'design', 'blank', 'design', 'blank']);
});

test('double-sided has no blanks', () => {
  const b = { ...defaultBook(), singleSided: false, pageIds: ['a', 'b'] };
  assert.deepEqual(buildSequence(b).map(p => p.type), ['cover', 'title', 'design', 'design']);
});

test('book saves and loads', () => {
  const s = memStore();
  saveBook({ ...defaultBook(), title: 'Gothic Dreams', pageIds: ['x'] }, s);
  const b = loadBook(s);
  assert.equal(b.title, 'Gothic Dreams');
  assert.deepEqual(b.pageIds, ['x']);
  assert.equal(loadBook(memStore()).title, 'My Coloring Book');
});
