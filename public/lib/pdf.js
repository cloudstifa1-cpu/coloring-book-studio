// Tiny PDF maker: puts JPEG images on pages. No outside library needed.
// Sizes are in inches. Each image is fitted inside the margins and centered.

export const PAGE_SIZES = {
  letter: { w: 8.5, h: 11, label: '8.5 × 11 in' },
  '8x10': { w: 8, h: 10, label: '8 × 10 in' },
  '6x9': { w: 6, h: 9, label: '6 × 9 in' },
};

export function fitImage(imgW, imgH, pageW, pageH, margin) {
  const boxW = pageW - 2 * margin, boxH = pageH - 2 * margin;
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale, h = imgH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

// pages: [{ jpeg: Uint8Array, width, height } | { blank: true }]
export function makePdf(pages, { size = 'letter', margin = 0.5 } = {}) {
  const ps = PAGE_SIZES[size] || PAGE_SIZES.letter;
  const PW = ps.w * 72, PH = ps.h * 72, M = margin * 72;
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = part => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); length += b.length; };

  // Object numbers: 1 catalog, 2 pages, then per page: page, content, (image)
  let next = 3;
  const plan = pages.map(p => {
    const o = { page: next++, content: next++ };
    if (!p.blank) o.image = next++;
    return o;
  });

  const startObj = n => { offsets[n] = length; push(`${n} 0 obj\n`); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  startObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2); push(`<< /Type /Pages /Kids [${plan.map(o => `${o.page} 0 R`).join(' ')}] /Count ${plan.length} >>\nendobj\n`);

  pages.forEach((p, i) => {
    const o = plan[i];
    const res = p.blank ? '<< >>' : `<< /XObject << /Im${i} ${o.image} 0 R >> >>`;
    startObj(o.page);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${res} /Contents ${o.content} 0 R >>\nendobj\n`);
    let stream = '';
    if (!p.blank) {
      const f = fitImage(p.width, p.height, PW, PH, M);
      stream = `q ${f.w.toFixed(2)} 0 0 ${f.h.toFixed(2)} ${f.x.toFixed(2)} ${f.y.toFixed(2)} cm /Im${i} Do Q`;
    }
    startObj(o.content);
    push(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    if (!p.blank) {
      startObj(o.image);
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream\nendobj\n');
    }
  });

  const xref = length;
  let x = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let n = 1; n < next; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
