# Coloring Book Studio

Makes adult coloring book pages with AI (free Cloudflare Workers AI), saves them on your phone, and downloads them as PNG.

## Setup on Cloudflare
1. Workers & Pages → Create → Import a repository → pick `coloring-book-studio`, branch `main`.
2. Deploy. The AI connection (`AI`) is set in `wrangler.jsonc`, no API key needed.
3. Check your Workers plan says **Free** (Free can't charge you; it just stops for the day).

Optional: connect a KV namespace with the binding name `USAGE` to have the Worker count pages and enforce the daily cap (`DAILY_CAP`, default 150).

## AI Helper
The **AI Helper** tab chats with a small free text AI (`@cf/meta/llama-3.2-3b-instruct`) for theme ideas, book plans and better scene wording. Tap an idea to load it, or **Batch all** to send every idea to Make Batch. It uses the same free Workers AI daily allowance as the drawings. With `USAGE` KV connected, chat messages are capped separately (`CHAT_CAP`, default 200 a day).

## Tests
`npm test`
