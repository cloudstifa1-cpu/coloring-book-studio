import test from 'node:test';
import assert from 'node:assert/strict';
import { COVER_STYLES, PAPER, BLEED, SAFE, defaultCover, cleanCover, cleanHex, contrastRatio, readableOn, hardToRead,
  coverLayout, placeImage, fitText, spineWidth, wrapSize, kdpWarnings, kdpPageCount,
  buildCoverPrompt, blurbRequest, cleanBlurb, MAX_BLURB } from '../public/lib/cover.js';
import { defaultBook, loadBook, saveBook } from '../public/lib/book.js';
import { makePdf } from '../public/lib/pdf.js';
import { handleApi } from '../src/worker.js';
import { BASE_STYLE } from '../public/lib/core.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const memStore = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };

test('cleanCover fixes bad or missing settings', () => {
  assert.deepEqual(cleanCover(null), defaultCover());
  const c = cleanCover({ style: 'nope', bg: 'red', titleColor: '#ABCDEF', paper: 'gold', blurb: 'x'.repeat(2000), useColored: false });
  assert.equal(c.style, 'classic');
  assert.equal(c.bg, '#ffffff');
  assert.equal(c.titleColor, '#abcdef');
  assert.equal(c.paper, 'white');
  assert.equal(c.blurb.length, MAX_BLURB);
  assert.equal(c.useColored, false);
  assert.equal(cleanHex('#12345', '#000000'), '#000000');
});

test('old saved books get default cover settings; new ones keep theirs', () => {
  const s = memStore();
  s.setItem('cbs-book', JSON.stringify({ title: 'Old', pageIds: ['a'] }));
  assert.deepEqual(loadBook(s).cover, defaultCover());
  const b = { ...defaultBook(), cover: { ...defaultCover(), style: 'full', bg: '#112233' } };
  saveBook(b, s);
  const back = loadBook(s);
  assert.equal(back.cover.style, 'full');
  assert.equal(back.cover.bg, '#112233');
  assert.deepEqual(defaultBook().cover, defaultCover());
});

test('contrast: black on white is 21, readable color picks the right one', () => {
  close(contrastRatio('#000000', '#ffffff'), 21, 0.01);
  close(contrastRatio('#ffffff', '#ffffff'), 1, 0.001);
  assert.equal(readableOn('#ffffff'), '#000000');
  assert.equal(readableOn('#1a1a2e'), '#ffffff');
  assert.equal(hardToRead('#ffff00', '#ffffff'), true);
  assert.equal(hardToRead('#000000', '#ffd84d'), false);
});

test('every style keeps the title and author inside the safe box', () => {
  const box = { x: 50, y: 50, w: 800, h: 1000 }, outer = { x: 0, y: 0, w: 900, h: 1100 };
  for (const style of Object.keys(COVER_STYLES)) {
    const L = coverLayout(style, box, outer);
    for (const k of ['title', 'author']) {
      const r = L[k];
      assert.ok(r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w + 1e-9 && r.y + r.h <= box.y + box.h + 1e-9, `${style} ${k}`);
    }
    assert.ok(L.picture.w > 0 && L.picture.h > 0, style);
  }
  assert.equal(coverLayout('classic', box).frame, true);
  assert.deepEqual(coverLayout('full', box, outer).picture, { ...outer, fit: 'cover' });
  // banner picture sits below the title bar
  const B = coverLayout('banner', box, outer);
  assert.ok(B.picture.y >= B.band.y + B.band.h);
});

test('placeImage: contain shows all, cover fills the box', () => {
  const box = { x: 0, y: 0, w: 100, h: 200 };
  assert.deepEqual(placeImage(100, 100, box, 'contain'), { x: 0, y: 50, w: 100, h: 100 });
  assert.deepEqual(placeImage(100, 100, box, 'cover'), { x: -50, y: 0, w: 200, h: 200 });
});

test('fitText shrinks until the words fit the box', () => {
  const measure = (t, px) => t.length * px * 0.5;
  const box = { x: 0, y: 0, w: 300, h: 100 };
  const r = fitText('Enchanted Forest Animals', box, measure, { max: 100 });
  assert.ok(r.size > 0 && r.size < 100);
  for (const l of r.lines) assert.ok(measure(l, r.size) <= box.w);
  assert.ok(r.lines.length * r.size * 1.15 <= box.h);
  assert.deepEqual(fitText('', box, measure), { size: 0, lines: [] });
});

test('spine width uses KDP numbers per page', () => {
  close(spineWidth(100, 'white'), 0.2252);
  close(spineWidth(100, 'cream'), 0.25);
  close(spineWidth(100, 'color'), 0.2347);
  assert.equal(spineWidth(-5), 0);
  assert.equal(Object.keys(PAPER).length, 3);
});

test('wraparound size: back + spine + front + bleed, barcode on the back', () => {
  const S = wrapSize({ w: 8.5, h: 11 }, 100, 'white');
  close(S.w, 8.5 * 2 + 0.2252 + BLEED * 2);
  close(S.h, 11 + BLEED * 2);
  close(S.front.x + S.front.w, S.w);
  close(S.spineBox.x, BLEED + 8.5);
  assert.ok(S.barcode.x + S.barcode.w <= S.back.w - SAFE + 1e-9);
  assert.ok(S.barcode.x >= S.backSafe.x);
  assert.equal(S.spineText, true);
  assert.equal(wrapSize({ w: 6, h: 9 }, 50).spineText, false);
  close(S.frontSafe.x, BLEED + 8.5 + 0.2252 + SAFE);
});

test('KDP warnings and even page count', () => {
  assert.equal(kdpWarnings(10).length, 2);           // too few + no spine words
  assert.ok(kdpWarnings(25).some(w => /odd/.test(w)));
  assert.deepEqual(kdpWarnings(100), []);
  assert.equal(kdpPageCount(25), 26);
  assert.equal(kdpPageCount(24), 24);
});

test('cover prompt asks for full color with no words', () => {
  const p = buildCoverPrompt('a fox in a garden');
  assert.match(p, /^a fox in a garden\./);
  assert.match(p, /full color/);
  assert.match(p, /no text/);
  assert.throws(() => buildCoverPrompt('  '), /cover picture/);
});

test('blurb request and cleanup', () => {
  const q = blurbRequest({ title: 'Mandala Dreams', subtitle: 'Calm', pageIds: ['a', 'b'] });
  assert.match(q, /Mandala Dreams/); assert.match(q, /Calm/); assert.match(q, /2 designs/);
  assert.equal(cleanBlurb('"**Relax** and color.\nIDEA: an owl\nFifty pages."'), 'Relax and color. Fifty pages.');
});

test('makePdf can use a custom page size (KDP cover sheet)', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = new TextDecoder('latin1').decode(makePdf([{ jpeg, width: 10, height: 5, margin: 0 }], { pageSize: { w: 17.5, h: 11.25 } }));
  assert.match(pdf, /\/MediaBox \[0 0 1260 810\]/);
  const normal = new TextDecoder('latin1').decode(makePdf([{ blank: true }]));
  assert.match(normal, /\/MediaBox \[0 0 612 792\]/);
});

test('worker: cover: true makes a full-color prompt, normal pages unchanged', async () => {
  const calls = [];
  const AI = { run: async (m, input) => { calls.push(input); return { image: Buffer.from([0xff, 0xd8]).toString('base64') }; } };
  const req = body => new Request('https://x/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const r = await handleApi(req({ subject: 'a fox', cover: true }), { AI });
  assert.equal(r.status, 200);
  assert.match(calls[0].prompt, /full color/);
  assert.ok(!calls[0].prompt.includes(BASE_STYLE));
  await handleApi(req({ subject: 'a fox', difficulty: 2 }), { AI });
  assert.ok(calls[1].prompt.includes(BASE_STYLE));
  const bad = await handleApi(req({ subject: '', cover: true }), { AI });
  assert.equal(bad.status, 400);
});
