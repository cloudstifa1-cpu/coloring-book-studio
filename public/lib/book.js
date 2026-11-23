// Book builder: which pages, in what order, and the settings. Pure functions (testable).

export function defaultBook() {
  return {
    title: 'My Coloring Book', subtitle: '', author: '',
    size: 'letter', singleSided: true, frame: false, useColored: false,
    pageIds: [],
  };
}

export function addPage(book, id) {
  if (book.pageIds.includes(id)) return book;
  return { ...book, pageIds: [...book.pageIds, id] };
}

export function removePage(book, id) {
  return { ...book, pageIds: book.pageIds.filter(x => x !== id) };
}

// dir: -1 up, +1 down
export function movePage(book, id, dir) {
  const ids = [...book.pageIds];
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return book;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...book, pageIds: ids };
}

// Drops pages that were deleted from My Pages.
export function keepExisting(book, existingIds) {
  const set = new Set(existingIds);
  return { ...book, pageIds: book.pageIds.filter(id => set.has(id)) };
}

// The order of every page in the PDF.
// Single-sided: a blank page behind each design so markers don't bleed through.
export function buildSequence(book) {
  const seq = [{ type: 'cover' }];
  if (book.singleSided) seq.push({ type: 'blank' });
  seq.push({ type: 'title' });
  if (book.singleSided) seq.push({ type: 'blank' });
  for (const id of book.pageIds) {
    seq.push({ type: 'design', id });
    if (book.singleSided) seq.push({ type: 'blank' });
  }
  return seq;
}

export function loadBook(storage = globalThis.localStorage) {
  try {
    const b = JSON.parse(storage.getItem('cbs-book'));
    if (b && Array.isArray(b.pageIds)) return { ...defaultBook(), ...b };
  } catch {}
  return defaultBook();
}

export function saveBook(book, storage = globalThis.localStorage) {
  try { storage.setItem('cbs-book', JSON.stringify(book)); } catch {}
}
