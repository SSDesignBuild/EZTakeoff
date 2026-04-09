import { DeckEdgeSegment, DeckPoint, LockedPostPoint } from './types';

export interface DeckInputs {
  deckShape?: string | number | boolean;
  attachment?: string | number | boolean;
  boardRun?: string | number | boolean;
  deckHeight?: string | number | boolean;
  stairCount?: string | number | boolean;
  stairWidth?: string | number | boolean;
  stairRise?: string | number | boolean;
  perimeterRailingFt?: string | number | boolean;
  railingType?: string | number | boolean;
  deckingType?: string | number | boolean;
  borderSameBoard?: string | number | boolean;
  customBeamYs?: string | number | boolean;
  stairEdgeIndex?: string | number | boolean;
  stairOffset?: string | number | boolean;
  manualRailingEdges?: string | number | boolean;
  lockedPosts?: string | number | boolean;
  beamEdits?: string | number | boolean;
  beamCantilever?: string | number | boolean;
}

export interface BeamEdit { beamIndex: number; startTrim: number; endTrim: number; }

export interface BeamLine {
  y: number;
  offsetFromHouse: number;
  segments: { startX: number; endX: number; length: number }[];
  postXs: number[];
  lockedPostXs: number[];
  startTrim: number;
  endTrim: number;
}

export interface BoardGroup { length: number; count: number; }

export interface StairPlacement {
  edgeIndex: number | null;
  offset: number;
  width: number;
  landingProjection: number;
  start: DeckPoint | null;
  end: DeckPoint | null;
}

export interface DeckModel {
  points: DeckPoint[];
  area: number;
  perimeter: number;
  width: number;
  depth: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  attachment: 'siding' | 'brick' | 'freestanding';
  isFreestanding: boolean;
  boardRun: 'width' | 'projection';
  joistDirection: 'vertical' | 'horizontal';
  deckingDirection: 'vertical' | 'horizontal';
  boardGroups: BoardGroup[];
  borderGroups: BoardGroup[];
  exposedPerimeter: number;
  houseContactLength: number;
  joistSpacingFt: number;
  joistCount: number;
  supportSpans: number[];
  joistSize: '2x8' | '2x10' | '2x12';
  joistStockLength: number;
  joistLengthGroups: BoardGroup[];
  beamLines: BeamLine[];
  beamMemberSize: '2x10' | '2x12' | 'PSL';
  beamBoardGroups: BoardGroup[];
  beamSegmentsCount: number;
  postCount: number;
  lockedPosts: LockedPostPoint[];
  beamEdits: BeamEdit[];
  postLength: number;
  doubleBandLf: number;
  doubleBandGroups: BoardGroup[];
  blockingRows: number;
  blockingCount: number;
  blockingBoardCount: number;
  joistTapeLf: number;
  joistHangers: number;
  rafterTies: number;
  carriageBolts: number;
  lateralLoadBrackets: number;
  sdsCorners: number;
  deckFastenerCount: number;
  deckFastenerBoxes: number;
  fastenerType: 'top screws' | 'hidden camo screws';
  concreteBags: number;
  postBases: number;
  concreteAnchors: number;
  fasciaLf: number;
  fasciaPieces: number;
  stairCount: number;
  stairRiseFt: number;
  stairRisers: number;
  stairTreadsPerRun: number;
  stairRunFt: number;
  stairTreadGroups: BoardGroup[];
  stairStringers: number;
  stairStringerLength: number;
  railingRun: number;
  railingSections6: number;
  railingSections8: number;
  railingPosts: number;
  edgeSegments: DeckEdgeSegment[];
  exposedSegments: DeckEdgeSegment[];
  manualRailingEdges: number[];
  stairPlacement: StairPlacement;
}

const DEFAULT_SHAPE: DeckPoint[] = [
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 12 },
  { x: 0, y: 12 },
];
const STOCK_LENGTHS = [8, 10, 12, 16, 20];
const BOARD_STOCK_LENGTHS = [8, 12, 16, 20];
const DECK_BOARD_FACE = 5.5 / 12;
const DECK_GAP = 0.125 / 12;
const EFFECTIVE_COVERAGE = DECK_BOARD_FACE + DECK_GAP;
const JOIST_SPACING = 1;
const BEAM_TARGET_SPACING = 10;
const POST_TARGET_SPACING = 6;
const POST_MAX_SPACING = 7.5;
const JOIST_SPAN_LIMITS = { '2x8': 12, '2x10': 14, '2x12': 16 } as const;
const BEAM_SPAN_LIMITS = { '2x10': 7, '2x12': 9, PSL: 13 } as const;

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const chooseStockLength = (required: number, stock = STOCK_LENGTHS) => stock.find((item) => item >= required - 1e-6) ?? stock[stock.length - 1];

function parseNumberArray(raw: string | number | boolean | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as number[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => round2(Number(item))).filter((item) => Number.isFinite(item)) : [];
  } catch { return []; }
}

function parseLockedPosts(raw: string | number | boolean | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as LockedPostPoint[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({ beamIndex: Math.max(0, Math.round(Number(item.beamIndex ?? 0))), x: round2(Number(item.x ?? 0)) }))
      .filter((item) => Number.isFinite(item.x));
  } catch { return []; }
}

function parseBeamEdits(raw: string | number | boolean | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as BeamEdit[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({ beamIndex: Math.max(0, Math.round(Number(item.beamIndex ?? 0))), startTrim: Math.max(0, round2(Number(item.startTrim ?? 0))), endTrim: Math.max(0, round2(Number(item.endTrim ?? 0))) }));
  } catch { return []; }
}

function parseIndexArray(raw: string | number | boolean | undefined) {
  return Array.from(new Set(parseNumberArray(raw).map((item) => Math.round(item)).filter((item) => item >= 0)));
}

export function parseDeckShape(raw: string | number | boolean | undefined): DeckPoint[] {
  if (typeof raw !== 'string') return DEFAULT_SHAPE;
  try {
    const parsed = JSON.parse(raw) as DeckPoint[];
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    }
  } catch {}
  return DEFAULT_SHAPE;
}

function polygonArea(points: DeckPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(points: DeckPoint[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return sum;
}

function getBounds(points: DeckPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function edgeSegments(points: DeckPoint[]): DeckEdgeSegment[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const orientation = Math.abs(point.y - next.y) < 1e-6 ? 'horizontal' : Math.abs(point.x - next.x) < 1e-6 ? 'vertical' : 'angled';
    return { start: point, end: next, length: Math.hypot(next.x - point.x, next.y - point.y), orientation, index };
  });
}

function scanlineIntersections(points: DeckPoint[], axis: 'horizontal' | 'vertical', position: number) {
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (axis === 'horizontal') {
      const y1 = current.y; const y2 = next.y; const minY = Math.min(y1, y2); const maxY = Math.max(y1, y2);
      if (position < minY || position >= maxY || Math.abs(y1 - y2) < 1e-9) continue;
      const t = (position - y1) / (y2 - y1);
      intersections.push(current.x + t * (next.x - current.x));
    } else {
      const x1 = current.x; const x2 = next.x; const minX = Math.min(x1, x2); const maxX = Math.max(x1, x2);
      if (position < minX || position >= maxX || Math.abs(x1 - x2) < 1e-9) continue;
      const t = (position - x1) / (x2 - x1);
      intersections.push(current.y + t * (next.y - current.y));
    }
  }
  intersections.sort((a, b) => a - b);
  const pairs: { start: number; end: number; length: number }[] = [];
  for (let index = 0; index < intersections.length; index += 2) {
    const start = intersections[index]; const end = intersections[index + 1];
    if (end !== undefined && end > start) pairs.push({ start: round2(start), end: round2(end), length: round2(end - start) });
  }
  return pairs;
}

function accumulateGroups(lengths: number[], stock = BOARD_STOCK_LENGTHS) {
  const grouped = new Map<number, number>();
  lengths.forEach((length) => {
    const chosen = chooseStockLength(length, stock);
    grouped.set(chosen, (grouped.get(chosen) ?? 0) + 1);
  });
  return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }));
}

function mergeGroups(...groups: BoardGroup[][]) {
  const map = new Map<number, number>();
  groups.flat().forEach((group) => map.set(group.length, (map.get(group.length) ?? 0) + group.count));
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }));
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values.map((value) => round2(value)))).sort((a, b) => a - b);
}

function segmentPointAtOffset(segment: DeckEdgeSegment, offset: number) {
  const ratio = segment.length <= 0 ? 0 : clamp(offset / segment.length, 0, 1);
  return { x: round2(segment.start.x + (segment.end.x - segment.start.x) * ratio), y: round2(segment.start.y + (segment.end.y - segment.start.y) * ratio) };
}

export function buildDeckModel(inputs: DeckInputs): DeckModel {
  const points = parseDeckShape(inputs.deckShape);
  const { minX, minY, maxX, maxY } = getBounds(points);
  const width = round2(maxX - minX);
  const depth = round2(maxY - minY);
  const attachment = String(inputs.attachment ?? 'siding') as DeckModel['attachment'];
  const isFreestanding = attachment !== 'siding';
  const boardRun = String(inputs.boardRun ?? 'width') === 'projection' ? 'projection' : 'width';
  const joistDirection = boardRun === 'width' ? 'vertical' : 'horizontal';
  const deckingDirection = boardRun === 'width' ? 'horizontal' : 'vertical';
  const segments = edgeSegments(points);
  const houseSegments = !isFreestanding ? segments.filter((segment) => segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6) : [];
  const houseContactLength = round2(houseSegments.reduce((sum, segment) => sum + segment.length, 0));

  const manualRailingEdges = parseIndexArray(inputs.manualRailingEdges).filter((index) => index < segments.length);
  const defaultExposedSegments = isFreestanding ? segments : segments.filter((segment) => !(segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6));
  const exposedSegments = manualRailingEdges.length > 0 ? segments.filter((segment) => manualRailingEdges.includes(segment.index)) : defaultExposedSegments;
  const exposedPerimeter = round2(exposedSegments.reduce((sum, segment) => sum + segment.length, 0));

  const boardLengths: number[] = [];
  if (boardRun === 'width') {
    for (let y = minY + EFFECTIVE_COVERAGE / 2; y < maxY; y += EFFECTIVE_COVERAGE) scanlineIntersections(points, 'horizontal', y).forEach((pair) => boardLengths.push(pair.length));
  } else {
    for (let x = minX + EFFECTIVE_COVERAGE / 2; x < maxX; x += EFFECTIVE_COVERAGE) scanlineIntersections(points, 'vertical', x).forEach((pair) => boardLengths.push(pair.length));
  }
  const boardGroups = accumulateGroups(boardLengths);
  const borderGroups = inputs.borderSameBoard ? accumulateGroups(exposedSegments.map((segment) => segment.length)) : [];

  const rawCustomBeams = parseNumberArray(inputs.customBeamYs).map((value) => clamp(value, 0, depth)).filter((value) => isFreestanding ? value >= 0 && value <= depth : value > 0.2 && value < depth - 0.2);
  const beamCantilever = Math.max(0, Math.min(2, Number(inputs.beamCantilever ?? 2)));
  const notchBeamOffsets = attachment === 'brick'
    ? uniqueSorted([
        ...segments
          .filter((segment) => segment.orientation === 'horizontal' && segment.start.y > minY + 0.2 && segment.start.y < maxY - 0.2)
          .map((segment) => round2(segment.start.y - minY)),
        ...points
          .map((point) => round2(point.y - minY))
          .filter((value) => value > 0.2 && value < depth - 0.2),
      ])
    : [];
  const beamOffsets = uniqueSorted((rawCustomBeams.length > 0 ? uniqueSorted(rawCustomBeams) : (() => {
    if (depth <= beamCantilever) return isFreestanding ? [0] : [depth];
    const positions: number[] = [];
    const frontBeam = Math.max(0, round2(depth - beamCantilever));
    positions.push(frontBeam);
    while (positions[positions.length - 1] > BEAM_TARGET_SPACING + (isFreestanding ? 0 : 0.01)) positions.push(round2(positions[positions.length - 1] - BEAM_TARGET_SPACING));
    if (isFreestanding) positions.push(0);
    return uniqueSorted(positions);
  })()).concat(notchBeamOffsets));

  const supportAnchors = uniqueSorted([minY, ...beamOffsets.map((value) => value + minY), maxY]);
  const supportSpans = supportAnchors.slice(1).map((value, index) => round2(value - supportAnchors[index]));
  const maxSpan = Math.max(...supportSpans, 0);
  const joistSize: DeckModel['joistSize'] = maxSpan <= JOIST_SPAN_LIMITS['2x8'] ? '2x8' : maxSpan <= JOIST_SPAN_LIMITS['2x10'] ? '2x10' : '2x12';

  const joistLengthsRaw: number[] = [];
  if (joistDirection === 'vertical') {
    for (let x = minX + JOIST_SPACING / 2; x < maxX; x += JOIST_SPACING) scanlineIntersections(points, 'vertical', x).forEach((pair) => joistLengthsRaw.push(pair.length));
  } else {
    for (let y = minY + JOIST_SPACING / 2; y < maxY; y += JOIST_SPACING) scanlineIntersections(points, 'horizontal', y).forEach((pair) => joistLengthsRaw.push(pair.length));
  }
  const joistCount = Math.max(2, joistLengthsRaw.length);
  const joistLengthGroups = accumulateGroups(joistLengthsRaw);
  const joistStockLength = chooseStockLength(Math.min(Math.max(...joistLengthsRaw, maxSpan), JOIST_SPAN_LIMITS[joistSize]));
  const lockedPosts = parseLockedPosts(inputs.lockedPosts);
  const beamEdits = parseBeamEdits(inputs.beamEdits);

  const beamLines: BeamLine[] = beamOffsets.map((offsetY, beamIndex) => {
    const y = round2(offsetY + minY);
    const beamEdit = beamEdits.find((item) => item.beamIndex === beamIndex) ?? { beamIndex, startTrim: 0, endTrim: 0 };
    const segmentsAtBeam = scanlineIntersections(points, 'horizontal', y + 0.0001).map((pair, index, list) => {
      const startX = round2(pair.start + (index === 0 ? beamEdit.startTrim : 0));
      const endX = round2(pair.end - (index === list.length - 1 ? beamEdit.endTrim : 0));
      return { startX, endX, length: round2(endX - startX) };
    }).filter((segment) => segment.length > 0.25);
    const postXs: number[] = [];
    segmentsAtBeam.forEach((segment) => {
      const usableLength = Math.max(0, segment.length - (beamCantilever * 2));
      const postStart = segment.startX + beamCantilever;
      const postEnd = segment.endX - beamCantilever;
      const preferredCount = Math.max(2, Math.ceil(Math.max(usableLength, 0.01) / POST_TARGET_SPACING) + 1);
      const spacing = Math.max(usableLength, 0.01) / Math.max(1, preferredCount - 1);
      const adjustedCount = spacing > POST_MAX_SPACING ? preferredCount + 1 : preferredCount;
      for (let index = 0; index < adjustedCount; index += 1) {
        const x = round2(postStart + (Math.max(postEnd - postStart, 0) * index) / Math.max(1, adjustedCount - 1));
        if (!postXs.some((value) => Math.abs(value - x) < 0.1)) postXs.push(x);
      }
      if (attachment === 'brick' && segment.length > 14 && !postXs.some((value) => Math.abs(value - (segment.startX + segment.length / 2)) < 0.1)) {
        postXs.push(round2(segment.startX + segment.length / 2));
      }
    });
    const lockedForBeam = lockedPosts.filter((item) => item.beamIndex === beamIndex && segmentsAtBeam.some((segment) => item.x >= segment.startX - 0.01 && item.x <= segment.endX + 0.01)).map((item) => item.x);
    lockedForBeam.forEach((x) => { if (!postXs.some((value) => Math.abs(value - x) < 0.1)) postXs.push(x); });
    return { y, offsetFromHouse: round2(offsetY), segments: segmentsAtBeam, postXs: postXs.sort((a, b) => a - b), lockedPostXs: lockedForBeam.sort((a, b) => a - b), startTrim: beamEdit.startTrim, endTrim: beamEdit.endTrim };
  });

  const postCount = beamLines.reduce((sum, line) => sum + line.postXs.length, 0);
  const maxBeamSpan = Math.max(0, ...beamLines.flatMap((line) => {
    if (line.postXs.length < 2) return [0];
    const spans: number[] = [];
    for (let index = 1; index < line.postXs.length; index += 1) spans.push(round2(line.postXs[index] - line.postXs[index - 1]));
    return spans;
  }));
  const beamMemberSize: DeckModel['beamMemberSize'] = maxBeamSpan <= BEAM_SPAN_LIMITS['2x10'] ? '2x10' : maxBeamSpan <= BEAM_SPAN_LIMITS['2x12'] ? '2x12' : 'PSL';
  const beamBoardGroupsMerged = mergeGroups(...beamLines.map((line) => mergeGroups(...line.segments.map((segment) => accumulateGroups([segment.length, segment.length])))));
  const beamSegmentsCount = beamLines.reduce((sum, line) => sum + line.segments.length * 2, 0);

  const bandSegments = accumulateGroups([...segments.map((segment) => segment.length), ...segments.map((segment) => segment.length)]);
  const doubleBandLf = round2(polygonPerimeter(points) * 2);
  const blockingRows = 2;
  const blockingCount = joistCount * 2;
  const blockingBoardCount = Math.ceil((blockingCount * 1.5) / 8);
  const joistTapeLf = round2(joistLengthsRaw.reduce((sum, length) => sum + length, 0) + doubleBandLf / 2);
  const joistHangers = isFreestanding ? joistCount * 2 : joistCount;
  const rafterTies = joistCount * Math.max(1, beamLines.length);
  const postLength = chooseStockLength(Number(inputs.deckHeight ?? 8) + 2, [8, 10, 12, 16]);
  const concreteBags = postCount * 3;
  const postBases = postCount;
  const concreteAnchors = postCount;
  const stairCount = Math.max(0, Number(inputs.stairCount ?? 0));
  const stairWidth = Number(inputs.stairWidth ?? 4);
  const stairRiseFt = Number(inputs.stairRise ?? 0) > 0 ? Number(inputs.stairRise ?? 0) : Number(inputs.deckHeight ?? 0);
  const stairRisers = stairCount > 0 && stairRiseFt > 0 ? Math.ceil((stairRiseFt * 12) / 7.5) : 0;
  const stairTreadsPerRun = stairRisers > 0 ? Math.max(stairRisers - 1, 1) : 0;
  const stairRunFt = round2(stairTreadsPerRun * (11 / 12));
  const treadLengths: number[] = [];
  for (let run = 0; run < stairCount; run += 1) for (let tread = 0; tread < stairTreadsPerRun; tread += 1) treadLengths.push(stairWidth, stairWidth);
  const stairTreadGroups = accumulateGroups(treadLengths);
  const stairStringersPerRun = stairCount > 0 ? Math.max(2, Math.ceil(stairWidth / 1) + 1) : 0;
  const stairStringers = stairStringersPerRun * stairCount;
  const stairStringerLength = chooseStockLength(Math.max(12, Math.sqrt(stairRiseFt ** 2 + stairRunFt ** 2)), [12, 16, 20]);
  const stairSideFascia = stairCount * stairRunFt * 2;
  const riserFascia = stairCount * stairRisers * stairWidth;
  const fasciaLf = round2(exposedPerimeter + stairSideFascia + riserFascia);
  const fasciaPieces = Math.ceil(fasciaLf / 12);

  const stairEdgeIndexValue = Number(inputs.stairEdgeIndex ?? -1);
  const stairEdge = stairCount > 0 && stairEdgeIndexValue >= 0 && stairEdgeIndexValue < segments.length ? segments[stairEdgeIndexValue] : null;
  const stairOffset = stairEdge ? clamp(Number(inputs.stairOffset ?? 0), 0, Math.max(0, stairEdge.length - stairWidth)) : 0;
  const stairStart = stairEdge ? segmentPointAtOffset(stairEdge, stairOffset) : null;
  const stairEnd = stairEdge ? segmentPointAtOffset(stairEdge, stairOffset + Math.min(stairWidth, stairEdge.length)) : null;
  const stairPlacement: StairPlacement = { edgeIndex: stairEdge ? stairEdge.index : null, offset: stairOffset, width: stairWidth, landingProjection: stairRunFt, start: stairStart, end: stairEnd };

  const railingRun = round2(Number(inputs.perimeterRailingFt ?? 0) || exposedPerimeter);
  let railingSections6 = 0;
  let railingSections8 = 0;
  exposedSegments.forEach((segment) => {
    let segmentBest = { six: 0, eight: 0, waste: Number.POSITIVE_INFINITY, pieces: Number.POSITIVE_INFINITY };
    for (let six = 0; six < 10; six += 1) {
      for (let eight = 0; eight < 10; eight += 1) {
        const covered = (six * 6) + (eight * 8);
        if (covered + 1e-6 < segment.length) continue;
        const waste = covered - segment.length;
        const pieces = six + eight;
        if (waste < segmentBest.waste - 1e-6 || (Math.abs(waste - segmentBest.waste) < 1e-6 && pieces < segmentBest.pieces) || (Math.abs(waste - segmentBest.waste) < 1e-6 && pieces == segmentBest.pieces && six > segmentBest.six)) {
          segmentBest = { six, eight, waste, pieces };
        }
      }
    }
    railingSections6 += segmentBest.six;
    railingSections8 += segmentBest.eight;
  });
  const railingType = String(inputs.railingType ?? 'aluminum');
  const railingPosts = railingType === 'aluminum' ? 0 : Math.max(2, Math.ceil(railingRun / 6) + 1);
  const carriageBolts = postCount * 2 + (railingPosts > 0 ? railingPosts * 2 : 0);
  const lateralLoadBrackets = isFreestanding ? 0 : Math.max(2, Math.ceil(houseContactLength / 2));
  const sdsCorners = Math.max(4, segments.length) * 4;
  const deckFastenerCount = joistLengthsRaw.reduce((sum, length) => sum + Math.ceil(length / JOIST_SPACING) * 2, 0);
  const deckFastenerBoxes = String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? Math.ceil(deckFastenerCount / 365) : Math.ceil(deckFastenerCount / 1750);
  const fastenerType = String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? 'top screws' : 'hidden camo screws';

  return { points, area: round2(polygonArea(points)), perimeter: round2(polygonPerimeter(points)), width, depth, minX, minY, maxX, maxY, attachment, isFreestanding, boardRun, joistDirection, deckingDirection, boardGroups, borderGroups, exposedPerimeter, houseContactLength, joistSpacingFt: JOIST_SPACING, joistCount, supportSpans, joistSize, joistStockLength, joistLengthGroups, beamLines, beamMemberSize, beamBoardGroups: beamBoardGroupsMerged, beamSegmentsCount, postCount, lockedPosts, beamEdits, postLength, doubleBandLf, doubleBandGroups: bandSegments, blockingRows, blockingCount, blockingBoardCount, joistTapeLf, joistHangers, rafterTies, carriageBolts, lateralLoadBrackets, sdsCorners, deckFastenerCount, deckFastenerBoxes, fastenerType, concreteBags, postBases, concreteAnchors, fasciaLf, fasciaPieces, stairCount, stairRiseFt, stairRisers, stairTreadsPerRun, stairRunFt, stairTreadGroups, stairStringers, stairStringerLength, railingRun, railingSections6, railingSections8, railingPosts, edgeSegments: segments, exposedSegments, manualRailingEdges, stairPlacement };
}
