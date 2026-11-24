// AI model choices: what the app can find on the phone, and which one makes pictures / runs the AI Helper.
// Pure functions only (testable). The browser parts are in ../engines.js.

// AI apps that can run on a phone and open a local connection the app can talk to.
export const LOCAL_SERVERS = [
  { id: 'ollama', name: 'Ollama', base: 'http://127.0.0.1:11434', kind: 'ollama' },
  { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234', kind: 'openai' },
  { id: 'llamacpp', name: 'llama.cpp / LocalAI', base: 'http://127.0.0.1:8080', kind: 'openai' },
  { id: 'sdwebui', name: 'Stable Diffusion WebUI', base: 'http://127.0.0.1:7860', kind: 'a1111' },
];

export const LIST_PATH = { ollama: '/api/tags', openai: '/v1/models', a1111: '/sdapi/v1/sd-models' };

// Small text models the app can download and keep on the phone (they run inside the browser).
export const DOWNLOADS = [
  { name: 'SmolLM2 360M (smallest, fastest)', mb: 386, url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf' },
  { name: 'Qwen 2.5 0.5B (good balance)', mb: 398, url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf' },
  { name: 'Llama 3.2 1B (smartest, needs 4 GB phone)', mb: 808, url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf' },
];

export const WLLAMA_URL = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@4.0.0/esm/index.js';
export const WLLAMA_WASM = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@4.0.0/esm/wasm/wllama.wasm';

// Always-there choices.
export const BUILT_IN = {
  picture: [
    { id: 'cloud', name: 'Cloudflare AI (online, free daily pages)' },
    { id: 'patterns', name: 'Offline Patterns (no internet)' },
  ],
  text: [{ id: 'cloud', name: 'Cloudflare AI (online, free)' }],
};

const PICTURE_NAME = /diffusion|sdxl|\bsd[-_ ]?(1|2|3|turbo)|flux|dreamshaper|realistic|anything|dall-?e|img|image/i;

// A web address typed by the user → clean base address, or null.
export function cleanBase(text) {
  let s = String(text || '').trim();
  if (!s) return null;
  if (/^[a-z]+:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
}

// Turns a server's model list into choices. Returns { picture: [...], text: [...] }.
export function parseList(server, json) {
  const out = { picture: [], text: [] };
  const add = (kind, model, label) => out[kind].push({
    id: `local|${server.kind}|${server.base}|${model}`, name: `${label || model} — ${server.name}`, model, kind: server.kind, base: server.base,
  });
  if (!json || typeof json !== 'object') return out;
  if (server.kind === 'ollama') for (const m of json.models || []) { if (m && m.name) add('text', m.name); }
  else if (server.kind === 'openai') {
    for (const m of json.data || []) {
      if (!m || !m.id) continue;
      add(PICTURE_NAME.test(m.id) ? 'picture' : 'text', m.id);
    }
  } else if (server.kind === 'a1111') {
    for (const m of Array.isArray(json) ? json : []) { if (m && (m.title || m.model_name)) add('picture', m.title || m.model_name, m.model_name || m.title); }
  }
  return out;
}

// Splits an id back into its parts. Local ids look like local|kind|base|model.
export function parseId(id) {
  const s = String(id || '');
  if (s === 'cloud' || s === 'patterns' || s === 'builtin') return { type: s };
  if (s.startsWith('local|')) {
    const [, kind, base, ...model] = s.split('|');
    if (LIST_PATH[kind] && base && model.length) return { type: 'local', kind, base, model: model.join('|') };
    return null;
  }
  if (s.startsWith('download|')) return { type: 'download', url: s.slice(9) };
  if (s.startsWith('file|')) return { type: 'file', name: s.slice(5) };
  return null;
}

// ---- requests to local AI apps ----
export function chatRequest(kind, model, messages) {
  if (kind === 'ollama') return { path: '/api/chat', body: { model, messages, stream: false, options: { num_predict: 500 } } };
  return { path: '/v1/chat/completions', body: { model, messages, max_tokens: 500, temperature: 0.7, stream: false } };
}
export function chatReply(kind, json) {
  if (!json) return '';
  if (kind === 'ollama') return (json.message && json.message.content) || '';
  const c = json.choices && json.choices[0];
  return (c && c.message && c.message.content) || '';
}

const NEGATIVE = 'color, colors, shading, gray, grayscale fill, text, letters, watermark, signature, blurry, nsfw, nude';
export function pictureRequest(kind, model, prompt, seed) {
  if (kind === 'a1111') {
    return { path: '/sdapi/v1/txt2img', body: { prompt, negative_prompt: NEGATIVE, steps: 20, width: 768, height: 768, cfg_scale: 7, seed: Number.isFinite(seed) ? seed : -1, override_settings: { sd_model_checkpoint: model } } };
  }
  return { path: '/v1/images/generations', body: { model, prompt, size: '768x768', n: 1, response_format: 'b64_json' } };
}
// Returns the picture as base64 text, or ''.
export function pictureReply(kind, json) {
  if (!json) return '';
  if (kind === 'a1111') return (Array.isArray(json.images) && json.images[0]) || '';
  return (Array.isArray(json.data) && json.data[0] && json.data[0].b64_json) || '';
}

// ---- saved picks ----
const KEY = 'cbs-models';
export function defaultChoice() { return { picture: 'cloud', text: 'cloud', found: { picture: [], text: [] }, custom: [] }; }

export function cleanChoice(c) {
  const d = defaultChoice();
  if (!c || typeof c !== 'object') return d;
  const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x.id === 'string' && typeof x.name === 'string').slice(0, 60) : []);
  const found = { picture: list(c.found && c.found.picture), text: list(c.found && c.found.text) };
  const ok = (kind, id) => BUILT_IN[kind].some(x => x.id === id) || (kind === 'text' && id === 'builtin') || found[kind].some(x => x.id === id);
  return {
    picture: ok('picture', c.picture) ? c.picture : d.picture,
    text: ok('text', c.text) ? c.text : d.text,
    found,
    custom: Array.isArray(c.custom) ? c.custom.map(cleanBase).filter(Boolean).slice(0, 5) : [],
  };
}
export function loadChoice(storage = globalThis.localStorage) {
  try { return cleanChoice(JSON.parse(storage.getItem(KEY))); } catch { return defaultChoice(); }
}
export function saveChoice(c, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(cleanChoice(c))); } catch {}
}

// Everything to show in the two selection lists.
export function options(choice) {
  const c = cleanChoice(choice);
  return { picture: [...BUILT_IN.picture, ...c.found.picture], text: [...BUILT_IN.text, ...c.found.text] };
}

// Merges a new search into the saved picks (keeps the user's choice if it still exists).
export function mergeFound(choice, found) {
  const dedupe = l => { const seen = new Set(); return l.filter(x => !seen.has(x.id) && seen.add(x.id)); };
  return cleanChoice({ ...choice, found: { picture: dedupe(found.picture || []), text: dedupe(found.text || []) } });
}

export function sizeText(bytes) {
  const mb = bytes / 1048576;
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
}
