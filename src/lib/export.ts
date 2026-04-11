function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stringBytes(value: string) {
  return new TextEncoder().encode(value);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function makePdfFromJpeg(jpegBytes: Uint8Array, imageWidth: number, imageHeight: number, title: string) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  let drawWidth = usableWidth;
  let drawHeight = drawWidth / imageAspect;
  if (drawHeight > usableHeight) {
    drawHeight = usableHeight;
    drawWidth = drawHeight * imageAspect;
  }
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
  const objects: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  const addObject = (body: Uint8Array) => {
    offsets.push(cursor);
    objects.push(body);
    cursor += body.length;
  };
  const header = stringBytes('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  cursor += header.length;
  addObject(stringBytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
  addObject(stringBytes(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`));
  addObject(stringBytes(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`));
  addObject(concatBytes([
    stringBytes(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
    jpegBytes,
    stringBytes('\nendstream\nendobj\n'),
  ]));
  addObject(stringBytes(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`));
  addObject(stringBytes(`6 0 obj\n<< /Title (${title.replace(/[()\\]/g, '')}) >>\nendobj\n`));
  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const toBuffer = (part: Uint8Array) => part.slice().buffer as ArrayBuffer;
  const parts = [header, ...objects, stringBytes(xref), stringBytes(trailer)].map(toBuffer);
  return new Blob(parts, { type: 'application/pdf' });
}

function inlineComputedStyles(source: Element, target: Element) {
  const win = source.ownerDocument?.defaultView;
  if (!win) return;
  const sourceElements = [source, ...Array.from(source.querySelectorAll('*'))];
  const targetElements = [target, ...Array.from(target.querySelectorAll('*'))];
  sourceElements.forEach((sourceEl, index) => {
    const targetEl = targetElements[index] as HTMLElement | SVGElement | undefined;
    if (!targetEl) return;
    const computed = win.getComputedStyle(sourceEl as Element);
    const styleText = Array.from(computed)
      .filter((prop) => !prop.startsWith('-webkit-tap'))
      .map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
      .join('');
    targetEl.setAttribute('style', styleText);
  });
}

async function svgToCanvas(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  inlineComputedStyles(svg, clone);
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1200, Math.round(viewBox?.width || svg.clientWidth || 1200));
  const height = Math.max(900, Math.round(viewBox?.height || svg.clientHeight || 900));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to render SVG for export.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSvgAsPdf(svg: SVGSVGElement | null, title: string, filename: string) {
  if (!svg) return;
  const canvas = await svgToCanvas(svg);
  const jpeg = canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || '';
  const blob = makePdfFromJpeg(base64ToBytes(jpeg), canvas.width, canvas.height, title);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
