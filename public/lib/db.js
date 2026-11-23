// Saves pages on the phone (IndexedDB), so they don't sit in memory.
const DB_NAME = 'coloring-book-studio';
const STORE = 'pages';

export function openDB(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('created', 'created');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const savePage = (db, page) => tx(db, 'readwrite', s => s.put(page));
export const getPage = (db, id) => tx(db, 'readonly', s => s.get(id));
export const deletePage = (db, id) => tx(db, 'readwrite', s => s.delete(id));

// Newest first. Returns info only (no images) unless withBlob is true.
export async function listPages(db, { withBlob = false } = {}) {
  const all = await tx(db, 'readonly', s => s.getAll());
  all.sort((a, b) => b.created - a.created);
  return withBlob ? all : all.map(({ blob, ...info }) => info);
}

export function filterPages(pages, { theme = '', favoritesOnly = false, text = '' } = {}) {
  const t = text.trim().toLowerCase();
  return pages.filter(p =>
    (!theme || p.theme === theme) &&
    (!favoritesOnly || p.favorite) &&
    (!t || (p.subject || '').toLowerCase().includes(t)));
}
