import { DeckEdgeSegment, DeckPoint, DeckRailCoverage, LockedPostPoint } from './types';

export interface DeckInputs {
  deckShape?: string | number | boolean;
  attachment?: string | number | boolean;
  boardRun?: string | number | boolean;
  deckHeight?: string | number | boolean;
  stairCount?: string | number | boolean;
  stairWidth?: string | number | boolean;
  stairRise?: string | number | boolean;
  stairRailingLeft?: string | number | boolean;
  stairRailingRight?: string | number | boolean;
  perimeterRailingFt?: string | number | boolean;
  railingType?: string | number | boolean;
  deckingType?: string | number | boolean;
  deckingMaterial?: string | number | boolean;
  breakerBoardCount?: string | number | boolean;
  breakerBoardMaterial?: string | number | boolean;
  breakerBoardMaterial2?: string | number | boolean;
  breakerBoardMaterial3?: string | number | boolean;
  pictureFrameCount?: string | number | boolean;
  pictureFrameMaterial?: string | number | boolean;
  pictureFrameMaterial2?: string | number | boolean;
  pictureFrameMaterial3?: string | number | boolean;
  borderSameBoard?: string | number | boolean;
  customBeamYs?: string | number | boolean;
  stairEdgeIndex?: string | number | boolean;
  stairOffset?: string | number | boolean;
  manualRailingEdges?: string | number | boolean;
  railCoverage?: string | number | boolean;
  lockedPosts?: string | number | boolean;
  beamEdits?: string | number | boolean;
  beamCantilever?: string | number | boolean;
  multiTierEnabled?: string | number | boolean;
  lowerDeckHeight?: string | number | boolean;
  lowerDeckWidth?: string | number | boolean;
  lowerDeckProjection?: string | number | boolean;
  lowerDeckShape?: string | number | boolean;
  additionalStairs?: string | number | boolean;
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
  joistPositions: number[];
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
  blockingLf: number;
  blockingBoardCount: number;
  pictureFrameCount: number;
  breakerBoardCount: number;
  breakerBoardPositions: number[];
  requiredFieldBoardBreaks: number[];
  joistTapeLf: number;
  joistHangers: number;
  angledJoistHangers: number;
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
  stairStringerBoardCount: number;
  stairStringerLength: number;
  stairStringerCutLength: number;
  stairRailingLeft: boolean;
  stairRailingRight: boolean;
  stairRailSideCount: number;
  railingRun: number;
  railingSections6: number;
  railingSections8: number;
  railingPosts: number;
  railCoverage: DeckRailCoverage[];
  edgeSegments: DeckEdgeSegment[];
  exposedSegments: DeckEdgeSegment[];
  manualRailingEdges: number[];
  stairPlacement: StairPlacement;
  stairPlacements: StairPlacement[];
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

function generateJoistPositions(min: number, max: number, spacing = JOIST_SPACING) {
  const span = max - min;
  if (span <= spacing) return [round2(min + span / 2)];
  const positions: number[] = [];
  for (let value = min + spacing; value < max - 1e-6; value += spacing) positions.push(round2(value));
  if (!positions.length) return [round2(min + span / 2)];
  const last = positions[positions.length - 1];
  const lastGap = max - last;
  // First joist starts 12 in from the band. Add one extra only if the
  // remaining gap to the far band would exceed 12 in, splitting that gap.
  if (lastGap > spacing + 1e-6) positions.push(round2(last + lastGap / 2));
  return Array.from(new Set(positions)).sort((a, b) => a - b);
}

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

function parseAdditionalStairs(raw: string | number | boolean | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as { edgeIndex: number; offset: number; width: number }[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      edgeIndex: Math.max(0, Math.round(Number(item.edgeIndex ?? 0))),
      offset: Math.max(0, round2(Number(item.offset ?? 0))),
      width: Math.max(0.1, round2(Number(item.width ?? 4))),
    })).filter((item) => Number.isFinite(item.edgeIndex) && Number.isFinite(item.offset) && Number.isFinite(item.width));
  } catch { return []; }
}
function parseRailCoverage(raw: string | number | boolean | undefined, segments: DeckEdgeSegment[]) {
  if (typeof raw !== 'string' || !raw.trim()) return [] as DeckRailCoverage[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as DeckRailCoverage[];
    return parsed.map((item) => ({
      edgeIndex: Math.max(0, Math.round(Number(item.edgeIndex ?? 0))),
      start: round2(Math.max(0, Number(item.start ?? 0))),
      end: round2(Math.max(0, Number(item.end ?? 0))),
      kind: String(item.kind ?? 'level') === 'angled' ? 'angled' : 'level',
    })).filter((item) => segments[item.edgeIndex] && item.end > item.start + 0.01 && item.start < segments[item.edgeIndex].length + 0.01)
      .map((item) => ({ ...item, end: Math.min(item.end, segments[item.edgeIndex].length), kind: item.kind as 'level' | 'angled' }))
      .sort((a, b) => a.edgeIndex - b.edgeIndex || a.start - b.start) as DeckRailCoverage[];
  } catch {
    return [] as DeckRailCoverage[];
  }
}

function buildDefaultRailCoverage(segments: DeckEdgeSegment[], indices: number[]) {
  return indices.map((edgeIndex) => ({ edgeIndex, start: 0, end: round2(segments[edgeIndex].length), kind: 'level' as const }));
}

function deriveTopRailSegments(coverage: DeckRailCoverage[], stairPlacement: StairPlacement): DeckRailCoverage[] {
  const top: DeckRailCoverage[] = [];
  coverage.forEach((item) => {
    if (stairPlacement.edgeIndex === null || item.edgeIndex !== stairPlacement.edgeIndex || !stairPlacement.start || !stairPlacement.end) {
      top.push(item);
      return;
    }
    const stairStart = stairPlacement.offset;
    const stairEnd = stairPlacement.offset + stairPlacement.width;
    if (item.start < stairStart - 0.01) top.push({ ...item, end: Math.min(item.end, stairStart), kind: item.kind as 'level' | 'angled' });
    if (item.end > stairEnd + 0.01) top.push({ ...item, start: Math.max(item.start, stairEnd), kind: item.kind as 'level' | 'angled' });
  });
  return top.filter((item) => item.end - item.start > 0.05);
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

function groupRepeatedCutsIntoStock(pieceCount: number, cutLength: number, stock = BOARD_STOCK_LENGTHS): BoardGroup[] {
  if (pieceCount <= 0 || cutLength <= 0) return [];
  const chosen = chooseStockLength(cutLength, stock);
  const piecesPerStock = Math.max(1, Math.floor((chosen + 1e-6) / cutLength));
  return [{ length: chosen, count: Math.ceil(pieceCount / piecesPerStock) }];
}


function boardStockSegments(totalLength: number, availableBreaks: number[] = []) {
  const sortedBreaks = availableBreaks.filter((value) => value > 0.05 && value < totalLength - 0.05).sort((a, b) => a - b);
  const marks = [0, ...sortedBreaks, totalLength];
  const segments: number[] = [];
  for (let i = 1; i < marks.length; i += 1) {
    let span = marks[i] - marks[i - 1];
    while (span > 20.01) {
      segments.push(20);
      span -= 20;
    }
    if (span > 0.05) segments.push(span);
  }
  return segments;
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
  const isFreestanding = attachment === 'freestanding';
  // Siding/wall attachments act as the rear support ledger and do not need a
  // post/beam line at the house. Brick/masonry is different: it may be
  // anchored for lateral restraint, but it must not be treated as the main
  // gravity support. Brick therefore keeps the house edge as a non-railing
  // attachment side while also forcing a rear support beam/post line.
  const needsHouseSupportBeam = attachment === 'brick' || isFreestanding;
  const boardRun = String(inputs.boardRun ?? 'width') === 'projection' ? 'projection' : 'width';
  const joistDirection = boardRun === 'width' ? 'vertical' : 'horizontal';
  const deckingDirection = boardRun === 'width' ? 'horizontal' : 'vertical';
  const segments = edgeSegments(points);
  const houseSegments = !isFreestanding ? segments.filter((segment) => segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6) : [];
  const houseContactLength = round2(houseSegments.reduce((sum, segment) => sum + segment.length, 0));

  const manualRailingEdges = parseIndexArray(inputs.manualRailingEdges).filter((index) => index < segments.length);
  const defaultExposedSegments = isFreestanding ? segments : segments.filter((segment) => !(segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6));
  const defaultRailIndices = manualRailingEdges.length > 0 ? manualRailingEdges : defaultExposedSegments.map((segment) => segment.index);
  const railCoverage = (() => {
    const parsed = parseRailCoverage(inputs.railCoverage, segments);
    return parsed.length ? parsed : buildDefaultRailCoverage(segments, defaultRailIndices);
  })();
  const exposedSegments = segments.filter((segment) => defaultExposedSegments.some((item) => item.index === segment.index));
  const exposedPerimeter = round2(exposedSegments.reduce((sum, segment) => sum + segment.length, 0));

  const pictureFrameCount = Math.max(0, Math.round(Number(inputs.pictureFrameCount ?? 1)));
  const breakerBoardCount = Math.max(0, Math.round(Number(inputs.breakerBoardCount ?? 0)));
  const fieldRunLength = boardRun === 'width' ? width : depth;
  const requiredFieldBoardBreaks = fieldRunLength > 20.01 && breakerBoardCount === 0 ? [fieldRunLength / 2] : [];
  // A single/double/triple breaker board is one split location with 1, 2, or 3 adjacent deck boards.
  // Do not create multiple split locations when the user chooses double or triple.
  const breakerBoardPositions = breakerBoardCount > 0 ? [round2((boardRun === 'width' ? minX : minY) + fieldRunLength / 2)] : [];
  const boardLengths: number[] = [];
  if (boardRun === 'width') {
    for (let y = minY + EFFECTIVE_COVERAGE / 2; y < maxY; y += EFFECTIVE_COVERAGE) scanlineIntersections(points, 'horizontal', y).forEach((pair) => boardStockSegments(pair.length, breakerBoardPositions.map((x) => x - pair.start)).forEach((len) => boardLengths.push(len)));
  } else {
    for (let x = minX + EFFECTIVE_COVERAGE / 2; x < maxX; x += EFFECTIVE_COVERAGE) scanlineIntersections(points, 'vertical', x).forEach((pair) => boardStockSegments(pair.length, breakerBoardPositions.map((y) => y - pair.start)).forEach((len) => boardLengths.push(len)));
  }
  const boardGroups = accumulateGroups(boardLengths);
  const borderGroups = inputs.borderSameBoard ? accumulateGroups(exposedSegments.map((segment) => segment.length)) : [];

  const rawCustomBeams = parseNumberArray(inputs.customBeamYs)
    .map((value) => clamp(value, 0, depth))
    .filter((value) => needsHouseSupportBeam ? value >= 0 && value <= depth : value > 0.2 && value < depth - 0.2);
  const beamCantilever = Math.max(0, Math.min(2, Number(inputs.beamCantilever ?? 2)));

  const insetFrontSegments = attachment === 'brick'
    ? segments
        .filter((segment) => segment.orientation === 'horizontal' && segment.start.y > minY + 0.2 && segment.start.y < maxY - 0.2)
        .filter((segment) => round2(segment.length) > 0.5 && round2(segment.length) < round2(width - 0.2))
        .map((segment) => {
          const verticalAtStart = segments.find((candidate) => candidate.orientation === 'vertical' && ((Math.abs(candidate.start.x - segment.start.x) < 0.01 && Math.abs(candidate.start.y - segment.start.y) < 0.01) || (Math.abs(candidate.end.x - segment.start.x) < 0.01 && Math.abs(candidate.end.y - segment.start.y) < 0.01)));
          const verticalAtEnd = segments.find((candidate) => candidate.orientation === 'vertical' && ((Math.abs(candidate.start.x - segment.end.x) < 0.01 && Math.abs(candidate.start.y - segment.end.y) < 0.01) || (Math.abs(candidate.end.x - segment.end.x) < 0.01 && Math.abs(candidate.end.y - segment.end.y) < 0.01)));
          const insetDepth = Math.min(verticalAtStart?.length ?? 0, verticalAtEnd?.length ?? 0);
          return { segment, insetDepth: round2(insetDepth), offsetFromHouse: round2(segment.start.y - minY) };
        })
        .filter((entry) => entry.insetDepth >= 2 || entry.segment.length <= 2)
    : [];
  const insetBeamOffsets = insetFrontSegments.map((entry) => entry.offsetFromHouse);
  const beamOffsets = uniqueSorted((rawCustomBeams.length > 0 ? uniqueSorted(rawCustomBeams) : (() => {
    if (depth <= beamCantilever) return needsHouseSupportBeam ? uniqueSorted([0, depth]) : [depth];
    const positions: number[] = [];
    const frontBeam = Math.max(0, round2(depth - beamCantilever));
    positions.push(frontBeam);
    while (positions[positions.length - 1] > BEAM_TARGET_SPACING + (needsHouseSupportBeam ? 0 : 0.01)) positions.push(round2(positions[positions.length - 1] - BEAM_TARGET_SPACING));
    if (needsHouseSupportBeam) positions.push(0);
    return uniqueSorted(positions);
  })()).filter((value) => !insetBeamOffsets.some((offset) => Math.abs(offset - value) < 0.01)).concat(insetBeamOffsets));

  const supportAnchors = uniqueSorted([minY, ...beamOffsets.map((value) => value + minY), maxY]);
  const supportSpans = supportAnchors.slice(1).map((value, index) => round2(value - supportAnchors[index]));
  const maxSpan = Math.max(...supportSpans, 0);
  const joistSize: DeckModel['joistSize'] = maxSpan <= JOIST_SPAN_LIMITS['2x8'] ? '2x8' : maxSpan <= JOIST_SPAN_LIMITS['2x10'] ? '2x10' : '2x12';

  const baseJoistAxisPositions = generateJoistPositions(joistDirection === 'vertical' ? minX : minY, joistDirection === 'vertical' ? maxX : maxY);
  const supportJoistPositions = [
    ...(pictureFrameCount > 0 ? (joistDirection === 'vertical' ? [minX + 2 / 12, maxX - 2 / 12] : [minY + 2 / 12, maxY - 2 / 12]) : []),
    ...breakerBoardPositions.flatMap((pos) => breakerBoardCount > 0 ? [pos - 2 / 12, pos + 2 / 12] : []),
  ].filter((value) => value > (joistDirection === 'vertical' ? minX : minY) + 0.05 && value < (joistDirection === 'vertical' ? maxX : maxY) - 0.05);
  const joistAxisPositions = uniqueSorted([...baseJoistAxisPositions, ...supportJoistPositions]);
  const joistLengthsRaw: number[] = [];
  if (joistDirection === 'vertical') {
    joistAxisPositions.forEach((x) => scanlineIntersections(points, 'vertical', x).forEach((pair) => joistLengthsRaw.push(pair.length)));
  } else {
    joistAxisPositions.forEach((y) => scanlineIntersections(points, 'horizontal', y).forEach((pair) => joistLengthsRaw.push(pair.length)));
  }
  const joistCount = Math.max(2, joistLengthsRaw.length);
  const joistLengthGroups = accumulateGroups(joistLengthsRaw);
  const joistStockLength = chooseStockLength(Math.min(Math.max(...joistLengthsRaw, maxSpan), JOIST_SPAN_LIMITS[joistSize]));
  const lockedPosts = parseLockedPosts(inputs.lockedPosts);
  const beamEdits = parseBeamEdits(inputs.beamEdits);

  const beamLines: BeamLine[] = beamOffsets.map((offsetY, beamIndex) => {
    const y = round2(offsetY + minY);
    const beamEdit = beamEdits.find((item) => item.beamIndex === beamIndex) ?? { beamIndex, startTrim: 0, endTrim: 0 };
    const insetEntry = insetFrontSegments.find((entry) => Math.abs(entry.offsetFromHouse - offsetY) < 0.01);
    const sourcePairs = insetEntry
      ? [{ start: insetEntry.segment.start.x, end: insetEntry.segment.end.x }]
      : scanlineIntersections(points, 'horizontal', y + 0.0001).map((pair) => ({ start: pair.start, end: pair.end }));
    const segmentsAtBeam = sourcePairs.map((pair, index, list) => {
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

  beamLines.sort((a, b) => a.y - b.y);
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
  const blockingRows = Math.max(0, pictureFrameCount) + Math.max(0, breakerBoardCount);
  const pictureFrameSupportSegments = exposedSegments.filter((segment) => (joistDirection === 'vertical' ? segment.orientation === 'vertical' : segment.orientation === 'horizontal')); // picture-frame boards running parallel with joists need 1 ft O.C. support blocking
  const pictureFrameBlockingLf = round2(pictureFrameSupportSegments.reduce((sum, segment) => sum + Math.max(0, Math.floor(segment.length)) * JOIST_SPACING, 0) * Math.max(0, pictureFrameCount));
  const breakerBlockingLf = round2(breakerBoardPositions.reduce((sum, pos) => sum + (boardRun === 'width'
    ? scanlineIntersections(points, 'vertical', pos).reduce((acc, pair) => acc + Math.max(0, Math.floor(pair.end - pair.start)) * JOIST_SPACING, 0)
    : scanlineIntersections(points, 'horizontal', pos).reduce((acc, pair) => acc + Math.max(0, Math.floor(pair.end - pair.start)) * JOIST_SPACING, 0)), 0) * Math.max(0, breakerBoardCount));
  const blockingLf = round2(pictureFrameBlockingLf + breakerBlockingLf);
  const blockingCount = Math.max(0, Math.round(blockingLf / JOIST_SPACING));
  const blockingBoardCount = Math.max(0, Math.ceil(blockingLf / 12));
  const joistTapeLf = round2(joistLengthsRaw.reduce((sum, length) => sum + length, 0) + doubleBandLf / 2);
  const joistHangers = joistCount * 2;
  const angledJoistHangers = segments.filter((segment) => segment.orientation === 'angled').reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / JOIST_SPACING)), 0);
  const rafterTies = joistCount * Math.max(1, beamLines.length);
  const postLength = chooseStockLength(Number(inputs.deckHeight ?? 8) + 2, [8, 10, 12, 16]);
  const concreteBags = postCount * 3;
  const postBases = postCount;
  const concreteAnchors = postCount;
  const additionalStairCount = parseAdditionalStairs(inputs.additionalStairs).length;
  const stairCountInput = Math.max(0, Number(inputs.stairCount ?? 0));
  const stairCount = Math.max(stairCountInput, stairCountInput > 0 ? 1 + additionalStairCount : additionalStairCount);
  const stairWidth = Number(inputs.stairWidth ?? 4);
  const stairRiseFt = Number(inputs.stairRise ?? 0) > 0 ? Number(inputs.stairRise ?? 0) : Number(inputs.deckHeight ?? 0);
  const stairRisers = stairCount > 0 && stairRiseFt > 0 ? Math.ceil((stairRiseFt * 12) / 7.5) : 0;
  const stairTreadsPerRun = stairRisers > 0 ? Math.max(stairRisers - 1, 1) : 0;
  const stairRunFt = round2(stairTreadsPerRun * (11 / 12));
  const isPressureTreatedDecking = String(inputs.deckingType ?? 'composite') === 'pressure-treated';
  const treadBoardPieces = stairCount * stairTreadsPerRun * 2;
  const riserBoardPieces = isPressureTreatedDecking ? stairCount * stairRisers * 2 : 0;
  // Stair deck boards are short repeated cuts, so count the purchasable stock
  // boards needed to make those cuts. Example: 4 ft stair treads from 8 ft
  // stock yields two tread boards per stock board. Pressure-treated stairs also
  // use deck boards on risers; composite/PVC stairs do not because risers are
  // covered by fascia.
  const stairTreadGroups = groupRepeatedCutsIntoStock(treadBoardPieces + riserBoardPieces, stairWidth, BOARD_STOCK_LENGTHS);
  // Stringers are laid out at 12 in. on center across each stair run,
  // including both outside stringers. A 4 ft wide stair therefore needs
  // 5 stringers per run, not one stringer per tread/riser. Count stock boards
  // by how many actual stringer cuts fit on the selected 2x12 stock length.
  const stairStringersPerRun = stairCount > 0 ? Math.max(2, Math.floor(stairWidth / 1) + 1) : 0;
  const stairStringers = stairStringersPerRun * stairCount;
  const stairStringerCutLength = stairStringers > 0 ? Math.max(4, Math.sqrt(stairRiseFt ** 2 + stairRunFt ** 2)) : 0;
  const stairStringerLength = chooseStockLength(stairStringerCutLength, [12, 16, 20]);
  const stairStringerBoardCount = stairStringers > 0 ? Math.ceil(stairStringers / Math.max(1, Math.floor((stairStringerLength + 1e-6) / stairStringerCutLength))) : 0;
  const stairRailingLeft = inputs.stairRailingLeft !== false && String(inputs.stairRailingLeft ?? 'true') !== 'false';
  const stairRailingRight = inputs.stairRailingRight !== false && String(inputs.stairRailingRight ?? 'true') !== 'false';
  const stairRailSideCount = stairCount > 0 ? Number(stairRailingLeft) + Number(stairRailingRight) : 0;
  const useFascia = String(inputs.deckingType ?? 'composite') !== 'pressure-treated';
  // Fascia covers only the exposed deck edges plus stair-specific cuts:
  // both stair stringer sides and each riser face. For a 12 x 16 attached
  // deck this is left + right + front (40 lf), then 2 stair sides and
  // one fascia board across each riser.
  const stairSideFascia = useFascia ? stairCount * stairRunFt * 2 : 0;
  const riserFascia = useFascia ? stairCount * stairRisers * stairWidth : 0;
  const fasciaLf = useFascia ? round2(exposedPerimeter + stairSideFascia + riserFascia) : 0;
  const fasciaPieces = useFascia ? Math.ceil(fasciaLf / 12) : 0;

  const stairEdgeIndexValue = Number(inputs.stairEdgeIndex ?? -1);
  const stairEdge = stairCount > 0 && stairEdgeIndexValue >= 0 && stairEdgeIndexValue < segments.length ? segments[stairEdgeIndexValue] : null;
  const stairOffset = stairEdge ? clamp(Number(inputs.stairOffset ?? 0), 0, Math.max(0, stairEdge.length - stairWidth)) : 0;
  const stairStart = stairEdge ? segmentPointAtOffset(stairEdge, stairOffset) : null;
  const stairEnd = stairEdge ? segmentPointAtOffset(stairEdge, stairOffset + Math.min(stairWidth, stairEdge.length)) : null;
  const stairPlacement: StairPlacement = { edgeIndex: stairEdge ? stairEdge.index : null, offset: stairOffset, width: stairWidth, landingProjection: stairRunFt, start: stairStart, end: stairEnd };
  const extraStairPlacements = parseAdditionalStairs(inputs.additionalStairs).map((item) => {
    const edge = segments[item.edgeIndex];
    if (!edge) return null;
    const width = Math.min(item.width, edge.length);
    const offset = clamp(item.offset, 0, Math.max(0, edge.length - width));
    return { edgeIndex: edge.index, offset, width, landingProjection: stairRunFt, start: segmentPointAtOffset(edge, offset), end: segmentPointAtOffset(edge, offset + width) } as StairPlacement;
  }).filter(Boolean) as StairPlacement[];
  const stairPlacements = [stairPlacement, ...extraStairPlacements].filter((item) => item.edgeIndex !== null && item.start && item.end) as StairPlacement[];

  const topRailSegments = stairPlacements.reduce((coverage, placement) => deriveTopRailSegments(coverage, placement), railCoverage);
  const topRailRun = round2(topRailSegments.reduce((sum, item) => sum + (item.end - item.start), 0));
  const stairRailRun = stairCount > 0 && stairRailSideCount > 0 ? round2(stairRunFt * stairRailSideCount) : 0;
  const railingRun = round2(Number(inputs.perimeterRailingFt ?? 0) || (topRailRun + stairRailRun));
  let railingSections6 = 0;
  let railingSections8 = 0;
  topRailSegments.forEach((segment) => {
    const length = segment.end - segment.start;
    let segmentBest = { six: 0, eight: 0, waste: Number.POSITIVE_INFINITY, pieces: Number.POSITIVE_INFINITY };
    for (let six = 0; six < 10; six += 1) {
      for (let eight = 0; eight < 10; eight += 1) {
        const covered = (six * 6) + (eight * 8);
        if (covered + 1e-6 < length) continue;
        const waste = covered - length;
        const pieces = six + eight;
        if (waste < segmentBest.waste - 1e-6 || (Math.abs(waste - segmentBest.waste) < 1e-6 && pieces < segmentBest.pieces) || (Math.abs(waste - segmentBest.waste) < 1e-6 && pieces == segmentBest.pieces && six > segmentBest.six)) {
          segmentBest = { six, eight, waste, pieces };
        }
      }
    }
    railingSections6 += segmentBest.six;
    railingSections8 += segmentBest.eight;
  });
  if (stairCount > 0 && stairRailSideCount > 0) {
    const stairBest = (() => {
      let best = { six: 0, eight: 0, waste: Number.POSITIVE_INFINITY, pieces: Number.POSITIVE_INFINITY };
      for (let six = 0; six < 10; six += 1) for (let eight = 0; eight < 10; eight += 1) {
        const covered = (six * 6) + (eight * 8);
        if (covered + 1e-6 < stairRunFt) continue;
        const waste = covered - stairRunFt; const pieces = six + eight;
        if (waste < best.waste - 1e-6 || (Math.abs(waste - best.waste) < 1e-6 && pieces < best.pieces) || (Math.abs(waste - best.waste) < 1e-6 && pieces == best.pieces && six > best.six)) best = { six, eight, waste, pieces };
      }
      return best;
    })();
    railingSections6 += stairBest.six * stairRailSideCount;
    railingSections8 += stairBest.eight * stairRailSideCount;
  }
  const railingType = String(inputs.railingType ?? 'aluminum');
  const railingPosts = railingType === 'aluminum' ? 0 : Math.max(0, topRailSegments.reduce((sum, item) => sum + Math.max(0, Math.ceil((item.end - item.start) / 8) - 1), 0) + topRailSegments.length * 2 + (stairCount > 0 && stairRailSideCount > 0 ? Math.max(stairRailSideCount * 2, Math.ceil(stairRunFt / 8) * stairRailSideCount + stairRailSideCount) : 0));
  const carriageBolts = postCount * 2 + (railingPosts > 0 ? railingPosts * 2 : 0);
  const lateralLoadBrackets = isFreestanding ? 0 : Math.max(2, Math.ceil(houseContactLength / 2));
  const sdsCorners = Math.max(4, segments.length) * 4;
  const deckFastenerCount = joistLengthsRaw.reduce((sum, length) => sum + Math.ceil(length / JOIST_SPACING) * 2, 0);
  const deckFastenerBoxes = String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? Math.ceil(deckFastenerCount / 365) : Math.ceil(deckFastenerCount / 1750);
  const fastenerType = String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? 'top screws' : 'hidden camo screws';

  return { points, area: round2(polygonArea(points)), perimeter: round2(polygonPerimeter(points)), width, depth, minX, minY, maxX, maxY, attachment, isFreestanding, boardRun, joistDirection, deckingDirection, boardGroups, borderGroups, exposedPerimeter, houseContactLength, joistSpacingFt: JOIST_SPACING, joistCount, joistPositions: joistAxisPositions, supportSpans, joistSize, joistStockLength, joistLengthGroups, beamLines, beamMemberSize, beamBoardGroups: beamBoardGroupsMerged, beamSegmentsCount, postCount, lockedPosts, beamEdits, postLength, doubleBandLf, doubleBandGroups: bandSegments, blockingRows, blockingCount, blockingLf, blockingBoardCount, pictureFrameCount, breakerBoardCount, breakerBoardPositions, requiredFieldBoardBreaks, joistTapeLf, joistHangers, angledJoistHangers, rafterTies, carriageBolts, lateralLoadBrackets, sdsCorners, deckFastenerCount, deckFastenerBoxes, fastenerType, concreteBags, postBases, concreteAnchors, fasciaLf, fasciaPieces, stairCount, stairRiseFt, stairRisers, stairTreadsPerRun, stairRunFt, stairTreadGroups, stairStringers, stairStringerBoardCount, stairStringerLength, stairStringerCutLength, stairRailingLeft, stairRailingRight, stairRailSideCount, railingRun, railingSections6, railingSections8, railingPosts, edgeSegments: segments, exposedSegments, railCoverage, manualRailingEdges: Array.from(new Set(railCoverage.map((item) => item.edgeIndex))).sort((a,b)=>a-b), stairPlacement, stairPlacements };
}
