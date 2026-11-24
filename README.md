# Coloring Book Studio

Makes adult coloring book pages with AI (free Cloudflare Workers AI), saves them on your phone, and downloads them as PNG.

## Setup on Cloudflare
1. Workers & Pages → Create → Import a repository → pick `coloring-book-studio`, branch `main`.
2. Deploy. The AI connection (`AI`) is set in `wrangler.jsonc`, no API key needed.
3. Check your Workers plan says **Free** (Free can't charge you; it just stops for the day).

Optional: connect a KV namespace with the binding name `USAGE` to have the Worker count pages and enforce the daily cap (`DAILY_CAP`, default 150).

## AI Helper
The **AI Helper** tab chats with a small free text AI (`@cf/meta/llama-3.2-3b-instruct`) for theme ideas, book plans and better scene wording. Tap an idea to load it, or **Batch all** to send every idea to Make Batch. It uses the same free Workers AI daily allowance as the drawings. With `USAGE` KV connected, chat messages are capped separately (`CHAT_CAP`, default 200 a day). If Cloudflare's chat is capped, used up, or has a problem, the free Pollinations text AI answers instead (no key, no cost).

## Offline Patterns (no internet needed)
On the Make a Page tab: Mandala, Geometric, Stained Glass, Flower Garden, Zentangle Tiles and Kaleidoscope pages drawn with math right on the phone (no AI, no service needed, no daily limit). Uses the difficulty slider; each page has a seed. Pattern pages work with everything else: My Pages, line weight, PNG/PDF, tap-to-fill coloring, Book and Cover. The AI scene pages, AI cover picture and AI Helper still need internet. Open the app once online so it saves to the phone.

## Models tab (offline AI models)
Pick which AI makes pictures and which runs the AI Helper:
- **Pictures:** Cloudflare AI (online), Offline Patterns, or a picture app found on the phone/network (Stable Diffusion WebUI with `--api --cors-allow-origins=*`, or LocalAI-style image models).
- **AI Helper (and back cover words):** Cloudflare AI, a **.gguf model file already on the phone** (Pick a Model File: the app keeps a copy so it's there next time), a small model downloaded in the app (SmolLM2 360M 386 MB, Qwen 2.5 0.5B 398 MB, Llama 3.2 1B 808 MB), an AI app on the phone (Ollama with `OLLAMA_ORIGINS=*`, LM Studio, llama.cpp/LocalAI), or the browser's built-in AI when available.
- **Search This Phone for Models** lists everything found. A browser can't look through a phone's files on its own, so model files are added once with the picker.
- Offline models run in the browser with wllama (llama.cpp). Open the app once online so the engine (about 11 MB) is saved. Tested: SmolLM2 360M answered the AI Helper with the internet off.

## Cover Maker (Book tab)
- 3 cover styles: Classic (white, double border), Banner (color page with title bar), Full picture.
- Pick background and title colors (warns when the title is hard to read), and a cover picture: the first page, any book page, its colored version, or a **full-color AI cover picture** (uses 1 of the day's free pages).
- **Write It With AI**: the AI Helper writes the back cover words.
- **Download Cover PNG** (front cover, for listings).
- **KDP Wraparound Cover PDF**: back + spine + front with 0.125 in bleed, spine width from the page count and paper type (white 0.002252, cream 0.0025, color 0.002347 in per page), a blank barcode box on the back, spine words only at 79+ pages (KDP rule), 300 DPI (drops to 200 if the phone runs out of memory). Warns under 24 pages.

## Tests
`npm test`
