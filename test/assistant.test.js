import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/worker.js';
import { TEXT_MODEL, MAX_TURNS, MAX_IDEAS, SYSTEM_PROMPT, QUICK, cleanHistory, buildMessages, parseIdeas, stripIdeas, replyText } from '../public/lib/assistant.js';
import { MAX_PROMPT } from '../public/lib/core.js';

const user = t => ({ role: 'user', content: t });
const post = body => new Request('https://x/api/assistant', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
function fakeKV() { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
function fakeAI(fn) { const calls = []; return { calls, run: async (model, input) => { calls.push({ model, input }); return fn ? fn() : { response: 'Try these:\nIDEA: an owl in a moonlit oak' }; } }; }

// ---- pure logic ----
test('cleanHistory drops bad roles, blanks, and keeps newest turns', () => {
  const list = [{ role: 'system', content: 'hack' }, { role: 'user', content: '  ' }, null, user('a')];
  assert.deepEqual(cleanHistory(list), [user('a')]);
  const many = Array.from({ length: 30 }, (_, i) => user('m' + i));
  const out = cleanHistory(many);
  assert.equal(out.length, MAX_TURNS);
  assert.equal(out.at(-1).content, 'm29');
  assert.deepEqual(cleanHistory('nope'), []);
});

test('cleanHistory trims very long messages', () => {
  assert.ok(cleanHistory([user('x'.repeat(5000))])[0].content.length <= 1200);
});

test('buildMessages puts system prompt first and adds theme/difficulty', () => {
  const m = buildMessages([user('hi')], { theme: 'gothic', difficulty: 9 });
  assert.equal(m[0].role, 'system');
  assert.ok(m[0].content.startsWith(SYSTEM_PROMPT));
  assert.match(m[0].content, /"gothic" theme/);
  assert.match(m[0].content, /difficulty is 5 of 5/);
  assert.deepEqual(m[1], user('hi'));
});

test('buildMessages ignores unknown themes and refuses empty chats', () => {
  assert.doesNotMatch(buildMessages([user('hi')], { theme: 'zzz' })[0].content, /zzz/);
  assert.throws(() => buildMessages([]), /Type a message/);
  assert.throws(() => buildMessages([user('a'), { role: 'assistant', content: 'b' }]), /Type a message/);
});

test('parseIdeas reads IDEA lines in several styles, no duplicates', () => {
  const text = 'Sure!\nIDEA: a fox in ferns\n- Idea: a castle on a hill\n2. **IDEA 3:** a teapot garden\nidea - a fox in ferns\nnot an idea';
  assert.deepEqual(parseIdeas(text), ['a fox in ferns', 'a castle on a hill', 'a teapot garden']);
});

test('parseIdeas caps count and length', () => {
  const text = Array.from({ length: 20 }, (_, i) => `IDEA: scene number ${i} ` + 'y'.repeat(600)).join('\n');
  const ideas = parseIdeas(text);
  assert.equal(ideas.length, MAX_IDEAS);
  assert.ok(ideas.every(i => i.length <= MAX_PROMPT));
  assert.deepEqual(parseIdeas(''), []);
});

test('stripIdeas removes IDEA lines but keeps the rest', () => {
  assert.equal(stripIdeas('Here you go:\nIDEA: a\n\n\n\nEnjoy!'), 'Here you go:\n\nEnjoy!');
});

test('replyText handles both answer shapes', () => {
  assert.equal(replyText({ response: 'hi' }), 'hi');
  assert.equal(replyText({ choices: [{ message: { content: 'yo' } }] }), 'yo');
  assert.equal(replyText('plain'), 'plain');
  assert.equal(replyText(null), '');
  assert.equal(replyText({}), '');
});

test('quick prompts exist for themes, book and improve', () => {
  assert.ok(QUICK.themes && QUICK.book && QUICK.improve);
});

// ---- worker endpoint ----
test('assistant endpoint returns the reply from the small text model', async () => {
  const AI = fakeAI();
  const r = await handleApi(post({ messages: [user('ideas please')], theme: 'ocean' }), { AI });
  assert.equal(r.status, 200);
  assert.match((await r.json()).reply, /IDEA: an owl/);
  assert.equal(AI.calls[0].model, TEXT_MODEL);
  assert.equal(AI.calls[0].input.messages[0].role, 'system');
  assert.ok(AI.calls[0].input.max_tokens <= 1000);
});

test('assistant refuses bad JSON and empty chat without calling AI', async () => {
  const AI = fakeAI();
  const bad = new Request('https://x/api/assistant', { method: 'POST', body: 'nope' });
  assert.equal((await handleApi(bad, { AI })).status, 400);
  assert.equal((await handleApi(post({ messages: [] }), { AI })).status, 400);
  assert.equal(AI.calls.length, 0);
});

test('assistant daily cap blocks and never calls AI', async () => {
  const AI = fakeAI();
  const env = { AI, USAGE: fakeKV(), CHAT_CAP: '1' };
  assert.equal((await handleApi(post({ messages: [user('a')] }), env)).status, 200);
  const r = await handleApi(post({ messages: [user('b')] }), env);
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Helper daily limit/);
  assert.equal(AI.calls.length, 1);
});

test('chat count is separate from the page count', async () => {
  const USAGE = fakeKV();
  await handleApi(post({ messages: [user('a')] }), { AI: fakeAI(), USAGE });
  const keys = [...USAGE.m.keys()];
  assert.equal(keys.length, 1);
  assert.ok(keys[0].startsWith('chat:'));
});

test('used-up free allowance gives a clear message', async () => {
  const AI = fakeAI(() => { throw new Error('4006: daily free allocation exceeded'); });
  const r = await handleApi(post({ messages: [user('a')] }), { AI });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /allowance is used up/);
});

test('other AI errors and empty answers give 502', async () => {
  const boom = await handleApi(post({ messages: [user('a')] }), { AI: fakeAI(() => { throw new Error('x'); }) });
  assert.equal(boom.status, 502);
  const empty = await handleApi(post({ messages: [user('a')] }), { AI: fakeAI(() => ({ response: '  ' })) });
  assert.equal(empty.status, 502);
});

test('missing AI binding gives 500', async () => {
  const r = await handleApi(post({ messages: [user('a')] }), {});
  assert.equal(r.status, 500);
});

test('GET on assistant is not found', async () => {
  const r = await handleApi(new Request('https://x/api/assistant'), { AI: fakeAI() });
  assert.equal(r.status, 404);
});
