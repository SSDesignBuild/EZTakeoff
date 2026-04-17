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

type PdfImage = { bytes: Uint8Array; width: number; height: number };

function makePdfFromJpegs(images: PdfImage[], title: string) {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const objects: Uint8Array[] = [];
  const offsets: number[] = [0];
  const header = stringBytes('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  let cursor = header.length;

  const addObject = (body: Uint8Array) => {
    offsets.push(cursor);
    objects.push(body);
    cursor += body.length;
  };

  const pageKids: string[] = [];
  const pageObjectBase = 3;
  const infoObjNum = pageObjectBase + images.length * 3;

  addObject(stringBytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
  const pagesIndex = objects.length;
  addObject(stringBytes(`2 0 obj\n<< /Type /Pages /Kids [] /Count ${images.length} >>\nendobj\n`));

  images.forEach((image, index) => {
    const pageObjNum = pageObjectBase + index * 3;
    const imageObjNum = pageObjNum + 1;
    const contentObjNum = pageObjNum + 2;
    pageKids.push(`${pageObjNum} 0 R`);

    const imageAspect = image.width / Math.max(1, image.height);
    let drawWidth = usableWidth;
    let drawHeight = drawWidth / imageAspect;
    if (drawHeight > usableHeight) {
      drawHeight = usableHeight;
      drawWidth = drawHeight * imageAspect;
    }
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;

    addObject(stringBytes(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObjNum} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentObjNum} 0 R >>\nendobj\n`));
    addObject(concatBytes([
      stringBytes(`${imageObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),
      image.bytes,
      stringBytes('\nendstream\nendobj\n'),
    ]));
    addObject(stringBytes(`${contentObjNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`));
  });

  objects[pagesIndex] = stringBytes(`2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${images.length} >>\nendobj\n`);
  addObject(stringBytes(`${infoObjNum} 0 obj\n<< /Title (${title.replace(/[()\\]/g, '')}) >>\nendobj\n`));

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToCanvas(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove());
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

export async function svgElementToCanvas(svg: SVGSVGElement | null) {
  if (!svg) return null;
  return svgToCanvas(svg);
}

export async function exportCanvasAsPdf(canvas: HTMLCanvasElement, title: string, filename: string) {
  const jpeg = canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || '';
  const blob = makePdfFromJpegs([{ bytes: base64ToBytes(jpeg), width: canvas.width, height: canvas.height }], title);
  triggerDownload(blob, filename);
}

export async function exportCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  triggerDownload(blob, filename);
}

export async function exportCanvasesAsPdf(canvases: HTMLCanvasElement[], title: string, filename: string) {
  const images = canvases.map((canvas) => ({
    bytes: base64ToBytes(canvas.toDataURL('image/jpeg', 0.95).split(',')[1] || ''),
    width: canvas.width,
    height: canvas.height,
  }));
  const blob = makePdfFromJpegs(images, title);
  triggerDownload(blob, filename);
}

export async function exportSvgAsPdf(svg: SVGSVGElement | null, title: string, filename: string) {
  if (!svg) return;
  const canvas = await svgToCanvas(svg);
  await exportCanvasAsPdf(canvas, title, filename);
}

export async function exportSvgSectionsAsPdf(svg: SVGSVGElement | null, title: string, filename: string, sectionSelector = '[data-export-section="true"]', legendSelector = '[data-export-legend="true"]') {
  if (!svg) return;
  const sections = Array.from(svg.querySelectorAll<SVGGElement>(sectionSelector));
  if (sections.length === 0) {
    await exportSvgAsPdf(svg, title, filename);
    return;
  }
  const legend = svg.querySelector<SVGGElement>(legendSelector);
  const canvases: HTMLCanvasElement[] = [];
  for (const section of sections) {
    const bbox = section.getBBox();
    const legendBox = legend?.getBBox();
    const padding = 32;
    const pageWidth = Math.max(900, bbox.width + padding * 2, (legendBox?.width ?? 0) + padding * 2);
    const pageHeight = Math.max(700, bbox.height + padding * 3 + (legendBox?.height ?? 0));
    const clone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${pageWidth} ${pageHeight}`);
    clone.setAttribute('width', String(pageWidth));
    clone.setAttribute('height', String(pageHeight));
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(pageWidth));
    bg.setAttribute('height', String(pageHeight));
    bg.setAttribute('fill', '#ffffff');
    clone.appendChild(bg);
    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('x', String(padding));
    titleText.setAttribute('y', '24');
    titleText.setAttribute('font-size', '18');
    titleText.setAttribute('font-family', 'Inter, Arial, sans-serif');
    titleText.setAttribute('font-weight', '700');
    titleText.setAttribute('fill', '#111111');
    titleText.textContent = title;
    clone.appendChild(titleText);

    const sectionClone = section.cloneNode(true) as SVGGElement;
    inlineComputedStyles(section, sectionClone);
    sectionClone.setAttribute('transform', `translate(${padding - bbox.x}, ${padding + 16 - bbox.y})`);
    clone.appendChild(sectionClone);

    if (legend && legendBox) {
      const legendClone = legend.cloneNode(true) as SVGGElement;
      inlineComputedStyles(legend, legendClone);
      legendClone.setAttribute('transform', `translate(${padding - legendBox.x}, ${padding + bbox.height + 36 - legendBox.y})`);
      clone.appendChild(legendClone);
    }
    canvases.push(await svgToCanvas(clone));
  }
  await exportCanvasesAsPdf(canvases, title, filename);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function htmlElementToCanvas(element: HTMLElement, title: string) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove());
  const width = Math.max(1400, element.scrollWidth + 96);
  const height = Math.max(900, element.scrollHeight + 160);
  const styleBlock = `
    <style>
      *{box-sizing:border-box;font-family:Inter,Arial,sans-serif;color:#111;}
      h1{margin:0 0 16px;font-size:24px;font-weight:700;color:#111;}
      table{width:100%;border-collapse:collapse;font-size:14px;background:#fff;}
      th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top;}
      th{background:#f3f4f6;font-size:12px;text-transform:uppercase;letter-spacing:.06em;}
      .material-group{margin-bottom:18px;}
      .material-group-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;}
      .material-group-header h4{margin:0;font-size:16px;font-weight:700;}
    </style>`;
  const data = `<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;padding:24px;width:${width}px;box-sizing:border-box;">${styleBlock}<h1>${escapeXml(title)}</h1>${clone.outerHTML}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${data}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to render HTML for export.'));
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

export async function exportElementAsPdf(element: HTMLElement | null, title: string, filename: string) {
  if (!element) return;
  const canvas = await htmlElementToCanvas(element, title);
  await exportCanvasAsPdf(canvas, title, filename);
}
