import { THEMES, nextSubject, clampDifficulty, cleanSeed, randomSeed, randomPick, dayKey, DEFAULT_CAP } from './lib/core.js';
import { openDB, savePage, getPage, deletePage, listPages, filterPages, makeId } from './lib/db.js';

const $ = id => document.getElementById(id);
let db;
let selectedTheme = '';
let current = null;      // page just made
let viewing = null;      // page open in viewer
let busy = false;

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
  a.download = `coloring-${page.theme || 'page'}-seed${page.seed}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function showImage(img, blob) {
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
}

function infoText(p) {
  return `${p.subject} — Difficulty ${p.difficulty} — Seed ${p.seed}`;
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

async function generate() {
  if (busy) return;
  const subject = $('subject').value.trim();
  if (!subject) { setStatus('Please describe a scene or pick a theme.', true); return; }
  const difficulty = clampDifficulty($('difficulty').value);
  let seed = cleanSeed($('seed').value);
  if (seed === null || !$('lockSeed').checked) seed = randomSeed();
  $('seed').value = seed;

  busy = true;
  $('generate').disabled = $('random').disabled = true;
  setStatus('Drawing your page… this takes about 5–20 seconds.');
  try {
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, difficulty, seed }),
    });
    if (!r.ok) {
      let msg = 'Something went wrong. Try again.';
      try { const e = await r.json(); msg = (e.error || msg) + (e.detail ? ` (Details: ${e.detail})` : ''); } catch {}
      setStatus(msg, true);
      return;
    }
    const blob = await r.blob();
    const page = {
      id: makeId(), created: Date.now(), subject, theme: selectedTheme,
      difficulty, seed: Number(r.headers.get('x-seed')) || seed,
      favorite: false, blob, thumb: await makeThumb(blob),
    };
    await savePage(db, page);
    bumpLocalCount();
    current = page;
    $('seed').value = page.seed;
    showImage($('resultImg'), blob);
    $('resultInfo').textContent = infoText(page);
    $('result').hidden = false;
    setStatus('Saved to My Pages.');
    refreshUsage();
  } catch {
    setStatus('No connection to the drawing AI. Check your internet and try again.', true);
  } finally {
    busy = false;
    $('generate').disabled = $('random').disabled = false;
  }
}

function randomize() {
  const p = randomPick();
  selectedTheme = '';
  pickTheme(p.theme);
  $('subject').value = lastAutoText = p.subject;
  $('difficulty').value = p.difficulty;
  $('diffLabel').textContent = p.difficulty;
  $('seed').value = p.seed;
  $('lockSeed').checked = true;
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
    b.onclick = () => openViewer(p.id);
    grid.appendChild(b);
  }
}

async function openViewer(id) {
  viewing = await getPage(db, id);
  if (!viewing) return;
  showImage($('viewerImg'), viewing.blob);
  $('viewerInfo').textContent = infoText(viewing);
  $('vFav').textContent = viewing.favorite ? '★ Favorited' : '☆ Favorite';
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
  if (name === 'library') renderLibrary();
}

// ---------- start ----------
async function start() {
  db = await openDB();
  buildThemeButtons();
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
  $('difficulty').oninput = e => { $('diffLabel').textContent = e.target.value; };
  $('generate').onclick = generate;
  $('random').onclick = randomize;
  $('again').onclick = generate;
  $('downloadPng').onclick = () => current && downloadPng(current);
  $('filterTheme').onchange = $('favOnly').onchange = renderLibrary;
  $('search').oninput = renderLibrary;
  $('vClose').onclick = closeViewer;
  $('vDownload').onclick = () => viewing && downloadPng(viewing);
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
    $('seed').value = p.seed;
    $('lockSeed').checked = true;
    setStatus('Settings loaded. Tap Make Page for a new variation (this AI never draws the exact same picture twice, but your original stays saved in My Pages).');
  };
  refreshUsage();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
