export interface PatioPanelPiece {
  widthIn: number;
  widthFt: number;
  kind: 'regular' | 'fan-beam' | 'cut';
  panelWidth: 2 | 4;
  note?: string;
  positionIn: number;
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
      kind: width % 24 === 0 ? 'regular' : 'cut',
      note: width % 24 === 0 ? undefined : 'closure piece',
      positionIn: position,
    };
    position += width;
    return piece;
  });
}

function buildWidthCombos(totalIn: number) {
  const combos: number[][] = [];
  for (let cutLeft = 0; cutLeft <= 24; cutLeft += 12) {
    for (let cutRight = 0; cutRight <= 24; cutRight += 12) {
      for (let fourCount = 0; fourCount <= Math.ceil(totalIn / 48) + 1; fourCount += 1) {
        for (let twoCount = 0; twoCount <= Math.ceil(totalIn / 24) + 2; twoCount += 1) {
          if ((fourCount * 48) + (twoCount * 24) + cutLeft + cutRight !== totalIn) continue;
          const widths = [cutLeft, ...Array(fourCount).fill(48), ...Array(twoCount).fill(24), cutRight].filter(Boolean) as number[];
          combos.push(widths);
        }
      }
    }
  }
  return combos.length ? combos : [[totalIn]];
}

function pieceSupportsStyle(piece: PatioPanelPiece, style: string) {
  if (style === 'none') return false;
  if (style === 'centered') return piece.widthIn >= 24;
  return piece.widthIn === 48;
}

function chooseFanIndices(pieces: PatioPanelPiece[], count: number, style: string, placementMode: string) {
  const eligible = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => pieceSupportsStyle(piece, style));
  if (!eligible.length) return [];
  const total = pieces.reduce((sum, piece) => sum + piece.widthIn, 0);
  const scored = eligible.map((entry) => ({ ...entry, center: entry.piece.positionIn + entry.piece.widthIn / 2, dist: Math.abs((entry.piece.positionIn + entry.piece.widthIn / 2) - total / 2) }));
  if (placementMode === 'cluster-center' || placementMode === 'inner-pair') scored.sort((a, b) => a.dist - b.dist || a.center - b.center);
  else if (placementMode === 'female-bias') scored.sort((a, b) => a.center - b.center);
  else if (placementMode === 'male-bias' || placementMode === 'outer-pair') scored.sort((a, b) => b.dist - a.dist || a.center - b.center);
  else scored.sort((a, b) => a.center - b.center);
  const picks:number[] = [];
  const targetCount = Math.min(count, scored.length);
  if (placementMode === 'spread' || placementMode === 'outer-pair' || placementMode === 'inner-pair') {
    for (let i = 0; i < targetCount; i += 1) {
      const spreadFactor = placementMode === 'inner-pair' ? (targetCount === 1 ? 0.5 : 0.35 + (0.3 * (i / Math.max(1, targetCount - 1)))) : (targetCount === 1 ? 0.5 : i / (targetCount - 1));
      const slot = Math.round(spreadFactor * (scored.length - 1));
      let candidate = slot;
      while (picks.includes(scored[candidate].index) && candidate < scored.length - 1) candidate += 1;
      while (picks.includes(scored[candidate].index) && candidate > 0) candidate -= 1;
      picks.push(scored[candidate].index);
    }
  } else {
    scored.slice(0, targetCount).forEach((item) => picks.push(item.index));
  }
  return picks.sort((a,b)=>a-b);
}

export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number, fanBeamCount = 1, placementMode = 'spread'): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  const combos = buildWidthCombos(totalIn);
  let best = combos[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const combo of combos) {
    const pieces = expandWidths(combo);
    const cuts = pieces.filter((piece) => piece.kind === 'cut').length;
    const regular4 = pieces.filter((piece) => piece.panelWidth === 4).length;
    const regular2 = pieces.filter((piece) => piece.panelWidth === 2).length;
    const edgePenalty = pieces.length > 1 ? Math.abs(pieces[0].widthIn - pieces[pieces.length - 1].widthIn) : 0;
    const fanEligible = chooseFanIndices(pieces, Math.max(1, fanBeamCount), fanBeam, placementMode).length;
    const preferencePenalty = preferredPanelFt === 4 ? regular2 * 5 : regular4 * 3;
    const fanPenalty = fanBeam === 'none' ? 0 : (fanEligible < Math.max(1, fanBeamCount) ? 1000 : 0);
    const score = fanPenalty + cuts * 20 + edgePenalty + preferencePenalty + pieces.length;
    if (score < bestScore) {
      best = combo;
      bestScore = score;
    }
  }
  const pieces = expandWidths(best).map((piece) => ({ ...piece }));
  const fanIndices = chooseFanIndices(pieces, fanBeam === 'none' ? 0 : Math.max(1, fanBeamCount), fanBeam, placementMode);
  fanIndices.forEach((index) => {
    pieces[index] = {
      ...pieces[index],
      kind: 'fan-beam',
      note: fanBeam === 'centered' ? 'Centered fan beam' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side',
    };
  });
  const notes:string[] = [];
  const cutPieces = pieces.filter((piece) => piece.kind === 'cut');
  if (cutPieces.length) {
    notes.push(`Cut closure panels required: ${cutPieces.map((piece) => `${piece.widthFt} ft`).join(', ')}.`);
  }
  notes.push(fanBeam === 'none' ? 'No fan beam selected.' : `${fanIndices.length} fan-beam panel(s) laid out with ${placementMode.replace('-', ' ')} placement.`);
  if (fanIndices.length) notes.push(`Fan-beam panel positions: ${fanIndices.map((index) => index + 1).join(', ')}.`);
  return summarize(pieces, notes);
}
