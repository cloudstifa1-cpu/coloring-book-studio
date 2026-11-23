import test from 'node:test';
import assert from 'node:assert/strict';
import { makePdf, fitImage, PAGE_SIZES } from '../public/lib/pdf.js';

const jpeg = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1024, height: 1024 };
const text = b => new TextDecoder('latin1').decode(b);

test('square image centered on letter page with margins', () => {
  const f = fitImage(1024, 1024, 612, 792, 36);
  assert.equal(f.w, 540); assert.equal(f.h, 540);
  assert.equal(f.x, 36); assert.equal(f.y, 126);
});

test('pdf has right page count and is complete', () => {
  const s = text(makePdf([jpeg, { blank: true }, jpeg]));
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/Count 3/);
  assert.equal((s.match(/\/Subtype \/Image/g) || []).length, 2);
});

test('xref offsets point at the right objects', () => {
  const bytes = makePdf([jpeg, jpeg]);
  const s = text(bytes);
  const start = Number(s.match(/startxref\n(\d+)/)[1]);
  const rows = s.slice(start).split('\n').slice(2).filter(r => / 00000 n $/.test(r));
  rows.forEach((r, i) => {
    const off = Number(r.slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`);
  });
});

test('page sizes', () => {
  assert.match(text(makePdf([jpeg], { size: '6x9' })), /MediaBox \[0 0 432 648\]/);
  assert.match(text(makePdf([jpeg])), /MediaBox \[0 0 612 792\]/);
  assert.equal(PAGE_SIZES['8x10'].w, 8);
});

test('image bytes are inside the pdf', () => {
  const b = makePdf([jpeg]);
  const s = text(b);
  assert.ok(s.includes('\xff\xd8\xff\xd9'));
});
