export interface PatioPanelPiece {
  widthIn: number;
  widthFt: number;
  kind: 'regular' | 'fan-beam' | 'cut';
  note?: string;
}

export interface PatioPanelLayout {
  pieces: PatioPanelPiece[];
  regular4: number;
  regular2: number;
  cut2Equivalent: number;
  fanBeamPanels: number;
  notes: string[];
}

type HalfLayout = { regular4: number; regular2: number; cutIn: number; pieces: number };
type CenteredLayout = { centerIn: number; half: HalfLayout };

const round2 = (value: number) => Math.round(value * 100) / 100;
const inchesFromFeet = (feet: number) => Math.round(feet * 12);

function findHalfLayout(targetIn: number): HalfLayout | null {
  let best: HalfLayout | null = null;
  for (let regular4 = 0; regular4 <= Math.ceil(targetIn / 48) + 2; regular4 += 1) {
    for (let regular2 = 0; regular2 <= Math.ceil(targetIn / 24) + 2; regular2 += 1) {
      const used = regular4 * 48 + regular2 * 24;
      if (used > targetIn) continue;
      const cutIn = targetIn - used;
      if (cutIn > 24) continue;
      const pieces = regular4 + regular2 + (cutIn > 0 ? 1 : 0);
      if (!best || (cutIn > 0 ? 1 : 0) < (best.cutIn > 0 ? 1 : 0) || ((cutIn > 0 ? 1 : 0) === (best.cutIn > 0 ? 1 : 0) && pieces < best.pieces) || ((cutIn > 0 ? 1 : 0) === (best.cutIn > 0 ? 1 : 0) && pieces === best.pieces && regular4 > best.regular4)) {
        best = { regular4, regular2, cutIn, pieces };
      }
    }
  }
  return best;
}

function standardFill(totalIn: number, preferredPanelIn: 24 | 48): PatioPanelLayout {
  const pieces: PatioPanelPiece[] = [];
  const notes: string[] = [];
  let remaining = totalIn;
  let regular4 = 0;
  let regular2 = 0;
  while (remaining > 0) {
    if (preferredPanelIn === 48 && remaining >= 48) {
      pieces.push({ widthIn: 48, widthFt: 4, kind: 'regular' });
      remaining -= 48;
      regular4 += 1;
      continue;
    }
    if (remaining >= 24) {
      pieces.push({ widthIn: 24, widthFt: 2, kind: 'regular' });
      remaining -= 24;
      regular2 += 1;
      continue;
    }
    pieces.push({ widthIn: remaining, widthFt: round2(remaining / 12), kind: 'cut', note: 'Cut from 2 ft panel' });
    notes.push('One outer panel is cut to fit the exact overall width.');
    remaining = 0;
  }
  return { pieces, regular4, regular2, cut2Equivalent: pieces.some((piece) => piece.kind === 'cut') ? 1 : 0, fanBeamPanels: 0, notes };
}

function buildCenteredLayout(totalIn: number): PatioPanelLayout | null {
  let best: CenteredLayout | null = null;
  for (const centerIn of [48, 24]) {
    if (centerIn > totalIn) continue;
    const remainingHalf = (totalIn - centerIn) / 2;
    if (remainingHalf < 0 || Math.abs(remainingHalf - Math.round(remainingHalf)) > 1e-6) continue;
    const half = findHalfLayout(Math.round(remainingHalf));
    if (!half) continue;
    if (!best || (half.cutIn > 0 ? 1 : 0) < (best.half.cutIn > 0 ? 1 : 0) || ((half.cutIn > 0 ? 1 : 0) === (best.half.cutIn > 0 ? 1 : 0) && half.pieces < best.half.pieces) || ((half.cutIn > 0 ? 1 : 0) === (best.half.cutIn > 0 ? 1 : 0) && half.pieces === best.half.pieces && centerIn > best.centerIn)) {
      best = { centerIn, half };
    }
  }
  if (!best) return null;

  const left: PatioPanelPiece[] = [];
  for (let index = 0; index < best.half.regular4; index += 1) left.push({ widthIn: 48, widthFt: 4, kind: 'regular' });
  for (let index = 0; index < best.half.regular2; index += 1) left.push({ widthIn: 24, widthFt: 2, kind: 'regular' });
  if (best.half.cutIn > 0) left.push({ widthIn: best.half.cutIn, widthFt: round2(best.half.cutIn / 12), kind: 'cut', note: 'Cut from 2 ft panel' });
  left.sort((a, b) => a.widthIn - b.widthIn);

  const pieces: PatioPanelPiece[] = [
    ...left,
    { widthIn: best.centerIn, widthFt: round2(best.centerIn / 12), kind: 'fan-beam', note: 'Centered fan beam panel' },
    ...[...left].reverse(),
  ];

  const notes = [best.centerIn === 48 ? 'Centered fan beam uses a 4 ft fan-beam panel.' : 'Centered fan beam uses a 2 ft fan-beam panel.'];
  if (best.half.cutIn > 0) notes.push(`The outside panel is cut to ${round2(best.half.cutIn / 12)} ft on both ends to keep the layout symmetrical.`);

  return {
    pieces,
    regular4: best.half.regular4 * 2,
    regular2: best.half.regular2 * 2,
    cut2Equivalent: best.half.cutIn > 0 ? 2 : 0,
    fanBeamPanels: 1,
    notes,
  };
}

export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  const preferredPanelIn: 24 | 48 = preferredPanelFt === 4 ? 48 : 24;

  if (fanBeam === 'centered') {
    const centered = buildCenteredLayout(totalIn);
    if (centered) return centered;
    const fallback = standardFill(totalIn, preferredPanelIn);
    fallback.notes.push('Centered fan beam could not be made perfectly symmetrical from the current width, so the layout falls back to the closest stock fill.');
    if (fallback.pieces.length > 0) {
      const centerIndex = Math.floor(fallback.pieces.length / 2);
      fallback.pieces[centerIndex] = { ...fallback.pieces[centerIndex], kind: 'fan-beam' };
      fallback.fanBeamPanels = 1;
    }
    return fallback;
  }

  const base = standardFill(totalIn, preferredPanelIn);
  if (fanBeam === 'female-offset' || fanBeam === 'male-offset') {
    base.notes.push(`Fan beam lands ${fanBeam === 'female-offset' ? '1 ft from the female side' : '1 ft from the male side'}; verify actual factory panel orientation on the final order.`);
    if (base.pieces.length > 0) {
      const anchorIndex = fanBeam === 'female-offset' ? 0 : base.pieces.length - 1;
      base.pieces[anchorIndex] = { ...base.pieces[anchorIndex], kind: 'fan-beam' };
      base.fanBeamPanels = 1;
    }
  }
  return base;
}
