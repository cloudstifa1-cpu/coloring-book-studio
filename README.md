# Coloring Book Studio

Makes adult coloring book pages with AI (free Cloudflare Workers AI), saves them on your phone, and downloads them as PNG.

## Setup on Cloudflare
1. Workers & Pages → Create → Import a repository → pick `coloring-book-studio`, branch `main`.
2. Deploy. The AI connection (`AI`) is set in `wrangler.jsonc`, no API key needed.
3. Check your Workers plan says **Free** (Free can't charge you; it just stops for the day).

Optional: connect a KV namespace with the binding name `USAGE` to have the Worker count pages and enforce the daily cap (`DAILY_CAP`, default 150).

## Tests
`npm test`
