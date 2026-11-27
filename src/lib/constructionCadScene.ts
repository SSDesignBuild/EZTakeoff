/** Shared, canvas-free construction drawing scene. Paper coordinates are points
 * (72/in), positive Y down. Each sheet has ONE physical model scale. DXF maps
 * the whole sheet back to inches; model dimensions therefore remain 1:1. */
export interface CadPoint { x: number; y: number }
export type CadLayer = 'OUTLINE' | 'FOOTINGS' | 'POSTS' | 'BEAMS' | 'JOISTS' |
  'FINISH_SUPPORT' | 'DECKING' | 'STAIRS' | 'LANDING' | 'RAILING' | 'HIDDEN' |
  'CENTER' | 'DIMENSIONS' | 'TAGS' | 'NOTES' | 'TITLE' | 'RIMS' | 'HARDWARE' |
  'SECTION' | 'HATCH' | 'DECK_JOINT';
export interface CadBase { layer: CadLayer; width?: number;
  /** Stable assembly IDs survive preview, PDF and DXF export. */
  sourcePartId?: string; sourceConnectionId?: string;
  graphicRole?: 'part-outline' | 'part-fragment' | 'part-tag' | 'connection-location' | 'connection-tag' | 'section' }
export interface CadLine extends CadBase { type: 'line'; a: CadPoint; b: CadPoint }
export interface CadPolyline extends CadBase { type: 'polyline'; points: CadPoint[]; closed?: boolean }
export interface CadCircle extends CadBase { type: 'circle'; center: CadPoint; radius: number }
export interface CadText extends CadBase { type: 'text'; at: CadPoint; text: string; height: number;
  align?: 'left' | 'center' | 'right'; bold?: boolean; rotation?: number }
export interface CadDimension extends CadBase { type: 'dimension'; a: CadPoint; b: CadPoint;
  offset: number; measuredIn: number; label: string }
export interface CadInsert extends CadBase { type: 'insert'; name: string; at: CadPoint; scale: number }
export type CadPrimitive = CadLine | CadPolyline | CadCircle | CadText;
export type CadEntity = CadPrimitive | CadDimension | CadInsert;
export interface CadBlock { name: string; entities: CadPrimitive[] }
export interface CadView { id: string; projection: 'plan' | 'elevation' | 'profile';
  /** Plan: paper = originPaper + (model - modelOrigin) * pointsPerFt.
   * Elevation/profile Y is reflected; axis describes the horizontal station. */
  originPaper: CadPoint; modelOrigin: CadPoint; pointsPerFt: number;
  axis?: 'x' | 'y' | 'station'; partIds: string[]; connectionIds: string[];
  stationAxis?: { origin: CadPoint; direction: CadPoint };
  clip?: { minX: number; minY: number; maxX: number; maxY: number } }
export interface ConstructionSheet { id: string; title: string; scale: number;
  width: number; height: number; entities: CadEntity[]; views?: CadView[] }
export interface ConstructionDrawingSet { sheets: ConstructionSheet[]; blocks: CadBlock[];
  title: string; revision: string; issues: string[]; warnings: string[];
  /** Complete user values; title blocks use bounded display copies only. */
  projectMetadata?: { jobName: string; address: string; phone: string; revision: string };
  assemblyPartIds?: string[]; assemblyConnectionIds?: string[];
  modelFacts: { tier: string; postCount: number; footingDiameterIn: number;
    footingDepthIn: number; concreteBags: number; stairCount: number;
    landings: { widthFt: number; depthFt: number; thicknessIn: number; bags80lb: number }[] }[] }

export const CAD_SHEET_WIDTH = 17 * 72;
export const CAD_SHEET_HEIGHT = 11 * 72;
export const CAD_LAYERS: Record<CadLayer, { color: number; width: number; dashed?: boolean; dashPattern?: number[] }> = {
  OUTLINE: { color: 7, width: 1.1 }, FOOTINGS: { color: 4, width: .7 },
  POSTS: { color: 7, width: 1.2 }, BEAMS: { color: 1, width: 1.3 },
  JOISTS: { color: 7, width: .6 }, FINISH_SUPPORT: { color: 3, width: .75 },
  DECKING: { color: 8, width: .35 }, STAIRS: { color: 7, width: .7 },
  LANDING: { color: 4, width: .8 }, RAILING: { color: 6, width: 1 },
  HIDDEN: { color: 8, width: .4, dashed: true, dashPattern: [4, 3] },
  CENTER: { color: 8, width: .3, dashed: true, dashPattern: [10, 3, 2, 3] },
  RIMS: { color: 7, width: .8 }, HARDWARE: { color: 2, width: .85 },
  SECTION: { color: 7, width: 1.2 }, HATCH: { color: 8, width: .2 }, DECK_JOINT: { color: 8, width: .55 },
  DIMENSIONS: { color: 7, width: .4 }, TAGS: { color: 7, width: .5 },
  NOTES: { color: 7, width: .4 }, TITLE: { color: 7, width: .8 },
};

/** 1/16-in display only. All measured endpoints retain their model precision. */
export function cadFeet(inches: number): string {
  if (!Number.isFinite(inches)) return 'UNSET';
  const sign = inches < 0 ? '-' : '';
  const ticks = Math.round(Math.abs(inches) * 16);
  const feet = Math.floor(ticks / 192), whole = Math.floor(ticks % 192 / 16);
  let numerator = ticks % 16, denominator = 16;
  while (numerator && numerator % 2 === 0) { numerator /= 2; denominator /= 2; }
  return `${sign}${feet}'-${whole}${numerator ? ` ${numerator}/${denominator}` : ''}"`;
}
export function cadInches(inches: number): string {
  return `${Number(inches.toFixed(4))} in`;
}
export function cadText(text: unknown): string {
  return String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u00d7/g, 'x').replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"').replace(/\u2026/g, '...').replace(/\u00b7/g, ' / ');
}
export function line(sheet: ConstructionSheet, a: CadPoint, b: CadPoint, layer: CadLayer = 'OUTLINE', width?: number) {
  sheet.entities.push({ type: 'line', a, b, layer, width });
}
export function poly(sheet: ConstructionSheet, points: CadPoint[], layer: CadLayer = 'OUTLINE', closed = false) {
  if (points.length > 1) sheet.entities.push({ type: 'polyline', points, layer, closed });
}
export function rect(sheet: ConstructionSheet, x: number, y: number, w: number, h: number, layer: CadLayer = 'OUTLINE') {
  poly(sheet, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], layer, true);
}
export function text(sheet: ConstructionSheet, x: number, y: number, value: unknown, height = 9,
  layer: CadLayer = 'NOTES', bold = false, align: CadText['align'] = 'left') {
  sheet.entities.push({ type: 'text', at: { x, y }, text: cadText(value), height, layer, bold, align });
}
export function wrapped(sheet: ConstructionSheet, x: number, y: number, value: string, width: number,
  height = 8.5, leading = height * 1.45, bold = false): number {
  const max = Math.max(8, Math.floor(width / (height * .6)));
  const words = cadText(value).split(/\s+/);
  let row = '';
  for (let word of words) {
    if (row && row.length + word.length + 1 > max) { text(sheet, x, y, row, height, 'NOTES', bold); y += leading; row = ''; }
    while (word.length > max) { text(sheet, x, y, word.slice(0, max), height, 'NOTES', bold); y += leading; word = word.slice(max); }
    row += (row ? ' ' : '') + word;
  }
  if (row) { text(sheet, x, y, row, height, 'NOTES', bold); y += leading; }
  return y;
}
export function dimension(sheet: ConstructionSheet, a: CadPoint, b: CadPoint, offset: number, label?: string) {
  const measuredIn = Math.hypot(b.x - a.x, b.y - a.y) * sheet.scale / 72;
  if (measuredIn < 1e-6) return;
  sheet.entities.push({ type: 'dimension', a, b, offset, measuredIn,
    label: label ?? cadFeet(measuredIn), layer: 'DIMENSIONS' });
}
export function dimensionGeometry(entity: CadDimension): CadPrimitive[] {
  const dx = entity.b.x - entity.a.x, dy = entity.b.y - entity.a.y, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len, tx = dx / len, ty = dy / len;
  const along = (p: CadPoint, amount: number): CadPoint => ({ x: p.x + nx * amount, y: p.y + ny * amount });
  const a = along(entity.a, entity.offset), b = along(entity.b, entity.offset);
  const sign = Math.sign(entity.offset) || 1, layer = 'DIMENSIONS' as const;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const rotation = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
  const result: CadPrimitive[] = [
    { type: 'line', a: along(entity.a, sign * 3), b: along(a, sign * 4), layer },
    { type: 'line', a: along(entity.b, sign * 3), b: along(b, sign * 4), layer },
    { type: 'line', a, b, layer },
    { type: 'text', at: { x: (a.x + b.x) / 2 + nx * -5, y: (a.y + b.y) / 2 + ny * -5 },
      text: entity.label, height: 8.2, align: 'center', rotation, layer },
  ];
  for (const p of [a, b]) result.push({ type: 'line',
    a: { x: p.x - (tx + nx) * 2.7, y: p.y - (ty + ny) * 2.7 },
    b: { x: p.x + (tx + nx) * 2.7, y: p.y + (ty + ny) * 2.7 }, layer, width: .8 });
  return result;
}
export function transformPrimitive(e: CadPrimitive, scale: number, offset: CadPoint): CadPrimitive {
  const at = (p: CadPoint) => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y });
  if (e.type === 'line') return { ...e, a: at(e.a), b: at(e.b) };
  if (e.type === 'polyline') return { ...e, points: e.points.map(at) };
  if (e.type === 'circle') return { ...e, center: at(e.center), radius: e.radius * scale };
  return { ...e, at: at(e.at), height: e.height * scale };
}
export function sheetPrimitives(sheet: ConstructionSheet, blocks: CadBlock[]): CadPrimitive[] {
  return sheet.entities.flatMap((e): CadPrimitive[] => {
    if (e.type === 'dimension') return dimensionGeometry(e);
    if (e.type === 'insert') return (blocks.find(b => b.name === e.name)?.entities ?? []).map(p => transformPrimitive(p, e.scale, e.at));
    return [e];
  });
}
const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function constructionSheetSvg(sheet: ConstructionSheet, blocks: CadBlock[]): string {
  const n = (x: number) => Number(x.toFixed(5));
  const shapes = sheetPrimitives(sheet, blocks).map(e => {
    const style = CAD_LAYERS[e.layer], stroke = e.layer === 'HIDDEN' || e.layer === 'DECKING' ? '#64748b' : '#172332';
    const attrs = `fill="none" stroke="${stroke}" stroke-width="${e.width ?? style.width}"${style.dashed ? ` stroke-dasharray="${(style.dashPattern ?? [4, 3]).join(' ')}"` : ''}${e.sourcePartId ? ` data-part-id="${xml(e.sourcePartId)}"` : ''}${e.sourceConnectionId ? ` data-connection-id="${xml(e.sourceConnectionId)}"` : ''}`;
    if (e.type === 'line') return `<line x1="${n(e.a.x)}" y1="${n(e.a.y)}" x2="${n(e.b.x)}" y2="${n(e.b.y)}" ${attrs}/>`;
    if (e.type === 'polyline') return `<${e.closed ? 'polygon' : 'polyline'} points="${e.points.map(p => `${n(p.x)},${n(p.y)}`).join(' ')}" ${attrs}/>`;
    if (e.type === 'circle') return `<circle cx="${n(e.center.x)}" cy="${n(e.center.y)}" r="${n(e.radius)}" ${attrs}/>`;
    return `<text x="${n(e.at.x)}" y="${n(e.at.y)}" font-family="Courier New,Courier,monospace" font-size="${e.height}" font-weight="${e.bold ? 'bold' : 'normal'}" fill="#172332" text-anchor="${e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}"${e.rotation ? ` transform="rotate(${e.rotation} ${n(e.at.x)} ${n(e.at.y)})"` : ''}>${xml(e.text)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" data-construction-cad="true" role="img" aria-label="${xml(sheet.id + ' ' + sheet.title)}" viewBox="0 0 ${sheet.width} ${sheet.height}" width="${sheet.width}" height="${sheet.height}"><title>${xml(sheet.id + ' ' + sheet.title)}</title><rect width="100%" height="100%" fill="white"/>${shapes.join('')}</svg>`;
}
