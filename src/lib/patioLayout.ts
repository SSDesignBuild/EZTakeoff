export interface PatioPanelPiece {
  widthIn: number;
  widthFt: number;
  kind: 'regular' | 'fan-beam' | 'cut';
  panelWidth: 2 | 4;
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

type Candidate = {
  pieces: PatioPanelPiece[];
  notes: string[];
  cuts: number;
  pieceCount: number;
  cutWasteIn: number;
};

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

function score(candidate: Candidate) {
  return `${candidate.cuts}-${candidate.pieceCount}-${candidate.cutWasteIn}`;
}

function better(next: Candidate | null, best: Candidate | null) {
  if (!next) return best;
  if (!best) return next;
  const na = [next.cuts, next.pieceCount, next.cutWasteIn];
  const ba = [best.cuts, best.pieceCount, best.cutWasteIn];
  for (let i = 0; i < na.length; i += 1) {
    if (na[i] < ba[i]) return next;
    if (na[i] > ba[i]) return best;
  }
  return score(next) < score(best) ? next : best;
}

function standardFill(totalIn: number, preferredPanelFt: number): PatioPanelLayout {
  const preferred = preferredPanelFt === 4 ? 48 : 24;
  let remaining = totalIn;
  const pieces: PatioPanelPiece[] = [];
  while (remaining > 0) {
    if (preferred === 48 && remaining >= 48) {
      pieces.push({ widthIn: 48, widthFt: 4, panelWidth: 4, kind: 'regular' });
      remaining -= 48;
      continue;
    }
    if (remaining >= 24) {
      pieces.push({ widthIn: 24, widthFt: 2, panelWidth: 2, kind: 'regular' });
      remaining -= 24;
      continue;
    }
    pieces.push({ widthIn: remaining, widthFt: widthFootage(remaining), panelWidth: 2, kind: 'cut', note: `Rip-cut closure from 2 ft panel to ${widthFootage(remaining)} ft` });
    remaining = 0;
  }
  const notes = pieces.some((piece) => piece.kind === 'cut') ? ['Outer closure panel is rip-cut from 2 ft stock to hit the exact cover width.'] : [];
  return summarize(pieces, notes);
}

function buildCenteredLayout(totalIn: number): PatioPanelLayout | null {
  let best: Candidate | null = null;
  for (const fanWidthIn of [48, 24]) {
    if (fanWidthIn > totalIn) continue;
    const remaining = totalIn - fanWidthIn;
    if (remaining < 0 || remaining % 2 !== 0) continue;
    const half = remaining / 2;
    for (let fours = 0; fours <= Math.ceil(half / 48) + 1; fours += 1) {
      for (let twos = 0; twos <= Math.ceil(half / 24) + 1; twos += 1) {
        const used = fours * 48 + twos * 24;
        const cut = half - used;
        if (cut < 0 || cut > 24) continue;
        const left: PatioPanelPiece[] = [];
        for (let i = 0; i < fours; i += 1) left.push({ widthIn: 48, widthFt: 4, panelWidth: 4, kind: 'regular' });
        for (let i = 0; i < twos; i += 1) left.push({ widthIn: 24, widthFt: 2, panelWidth: 2, kind: 'regular' });
        if (cut > 0) left.unshift({ widthIn: cut, widthFt: widthFootage(cut), panelWidth: 2, kind: 'cut', note: `Rip-cut closure from 2 ft panel to ${widthFootage(cut)} ft` });
        const pieces = [
          ...left,
          { widthIn: fanWidthIn, widthFt: widthFootage(fanWidthIn), panelWidth: fanWidthIn === 48 ? 4 : 2, kind: 'fan-beam', note: fanWidthIn === 48 ? 'Centered 4 ft fan-beam panel' : 'Centered 2 ft fan-beam panel' } as PatioPanelPiece,
          ...([...left].reverse().map((piece) => ({ ...piece } as PatioPanelPiece))),
        ];
        const candidate: Candidate = {
          pieces,
          cuts: cut > 0 ? 2 : 0,
          pieceCount: pieces.length,
          cutWasteIn: cut > 0 ? (24 - cut) * 2 : 0,
          notes: [
            fanWidthIn === 48 ? 'Centered fan beam uses a 4 ft fan-beam panel.' : 'Centered fan beam uses a 2 ft fan-beam panel.',
            ...(cut > 0 ? [`Outside closure pieces are rip-cut to ${widthFootage(cut)} ft on both sides to keep the layout symmetrical.`] : []),
          ],
        };
        best = better(candidate, best);
      }
    }
  }
  return best ? summarize(best.pieces, best.notes) : null;
}

function buildOffsetLayout(totalIn: number, offset: 'female-offset' | 'male-offset', preferredPanelFt: number): PatioPanelLayout {
  // Offset fan beam must land 1 ft from one side of a 4 ft fan-beam panel.
  // We solve for left-of-fan and right-of-fan fill independently so the preview can show factory intent.
  const fanWidthIn = 48;
  const leftTarget = offset === 'female-offset' ? 12 : totalIn - fanWidthIn - 12;
  const clampedLeft = Math.max(0, Math.min(totalIn - fanWidthIn, leftTarget));
  const rightTarget = totalIn - fanWidthIn - clampedLeft;

  const fillSide = (targetIn: number, favorOuterCut: boolean): Candidate | null => {
    let best: Candidate | null = null;
    for (let fours = 0; fours <= Math.ceil(targetIn / 48) + 1; fours += 1) {
      for (let twos = 0; twos <= Math.ceil(targetIn / 24) + 1; twos += 1) {
        const used = fours * 48 + twos * 24;
        const cut = targetIn - used;
        if (cut < 0 || cut > 24) continue;
        const pieces: PatioPanelPiece[] = [];
        for (let i = 0; i < fours; i += 1) pieces.push({ widthIn: 48, widthFt: 4, panelWidth: 4, kind: 'regular' });
        for (let i = 0; i < twos; i += 1) pieces.push({ widthIn: 24, widthFt: 2, panelWidth: 2, kind: 'regular' });
        if (cut > 0) {
          const cutPiece: PatioPanelPiece = { widthIn: cut, widthFt: widthFootage(cut), panelWidth: 2, kind: 'cut', note: `Rip-cut closure from 2 ft panel to ${widthFootage(cut)} ft` };
          if (favorOuterCut) pieces.unshift(cutPiece); else pieces.push(cutPiece);
        }
        const candidate: Candidate = {
          pieces,
          cuts: cut > 0 ? 1 : 0,
          pieceCount: pieces.length,
          cutWasteIn: cut > 0 ? 24 - cut : 0,
          notes: [],
        };
        best = better(candidate, best);
      }
    }
    return best;
  };

  const left = fillSide(clampedLeft, true);
  const right = fillSide(rightTarget, false);
  if (!left || !right) {
    const fallback = standardFill(totalIn, preferredPanelFt);
    if (fallback.pieces.length) {
      const anchorIndex = offset === 'female-offset' ? 0 : fallback.pieces.length - 1;
      fallback.pieces[anchorIndex] = {
        ...fallback.pieces[anchorIndex],
        kind: 'fan-beam',
        note: offset === 'female-offset' ? '4 ft fan-beam panel · 1 ft from female side' : '4 ft fan-beam panel · 1 ft from male side',
      };
      fallback.notes.push('Offset fan-beam fell back to closest stock layout; verify exact factory panel orientation before ordering.');
    }
    return summarize(fallback.pieces, fallback.notes);
  }

  const pieces = [
    ...left.pieces,
    { widthIn: 48, widthFt: 4, panelWidth: 4, kind: 'fan-beam', note: offset === 'female-offset' ? '4 ft fan-beam panel · 1 ft from female side' : '4 ft fan-beam panel · 1 ft from male side' } as PatioPanelPiece,
    ...right.pieces,
  ];
  const notes = [
    offset === 'female-offset' ? 'Fan beam lands 1 ft from the female side of a 4 ft fan-beam panel.' : 'Fan beam lands 1 ft from the male side of a 4 ft fan-beam panel.',
    ...left.pieces.filter((piece) => piece.kind === 'cut').map((piece) => `Left closure is cut to ${piece.widthFt} ft.`),
    ...right.pieces.filter((piece) => piece.kind === 'cut').map((piece) => `Right closure is cut to ${piece.widthFt} ft.`),
  ];
  return summarize(pieces, notes);
}

export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  if (fanBeam === 'centered') {
    return buildCenteredLayout(totalIn) ?? standardFill(totalIn, preferredPanelFt);
  }
  if (fanBeam === 'female-offset' || fanBeam === 'male-offset') {
    return buildOffsetLayout(totalIn, fanBeam, preferredPanelFt);
  }
  return standardFill(totalIn, preferredPanelFt);
}
