/** Installer sheets consume physical parts from the authoritative assembly.
 * No board, member, stair or connector placement is reconstructed here. */
import type { buildConstructionAssembly } from './constructionAssembly';
import type { DeckPoint } from './types';
import { cadFeet, cadText, line, poly, text, wrapped, dimension, dimensionGeometry,
  type CadLayer, type CadPoint, type ConstructionSheet, type ConstructionDrawingSet, type CadView } from './constructionCadScene';

type Assembly = ReturnType<typeof buildConstructionAssembly>;
type Part = Assembly['parts'][number];
type Connection = Assembly['connections'][number];
type Tier = Assembly['tiers'][number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type PaperBox = { x: number; y: number; width: number; height: number };
export interface InstallerSheetContext {
  set: ConstructionDrawingSet;
  newSheet: (title: string, scale: number, id?: string) => ConstructionSheet;
  tablePages: (prefix: string, title: string, headers: string[], widths: number[], rows: string[][]) => void;
}
const SCALES = [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768];
const fitScale = (n: number) => SCALES.find(v => v >= n) ?? Math.ceil(n / 96) * 96;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
const sortUnique = (v: number[]) => [...v].sort((a, b) => a - b).filter((x, i, a) => !i || !near(x, a[i - 1]));
const pointsBounds = (pts: DeckPoint[]): Bounds => ({ minX: Math.min(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)), maxX: Math.max(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)) });
const inside = (p: DeckPoint, b: Bounds) => p.x >= b.minX - 1e-7 && p.x <= b.maxX + 1e-7 && p.y >= b.minY - 1e-7 && p.y <= b.maxY + 1e-7;
const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const kindLabel = (kind: string) => kind.replace(/-/g, ' ').toUpperCase();
const inches = (n: number) => Number(n.toFixed(4));
const layerFor = (part: Part): CadLayer => ({ footing: 'FOOTINGS', post: 'POSTS', beam: 'BEAMS', joist: 'JOISTS', rim: 'RIMS', 'flat-nailer': 'FINISH_SUPPORT',
  'field-board': 'DECKING', subfloor: 'DECKING', 'picture-frame': 'DECK_JOINT', breaker: 'DECK_JOINT', fascia: 'RIMS', 'stair-stringer': 'STAIRS', tread: 'DECKING', riser: 'RIMS',
  'stair-fascia': 'RIMS', landing: 'LANDING', 'rail-post': 'RAILING', rail: 'RAILING', picket: 'RAILING', glass: 'RAILING', cable: 'RAILING',
  'drink-rail': 'RAILING', 'skirt-board': 'DECKING', 'skirt-support': 'RIMS', gate: 'RAILING' }[part.kind] as CadLayer | undefined) ?? 'OUTLINE';

/** Axis-aligned clipping is used only for enlarged detail windows. Whole-part
 * outlines on the preceding overview retain every original assembly vertex. */
export function clipConstructionPolygon(points: DeckPoint[], bounds: Bounds): DeckPoint[] {
  let output = points.map(p => ({ ...p }));
  for (const [axis, value, keepGreater] of [['x', bounds.minX, true], ['x', bounds.maxX, false], ['y', bounds.minY, true], ['y', bounds.maxY, false]] as const) {
    const input = output; output = [];
    if (!input.length) break;
    const included = (p: DeckPoint) => keepGreater ? p[axis] >= value - 1e-9 : p[axis] <= value + 1e-9;
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length], ai = included(a), bi = included(b);
      if (ai) output.push(a);
      if (ai !== bi) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
  }
  return output.filter((p, i, a) => !i || !near(p.x, a[i - 1].x) || !near(p.y, a[i - 1].y));
}
function centroid(points: DeckPoint[]): DeckPoint {
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
}
function convexHull(points: CadPoint[]): CadPoint[] {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: CadPoint, a: CadPoint, b: CadPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: CadPoint[] = [], upper: CadPoint[] = [];
  for (const a of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], a) <= 1e-9) lower.pop(); lower.push(a); }
  for (const a of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], a) <= 1e-9) upper.pop(); upper.push(a); }
  lower.pop(); upper.pop(); return [...lower, ...upper];
}
function polygonsTouch(a: CadPoint[], b: CadPoint[]): boolean {
  if (!overlaps(pointsBounds(a), pointsBounds(b))) return false;
  const cross = (p: CadPoint, q: CadPoint, r: CadPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const contains = (p: CadPoint, polygon: CadPoint[]) => {
    let included = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const q = polygon[i], r = polygon[j];
      if ((q.y > p.y) !== (r.y > p.y) && p.x < (r.x - q.x) * (p.y - q.y) / (r.y - q.y) + q.x) included = !included;
    }
    return included;
  };
  if (a.some(p => contains(p, b)) || b.some(p => contains(p, a))) return true;
  return a.some((p, i) => b.some((q, j) => {
    const end = a[(i + 1) % a.length], other = b[(j + 1) % b.length];
    return overlaps(pointsBounds([p, end]), pointsBounds([q, other])) &&
      cross(p, end, q) * cross(p, end, other) <= 1e-8 && cross(q, other, p) * cross(q, other, end) <= 1e-8;
  }));
}
function annotation(sheet: ConstructionSheet, part: Part, at: CadPoint, label: string, rotation = 0) {
  sheet.entities.push({ type: 'text', layer: 'TAGS', at, text: cadText(label), height: 8, align: 'center', rotation, sourcePartId: part.id, graphicRole: 'part-tag' });
}
function crosshair(sheet: ConstructionSheet, p: CadPoint, radius = 9) {
  line(sheet, { x: p.x - radius, y: p.y }, { x: p.x + radius, y: p.y }, 'CENTER');
  line(sheet, { x: p.x, y: p.y - radius }, { x: p.x, y: p.y + radius }, 'CENTER');
}
function hatch(sheet: ConstructionSheet, polygon: CadPoint[], sourcePartId?: string) {
  if (polygon.length < 3) return;
  const bounds = pointsBounds(polygon), delta = 9;
  for (let s = bounds.minX + bounds.minY; s <= bounds.maxX + bounds.maxY; s += delta) {
    const hits: CadPoint[] = [];
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length], da = a.x + a.y - s, db = b.x + b.y - s;
      if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) { const t = da / (da - db); hits.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }); }
    });
    hits.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < hits.length; i += 2) sheet.entities.push({ type: 'line', a: hits[i], b: hits[i + 1], layer: 'HATCH', sourcePartId, graphicRole: 'section' });
  }
}
function sidePanel(s: ConstructionSheet, heading: string, notes: string[], rows: string[] = []) {
  text(s, 924, 116, heading, 10, 'NOTES', true);
  let y = 137;
  for (const note of notes) y = wrapped(s, 924, y, note, 248, 8, 11) + 10;
  for (const row of rows) { if (y > 620) break; y = wrapped(s, 924, y, row, 248, 8, 10) + 5; }
}
function viewFor(s: ConstructionSheet, id: string, bounds: Bounds, box: PaperBox, scale: number, parts: Part[], connections: Connection[] = []): { view: CadView; at: (p: DeckPoint) => CadPoint } {
  const f = 864 / scale, origin = { x: box.x + (box.width - (bounds.maxX - bounds.minX) * f) / 2, y: box.y + (box.height - (bounds.maxY - bounds.minY) * f) / 2 };
  const view: CadView = { id, projection: 'plan', originPaper: origin, modelOrigin: { x: bounds.minX, y: bounds.minY }, pointsPerFt: f, partIds: parts.map(p => p.id), connectionIds: connections.map(c => c.id) };
  s.views = [...(s.views ?? []), view];
  return { view, at: p => ({ x: origin.x + (p.x - bounds.minX) * f, y: origin.y + (p.y - bounds.minY) * f }) };
}
function partOutline(s: ConstructionSheet, p: Part, at: (p: DeckPoint) => CadPoint, clip?: Bounds, hidden = false) {
  const pts = clip ? clipConstructionPolygon(p.footprint, clip) : p.footprint;
  if (pts.length < 3) return;
  const clipped = !!clip && p.footprint.some(q => !inside(q, clip));
  s.entities.push({ type: 'polyline', points: pts.map(at), closed: true, layer: hidden ? 'HIDDEN' : layerFor(p),
    sourcePartId: p.id, graphicRole: clipped ? 'part-fragment' : 'part-outline' });
}

/** Collision-aware tags never shrink below 8 pt. Small/crowded pieces are
 * resolved by a keyed enlarged detail; every ID also appears in the cut index. */
function tagParts(s: ConstructionSheet, parts: Part[], at: (p: DeckPoint) => CadPoint, box: PaperBox, withLength: boolean, clip?: Bounds): Set<string> {
  const placed: Bounds[] = [], tagged = new Set<string>();
  const faces = parts.map(p => (clip ? clipConstructionPolygon(p.footprint, clip) : p.footprint).map(at)).filter(p => p.length >= 3);
  const fixedAnnotations: CadPoint[][] = s.entities.filter(e => e.type === 'dimension').flatMap(dimensionGeometry).flatMap(e => {
    if (e.type === 'line') return [[e.a, e.b]];
    if (e.type !== 'text') return [];
    const width = e.text.length * e.height * .6, left = e.align === 'center' ? -width / 2 : e.align === 'right' ? -width : 0;
    const angle = (e.rotation ?? 0) * Math.PI / 180, c = Math.cos(angle), sn = Math.sin(angle);
    return [[[left, -e.height], [left + width, -e.height], [left + width, 0], [left, 0]].map(([x, y]) => ({ x: e.at.x + c * x - sn * y, y: e.at.y + sn * x + c * y }))];
  });
  for (const p of [...parts].sort((a, b) => b.cutLengthFt - a.cutLengthFt || a.id.localeCompare(b.id))) {
    const footprint = clip ? clipConstructionPolygon(p.footprint, clip) : p.footprint;
    if (footprint.length < 3) continue;
    const a = at(p.axis.from), b = at(p.axis.to), center = at(centroid(footprint));
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let angle = length > 1 ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    // A vertical fascia face is far too thin for a plan label. Keep its full
    // source ID on a clear leader; finished cuts remain in the piece index.
    const fascia = p.kind === 'fascia';
    const label = p.id + (withLength && !fascia && p.cutLengthFt > .1 ? ` / ${cadFeet(p.cutLengthFt * 12)}` : '');
    const tw = label.length * 4.8, th = 9, c = Math.cos(angle), sn = Math.sin(angle);
    const bw = Math.abs(c) * tw + Math.abs(sn) * th, bh = Math.abs(sn) * tw + Math.abs(c) * th;
    if (Math.max(length, Math.max(...footprint.map(q => at(q).x)) - Math.min(...footprint.map(q => at(q).x))) < tw * .45 && p.kind !== 'post' && p.kind !== 'footing' && p.kind !== 'rail-post') continue;
    let found = false;
    for (const fraction of [.5, .25, .75]) {
      const target = length > 1 && !clip ? { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction } : center;
      for (const offset of fascia ? [18, -18, 40, -40] : [0, 11, -11, 22, -22]) {
        const anchor = { x: target.x - sn * offset, y: target.y + c * offset };
        const bounds = { minX: anchor.x - bw / 2 - 2, maxX: anchor.x + bw / 2 + 2, minY: anchor.y - bh / 2 - 2, maxY: anchor.y + bh / 2 + 2 };
        if (bounds.minX < Math.max(40, box.x - (fascia ? 26 : 0)) || bounds.maxX > Math.min(1180, box.x + box.width + (fascia ? 26 : 0)) || bounds.minY < box.y || bounds.maxY > box.y + box.height || placed.some(v => overlaps(v, bounds))) continue;
        if (fascia) {
          const labelFace = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({
            x: anchor.x + c * u * (tw / 2 + 2) - sn * v * (th / 2 + 2),
            y: anchor.y + sn * u * (tw / 2 + 2) + c * v * (th / 2 + 2),
          }));
          if ([...faces, ...fixedAnnotations].some(face => polygonsTouch(labelFace, face))) continue;
          const gap = Math.sign(offset) * (th / 2 + 3);
          s.entities.push({ type: 'line', a: target, b: { x: anchor.x + sn * gap, y: anchor.y - c * gap }, layer: 'TAGS', width: .25, sourcePartId: p.id, graphicRole: 'part-tag' });
        } else if (Math.abs(offset) > 5) line(s, target, anchor, 'TAGS', .25);
        annotation(s, p, { x: anchor.x - sn * 2, y: anchor.y + c * 2 }, label, angle * 180 / Math.PI);
        placed.push(bounds); tagged.add(p.id); found = true; break;
      }
      if (found) break;
    }
  }
  return tagged;
}
function overallDimensions(s: ConstructionSheet, bounds: Bounds, at: (p: DeckPoint) => CadPoint) {
  dimension(s, at({ x: bounds.minX, y: bounds.minY }), at({ x: bounds.maxX, y: bounds.minY }), -31);
  dimension(s, at({ x: bounds.minX, y: bounds.minY }), at({ x: bounds.minX, y: bounds.maxY }), 34);
}
function deckContext(s: ConstructionSheet, tier: Tier, at: (p: DeckPoint) => CadPoint, clip?: Bounds) {
  const points = clip ? clipConstructionPolygon(tier.deck.points, clip) : tier.deck.points;
  poly(s, points.map(at), 'HIDDEN', true);
  for (const index of tier.deck.houseEdgeIndices) {
    const edge = tier.deck.edgeSegments[index];
    if (edge && (!clip || inside(edge.start, clip) && inside(edge.end, clip))) line(s, at(edge.start), at(edge.end), 'OUTLINE', 2);
  }
}
function planSheet(ctx: InstallerSheetContext, tier: Tier, title: string, parts: Part[], opts: { notes?: string[]; bounds?: Bounds; scale?: number; context?: Part[]; clip?: Bounds; lengths?: boolean; dimensions?: boolean; fullWidth?: boolean; connections?: Connection[]; tagKinds?: string[]; datumNote?: boolean } = {}) {
  const bounds = opts.bounds ?? pointsBounds(parts.flatMap(p => p.footprint));
  const box: PaperBox = { x: 96, y: 153, width: opts.fullWidth ? 1020 : 770, height: 438 };
  const scale = opts.scale ?? fitScale(Math.max((bounds.maxX - bounds.minX) * 864 / box.width, (bounds.maxY - bounds.minY) * 864 / box.height, 8));
  const s = ctx.newSheet(`${tier.label} / ${title}`, scale);
  const { at, view } = viewFor(s, `${s.id}-PLAN`, bounds, box, scale, parts, opts.connections);
  view.partIds = [...new Set([...view.partIds, ...(opts.context ?? []).map(p => p.id)])];
  if (opts.clip) view.clip = opts.clip;
  deckContext(s, tier, at, opts.clip ?? bounds);
  opts.context?.forEach(p => partOutline(s, p, at, opts.clip ?? bounds, true));
  parts.forEach(p => partOutline(s, p, at, opts.clip));
  if (opts.dimensions !== false) overallDimensions(s, bounds, at);
  const tagged = tagParts(s, opts.tagKinds ? parts.filter(p => opts.tagKinds!.includes(p.kind)) : parts, at, { x: box.x - 10, y: 126, width: box.width + 20, height: 492 }, opts.lengths ?? true, opts.clip);
  if (!opts.fullWidth) sidePanel(s, 'PARTS / SETOUT', [
    `${parts.length} physical pieces in this view. ID = cut index reference. Lengths are finished model lengths.`,
    'Solid outlines show dressed faces. Overall dimensions are to the shown outside faces. Broken lines are context; the heavy edge is the saved house attachment.',
    ...(opts.notes ?? []),
  ]);
  if (opts.datumNote !== false) text(s, 96, 631, opts.clip ? 'DETAIL WINDOW / CONTINUING MEMBERS ARE CLIPPED AT WINDOW LIMITS' : 'SAVED PLAN DATUM / X RIGHT, Y DOWN / COORDINATES IN CUT INDEX', 7.5);
  return { sheet: s, at, bounds, box, tagged, scale };
}
function detailWindows(ctx: InstallerSheetContext, tier: Tier, title: string, parts: Part[], unresolved: Set<string>, context: Part[] = []) {
  if (!unresolved.size) return;
  const b = pointsBounds(parts.flatMap(p => p.footprint));
  // A detail is always a genuinely enlarged physical view. Tiles are indexed by
  // model coordinates, not by arbitrary order in the parts array.
  const span = 6, windows = new Map<string, Bounds>();
  for (const p of parts.filter(p => unresolved.has(p.id))) {
    const c = centroid(p.footprint), ix = Math.floor((c.x - b.minX) / span), iy = Math.floor((c.y - b.minY) / span);
    windows.set(`${ix}/${iy}`, { minX: b.minX + ix * span - .25, minY: b.minY + iy * span - .25, maxX: b.minX + (ix + 1) * span + .25, maxY: b.minY + (iy + 1) * span + .25 });
  }
  let no = 0;
  for (const window of windows.values()) {
    const selected = parts.filter(p => overlaps(pointsBounds(p.footprint), window));
    planSheet(ctx, tier, `${title} / DETAIL ${++no}`, selected, { bounds: window, clip: window, scale: 16, context,
      notes: [`Window X ${cadFeet(window.minX * 12)} to ${cadFeet(window.maxX * 12)}; Y ${cadFeet(window.minY * 12)} to ${cadFeet(window.maxY * 12)}.`,
        'Refer to the full-view outline and part index for a continuing member\'s true endpoints.'], lengths: false });
  }
}
function setout(ctx: InstallerSheetContext, tier: Tier, parts: Part[]) {
  const posts = parts.filter(p => p.kind === 'post'), footings = parts.filter(p => p.kind === 'footing');
  const bounds = pointsBounds([...tier.deck.points, ...footings.flatMap(p => p.footprint)]);
  const { sheet: s, at } = planSheet(ctx, tier, 'FOUNDATION / POST CENTER SETOUT', [...footings, ...posts], {
    bounds, lengths: false, datumNote: false, notes: ['Crosshairs are post/footing centers. Chain dimensions are between actual support stations; the cut index shows endpoints, and Deck parts CSV gives 6-decimal-inch coordinates.',
      `${tier.deck.footingDiameterIn} in diameter x ${tier.deck.footingDepthIn} in depth. See F1 section and concrete order.`] });
  for (const p of posts) crosshair(s, at(p.axis.from), 11);
  // Chained setout references post centers, not member outside faces.
  const xs = sortUnique(posts.map(p => p.axis.from.x)), ys = sortUnique(posts.map(p => p.axis.from.y));
  const chain = (stations: number[], axis: 'x' | 'y') => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = axis === 'x' ? { x: stations[i], y: bounds.maxY } : { x: bounds.maxX, y: stations[i] };
      const b = axis === 'x' ? { x: stations[i + 1], y: bounds.maxY } : { x: bounds.maxX, y: stations[i + 1] };
      if (Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y) > 30) dimension(s, at(a), at(b), axis === 'x' ? 26 : -26);
    }
  };
  chain(xs, 'x'); chain(ys, 'y');
  // Native reference dimensions to first support from the saved deck corner.
  if (xs.length) dimension(s, at({ x: tier.deck.minX, y: bounds.maxY }), at({ x: xs[0], y: bounds.maxY }), 48);
  if (ys.length) dimension(s, at({ x: bounds.maxX, y: tier.deck.minY }), at({ x: bounds.maxX, y: ys[0] }), -48);
  text(s, 96, 647, 'SETOUT TO POST CENTERS / SAVED PLAN DATUM: X RIGHT, Y DOWN / XYZ IN CUT INDEX + CSV', 7.5);
  const rows = [
    ...tier.deck.points.map((p, i) => [`V${i + 1}`, p.x.toFixed(6), p.y.toFixed(6), tier.heightFt.toFixed(6), 'Saved deck outline vertex; X/Y datum retained']),
    ...posts.map(p => [p.id, p.axis.from.x.toFixed(6), p.axis.from.y.toFixed(6), `${p.zBottom.toFixed(6)} / ${p.zTop.toFixed(6)}`, `${p.nominalSize ?? p.label}; ${inches(p.dressed.widthIn)} x ${inches(p.dressed.depthIn)} in actual`]),
  ];
  tier.deck.points.forEach((p, i) => text(s, at(p).x + 5, at(p).y + 14, `V${i + 1}`, 8, 'TAGS'));
  if (rows.length <= 12) {
    text(s, 924, 438, 'REFERENCE    X(ft)     Y(ft)', 8, 'NOTES', true);
    rows.forEach((r, i) => text(s, 924, 456 + i * 13, `${r[0].padEnd(11)} ${Number(r[1]).toFixed(3).padStart(8)} ${Number(r[2]).toFixed(3).padStart(8)}`, 7.5));
    text(s, 924, 625, 'CSV XYZ: 6 decimal inches.', 7.5);
  } else ctx.tablePages(`P${tier.id}`, `${tier.label} / SUPPORT + VERTEX COORDINATES`, ['REFERENCE', 'X (ft)', 'Y (ft)', 'BASE / TOP Z (ft)', 'PHYSICAL SIZE / SETOUT'], [180, 155, 155, 220, 428], rows);
}
function elevation(ctx: InstallerSheetContext, tier: Tier, parts: Part[], axis: 'x' | 'y', skirt = false, forcedScale?: number) {
  const selected = parts.filter(p => (skirt ? ['skirt-board', 'skirt-support'] : ['footing', 'post', 'beam', 'joist', 'rim', 'field-board', 'picture-frame', 'breaker', 'subfloor', 'flat-nailer', 'fascia']).includes(p.kind));
  if (!selected.length) return;
  const stations = selected.flatMap(p => p.footprint.map(q => q[axis]));
  const min = Math.min(...stations), max = Math.max(...stations), zmin = Math.min(0, ...selected.map(p => p.zBottom)), zmax = Math.max(...selected.map(p => p.zTop));
  const scale = forcedScale ?? fitScale(Math.max((max - min) * 864 / 770, (zmax - zmin) * 864 / 385, 8)), f = 864 / scale;
  const s = ctx.newSheet(`${tier.label} / ${axis === 'x' ? 'FRONT X' : 'SIDE Y'} ${skirt ? 'SKIRT FINISH' : 'FRAMING'} ELEVATION`, scale);
  const origin = { x: 96 + (770 - (max - min) * f) / 2, y: 565 - (-zmin) * f };
  const at = (station: number, z: number): CadPoint => ({ x: origin.x + (station - min) * f, y: origin.y - z * f });
  s.views = [{ id: `${s.id}-ELEVATION`, projection: 'elevation', axis, originPaper: origin, modelOrigin: { x: min, y: 0 }, pointsPerFt: f, partIds: selected.map(p => p.id), connectionIds: [] }];
  const rank = (p: Part) => ['footing', 'post', 'beam', 'joist', 'flat-nailer', 'rim', 'field-board', 'fascia'].indexOf(p.kind);
  selected.sort((a, b) => rank(a) - rank(b)).forEach(p => {
    if (skirt && p.profile?.length && p.vertices?.length === p.profile.length * 2) {
      // Ordered profile faces preserve every step, notch and grade cut. A
      // convex hull would incorrectly fill a concave stair-top cutout.
      const n = p.profile.length, front = p.vertices.slice(0, n).map(q => at(q[axis], q.z)), back = p.vertices.slice(n).map(q => at(q[axis], q.z));
      const area = Math.abs(front.reduce((sum, q, i) => { const next = front[(i + 1) % front.length]; return sum + q.x * next.y - next.x * q.y; }, 0)) / 2;
      if (area > 1e-7) {
        s.entities.push({ type: 'polyline', points: front, closed: true, layer: layerFor(p), sourcePartId: p.id, graphicRole: 'part-outline' });
        if (back.some((q, i) => Math.hypot(q.x - front[i].x, q.y - front[i].y) > 1e-7)) {
          s.entities.push({ type: 'polyline', points: back, closed: true, layer: 'HIDDEN', sourcePartId: p.id, graphicRole: 'part-outline' });
          front.forEach((q, i) => line(s, q, back[i], 'HIDDEN', .3));
        }
        return;
      }
    }
    const outline = convexHull(p.vertices?.length ? p.vertices.map(q => at(q[axis], q.z)) : p.footprint.flatMap(q => [at(q[axis], p.zBottom), at(q[axis], p.zTop)]));
    if (outline.length < 3) return;
    s.entities.push({ type: 'polyline', points: outline, closed: true, layer: layerFor(p), sourcePartId: p.id, graphicRole: 'part-outline' });
    if (p.kind === 'footing') hatch(s, outline, p.id);
  });
  line(s, at(min - .3, 0), at(max + .3, 0), 'CENTER');
  text(s, at(min, 0).x + 4, at(min, 0).y - 5, 'GRADE / Z 0', 8);
  dimension(s, at(min, 0), at(min, tier.heightFt), -39);
  dimension(s, at(min, 0), at(max, 0), Math.abs(zmin) * f + 30);
  const posts = selected.filter(p => p.kind === 'post');
  const stationsUsed = new Set<string>();
  posts.forEach(p => { const key = p.axis.from[axis].toFixed(6); if (stationsUsed.has(key)) return; stationsUsed.add(key); const q = at(p.axis.from[axis], (p.zBottom + p.zTop) / 2); annotation(s, p, { x: q.x - 11, y: q.y }, p.id, -90); });
  sidePanel(s, 'ELEVATION / Z DATUM', [
    `Surface top ${cadFeet(tier.heightFt * 12)} above the saved grade datum. All dressed member heights come from the shared assembly.`,
    'This orthographic projection includes supports at different depths. Refer to plan IDs and X/Y coordinates to distinguish coincident members.',
    'Hatched portions are concrete cut sections. Lumber and finish outlines retain their actual modeled thickness.',
    'Stair and rail profiles have separate enlarged sheets. Kit profiles marked representative require product-specific shop details.',
  ], [...new Set(selected.filter(p => p.kind === 'beam' || p.kind === 'joist').map(p => `${p.kind.toUpperCase()}: ${p.nominalSize}, ${p.dressed.widthIn} x ${p.dressed.depthIn} in`))]);
}
function pairedElevations(ctx: InstallerSheetContext, tier: Tier, parts: Part[], skirt = false) {
  const selected = parts.filter(p => (skirt ? ['skirt-board', 'skirt-support'] : ['footing', 'post', 'beam', 'joist', 'rim', 'field-board', 'picture-frame', 'breaker', 'subfloor', 'flat-nailer', 'fascia']).includes(p.kind));
  if (!selected.length) return;
  const b = pointsBounds(selected.flatMap(p => p.footprint));
  const height = Math.max(...selected.map(p => p.zTop)) - Math.min(0, ...selected.map(p => p.zBottom));
  const scale = fitScale(Math.max(((b.maxX - b.minX) + (b.maxY - b.minY)) * 864 / 978, height * 864 / 365, 8));
  const start = ctx.set.sheets.length;
  elevation(ctx, tier, parts, 'x', skirt, scale); elevation(ctx, tier, parts, 'y', skirt, scale);
  const [front, side] = ctx.set.sheets.splice(start, 2);
  if (!front || !side) return;
  const sheet = ctx.newSheet(`${tier.label} / FRONT + SIDE ${skirt ? 'SKIRT' : 'FRAMING'} ELEVATIONS`, scale);
  const left = 94, right = left + (b.maxX - b.minX) * 864 / scale + 120;
  const append = (source: ConstructionSheet, target: number, caption: string) => {
    const sourceView = source.views![0], shift = target - sourceView.originPaper.x;
    const move = (p: CadPoint): CadPoint => ({ x: p.x + shift, y: p.y });
    const keep = source.entities.filter(e => e.type !== 'text' || e.at.x < 924);
    for (const e of keep) {
      if (e.type === 'line' || e.type === 'dimension') sheet.entities.push({ ...e, a: move(e.a), b: move(e.b) });
      else if (e.type === 'polyline') sheet.entities.push({ ...e, points: e.points.map(move) });
      else if (e.type === 'circle') sheet.entities.push({ ...e, center: move(e.center) });
      else sheet.entities.push({ ...e, at: move(e.at) });
    }
    sheet.views = [...(sheet.views ?? []), { ...sourceView, originPaper: move(sourceView.originPaper) }];
    text(sheet, target, 236, caption, 10, 'NOTES', true);
  };
  append(front, left, 'FRONT / X PROJECTION'); append(side, right, 'SIDE / Y PROJECTION');
  wrapped(sheet, 62, 118, `Finished surface datum ${cadFeet(tier.heightFt * 12)} above grade. Dressed member faces and Z positions come from the shared assembly. Projected supports may coincide; match their X/Y coordinates in the cut index.`, 1090, 8.5, 12);
  wrapped(sheet, 62, 155, 'Diagonal hatch identifies concrete cut sections. Lumber bearing and finish buildup are shown at actual model elevations. Stair/rail profiles and approved connection requirements are detailed separately.', 1090, 8, 11);
}

function skirtSideSheets(ctx: InstallerSheetContext, tier: Tier, parts: Part[]) {
  const skirt = parts.filter(p => p.kind === 'skirt-board' || p.kind === 'skirt-support');
  const groups = [...new Set(skirt.map(p => p.assemblyId.replace(/-G\d+$/, '')))];
  const sides = groups.map(id => {
    const members = skirt.filter(p => p.assemblyId.replace(/-G\d+$/, '') === id);
    const axes = members.map(p => ({ from: p.axis.from, to: p.axis.to })).sort((a, b) => Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) - Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y));
    let from: DeckPoint = axes[0].from, to: DeckPoint = axes[0].to;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) { from = members[0].footprint[0]; to = members[0].footprint[1]; }
    const length = Math.hypot(to.x - from.x, to.y - from.y), sign = to.x < from.x - 1e-6 || Math.abs(to.x - from.x) < 1e-6 && to.y < from.y ? -1 : 1;
    const direction = { x: (to.x - from.x) / length * sign, y: (to.y - from.y) / length * sign };
    const station = (p: DeckPoint) => (p.x - from.x) * direction.x + (p.y - from.y) * direction.y;
    return { id, members, origin: { x: from.x, y: from.y }, direction, station,
      min: Math.min(...members.flatMap(p => p.footprint.map(station))), max: Math.max(...members.flatMap(p => p.footprint.map(station))),
      minZ: Math.min(...members.map(p => p.zBottom)), maxZ: Math.max(...members.map(p => p.zTop)) };
  });
  for (let offset = 0; offset < sides.length; offset += 2) {
    const selected = sides.slice(offset, offset + 2), scale = fitScale(Math.max(8, ...selected.map(g => Math.max((g.max - g.min) * 864 / 1040, (g.maxZ - g.minZ) * 864 / 192))));
    const f = 864 / scale, sheet = ctx.newSheet(`${tier.label} / SKIRT SIDE CUT PROFILES ${offset / 2 + 1}`, scale);
    wrapped(sheet, 55, 110, 'Each side is a separate orthographic view. Solid finish faces retain every grade cut, step and gate opening; hidden lines show the actual 2x4 supports behind. Match IDs to the cut index. Small cuts are keyed by their endpoint coordinates in that index.', 1115, 8, 11);
    selected.forEach((side, row) => {
      const origin = { x: 88 + (1040 - (side.max - side.min) * f) / 2, y: 353 + row * 254 };
      const at = (station: number, z: number): CadPoint => ({ x: origin.x + (station - side.min) * f, y: origin.y - (z - side.minZ) * f });
      sheet.views = [...(sheet.views ?? []), { id: `${sheet.id}-${side.id}`, projection: 'elevation', axis: 'station', stationAxis: { origin: side.origin, direction: side.direction },
        originPaper: origin, modelOrigin: { x: side.min, y: side.minZ }, pointsPerFt: f, partIds: side.members.map(p => p.id), connectionIds: [] }];
      for (const p of [...side.members].sort((a, b) => Number(a.kind === 'skirt-board') - Number(b.kind === 'skirt-board'))) {
        const face = p.profile?.length && p.vertices?.length === p.profile.length * 2 ? p.vertices.slice(0, p.profile.length) : undefined;
        const polygon = face ? face.map(q => at(side.station(q), q.z)) : convexHull(p.footprint.flatMap(q => [at(side.station(q), p.zBottom), at(side.station(q), p.zTop)]));
        sheet.entities.push({ type: 'polyline', points: polygon, closed: true, layer: p.kind === 'skirt-support' ? 'HIDDEN' : 'DECKING', sourcePartId: p.id, graphicRole: 'part-outline' });
        if (p.kind === 'skirt-board') {
          const a = at(side.station(p.axis.from), p.axis.from.z), b = at(side.station(p.axis.to), p.axis.to.z), length = Math.hypot(b.x - a.x, b.y - a.y);
          if (length > p.id.length * 4.8 + 8) {
            let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
            annotation(sheet, p, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 2 }, p.id, angle);
          }
        }
      }
      text(sheet, 88, 146 + row * 254, `${side.id} / LOWEST Z ${cadFeet(side.minZ * 12)} / ${side.members.length} PHYSICAL PIECES`, 8.5, 'NOTES', true);
      dimension(sheet, at(side.min, side.minZ), at(side.max, side.minZ), 25);
      dimension(sheet, at(side.min, side.minZ), at(side.min, side.maxZ), -29);
    });
  }
}

function stairSheets(ctx: InstallerSheetContext, tier: Tier, parts: Part[]) {
  const stairParts = parts.filter(p => ['stair-stringer', 'tread', 'riser', 'stair-fascia'].includes(p.kind));
  const flightIds = [...new Set(stairParts.map(p => p.assemblyId))];
  for (const flightId of flightIds) {
    const flight = stairParts.filter(p => p.assemblyId === flightId), structure = flight.filter(p => p.kind === 'stair-stringer'), finish = flight.filter(p => p.kind !== 'stair-stringer');
    const bounds = pointsBounds(flight.flatMap(p => p.footprint));
    const plan = planSheet(ctx, tier, `${flightId} / TREADS + STRINGER SETOUT`, [...structure, ...finish], { bounds, lengths: false, dimensions: false, tagKinds: ['tread'],
      notes: ['Every tread, riser and stringer is a physical piece. Stringer stations below the finish are dimensioned at the head of the flight.',
        'The cut profile and piece index retain exact cuts. Final top bearing, landing and attachment follow the selected approved detail.'] });
    const stringerIds = new Set(structure.map(p => p.id));
    plan.sheet.entities.forEach(e => { if (e.sourcePartId && stringerIds.has(e.sourcePartId) && e.graphicRole === 'part-outline') e.layer = 'HIDDEN'; });
    dimension(plan.sheet, plan.at({ x: bounds.minX, y: bounds.minY }), plan.at({ x: bounds.maxX, y: bounds.minY }), -56);
    dimension(plan.sheet, plan.at({ x: bounds.minX, y: bounds.minY }), plan.at({ x: bounds.minX, y: bounds.maxY }), 34);
    structure.forEach(p => {
      const a = plan.at(p.axis.from), b = plan.at(p.axis.to), n = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / n, uy = (b.y - a.y) / n;
      const end = { x: b.x + ux * 23, y: b.y + uy * 23 };
      line(plan.sheet, b, { x: b.x + ux * 12, y: b.y + uy * 12 }, 'TAGS', .25);
      let rotation = Math.atan2(-ux, uy) * 180 / Math.PI; if (rotation > 90) rotation -= 180; if (rotation < -90) rotation += 180;
      annotation(plan.sheet, p, end, p.id, rotation);
    });
    let riserY = 385;
    text(plan.sheet, 924, riserY, 'RISER ID / STEP', 8, 'NOTES', true); riserY += 18;
    finish.filter(p => p.kind === 'riser').forEach((p, i) => {
      if (riserY <= 619) { text(plan.sheet, 924, riserY, `${p.id} / STEP ${i + 1}`, 8); riserY += 13; }
    });
    if (structure.length > 1) {
      const sorted = structure.slice().sort((a, b) => a.axis.from.x - b.axis.from.x || a.axis.from.y - b.axis.from.y);
      for (let i = 0; i + 1 < sorted.length; i++) dimension(plan.sheet, plan.at(sorted[i].axis.from), plan.at(sorted[i + 1].axis.from), -27,
        cadFeet(Math.hypot(sorted[i].axis.from.x - sorted[i + 1].axis.from.x, sorted[i].axis.from.y - sorted[i + 1].axis.from.y) * 12).replace(/^0'-/, ''));
    }
    const stringer = structure.find(p => p.profile?.length);
    if (!stringer?.profile?.length) continue;
    const profile = stringer.profile;
    const minX = Math.min(...profile.map(p => p.stationFt)), maxX = Math.max(...profile.map(p => p.stationFt));
    const minZ = Math.min(0, ...profile.map(p => p.elevationFt)), maxZ = Math.max(...profile.map(p => p.elevationFt));
    const scale = fitScale(Math.max((maxX - minX) * 864 / 770, (maxZ - minZ) * 864 / 400, 8)), f = 864 / scale;
    const s = ctx.newSheet(`${tier.label} / ${flightId} STRINGER CUT PROFILE`, scale);
    const origin = { x: 110, y: 570 + minZ * f }, at = (x: number, z: number) => ({ x: origin.x + (x - minX) * f, y: origin.y - z * f });
    const polygon = profile.map(p => at(p.stationFt, p.elevationFt));
    s.entities.push({ type: 'polyline', points: polygon, closed: true, layer: 'SECTION', sourcePartId: stringer.id, graphicRole: 'section' });
    hatch(s, polygon, stringer.id);
    s.views = [{ id: `${s.id}-PROFILE`, projection: 'profile', axis: 'station', originPaper: origin, modelOrigin: { x: minX, y: 0 }, pointsPerFt: f, partIds: structure.map(p => p.id), connectionIds: [] }];
    dimension(s, at(0, 0), at(tier.deck.stairRunFt, 0), 35);
    dimension(s, at(minX, 0), at(minX, tier.deck.stairRiseFt), -38, `${cadFeet(tier.deck.stairRiseFt * 12)} FINISHED RISE`);
    // Dimension one physical going and rise from successive source vertices.
    const horizontal = profile.findIndex((p, i) => i + 1 < profile.length && near(p.elevationFt, profile[i + 1].elevationFt) && Math.abs(p.stationFt - profile[i + 1].stationFt) > .3 && Math.abs(p.stationFt - profile[i + 1].stationFt) < 2);
    if (horizontal >= 0) dimension(s, at(profile[horizontal].stationFt, profile[horizontal].elevationFt), at(profile[horizontal + 1].stationFt, profile[horizontal + 1].elevationFt), -26);
    sidePanel(s, 'STRINGER / CUT BASIS', [
      `${structure.length} stringer(s) share this source profile. IDs: ${structure.map(p => p.id).join(', ')}.`,
      `Stock cut ${cadFeet(stringer.cutLengthFt * 12)}; dressed ${inches(stringer.dressed.widthIn)} x ${inches(stringer.dressed.depthIn)} in.`,
      'Hatch identifies the remaining cut member. Source profile gives nominal tread/riser stations; verify top/bottom bearing and finish buildup before cutting.',
      `Geometry status: ${stringer.geometryStatus}. No capacity or manufacturer connection pattern is asserted.`,
    ]);
  }
}
function railSheets(ctx: InstallerSheetContext, tier: Tier, parts: Part[], connections: Connection[]) {
  const rail = parts.filter(p => ['rail-post', 'rail', 'picket', 'glass', 'cable', 'drink-rail', 'gate'].includes(p.kind));
  if (!rail.length) return;
  planSheet(ctx, tier, 'GUARD / RAIL POST SETOUT', rail, { bounds: pointsBounds([...tier.deck.points, ...rail.flatMap(p => p.footprint)]), lengths: false,
    notes: ['Only enabled guard assemblies are drawn. Enclosure-integrated edges and stair openings follow the shared project visibility policy.',
      'Each bay elevation identifies its kit components. Product profiles are representative; no drilling or bracket-hole pattern is inferred.'] });
  const bays = [...new Set(rail.map(p => p.assemblyId))].flatMap(id => {
    const own = rail.filter(p => p.assemblyId === id), base = own.filter(p => p.kind === 'rail').sort((a, b) => b.cutLengthFt - a.cutLengthFt)[0];
    if (!base) return [];
    const relatedIds = new Set(connections.filter(c => c.kind === 'rail-to-post' && c.partIds.some(part => own.some(p => p.id === part))).flatMap(c => c.partIds));
    const bay = [...own, ...rail.filter(p => p.kind === 'rail-post' && relatedIds.has(p.id) && !own.includes(p))];
    const dx = base.axis.to.x - base.axis.from.x, dy = base.axis.to.y - base.axis.from.y, span = Math.hypot(dx, dy);
    if (span < .01) return [];
    const ux = dx / span, uy = dy / span, station = (p: DeckPoint) => (p.x - base.axis.from.x) * ux + (p.y - base.axis.from.y) * uy;
    return [{ id, bay, station, pitched: Math.abs(base.axis.to.z - base.axis.from.z) > .01,
      min: Math.min(...bay.flatMap(p => p.footprint.map(station))), max: Math.max(...bay.flatMap(p => p.footprint.map(station))),
      minZ: Math.min(...bay.map(p => p.zBottom)), maxZ: Math.max(...bay.map(p => p.zTop)) }];
  });
  for (const pitched of [false, true]) {
    const group = bays.filter(b => b.pitched === pitched), capacity = pitched ? 2 : 4;
    for (let offset = 0; offset < group.length; offset += capacity) {
      const selected = group.slice(offset, offset + capacity), physicalHeight = pitched ? 385 : 192;
      const scale = fitScale(Math.max(8, ...selected.map(b => Math.max((b.max - b.min) * 864 / 465, (b.maxZ - b.minZ) * 864 / physicalHeight))));
      const f = 864 / scale, s = ctx.newSheet(`${tier.label} / ${pitched ? 'STAIR' : 'LEVEL'} GUARD BAY ELEVATIONS ${offset / capacity + 1}`, scale);
      const nominal = Number(tier.values.railingHeightIn);
      wrapped(s, 55, 110, `${Number.isFinite(nominal) && nominal > 0 ? `Selected system: ${nominal} in nominal guard height. ` : ''}Body dimensions below describe representative kit members, not finished guard cut datums. Confirm caps, brackets, fasteners and holes from the selected manufacturer. Match IDs to the plan/index.`, 1115, 8, 11);
      selected.forEach((b, index) => {
        const left = 88 + (index % 2) * 580, ground = pitched ? 594 : 353 + Math.floor(index / 2) * 254;
        const origin = { x: left + (465 - (b.max - b.min) * f) / 2, y: ground };
        const at = (x: number, z: number): CadPoint => ({ x: origin.x + (x - b.min) * f, y: origin.y - (z - b.minZ) * f });
        s.views = [...(s.views ?? []), { id: `${s.id}-${b.id}`, projection: 'elevation', axis: 'station', originPaper: origin, modelOrigin: { x: b.min, y: b.minZ }, pointsPerFt: f, partIds: b.bay.map(p => p.id), connectionIds: [] }];
        for (const p of b.bay) {
          let polygon: CadPoint[];
          const deltaZ = p.axis.to.z - p.axis.from.z, horizontal = Math.hypot(p.axis.to.x - p.axis.from.x, p.axis.to.y - p.axis.from.y);
          if (p.vertices?.length) polygon = convexHull(p.vertices.map(q => at(b.station(q), q.z)));
          else if (horizontal > .01 && Math.abs(deltaZ) > .01) {
            const a = b.station(p.axis.from), end = b.station(p.axis.to), h = p.dressed.depthIn / 24;
            polygon = [at(a, p.axis.from.z - h), at(end, p.axis.to.z - h), at(end, p.axis.to.z + h), at(a, p.axis.from.z + h)];
          } else polygon = convexHull(p.footprint.flatMap(q => [at(b.station(q), p.zBottom), at(b.station(q), p.zTop)]));
          if (polygon.length < 3) continue;
          s.entities.push({ type: 'polyline', points: polygon, closed: true, layer: 'RAILING', sourcePartId: p.id, graphicRole: 'part-outline' });
          const q = at(b.station(centroid(p.footprint)), (p.zBottom + p.zTop) / 2);
          const rotation = p.kind === 'picket' || p.kind === 'rail-post' ? -90 : 0;
          annotation(s, p, { x: q.x + (p.kind === 'picket' ? 7 : 0), y: q.y + (p.kind === 'rail' ? p.id.endsWith('TOP') ? -9 : 12 : p.kind === 'cable' ? -4 : 0) }, p.id, rotation);
        }
        dimension(s, at(b.min, b.minZ), at(b.max, b.minZ), 25);
        dimension(s, at(b.min, b.minZ), at(b.min, b.maxZ), -29, `${cadFeet((b.maxZ - b.minZ) * 12)} BODY`);
        text(s, left, pitched ? 159 : 146 + Math.floor(index / 2) * 254, `${b.id} / BASE Z ${cadFeet(b.minZ * 12)}`, 8.5, 'NOTES', true);
      });
    }
  }
}
function connectionSheets(ctx: InstallerSheetContext, tier: Tier, parts: Part[], connections: Connection[]) {
  if (!connections.length) return;
  const supportParts = parts.filter(p => ['post', 'beam', 'joist', 'rim', 'flat-nailer', 'stair-stringer', 'rail-post', 'landing'].includes(p.kind));
  const bounds = pointsBounds([...tier.deck.points, ...connections.map(c => c.point), ...supportParts.filter(p => p.kind === 'landing').flatMap(p => p.footprint)]);
  const { sheet: s, at } = planSheet(ctx, tier, 'CONNECTION LOCATION REGISTER', [], { bounds, context: supportParts, connections, lengths: false,
    notes: ['Each small diamond is a connection anchor at its saved X/Y location. Use the location register for connected part IDs; Deck parts CSV gives 6-decimal-inch X/Y/Z coordinates.',
      'Connection symbols are placement markers. Actual connector envelopes, fastener edge distances and manufacturer hole patterns are not generated.',
      'Typical enlarged details use a real occurrence from this project. Repeated connections keep their individual IDs in the register.'] });
  const counts = new Map<string, number>();
  for (const c of connections) {
    const p = at(c.point), r = 2.8;
    s.entities.push({ type: 'polyline', points: [{ x: p.x, y: p.y - r }, { x: p.x + r, y: p.y }, { x: p.x, y: p.y + r }, { x: p.x - r, y: p.y }], closed: true,
      layer: 'HARDWARE', sourceConnectionId: c.id, graphicRole: 'connection-location' });
    counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  }
  let y = 400;
  for (const [kind, n] of counts) { if (y > 618) break; y = wrapped(s, 924, y, `${kindLabel(kind)}: ${n} locations`, 248, 8, 11) + 7; }
  const kinds = ['post-to-beam', 'joist-end', 'deck-board-bearing', 'stringer-to-rim'];
  const typical = kinds.map(kind => connections.find(c => c.kind === kind)).filter((c): c is Connection => !!c);
  for (let offset = 0; offset < typical.length; offset += 2) {
    const page = ctx.newSheet(`${tier.label} / TYPICAL CONNECTION PLACEMENT DETAILS ${offset / 2 + 1}`, 6);
    typical.slice(offset, offset + 2).forEach((c, column) => {
      const linked = parts.filter(p => c.partIds.includes(p.id)), center = c.point, left = 70 + column * 580;
      const window: Bounds = { minX: center.x - 1.25, minY: center.y - 1.25, maxX: center.x + 1.25, maxY: center.y + 1.25 };
      const { at: detailAt, view } = viewFor(page, `${page.id}-DETAIL${column + 1}`, window, { x: left + 35, y: 240, width: 440, height: 360 }, 6, linked, [c]);
      view.clip = window;
      deckContext(page, tier, detailAt, window);
      linked.forEach(p => partOutline(page, p, detailAt, window));
      tagParts(page, linked, detailAt, { x: left, y: 232, width: 505, height: 375 }, false, window);
      text(page, left, 114, `${offset + column + 1} / ${kindLabel(c.kind)}`, 10, 'NOTES', true);
      wrapped(page, left, 136, `Occurrence ${c.id}; parts ${c.partIds.join(' + ')}.`, 500, 8, 11);
      wrapped(page, left, 172, c.hardware.map(h => `${h.quantity} ${h.unit} ${h.name}${h.spec ? ` / ${h.spec}` : ''}`).join('; '), 500, 8, 11);
      if (c.kind === 'post-to-beam') wrapped(page, left, 198, 'UNRESOLVED / FIELD VERIFY: approved notch, cap and bearing detail before cutting.', 500, 7.5, 10, true);
      text(page, left, 218, `ANCHOR XYZ: ${center.x.toFixed(4)}, ${center.y.toFixed(4)}, ${center.z.toFixed(4)} ft`, 8);
      const q = detailAt(center);
      page.entities.push({ type: 'circle', center: q, radius: 7, layer: 'HARDWARE', sourceConnectionId: c.id, graphicRole: 'connection-location' });
      crosshair(page, q, 15);
    });
    wrapped(page, 70, 625, 'Crosshair/circle = assembly placement reference, not a drill hole. Connected wood faces are exact; the connector envelope, manufacturer hole pattern, embedment and edge distances require the selected approved detail.', 850, 8, 11);
  }
  const repeated = connections.filter(c => c.kind === 'deck-board-bearing' || c.kind === 'tread-to-stringer');
  const unique = connections.filter(c => c.kind !== 'deck-board-bearing' && c.kind !== 'tread-to-stringer');
  if (unique.length) ctx.tablePages(`K${tier.id}`, `${tier.label} / STRUCTURAL CONNECTION REGISTER`,
    ['CONNECTION ID', 'CONNECTED PART IDS', 'ANCHOR X, Y, Z (ft)', 'HARDWARE / QTY'], [230, 350, 240, 318], unique.map(c => [
      c.id, c.partIds.join(' / '), `${c.point.x.toFixed(5)}, ${c.point.y.toFixed(5)}, ${c.point.z.toFixed(5)}`,
      c.hardware.map(h => `${h.quantity} ${h.unit} ${h.name}${h.spec ? ` (${h.spec})` : ''}`).join('; ') || 'Per selected system',
    ]));
  contactMatrix(ctx, tier, parts, repeated);
}
function contactMatrix(ctx: InstallerSheetContext, tier: Tier, parts: Part[], connections: Connection[]) {
  if (!connections.length) return;
  const byId = new Map(parts.map(p => [p.id, p]));
  const boardKinds = ['field-board', 'picture-frame', 'breaker', 'tread'];
  const records = connections.flatMap(c => {
    const board = c.partIds.find(id => boardKinds.includes(byId.get(id)?.kind ?? ''));
    return board ? c.partIds.filter(id => id !== board).map(support => ({ board, support, c })) : [];
  });
  const supports = [...new Set(records.map(r => r.support))];
  let count = 0;
  for (let colOffset = 0; colOffset < supports.length; colOffset += 30) {
    const columns = supports.slice(colOffset, colOffset + 30), rows = [...new Set(records.filter(r => columns.includes(r.support)).map(r => r.board))];
    for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 34) {
      const selected = rows.slice(rowOffset, rowOffset + 34), page = ctx.newSheet(`${tier.label} / BOARD + TREAD FASTENER CONTACT MATRIX`, 1, `G${tier.id}${String(++count).padStart(2, '0')}`);
      wrapped(page, 48, 110, 'Each cell totals the modeled fastener allowance for that board/support pair; a shared bearing may have multiple anchors. Blank = no contact. Every anchor remains a vector marker in the connection plan/DXF; Deck parts CSV gives 6-decimal-inch X/Y/Z coordinates.', 1120, 8, 11);
      text(page, 48, 218, 'BOARD / TREAD ID', 8, 'NOTES', true);
      const left = 225, cell = Math.min(52, 945 / columns.length), top = 244, rowHeight = 11.2;
      columns.forEach((id, column) => {
        const x = left + (column + .5) * cell, support = byId.get(id)!;
        page.entities.push({ type: 'text', at: { x, y: 215 }, text: id, height: 7.5, rotation: -90, layer: 'NOTES' });
        const dx = Math.abs(support.axis.to.x - support.axis.from.x), dy = Math.abs(support.axis.to.y - support.axis.from.y);
        const station = dx < 1e-5 ? `X${Number(support.axis.from.x.toFixed(2))}` : dy < 1e-5 ? `Y${Number(support.axis.from.y.toFixed(2))}` : 'XY*';
        text(page, x, 230, station, 7.5, 'NOTES', false, 'center');
        line(page, { x: left + column * cell, y: top - 10 }, { x: left + column * cell, y: top + selected.length * rowHeight - 2 }, 'CENTER', .2);
      });
      selected.forEach((id, row) => {
        const y = top + row * rowHeight;
        page.entities.push({ type: 'text', at: { x: 48, y }, text: id, height: 8, layer: 'TAGS', sourcePartId: id, graphicRole: 'part-tag' });
        columns.forEach((support, column) => {
          const contacts = records.filter(r => r.board === id && r.support === support);
          if (!contacts.length) return;
          const quantity = contacts.reduce((sum, r) => sum + r.c.hardware.reduce((n, h) => n + h.quantity, 0), 0);
          page.entities.push({ type: 'text', at: { x: left + (column + .5) * cell, y }, text: String(quantity), height: 8, align: 'center', layer: 'NOTES', sourceConnectionId: contacts[0].c.id, graphicRole: 'connection-tag' });
        });
        line(page, { x: 42, y: y + 3 }, { x: left + columns.length * cell, y: y + 3 }, 'CENTER', .2);
      });
      wrapped(page, 48, 639, 'Column stations are feet rounded to 0.01 ft. Member axes/contact coordinates: Deck parts CSV, 6 decimal inch places. XY* denotes a sloped/angled support. Product-specific fastener spacing and holes remain the approved installation detail.', 1120, 7.5, 10);
    }
  }
}
function partIndex(ctx: InstallerSheetContext, tier: Tier, parts: Part[], _connections: Connection[]) {
  const groups = [...new Set(parts.map(p => `${p.kind}|${p.material}`))];
  let sheet: ConstructionSheet | null = null, column = 0, y = 0, number = 0;
  const rowHeight = 13.2, columns = [100, 72, 83, 142, 142];
  const start = () => {
    sheet = ctx.newSheet(`${tier.label} / INSTALLED PIECES / CUT + ENDPOINT INDEX`, 1, `Q${tier.id}${String(++number).padStart(2, '0')}`);
    wrapped(sheet, 48, 108, 'One row = one installed part. Sizes in inches; cuts to 1/16 in; endpoints to 0.0001 ft. * = representative profile; FV = field-verify post cut/notch. Deck parts CSV gives 6-decimal-inch endpoints, material and connection lookup.', 1120, 7.5, 10);
    for (const left of [42, 632]) {
      let x = left;
      ['PART ID', 'DRESSED in', 'CUT', 'START X,Y,Z ft', 'END X,Y,Z ft'].forEach((v, i) => { text(sheet!, x + 3, 144, v, 7.5, 'NOTES', true); x += columns[i]; });
      line(sheet!, { x: left, y: 150 }, { x: left + 544, y: 150 }, 'TITLE');
    }
    column = 0; y = 156;
  };
  const advance = () => { if (column === 0) { column = 1; y = 156; } else start(); };
  const heading = (kind: string, material: string) => {
    if (!sheet) start();
    if (y + 45 > 654) advance();
    y = wrapped(sheet!, 46 + column * 590, y + 11, `${kindLabel(kind)} / ${material}`, 530, 7.5, 10, true) + 2;
  };
  const xyz = (p: { x: number; y: number; z: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  for (const group of groups) {
    const members = parts.filter(p => `${p.kind}|${p.material}` === group), first = members[0];
    heading(first.kind, first.material);
    for (const p of members) {
      if (y + rowHeight > 654) { advance(); heading(first.kind, first.material); }
      const values = [p.id + (p.geometryStatus === 'representative' ? '*' : ''), `${inches(p.dressed.widthIn)}x${inches(p.dressed.depthIn)}`, (p.kind === 'post' && p.geometryStatus === 'representative' ? 'FV ' : '') + cadFeet(p.cutLengthFt * 12), xyz(p.axis.from), xyz(p.axis.to)];
      let x = 42 + column * 590;
      values.forEach((value, index) => {
        sheet!.entities.push({ type: 'text', at: { x: x + 3, y: y + 9 }, text: cadText(value), height: 7.5, layer: index ? 'NOTES' : 'TAGS', ...(index ? {} : { sourcePartId: p.id, graphicRole: 'part-tag' as const }) });
        x += columns[index];
      });
      line(sheet!, { x: 42 + column * 590, y: y + rowHeight - 1 }, { x: 586 + column * 590, y: y + rowHeight - 1 }, 'CENTER', .2);
      y += rowHeight;
    }
  }
}

export function addInstallerAssemblySheets(ctx: InstallerSheetContext, assembly: Assembly) {
  ctx.set.assemblyPartIds = assembly.parts.map(p => p.id);
  ctx.set.assemblyConnectionIds = assembly.connections.map(c => c.id);
  for (const tier of assembly.tiers) {
    const parts = assembly.parts.filter(p => p.tierId === tier.id), connections = assembly.connections.filter(c => c.tierId === tier.id);
    if (!parts.length) continue;
    setout(ctx, tier, parts);
    const beams = parts.filter(p => p.kind === 'beam');
    const joists = parts.filter(p => p.kind === 'joist' || p.kind === 'rim');
    if (joists.length) {
      const framing = planSheet(ctx, tier, 'JOIST / RIM PHYSICAL FRAMING PLAN', joists, { context: beams,
        notes: [`Selected joists ${tier.deck.joistSize}; spacing ${cadFeet(tier.deck.joistSpacingFt * 12)} O.C. Actual end cuts stop at bearing/rim faces in the shared model.`, `Joists and each rim/beam ply have distinct IDs. Beam plies below: ${beams.map(p => p.id).join(', ')}. Board finish and flat nailers have separate sheets.`] });
      const stations = sortUnique(joists.filter(p => p.kind === 'joist').map(p => tier.deck.joistDirection === 'vertical' ? p.axis.from.x : p.axis.from.y));
      for (let i = 0; i + 1 < Math.min(stations.length, 4); i++) {
        const a = tier.deck.joistDirection === 'vertical' ? { x: stations[i], y: tier.deck.minY } : { x: tier.deck.minX, y: stations[i] };
        const b = tier.deck.joistDirection === 'vertical' ? { x: stations[i + 1], y: tier.deck.minY } : { x: tier.deck.minX, y: stations[i + 1] };
        dimension(framing.sheet, framing.at(a), framing.at(b), -53);
      }
      detailWindows(ctx, tier, 'FRAMING', joists, new Set(joists.filter(p => !framing.tagged.has(p.id)).map(p => p.id)), beams);
    }
    const nailers = parts.filter(p => p.kind === 'flat-nailer');
    if (nailers.length) {
      const nailer = planSheet(ctx, tier, 'FLAT FINISH NAILER PLACEMENT', nailers, { context: joists, lengths: false,
        notes: ['Nailer wide face is horizontal. Exact clipped footprints fit between upright joist/rim faces under picture frames and breakers.', 'Every longitudinal strip/cut is identified in the flat-nailer index. Shared supports are counted once.'] });
      detailWindows(ctx, tier, 'FLAT NAILERS', nailers, new Set(nailers.filter(p => !nailer.tagged.has(p.id)).map(p => p.id)), joists);
    }
    const finish = parts.filter(p => ['field-board', 'picture-frame', 'breaker', 'subfloor', 'fascia'].includes(p.kind));
    if (finish.length) {
      const deck = planSheet(ctx, tier, tier.deck.deckingSurface === 'subfloor' ? 'SUBFLOOR PANELS / STAGGER + EDGE CUTS' : 'INDIVIDUAL DECK BOARDS / MITERS + SEAMS', finish, { bounds: pointsBounds([...tier.deck.points, ...finish.flatMap(p => p.footprint)]),
        notes: [tier.deck.deckingSurface === 'subfloor' ? 'Actual staggered 4 x 8 ft panel cuts come from the shared subfloor planner. Confirm panel edge supports and supplier fastening requirements.' : 'Every board outline, seam and miter comes from the shared assembly. Finished cut dimensions and coordinates are in the piece index.', 'Fascia is a vertical perimeter member. Clear leaders carry its full part ID; cut lengths are in the piece index. Its footprint is shown here and dressed height in elevation.'] });
      detailWindows(ctx, tier, 'SURFACE CUTS', finish, new Set(finish.filter(p => !deck.tagged.has(p.id)).map(p => p.id)));
    }
    const skirt = parts.filter(p => p.kind === 'skirt-board' || p.kind === 'skirt-support');
    if (skirt.length) {
      planSheet(ctx, tier, 'SKIRT BOARDS / SUPPORT PLAN', skirt, { lengths: false,
        notes: ['Physical skirt and support footprints retain the saved edge selection and installed board spacing. Exact vertical cuts are listed in the piece index.'] });
      skirtSideSheets(ctx, tier, parts);
    }
    pairedElevations(ctx, tier, parts);
    stairSheets(ctx, tier, parts); railSheets(ctx, tier, parts, connections); connectionSheets(ctx, tier, parts, connections); partIndex(ctx, tier, parts, connections);
  }
}

/** Graphic scale is measured paper geometry, including print verification. */
export function addConstructionScaleBar(sheet: ConstructionSheet) {
  if (sheet.scale <= 1) return;
  const f = 864 / sheet.scale;
  const step = [1 / 12, .25, .5, 1, 2, 4, 8, 16, 32, 64, 128].filter(v => v * 2 * f <= 190).pop() ?? 1 / 12;
  // The lower dimension row can reach Y632 on two-row detail sheets.
  // Keep its caption and the 7.5 pt scale numerals in the reserved footer band.
  const x = 975, y = 657, w = step * f;
  for (let i = 0; i < 2; i++) {
    line(sheet, { x: x + i * w, y }, { x: x + (i + 1) * w, y }, 'TITLE', i === 0 ? 3 : 1);
    line(sheet, { x: x + i * w, y: y - 4 }, { x: x + i * w, y: y + 4 }, 'TITLE');
  }
  line(sheet, { x: x + 2 * w, y: y - 4 }, { x: x + 2 * w, y: y + 4 }, 'TITLE');
  text(sheet, x, y + 15, '0', 7.5, 'TITLE', false, 'center');
  text(sheet, x + w, y + 15, `${Number(step.toFixed(3))}`, 7.5, 'TITLE', false, 'center');
  text(sheet, x + 2 * w, y + 15, `${Number((step * 2).toFixed(3))} ft`, 7.5, 'TITLE', false, 'center');
  text(sheet, x, y - 10, `SCALE 1:${sheet.scale} / 100% PRINT`, 7.5, 'TITLE');
}
