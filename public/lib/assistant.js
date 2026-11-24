// AI Helper: shared logic for the chat assistant (browser + Worker).
// Pure functions only, so every piece can be tested.
import { THEMES, MAX_PROMPT, clampDifficulty } from './core.js';

export const TEXT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const MAX_TURNS = 12;        // history sent to the AI (keeps it small and cheap)
export const MAX_MSG = 1200;        // longest single message kept
export const MAX_IDEAS = 10;
export const DEFAULT_CHAT_CAP = 200;

export const SYSTEM_PROMPT =
  'You are the helper inside Coloring Book Studio, an app that makes black and white adult coloring book pages ' +
  '(not pornographic, nothing violent or gory). Help the user pick themes, plan coloring books, and write scene ' +
  'descriptions for the drawing AI. Keep answers short and plain. Whenever you suggest scenes that could be drawn, ' +
  'put each one on its own line starting with "IDEA:" followed by one clear scene of under 40 words, describing ' +
  'only what is in the picture (no colors, no shading words). Built-in themes are: ' + Object.keys(THEMES).join(', ') + '.';

export const QUICK = {
  themes: 'Give me 6 fresh coloring page theme ideas with one scene for each.',
  book: 'Help me plan a coloring book: suggest a title, a theme, and 10 page scenes that fit together.',
  improve: 'Make this scene better for a coloring page and give me 3 versions: ',
};

function clip(s, n) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n); }

// Keeps only valid user/assistant turns, trims them, and keeps the newest ones.
export function cleanHistory(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = clip(m.content, MAX_MSG);
    if (content) out.push({ role: m.role, content });
  }
  return out.slice(-MAX_TURNS);
}

// Messages sent to the text AI. Throws if the last turn is not a user message.
export function buildMessages(history, context = {}) {
  const turns = cleanHistory(history);
  if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('Type a message first.');
  let sys = SYSTEM_PROMPT;
  if (context.theme && THEMES[context.theme]) sys += ` The user has the "${context.theme}" theme picked.`;
  if (context.difficulty) sys += ` Their difficulty is ${clampDifficulty(context.difficulty)} of 5.`;
  return [{ role: 'system', content: sys }, ...turns];
}

// Pulls the "IDEA:" lines out of a reply. Also accepts numbered/bulleted IDEA lines.
export function parseIdeas(text) {
  const seen = new Set();
  const ideas = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])?\s*\**\s*idea\s*\d*\s*\**\s*[:\-–]\s*(.+)$/i);
    if (!m) continue;
    const idea = clip(m[1].replace(/\*\*/g, '').replace(/^["']|["']$/g, ''), MAX_PROMPT);
    const key = idea.toLowerCase();
    if (idea.length < 4 || seen.has(key)) continue;
    seen.add(key);
    ideas.push(idea);
    if (ideas.length >= MAX_IDEAS) break;
  }
  return ideas;
}

// Reply text with the IDEA lines removed (they are shown as buttons instead).
export function stripIdeas(text) {
  return String(text ?? '').split('\n')
    .filter(l => !/^\s*(?:[-*•]|\d+[.)])?\s*\**\s*idea\s*\d*\s*\**\s*[:\-–]/i.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Workers AI text models answer in a couple of shapes; this gets the words out.
export function replyText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.response === 'string') return result.response;
  const c = result.choices && result.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  return '';
}

// Small offline models often list ideas as bullets instead of IDEA lines.
// Turns "* Gothic: a church with stained glass" lines into ideas (label dropped).
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(?:\*\*)?(?:[^:*]{1,30}(?:\*\*)?:\s*(?:\*\*)?\s*)?(.+)$/;
export function bulletIdeas(text) {
  const seen = new Set(), out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(BULLET);
    if (!m) continue;
    const idea = clip(m[1].replace(/\*\*/g, '').replace(/^["']|["']$/g, ''), MAX_PROMPT);
    if (idea.length < 12 || seen.has(idea.toLowerCase())) continue;
    seen.add(idea.toLowerCase()); out.push(idea);
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}
export function stripBullets(text) {
  return String(text ?? '').split('\n').filter(l => !BULLET.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
