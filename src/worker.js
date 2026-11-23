// Cloudflare Worker: serves the app and talks to the drawing AI.
// No API keys: uses Cloudflare's built-in AI binding (env.AI).
import { buildPrompt, clampDifficulty, cleanSeed, randomSeed, dayKey, DEFAULT_CAP } from '../public/lib/core.js';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function capOf(env) {
  const n = Number(env.DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

// Daily count is kept in KV if a USAGE KV is connected (optional).
async function getCount(env) {
  if (!env.USAGE) return null;
  return Number(await env.USAGE.get('count:' + dayKey())) || 0;
}

async function addCount(env, current) {
  if (!env.USAGE) return;
  await env.USAGE.put('count:' + dayKey(), String(current + 1), { expirationTtl: 172800 });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/usage' && request.method === 'GET') {
    return json({ count: await getCount(env), cap: capOf(env), tracked: !!env.USAGE });
  }

  if (url.pathname === '/api/generate' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }

    let prompt;
    try { prompt = buildPrompt(body.subject, body.difficulty); }
    catch (e) { return json({ error: e.message }, 400); }

    const cap = capOf(env);
    const count = await getCount(env);
    if (count !== null && count >= cap) {
      return json({ error: `Daily limit reached (${cap} pages). It resets at 6 PM Oklahoma time (7 PM in summer).` }, 429);
    }

    const seed = cleanSeed(body.seed) ?? randomSeed();
    let result;
    try {
      result = await env.AI.run(MODEL, { prompt, seed, steps: 4 });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/4006|allocation|limit|quota/i.test(msg)) {
        return json({ error: 'Free daily AI allowance is used up. It resets at 6 PM Oklahoma time (7 PM in summer).' }, 429);
      }
      return json({ error: 'The drawing AI had a problem. Try again.' }, 502);
    }
    if (!result || !result.image) return json({ error: 'The drawing AI sent back nothing. Try again.' }, 502);

    await addCount(env, count ?? 0);
    return new Response(base64ToBytes(result.image), {
      headers: {
        'content-type': 'image/jpeg',
        'x-seed': String(seed),
        'x-difficulty': String(clampDifficulty(body.difficulty)),
        'cache-control': 'no-store',
      },
    });
  }

  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
