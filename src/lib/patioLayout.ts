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

function baseFill(totalIn: number, preferredPanelFt: number) {
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
    pieces.push({ widthIn: remaining, widthFt: widthFootage(remaining), panelWidth: 2, kind: 'cut', note: 'closure piece' });
    remaining = 0;
  }
  return pieces;
}

function withCenteredSingle(totalIn: number, preferredPanelFt: number) {
  if (totalIn <= 24) return baseFill(totalIn, 2);
  const pieces = baseFill(totalIn, preferredPanelFt).slice();
  const centerIndex = Math.floor(pieces.length / 2);
  const target = pieces.findIndex((piece, index) => (pieces.length % 2 === 1 ? index === centerIndex : index === centerIndex - 1 || index === centerIndex) && piece.widthIn >= 24);
  if (target >= 0) {
    const piece = pieces[target];
    pieces[target] = { ...piece, kind: 'fan-beam', note: piece.widthIn === 48 ? 'Centered fan beam' : 'Centered 2 ft fan beam' };
  }
  return pieces;
}

function spreadSymmetricFanPanels(pieces: PatioPanelPiece[], count: number, fanBeam: string) {
  if (fanBeam === 'none' || count <= 0) return { pieces, notes: ['No fan beam selected.'] };
  const notes: string[] = [];
  const eligible = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece.widthIn >= 24 && (fanBeam === 'centered' ? true : piece.widthIn === 48));
  if (eligible.length === 0) return { pieces, notes: ['No valid panel location was available for the requested fan beam option.'] };
  const result = pieces.map((piece) => ({ ...piece }));
  const targetCount = Math.min(count, eligible.length);
  const chosen = new Set<number>();
  for (let i = 0; i < targetCount; i += 1) {
    const ratio = targetCount === 1 ? 0.5 : i / (targetCount - 1);
    const slot = Math.round(ratio * (eligible.length - 1));
    let pick = slot;
    while (chosen.has(eligible[pick].index) && pick < eligible.length - 1) pick += 1;
    while (chosen.has(eligible[pick].index) && pick > 0) pick -= 1;
    chosen.add(eligible[pick].index);
  }
  Array.from(chosen.values()).sort((a, b) => a - b).forEach((index) => {
    const piece = result[index];
    result[index] = {
      ...piece,
      kind: 'fan-beam',
      note: fanBeam === 'centered' ? 'Centered fan beam' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side',
    };
  });
  if (fanBeam === 'centered') notes.push(`${targetCount} centered fan beam panel(s) spread as symmetrically as the panel mix allows.`);
  else notes.push(`${targetCount} offset fan beam panel(s) spread across valid 4 ft panel locations.`);
  return { pieces: result, notes };
}

export function buildPatioPanelLayout(widthFt: number, fanBeam: string, preferredPanelFt: number, fanBeamCount = 1): PatioPanelLayout {
  const totalIn = inchesFromFeet(widthFt);
  const base = fanBeam === 'centered' ? withCenteredSingle(totalIn, preferredPanelFt) : baseFill(totalIn, preferredPanelFt);
  const spread = spreadSymmetricFanPanels(base, fanBeam === 'none' ? 0 : Math.max(1, Math.round(fanBeamCount)), fanBeam);
  const notes = [...spread.notes];
  const cutPieces = spread.pieces.filter((piece) => piece.kind === 'cut');
  if (cutPieces.length > 0) notes.push(`Closure panels required: ${cutPieces.map((piece) => `${piece.widthFt} ft`).join(', ')}.`);
  return summarize(spread.pieces, notes);
}
