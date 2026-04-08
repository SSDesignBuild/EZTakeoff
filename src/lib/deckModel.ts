import { DeckPoint } from './types';

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
}

export interface DeckSegment {
  start: DeckPoint;
  end: DeckPoint;
  length: number;
  orientation: 'horizontal' | 'vertical';
}

export interface BeamLine {
  y: number;
  segments: { startX: number; endX: number; length: number }[];
  postXs: number[];
}

export interface BoardGroup {
  length: number;
  count: number;
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
  exposedSegments: DeckSegment[];
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
const FRONT_CANTILEVER = 2;
const POST_TARGET_SPACING = 6;
const POST_MAX_SPACING = 7.5;
const JOIST_SPAN_LIMITS = {
  '2x8': 12,
  '2x10': 14,
  '2x12': 16,
} as const;
const BEAM_SPAN_LIMITS = {
  '2x10': 7,
  '2x12': 9,
  PSL: 13,
} as const;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function chooseStockLength(required: number, stock = STOCK_LENGTHS) {
  const found = stock.find((item) => item >= required - 1e-6);
  return found ?? stock[stock.length - 1];
}

export function parseDeckShape(raw: string | number | boolean | undefined): DeckPoint[] {
  if (typeof raw !== 'string') return DEFAULT_SHAPE;
  try {
    const parsed = JSON.parse(raw) as DeckPoint[];
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    }
  } catch {
    return DEFAULT_SHAPE;
  }
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
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function edgeSegments(points: DeckPoint[]): DeckSegment[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      start: point,
      end: next,
      length: Math.hypot(next.x - point.x, next.y - point.y),
      orientation: Math.abs(point.y - next.y) < 1e-6 ? 'horizontal' : 'vertical',
    };
  });
}

function scanlineIntersections(points: DeckPoint[], axis: 'horizontal' | 'vertical', position: number) {
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (axis === 'horizontal') {
      const y1 = current.y;
      const y2 = next.y;
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (position < minY || position >= maxY || Math.abs(y1 - y2) < 1e-9) continue;
      const t = (position - y1) / (y2 - y1);
      intersections.push(current.x + t * (next.x - current.x));
    } else {
      const x1 = current.x;
      const x2 = next.x;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      if (position < minX || position >= maxX || Math.abs(x1 - x2) < 1e-9) continue;
      const t = (position - x1) / (x2 - x1);
      intersections.push(current.y + t * (next.y - current.y));
    }
  }

  intersections.sort((a, b) => a - b);
  const pairs: { start: number; end: number; length: number }[] = [];
  for (let index = 0; index < intersections.length; index += 2) {
    const start = intersections[index];
    const end = intersections[index + 1];
    if (end !== undefined && end > start) {
      pairs.push({ start: round2(start), end: round2(end), length: round2(end - start) });
    }
  }
  return pairs;
}

function accumulateGroups(lengths: number[], stock = BOARD_STOCK_LENGTHS) {
  const grouped = new Map<number, number>();
  lengths.forEach((length) => {
    const chosen = chooseStockLength(length, stock);
    grouped.set(chosen, (grouped.get(chosen) ?? 0) + 1);
  });
  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([length, count]) => ({ length, count }));
}

function mergeGroups(...groups: BoardGroup[][]) {
  const map = new Map<number, number>();
  groups.flat().forEach((group) => {
    map.set(group.length, (map.get(group.length) ?? 0) + group.count);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([length, count]) => ({ length, count }));
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values.map((value) => round2(value)))).sort((a, b) => a - b);
}

export function buildDeckModel(inputs: DeckInputs): DeckModel {
  const points = parseDeckShape(inputs.deckShape);
  const { minX, minY, maxX, maxY } = getBounds(points);
  const width = round2(maxX - minX);
  const depth = round2(maxY - minY);
  const attachment = String(inputs.attachment ?? 'siding') as DeckModel['attachment'];
  const isFreestanding = attachment !== 'siding';
  const boardRun = String(inputs.boardRun ?? 'width') === 'projection' ? 'projection' : 'width';
  const joistDirection = boardRun === 'width' ? 'horizontal' : 'vertical';
  const deckingDirection = boardRun === 'width' ? 'vertical' : 'horizontal';
  const segments = edgeSegments(points);
  const houseSegments = !isFreestanding
    ? segments.filter((segment) => segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6)
    : [];
  const houseContactLength = round2(houseSegments.reduce((sum, segment) => sum + segment.length, 0));
  const exposedSegments = isFreestanding
    ? segments
    : segments.filter((segment) => !(segment.orientation === 'horizontal' && Math.abs(segment.start.y - minY) < 1e-6 && Math.abs(segment.end.y - minY) < 1e-6));
  const exposedPerimeter = round2(exposedSegments.reduce((sum, segment) => sum + segment.length, 0));

  const boardLengths: number[] = [];
  if (boardRun === 'width') {
    for (let y = minY + EFFECTIVE_COVERAGE / 2; y < maxY; y += EFFECTIVE_COVERAGE) {
      const pairs = scanlineIntersections(points, 'horizontal', y);
      pairs.forEach((pair) => boardLengths.push(pair.length));
    }
  } else {
    for (let x = minX + EFFECTIVE_COVERAGE / 2; x < maxX; x += EFFECTIVE_COVERAGE) {
      const pairs = scanlineIntersections(points, 'vertical', x);
      pairs.forEach((pair) => boardLengths.push(pair.length));
    }
  }
  const boardGroups = accumulateGroups(boardLengths);

  const borderGroups = inputs.borderSameBoard ? accumulateGroups(exposedSegments.map((segment) => segment.length)) : [];

  const beamYs = (() => {
    if (depth <= FRONT_CANTILEVER) return isFreestanding ? [0] : [depth];
    const positions: number[] = [];
    const frontBeam = Math.max(0, round2(depth - FRONT_CANTILEVER));
    positions.push(frontBeam);
    while (positions[positions.length - 1] > BEAM_TARGET_SPACING + (isFreestanding ? 0 : 0.01)) {
      positions.push(round2(positions[positions.length - 1] - BEAM_TARGET_SPACING));
    }
    if (isFreestanding) positions.push(0);
    return uniqueSorted(positions);
  })();

  const supportAnchors = uniqueSorted([isFreestanding ? 0 : minY, ...beamYs.map((value) => value + minY), maxY]);
  const supportSpans = supportAnchors.slice(1).map((value, index) => round2(value - supportAnchors[index]));
  const maxSpan = Math.max(...supportSpans, 0);
  const joistSize: DeckModel['joistSize'] = maxSpan <= JOIST_SPAN_LIMITS['2x8'] ? '2x8' : maxSpan <= JOIST_SPAN_LIMITS['2x10'] ? '2x10' : '2x12';
  const joistLengthGroupsRaw: number[] = [];
  if (joistDirection === 'vertical') {
    for (let x = minX + JOIST_SPACING / 2; x < maxX; x += JOIST_SPACING) {
      const pairs = scanlineIntersections(points, 'vertical', x);
      pairs.forEach((pair) => joistLengthGroupsRaw.push(pair.length));
    }
  } else {
    for (let y = minY + JOIST_SPACING / 2; y < maxY; y += JOIST_SPACING) {
      const pairs = scanlineIntersections(points, 'horizontal', y);
      pairs.forEach((pair) => joistLengthGroupsRaw.push(pair.length));
    }
  }
  const joistCount = Math.max(2, joistLengthGroupsRaw.length);
  const joistLengthGroups = accumulateGroups(joistLengthGroupsRaw);
  const joistStockLength = chooseStockLength(Math.min(Math.max(...joistLengthGroupsRaw, maxSpan), JOIST_SPAN_LIMITS[joistSize]));

  const beamLines: BeamLine[] = beamYs.map((offsetY) => {
    const y = offsetY + minY;
    const segmentsAtBeam = scanlineIntersections(points, 'horizontal', y + 0.0001).map((pair) => ({
      startX: pair.start,
      endX: pair.end,
      length: pair.length,
    }));

    const postXs: number[] = [];
    segmentsAtBeam.forEach((segment) => {
      const count = Math.max(2, Math.ceil(segment.length / POST_TARGET_SPACING) + 1);
      const spacing = segment.length / Math.max(1, count - 1);
      const adjustedCount = spacing > POST_MAX_SPACING ? count + 1 : count;
      for (let index = 0; index < adjustedCount; index += 1) {
        const x = round2(segment.startX + (segment.length * index) / Math.max(1, adjustedCount - 1));
        if (!postXs.some((value) => Math.abs(value - x) < 0.1)) postXs.push(x);
      }
    });

    return {
      y,
      segments: segmentsAtBeam,
      postXs: postXs.sort((a, b) => a - b),
    };
  });

  const postCount = beamLines.reduce((sum, line) => sum + line.postXs.length, 0);
  const maxBeamSpan = Math.max(0, ...beamLines.flatMap((line) => {
    if (line.postXs.length < 2) return [0];
    const spans: number[] = [];
    for (let index = 1; index < line.postXs.length; index += 1) {
      spans.push(round2(line.postXs[index] - line.postXs[index - 1]));
    }
    return spans;
  }));
  const beamMemberSize: DeckModel['beamMemberSize'] = maxBeamSpan <= BEAM_SPAN_LIMITS['2x10'] ? '2x10' : maxBeamSpan <= BEAM_SPAN_LIMITS['2x12'] ? '2x12' : 'PSL';
  const beamBoardGroups = beamLines.flatMap((line) => line.segments.flatMap((segment) => accumulateGroups([segment.length, segment.length])));
  const beamBoardGroupsMerged = mergeGroups(beamBoardGroups);
  const beamSegmentsCount = beamLines.reduce((sum, line) => sum + line.segments.length * 2, 0);

  const bandSegments = accumulateGroups([...segments.map((segment) => segment.length), ...segments.map((segment) => segment.length)]);
  const doubleBandLf = round2(polygonPerimeter(points) * 2);
  const blockingRows = 2;
  const blockingCount = joistCount * 2;
  const blockingBoardCount = Math.ceil((blockingCount * 1.5) / 8);
  const joistTapeLf = round2(joistLengthGroupsRaw.reduce((sum, length) => sum + length, 0) + doubleBandLf / 2);
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
  for (let run = 0; run < stairCount; run += 1) {
    for (let tread = 0; tread < stairTreadsPerRun; tread += 1) {
      treadLengths.push(stairWidth, stairWidth);
    }
  }
  const stairTreadGroups = accumulateGroups(treadLengths);
  const stairStringersPerRun = stairCount > 0 ? Math.max(2, Math.ceil(stairWidth / 1) + 1) : 0;
  const stairStringers = stairStringersPerRun * stairCount;
  const stairStringerLength = chooseStockLength(Math.max(12, Math.sqrt(stairRiseFt ** 2 + stairRunFt ** 2)), [12, 16, 20]);
  const stairSideFascia = stairCount * stairRunFt * 2;
  const riserFascia = stairCount * stairRisers * stairWidth;
  const fasciaLf = round2(exposedPerimeter + stairSideFascia + riserFascia);
  const fasciaPieces = Math.ceil(fasciaLf / 12);
  const railingRunInput = Number(inputs.perimeterRailingFt ?? 0);
  const railingRun = round2(railingRunInput || exposedPerimeter);
  const railingSections8 = Math.floor(railingRun / 8);
  const railingSections6 = railingRun - railingSections8 * 8 > 0 ? Math.ceil((railingRun - railingSections8 * 8) / 6) : 0;
  const railingType = String(inputs.railingType ?? 'aluminum');
  const railingPosts = railingType === 'aluminum' ? 0 : Math.max(2, Math.ceil(railingRun / 6) + 1);
  const carriageBolts = postCount * 2 + (railingPosts > 0 ? railingPosts * 2 : 0);
  const lateralLoadBrackets = isFreestanding ? 0 : Math.max(2, Math.ceil(houseContactLength / 2));
  const sdsCorners = 4;
  const screwCount = joistLengthGroupsRaw.reduce((sum, length) => sum + Math.ceil(length / JOIST_SPACING) * 2, 0);
  const deckFastenerCount = screwCount;
  const deckFastenerBoxes = String(inputs.deckingType ?? 'composite') === 'pressure-treated'
    ? Math.ceil(deckFastenerCount / 365)
    : Math.ceil(deckFastenerCount / 1750);
  const fastenerType = String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? 'top screws' : 'hidden camo screws';

  return {
    points,
    area: round2(polygonArea(points)),
    perimeter: round2(polygonPerimeter(points)),
    width,
    depth,
    minX,
    minY,
    maxX,
    maxY,
    attachment,
    isFreestanding,
    boardRun,
    joistDirection,
    deckingDirection,
    boardGroups,
    borderGroups,
    exposedPerimeter,
    houseContactLength,
    joistSpacingFt: JOIST_SPACING,
    joistCount,
    supportSpans,
    joistSize,
    joistStockLength,
    joistLengthGroups,
    beamLines,
    beamMemberSize,
    beamBoardGroups: beamBoardGroupsMerged,
    beamSegmentsCount,
    postCount,
    postLength,
    doubleBandLf,
    doubleBandGroups: bandSegments,
    blockingRows,
    blockingCount,
    blockingBoardCount,
    joistTapeLf,
    joistHangers,
    rafterTies,
    carriageBolts,
    lateralLoadBrackets,
    sdsCorners,
    deckFastenerCount,
    deckFastenerBoxes,
    fastenerType,
    concreteBags,
    postBases,
    concreteAnchors,
    fasciaLf,
    fasciaPieces,
    stairRiseFt,
    stairRisers,
    stairTreadsPerRun,
    stairRunFt,
    stairTreadGroups,
    stairStringers,
    stairStringerLength,
    railingRun,
    railingSections6,
    railingSections8,
    railingPosts,
    exposedSegments,
  };
}
