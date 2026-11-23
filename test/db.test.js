import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, savePage, getPage, deletePage, listPages, filterPages, makeId } from '../public/lib/db.js';

const page = (over = {}) => ({ id: makeId(), created: Date.now(), subject: 'an owl', theme: 'animals', difficulty: 3, seed: 1, favorite: false, blob: 'IMG', thumb: 'T', ...over });

test('save, get, delete a page', async () => {
  const db = await openDB(new IDBFactory());
  const p = page();
  await savePage(db, p);
  assert.equal((await getPage(db, p.id)).subject, 'an owl');
  await deletePage(db, p.id);
  assert.equal(await getPage(db, p.id), undefined);
});

test('list is newest first and leaves out full images', async () => {
  const db = await openDB(new IDBFactory());
  await savePage(db, page({ id: 'a', created: 1 }));
  await savePage(db, page({ id: 'b', created: 3 }));
  await savePage(db, page({ id: 'c', created: 2 }));
  const list = await listPages(db);
  assert.deepEqual(list.map(p => p.id), ['b', 'c', 'a']);
  assert.equal(list[0].blob, undefined);
  assert.equal(list[0].thumb, 'T');
  assert.equal((await listPages(db, { withBlob: true }))[0].blob, 'IMG');
});

test('favorite toggle saves', async () => {
  const db = await openDB(new IDBFactory());
  const p = page();
  await savePage(db, p);
  p.favorite = true;
  await savePage(db, p);
  assert.equal((await getPage(db, p.id)).favorite, true);
});

test('filter by theme, favorites, and search words', () => {
  const pages = [
    page({ id: '1', theme: 'gothic', subject: 'raven on a gate', favorite: true }),
    page({ id: '2', theme: 'animals', subject: 'fox in meadow' }),
    page({ id: '3', theme: 'gothic', subject: 'cemetery' }),
  ];
  assert.deepEqual(filterPages(pages, { theme: 'gothic' }).map(p => p.id), ['1', '3']);
  assert.deepEqual(filterPages(pages, { favoritesOnly: true }).map(p => p.id), ['1']);
  assert.deepEqual(filterPages(pages, { text: 'FOX' }).map(p => p.id), ['2']);
  assert.equal(filterPages(pages).length, 3);
});

test('ids are unique', () => {
  const s = new Set(Array.from({ length: 500 }, makeId));
  assert.equal(s.size, 500);
});
