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

export function pollinationsUrl(prompt, seed) {
  return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
    `?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
}

// Returns image bytes, or null if the backup failed.
async function pollinations(prompt, seed, env) {
  if (env.POLLINATIONS === 'off') return null;
  const f = env.fetchImpl || fetch;
  try {
    const r = await f(pollinationsUrl(prompt, seed), { signal: AbortSignal.timeout(90000) });
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
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
    const seed = cleanSeed(body.seed) ?? randomSeed();
    const headers = source => ({
      'content-type': 'image/jpeg',
      'x-seed': String(seed),
      'x-difficulty': String(clampDifficulty(body.difficulty)),
      'x-source': source,
      'cache-control': 'no-store',
    });

    // Free backup used when Cloudflare's daily cap or free allowance is used up.
    const backup = async reason => {
      const bytes = await pollinations(prompt, seed, env);
      if (bytes) return new Response(bytes, { headers: headers('pollinations') });
      return json({ error: reason + ' The free backup AI is busy too. Wait a minute and try again.' }, 429);
    };

    if (count !== null && count >= cap) {
      return backup(`Daily limit reached (${cap} pages). It resets at 6 PM Oklahoma time (7 PM in summer).`);
    }

    let result;
    try {
      // flux-1-schnell does not accept a seed (Cloudflare error 5006), so only prompt + steps are sent.
      result = await env.AI.run(MODEL, { prompt, steps: 4 });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/4006|allocation|limit|quota/i.test(msg)) {
        return backup('Free daily AI allowance is used up. It resets at 6 PM Oklahoma time (7 PM in summer).');
      }
      console.error('AI error:', msg);
      if (!env.AI) return json({ error: 'The app is not connected to Cloudflare AI.', detail: 'AI binding missing' }, 500);
      return json({ error: 'The drawing AI had a problem. Try again.', detail: msg.slice(0, 300) }, 502);
    }
    if (!result || !result.image) return json({ error: 'The drawing AI sent back nothing. Try again.' }, 502);

    await addCount(env, count ?? 0);
    return new Response(base64ToBytes(result.image), { headers: headers('cloudflare') });
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
