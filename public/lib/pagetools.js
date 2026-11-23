// Browser-only helpers: run cleanup on images, make print-sharp versions, PDFs.
import { cleanPixels, toBinary, toRGBA } from './cleanup.js';
import { makePdf } from './pdf.js';

const toBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));

async function pixelsOf(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) };
}

// Original AI picture -> clean pure black-and-white PNG.
export async function cleanBlob(original, thickness = 0) {
  const { c, ctx, data } = await pixelsOf(original);
  const rgba = cleanPixels(data.data, c.width, c.height, { thickness });
  ctx.putImageData(new ImageData(rgba, c.width, c.height), 0, 0);
  return toBlob(c, 'image/png');
}

// Print-sharp version: enlarges 3x with smoothing, then re-sharpens to pure black/white.
// 1024 px -> 3072 px = about 360 DPI across an 8.5 in page.
export async function sharpCanvas(cleanPng, scale = 3) {
  const bmp = await createImageBitmap(cleanPng);
  const w = bmp.width * scale, h = bmp.height * scale;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const d = ctx.getImageData(0, 0, w, h);
  ctx.putImageData(new ImageData(toRGBA(toBinary(d.data, w, h, 128)), w, h), 0, 0);
  return c;
}

export async function sharpPng(cleanPng) {
  const c = await sharpCanvas(cleanPng);
  const b = await toBlob(c, 'image/png');
  c.width = c.height = 0; // free memory on small phones
  return b;
}

// One sharp page as JPEG bytes for PDFs.
export async function pdfImage(cleanPng) {
  const c = await sharpCanvas(cleanPng);
  const jpg = await toBlob(c, 'image/jpeg', 0.92);
  const out = { jpeg: new Uint8Array(await jpg.arrayBuffer()), width: c.width, height: c.height };
  c.width = c.height = 0;
  return out;
}

export async function pagePdf(cleanPng, size = 'letter') {
  const img = await pdfImage(cleanPng);
  return new Blob([makePdf([img], { size })], { type: 'application/pdf' });
}

export function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
