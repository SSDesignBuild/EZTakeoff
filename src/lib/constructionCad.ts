import { buildDeckModel, buildLowerTierDeckModel, scanlineIntersections, type DeckModel } from './deckModel';
import { surfaceStrips, breakerVisualStrips } from './deckSurfaceLayout';
import { planMiteredPictureFrames, splitMiteredPictureFrames } from './deckMiterGeometry';
import { planStairFootprints } from './stairPlanGeometry';
import { stairFlightFrame } from './stairRailVisualGeometry';
import { planStairLandings, type StairLandingPlan } from './stairConcreteLanding';
import type { DeckPoint, MaterialItem } from './types';
import { CAD_SHEET_WIDTH, CAD_SHEET_HEIGHT, cadFeet, cadInches, cadText, line, poly, rect,
  text, wrapped, dimension, type CadPoint, type CadBlock,
  type ConstructionSheet, type ConstructionDrawingSet } from './constructionCadScene';

type Values = Record<string, string | number | boolean>;
interface Tier { label: string; deck: DeckModel; heightFt: number; values: Values; landings: StairLandingPlan[] }
const SCALES = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768];
const scaleFor = (required: number) => SCALES.find(s => s >= required) ?? Math.ceil(required / 96) * 96;
const actualJoistIn = (size: string) => size === '2x12' ? 11.25 : size === '2x10' ? 9.25 : 7.25;
const actualPostIn = (deck: DeckModel) => deck.postSize === '8x8' ? 7.5 : 5.5;
const finite = (v: unknown, fallback: number) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const scaledPoint = (p: DeckPoint, f: number, x: number, y: number): CadPoint => ({ x: x + p.x * f, y: y + p.y * f });

export function constructionHardwareKey(item: Pick<MaterialItem, 'name' | 'category'>): string {
  const s = item.name.toLowerCase();
  if (/post bracket|post base/.test(s)) return 'H01';
  if (/j anchor|submersible|concrete anchor/.test(s)) return 'H02';
  if (/joist hanger/.test(s) && !/nail|screw/.test(s)) return 'H03';
  if (/hurricane|rafter tie/.test(s)) return 'H04';
  if (/carriage bolt/.test(s)) return 'H05';
  if (/lateral load|lag screw|shield anchor/.test(s)) return 'H06';
  if (/ledgerlok|sds/.test(s)) return 'H07';
  if (/connector|hanger.*nail/.test(s)) return 'H08';
  if (/camo|deck board screw|trim.*fastener|color.matched/.test(s)) return 'H09';
  if (/joist tape/.test(s)) return 'H10';
  if (/gate|hinge/.test(s)) return 'H11';
  return 'H12';
}
const isHardware = (item: MaterialItem) => /hardware|fastener|gate/i.test(item.category) ||
  /hanger|bracket|anchor|bolt|screw|\bnails?\b|joist tape|hinge/i.test(item.name);
const connectionNotes = [
  ['H01 / H02', 'POST / FOOTING', 'Use the selected post base and concrete anchor. Exact approved model, embedment and fasteners remain manufacturer/site details.'],
  ['H03 / H08', 'JOIST / RIM OR LEDGER', 'Match hanger to the selected joist. Use only the listed connector-rated fastener; deck screws are not connector screws.'],
  ['H04 / H08', 'JOIST / BEAM BEARING', 'Tie at the joist-to-beam condition. Follow the approved connector nail/screw schedule.'],
  ['H05', 'POST / BEAM', 'Bolt sets are included in the order. Bearing/notch/cap and bolt spacing require the selected approved connection detail.'],
  ['H06', 'HOUSE / LEDGER', 'Applies to selected attachment only. Verify structural backing, flashing and approved connection; masonry attachment is not assumed gravity support.'],
  ['H07', 'RIM CORNER', 'Corner structural screws follow the material schedule; confirm approved fastening and edge distances.'],
  ['H09 / H10', 'DECKING / SUPPORT', 'Use the selected surface fastener and tape. Flat finish support is shown separately from upright structural members.'],
  ['H11 / H12', 'GATES / GENERAL', 'See the current order for gate hardware and frame assembly fasteners. Quantities reflect saved material edits.'],
];

function symbolFor(deck: DeckModel): CadBlock {
  const name = `SNS_POST_${deck.postSize.toUpperCase()}_F${deck.footingDiameterIn}`.replace(/\./g, '_');
  const r = deck.footingDiameterIn / 2, half = actualPostIn(deck) / 2;
  return { name, entities: [
    { type: 'circle', center: { x: 0, y: 0 }, radius: r, layer: 'FOOTINGS' },
    { type: 'polyline', points: [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }], closed: true, layer: 'POSTS' },
    { type: 'line', a: { x: -r - 2, y: 0 }, b: { x: r + 2, y: 0 }, layer: 'CENTER' },
    { type: 'line', a: { x: 0, y: -r - 2 }, b: { x: 0, y: r + 2 }, layer: 'CENTER' },
  ] };
}
function planLandings(tier: Tier): { points: DeckPoint[]; plan: StairLandingPlan; flight: number }[] {
  return tier.deck.stairPlacements.flatMap((placement, i) => {
    const plan = tier.landings[i], frame = stairFlightFrame(tier.deck, placement, [0, 0]);
    if (!plan || !frame) return [];
    const at = (cross: number, run: number): DeckPoint => ({
      x: frame.originX + Math.cos(frame.yaw) * cross + frame.outwardX * run,
      y: frame.originZ - Math.sin(frame.yaw) * cross + frame.outwardZ * run,
    });
    const half = plan.widthFt / 2, start = tier.deck.stairRunFt;
    return [{ points: [at(-half, start), at(half, start), at(half, start + plan.depthFt), at(-half, start + plan.depthFt)], plan, flight: i }];
  });
}

/** Build from the production model, never from SVG/canvas pixels or a second
 * takeoff. Displayed order rows retain the customer's saved overrides. */
export function buildConstructionDrawingSet(values: Values, items: MaterialItem[], options: { revision?: string; issues?: string[]; computedItems?: MaterialItem[] } = {}): ConstructionDrawingSet {
  const main = buildDeckModel(values), lower = buildLowerTierDeckModel(values);
  const tiers: Tier[] = [{ label: 'MAIN DECK', deck: main, heightFt: finite(values.deckHeight, 0), values, landings: planStairLandings(main.stairPlacements.map(p => p.width), values) }];
  if (lower) {
    const lowerValues = { ...values, deckHeight: values.lowerDeckHeight ?? values.deckHeight };
    tiers.push({ label: 'LOWER DECK', deck: lower, heightFt: finite(lowerValues.deckHeight, 0), values: lowerValues,
      landings: planStairLandings(lower.stairPlacements.map(p => p.width), lowerValues) });
  }
  const revision = cadText(options.revision ?? values.drawingRevision ?? 'A');
  const set: ConstructionDrawingSet = { sheets: [], blocks: [], title: String(values.poJobName || 'S&S Design Build - Deck construction sheets'), revision,
    issues: [...(options.issues ?? []), ...tiers.flatMap(t => t.deck.postLayoutIssues)], warnings: [], modelFacts: tiers.map(t => ({ tier: t.label,
      postCount: t.deck.postCount, footingDiameterIn: t.deck.footingDiameterIn, footingDepthIn: t.deck.footingDepthIn,
      concreteBags: t.deck.concreteBags, stairCount: t.deck.stairCount, landings: t.landings })) };
  if (tiers.some(t => t.deck.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
    ![t.heightFt, t.deck.footingDepthIn, t.deck.footingDiameterIn].every(Number.isFinite))) {
    set.issues.push('Non-finite model dimensions must be corrected before construction export.');
    return set;
  }
  if (options.computedItems && JSON.stringify(items.map(i => [i.name, i.quantity, i.unit, i.stockRecommendation])) !==
    JSON.stringify(options.computedItems.map(i => [i.name, i.quantity, i.unit, i.stockRecommendation])))
    set.warnings.push('Material order has saved edits or exclusions. Schedule quantities show the current order; geometric member counts remain those of the drawing.');
  if (tiers.some(t => t.deck.stairCount && t.landings.length !== t.deck.stairCount))
    set.warnings.push('No new slab is drawn or ordered for stairs whose landing surface is existing, site-plan or unconfirmed.');
  set.warnings.push('These are dimensioned coordination drawings. Soil/frost, spans, connection engineering and permit approval require project review.');
  let drawingNumber = 100;
  const newSheet = (title: string, scale: number, id = `C${++drawingNumber}`): ConstructionSheet => {
    const s: ConstructionSheet = { id, title, scale, width: CAD_SHEET_WIDTH, height: CAD_SHEET_HEIGHT, entities: [] };
    set.sheets.push(s); return s;
  };
  const notePanel = (s: ConstructionSheet, heading: string, notes: string[], start = 104) => {
    text(s, 912, start, heading, 11, 'NOTES', true);
    let y = start + 23;
    for (const note of notes) y = wrapped(s, 912, y, note, 265, 8.6, 12.4) + 12;
    return y;
  };
  const tablePages = (prefix: string, title: string, headers: string[], widths: number[], rows: string[][]) => {
    const font = 8.2, lead = 11.5;
    let page: ConstructionSheet | null = null, y = 0, count = 0;
    const wrapCell = (value: string, w: number) => {
      const limit = Math.max(8, Math.floor((w - 14) / (font * .6)));
      const output: string[] = [];
      let current = '';
      for (let word of cadText(value).split(/\s+/)) {
        if (current && current.length + word.length + 1 > limit) { output.push(current); current = ''; }
        while (word.length > limit) { output.push(word.slice(0, limit)); word = word.slice(limit); }
        current += (current ? ' ' : '') + word;
      }
      if (current || !output.length) output.push(current);
      return output;
    };
    const start = () => {
      page = newSheet(title, 1, `${prefix}${String(++count).padStart(2, '0')}`);
      let x = 42;
      headers.forEach((header, i) => { text(page!, x + 7, 106, header, 9, 'NOTES', true); x += widths[i]; });
      line(page, { x: 42, y: 116 }, { x: 1180, y: 116 }, 'TITLE'); y = 120;
    };
    for (const cells of rows) {
      const content = cells.map((cell, i) => wrapCell(cell, widths[i]));
      const lines = Math.max(...content.map(c => c.length));
      // Long notes continue in their own row; no text is silently truncated.
      for (let offset = 0; offset < lines; offset += 20) {
        const height = Math.min(20, lines - offset) * lead + 14;
        if (!page || y + height > 658) start();
        let x = 42;
        content.forEach((cell, i) => {
          const segment = cell.slice(offset, offset + 20);
          if (offset && i === 0 && !segment.length) segment.push('(cont.)');
          segment.forEach((value, row) => text(page!, x + 7, y + 12 + row * lead, value, font));
          x += widths[i];
        });
        line(page!, { x: 42, y: y + height }, { x: 1180, y: y + height }, 'CENTER');
        y += height;
      }
    }
  };

  for (const tier of tiers) {
    const deck = tier.deck, stairFootprints = planStairFootprints(deck), landings = planLandings(tier);
    const symbol = symbolFor(deck);
    if (!set.blocks.some(b => b.name === symbol.name)) set.blocks.push(symbol);
    const boundsPoints = [...deck.points, ...stairFootprints.flatMap(p => p.corners), ...landings.flatMap(p => p.points)];
    const x0 = Math.min(...boundsPoints.map(p => p.x)), x1 = Math.max(...boundsPoints.map(p => p.x));
    const y0 = Math.min(...boundsPoints.map(p => p.y)), y1 = Math.max(...boundsPoints.map(p => p.y));
    const planScale = scaleFor(Math.max((x1 - x0) * 864 / 720, (y1 - y0) * 864 / 456));
    let pf = 864 / planScale;
    const planOrigin = { x: 100 + (720 - (x1 - x0) * pf) / 2 - x0 * pf, y: 138 + (456 - (y1 - y0) * pf) / 2 - y0 * pf };
    let origin = planOrigin;
    const at = (p: DeckPoint) => scaledPoint(p, pf, origin.x, origin.y);
    const outline = (s: ConstructionSheet) => {
      poly(s, deck.points.map(at), 'OUTLINE', true);
      deck.houseEdgeIndices.forEach(i => {
        const e = deck.edgeSegments[i]; if (e) line(s, at(e.start), at(e.end), 'OUTLINE', 2.3);
      });
      dimension(s, at({ x: deck.minX, y: deck.minY }), at({ x: deck.maxX, y: deck.minY }), -37);
      dimension(s, at({ x: deck.minX, y: deck.minY }), at({ x: deck.minX, y: deck.maxY }), 40);
      const winding = deck.points.reduce((sum, p, i) => { const q = deck.points[(i + 1) % deck.points.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
      if (deck.points.length > 4) deck.edgeSegments.filter(e => e.length > 2).forEach(e => dimension(s, at(e.start), at(e.end), winding >= 0 ? -24 : 24, `E${e.index + 1} ${cadFeet(e.length * 12)}`));
    };
    const supports = (s: ConstructionSheet) => deck.postLocations.forEach(post => {
      const p = at(post); s.entities.push({ type: 'insert', at: p, name: symbol.name, scale: 72 / s.scale, layer: 'POSTS' });
      text(s, p.x + 11, p.y - 12, post.reference, 7.8, 'TAGS', true);
    });
    const beams = (s: ConstructionSheet, hidden = false) => {
      deck.beamLines.forEach((beam, i) => beam.segments.forEach((seg, j) => {
        line(s, at({ x: seg.startX, y: beam.y }), at({ x: seg.endX, y: beam.y }), hidden ? 'HIDDEN' : 'BEAMS');
        if (!hidden) {
          const source = at({ x: (seg.startX + seg.endX) / 2, y: beam.y });
          const label = { x: source.x + 18, y: Math.min(642, at({ x: 0, y: deck.maxY }).y + 30 + i * 15) };
          line(s, source, label, 'TAGS');
          text(s, label.x + 6, label.y, `B${i + 1}${beam.segments.length > 1 ? '.' + (j + 1) : ''} (2) ${deck.beamMemberSize}`, 8, 'TAGS', true);
        }
      }));
      deck.angledBeamLines.forEach((beam, i) => {
        line(s, at(beam.start), at(beam.end), hidden ? 'HIDDEN' : 'BEAMS');
        if (!hidden) text(s, at(beam.start).x + 8, at(beam.start).y - 10, `AB${i + 1}`, 8, 'TAGS', true);
      });
    };
    const stairPlan = (s: ConstructionSheet, details: boolean) => {
      stairFootprints.forEach((flight, index) => {
        poly(s, flight.corners.map(at), 'STAIRS', true);
        flight.treads.forEach(([a, b]) => line(s, at(a), at(b), 'STAIRS'));
        flight.sides.filter(side => side.enabled).forEach(side => line(s, at(side.start), at(side.end), 'RAILING', 1.5));
        text(s, at(flight.center).x, at(flight.center).y - 8, `ST${index + 1} / DOWN`, 8.2, 'TAGS', true, 'center');
        if (details) {
          dimension(s, at(flight.corners[0]), at(flight.corners[1]), -20);
          dimension(s, at(flight.corners[1]), at(flight.corners[2]), -25);
        }
      });
      landings.forEach(({ points, plan, flight }) => {
        poly(s, points.map(at), 'LANDING', true);
        const center = { x: points.reduce((a, p) => a + p.x, 0) / 4, y: points.reduce((a, p) => a + p.y, 0) / 4 };
        text(s, at(center).x, at(center).y, `LP${flight + 1} / ${plan.thicknessIn} in`, 8, 'TAGS', false, 'center');
        if (details) dimension(s, at(points[3]), at(points[2]), 22);
      });
    };
    const footing = newSheet(`${tier.label} / FOOTING + SETOUT PLAN`, planScale);
    outline(footing); beams(footing, true); supports(footing); stairPlan(footing, false);
    let ny = notePanel(footing, 'SUPPORT SETOUT', [
      `${deck.postCount} posts / ${deck.postSize}. F1: ${deck.footingDiameterIn} in DIA x ${deck.footingDepthIn} in deep.`,
      `${deck.footingBagsPerPost} x 80 lb bags per footing; ${deck.concreteBags} bags for this tier. Concrete yield follows the takeoff.`,
      'X/Y coordinates below use the saved deck origin in feet. Set out post centers; dimensions shown to 1/16 in. DXF retains model precision.',
      'H01 post base + H02 anchor at every support. See foundation detail and hardware schedule.',
    ]);
    text(footing, 912, ny, 'POST        X (ft)    Y (ft)', 8.2, 'NOTES', true); ny += 16;
    const visiblePosts = deck.postLocations.slice(0, Math.min(12, Math.floor((620 - ny) / 15)));
    visiblePosts.forEach(post => { text(footing, 912, ny, `${post.reference.padEnd(10)} ${post.x.toFixed(3).padStart(8)}  ${post.y.toFixed(3).padStart(8)}`, 8); ny += 15; });
    if (visiblePosts.length < deck.postLocations.length) {
      text(footing, 912, ny + 4, 'Full setout in coordinate schedule.', 8);
      tablePages(tier.label === 'MAIN DECK' ? 'P1' : 'P2', `${tier.label} / SUPPORT COORDINATES`,
        ['POST ID', 'X / SAVED ORIGIN', 'Y / SAVED ORIGIN', 'FOOTING', 'SUPPORT'], [150, 245, 245, 270, 228],
        deck.postLocations.map(p => [p.reference, `${p.x.toFixed(6)} ft / ${cadFeet(p.x * 12)}`, `${p.y.toFixed(6)} ft / ${cadFeet(p.y * 12)}`,
          `${deck.footingDiameterIn} in DIA x ${deck.footingDepthIn} in deep`, `${deck.postSize} / H01 + H02`]));
    }

    const framingScale = scaleFor(Math.max(deck.width * 864 / 720, deck.depth * 864 / 456));
    pf = 864 / framingScale;
    origin = { x: 100 + (720 - deck.width * pf) / 2 - deck.minX * pf,
      y: 138 + (456 - deck.depth * pf) / 2 - deck.minY * pf };
    const framing = newSheet(`${tier.label} / FRAMING + FINISH SUPPORT`, framingScale);
    outline(framing);
    let joistNo = 0;
    for (const position of deck.joistPositions) {
      for (const pair of scanlineIntersections(deck.points, deck.joistDirection, position)) {
        const a = deck.joistDirection === 'vertical' ? { x: position, y: pair.start } : { x: pair.start, y: position };
        const b = deck.joistDirection === 'vertical' ? { x: position, y: pair.end } : { x: pair.end, y: position };
        line(framing, at(a), at(b), 'JOISTS'); joistNo++;
        if (joistNo % Math.max(1, Math.ceil(22 / (pf * deck.joistSpacingFt))) === 0)
          text(framing, at(a).x + (at(b).x - at(a).x) * .30 + 2, at(a).y + (at(b).y - at(a).y) * .30 - 3, `J${joistNo}`, 7.5, 'TAGS');
      }
    }
    const tierPrefix = tier.label === 'MAIN DECK' ? 'M-' : 'L-';
    for (const piece of deck.finishSupport?.pieces ?? []) {
      poly(framing, piece.corners.map(at), 'FINISH_SUPPORT', true);
      const a = at(piece.from), b = at(piece.to), label = tierPrefix + piece.id;
      if (Math.hypot(b.x - a.x, b.y - a.y) > label.length * 4.5 + 8) {
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        framing.entities.push({ type: 'text', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 2 }, text: label,
          height: 7.5, align: 'center', rotation: angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle, layer: 'TAGS' });
      }
    }
    beams(framing); supports(framing);
    notePanel(framing, 'FRAMING / CONNECTION KEYS', [
      `J series: ${deck.joistSize} at ${cadInches(deck.joistSpacingFt * 12)} O.C. ${deck.joistCount} modeled joist segments.`,
      `B series: double ${deck.beamMemberSize}. Double ${deck.joistSize} perimeter band. Member lines are centerlines; see material stock schedule.`,
      'H03 / H08: joist hangers and connector fasteners at rim/ledger conditions.',
      'H04 / H08: ties at joist/beam bearings. H05: post-to-beam connection. H07: rim corners.',
      `${deck.finishSupport?.pieces.length ?? 0} flat finish-support pieces. Their exact footprints follow the shared support planner. H09 / H10 at finish attachments.`,
      'Approved manufacturer connection model, bearing and fastener spacing must be confirmed; this sheet does not invent connector geometry.',
    ]);
    if (deck.postLocations[0]) {
      const p = at(deck.postLocations[0]);
      line(framing, p, { x: p.x - 45, y: p.y + 45 }, 'TAGS');
      text(framing, p.x - 45, p.y + 58, 'H01/H02/H05', 8, 'TAGS', true);
    }
    if (deck.finishSupport?.stock.length) tablePages(tier.label === 'MAIN DECK' ? 'F1' : 'F2', `${tier.label} / FLAT FINISH SUPPORT CUTS`,
      ['MEMBER / STOCK', 'BOARDS', 'CUT IDS / INSTALLED LENGTHS'], [235, 90, 813],
      deck.finishSupport.stock.map(stock => [`${stock.nominalSize} / ${stock.stockLengthFt} ft stock`, String(stock.quantity),
        stock.cutIds.map((id, i) => `${tierPrefix}${id}: ${cadFeet((stock.cutLengthsFt[i] ?? 0) * 12)}`).join('; ')]));

    pf = 864 / planScale; origin = planOrigin;
    const finish = newSheet(`${tier.label} / DECKING + STAIR LAYOUT`, planScale);
    outline(finish);
    if (values.deckingSurface !== 'subfloor') {
      const strips = [...surfaceStrips(deck), ...breakerVisualStrips(deck)];
      strips.forEach(strip => {
        const corners = strip.outline?.map(p => ({ x: p[0], y: p[1] })) ?? (strip.axis === 'x'
          ? [{ x: strip.startFt, y: strip.z - strip.widthFt / 2 }, { x: strip.endFt, y: strip.z - strip.widthFt / 2 }, { x: strip.endFt, y: strip.z + strip.widthFt / 2 }, { x: strip.startFt, y: strip.z + strip.widthFt / 2 }]
          : [{ x: strip.x - strip.widthFt / 2, y: strip.startFt }, { x: strip.x + strip.widthFt / 2, y: strip.startFt }, { x: strip.x + strip.widthFt / 2, y: strip.endFt }, { x: strip.x - strip.widthFt / 2, y: strip.endFt }]);
        poly(finish, corners.map(at), 'DECKING', true);
      });
      splitMiteredPictureFrames(planMiteredPictureFrames(deck.points, deck.pictureFrameSegments, deck.pictureFrameCount))
        .forEach(frame => poly(finish, frame.corners.map(p => at({ x: p[0], y: p[1] })), 'DECKING', true));
    }
    stairPlan(finish, true);
    deck.railCoverage.forEach(run => {
      const edge = deck.edgeSegments[run.edgeIndex]; if (!edge) return;
      // Rail coverage already excludes openings in the shared model; draw only
      // surviving intervals after ALL actual stair flights on this edge.
      let intervals: [number, number][] = [[run.start, run.end]];
      deck.stairPlacements.filter(p => p.edgeIndex === run.edgeIndex).forEach(p => {
        intervals = intervals.flatMap(([a, b]) => [[a, Math.min(b, p.offset)], [Math.max(a, p.offset + p.width), b]]
          .filter(([start, end]) => end - start > .001) as [number, number][]);
      });
      const p = (v: number) => at({ x: edge.start.x + (edge.end.x - edge.start.x) * v / edge.length, y: edge.start.y + (edge.end.y - edge.start.y) * v / edge.length });
      intervals.forEach(([a, b]) => line(finish, p(a), p(b), 'RAILING', 1.6));
    });
    notePanel(finish, 'SURFACE / STAIR SCHEDULE', [
      `Selected surface: ${String(tier.values.deckingMaterial ?? tier.values.deckingType ?? 'Deck boards')}.`,
      values.deckingSurface === 'subfloor' ? 'Subfloor selected. Board courses are suppressed; panel staggering remains in the existing layout export.' :
        `${deck.pictureFrameCount} picture-frame course(s); ${deck.breakerBoardCount} breaker course(s). Surface outlines use the same 3D board and miter geometry.`,
      `${deck.stairCount} placed stair flight(s). ${deck.stairRisers} risers / ${deck.stairTreadsPerRun} treads per flight; rise ${cadFeet(deck.stairRiseFt * 12)}, run ${cadFeet(deck.stairRunFt * 12)}.`,
      `Stair guards follow each flight's selected left/right setting. Railing: ${String(values.railingType ?? 'selected system')}.`,
      tier.landings.length ? `${tier.landings.length} new landing(s) LP series; see dimensioned landing details and concrete order.` : 'Landing surface is existing/site-plan/unconfirmed. No new pad has been assumed.',
      'H09 surface fastening / H10 joist tape; use approved material and fastening instructions. Stock cuts and contingency remain in the material order.',
    ]);

    const elevationScale = scaleFor(Math.max(deck.width * 864 / 490, deck.depth * 864 / 400, (tier.heightFt + deck.footingDepthIn / 12) * 864 / 355));
    const elevation = newSheet(`${tier.label} / HEIGHT + SUPPORT ELEVATIONS`, elevationScale);
    const ef = 864 / elevationScale, ground = 540, jh = actualJoistIn(deck.joistSize) / 12;
    const projection = (axis: 'x' | 'y', left: number, min: number, max: number) => {
      const pt = (station: number, height: number) => ({ x: left + (station - min) * ef, y: ground - height * ef });
      const caption = axis === 'x' ? 'FRONT PROJECTION / X' : 'SIDE PROJECTION / Y';
      text(elevation, left, 112, caption, 11, 'NOTES', true);
      poly(elevation, [pt(min, tier.heightFt), pt(max, tier.heightFt), pt(max, tier.heightFt - jh), pt(min, tier.heightFt - jh)], 'OUTLINE', true);
      line(elevation, pt(min - .5, 0), pt(max + .5, 0), 'CENTER');
      const stations = [...new Set(deck.postLocations.map(p => p[axis]))].sort((a, b) => a - b);
      const pw = actualPostIn(deck) / 12, fd = deck.footingDiameterIn / 12, depth = deck.footingDepthIn / 12;
      stations.forEach(station => {
        poly(elevation, [pt(station - pw / 2, 0), pt(station + pw / 2, 0), pt(station + pw / 2, Math.max(0, tier.heightFt - jh)), pt(station - pw / 2, Math.max(0, tier.heightFt - jh))], 'POSTS', true);
        poly(elevation, [pt(station - fd / 2, 0), pt(station + fd / 2, 0), pt(station + fd / 2, -depth), pt(station - fd / 2, -depth)], 'FOOTINGS', true);
      });
      dimension(elevation, pt(min, 0), pt(max, 0), depth * ef + 34);
      const chain = [min, ...stations.filter(p => p > min + .01 && p < max - .01), max];
      for (let i = 0; i + 1 < chain.length; i++) {
        if ((chain[i + 1] - chain[i]) * ef > 24) dimension(elevation, pt(chain[i], 0), pt(chain[i + 1], 0), depth * ef + 14);
      }
      dimension(elevation, pt(min, 0), pt(min, tier.heightFt), -42);
      text(elevation, left, 628, 'SUPPORTS PROJECTED AT SAVED COORDINATES', 8);
    };
    projection('x', 104, deck.minX, deck.maxX); projection('y', 736, deck.minY, deck.maxY);
    wrapped(elevation, 54, 150, `Deck surface datum: ${cadFeet(tier.heightFt * 12)} above grade. Framing depth: ${actualJoistIn(deck.joistSize)} in. Post tops follow the estimator's joist-underface allowance; approved beam bearing/notch/base elevations govern final cuts.`, 1120, 8.5);

    const foundation = newSheet(`${tier.label} / F1 FOUNDATION DETAIL`, 8), sf = 72 / foundation.scale;
    text(foundation, 80, 103, 'F1 / ROUND FOOTING SECTION', 11, 'NOTES', true);
    const foot = (x: number, y: number) => ({ x: 100 + x * sf, y: 310 + y * sf });
    const fd = deck.footingDiameterIn, depth = deck.footingDepthIn, post = actualPostIn(deck);
    // Very large configured footings get their own fitting scale without altering values.
    foundation.scale = scaleFor(Math.max(8, fd * 72 / 300, depth * 72 / 250));
    const ff = 72 / foundation.scale;
    const fpt = (x: number, y: number) => ({ x: foot(0, 0).x + x * ff, y: foot(0, 0).y + y * ff });
    poly(foundation, [fpt(0, 0), fpt(fd, 0), fpt(fd, depth), fpt(0, depth)], 'FOOTINGS', true);
    rect(foundation, fpt((fd - post) / 2, 0).x, 156, post * ff, 154, 'POSTS');
    line(foundation, { x: 70, y: 310 }, { x: fpt(fd, 0).x + 32, y: 310 }, 'CENTER');
    text(foundation, 80, 142, `${deck.postSize} POST CONTINUES`, 9, 'TAGS', true);
    line(foundation, { x: fpt((fd - post) / 2, 0).x - 4, y: 177 }, { x: fpt((fd + post) / 2, 0).x + 4, y: 167 }, 'TAGS');
    dimension(foundation, fpt(0, depth), fpt(fd, depth), 35, `${fd} in DIA`);
    dimension(foundation, fpt(fd, 0), fpt(fd, depth), -40, `${depth} in DEEP`);
    line(foundation, fpt(fd / 2, 0), { x: 390, y: 235 }, 'TAGS');
    text(foundation, 390, 225, 'H01 BASE / H02 ANCHOR', 9, 'TAGS', true);
    wrapped(foundation, 390, 245, 'Symbolic connection callout. Select approved base/anchor; embedment and bolt geometry are not inferred.', 325, 8.5);
    const cx = 605, cy = 465;
    foundation.entities.push({ type: 'insert', name: symbol.name, at: { x: cx, y: cy }, scale: ff, layer: 'POSTS' });
    text(foundation, cx, 355, 'PLAN / SAME F1', 10, 'NOTES', true, 'center');
    dimension(foundation, { x: cx - fd / 2 * ff, y: cy }, { x: cx + fd / 2 * ff, y: cy }, fd / 2 * ff + 34, `${fd} in DIA`);
    notePanel(foundation, 'F1 / QUANTITIES + BASIS', [
      `${deck.postCount} round footing(s) this tier. Actual concrete geometry: ${fd} in diameter x ${depth} in depth.`,
      `${deck.footingBagsPerPost} x 80 lb bags per footing / ${deck.concreteBags} bags total. Tube stock ${deck.footingTubeStockIn} in / ${deck.footingTubeCount} tube(s).`,
      `Post face: ${post} in actual for selected ${deck.postSize}. Base and anchor quantities come from the hardware order.`,
      'The specified depth is the saved project value. Verify bearing, frost, grade and approved structural connection before construction.',
    ]);

    const uniqueFlights = new Map<string, { index: number; width: number; pad?: StairLandingPlan }>();
    deck.stairPlacements.forEach((p, index) => { const pad = tier.landings[index]; const key = [p.width, pad?.widthFt, pad?.depthFt, pad?.thicknessIn].join(':'); if (!uniqueFlights.has(key)) uniqueFlights.set(key, { index, width: p.width, pad }); });
    for (const { index, width, pad } of uniqueFlights.values()) {
      const runIn = deck.stairRunFt * 12, riseIn = deck.stairRiseFt * 12, padDepth = (pad?.depthFt ?? 0) * 12;
      const stairScale = scaleFor(Math.max((runIn + padDepth + 36) * 72 / 890, (riseIn + 32) * 72 / 390));
      const s = newSheet(`${tier.label} / ST${index + 1} STAIR PROFILE`, stairScale), f = 72 / stairScale;
      const atStair = (x: number, z: number) => ({ x: 170 + x * f, y: 560 - z * f });
      const riser = riseIn / deck.stairRisers, going = runIn / deck.stairTreadsPerRun;
      const points: CadPoint[] = [atStair(-24, riseIn), atStair(0, riseIn)];
      for (let step = 0; step < deck.stairTreadsPerRun; step++) points.push(atStair(step * going, riseIn - (step + 1) * riser), atStair((step + 1) * going, riseIn - (step + 1) * riser));
      points.push(atStair(runIn, 0)); poly(s, points, 'STAIRS');
      line(s, atStair(-25, 0), atStair(runIn + padDepth + 12, 0), 'CENTER');
      dimension(s, atStair(0, 0), atStair(0, riseIn), -55);
      dimension(s, atStair(0, 0), atStair(runIn, 0), 42);
      dimension(s, atStair(0, riseIn - riser), atStair(going, riseIn - riser), -27, `${cadInches(going)} TREAD`);
      text(s, 70, 106, `${deck.stairRisers} RISERS @ ${cadInches(riser)} / ${deck.stairTreadsPerRun} TREADS @ ${cadInches(going)}`, 10, 'NOTES', true);
      wrapped(s, 70, 129, `ST${index + 1} width ${cadFeet(width * 12)}. Actual total rise/run follow the shared deck model. Riser/tread finish selection is retained in the material order. Stringer cut length ${cadFeet(deck.stairStringerCutLength * 12)} / ${deck.stairStringerLength} ft stock; final bearing, nosing and connection cuts require field verification.`, 1085, 8.5);
      if (pad) {
        poly(s, [atStair(runIn, 0), atStair(runIn + padDepth, 0), atStair(runIn + padDepth, -pad.thicknessIn), atStair(runIn, -pad.thicknessIn)], 'LANDING', true);
        dimension(s, atStair(runIn, 0), atStair(runIn + padDepth, 0), 64);
        text(s, atStair(runIn + padDepth / 2, 0).x, 545, `LP${index + 1} / ${pad.thicknessIn} in`, 8.5, 'TAGS', true, 'center');
      }
    }
    const padTypes = [...new Map(tier.landings.map(p => [[p.widthFt, p.depthFt, p.thicknessIn].join(':'), p])).values()];
    padTypes.forEach((pad, index) => {
      const n = tier.landings.filter(p => p.widthFt === pad.widthFt && p.depthFt === pad.depthFt && p.thicknessIn === pad.thicknessIn).length;
      const scale = scaleFor(Math.max(pad.widthFt * 864 / 430, pad.depthFt * 864 / 365, 8));
      const s = newSheet(`${tier.label} / LP${index + 1} LANDING DETAIL`, scale), f = 72 / scale;
      const w = pad.widthFt * 12, d = pad.depthFt * 12;
      text(s, 95, 108, 'PLAN / NEW CONCRETE', 11, 'NOTES', true);
      rect(s, 110, 165, w * f, d * f, 'LANDING');
      dimension(s, { x: 110, y: 165 }, { x: 110 + w * f, y: 165 }, -30);
      dimension(s, { x: 110, y: 165 }, { x: 110, y: 165 + d * f }, 34);
      text(s, 680, 108, 'SECTION / THICKNESS', 11, 'NOTES', true);
      rect(s, 680, 190, d * f, pad.thicknessIn * f, 'LANDING');
      dimension(s, { x: 680, y: 190 }, { x: 680 + d * f, y: 190 }, -32);
      dimension(s, { x: 680 + d * f, y: 190 }, { x: 680 + d * f, y: 190 + pad.thicknessIn * f }, -30, `${pad.thicknessIn} in`);
      let y = 335;
      for (const note of [
        `${n} landing(s) of this type. ${pad.widthFt} ft x ${pad.depthFt} ft x ${pad.thicknessIn} in thick.`,
        `Net volume ${pad.volumeCuFt.toFixed(4)} cu ft each. Ordered ${pad.bags80lb} x 80 lb bags each / ${n * pad.bags80lb} bags this type.`,
        `Order allowance: ${((pad.wasteAdjustedCuFt / pad.volumeCuFt - 1) * 100).toFixed(0)}%; yield follows the shared landing planner.`,
        'Only explicitly selected new landings are included. Verify base preparation, reinforcement, drainage and approved landing requirements.',
      ]) y = wrapped(s, 680, y, note, 450, 9) + 17;
    });
  }

  const hardware = items.filter(isHardware);
  if (hardware.length) tablePages('H', 'HARDWARE + FASTENER ORDER SCHEDULE', ['KEY', 'ITEM / STYLE', 'ORDER QTY', 'UNIT', 'PURCHASING SPECIFICATION', 'NOTES / LOCATIONS'],
    [68, 255, 82, 72, 250, 411], hardware.map(item => [constructionHardwareKey(item), item.name + (item.color ? ` / ${item.color}` : ''),
      String(item.quantity), item.unit, item.stockRecommendation, [item.layoutLabel, item.notes].filter(Boolean).join(' / ')]));
  tablePages('K', 'CONNECTION KEY / DETAIL REQUIREMENTS', ['KEY', 'CONDITION', 'DETAIL BASIS / REQUIRED APPROVAL'], [140, 270, 728], connectionNotes);
  const members = items.filter(item => !isHardware(item) && /framing|structure|stair|support/i.test(item.category));
  if (members.length) tablePages('M', 'MEMBER + CONCRETE ORDER SCHEDULE', ['ITEM / STYLE', 'ORDER QTY', 'UNIT', 'STOCK / CUT BASIS', 'LOCATIONS / NOTES'],
    [270, 80, 75, 230, 483], members.map(item => [item.name + (item.color ? ` / ${item.color}` : ''), String(item.quantity), item.unit,
      item.stockRecommendation, [item.layoutLabel, item.notes].filter(Boolean).join(' / ')]));
  if (set.warnings.length) tablePages('N', 'DRAWING BASIS + ORDER RECONCILIATION', ['SUBJECT', 'PROJECT NOTES'], [225, 913], [
    ['Shared geometry', 'DeckModel is the source for post positions, joist stations, beam spans, footing dimensions and stair rise/run. Finish outlines use the existing shared 3D planners. Geometry is not inferred from an image.'],
    ['DXF units / plotting', 'Model space is inches at 1:1. Sheet groups are laid out side by side. Plot each border at its printed 1:n scale on 17 x 11 in paper. Dimensions are native non-associative DIMENSION entities, regenerated from the saved model on export.'],
    ['PDF printing', 'Print on 17 x 11 in (ANSI B) at Actual size / 100%, without Fit. Linework and text are vector. Dimension labels round to 1/16 in; DXF definition points retain model precision.'],
    ...set.warnings.map(note => ['Review', note]),
  ]);
  set.sheets.forEach((s, index) => {
    rect(s, 24, 24, 1176, 744, 'TITLE');
    text(s, 42, 51, 'S&S DESIGN BUILD / CONSTRUCTION COORDINATION', 13, 'TITLE', true);
    text(s, 1180, 50, `${s.id} / REV ${revision}`, 11, 'TITLE', true, 'right');
    line(s, { x: 24, y: 66 }, { x: 1200, y: 66 }, 'TITLE');
    text(s, 42, 86, s.title, 10, 'TITLE', true);
    line(s, { x: 24, y: 684 }, { x: 1200, y: 684 }, 'TITLE');
    line(s, { x: 565, y: 684 }, { x: 565, y: 768 }, 'TITLE');
    line(s, { x: 1006, y: 684 }, { x: 1006, y: 768 }, 'TITLE');
    text(s, 40, 705, 'S&S DESIGN BUILD', 13, 'TITLE', true);
    wrapped(s, 40, 722, String(values.poJobName || 'Deck project'), 505, 9, 11);
    wrapped(s, 40, 746, String(values.jobAddress || 'Project address not entered'), 505, 8, 10);
    if (values.customerPhone) text(s, 40, 761, `Phone: ${values.customerPhone}`, 7.6, 'TITLE');
    wrapped(s, 580, 704, s.title, 410, 9, 12, true);
    text(s, 580, 741, s.scale === 1 ? 'SCHEDULE / NTS' : `SCALE 1:${s.scale} / ${Number((12 / s.scale).toFixed(4))} in = 1 ft`, 8.5, 'TITLE');
    text(s, 580, 757, 'MODEL: INCHES / PRINT 17 x 11 in AT 100%', 8, 'TITLE');
    text(s, 1024, 722, s.id, 24, 'TITLE', true);
    text(s, 1024, 743, `SHEET ${index + 1} OF ${set.sheets.length}`, 9, 'TITLE');
    text(s, 1024, 759, `REV ${revision}`, 8, 'TITLE');
    text(s, 42, 673, 'VERIFY FIELD CONDITIONS / APPROVED STRUCTURAL + MANUFACTURER DETAILS GOVERN CONNECTIONS', 7.7, 'NOTES');
  });
  set.issues = [...new Set(set.issues)];
  return set;
}
