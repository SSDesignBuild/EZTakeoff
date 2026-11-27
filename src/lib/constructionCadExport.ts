import { CAD_LAYERS, cadFeet, cadText, dimensionGeometry, sheetPrimitives,
  type CadPrimitive, type CadPoint, type ConstructionDrawingSet } from './constructionCadScene';

/** Native PDF paths and Standard-14 text: no canvas, image, screenshot or
 * third-party runtime is involved. Courier keeps preview/print line wrapping
 * deterministic. PDF page dimensions are physical 17 x 11 inches. */
export function constructionVectorPdf(set: ConstructionDrawingSet): Uint8Array {
  const objects: string[] = [];
  const add = (value: string) => { objects.push(value); return objects.length; };
  const number = (v: number) => Number(v.toFixed(6)).toString();
  const pdfText = (s: string) => cadText(s).replace(/[^\x20-\xff]/g, '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const hexUnicode = (s: string) => 'FEFF' + s.split('').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  const pages: number[] = [];
  for (const sheet of set.sheets) {
    const cmds = ['q', '1 1 1 rg', `0 0 ${sheet.width} ${sheet.height} re f`, '0.09 0.13 0.18 RG', '0.09 0.13 0.18 rg', '1 J 1 j'];
    const xy = (p: CadPoint) => `${number(p.x)} ${number(sheet.height - p.y)}`;
    for (const e of sheetPrimitives(sheet, set.blocks)) {
      const style = CAD_LAYERS[e.layer];
      cmds.push(`${number(e.width ?? style.width)} w`, style.dashed ? '[4 3] 0 d' : '[] 0 d');
      if (e.type === 'line') cmds.push(`${xy(e.a)} m ${xy(e.b)} l S`);
      else if (e.type === 'polyline') cmds.push(`${e.points.map((p, i) => `${xy(p)} ${i ? 'l' : 'm'}`).join(' ')} ${e.closed ? 'h' : ''} S`);
      else if (e.type === 'circle') {
        const { x, y } = e.center, r = e.radius, k = r * .552284749831;
        cmds.push(`${xy({ x: x + r, y })} m`,
          `${xy({ x: x + r, y: y + k })} ${xy({ x: x + k, y: y + r })} ${xy({ x, y: y + r })} c`,
          `${xy({ x: x - k, y: y + r })} ${xy({ x: x - r, y: y + k })} ${xy({ x: x - r, y })} c`,
          `${xy({ x: x - r, y: y - k })} ${xy({ x: x - k, y: y - r })} ${xy({ x, y: y - r })} c`,
          `${xy({ x: x + k, y: y - r })} ${xy({ x: x + r, y: y - k })} ${xy({ x: x + r, y })} c S`);
      } else {
        const angle = -(e.rotation ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const shift = e.height * .6 * cadText(e.text).length * (e.align === 'center' ? .5 : e.align === 'right' ? 1 : 0);
        const x = e.at.x - shift * c, y = sheet.height - e.at.y - shift * s;
        cmds.push(`BT /${e.bold ? 'F2' : 'F1'} ${e.height} Tf ${number(c)} ${number(s)} ${number(-s)} ${number(c)} ${number(x)} ${number(y)} Tm (${pdfText(e.text)}) Tj ET`);
      }
    }
    cmds.push('Q');
    const stream = cmds.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const page = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${sheet.width} ${sheet.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`);
    pages.push(page);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(p => `${p} 0 R`).join(' ')}] >>`;
  const info = add(`<< /Title <${hexUnicode(set.title)}> /Author (S&S Design Build) /Subject (Dimensioned construction coordination drawings) /Producer (EZTakeoff vector construction sheets) >>`);
  let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(output.length); output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => offset.toString().padStart(10, '0') + ' 00000 n \n').join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(output, c => c.charCodeAt(0) & 255);
}

/** AutoCAD 2013 ASCII DXF. Sheets are arranged side by side in MODEL SPACE.
 * Physical geometry is inches at 1:1; plot each sheet border at its printed
 * 1:n scale. Dimensions are native, editable, non-associative DIMENSION
 * entities with anonymous graphics blocks (not exploded text/lines alone). */
export function constructionDxf(set: ConstructionDrawingSet): string {
  type Pair = [number, string | number];
  const pairs: Pair[] = [];
  let handle = 256;
  const next = () => (handle++).toString(16).toUpperCase();
  const put = (...values: Pair[]) => pairs.push(...values);
  const tableHandles = Object.fromEntries(['LTYPE', 'LAYER', 'STYLE', 'DIMSTYLE', 'APPID', 'BLOCK_RECORD'].map(name => [name, next()]));
  const blockRecords = new Map<string, string>();
  const blockData = new Map<string, { entities: CadPrimitive[]; factor: number; x: number; height: number; symbol: boolean }>();
  for (const name of ['*Model_Space', '*Paper_Space', ...set.blocks.map(b => b.name)]) blockRecords.set(name, next());
  for (const block of set.blocks) blockData.set(block.name, { entities: block.entities, factor: 1, x: 0, height: 0, symbol: true });
  const dimNames = new Map<object, string>();
  const offsets: number[] = [];
  let offset = 0, dimIndex = 0;
  set.sheets.forEach(sheet => {
    offsets.push(offset);
    const factor = sheet.scale / 72;
    for (const e of sheet.entities) if (e.type === 'dimension') {
      const name = `*D${++dimIndex}`;
      dimNames.set(e, name); blockRecords.set(name, next());
      blockData.set(name, { entities: dimensionGeometry(e), factor, x: offset, height: sheet.height, symbol: false });
    }
    offset += sheet.width * factor + 72;
  });
  const modelRecord = blockRecords.get('*Model_Space')!;
  const startTable = (name: string, count: number) => put([0, 'TABLE'], [2, name], [5, tableHandles[name]], [330, '0'], [100, 'AcDbSymbolTable'], [70, count]);
  const record = (name: string, table: string, subclass: string) => put([0, name], [5, next()], [330, tableHandles[table]], [100, 'AcDbSymbolTableRecord'], [100, subclass]);
  put([0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [9, '$INSUNITS'], [70, 1],
    [9, '$MEASUREMENT'], [70, 0], [9, '$LUNITS'], [70, 4], [9, '$LUPREC'], [70, 4],
    [9, '$DIMASSOC'], [280, 1], [9, '$DWGCODEPAGE'], [3, 'ANSI_1252'], [0, 'ENDSEC']);
  put([0, 'SECTION'], [2, 'TABLES']);
  startTable('LTYPE', 2);
  for (const dashed of [false, true]) {
    record('LTYPE', 'LTYPE', 'AcDbLinetypeTableRecord');
    put([2, dashed ? 'DASHED' : 'CONTINUOUS'], [70, 0], [3, dashed ? 'Hidden / center' : 'Solid'], [72, 65], [73, dashed ? 2 : 0], [40, dashed ? 4 : 0]);
    if (dashed) put([49, 2], [74, 0], [49, -2], [74, 0]);
  }
  put([0, 'ENDTAB']);
  startTable('LAYER', Object.keys(CAD_LAYERS).length + 1);
  for (const [name, style] of [['0', { color: 7, width: .5, dashed: false }], ...Object.entries(CAD_LAYERS)] as [string, { color: number; width: number; dashed?: boolean }][]) {
    record('LAYER', 'LAYER', 'AcDbLayerTableRecord');
    const weights = [13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60];
    const weight = weights.reduce((best, value) => Math.abs(value - style.width * 35.28) < Math.abs(best - style.width * 35.28) ? value : best);
    put([2, name], [70, 0], [62, style.color], [6, style.dashed ? 'DASHED' : 'CONTINUOUS'], [370, weight]);
  }
  put([0, 'ENDTAB']);
  startTable('STYLE', 1); record('STYLE', 'STYLE', 'AcDbTextStyleTableRecord');
  put([2, 'Standard'], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, 'txt'], [4, ''], [0, 'ENDTAB']);
  startTable('APPID', 1); record('APPID', 'APPID', 'AcDbRegAppTableRecord');
  put([2, 'ACAD'], [70, 0], [0, 'ENDTAB']);
  const scales = [...new Set(set.sheets.map(s => s.scale))];
  startTable('DIMSTYLE', scales.length);
  for (const scale of scales) {
    put([0, 'DIMSTYLE'], [105, next()], [330, tableHandles.DIMSTYLE], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbDimStyleTableRecord'],
      [2, `SNS_${scale}`], [70, 0], [40, 1], [41, scale * .035], [42, scale * .04], [44, scale * .05],
      [140, scale * 8.2 / 72], [147, scale * .05], [271, 4], [277, 4], [280, 0]);
  }
  put([0, 'ENDTAB']);
  startTable('BLOCK_RECORD', blockRecords.size);
  for (const [name, id] of blockRecords) put([0, 'BLOCK_RECORD'], [5, id], [330, tableHandles.BLOCK_RECORD],
    [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [70, 0], [280, 1], [281, 0]);
  put([0, 'ENDTAB'], [0, 'ENDSEC']);
  const base = (type: string, layer: string, owner: string) => put([0, type], [5, next()], [330, owner], [100, 'AcDbEntity'], [8, layer]);
  const point = (code: number, p: CadPoint) => put([code, p.x], [code + 10, p.y], [code + 20, 0]);
  const primitive = (e: CadPrimitive, owner: string, factor: number, x: number, height: number) => {
    const at = (p: CadPoint) => ({ x: x + p.x * factor, y: (height - p.y) * factor });
    if (e.type === 'line') { base('LINE', e.layer, owner); put([100, 'AcDbLine']); point(10, at(e.a)); point(11, at(e.b)); }
    else if (e.type === 'circle') { base('CIRCLE', e.layer, owner); put([100, 'AcDbCircle']); point(10, at(e.center)); put([40, e.radius * factor]); }
    else if (e.type === 'polyline') {
      base('LWPOLYLINE', e.layer, owner); put([100, 'AcDbPolyline'], [90, e.points.length], [70, e.closed ? 1 : 0]);
      for (const p of e.points) { const q = at(p); put([10, q.x], [20, q.y]); }
    } else {
      base('TEXT', e.layer, owner); put([100, 'AcDbText']); point(10, at(e.at));
      put([40, e.height * factor], [1, cadText(e.text)], [50, -(e.rotation ?? 0)], [7, 'Standard'], [72, e.align === 'center' ? 1 : e.align === 'right' ? 2 : 0]);
      point(11, at(e.at)); put([100, 'AcDbText'], [73, 0]);
    }
  };
  put([0, 'SECTION'], [2, 'BLOCKS']);
  for (const [name, owner] of blockRecords) {
    base('BLOCK', '0', owner); put([100, 'AcDbBlockBegin'], [2, name], [70, name.startsWith('*D') ? 1 : 0]); point(10, { x: 0, y: 0 }); put([3, name], [1, '']);
    const block = blockData.get(name);
    if (block) for (const e of block.entities) primitive(e, owner, block.factor, block.x, block.height);
    base('ENDBLK', '0', owner); put([100, 'AcDbBlockEnd']);
  }
  put([0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']);
  set.sheets.forEach((sheet, index) => {
    const factor = sheet.scale / 72, x = offsets[index];
    const at = (p: CadPoint) => ({ x: x + p.x * factor, y: (sheet.height - p.y) * factor });
    for (const e of sheet.entities) {
      if (e.type === 'insert') {
        base('INSERT', e.layer, modelRecord); put([100, 'AcDbBlockReference'], [2, e.name]); point(10, at(e.at));
        put([41, e.scale * factor], [42, e.scale * factor], [43, e.scale * factor]);
      } else if (e.type === 'dimension') {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, len = Math.hypot(dx, dy);
        const d = { x: e.b.x - dy / len * e.offset, y: e.b.y + dx / len * e.offset };
        const label = dimensionGeometry(e).find(p => p.type === 'text');
        base('DIMENSION', e.layer, modelRecord); put([100, 'AcDbDimension'], [2, dimNames.get(e)!]); point(10, at(d));
        point(11, at(label?.type === 'text' ? label.at : d));
        // Preserve a live measurement placeholder: editing definition points
        // in CAD must not leave a hard-coded, stale numeric text override.
        const formatted = cadFeet(e.measuredIn);
        const nativeText = e.label.includes(formatted) ? e.label.replace(formatted, '<>') : e.label.replace(/^[0-9.]+ in\b/, '<>');
        put([70, 33], [1, nativeText.includes('<>') ? nativeText : '<>'], [3, `SNS_${sheet.scale}`], [42, e.measuredIn], [100, 'AcDbAlignedDimension']);
        point(13, at(e.a)); point(14, at(e.b));
      } else primitive(e, modelRecord, factor, x, sheet.height);
    }
  });
  put([0, 'ENDSEC'], [0, 'EOF']);
  const headerEnd = pairs.findIndex(([code, value]) => code === 0 && value === 'ENDSEC');
  pairs.splice(headerEnd, 0, [9, '$HANDSEED'], [5, next()]);
  return pairs.map(([code, value]) => `${code}\n${typeof value === 'number' ? Number(value.toFixed(9)) : value}\n`).join('');
}
