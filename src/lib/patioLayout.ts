export interface PatioPanelPiece {
  widthIn: number;
  widthFt: number;
  kind: 'regular' | 'fan-beam' | 'cut';
  panelWidth: 2 | 4;
  note?: string;
  positionIn: number;
  fanPlacement?: 'centered' | 'female-offset' | 'male-offset';
}

export interface PatioPanelLayout {
  pieces: PatioPanelPiece[];
  regular4: number;
  regular2: number;
  cut2Equivalent: number;
  fanBeamPanels: number;
  notes: string[];
  fanOptions: { pieceIndex: number; placement: 'centered' | 'female-offset' | 'male-offset'; label: string; centerIn: number }[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const inchesFromFeet = (feet: number) => Math.round(feet * 12);
const widthFootage = (widthIn: number) => round2(widthIn / 12);

function summarize(pieces: PatioPanelPiece[], notes: string[], fanOptions: PatioPanelLayout['fanOptions']): PatioPanelLayout {
  return {
    pieces,
    regular4: pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 4).length,
    regular2: pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 2).length,
    cut2Equivalent: pieces.filter((piece) => piece.kind === 'cut').length,
    fanBeamPanels: pieces.filter((piece) => piece.kind === 'fan-beam').length,
    notes,
    fanOptions,
  };
}

function expandWidths(widths: number[]) {
  let position = 0;
  return widths.map((width) => {
    const piece: PatioPanelPiece = {
      widthIn: width,
      widthFt: widthFootage(width),
      panelWidth: width <= 24 ? 2 : 4,
      kind: width === 24 || width === 48 ? 'regular' : 'cut',
      note: width === 24 || width === 48 ? undefined : 'closure piece',
      positionIn: position,
    };
    position += width;
    return piece;
  });
}

function buildWidthCombos(totalIn: number) {
  const combos: number[][] = [];
  const maxFours = Math.ceil(totalIn / 48) + 2;
  const maxTwos = Math.ceil(totalIn / 24) + 2;
  for (let leftCut = 0; leftCut <= 24; leftCut += 6) {
    for (let rightCut = 0; rightCut <= 24; rightCut += 6) {
      for (let fourCount = 0; fourCount <= maxFours; fourCount += 1) {
        for (let twoCount = 0; twoCount <= maxTwos; twoCount += 1) {
          const total = leftCut + rightCut + (fourCount * 48) + (twoCount * 24);
          if (total !== totalIn) continue;
          const widths = [leftCut, ...Array(fourCount).fill(48), ...Array(twoCount).fill(24), rightCut].filter(Boolean) as number[];
          if (widths.length) combos.push(widths);
        }
      }
    }
  }
  return combos.length ? combos : [[totalIn]];
}


function preferredSymmetricSideWidths(sideIn: number) {
  const widths: number[] = [];
  let remaining = sideIn;
  const remainder = remaining % 48;
  if (remainder > 0) {
    widths.push(remainder);
    remaining -= remainder;
  }
  while (remaining >= 48) {
    widths.push(48);
    remaining -= 48;
  }
  return widths.filter(Boolean);
}

function buildCenteredSingleFanLayout(totalIn: number) {
  const candidates: number[][] = [];
  for (const center of [48, 24]) {
    const remain = totalIn - center;
    if (remain < 0 || remain % 2 !== 0) continue;
    const side = remain / 2;
    const sideWidths = preferredSymmetricSideWidths(side);
    if (sideWidths.some((item) => item > 48 || item <= 0)) continue;
    candidates.push([...sideWidths, center, ...[...sideWidths].reverse()]);
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const aCuts = a.filter((item) => item !== 24 && item !== 48).length;
    const bCuts = b.filter((item) => item !== 24 && item !== 48).length;
    if (aCuts !== bCuts) return aCuts - bCuts;
    const aFours = a.filter((item) => item === 48).length;
    const bFours = b.filter((item) => item === 48).length;
    return bFours - aFours;
  })[0];
}

function fanSlots(pieces: PatioPanelPiece[]) {
  return pieces.flatMap((piece, pieceIndex) => {
    const base = piece.positionIn;
    const width = piece.widthIn;
    const slots: PatioPanelLayout['fanOptions'] = [];
    if (width >= 24) {
      slots.push({ pieceIndex, placement: 'centered', label: `Panel ${pieceIndex + 1} centered`, centerIn: base + width / 2 });
    }
    if (width === 48) {
      slots.push({ pieceIndex, placement: 'female-offset', label: `Panel ${pieceIndex + 1} 1' from female`, centerIn: base + 12 });
      slots.push({ pieceIndex, placement: 'male-offset', label: `Panel ${pieceIndex + 1} 1' from male`, centerIn: base + width - 12 });
    }
    return slots;
  });
}

function targetCenters(totalIn: number, count: number, placementMode: string) {
  if (count <= 1) return [totalIn / 2];
  if (placementMode === 'cluster-center') {
    const gap = Math.min(48, totalIn / (count + 1));
    const start = totalIn / 2 - (gap * (count - 1)) / 2;
    return Array.from({ length: count }, (_, index) => start + index * gap);
  }
  if (placementMode === 'female-bias') {
    const start = totalIn * 0.22;
    const end = totalIn * 0.55;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  if (placementMode === 'male-bias') {
    const start = totalIn * 0.45;
    const end = totalIn * 0.78;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  return Array.from({ length: count }, (_, index) => totalIn * ((index + 1) / (count + 1)));
}

function chooseFanOptions(pieces: PatioPanelPiece[], fanCount: number, placementMode: string, shift = 0, fanMode: string = 'centered') {
  const slots = fanSlots(pieces);
  const eligible = slots.filter((slot) => fanMode === 'centered' ? slot.placement === 'centered' : fanMode === 'female-offset' ? slot.placement === 'female-offset' || (slot.placement === 'centered' && pieces[slot.pieceIndex]?.panelWidth === 2) : fanMode === 'male-offset' ? slot.placement === 'male-offset' || (slot.placement === 'centered' && pieces[slot.pieceIndex]?.panelWidth === 2) : true);
  if (fanCount <= 0 || !eligible.length) return { picks: [] as PatioPanelLayout['fanOptions'], slots: eligible.length ? eligible : slots };
  const target = targetCenters(pieces.reduce((sum, piece) => sum + piece.widthIn, 0), Math.min(fanCount, slots.length), placementMode);
  const picks: PatioPanelLayout['fanOptions'] = [];
  target.forEach((center) => {
    const sorted = [...eligible].sort((a, b) => Math.abs(a.centerIn - center) - Math.abs(b.centerIn - center) || a.centerIn - b.centerIn);
    const found = sorted.find((slot) => !picks.some((pick) => pick.pieceIndex === slot.pieceIndex && pick.placement === slot.placement));
    if (found) picks.push(found);
  });
  if (!picks.length) return { picks, slots };
  const rotated = picks.map((pick) => {
    const currentIndex = slots.findIndex((slot) => slot.pieceIndex === pick.pieceIndex && slot.placement === pick.placement);
    const nextIndex = (currentIndex + shift + eligible.length * 4) % eligible.length;
    return eligible[nextIndex];
  });
  const deduped: PatioPanelLayout['fanOptions'] = [];
  rotated.forEach((slot) => {
    if (!deduped.some((item) => item.pieceIndex === slot.pieceIndex && item.placement === slot.placement)) deduped.push(slot);
  });
  return { picks: deduped.slice(0, fanCount), slots: eligible };
}


function comboScore(pieces: PatioPanelPiece[], preferredPanelFt: number, fanCount: number, placementMode: string, fanMode: string) {
  const cuts = pieces.filter((piece) => piece.kind === 'cut');
  const edgeLeft = pieces[0]?.widthIn ?? 0;
  const edgeRight = pieces[pieces.length - 1]?.widthIn ?? 0;
  const symmetryPenalty = Math.abs(edgeLeft - edgeRight);
  const regular4 = pieces.filter((piece) => piece.panelWidth === 4 && piece.kind !== 'cut').length;
  const regular2 = pieces.filter((piece) => piece.panelWidth === 2 && piece.kind !== 'cut').length;
  const preferencePenalty = preferredPanelFt === 4
    ? (regular2 * 220) + (pieces.length * 14) - (regular4 * 70)
    : (regular4 * 28) - (regular2 * 14);
  const interiorCutPenalty = pieces.slice(1, -1).filter((piece) => piece.kind === 'cut').length * 250;
  const cutPenalty = cuts.length * 30 + cuts.reduce((sum, piece) => sum + Math.abs(24 - piece.widthIn), 0) * 0.9;
  const fanEval = chooseFanOptions(pieces, fanCount, placementMode, 0, fanMode);
  const totalIn = pieces.reduce((sum, piece) => sum + piece.widthIn, 0);
  const centerPenalty = fanEval.picks.length
    ? fanEval.picks.reduce((sum, pick) => sum + Math.abs(pick.centerIn - totalIn / 2), 0)
    : 1000;
  const centeredExactBonus = fanMode === 'centered' && fanEval.picks.some((pick) => Math.abs(pick.centerIn - totalIn / 2) < 0.01) ? -480 : 0;
  const fanPenalty = fanEval.picks.length < fanCount ? 2000 : 0;
  const mirrorBonus = cuts.length === 2 && Math.abs(edgeLeft - edgeRight) < 0.01 ? -64 : 0;
  return preferencePenalty + interiorCutPenalty + cutPenalty + symmetryPenalty * 2.2 + pieces.length + fanPenalty + centerPenalty * (fanMode === 'centered' ? 1.6 : 0.18) + mirrorBonus + centeredExactBonus;
}


export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number, fanBeamCount = 1, placementMode = 'spread', fanShift = 0): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  const combos = buildWidthCombos(totalIn);
  let bestPieces = expandWidths(combos[0]);
  let bestScore = Number.POSITIVE_INFINITY;
  const targetFanCount = fanBeam === 'none' ? 0 : Math.max(1, fanBeamCount);
  const specialCentered = fanBeam === 'centered' && targetFanCount === 1 ? buildCenteredSingleFanLayout(totalIn) : null;
  if (specialCentered) {
    bestPieces = expandWidths(specialCentered);
    bestScore = comboScore(bestPieces, preferredPanelFt, targetFanCount, placementMode, fanBeam) - 2200;
  }
  for (const combo of combos) {
    const pieces = expandWidths(combo);
    let score = comboScore(pieces, preferredPanelFt, targetFanCount, placementMode, fanBeam);
    if (fanBeam === 'centered' && targetFanCount === 1) {
      const center = totalIn / 2;
      const exactCentered = fanSlots(pieces).some((slot) => slot.placement === 'centered' && Math.abs(slot.centerIn - center) < 0.01);
      if (exactCentered) score -= 1400;
      const usesFours = pieces.filter((piece) => piece.panelWidth === 4 && piece.kind !== 'cut').length;
      score -= usesFours * 60;
    }
    if (score < bestScore) {
      bestScore = score;
      bestPieces = pieces;
    }
  }
  const pieces = bestPieces.map((piece) => ({ ...piece }));
  const fanEval = chooseFanOptions(pieces, targetFanCount, placementMode, fanShift, fanBeam);
  fanEval.picks.forEach((pick) => {
    const piece = pieces[pick.pieceIndex];
    pieces[pick.pieceIndex] = {
      ...piece,
      kind: 'fan-beam',
      note: pick.label,
      fanPlacement: pick.placement,
    };
  });
  const notes: string[] = [];
  const cuts = pieces.filter((piece) => piece.kind === 'cut');
  if (cuts.length) notes.push(`Closure pieces: ${cuts.map((piece) => `${piece.widthFt} ft`).join(', ')}.`);
  if (fanBeam === 'none') notes.push('No fan beam selected.');
  else {
    notes.push(`${fanEval.picks.length} fan-beam panel(s) placed.`);
    if (fanEval.picks.length) notes.push(fanEval.picks.map((slot) => slot.label).join(' · '));
  }
  const left = pieces[0];
  const right = pieces[pieces.length - 1];
  if (left && right && left.kind === 'cut' && right.kind === 'cut' && Math.abs(left.widthIn - right.widthIn) < 0.01) {
    notes.push(`Symmetric end cuts: ${left.widthFt} ft left and right.`);
  }
  return summarize(pieces, notes, fanEval.slots);
}
