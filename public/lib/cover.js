// Cover maker: styles, layout boxes, colors, KDP wraparound math. Pure functions (testable).
import { MAX_PROMPT } from './core.js';

export const COVER_STYLES = {
  classic: 'Classic (white, double border)',
  banner: 'Banner (color page, title bar)',
  full: 'Full picture (picture fills the cover)',
};

// Amazon KDP spine width per interior page, in inches.
export const PAPER = {
  white: { perPage: 0.002252, label: 'White paper' },
  cream: { perPage: 0.0025, label: 'Cream paper' },
  color: { perPage: 0.002347, label: 'Premium color paper' },
};
export const BLEED = 0.125;          // KDP bleed on every outside edge
export const SAFE = 0.375;           // keep words this far from the trim edge
export const KDP_MIN_PAGES = 24;
export const SPINE_TEXT_MIN = 79;    // KDP only allows spine text at 79+ pages
export const BARCODE = { w: 2, h: 1.2 }; // KDP barcode box, bottom right of the back
export const MAX_BLURB = 900;

export function defaultCover() {
  return {
    style: 'classic', bg: '#ffffff', titleColor: '#000000',
    picture: 'first',      // 'first' | 'ai' | a page id
    useColored: true,      // use the colored version of a page when there is one
    aiSubject: '', blurb: '', paper: 'white',
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
export function cleanHex(v, fallback) { return HEX.test(String(v)) ? String(v).toLowerCase() : fallback; }

// Fixes up saved cover settings (old books have none).
export function cleanCover(c) {
  const d = defaultCover();
  if (!c || typeof c !== 'object') return d;
  return {
    style: COVER_STYLES[c.style] ? c.style : d.style,
    bg: cleanHex(c.bg, d.bg),
    titleColor: cleanHex(c.titleColor, d.titleColor),
    picture: typeof c.picture === 'string' && c.picture ? c.picture : d.picture,
    useColored: c.useColored !== false,
    aiSubject: String(c.aiSubject ?? '').slice(0, MAX_PROMPT),
    blurb: String(c.blurb ?? '').slice(0, MAX_BLURB),
    paper: PAPER[c.paper] ? c.paper : d.paper,
  };
}

// ---- colors ----
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a, b) {
  const [x, y] = [lum(cleanHex(a, '#000000')), lum(cleanHex(b, '#ffffff'))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Black or white, whichever reads better on this background.
export function readableOn(bg) { return contrastRatio(bg, '#000000') >= contrastRatio(bg, '#ffffff') ? '#000000' : '#ffffff'; }
export function hardToRead(text, bg) { return contrastRatio(text, bg) < 4.5; }

// ---- layout ----
// box = the safe area {x,y,w,h} where words and the picture go.
// outer = the whole panel (includes bleed). Returns where everything goes.
export function coverLayout(style, box, outer = box) {
  const { x, y, w, h } = box;
  if (style === 'full') {
    return {
      frame: false,
      picture: { ...outer, fit: 'cover' },
      band: { x: outer.x, y: outer.y, w: outer.w, h: (y - outer.y) + h * 0.24 },
      title: { x, y: y + h * 0.03, w, h: h * 0.2 },
      authorBand: { x: outer.x, y: y + h * 0.9, w: outer.w, h: (outer.y + outer.h) - (y + h * 0.9) },
      author: { x, y: y + h * 0.91, w, h: h * 0.08 },
    };
  }
  if (style === 'banner') {
    const pic = Math.min(w * 0.9, h * 0.62);
    return {
      frame: false,
      band: { x: outer.x, y: y + h * 0.04, w: outer.w, h: h * 0.22 },
      title: { x, y: y + h * 0.05, w, h: h * 0.2 },
      picture: { x: x + (w - pic) / 2, y: y + h * 0.29, w: pic, h: pic, fit: 'contain', border: true },
      author: { x, y: y + h * 0.92, w, h: h * 0.07 },
    };
  }
  // classic (the original look)
  const pic = Math.min(w * 0.82, h * 0.58);
  return {
    frame: true,
    title: { x, y: y + h * 0.06, w, h: h * 0.22 },
    picture: { x: x + (w - pic) / 2, y: y + h * 0.3, w: pic, h: pic, fit: 'contain' },
    author: { x, y: y + h * 0.9, w, h: h * 0.08 },
  };
}

// Where to draw an image inside a box. 'contain' shows all of it, 'cover' fills and crops.
export function placeImage(imgW, imgH, box, fit = 'contain') {
  const s = fit === 'cover' ? Math.max(box.w / imgW, box.h / imgH) : Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * s, h = imgH * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Biggest font size (px) whose wrapped lines fit the box. measure(text, px) → width.
export function fitText(text, box, measure, { max = 200, min = 10, lineGap = 1.15, maxLines = 4 } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return { size: 0, lines: [] };
  for (let px = Math.floor(max); px >= min; px -= 2) {
    const lines = []; let line = '';
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (measure(t, px) > box.w && line) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    const tooWide = lines.some(l => measure(l, px) > box.w);
    if (!tooWide && lines.length <= maxLines && lines.length * px * lineGap <= box.h) return { size: px, lines };
  }
  return { size: min, lines: [words.join(' ')] };
}

// ---- KDP wraparound (back + spine + front) ----
export function spineWidth(pageCount, paper = 'white') {
  const p = PAPER[paper] || PAPER.white;
  return Math.max(0, Math.round(pageCount) || 0) * p.perPage;
}

// trim = {w,h} inches. Returns the full sheet size and where each part sits (inches, from top-left).
export function wrapSize(trim, pageCount, paper = 'white') {
  const spine = spineWidth(pageCount, paper);
  const W = BLEED + trim.w + spine + trim.w + BLEED;
  const H = BLEED + trim.h + BLEED;
  return {
    w: W, h: H, spine,
    back: { x: 0, y: 0, w: BLEED + trim.w, h: H },
    spineBox: { x: BLEED + trim.w, y: 0, w: spine, h: H },
    front: { x: BLEED + trim.w + spine, y: 0, w: trim.w + BLEED, h: H },
    backSafe: { x: BLEED + SAFE, y: BLEED + SAFE, w: trim.w - 2 * SAFE, h: trim.h - 2 * SAFE },
    frontSafe: { x: BLEED + trim.w + spine + SAFE, y: BLEED + SAFE, w: trim.w - 2 * SAFE, h: trim.h - 2 * SAFE },
    barcode: { x: BLEED + trim.w - SAFE - BARCODE.w, y: BLEED + trim.h - SAFE - BARCODE.h, w: BARCODE.w, h: BARCODE.h },
    spineText: pageCount >= SPINE_TEXT_MIN,
  };
}

// Problems to tell the user about before they upload to KDP.
export function kdpWarnings(pageCount) {
  const out = [];
  if (pageCount < KDP_MIN_PAGES) out.push(`KDP needs at least ${KDP_MIN_PAGES} pages; this book has ${pageCount}. Add more designs.`);
  if (pageCount % 2) out.push('Page count is odd; KDP will add 1 blank page at the end (spine is figured with it).');
  if (pageCount < SPINE_TEXT_MIN) out.push(`No spine words: KDP only allows them at ${SPINE_TEXT_MIN}+ pages.`);
  return out;
}
export function kdpPageCount(pageCount) { return pageCount + (pageCount % 2); }

// ---- AI ----
// Full-color picture for the front cover (not a black and white page).
export function buildCoverPrompt(subject) {
  const s = String(subject || '').trim().slice(0, MAX_PROMPT);
  if (!s) throw new Error('Type what the cover picture should show.');
  return `${s}. Vibrant full color illustration for the front cover of an adult coloring book, ` +
    'rich bright colors, detailed, beautiful, centered subject, clean background, no text, no letters, no words, no watermark.';
}

// The message sent to the AI Helper to write the back cover words.
export function blurbRequest(book) {
  const parts = [`Write the back cover description for a coloring book titled "${book.title || 'My Coloring Book'}"`];
  if (book.subtitle) parts.push(`subtitle "${book.subtitle}"`);
  parts.push(`with ${(book.pageIds || []).length} designs`);
  return parts.join(', ') + '. Under 80 words, warm and inviting, plain text only, no IDEA lines, no headings, no quotes.';
}

// Cleans the AI's blurb reply.
export function cleanBlurb(text) {
  return String(text || '').split('\n')
    .filter(l => !/^\s*idea\s*:/i.test(l))
    .join(' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^["']|["']$/g, '').slice(0, MAX_BLURB);
}
