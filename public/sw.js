// Keeps the app working when the connection is weak. AI requests always go online.
const CACHE = 'cbs-v9';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'lib/core.js', 'lib/db.js', 'lib/cleanup.js', 'lib/pdf.js', 'lib/pagetools.js', 'lib/color.js', 'lib/book.js', 'colorer.js', 'bookui.js', 'helperui.js', 'lib/assistant.js', 'lib/cover.js', 'coverui.js', 'lib/patterns.js', 'lib/models.js', 'engines.js', 'modelsui.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  // Only the app's own files and the offline AI engine (jsdelivr) are cached.
  // Big model downloads and AI apps on the phone are never cached here.
  if (url.origin !== self.location.origin && url.hostname !== 'cdn.jsdelivr.net') return;
  // Network first so updates show up; cache if offline.
  e.respondWith(fetch(e.request)
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
