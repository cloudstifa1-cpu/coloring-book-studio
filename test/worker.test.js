import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleApi } from '../src/worker.js';
import { BASE_STYLE } from '../public/lib/core.js';

const IMG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

function fakeKV() {
  const m = new Map();
  return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
}
function fakeAI(fn) {
  const calls = [];
  return { calls, run: async (model, input) => { calls.push({ model, input }); return fn ? fn() : { image: IMG }; } };
}
const post = body => new Request('https://x/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('generate returns a jpeg with seed header', async () => {
  const AI = fakeAI();
  const r = await handleApi(post({ subject: 'an owl', difficulty: 2, seed: 77 }), { AI });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal(r.headers.get('x-seed'), '77');
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...bytes], [0xff, 0xd8, 0xff, 0xd9]);
  assert.equal(AI.calls[0].model, '@cf/black-forest-labs/flux-1-schnell');
  assert.deepEqual(Object.keys(AI.calls[0].input).sort(), ['prompt', 'steps']);
  assert.equal(AI.calls[0].input.steps, 4);
  assert.ok(AI.calls[0].input.prompt.includes(BASE_STYLE));
});

test('random seed used when none sent', async () => {
  const AI = fakeAI();
  const r = await handleApi(post({ subject: 'a fox' }), { AI });
  assert.ok(Number.isInteger(Number(r.headers.get('x-seed'))));
});

test('empty subject refused, AI not called', async () => {
  const AI = fakeAI();
  const r = await handleApi(post({ subject: '' }), { AI });
  assert.equal(r.status, 400);
  assert.equal(AI.calls.length, 0);
});

test('bad JSON refused', async () => {
  const r = await handleApi(new Request('https://x/api/generate', { method: 'POST', body: 'not json' }), { AI: fakeAI() });
  assert.equal(r.status, 400);
});

test('daily cap blocks generation and never calls AI', async () => {
  const AI = fakeAI();
  const USAGE = fakeKV();
  const env = { AI, USAGE, DAILY_CAP: '2', POLLINATIONS: 'off' };
  assert.equal((await handleApi(post({ subject: 'a' }), env)).status, 200);
  assert.equal((await handleApi(post({ subject: 'b' }), env)).status, 200);
  const r = await handleApi(post({ subject: 'c' }), env);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Daily limit/);
  assert.equal(AI.calls.length, 2);
});

test('failed AI call does not count toward cap', async () => {
  const USAGE = fakeKV();
  const env = { AI: fakeAI(() => { throw new Error('boom'); }), USAGE };
  const r = await handleApi(post({ subject: 'a' }), env);
  assert.equal(r.status, 502);
  const u = await (await handleApi(new Request('https://x/api/usage'), env)).json();
  assert.equal(u.count, 0);
});

test('free allowance used up gives friendly 429', async () => {
  const env = { AI: fakeAI(() => { throw new Error('4006: daily free allocation exceeded'); }), POLLINATIONS: 'off' };
  const r = await handleApi(post({ subject: 'a' }), env);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Free daily AI allowance/);
});

test('empty AI answer gives 502', async () => {
  const r = await handleApi(post({ subject: 'a' }), { AI: fakeAI(() => ({})) });
  assert.equal(r.status, 502);
});

test('usage reports count, cap, tracked', async () => {
  const USAGE = fakeKV();
  const env = { AI: fakeAI(), USAGE, DAILY_CAP: '150' };
  await handleApi(post({ subject: 'a' }), env);
  const u = await (await handleApi(new Request('https://x/api/usage'), env)).json();
  assert.deepEqual(u, { count: 1, cap: 150, tracked: true });
  const u2 = await (await handleApi(new Request('https://x/api/usage'), { AI: fakeAI() })).json();
  assert.deepEqual(u2, { count: null, cap: 150, tracked: false });
});

test('non-api paths go to static files', async () => {
  const env = { ASSETS: { fetch: async () => new Response('page') } };
  const r = await worker.fetch(new Request('https://x/index.html'), env);
  assert.equal(await r.text(), 'page');
});

test('unknown api path is 404', async () => {
  const r = await handleApi(new Request('https://x/api/nope'), {});
  assert.equal(r.status, 404);
});

test('AI error message is passed back as detail', async () => {
  const env = { AI: fakeAI(() => { throw new Error('model said no'); }) };
  const r = await handleApi(post({ subject: 'a' }), env);
  const e = await r.json();
  assert.equal(r.status, 502);
  assert.match(e.detail, /model said no/);
});

test('missing AI connection gives clear message', async () => {
  const r = await handleApi(post({ subject: 'a' }), {});
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /not connected/);
});

const okFetch = calls => async (url) => { calls.push(url); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }); };

test('backup AI used when daily cap reached', async () => {
  const calls = [];
  const USAGE = fakeKV();
  USAGE.m.set('count:' + new Date().toISOString().slice(0, 10), '5');
  const AI = fakeAI();
  const r = await handleApi(post({ subject: 'an owl', seed: 9 }), { AI, USAGE, DAILY_CAP: '5', fetchImpl: okFetch(calls) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-source'), 'pollinations');
  assert.equal(AI.calls.length, 0);
  assert.match(calls[0], /^https:\/\/image\.pollinations\.ai\/prompt\/an%20owl/);
  assert.match(calls[0], /seed=9/);
});

test('backup AI used when free allowance used up', async () => {
  const calls = [];
  const env = { AI: fakeAI(() => { throw new Error('4006: daily free allocation exceeded'); }), fetchImpl: okFetch(calls) };
  const r = await handleApi(post({ subject: 'a' }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-source'), 'pollinations');
});

test('backup that sends non-image is treated as busy', async () => {
  const env = { AI: fakeAI(() => { throw new Error('4006'); }), fetchImpl: async () => new Response('rate limited', { status: 429 }) };
  const r = await handleApi(post({ subject: 'a' }), env);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /backup AI is busy/);
});

test('normal pages say they came from cloudflare', async () => {
  const r = await handleApi(post({ subject: 'a' }), { AI: fakeAI() });
  assert.equal(r.headers.get('x-source'), 'cloudflare');
});
