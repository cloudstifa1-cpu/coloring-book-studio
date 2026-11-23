// Coloring screen: tap an area to fill it. One finger only (tap, scroll, buttons).
import { fillArea, applyFill, compose, History, hexToColor, addRecent, PALETTE, WHITE } from './lib/color.js';
import { toBinary } from './lib/cleanup.js';

const ZOOMS = [1, 1.5, 2, 3, 4];

export function initColorer({ $, db, savePage, saveFile, onClose }) {
  let page = null, w = 0, h = 0, lines = null, fill = null, out = null, img = null, ctx = null;
  let history = new History(40);
  let colorHex = '#e53935';
  let zoomI = 0;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('cbs-recent') || '[]'); } catch {}
  let gap = 1;
  try { gap = Number(localStorage.getItem('cbs-gap') ?? 1); } catch {}
  $('cGap').value = String(gap);

  const canvas = $('cCanvas');

  function setMsg(t, err = false) { $('cMsg').textContent = t; $('cMsg').classList.toggle('error', err); }

  function swatch(hex, box) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.setAttribute('aria-label', 'Color ' + hex);
    b.dataset.hex = hex;
    b.onclick = () => pick(hex);
    box.appendChild(b);
  }

  function markPicked() {
    for (const b of document.querySelectorAll('.swatch')) b.classList.toggle('picked', b.dataset.hex === colorHex);
    $('cCurrent').style.background = colorHex;
  }

  function pick(hex) { colorHex = hex.toLowerCase(); $('cCustom').value = colorHex; markPicked(); }

  function drawRecent() {
    const box = $('cRecent'); box.replaceChildren();
    for (const hex of recent) swatch(hex, box);
    $('cRecentLabel').hidden = !recent.length;
    markPicked();
  }

  for (const hex of PALETTE) swatch(hex, $('cPalette'));

  function render() {
    compose(lines, fill, out);
    ctx.putImageData(img, 0, 0);
    $('cUndo').disabled = !history.canUndo;
    $('cRedo').disabled = !history.canRedo;
  }

  function applyZoom(newI) {
    const wrap = $('cWrap');
    const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / wrap.scrollWidth;
    const cy = (wrap.scrollTop + wrap.clientHeight / 2) / wrap.scrollHeight;
    zoomI = Math.max(0, Math.min(ZOOMS.length - 1, newI));
    canvas.style.width = ZOOMS[zoomI] * 100 + '%';
    wrap.scrollLeft = cx * wrap.scrollWidth - wrap.clientWidth / 2;
    wrap.scrollTop = cy * wrap.scrollHeight - wrap.clientHeight / 2;
    $('cZoomLabel').textContent = ZOOMS[zoomI] + '×';
  }

  async function open(p) {
    page = p;
    history = new History(40);
    const bmp = await createImageBitmap(p.blob);
    w = bmp.width; h = bmp.height;
    canvas.width = w; canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0); bmp.close();
    lines = toBinary(ctx.getImageData(0, 0, w, h).data, w, h, 128);
    fill = new Uint32Array(w * h).fill(WHITE);
    if (p.colored) {
      // Bring back colors from last time.
      const cb = await createImageBitmap(p.colored);
      ctx.drawImage(cb, 0, 0, w, h); cb.close();
      fill.set(new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer));
    }
    img = ctx.createImageData(w, h);
    out = new Uint32Array(img.data.buffer);
    render();
    drawRecent();
    $('colorer').hidden = false;
    applyZoom(0);
    setMsg('Tap any white area to fill it.');
  }

  canvas.addEventListener('click', e => {
    if (!page) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * w);
    const y = Math.floor((e.clientY - r.top) / r.height * h);
    const area = fillArea(lines, w, h, x, y, gap);
    if (!area) { setMsg('That spot is a line. Tap inside a white area.'); return; }
    history.push(applyFill(fill, area, hexToColor(colorHex)));
    recent = addRecent(recent, colorHex);
    try { localStorage.setItem('cbs-recent', JSON.stringify(recent)); } catch {}
    drawRecent();
    render();
    setMsg('');
  });

  async function coloredBlob() {
    return new Promise(res => canvas.toBlob(res, 'image/png'));
  }

  async function saveAndClose() {
    if (!page) return;
    setMsg('Saving…');
    page.colored = await coloredBlob();
    await savePage(db, page);
    const p = page;
    page = null; lines = fill = out = img = null; // free memory
    canvas.width = canvas.height = 0;
    $('colorer').hidden = true;
    onClose(p);
  }

  $('cUndo').onclick = () => { if (history.undo(fill)) render(); };
  $('cRedo').onclick = () => { if (history.redo(fill)) render(); };
  $('cZoomIn').onclick = () => applyZoom(zoomI + 1);
  $('cZoomOut').onclick = () => applyZoom(zoomI - 1);
  $('cCustom').oninput = e => pick(e.target.value);
  $('cGap').onchange = e => { gap = Number(e.target.value); try { localStorage.setItem('cbs-gap', String(gap)); } catch {} };
  $('cDone').onclick = saveAndClose;
  $('cDownload').onclick = async () => {
    const name = `colored-${page.theme || 'page'}-${page.id}.png`;
    saveFile(await coloredBlob(), name);
  };
  $('cClear').onclick = () => {
    if (!confirm('Clear all colors on this page?')) return;
    const all = new Int32Array(w * h); for (let i = 0; i < all.length; i++) all[i] = i;
    history.push(applyFill(fill, all, WHITE));
    render();
  };

  return { open };
}
