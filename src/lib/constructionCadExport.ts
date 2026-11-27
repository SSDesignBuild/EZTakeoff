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
      const dash = style.dashPattern ?? (style.dashed ? [4, 3] : []);
      cmds.push(`${number(e.width ?? style.width)} w`, dash.length ? `[${dash.join(' ')}] 0 d` : '[] 0 d');
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

/** AutoCAD 2013 ASCII DXF. Full-size inch geometry lives in modelspace;
 * every sheet also has a named 17 x 11 inch paperspace layout and a locked
 * viewport at its exact print scale. Native dimensions retain live <> text.
 * Part/connection references survive export as registered EZTAKEOFF XDATA. */
export function constructionDxf(set: ConstructionDrawingSet): string {
  type Pair = [number, string | number];
  const pairs: Pair[] = [];
  let handle = 256;
  const next = () => (handle++).toString(16).toUpperCase();
  const put = (...values: Pair[]) => pairs.push(...values);
  const tableHandles = Object.fromEntries(['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'DIMSTYLE', 'APPID', 'BLOCK_RECORD'].map(name => [name, next()]));
  const rootDictionary = next(), layoutDictionary = next(), modelLayout = next();
  const paperLayouts = set.sheets.map((sheet, index) => ({ sheet, id: next(),
    blockName: index ? `*Paper_Space${index - 1}` : '*Paper_Space', mainViewport: next(), modelViewport: next() }));
  const blockRecords = new Map<string, string>();
  const blockData = new Map<string, { entities: CadPrimitive[]; factor: number; x: number; height: number; symbol: boolean }>();
  for (const name of ['*Model_Space', ...paperLayouts.map(p => p.blockName), ...set.blocks.map(b => b.name)]) blockRecords.set(name, next());
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
    [9, '$DIMASSOC'], [280, 1], [9, '$DWGCODEPAGE'], [3, 'ANSI_1252'],
    [9, '$TILEMODE'], [70, 0], [9, '$CTAB'], [1, set.sheets[0]?.id ?? 'Model'],
    [9, '$LTSCALE'], [40, 1], [9, '$PSLTSCALE'], [70, 1], [9, '$LWDISPLAY'], [290, 1],
    [9, '$EXTMIN'], [10, 0], [20, 0], [30, 0],
    [9, '$EXTMAX'], [10, offset], [20, Math.max(1, ...set.sheets.map(s => s.height * s.scale / 72))], [30, 0], [0, 'ENDSEC']);
  put([0, 'SECTION'], [2, 'TABLES']);
  startTable('VPORT', 1); record('VPORT', 'VPORT', 'AcDbViewportTableRecord');
  put([2, '*Active'], [70, 0], [10, 0], [20, 0], [11, 1], [21, 1], [12, offset / 2], [22, 132],
    [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [40, Math.max(264, offset / 2)], [41, 1.5], [42, 50], [0, 'ENDTAB']);
  const patterns: [string, number[]][] = [['CONTINUOUS', []], ['DASHED', [4 / 72, -3 / 72]], ['CENTER', [10 / 72, -3 / 72, 2 / 72, -3 / 72]]];
  startTable('LTYPE', patterns.length);
  for (const [name, pattern] of patterns) {
    record('LTYPE', 'LTYPE', 'AcDbLinetypeTableRecord');
    put([2, name], [70, 0], [3, name], [72, 65], [73, pattern.length], [40, pattern.reduce((sum, n) => sum + Math.abs(n), 0)]);
    for (const dash of pattern) put([49, dash], [74, 0]);
  }
  put([0, 'ENDTAB']);
  startTable('LAYER', Object.keys(CAD_LAYERS).length + 2);
  for (const [name, style] of [['0', { color: 7, width: .5, dashed: false }], ['VIEWPORTS', { color: 7, width: .13 }], ...Object.entries(CAD_LAYERS)] as [string, { color: number; width: number; dashed?: boolean }][]) {
    record('LAYER', 'LAYER', 'AcDbLayerTableRecord');
    const weights = [13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60];
    const weight = weights.reduce((best, value) => Math.abs(value - style.width * 35.28) < Math.abs(best - style.width * 35.28) ? value : best);
    put([2, name], [70, 0], [62, style.color], [6, name === 'CENTER' ? 'CENTER' : style.dashed ? 'DASHED' : 'CONTINUOUS'], [370, weight]);
    if (name === 'VIEWPORTS') put([290, 0]);
  }
  put([0, 'ENDTAB']);
  startTable('STYLE', 1); record('STYLE', 'STYLE', 'AcDbTextStyleTableRecord');
  put([2, 'Standard'], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, 'txt'], [4, ''], [0, 'ENDTAB']);
  startTable('APPID', 2);
  for (const name of ['ACAD', 'EZTAKEOFF']) { record('APPID', 'APPID', 'AcDbRegAppTableRecord'); put([2, name], [70, 0]); }
  put([0, 'ENDTAB']);
  const scales = [...new Set(set.sheets.map(s => s.scale))];
  startTable('DIMSTYLE', scales.length);
  for (const scale of scales) {
    put([0, 'DIMSTYLE'], [105, next()], [330, tableHandles.DIMSTYLE], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbDimStyleTableRecord'],
      [2, `SNS_${scale}`], [70, 0], [40, 1], [41, scale * .035], [42, scale * .04], [44, scale * .05],
      [140, scale * 8.2 / 72], [147, scale * .05], [271, 4], [277, 4], [280, 0]);
  }
  put([0, 'ENDTAB']);
  startTable('BLOCK_RECORD', blockRecords.size);
  for (const [name, id] of blockRecords) {
    put([0, 'BLOCK_RECORD'], [5, id], [330, tableHandles.BLOCK_RECORD],
      [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name]);
    const layout = name === '*Model_Space' ? modelLayout : paperLayouts.find(p => p.blockName === name)?.id;
    if (layout) put([340, layout]);
    put([70, 1], [280, 1], [281, 0]);
  }
  put([0, 'ENDTAB'], [0, 'ENDSEC']);
  const base = (type: string, layer: string, owner: string) => put([0, type], [5, next()], [330, owner], [100, 'AcDbEntity'], [8, layer]);
  const point = (code: number, p: CadPoint) => put([code, p.x], [code + 10, p.y], [code + 20, 0]);
  const reference = (e: { sourcePartId?: string; sourceConnectionId?: string; graphicRole?: string }, sheetId?: string) => {
    if (!sheetId && !e.sourcePartId && !e.sourceConnectionId) return;
    put([1001, 'EZTAKEOFF']);
    for (const [key, value] of [['SHEET', sheetId], ['REV', set.revision], ['PART', e.sourcePartId], ['CONNECTION', e.sourceConnectionId], ['ROLE', e.graphicRole]])
      if (value) put([1000, `${key}=${cadText(value)}`.slice(0, 255)]);
  };
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
  const paperViewports = (layout: typeof paperLayouts[number], index: number) => {
    const s = layout.sheet, w = s.width / 72, h = s.height / 72, owner = blockRecords.get(layout.blockName)!;
    for (const main of [true, false]) {
      put([0, 'VIEWPORT'], [5, main ? layout.mainViewport : layout.modelViewport], [330, owner],
        [100, 'AcDbEntity'], [67, 1], [410, s.id], [8, 'VIEWPORTS'], [100, 'AcDbViewport']);
      point(10, { x: w / 2, y: h / 2 });
      put([40, w], [41, h], [68, main ? 1 : 2], [69, main ? 1 : 2],
        [12, main ? w / 2 : offsets[index] + w * s.scale / 2], [22, main ? h / 2 : h * s.scale / 2],
        [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [42, 50],
        [45, main ? h : h * s.scale], [50, 0], [51, 0], [72, 100], [90, main ? 0 : 16384], [281, 0], [71, 0]);
    }
  };
  put([0, 'SECTION'], [2, 'BLOCKS']);
  for (const [name, owner] of blockRecords) {
    base('BLOCK', '0', owner); put([100, 'AcDbBlockBegin'], [2, name], [70, name.startsWith('*D') ? 1 : 0]); point(10, { x: 0, y: 0 }); put([3, name], [1, '']);
    const block = blockData.get(name);
    if (block) for (const e of block.entities) primitive(e, owner, block.factor, block.x, block.height);
    // DXF stores inactive paperspace entities inside their owning BLOCK.
    const paperIndex = paperLayouts.findIndex(p => p.blockName === name);
    if (paperIndex > 0) paperViewports(paperLayouts[paperIndex], paperIndex);
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
      reference(e, sheet.id);
    }
  });
  if (paperLayouts[0]) paperViewports(paperLayouts[0], 0);
  put([0, 'ENDSEC'], [0, 'SECTION'], [2, 'OBJECTS']);
  put([0, 'DICTIONARY'], [5, rootDictionary], [330, '0'], [100, 'AcDbDictionary'], [280, 0], [281, 1],
    [3, 'ACAD_LAYOUT'], [350, layoutDictionary]);
  put([0, 'DICTIONARY'], [5, layoutDictionary], [330, rootDictionary], [100, 'AcDbDictionary'], [280, 0], [281, 1],
    [3, 'Model'], [350, modelLayout]);
  for (const layout of paperLayouts) put([3, layout.sheet.id], [350, layout.id]);
  const layoutObject = (name: string, id: string, owner: string, tab: number, w: number, h: number, viewport?: string) => {
    put([0, 'LAYOUT'], [5, id], [330, layoutDictionary], [100, 'AcDbPlotSettings'],
      [1, ''], [2, ''], [4, 'ANSI_B_(17.00_x_11.00_Inches)'], [6, ''],
      [40, 0], [41, 0], [42, 0], [43, 0], [44, w * 25.4], [45, h * 25.4], [46, 0], [47, 0],
      [142, 1], [143, 1], [70, tab ? 672 : 1696], [72, 0], [73, 0], [74, 5], [7, 'monochrome.ctb'],
      [75, 16], [76, 0], [77, 2], [78, 300], [147, 1 / 25.4], [100, 'AcDbLayout'],
      [1, name], [70, 1], [71, tab], [10, 0], [20, 0], [11, w], [21, h]);
    point(12, { x: 0, y: 0 }); point(14, { x: 0, y: 0 }); point(15, { x: w, y: h });
    put([146, 0]); point(13, { x: 0, y: 0 }); point(16, { x: 1, y: 0 }); point(17, { x: 0, y: 1 });
    put([76, 1], [330, owner]); if (viewport) put([331, viewport]);
  };
  layoutObject('Model', modelLayout, modelRecord, 0, offset, 264);
  paperLayouts.forEach((p, i) => layoutObject(p.sheet.id, p.id, blockRecords.get(p.blockName)!, i + 1,
    p.sheet.width / 72, p.sheet.height / 72, p.mainViewport));
  put([0, 'ENDSEC'], [0, 'EOF']);
  const headerEnd = pairs.findIndex(([code, value]) => code === 0 && value === 'ENDSEC');
  pairs.splice(headerEnd, 0, [9, '$HANDSEED'], [5, next()]);
  const dxfText = (value: string) => value.replace(/[^\x20-\x7e]/g,
    c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  return pairs.map(([code, value]) => `${code}\n${typeof value === 'number' ? Number(value.toFixed(9)) : dxfText(value)}\n`).join('');
}
