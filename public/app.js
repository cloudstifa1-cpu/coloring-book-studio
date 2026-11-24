import { THEMES, nextSubject, clampDifficulty, cleanSeed, randomSeed, randomPick, buildPrompt, dayKey, DEFAULT_CAP } from './lib/core.js';
import { cleanBlob, sharpPng, pagePdf, saveFile } from './lib/pagetools.js';
import { WEIGHTS, DEFAULT_WEIGHT, clampWeight, weightOf } from './lib/cleanup.js';
import { initColorer } from './colorer.js';
import { initBook } from './bookui.js';
import { initHelper } from './helperui.js';
import { PATTERNS, makePattern, drawShapes, patternRecord, SIZE } from './lib/patterns.js';
import { loadChoice } from './lib/models.js';
import { pictureWith } from './engines.js';
import { initModels } from './modelsui.js';
import { openDB, savePage, getPage, deletePage, listPages, filterPages, makeId } from './lib/db.js';

const $ = id => document.getElementById(id);
let db;
let selectedTheme = '';
let current = null;      // page just made
let viewing = null;      // page open in viewer
let busy = false;
let colorer, bookUi, helperUi;
let helperQueue = [];    // scenes sent from the AI Helper for batch mode

// ---------- small helpers ----------
function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}

function localCount() {
  try {
    const d = JSON.parse(localStorage.getItem('cbs-count') || '{}');
    return d.day === dayKey() ? d.n : 0;
  } catch { return 0; }
}
function bumpLocalCount() {
  try { localStorage.setItem('cbs-count', JSON.stringify({ day: dayKey(), n: localCount() + 1 })); } catch {}
}

async function refreshUsage() {
  let count = null, cap = DEFAULT_CAP;
  try {
    const r = await fetch('/api/usage');
    if (r.ok) { const u = await r.json(); cap = u.cap; if (u.tracked) count = u.count; }
  } catch {}
  if (count === null) count = localCount();
  $('usage').textContent = `Pages made today: ${count} / ${cap}`;
}

async function makeThumb(blob, size = 240) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, 0, 0, size, size);
  bmp.close();
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.7));
}

async function downloadPng(page) {
  const bmp = await createImageBitmap(page.blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const png = await new Promise(res => c.toBlob(res, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(png);
  a.download = `coloring-${page.theme || 'page'}-${page.id}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function showImage(img, blob) {
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
}

function infoText(p) {
  return `${p.subject} — Difficulty ${p.difficulty} — Lines: ${WEIGHTS[weightOf(p)].label}`;
}

// ---------- Make a Page ----------
function buildThemeButtons() {
  const box = $('themes');
  const sel = $('filterTheme');
  for (const name of Object.keys(THEMES)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.theme = name;
    b.onclick = () => pickTheme(name);
    box.appendChild(b);
    const o = document.createElement('option');
    o.value = name; o.textContent = name[0].toUpperCase() + name.slice(1);
    sel.appendChild(o);
  }
}

let lastAutoText = '';

function pickTheme(name) {
  selectedTheme = name;
  for (const b of $('themes').children) b.classList.toggle('on', b.dataset.theme === selectedTheme);
  const box = $('subject');
  const text = box.value.trim();
  if (!text || text === lastAutoText) {
    lastAutoText = nextSubject(THEMES[name], text);
    box.value = lastAutoText;
  }
}

// Asks the AI for one page, cleans it, saves it. Returns the page or throws a message.
async function makeOne(subject, difficulty) {
  const pick = loadChoice().picture;
  if (pick === 'patterns') return makePatternPage($('pType').value, difficulty);
  if (pick !== 'cloud') {
    const seed = randomSeed();
    const original = await pictureWith(pick, buildPrompt(subject, difficulty), seed);
    const blob = await cleanBlob(original, DEFAULT_WEIGHT);
    const page = { id: makeId(), created: Date.now(), subject, theme: selectedTheme, difficulty, seed, source: 'offline-model',
      favorite: false, original, blob, weight: DEFAULT_WEIGHT, thumb: await makeThumb(blob) };
    await savePage(db, page);
    return page;
  }
  const r = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, difficulty, seed: randomSeed() }),
  }).catch(() => { throw new Error('No connection to the drawing AI. Check your internet, or tap Make Pattern Page to make one offline.'); });
  if (!r.ok) {
    let msg = 'Something went wrong. Try again.';
    try { const e = await r.json(); msg = (e.error || msg) + (e.detail ? ` (Details: ${e.detail})` : ''); } catch {}
    throw new Error(msg);
  }
  const original = await r.blob();
  const blob = await cleanBlob(original, DEFAULT_WEIGHT);
  const page = {
    id: makeId(), created: Date.now(), subject, theme: selectedTheme, difficulty,
    seed: Number(r.headers.get('x-seed')) || 0, source: r.headers.get('x-source') || 'cloudflare',
    favorite: false, original, blob, weight: DEFAULT_WEIGHT, thumb: await makeThumb(blob),
  };
  await savePage(db, page);
  bumpLocalCount();
  return page;
}

// Offline: draws a pattern page with math (no internet), cleans it, saves it.
async function makePatternPage(type, difficulty) {
  const p = makePattern(type, randomSeed(), difficulty);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  drawShapes(c.getContext('2d'), p.shapes, 1, 3, p.clip);
  const original = await new Promise(res => c.toBlob(res, 'image/png'));
  c.width = c.height = 0;
  if (!original) throw new Error('Could not draw the pattern. Try again.');
  const blob = await cleanBlob(original, DEFAULT_WEIGHT);
  const page = { id: makeId(), created: Date.now(), ...patternRecord(p), favorite: false, original, blob, weight: DEFAULT_WEIGHT, thumb: await makeThumb(blob) };
  await savePage(db, page);
  return page;
}

async function makePatterns(count) {
  if (busy) return;
  setBusy(true);
  try {
    let page;
    for (let i = 1; i <= count; i++) {
      setStatus(count > 1 ? `Drawing pattern ${i} of ${count}…` : 'Drawing pattern…');
      page = await makePatternPage($('pType').value, clampDifficulty($('difficulty').value));
    }
    showResult(page);
    setStatus(count > 1 ? `${count} patterns saved to My Pages (made offline).` : 'Saved to My Pages (made offline).');
  } catch (e) {
    setStatus(e.message || String(e), true);
  } finally {
    setBusy(false);
  }
}

function showResult(page) {
  current = page;
  $('addBook').textContent = 'Add to Book';
  $('weight').value = weightOf(page);
  $('weightLabel').textContent = weightLabel(weightOf(page));
  showImage($('resultImg'), page.blob);
  $('resultInfo').textContent = infoText(page);
  $('result').hidden = false;
}

function setBusy(on) {
  busy = on;
  $('generate').disabled = $('random').disabled = $('batch').disabled = $('pMake').disabled = $('pBatch').disabled = on;
  $('stopBatch').hidden = !batchRunning;
}

async function generate() {
  if (busy) return;
  const subject = $('subject').value.trim();
  if (!subject) { setStatus('Please describe a scene or pick a theme.', true); return; }
  setBusy(true);
  setStatus('Drawing your page… this takes about 5–20 seconds.');
  try {
    const page = await makeOne(subject, clampDifficulty($('difficulty').value));
    showResult(page);
    setStatus(page.source === 'pollinations' ? 'Saved to My Pages (made by the backup AI).' : 'Saved to My Pages.');
    refreshUsage();
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    setBusy(false);
  }
}

// Batch: makes several pages in a row, one at a time (protects phone memory).
let batchRunning = false;
async function runBatch() {
  if (busy) return;
  const queue = helperQueue.slice();
  const total = queue.length || Number($('batchCount').value);
  const typed = $('subject').value.trim();
  if (!queue.length && !typed && !selectedTheme) { setStatus('Describe a scene or pick a theme first.', true); return; }
  const difficulty = clampDifficulty($('difficulty').value);
  batchRunning = true;
  setBusy(true);
  let made = 0, subject = typed;
  try {
    for (let i = 0; i < total && batchRunning; i++) {
      if (queue.length) subject = queue[i];
      else if (selectedTheme && (!typed || typed === lastAutoText)) subject = nextSubject(THEMES[selectedTheme], subject);
      setStatus(`Batch: drawing page ${i + 1} of ${total}…`);
      try {
        showResult(await makeOne(subject, difficulty));
        made++;
      } catch (e) {
        setStatus(`Batch stopped after ${made} pages: ${e.message}`, true);
        return;
      }
    }
    setStatus(`Batch done: ${made} pages saved to My Pages.`);
    if (queue.length && made === total) { helperQueue = []; $('queueBox').hidden = true; }
  } finally {
    batchRunning = false;
    setBusy(false);
    refreshUsage();
  }
}

// Line weight: re-cleans from the original AI picture, so nothing is lost by changing it.
async function setWeight(page, level, img, info, slider) {
  if (!page || busy) return;
  const w = clampWeight(level);
  slider.value = w;
  slider.previousElementSibling.textContent = weightLabel(w);
  setBusy(true);
  try {
    page.weight = w;
    page.original = page.original || page.blob;
    page.blob = await cleanBlob(page.original, w);
    page.thumb = await makeThumb(page.blob);
    await savePage(db, page);
    showImage(img, page.blob);
    info.textContent = infoText(page);
  } finally { setBusy(false); }
}

function weightLabel(w) { return `Line weight: ${w} (${WEIGHTS[w].label})`; }

async function download(page, kind) {
  if (!page) return;
  const name = `coloring-${page.theme || 'page'}-${page.id}`;
  setStatus('Preparing your file…');
  try {
    if (kind === 'png') await downloadPng(page);
    if (kind === 'print') saveFile(await sharpPng(page.blob), name + '-print.png');
    if (kind === 'pdf') saveFile(await pagePdf(page.blob, $('pdfSize').value), name + '.pdf');
    setStatus('Download started.');
  } catch { setStatus('Could not make the file. Try again.', true); }
}

function randomize() {
  const p = randomPick();
  selectedTheme = '';
  pickTheme(p.theme);
  $('subject').value = lastAutoText = p.subject;
  $('difficulty').value = p.difficulty;
  $('diffLabel').textContent = p.difficulty;
  generate();
}

// ---------- My Pages ----------
const thumbUrls = [];
async function renderLibrary() {
  thumbUrls.forEach(u => URL.revokeObjectURL(u));
  thumbUrls.length = 0;
  const all = await listPages(db);
  const shown = filterPages(all, {
    theme: $('filterTheme').value, favoritesOnly: $('favOnly').checked, text: $('search').value,
  });
  $('libCount').textContent = `${shown.length} of ${all.length} pages`;
  const grid = $('grid');
  grid.replaceChildren();
  for (const p of shown) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', p.subject);
    const img = document.createElement('img');
    if (p.thumb) { const u = URL.createObjectURL(p.thumb); thumbUrls.push(u); img.src = u; }
    img.alt = '';
    b.appendChild(img);
    if (p.favorite) { const s = document.createElement('span'); s.className = 'star'; s.textContent = '★'; b.appendChild(s); }
    if (p.colored) { const s = document.createElement('span'); s.className = 'paint'; s.textContent = '🎨'; b.appendChild(s); }
    b.onclick = () => openViewer(p.id);
    grid.appendChild(b);
  }
}

async function openViewer(id) {
  viewing = await getPage(db, id);
  if (!viewing) return;
  showImage($('viewerImg'), viewing.blob);
  $('vWeight').value = weightOf(viewing);
  $('vWeightLabel').textContent = weightLabel(weightOf(viewing));
  $('viewerInfo').textContent = infoText(viewing);
  $('vFav').textContent = viewing.favorite ? '★ Favorited' : '☆ Favorite';
  $('vColoredDl').hidden = !viewing.colored;
  $('vAddBook').textContent = bookUi.has(viewing.id) ? '✓ In Book' : 'Add to Book';
  $('viewer').hidden = false;
}

function closeViewer() {
  $('viewer').hidden = true;
  if ($('viewerImg').src.startsWith('blob:')) URL.revokeObjectURL($('viewerImg').src);
  $('viewerImg').removeAttribute('src');
  viewing = null;
}

function switchTab(name) {
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === name);
  $('make').hidden = name !== 'make';
  $('library').hidden = name !== 'library';
  $('book').hidden = name !== 'book';
  $('helper').hidden = name !== 'helper';
  $('models').hidden = name !== 'models';
  if (name === 'library') renderLibrary();
  if (name === 'book') bookUi.render();
}

// ---------- start ----------
async function start() {
  db = await openDB();
  buildThemeButtons();
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
  $('difficulty').oninput = e => { $('diffLabel').textContent = e.target.value; };
  $('generate').onclick = generate;
  initModels({ $ });
  $('pType').replaceChildren(new Option('Any pattern', 'any'), ...Object.entries(PATTERNS).map(([v, t]) => new Option(t, v)));
  $('pMake').onclick = () => makePatterns(1);
  $('pBatch').onclick = () => makePatterns(5);
  $('random').onclick = randomize;
  $('again').onclick = () => (current && current.source === 'offline' ? makePatterns(1) : generate());
  $('downloadPng').onclick = () => download(current, 'png');
  $('downloadPrint').onclick = () => download(current, 'print');
  $('downloadPdf').onclick = () => download(current, 'pdf');
  const R = [$('resultImg'), $('resultInfo'), $('weight')];
  const V = [$('viewerImg'), $('viewerInfo'), $('vWeight')];
  $('thinner').onclick = () => current && setWeight(current, weightOf(current) - 1, ...R);
  $('thicker').onclick = () => current && setWeight(current, weightOf(current) + 1, ...R);
  $('vThinner').onclick = () => viewing && setWeight(viewing, weightOf(viewing) - 1, ...V);
  $('vThicker').onclick = () => viewing && setWeight(viewing, weightOf(viewing) + 1, ...V);
  // Label moves while sliding; the page is re-cleaned when you let go.
  for (const [sl, lab, get, set] of [[$('weight'), $('weightLabel'), () => current, R], [$('vWeight'), $('vWeightLabel'), () => viewing, V]]) {
    sl.oninput = () => { lab.textContent = weightLabel(clampWeight(sl.value)); };
    sl.onchange = () => get() && setWeight(get(), sl.value, ...set);
  }
  $('vPrint').onclick = () => download(viewing, 'print');
  $('vPdf').onclick = () => download(viewing, 'pdf');
  $('batch').onclick = runBatch;
  colorer = initColorer({ $, db, savePage, saveFile, onClose: p => {
    if (!$('viewer').hidden && viewing && viewing.id === p.id) openViewer(p.id);
    if (!$('library').hidden) renderLibrary();
  } });
  bookUi = initBook({ $, db, listPages, getPage });
  $('colorThis').onclick = () => current && colorer.open(current);
  $('vColor').onclick = () => viewing && colorer.open(viewing);
  const addToBook = (p, btn) => { if (!p) return; const n = bookUi.add(p.id); btn.textContent = '✓ In Book'; setStatus(`Added to book (${n} pages).`); };
  $('addBook').onclick = () => addToBook(current, $('addBook'));
  $('vAddBook').onclick = () => addToBook(viewing, $('vAddBook'));
  $('vColoredDl').onclick = () => viewing && viewing.colored && saveFile(viewing.colored, `colored-${viewing.theme || 'page'}-${viewing.id}.png`);
  $('stopBatch').onclick = () => { batchRunning = false; setStatus('Stopping after this page…'); };
  $('filterTheme').onchange = $('favOnly').onchange = renderLibrary;
  $('search').oninput = renderLibrary;
  $('vClose').onclick = closeViewer;
  $('vDownload').onclick = () => download(viewing, 'png');
  $('vFav').onclick = async () => {
    viewing.favorite = !viewing.favorite;
    await savePage(db, viewing);
    $('vFav').textContent = viewing.favorite ? '★ Favorited' : '☆ Favorite';
    renderLibrary();
  };
  $('vDelete').onclick = async () => {
    if (!confirm('Delete this page?')) return;
    await deletePage(db, viewing.id);
    closeViewer();
    renderLibrary();
  };
  $('vRemake').onclick = () => {
    const p = viewing;
    closeViewer();
    switchTab('make');
    $('subject').value = p.subject;
    selectedTheme = '';
    if (p.theme) pickTheme(p.theme);
    $('difficulty').value = p.difficulty;
    $('diffLabel').textContent = p.difficulty;
    setStatus('Settings loaded. Tap Make Page for a new variation (this AI never draws the exact same picture twice, but your original stays saved in My Pages).');
  };
  helperUi = initHelper({
    $,
    getContext: () => ({ theme: selectedTheme, difficulty: clampDifficulty($('difficulty').value), subject: $('subject').value.trim() }),
    onUse: idea => { switchTab('make'); $('subject').value = idea; setStatus('Idea loaded. Tap Make Page.'); },
    onBatch: ideas => {
      helperQueue = ideas.slice();
      $('queueInfo').textContent = `Helper list ready: ${ideas.length} pages. Tap Make Batch to draw them all.`;
      $('queueBox').hidden = false;
      switchTab('make');
      setStatus('');
    },
  });
  $('queueClear').onclick = () => { helperQueue = []; $('queueBox').hidden = true; setStatus('Helper list cleared.'); };
  refreshUsage();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
