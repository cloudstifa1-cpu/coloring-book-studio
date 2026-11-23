// Book builder screen: pick pages, order them, make one PDF.
import { addPage, removePage, movePage, keepExisting, buildSequence, loadBook, saveBook } from './lib/book.js';
import { makePdf, PAGE_SIZES } from './lib/pdf.js';
import { pdfImage, saveFile } from './lib/pagetools.js';

const DPI = 200; // cover and title page resolution

function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function textPage(book, kind, featured) {
  const ps = PAGE_SIZES[book.size] || PAGE_SIZES.letter;
  const W = Math.round(ps.w * DPI), H = Math.round(ps.h * DPI);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.textAlign = 'center';
  const m = 0.5 * DPI;
  ctx.lineWidth = 8; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.lineWidth = 3; ctx.strokeRect(m + 18, m + 18, W - 2 * m - 36, H - 2 * m - 36);
  const maxW = W - 2 * m - 120;
  let y;

  const drawLines = (text, px, weight, gapAfter) => {
    ctx.font = `${weight} ${px}px Georgia, 'Times New Roman', serif`;
    for (const l of wrapText(ctx, text, maxW)) { ctx.fillText(l, W / 2, y); y += px * 1.2; }
    y += gapAfter;
  };

  if (kind === 'cover') {
    y = m + 0.9 * DPI;
    drawLines(book.title || 'My Coloring Book', 0.55 * DPI, 'bold', 10);
    if (book.subtitle) drawLines(book.subtitle, 0.26 * DPI, 'normal', 0);
    if (featured) {
      const bmp = await createImageBitmap(featured);
      const top = y + 0.2 * DPI, bottom = H - m - 1.0 * DPI;
      const size = Math.min(bottom - top, W - 2 * m - 1.0 * DPI);
      ctx.drawImage(bmp, (W - size) / 2, top, size, size);
      bmp.close();
    }
    if (book.author) { y = H - m - 0.45 * DPI; drawLines(book.author, 0.26 * DPI, 'normal', 0); }
  } else {
    y = H * 0.35;
    drawLines(book.title || 'My Coloring Book', 0.45 * DPI, 'bold', 20);
    if (book.subtitle) drawLines(book.subtitle, 0.24 * DPI, 'normal', 20);
    if (book.author) drawLines('by ' + book.author, 0.22 * DPI, 'italic', 0);
    y = H * 0.75;
    drawLines('This book belongs to:', 0.2 * DPI, 'normal', 30);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W * 0.25, y); ctx.lineTo(W * 0.75, y); ctx.stroke();
  }

  const jpg = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  c.width = c.height = 0;
  return { jpeg: new Uint8Array(await jpg.arrayBuffer()), width: W, height: H, margin: 0 };
}

// Colored pages keep their colors (no black/white sharpening).
async function colorImage(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width * 2; c.height = bmp.height * 2;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const jpg = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
  const out = { jpeg: new Uint8Array(await jpg.arrayBuffer()), width: c.width, height: c.height };
  c.width = c.height = 0;
  return out;
}

export function initBook({ $, db, listPages, getPage }) {
  let book = loadBook();
  let busy = false;
  const urls = [];

  const fields = { bTitle: 'title', bSubtitle: 'subtitle', bAuthor: 'author' };
  const checks = { bSingle: 'singleSided', bFrame: 'frame', bColored: 'useColored' };

  function save() { saveBook(book); }

  function msg(t, err = false) { $('bStatus').textContent = t; $('bStatus').classList.toggle('error', err); }

  async function render() {
    const all = await listPages(db);
    book = keepExisting(book, all.map(p => p.id));
    save();
    for (const [id, key] of Object.entries(fields)) $(id).value = book[key];
    for (const [id, key] of Object.entries(checks)) $(id).checked = !!book[key];
    $('bSize').value = book.size;

    urls.forEach(u => URL.revokeObjectURL(u)); urls.length = 0;
    const byId = new Map(all.map(p => [p.id, p]));
    const list = $('bList'); list.replaceChildren();
    book.pageIds.forEach((id, i) => {
      const p = byId.get(id);
      const row = document.createElement('div'); row.className = 'brow';
      const img = document.createElement('img');
      if (p.thumb) { const u = URL.createObjectURL(p.thumb); urls.push(u); img.src = u; }
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = `${i + 1}. ${p.subject}`;
      const mk = (text, fn, cls = '') => { const b = document.createElement('button'); b.textContent = text; b.className = cls; b.onclick = fn; return b; };
      const btns = document.createElement('div'); btns.className = 'bbtns';
      btns.append(
        mk('▲ Up', () => { book = movePage(book, id, -1); save(); render(); }),
        mk('▼ Down', () => { book = movePage(book, id, 1); save(); render(); }),
        mk('Remove', () => { book = removePage(book, id); save(); render(); }, 'danger'),
      );
      row.append(img, label, btns);
      list.appendChild(row);
    });
    $('bEmpty').hidden = book.pageIds.length > 0;
    const total = buildSequence(book).length;
    $('bCount').textContent = `${book.pageIds.length} designs → ${total} PDF pages (with cover and title page)`;
  }

  for (const [id, key] of Object.entries(fields)) $(id).oninput = e => { book[key] = e.target.value; save(); };
  for (const [id, key] of Object.entries(checks)) $(id).onchange = e => { book[key] = e.target.checked; save(); render(); };
  $('bSize').onchange = e => { book.size = e.target.value; save(); };

  $('bExport').onclick = async () => {
    if (busy) return;
    if (!book.pageIds.length) { msg('Add some pages first.', true); return; }
    busy = true; $('bExport').disabled = true;
    try {
      const seq = buildSequence(book);
      const first = await getPage(db, book.pageIds[0]);
      const pages = [];
      for (let i = 0; i < seq.length; i++) {
        const s = seq[i];
        msg(`Building page ${i + 1} of ${seq.length}…`);
        if (s.type === 'blank') pages.push({ blank: true });
        else if (s.type === 'cover') pages.push(await textPage(book, 'cover', first && first.blob));
        else if (s.type === 'title') pages.push(await textPage(book, 'title'));
        else {
          const p = await getPage(db, s.id);
          const imgData = book.useColored && p.colored ? await colorImage(p.colored) : await pdfImage(p.blob);
          pages.push({ ...imgData, frame: book.frame });
        }
      }
      msg('Putting the PDF together…');
      const pdf = new Blob([makePdf(pages, { size: book.size })], { type: 'application/pdf' });
      const name = (book.title || 'coloring-book').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'coloring-book';
      saveFile(pdf, name + '.pdf');
      msg(`Done! ${seq.length} pages. Download started.`);
    } catch (e) {
      msg('Could not build the book: ' + (e && e.message || e), true);
    } finally {
      busy = false; $('bExport').disabled = false;
    }
  };

  return {
    render,
    add(id) { book = addPage(loadBook(), id); save(); return book.pageIds.length; },
    has(id) { return loadBook().pageIds.includes(id); },
  };
}
