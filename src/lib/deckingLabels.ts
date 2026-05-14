import { DeckModel } from './deckModel';

const DECK_BOARD_FACE = 5.5 / 12;
const DECK_GAP = 0.125 / 12;
const EFFECTIVE_COVERAGE = DECK_BOARD_FACE + DECK_GAP;

export interface DeckingLabelGroup {
  kind: 'field' | 'picture-frame' | 'breaker';
  course: number;
  cutLength: number;
  count: number;
  label: string;
}

export interface DeckingLabelPlan {
  groups: DeckingLabelGroup[];
  fieldLabels: Record<string, string>;
  pictureFrameLabels: Record<string, string>;
  breakerLabels: Record<string, string>;
}

const roundLen = (value: number) => Math.round(value * 12) / 12;
const keyOf = (kind: DeckingLabelGroup['kind'], course: number, length: number) => `${kind}:${course}:${roundLen(length).toFixed(2)}`;

const alphaLabel = (index: number) => {
  let n = Math.max(0, Math.floor(index));
  let out = '';
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

function scanlineIntersections(points: { x: number; y: number }[], axis: 'horizontal' | 'vertical', position: number) {
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (axis === 'horizontal') {
      const min = Math.min(current.y, next.y);
      const max = Math.max(current.y, next.y);
      if (position < min || position >= max || Math.abs(current.y - next.y) < 1e-9) continue;
      const t = (position - current.y) / (next.y - current.y);
      intersections.push(current.x + t * (next.x - current.x));
    } else {
      const min = Math.min(current.x, next.x);
      const max = Math.max(current.x, next.x);
      if (position < min || position >= max || Math.abs(current.x - next.x) < 1e-9) continue;
      const t = (position - current.x) / (next.x - current.x);
      intersections.push(current.y + t * (next.y - current.y));
    }
  }
  intersections.sort((a, b) => a - b);
  const pairs: { start: number; end: number }[] = [];
  for (let index = 0; index < intersections.length; index += 2) {
    const start = intersections[index];
    const end = intersections[index + 1];
    if (end !== undefined && end > start) pairs.push({ start, end });
  }
  return pairs;
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
  return segments.map((length) => roundLen(length));
}

function groupedLengths(lengths: number[]) {
  const counts = new Map<number, number>();
  lengths.forEach((length) => {
    const rounded = roundLen(length);
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([cutLength, count]) => ({ cutLength, count }));
}

export function deriveDeckingLabelPlan(deck: DeckModel): DeckingLabelPlan {
  let cursor = 0;
  const groups: DeckingLabelGroup[] = [];
  const fieldLabels: Record<string, string> = {};
  const pictureFrameLabels: Record<string, string> = {};
  const breakerLabels: Record<string, string> = {};

  const fieldLengths: number[] = [];
  if (deck.boardRun === 'width') {
    for (let y = deck.minY + EFFECTIVE_COVERAGE / 2; y < deck.maxY; y += EFFECTIVE_COVERAGE) {
      scanlineIntersections(deck.points, 'horizontal', y).forEach((pair) => {
        const splits = deck.breakerBoardPositions.map((x) => x - pair.start);
        boardStockSegments(pair.end - pair.start, splits).forEach((length) => fieldLengths.push(length));
      });
    }
  } else {
    for (let x = deck.minX + EFFECTIVE_COVERAGE / 2; x < deck.maxX; x += EFFECTIVE_COVERAGE) {
      scanlineIntersections(deck.points, 'vertical', x).forEach((pair) => {
        const splits = deck.breakerBoardPositions.map((y) => y - pair.start);
        boardStockSegments(pair.end - pair.start, splits).forEach((length) => fieldLengths.push(length));
      });
    }
  }

  groupedLengths(fieldLengths).forEach(({ cutLength, count }) => {
    const label = alphaLabel(cursor++);
    fieldLabels[keyOf('field', 0, cutLength)] = label;
    groups.push({ kind: 'field', course: 0, cutLength, count, label });
  });

  const pictureLengths = groupedLengths(deck.exposedSegments.map((segment) => segment.length));
  for (let course = 0; course < deck.pictureFrameCount; course += 1) {
    pictureLengths.forEach(({ cutLength, count }) => {
      const label = alphaLabel(cursor++);
      pictureFrameLabels[keyOf('picture-frame', course, cutLength)] = label;
      groups.push({ kind: 'picture-frame', course, cutLength, count, label });
    });
  }

  const breakerLengths: number[] = [];
  deck.breakerBoardPositions.forEach((position) => {
    if (deck.boardRun === 'width') scanlineIntersections(deck.points, 'vertical', position).forEach((pair) => breakerLengths.push(roundLen(pair.end - pair.start)));
    else scanlineIntersections(deck.points, 'horizontal', position).forEach((pair) => breakerLengths.push(roundLen(pair.end - pair.start)));
  });
  const breakerGroups = groupedLengths(breakerLengths);
  for (let course = 0; course < deck.breakerBoardCount; course += 1) {
    breakerGroups.forEach(({ cutLength, count }) => {
      const label = alphaLabel(cursor++);
      breakerLabels[keyOf('breaker', course, cutLength)] = label;
      groups.push({ kind: 'breaker', course, cutLength, count, label });
    });
  }

  return { groups, fieldLabels, pictureFrameLabels, breakerLabels };
}

export function deckingLabelForLength(plan: DeckingLabelPlan, kind: DeckingLabelGroup['kind'], course: number, length: number) {
  const key = keyOf(kind, course, length);
  if (kind === 'field') return plan.fieldLabels[key] ?? '';
  if (kind === 'picture-frame') return plan.pictureFrameLabels[key] ?? '';
  return plan.breakerLabels[key] ?? '';
}
