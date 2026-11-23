// Shared logic used by both the app (browser) and the Worker (server).
// Pure functions only, so every piece can be tested.

export const BASE_STYLE =
  'black and white coloring book page, clean bold black outlines, line art only, ' +
  'no shading, no gray, no color, no gradients, pure white background, closed shapes';

export const DIFFICULTY = {
  1: 'very simple design, a few large shapes, extra thick bold outlines, minimal detail, for beginners',
  2: 'simple design, large shapes, thick outlines, light detail',
  3: 'medium detail, clean outlines, balanced amount of shapes',
  4: 'detailed design, intricate patterns, fine outlines, many shapes',
  5: 'highly intricate design, very fine line work, many small areas to color, ornate patterns filling the background',
};

export const THEMES = {
  gothic: ['a gothic cathedral window with roses', 'a raven perched on an old iron gate', 'a candlelit gothic library', 'a moonlit cemetery with ornate tombstones', 'a vampire castle on a cliff'],
  fantasy: ['a wizard tower in an enchanted forest', 'a fairy village inside mushrooms', 'a unicorn by a waterfall', 'a mermaid castle under the sea', 'an elven city in giant trees'],
  dragons: ['a dragon curled around a treasure pile', 'a dragon flying over mountains', 'a baby dragon hatching from an egg', 'a dragon sleeping in a cave', 'two dragons in an ornate circle'],
  animals: ['an owl in a tree full of leaves', 'a fox in a flower meadow', 'a lion with a decorative mane', 'an elephant with patterned blanket', 'a cat sleeping on a windowsill'],
  flowers: ['a bouquet of roses and lilies', 'a sunflower field', 'a garden of peonies with butterflies', 'a wreath of wildflowers', 'lotus flowers on a pond'],
  ocean: ['a sea turtle swimming through coral', 'an octopus with curling tentacles', 'a lighthouse on rocky shore with waves', 'a whale with fish around it', 'seashells and starfish on sand'],
  cities: ['a cozy European street with shops', 'a city skyline at night', 'a Venice canal with gondolas', 'a busy old-time market', 'a row of Victorian houses'],
  cottage: ['a cozy cottage with a flower garden', 'a cottage kitchen with teapots and plants', 'a reading nook with books and a cat', 'a treehouse with lanterns', 'a country porch with rocking chairs'],
  mandala: ['a mandala made of flowers', 'a mandala with animals around the edge', 'a sun and moon mandala', 'a mandala of feathers', 'a geometric star mandala'],
  space: ['an astronaut floating among planets', 'a rocket ship and stars', 'a space station over earth', 'an alien garden on a moon', 'a telescope under a starry sky'],
};

export const MAX_PROMPT = 500;
export const MAX_SEED = 999999;
export const DEFAULT_CAP = 150;

export function clampDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

export function cleanSeed(s) {
  const n = Math.floor(Number(s));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(MAX_SEED, n);
}

export function randomSeed(rand = Math.random) {
  return Math.floor(rand() * (MAX_SEED + 1));
}

// Builds the full prompt sent to the drawing AI.
export function buildPrompt(subject, difficulty) {
  const s = String(subject || '').trim().slice(0, MAX_PROMPT);
  if (!s) throw new Error('Please describe a scene or pick a theme.');
  return `${s}. ${DIFFICULTY[clampDifficulty(difficulty)]}. ${BASE_STYLE}`;
}

// Random theme + subject + difficulty + seed.
export function randomPick(rand = Math.random) {
  const names = Object.keys(THEMES);
  const theme = names[Math.floor(rand() * names.length)];
  const list = THEMES[theme];
  return {
    theme,
    subject: list[Math.floor(rand() * list.length)],
    difficulty: 1 + Math.floor(rand() * 5),
    seed: randomSeed(rand),
  };
}

// Cloudflare's free allowance resets at midnight UTC, so the day key is UTC.
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Every theme tap gives a new description (never the same one twice in a row).
export function nextSubject(list, currentText, rand = Math.random) {
  const choices = list.length > 1 ? list.filter(x => x !== currentText) : list;
  return choices[Math.floor(rand() * choices.length)];
}
