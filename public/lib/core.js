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
  gothic: [
    'a gothic cathedral window with roses',
    'a raven perched on an old iron gate',
    'a candlelit gothic library',
    'a moonlit cemetery with ornate tombstones',
    'a vampire castle on a cliff',
    'a stone gargoyle on a cathedral roof',
    'a haunted Victorian mansion in fog',
    'a black cat on a pile of old spellbooks',
    'an ornate pocket watch with skulls and roses',
    'a bat-winged lantern hanging in an archway',
    'a crumbling abbey with ivy',
    'a lace-veiled bride statue in a garden',
    'a raven skull with moths and flowers',
    'an old pipe organ in a dark chapel',
    'a wrought iron spiral staircase in a tower',
  ],
  fantasy: [
    'a wizard tower in an enchanted forest',
    'a fairy village inside mushrooms',
    'a unicorn by a waterfall',
    'a mermaid castle under the sea',
    'an elven city in giant trees',
    'a phoenix rising from flames',
    'a griffin on a mountain ledge',
    'a potion shop full of bottles',
    'a knight and horse before a castle gate',
    'an enchanted tea party in the woods',
    'a floating island with waterfalls',
    'a crystal cave with glowing gems',
    'a treasure map with compass and ship',
    'a sorceress reading a spellbook by candlelight',
    'a magic forest door in a giant tree',
  ],
  dragons: [
    'a dragon curled around a treasure pile',
    'a dragon flying over mountains',
    'a baby dragon hatching from an egg',
    'a dragon sleeping in a cave',
    'two dragons in an ornate circle',
    'a dragon guarding a castle tower',
    'a sea dragon rising from waves',
    'a dragon with a knight on its back',
    'a dragon perched on a ruined bridge',
    'a Chinese dragon with clouds and pearls',
    'a dragon wrapped around a full moon',
    'a dragon skull with flowers growing',
    'a dragon reading a book in a library',
    'a dragon nest on a volcano',
    'a mother dragon with baby dragons',
  ],
  animals: [
    'an owl in a tree full of leaves',
    'a fox in a flower meadow',
    'a lion with a decorative mane',
    'an elephant with patterned blanket',
    'a cat sleeping on a windowsill',
    'a deer in a snowy forest',
    'a wolf howling at the moon',
    'a peacock with its tail spread',
    'a horse running through a field',
    'a hummingbird at a flower',
    'a bear catching a fish in a river',
    'a hedgehog in autumn leaves',
    'a giraffe under an acacia tree',
    'a rabbit family in a garden',
    'a tiger resting in tall grass',
  ],
  flowers: [
    'a bouquet of roses and lilies',
    'a sunflower field',
    'a garden of peonies with butterflies',
    'a wreath of wildflowers',
    'lotus flowers on a pond',
    'a vase of tulips on a table',
    'a cherry blossom branch',
    'a hanging basket of petunias',
    'a rose climbing a garden trellis',
    'a cactus garden in the desert',
    'an orchid in a decorative pot',
    'a field of lavender with bees',
    'a daisy chain heart',
    'a dahlia close-up with layered petals',
    'a window box full of geraniums',
  ],
  ocean: [
    'a sea turtle swimming through coral',
    'an octopus with curling tentacles',
    'a lighthouse on rocky shore with waves',
    'a whale with fish around it',
    'seashells and starfish on sand',
    'a jellyfish group drifting',
    'a pirate shipwreck on the sea floor',
    'a seahorse in seaweed',
    'dolphins jumping over waves',
    'a crab on a beach with sandcastle',
    'a tropical island with palm trees',
    'a coral reef with many fish',
    'a manta ray gliding',
    'a sailboat on a calm sea',
    'an underwater treasure chest',
  ],
  cities: [
    'a cozy European street with shops',
    'a city skyline at night',
    'a Venice canal with gondolas',
    'a busy old-time market',
    'a row of Victorian houses',
    'the Eiffel Tower with a Paris street cafe',
    'a Japanese street with lanterns',
    'a New York brownstone with stairs',
    'a Moroccan market with lamps',
    'a castle town on a hill',
    'a rainy street with umbrellas',
    'a harbor town with fishing boats',
    'a train station with a big clock',
    'a rooftop garden over the city',
    'a little bookshop on a corner',
  ],
  cottage: [
    'a cozy cottage with a flower garden',
    'a cottage kitchen with teapots and plants',
    'a reading nook with books and a cat',
    'a treehouse with lanterns',
    'a country porch with rocking chairs',
    'a cottage bedroom with a quilt',
    'a garden shed with tools and pots',
    'a farmhouse with a red barn',
    'a bakery shelf with breads and pies',
    'a cottage in the snow at Christmas',
    'a greenhouse full of plants',
    'a well and stone path in a garden',
    'a cozy fireplace with stockings',
    'a picnic basket on a blanket',
    'a hobbit-style hill house',
  ],
  mandala: [
    'a mandala made of flowers',
    'a mandala with animals around the edge',
    'a sun and moon mandala',
    'a mandala of feathers',
    'a geometric star mandala',
    'a butterfly mandala',
    'an ocean wave mandala',
    'a lotus mandala',
    'a snowflake mandala',
    'a heart mandala with roses',
    'a celtic knot mandala',
    'an owl mandala',
    'a sunflower mandala',
    'a moon phases mandala',
    'a paisley mandala',
  ],
  space: [
    'an astronaut floating among planets',
    'a rocket ship and stars',
    'a space station over earth',
    'an alien garden on a moon',
    'a telescope under a starry sky',
    'a planet with rings and moons',
    'an astronaut planting a flag on the moon',
    'a galaxy swirl with stars',
    'a robot exploring Mars',
    'a comet over a mountain',
    'an observatory dome at night',
    'a UFO over a farm field',
    'a space cat in a helmet',
    'the solar system planets in a row',
    'a moon base with domes',
  ],
  people: [
    'a woman with flowers in her long hair',
    'an old fisherman mending a net',
    'a ballerina dancing on stage',
    'a cowboy on a horse at sunset',
    'a girl reading under a tree',
    'a grandmother knitting by the fire',
    'a musician playing guitar on a porch',
    'a chef cooking in a busy kitchen',
    'a gardener with a wheelbarrow of flowers',
    'a woman in a Victorian dress with a parasol',
    'a samurai in armor under cherry blossoms',
    'a family having a picnic',
    'a painter at an easel by a lake',
    'a blacksmith at an anvil',
    'a dancer in a flowing skirt',
  ],
  vehicles: [
    'a classic 1950s car at a diner',
    'a steam train crossing a bridge',
    'a vintage motorcycle on a country road',
    'a hot air balloon over hills',
    'a sailing ship on the ocean',
    'a big rig truck on the highway',
    'an old biplane in the clouds',
    'a fire truck with ladders',
    'a tractor in a farm field',
    'a monster truck jumping',
    'a vintage camper van at the beach',
    'a bicycle with a flower basket',
    'a submarine under the sea',
    'a helicopter over a city',
    'a race car on a track',
  ],
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
