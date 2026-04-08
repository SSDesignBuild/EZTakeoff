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
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const inchesFromFeet = (feet: number) => Math.round(feet * 12);
const widthFootage = (widthIn: number) => round2(widthIn / 12);

function summarize(pieces: PatioPanelPiece[], notes: string[]): PatioPanelLayout {
  return {
    pieces,
    regular4: pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 4).length,
    regular2: pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 2).length,
    cut2Equivalent: pieces.filter((piece) => piece.kind === 'cut').length,
    fanBeamPanels: pieces.filter((piece) => piece.kind === 'fan-beam').length,
    notes,
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

function supportsFanPlacement(piece: PatioPanelPiece, placement: string) {
  if (placement === 'none') return false;
  if (placement === 'centered') return piece.widthIn >= 24;
  return piece.widthIn === 48;
}

function targetCenters(totalIn: number, count: number, placementMode: string) {
  if (count <= 1) {
    if (placementMode === 'female-bias') return [totalIn * 0.3];
    if (placementMode === 'male-bias') return [totalIn * 0.7];
    return [totalIn / 2];
  }
  if (placementMode === 'cluster-center') {
    const gap = Math.min(48, totalIn / (count + 1));
    const start = totalIn / 2 - (gap * (count - 1)) / 2;
    return Array.from({ length: count }, (_, index) => start + index * gap);
  }
  if (placementMode === 'inner-pair') {
    const start = totalIn * 0.38;
    const end = totalIn * 0.62;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  if (placementMode === 'outer-pair') {
    const start = totalIn * 0.22;
    const end = totalIn * 0.78;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  if (placementMode === 'female-bias') {
    const start = totalIn * 0.2;
    const end = totalIn * 0.55;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  if (placementMode === 'male-bias') {
    const start = totalIn * 0.45;
    const end = totalIn * 0.8;
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(1, count - 1));
  }
  return Array.from({ length: count }, (_, index) => totalIn * ((index + 1) / (count + 1)));
}

function chooseFanIndices(pieces: PatioPanelPiece[], count: number, placement: string, placementMode: string) {
  const eligible = pieces.map((piece, index) => ({ piece, index, center: piece.positionIn + piece.widthIn / 2 })).filter(({ piece }) => supportsFanPlacement(piece, placement));
  if (!eligible.length || count <= 0) return [] as number[];
  const targets = targetCenters(pieces.reduce((sum, piece) => sum + piece.widthIn, 0), Math.min(count, eligible.length), placementMode);
  const picks: number[] = [];
  targets.forEach((target) => {
    const sorted = [...eligible].sort((a, b) => Math.abs(a.center - target) - Math.abs(b.center - target) || a.center - b.center);
    const match = sorted.find((item) => !picks.includes(item.index));
    if (match) picks.push(match.index);
  });
  return picks.sort((a, b) => a - b);
}

function comboScore(pieces: PatioPanelPiece[], preferredPanelFt: number, fanPlacement: string, fanCount: number, placementMode: string) {
  const cuts = pieces.filter((piece) => piece.kind === 'cut');
  const edgeLeft = pieces[0]?.widthIn ?? 0;
  const edgeRight = pieces[pieces.length - 1]?.widthIn ?? 0;
  const symmetryPenalty = Math.abs(edgeLeft - edgeRight);
  const preferencePenalty = preferredPanelFt === 4 ? pieces.filter((piece) => piece.panelWidth === 2 && piece.kind !== 'cut').length * 8 : pieces.filter((piece) => piece.panelWidth === 4 && piece.kind !== 'cut').length * 4;
  const interiorCutPenalty = pieces.slice(1, -1).filter((piece) => piece.kind === 'cut').length * 200;
  const cutPenalty = cuts.length * 22 + cuts.reduce((sum, piece) => sum + Math.abs(24 - piece.widthIn), 0) * 0.8;
  const fanIndices = chooseFanIndices(pieces, fanPlacement === 'none' ? 0 : Math.max(1, fanCount), fanPlacement, placementMode);
  const fanPenalty = fanPlacement === 'none' ? 0 : (fanIndices.length < Math.max(1, fanCount) ? 2000 : 0);
  const mirrorBonus = cuts.length === 2 && Math.abs(edgeLeft - edgeRight) < 0.01 ? -10 : 0;
  return preferencePenalty + interiorCutPenalty + cutPenalty + symmetryPenalty * 1.8 + pieces.length + fanPenalty + mirrorBonus;
}

export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number, fanBeamCount = 1, placementMode = 'spread'): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  const combos = buildWidthCombos(totalIn);
  let bestPieces = expandWidths(combos[0]);
  let bestScore = Number.POSITIVE_INFINITY;
  for (const combo of combos) {
    const pieces = expandWidths(combo);
    const score = comboScore(pieces, preferredPanelFt, fanBeam, fanBeamCount, placementMode);
    if (score < bestScore) {
      bestScore = score;
      bestPieces = pieces;
    }
  }
  const pieces = bestPieces.map((piece) => ({ ...piece }));
  const fanIndices = chooseFanIndices(pieces, fanBeam === 'none' ? 0 : Math.max(1, fanBeamCount), fanBeam, placementMode);
  fanIndices.forEach((index) => {
    const piece = pieces[index];
    pieces[index] = {
      ...piece,
      kind: 'fan-beam',
      note: fanBeam === 'centered' ? 'Centered fan beam' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side',
      fanPlacement: fanBeam as 'centered' | 'female-offset' | 'male-offset',
    };
  });
  const notes: string[] = [];
  const cuts = pieces.filter((piece) => piece.kind === 'cut');
  if (cuts.length) notes.push(`Closure pieces: ${cuts.map((piece) => `${piece.widthFt} ft`).join(', ')}.`);
  if (fanBeam === 'none') notes.push('No fan beam selected.');
  else {
    notes.push(`${fanIndices.length} fan-beam panel(s) placed with ${placementMode.replace(/-/g, ' ')} strategy.`);
    notes.push(`Panel positions: ${fanIndices.map((value) => value + 1).join(', ')}.`);
  }
  const left = pieces[0];
  const right = pieces[pieces.length - 1];
  if (left && right && left.kind === 'cut' && right.kind === 'cut' && Math.abs(left.widthIn - right.widthIn) < 0.01) notes.push(`Symmetric end cuts: ${left.widthFt} ft left and right.`);
  return summarize(pieces, notes);
}
