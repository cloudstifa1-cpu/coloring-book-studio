import test from 'node:test';
import assert from 'node:assert/strict';

// Tiny fake page, just enough for the Helper screen.
function el() {
  const e = { children: [], value: '', textContent: '', hidden: false, disabled: false, className: '', scrollTop: 0, scrollHeight: 0,
    classList: { toggle() {} },
    append(...k) { e.children.push(...k); }, appendChild(k) { e.children.push(k); },
    replaceChildren(...k) { e.children = k; } };
  return e;
}
globalThis.document = { createElement: () => el() };
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
globalThis.confirm = () => true;
const { initHelper } = await import('../public/helperui.js');

function setup(reply = 'Ideas:\nIDEA: a fox\nIDEA: an owl', ok = true) {
  const els = {};
  const $ = id => (els[id] ??= el());
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok, json: async () => ok ? { reply } : { error: 'Daily limit' } }; };
  const used = [], batched = [];
  const h = initHelper({ $, getContext: () => ({ theme: 'animals', subject: 'a cat' }), onUse: i => used.push(i), onBatch: i => batched.push(i) });
  return { $, h, sent, used, batched };
}

test('sending a message shows the reply with idea buttons', async () => {
  store.clear();
  const { $, h, sent, used, batched } = setup();
  await h.send('help');
  assert.equal(sent[0].theme, 'animals');
  assert.equal(h.history.length, 2);
  const bubble = $('hLog').children[1];
  const buttons = bubble.children.filter(c => c.onclick);
  assert.equal(buttons.length, 3);           // 2 ideas + "Batch all"
  buttons[0].onclick();
  assert.deepEqual(used, ['a fox']);
  buttons[2].onclick();
  assert.deepEqual(batched, [['a fox', 'an owl']]);
  assert.ok(store.get('cbs-helper-chat'));   // chat saved on the phone
});

test('failed message is put back in the box with the error shown', async () => {
  store.clear();
  const { $, h } = setup('', false);
  await h.send('hello');
  assert.equal(h.history.length, 0);
  assert.equal($('hInput').value, 'hello');
  assert.match($('hStatus').textContent, /Daily limit/);
});

test('improve button sends the current scene; clear empties the chat', async () => {
  store.clear();
  const { $, h, sent } = setup();
  $('hImprove').onclick();
  await new Promise(r => setTimeout(r, 0));
  assert.match(sent[0].messages[0].content, /a cat$/);
  $('hClear').onclick();
  assert.equal(h.history.length, 0);
});
