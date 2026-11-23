// Cover maker screen (inside the Book tab): styles, colors, picture, AI picture, AI blurb,
// front cover PNG, and the Amazon KDP wraparound cover PDF (back + spine + front).
import { COVER_STYLES, PAPER, coverLayout, placeImage, fitText, wrapSize, kdpWarnings, kdpPageCount,
  cleanCover, cleanBlurb, blurbRequest, hardToRead, readableOn } from './lib/cover.js';
import { buildSequence } from './lib/book.js';
import { makePdf, PAGE_SIZES } from './lib/pdf.js';
import { saveFile } from './lib/pagetools.js';

const AI_KEY = 'cbs-cover-img';
const FONT = "Georgia, 'Times New Roman', serif";

function loadAiImage() {
  try {
    const d = localStorage.getItem(AI_KEY);
    if (!d) return null;
    const [head, b64] = d.split(',');
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
  } catch { return null; }
}
function saveAiImage(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { try { localStorage.setItem(AI_KEY, fr.result); res(); } catch { rej(new Error('Phone storage is full. Delete some pages and try again.')); } };
    fr.onerror = () => rej(new Error('Could not save the picture.'));
    fr.readAsDataURL(blob);
  });
}

// The picture the cover uses, as a Blob (or null).
export async function coverPicture(book, db, getPage) {
  const c = cleanCover(book.cover);
  if (c.picture === 'ai') { const b = loadAiImage(); if (b) return b; }
  const id = c.picture === 'first' || c.picture === 'ai' ? book.pageIds[0] : c.picture;
  if (!id) return null;
  const p = await getPage(db, id);
  if (!p) return null;
  return c.useColored && p.colored ? p.colored : p.blob;
}

function drawLines(ctx, text, box, color, weight, opts) {
  const measure = (t, px) => { ctx.font = `${weight} ${px}px ${FONT}`; return ctx.measureText(t).width; };
  const { size, lines } = fitText(text, box, measure, opts);
  if (!size) return;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lh = size * 1.15, top = box.y + (box.h - lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, box.x + box.w / 2, top + i * lh));
}

// Draws the front cover. outer = whole panel (with bleed), safe = where words go. px units.
export async function drawFront(ctx, book, picture, outer, safe) {
  const c = cleanCover(book.cover);
  const unit = Math.min(safe.w, safe.h);
  ctx.fillStyle = c.bg; ctx.fillRect(outer.x, outer.y, outer.w, outer.h);
  let box = safe;
  if (c.style === 'classic') {
    ctx.strokeStyle = c.titleColor;
    ctx.lineWidth = unit * 0.012; ctx.strokeRect(safe.x, safe.y, safe.w, safe.h);
    const g = unit * 0.03;
    ctx.lineWidth = unit * 0.005; ctx.strokeRect(safe.x + g, safe.y + g, safe.w - 2 * g, safe.h - 2 * g);
    const pad = unit * 0.07;
    box = { x: safe.x + pad, y: safe.y + pad, w: safe.w - 2 * pad, h: safe.h - 2 * pad };
  }
  const L = coverLayout(c.style, box, outer);
  if (picture) {
    const bmp = await createImageBitmap(picture);
    const r = placeImage(bmp.width, bmp.height, L.picture, L.picture.fit);
    ctx.save();
    ctx.beginPath(); ctx.rect(L.picture.x, L.picture.y, L.picture.w, L.picture.h); ctx.clip();
    ctx.drawImage(bmp, r.x, r.y, r.w, r.h);
    ctx.restore();
    if (L.picture.border) { ctx.strokeStyle = readableOn(c.bg); ctx.lineWidth = unit * 0.012; ctx.strokeRect(r.x, r.y, r.w, r.h); }
    bmp.close();
  }
  const bandColor = c.style === 'full' ? c.bg : c.titleColor;
  const titleColor = c.style === 'banner' ? readableOn(c.titleColor) : c.titleColor;
  if (L.band) { ctx.fillStyle = bandColor; ctx.fillRect(L.band.x, L.band.y, L.band.w, L.band.h); }
  const subtitle = book.subtitle ? ' ' : '';
  const tBox = book.subtitle ? { ...L.title, h: L.title.h * 0.7 } : L.title;
  drawLines(ctx, book.title || 'My Coloring Book', tBox, titleColor, 'bold', { max: unit * 0.16, maxLines: 3 });
  if (subtitle) drawLines(ctx, book.subtitle, { ...L.title, y: L.title.y + L.title.h * 0.7, h: L.title.h * 0.3 }, titleColor, 'normal', { max: unit * 0.06, maxLines: 2 });
  if (book.author) {
    if (L.authorBand) { ctx.fillStyle = c.bg; ctx.fillRect(L.authorBand.x, L.authorBand.y, L.authorBand.w, L.authorBand.h); }
    const aColor = c.style === 'classic' ? c.titleColor : readableOn(c.bg);
    drawLines(ctx, book.author, L.author, aColor, 'normal', { max: unit * 0.06, maxLines: 1 });
  }
}

async function toJpeg(canvas) {
  const b = await new Promise(res => { try { canvas.toBlob(res, 'image/jpeg', 0.92); } catch { res(null); } });
  return b ? new Uint8Array(await b.arrayBuffer()) : null;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; }

// Front cover as a PDF page (used by Make Book PDF). Same 0.5 in margin as before.
export async function coverPage(book, db, getPage, dpi = 200) {
  const ps = PAGE_SIZES[book.size] || PAGE_SIZES.letter;
  const W = ps.w * dpi, H = ps.h * dpi, m = 0.5 * dpi;
  const cv = makeCanvas(W, H);
  await drawFront(cv.getContext('2d'), book, await coverPicture(book, db, getPage),
    { x: 0, y: 0, w: cv.width, h: cv.height }, { x: m, y: m, w: cv.width - 2 * m, h: cv.height - 2 * m });
  const jpeg = await toJpeg(cv);
  const out = { jpeg, width: cv.width, height: cv.height, margin: 0 };
  cv.width = cv.height = 0;
  return out;
}

export async function drawWrap(book, db, getPage, dpi) {
  const c = cleanCover(book.cover);
  const ps = PAGE_SIZES[book.size] || PAGE_SIZES.letter;
  const pages = kdpPageCount(buildSequence(book).length);
  const S = wrapSize(ps, pages, c.paper);
  const k = v => v * dpi;
  const R = b => ({ x: k(b.x), y: k(b.y), w: k(b.w), h: k(b.h) });
  const cv = makeCanvas(k(S.w), k(S.h));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, cv.width, cv.height);
  // front
  await drawFront(ctx, book, await coverPicture(book, db, getPage), R(S.front), R(S.frontSafe));
  // back: blurb, small page previews, barcode space
  const bs = R(S.backSafe), text = readableOn(c.bg);
  drawLines(ctx, book.title || 'My Coloring Book', { ...bs, h: bs.h * 0.1 }, text, 'bold', { max: k(0.4), maxLines: 2 });
  if (c.blurb) drawLines(ctx, c.blurb, { x: bs.x, y: bs.y + bs.h * 0.12, w: bs.w, h: bs.h * 0.38 }, text, 'normal', { max: k(0.3), maxLines: 14 });
  const thumbs = [];
  for (const id of book.pageIds.slice(0, 3)) { const p = await getPage(db, id); if (p && (p.thumb || p.blob)) thumbs.push(p.thumb || p.blob); }
  if (thumbs.length) {
    const gap = k(0.15), tw = Math.min((bs.w - gap * 2) / 3, bs.h * 0.25), ty = bs.y + bs.h * 0.53;
    const startX = bs.x + (bs.w - (tw * thumbs.length + gap * (thumbs.length - 1))) / 2;
    for (let i = 0; i < thumbs.length; i++) {
      const bmp = await createImageBitmap(thumbs[i]);
      const x = startX + i * (tw + gap);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, ty, tw, tw);
      const r = placeImage(bmp.width, bmp.height, { x, y: ty, w: tw, h: tw });
      ctx.drawImage(bmp, r.x, r.y, r.w, r.h); bmp.close();
      ctx.strokeStyle = text; ctx.lineWidth = k(0.02); ctx.strokeRect(x, ty, tw, tw);
    }
  }
  const bc = R(S.barcode);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bc.x, bc.y, bc.w, bc.h);   // KDP puts the barcode here
  // spine words (KDP: 79+ pages only), turned sideways, top to bottom
  if (S.spineText) {
    const sp = R(S.spineBox), pad = k(0.0625);
    ctx.save();
    ctx.translate(sp.x + sp.w / 2, sp.y + sp.h / 2); ctx.rotate(Math.PI / 2);
    const words = [book.title || 'My Coloring Book', book.author].filter(Boolean).join('   ·   ');
    drawLines(ctx, words, { x: -(sp.h / 2 - k(0.5)), y: -(sp.w / 2 - pad), w: sp.h - k(1), h: sp.w - 2 * pad }, text, 'bold', { max: k(0.3), maxLines: 1, min: 6 });
    ctx.restore();
  }
  return { cv, S, pages };
}

export function initCover({ $, db, getPage, getBook, save }) {
  let busy = false;
  let timer = 0;
  const msg = (t, err = false) => { $('cStatus').textContent = t; $('cStatus').classList.toggle('error', err); };
  const cover = () => { const b = getBook(); b.cover = cleanCover(b.cover); return b.cover; };

  // style and paper choices
  $('cStyle').replaceChildren(...Object.entries(COVER_STYLES).map(([v, t]) => new Option(t, v)));
  $('cPaper').replaceChildren(...Object.entries(PAPER).map(([v, p]) => new Option(p.label, v)));

  async function preview() {
    const b = getBook(), c = cover();
    const ps = PAGE_SIZES[b.size] || PAGE_SIZES.letter;
    const cv = $('cPreview'), dpi = 40, m = 0.5 * dpi;
    cv.width = Math.round(ps.w * dpi); cv.height = Math.round(ps.h * dpi);
    try {
      await drawFront(cv.getContext('2d'), b, await coverPicture(b, db, getPage),
        { x: 0, y: 0, w: cv.width, h: cv.height }, { x: m, y: m, w: cv.width - 2 * m, h: cv.height - 2 * m });
    } catch (e) { msg('Preview problem: ' + (e && e.message || e), true); }
    const titleBg = c.style === 'banner' ? null : c.bg;
    $('cContrast').hidden = !(titleBg && hardToRead(c.titleColor, titleBg));
    const pages = kdpPageCount(buildSequence(b).length);
    const S = wrapSize(ps, pages, c.paper);
    $('cWrapInfo').textContent = `KDP wraparound: ${S.w.toFixed(3)} × ${S.h.toFixed(3)} in, spine ${S.spine.toFixed(3)} in (${pages} pages). ` +
      kdpWarnings(buildSequence(b).length).join(' ');
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(preview, 250); };

  async function render(allPages = []) {
    const b = getBook(), c = cover();
    $('cStyle').value = c.style; $('cBg').value = c.bg; $('cTitleColor').value = c.titleColor;
    $('cColored').checked = c.useColored; $('cAiSubject').value = c.aiSubject; $('cBlurb').value = c.blurb; $('cPaper').value = c.paper;
    const byId = new Map(allPages.map(p => [p.id, p]));
    const opts = [new Option('First page of the book', 'first'), new Option(loadAiImage() ? 'AI cover picture' : 'AI cover picture (make one below)', 'ai')];
    b.pageIds.forEach((id, i) => { const p = byId.get(id); if (p) opts.push(new Option(`Page ${i + 1}: ${p.subject}`.slice(0, 60), id)); });
    $('cPicture').replaceChildren(...opts);
    $('cPicture').value = opts.some(o => o.value === c.picture) ? c.picture : 'first';
    later();
  }

  const set = (key, val) => { cover()[key] = val; save(); later(); };
  $('cStyle').onchange = e => set('style', e.target.value);
  $('cBg').oninput = e => set('bg', e.target.value);
  $('cTitleColor').oninput = e => set('titleColor', e.target.value);
  $('cPicture').onchange = e => set('picture', e.target.value);
  $('cColored').onchange = e => set('useColored', e.target.checked);
  $('cAiSubject').oninput = e => { cover().aiSubject = e.target.value; save(); };
  $('cBlurb').oninput = e => { cover().blurb = e.target.value; save(); };
  $('cPaper').onchange = e => set('paper', e.target.value);
  $('cSwap').onclick = () => { const c = cover(); [c.bg, c.titleColor] = [c.titleColor, c.bg]; save(); render(); };

  async function run(btn, fn) {
    if (busy) return;
    busy = true; btn.disabled = true;
    try { await fn(); } catch (e) { msg(e && e.message || String(e), true); }
    finally { busy = false; btn.disabled = false; }
  }

  $('cMakeAi').onclick = () => run($('cMakeAi'), async () => {
    const b = getBook();
    const subject = cover().aiSubject.trim() || [b.title, b.subtitle].filter(Boolean).join(', ');
    if (!subject) throw new Error('Type what the cover picture should show.');
    msg('Drawing a full-color cover picture… about 5–20 seconds. (Uses 1 of today\'s free pages.)');
    const r = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, cover: true }) })
      .catch(() => { throw new Error('No connection to the drawing AI. Check your internet and try again.'); });
    if (!r.ok) { let m = 'The drawing AI had a problem. Try again.'; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
    await saveAiImage(await r.blob());
    set('picture', 'ai');
    await render(await listAll());
    msg(r.headers.get('x-source') === 'pollinations' ? 'Cover picture ready (made by the backup AI).' : 'Cover picture ready.');
  });

  $('cBlurbAi').onclick = () => run($('cBlurbAi'), async () => {
    msg('The AI Helper is writing your back cover…');
    const r = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: blurbRequest(getBook()) }] }) })
      .catch(() => { throw new Error('No connection. Try again.'); });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.reply) throw new Error(data.error || 'The helper did not answer. Try again.');
    const text = cleanBlurb(data.reply);
    cover().blurb = text; $('cBlurb').value = text; save();
    msg('Back cover words ready. Change them any way you like.');
  });

  const fileName = () => (getBook().title || 'coloring-book').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'coloring-book';

  $('cPng').onclick = () => run($('cPng'), async () => {
    const b = getBook();
    const ps = PAGE_SIZES[b.size] || PAGE_SIZES.letter, dpi = 200;
    const cv = makeCanvas(ps.w * dpi, ps.h * dpi), m = 0.5 * dpi;
    msg('Making the cover picture…');
    await drawFront(cv.getContext('2d'), b, await coverPicture(b, db, getPage),
      { x: 0, y: 0, w: cv.width, h: cv.height }, { x: m, y: m, w: cv.width - 2 * m, h: cv.height - 2 * m });
    const png = await new Promise(res => cv.toBlob(res, 'image/png'));
    cv.width = cv.height = 0;
    if (!png) throw new Error('Could not make the picture. Try again.');
    saveFile(png, fileName() + '-cover.png');
    msg('Cover PNG download started.');
  });

  $('cWrap').onclick = () => run($('cWrap'), async () => {
    const b = getBook();
    if (!b.pageIds.length) throw new Error('Add some pages first.');
    msg('Making the KDP wraparound cover (300 DPI)…');
    let { cv, S, pages } = await drawWrap(b, db, getPage, 300);
    let jpeg = await toJpeg(cv), dpiUsed = 300;
    if (!jpeg) {   // phone ran out of memory: try smaller
      cv.width = cv.height = 0;
      msg('Too big for this phone at 300 DPI, trying 200 DPI…');
      ({ cv, S, pages } = await drawWrap(b, db, getPage, 200));
      jpeg = await toJpeg(cv); dpiUsed = 200;
    }
    const w = cv.width, h = cv.height;
    cv.width = cv.height = 0;
    if (!jpeg) throw new Error('This phone does not have enough memory for the full cover. Try 6 × 9 size.');
    const pdf = new Blob([makePdf([{ jpeg, width: w, height: h, margin: 0 }], { pageSize: { w: S.w, h: S.h } })], { type: 'application/pdf' });
    saveFile(pdf, fileName() + '-kdp-cover.pdf');
    msg(`KDP cover ready: ${S.w.toFixed(3)} × ${S.h.toFixed(3)} in, ${pages} pages, ${dpiUsed} DPI. Download started.` +
      (dpiUsed < 300 ? ' (KDP likes 300 DPI; it may warn you.)' : ''));
  });

  let listAll = async () => [];
  return { render, preview, setLister(fn) { listAll = fn; } };
}
