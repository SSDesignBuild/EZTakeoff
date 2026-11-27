import type { DeckModel } from './deckModel';
import { planPhysicalDeckBoards } from './deckPhysicalFinish';
import { surfaceStrips } from './deckSurfaceLayout';

export const PICTURE_FRAME_OVERHANG_ALLOWANCE_FT = 2 / 12;

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

// Cut schedules must not round a 19ft11.5in piece UP to an impossible
// 20ft full-length cut. Round UP to 1/16in for safe installer length.
const roundLen = (value:number) =>
  Math.min(20-(0.125+0.25)/12-.01,Math.ceil((value-1e-9)*192)/192);
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

  // The exact installed field layout includes narrow perimeter rips and
  // excludes real picture-frame/breaker footprints. Use it for purchasing
  // as well as 3D so an enclosure never needs an extra floor patch board.
  const fieldLengths = surfaceStrips(deck).map(piece=>piece.lengthFt);

  groupedLengths(fieldLengths).forEach(({ cutLength, count }) => {
    const label = alphaLabel(cursor++);
    fieldLabels[keyOf('field', 0, cutLength)] = label;
    groups.push({ kind: 'field', course: 0, cutLength, count, label });
  });

  const physical=planPhysicalDeckBoards(deck);
  for (let course = 0; course < deck.pictureFrameCount; course += 1) {
    groupedLengths(physical.filter(board=>board.kind==='picture-frame'&&board.course===course).map(board=>board.lengthFt)).forEach(({cutLength,count})=>{
      const label=alphaLabel(cursor++);pictureFrameLabels[keyOf('picture-frame',course,cutLength)]=label;
      groups.push({kind:'picture-frame',course,cutLength,count,label});
    });
  }
  for (let course = 0; course < deck.breakerBoardCount; course += 1) {
    groupedLengths(physical.filter(board=>board.kind==='breaker'&&board.course===course).map(board=>board.lengthFt)).forEach(({cutLength,count})=>{
      const label=alphaLabel(cursor++);breakerLabels[keyOf('breaker',course,cutLength)]=label;
      groups.push({kind:'breaker',course,cutLength,count,label});
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
