// Browser side of AI model choices: search the phone, download models, add model files,
// and send pictures / chat to whichever model is picked.
import { LOCAL_SERVERS, LIST_PATH, WLLAMA_URL, WLLAMA_WASM, parseList, parseId, chatRequest, chatReply,
  pictureRequest, pictureReply, loadChoice } from './lib/models.js';
import { buildMessages, replyText } from './lib/assistant.js';

const DIR = 'cbs-models';

async function fetchJson(url, opts = {}, ms = 1500, fetchFn = globalThis.fetch) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl && ms ? setTimeout(() => ctl.abort(), ms) : 0;
  try {
    const r = await fetchFn(url, { ...opts, signal: ctl && ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { if (t) clearTimeout(t); }
}

// ---- search: local AI apps on the phone ----
export async function scanServers(customBases = [], fetchFn = globalThis.fetch, ms = 1500) {
  const servers = [...LOCAL_SERVERS];
  for (const base of customBases) for (const kind of Object.keys(LIST_PATH)) servers.push({ id: 'custom', name: base, base, kind });
  const found = { picture: [], text: [] }, seen = [];
  await Promise.all(servers.map(async s => {
    try {
      const json = await fetchJson(s.base + LIST_PATH[s.kind], {}, ms, fetchFn);
      const got = parseList(s, json);
      if (got.picture.length + got.text.length) seen.push(s.name);
      found.picture.push(...got.picture); found.text.push(...got.text);
    } catch {}
  }));
  return { found, seen: [...new Set(seen)] };
}

// ---- in-browser engine (wllama runs .gguf models on the phone) ----
let wl = null;            // { lib, inst }
let loadedKey = '';
async function wllama() {
  if (wl) return wl;
  const lib = await import(/* @vite-ignore */ WLLAMA_URL);
  wl = { lib, inst: new lib.Wllama({ default: WLLAMA_WASM }) };
  return wl;
}

async function opfsDir(create = false) {
  if (!navigator.storage || !navigator.storage.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  try { return await root.getDirectoryHandle(DIR, { create }); } catch { return null; }
}

// Model files added from the phone, kept inside the app.
export async function listFiles() {
  const dir = await opfsDir();
  const out = [];
  if (!dir) return out;
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file') continue;
    const f = await h.getFile();
    out.push({ name, size: f.size });
  }
  return out;
}

// Models this app downloaded earlier (wllama keeps them in browser storage).
export async function listDownloads() {
  try {
    const { inst } = await wllama();
    const models = await inst.modelManager.getModels();
    return models.filter(m => m.size > 0).map(m => ({ url: m.url, size: m.size }));
  } catch { return null; }   // null = engine not reachable (no internet the first time)
}

export async function builtinAvailable() {
  try { return typeof LanguageModel !== 'undefined' && (await LanguageModel.availability()) === 'available'; } catch { return false; }
}

// Full search. Returns { found, notes }.
export async function scanAll(customBases = []) {
  const notes = [];
  const { found, seen } = await scanServers(customBases);
  notes.push(seen.length ? 'AI apps found: ' + seen.join(', ') + '.' : 'No AI apps running on this phone were found.');
  const files = await listFiles().catch(() => []);
  for (const f of files) found.text.push({ id: 'file|' + f.name, name: `${f.name} (${(f.size / 1048576).toFixed(0)} MB, on this phone)` });
  const dl = await listDownloads();
  if (dl === null) notes.push('Could not check downloaded models: connect to the internet once so the app can save its model engine.');
  else for (const m of dl) found.text.push({ id: 'download|' + m.url, name: `${m.url.split('/').pop()} (${(m.size / 1048576).toFixed(0)} MB, downloaded)` });
  if (files.length + (dl ? dl.length : 0)) notes.push(`Models on this phone: ${files.length + (dl ? dl.length : 0)}.`);
  else notes.push('No downloaded model files yet. Add one below.');
  if (await builtinAvailable()) { found.text.push({ id: 'builtin', name: 'Browser built-in AI (Gemini Nano)' }); notes.push('Browser built-in AI is ready.'); }
  return { found, notes };
}

export async function downloadModel(url, onProgress) {
  const { inst } = await wllama();
  await inst.modelManager.downloadModel(url, { progressCallback: ({ loaded, total }) => onProgress && onProgress(loaded, total) });
}

// Copies a .gguf file the user picked into the app, so it is there next time (and offline).
export async function addFile(file, onProgress) {
  if (!file || !/\.gguf$/i.test(file.name)) throw new Error('Pick a .gguf model file.');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...head) !== 'GGUF') throw new Error('That file is not a GGUF model.');
  try { await navigator.storage.persist(); } catch {}
  const dir = await opfsDir(true);
  if (!dir) throw new Error('This browser cannot keep model files. Try Chrome.');
  const h = await dir.getFileHandle(file.name, { create: true });
  const w = await h.createWritable();
  const reader = file.stream().getReader();
  let done = 0;
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      await w.write(value); done += value.length;
      if (onProgress) onProgress(done, file.size);
    }
    await w.close();
  } catch (e) {
    try { await w.abort(); await dir.removeEntry(file.name); } catch {}
    throw new Error('Not enough phone storage to keep this model.');
  }
}

export async function removeFile(name) {
  const dir = await opfsDir();
  if (dir) await dir.removeEntry(name);
}

async function loadInBrowser(p) {
  const { inst } = await wllama();
  const key = p.type + ':' + (p.url || p.name);
  if (loadedKey === key && inst.isModelLoaded()) return inst;
  if (inst.isModelLoaded()) await inst.exit().catch(() => {});
  if (loadedKey) wl = null;                     // fresh engine after a model change
  const fresh = (await wllama()).inst;
  const params = { n_ctx: 2048 };
  if (p.type === 'download') {
    const models = await fresh.modelManager.getModels();
    const m = models.find(x => x.url === p.url && x.size > 0);
    if (!m) throw new Error('That downloaded model is gone. Search again.');
    await fresh.loadModel(m, params);
  } else {
    const dir = await opfsDir();
    const file = dir && await (await dir.getFileHandle(p.name)).getFile();
    if (!file) throw new Error('That model file is gone. Add it again.');
    await fresh.loadModel([file], params);
  }
  loadedKey = key;
  return fresh;
}

// ---- send to the picked model ----
export async function chatWith(id, messages, fetchFn = globalThis.fetch) {
  const p = parseId(id);
  if (!p) throw new Error('Pick an AI Helper model on the Models tab.');
  if (p.type === 'local') {
    const req = chatRequest(p.kind, p.model, messages);
    const json = await fetchJson(p.base + req.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body) }, 180000, fetchFn)
      .catch(() => { throw new Error('Could not reach the AI app on this phone. Make sure it is open and running.'); });
    return chatReply(p.kind, json);
  }
  if (p.type === 'builtin') {
    const sys = messages.find(m => m.role === 'system');
    const s = await LanguageModel.create({ initialPrompts: sys ? [sys] : [] });
    const turns = messages.filter(m => m.role !== 'system');
    return await s.prompt(turns.map(m => `${m.role === 'user' ? 'User' : 'Helper'}: ${m.content}`).join('\n') + '\nHelper:');
  }
  if (p.type === 'download' || p.type === 'file') {
    const inst = await loadInBrowser(p);
    const r = await inst.createChatCompletion({ messages, max_tokens: 400, temperature: 0.7, top_k: 40, top_p: 0.9 });
    return replyText(r);
  }
  throw new Error('Pick an AI Helper model on the Models tab.');
}

// Text for the AI Helper and back cover words: Cloudflare, or the picked offline model.
export async function askText(history, context = {}, fetchFn = globalThis.fetch, storage = globalThis.localStorage) {
  const pick = loadChoice(storage).text;
  if (pick === 'cloud') {
    const r = await fetchFn('/api/assistant', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history, ...context }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.reply) throw new Error(data.error || 'The helper did not answer. Try again.');
    return { reply: data.reply, source: data.source || 'cloudflare' };
  }
  const reply = await chatWith(pick, buildMessages(history, context), fetchFn);
  if (!reply || !reply.trim()) throw new Error('The offline model sent back nothing. Try again.');
  return { reply: reply.trim(), source: 'offline' };
}

// Picture from a local picture app. Returns a Blob.
export async function pictureWith(id, prompt, seed, fetchFn = globalThis.fetch) {
  const p = parseId(id);
  if (!p || p.type !== 'local') throw new Error('Pick a picture model on the Models tab.');
  const req = pictureRequest(p.kind, p.model, prompt, seed);
  const json = await fetchJson(p.base + req.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body) }, 600000, fetchFn)
    .catch(() => { throw new Error('Could not reach the picture app on this phone. Make sure it is open and running.'); });
  const b64 = pictureReply(p.kind, json);
  if (!b64) throw new Error('The picture app sent back nothing. Try again.');
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: 'image/png' });
}
