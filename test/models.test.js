import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_SERVERS, DOWNLOADS, BUILT_IN, cleanBase, parseList, parseId, chatRequest, chatReply, pictureRequest, pictureReply,
  defaultChoice, cleanChoice, loadChoice, saveChoice, options, mergeFound, sizeText } from '../public/lib/models.js';
import { scanServers, askText, chatWith, pictureWith } from '../public/engines.js';

const memStore = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const ollama = LOCAL_SERVERS.find(s => s.kind === 'ollama');
const lm = LOCAL_SERVERS.find(s => s.id === 'lmstudio');
const sd = LOCAL_SERVERS.find(s => s.kind === 'a1111');

test('known AI apps and download list', () => {
  assert.deepEqual(LOCAL_SERVERS.map(s => s.id), ['ollama', 'lmstudio', 'llamacpp', 'sdwebui']);
  assert.equal(DOWNLOADS.length, 3);
  for (const d of DOWNLOADS) { assert.match(d.url, /^https:\/\/huggingface\.co\/.+\.gguf$/); assert.ok(d.mb > 0 && d.mb < 1000); }
});

test('cleanBase fixes typed addresses', () => {
  assert.equal(cleanBase('192.168.1.20:11434'), 'http://192.168.1.20:11434');
  assert.equal(cleanBase('http://localhost:7860/'), 'http://localhost:7860');
  assert.equal(cleanBase(''), null);
  assert.equal(cleanBase('ftp://x'), null);
});

test('parseList reads each kind of AI app', () => {
  const o = parseList(ollama, { models: [{ name: 'llama3.2:1b' }, {}] });
  assert.equal(o.text.length, 1);
  assert.equal(o.text[0].id, 'local|ollama|http://127.0.0.1:11434|llama3.2:1b');
  const l = parseList(lm, { data: [{ id: 'qwen2.5-0.5b' }, { id: 'stable-diffusion-v1-5' }] });
  assert.equal(l.text.length, 1); assert.equal(l.picture.length, 1);
  const s = parseList(sd, [{ title: 'dreamshaper_8.safetensors [abc]', model_name: 'dreamshaper_8' }]);
  assert.equal(s.picture[0].model, 'dreamshaper_8.safetensors [abc]');
  assert.match(s.picture[0].name, /^dreamshaper_8 — Stable Diffusion WebUI$/);
  assert.deepEqual(parseList(ollama, null), { picture: [], text: [] });
});

test('parseId round-trips every kind of id (model names with colons too)', () => {
  assert.deepEqual(parseId('local|ollama|http://127.0.0.1:11434|llama3.2:1b'), { type: 'local', kind: 'ollama', base: 'http://127.0.0.1:11434', model: 'llama3.2:1b' });
  assert.deepEqual(parseId('download|https://h/x.gguf'), { type: 'download', url: 'https://h/x.gguf' });
  assert.deepEqual(parseId('file|my model.gguf'), { type: 'file', name: 'my model.gguf' });
  assert.deepEqual(parseId('cloud'), { type: 'cloud' });
  assert.equal(parseId('local|bad|x|y'), null);
  assert.equal(parseId('nonsense'), null);
});

test('chat and picture requests/replies for each app kind', () => {
  const msgs = [{ role: 'user', content: 'hi' }];
  assert.equal(chatRequest('ollama', 'm', msgs).path, '/api/chat');
  assert.equal(chatRequest('ollama', 'm', msgs).body.stream, false);
  assert.equal(chatRequest('openai', 'm', msgs).path, '/v1/chat/completions');
  assert.equal(chatReply('ollama', { message: { content: 'yo' } }), 'yo');
  assert.equal(chatReply('openai', { choices: [{ message: { content: 'yo' } }] }), 'yo');
  assert.equal(chatReply('openai', {}), '');
  const a = pictureRequest('a1111', 'dream', 'an owl', 5);
  assert.equal(a.path, '/sdapi/v1/txt2img');
  assert.equal(a.body.seed, 5); assert.equal(a.body.override_settings.sd_model_checkpoint, 'dream');
  assert.match(a.body.negative_prompt, /color/);
  assert.equal(pictureRequest('openai', 'sd', 'x').body.response_format, 'b64_json');
  assert.equal(pictureReply('a1111', { images: ['QUJD'] }), 'QUJD');
  assert.equal(pictureReply('openai', { data: [{ b64_json: 'QUJD' }] }), 'QUJD');
  assert.equal(pictureReply('a1111', {}), '');
});

test('saved picks: defaults, bad values fixed, picks must exist', () => {
  assert.deepEqual(cleanChoice(null), defaultChoice());
  const found = { picture: [{ id: 'local|a1111|http://x:7860|m', name: 'm' }], text: [{ id: 'file|a.gguf', name: 'a' }] };
  const c = cleanChoice({ picture: 'local|a1111|http://x:7860|m', text: 'file|a.gguf', found, custom: ['1.2.3.4:5', 'ftp://no'] });
  assert.equal(c.picture, 'local|a1111|http://x:7860|m');
  assert.equal(c.text, 'file|a.gguf');
  assert.deepEqual(c.custom, ['http://1.2.3.4:5']);
  assert.equal(cleanChoice({ picture: 'gone', text: 'gone' }).picture, 'cloud');
  assert.equal(cleanChoice({ picture: 'patterns' }).picture, 'patterns');
  const s = memStore(); saveChoice(c, s); assert.deepEqual(loadChoice(s), c);
  assert.deepEqual(loadChoice({ getItem: () => '{bad' }), defaultChoice());
});

test('selection lists always include Cloudflare and Offline Patterns', () => {
  const o = options(defaultChoice());
  assert.deepEqual(o.picture.map(x => x.id), BUILT_IN.picture.map(x => x.id));
  assert.deepEqual(o.text.map(x => x.id), ['cloud']);
  const m = mergeFound({ ...defaultChoice(), text: 'file|a' }, { picture: [], text: [{ id: 'file|a', name: 'a' }, { id: 'file|a', name: 'a' }] });
  assert.equal(m.found.text.length, 1);
  assert.equal(m.text, 'file|a');
  assert.equal(mergeFound({ ...m }, { picture: [], text: [] }).text, 'cloud'); // model gone → back to Cloudflare
  assert.equal(sizeText(398 * 1048576), '398 MB');
  assert.equal(sizeText(2.5 * 1073741824), '2.5 GB');
});

const jsonRes = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

test('search finds AI apps that answer, skips ones that do not', async () => {
  const fetchFn = async url => {
    if (url === 'http://127.0.0.1:11434/api/tags') return jsonRes({ models: [{ name: 'qwen2.5:0.5b' }] });
    if (url === 'http://127.0.0.1:7860/sdapi/v1/sd-models') return jsonRes([{ title: 'sd15', model_name: 'sd15' }]);
    throw new TypeError('Failed to fetch');
  };
  const { found, seen } = await scanServers([], fetchFn);
  assert.deepEqual(found.text.map(x => x.model), ['qwen2.5:0.5b']);
  assert.deepEqual(found.picture.map(x => x.model), ['sd15']);
  assert.deepEqual(seen.sort(), ['Ollama', 'Stable Diffusion WebUI']);
  const custom = await scanServers(['http://10.0.0.5:11434'], async url => url.startsWith('http://10.0.0.5:11434/api/tags') ? jsonRes({ models: [{ name: 'x' }] }) : Promise.reject(new Error('no')));
  assert.equal(custom.found.text[0].base, 'http://10.0.0.5:11434');
});

test('askText uses Cloudflare by default, the offline pick when chosen', async () => {
  const s = memStore();
  const sent = [];
  const cloud = async (url, opts) => { sent.push([url, JSON.parse(opts.body)]); return jsonRes({ reply: 'cloud hi' }); };
  const r = await askText([{ role: 'user', content: 'hi' }], { theme: 'animals' }, cloud, s);
  assert.deepEqual(r, { reply: 'cloud hi', source: 'cloudflare' });
  assert.equal(sent[0][0], '/api/assistant');
  assert.equal(sent[0][1].theme, 'animals');

  const id = 'local|ollama|http://127.0.0.1:11434|qwen2.5:0.5b';
  saveChoice({ ...defaultChoice(), text: id, found: { picture: [], text: [{ id, name: 'q' }] } }, s);
  const local = async (url, opts) => { sent.push([url, JSON.parse(opts.body)]); return jsonRes({ message: { content: ' offline hi ' } }); };
  const r2 = await askText([{ role: 'user', content: 'hi' }], {}, local, s);
  assert.deepEqual(r2, { reply: 'offline hi', source: 'offline' });
  assert.equal(sent[1][0], 'http://127.0.0.1:11434/api/chat');
  assert.equal(sent[1][1].messages[0].role, 'system');   // same helper instructions as the cloud
  await assert.rejects(askText([{ role: 'user', content: 'hi' }], {}, async () => jsonRes({ message: { content: '' } }), s), /nothing/);
});

test('cloud errors and unreachable offline apps give clear messages', async () => {
  const s = memStore();
  await assert.rejects(askText([{ role: 'user', content: 'hi' }], {}, async () => jsonRes({ error: 'Daily limit' }, false), s), /Daily limit/);
  await assert.rejects(chatWith('local|ollama|http://x:1|m', [], async () => { throw new TypeError('x'); }), /Could not reach the AI app/);
  await assert.rejects(chatWith('bad', []), /Pick an AI Helper model/);
});

test('pictureWith gets a picture from a local picture app', async () => {
  globalThis.atob ??= b => Buffer.from(b, 'base64').toString('binary');
  let body;
  const blob = await pictureWith('local|a1111|http://127.0.0.1:7860|sd15', 'an owl', 9, async (url, opts) => { body = JSON.parse(opts.body); return jsonRes({ images: [Buffer.from('PNGDATA').toString('base64')] }); });
  assert.equal(body.prompt, 'an owl');
  assert.equal(await blob.text(), 'PNGDATA');
  await assert.rejects(pictureWith('cloud', 'x', 1), /Pick a picture model/);
  await assert.rejects(pictureWith('local|a1111|http://x:1|m', 'x', 1, async () => jsonRes({})), /nothing/);
});

test('offline bullet lists become idea buttons', async () => {
  const { bulletIdeas, stripBullets, parseIdeas } = await import('../public/lib/assistant.js');
  const text = 'Helper\n\n* Gothic: A mysterious church with stained glass windows\n* **Ocean**: A vast sea with coral reefs and a dolphin\n1. A cozy cottage in a snowy forest\n* City:';
  assert.deepEqual(bulletIdeas(text), ['A mysterious church with stained glass windows', 'A vast sea with coral reefs and a dolphin', 'A cozy cottage in a snowy forest']);
  assert.equal(stripBullets(text), 'Helper');
  assert.deepEqual(parseIdeas(text), []);   // the cloud format is unchanged
});
