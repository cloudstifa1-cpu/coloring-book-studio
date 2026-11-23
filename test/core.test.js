import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, clampDifficulty, cleanSeed, randomSeed, randomPick, dayKey, THEMES, BASE_STYLE, DIFFICULTY, MAX_SEED } from '../public/lib/core.js';

test('prompt always includes coloring-page style', () => {
  const p = buildPrompt('an owl', 3);
  assert.ok(p.startsWith('an owl.'));
  assert.ok(p.includes(BASE_STYLE));
  assert.ok(p.includes(DIFFICULTY[3]));
});

test('prompt uses the right difficulty words', () => {
  assert.ok(buildPrompt('x', 1).includes(DIFFICULTY[1]));
  assert.ok(buildPrompt('x', 5).includes(DIFFICULTY[5]));
});

test('empty prompt is refused', () => {
  assert.throws(() => buildPrompt('   ', 3), /describe/);
});

test('long prompt is cut to 500 characters', () => {
  const p = buildPrompt('a'.repeat(900), 3);
  assert.ok(p.startsWith('a'.repeat(500) + '.'));
  assert.ok(!p.startsWith('a'.repeat(501)));
});

test('difficulty stays between 1 and 5', () => {
  assert.equal(clampDifficulty(0), 1);
  assert.equal(clampDifficulty(9), 5);
  assert.equal(clampDifficulty('4'), 4);
  assert.equal(clampDifficulty('abc'), 3);
});

test('seed cleaning', () => {
  assert.equal(cleanSeed('42'), 42);
  assert.equal(cleanSeed(-1), null);
  assert.equal(cleanSeed('nope'), null);
  assert.equal(cleanSeed(5e9), MAX_SEED);
  assert.equal(cleanSeed(''), 0);
});

test('random seed in range', () => {
  for (let i = 0; i < 100; i++) {
    const s = randomSeed();
    assert.ok(s >= 0 && s <= MAX_SEED && Number.isInteger(s));
  }
  assert.equal(randomSeed(() => 0.9999999), MAX_SEED);
});

test('random pick gives a real theme, subject, difficulty, seed', () => {
  for (let i = 0; i < 50; i++) {
    const p = randomPick();
    assert.ok(THEMES[p.theme].includes(p.subject));
    assert.ok(p.difficulty >= 1 && p.difficulty <= 5);
    assert.ok(Number.isInteger(p.seed));
  }
});

test('day key is UTC date', () => {
  assert.equal(dayKey(new Date('2026-11-23T23:30:00Z')), '2026-11-23');
  assert.equal(dayKey(new Date('2026-11-24T00:30:00Z')), '2026-11-24');
});

import { nextSubject } from '../public/lib/core.js';
test('theme tap always gives a different description', () => {
  const list = THEMES.gothic;
  let cur = list[0];
  for (let i = 0; i < 50; i++) {
    const n = nextSubject(list, cur);
    assert.ok(list.includes(n));
    assert.notEqual(n, cur);
    cur = n;
  }
  assert.equal(nextSubject(['only'], 'only'), 'only');
});

test('people and vehicles themes exist and every theme has at least 15 scenes', () => {
  assert.ok(THEMES.people && THEMES.vehicles);
  for (const [name, list] of Object.entries(THEMES)) {
    assert.ok(list.length >= 15, name + ' has too few scenes');
    assert.equal(new Set(list).size, list.length, name + ' has a repeated scene');
    assert.ok(list.every(x => x.length > 3 && x.length < 120));
  }
});
