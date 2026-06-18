import { parseGableSections, parseSections, parseSunroomSections } from './sectioning';
import { buildDeckModel, buildLowerTierDeckModel } from './deckModel';
import { EstimateResult, MaterialItem, SectionConfig } from './types';
import { buildPatioPanelLayout } from './patioLayout';
import { deriveDeckingLabelPlan } from './deckingLabels';

export type EstimateInputs = Record<string, string | number | boolean>;

const toMaterial = (name: string, category: string, quantity: number, unit: string, stockRecommendation: string, color?: string, notes?: string, layoutLabel?: string): MaterialItem => {
  let normalizedColor = color;
  let normalizedNotes = notes;
  // Older rows sometimes passed notes in the color position. Keep real color/style
  // values in the Color column and move descriptions back into Notes.
  if (normalizedNotes === undefined && typeof normalizedColor === 'string' && /\b(per|run|runs|post|posts|blocking|required|attached|corner|rail|stairs|approx|match|top-level|bottom|end|inline|intermediate|attachment|locations|nail|stringers|total|spindle|baluster|fasten)\b/i.test(normalizedColor)) {
    normalizedNotes = normalizedColor;
    normalizedColor = undefined;
  }
  return {
    name,
    category,
    quantity: Number(quantity.toFixed(2)),
    unit,
    stockRecommendation,
    color: normalizedColor,
    notes: normalizedNotes,
    layoutLabel,
  };
};

const feetAndInches = (feet: number) => {
  const totalInches = Math.round(feet * 12);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${ft}' ${inches}"` : `${ft}'`;
};

const addBoardGroups = (materials: MaterialItem[], category: string, materialName: string, groups: { length: number; count: number }[], notes: string, includeWasteBuffer = false, color?: string, layoutLabel?: string) => {
  groups.forEach((group) => {
    if (group.count > 0) {
      const quantity = includeWasteBuffer ? Math.ceil(group.count * 1.05) : group.count;
      const bufferNote = includeWasteBuffer ? `${notes} · Includes 5% waste/damage buffer.` : notes;
      materials.push(toMaterial(materialName, category, quantity, 'boards', `${group.length} ft stock`, color, bufferNote, layoutLabel));
    }
  });
};

const splitDeckStyle = (style: string) => {
  const cleaned = String(style || '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'match') return { material: 'Deck board', color: undefined as string | undefined };
  if (cleaned.toLowerCase().includes('pressure treated')) return { material: cleaned, color: 'Pressure treated' };
  const parts = cleaned.split(' - ');
  if (parts.length >= 2) return { material: `${parts.slice(0, -1).join(' - ')} deck board`, color: parts[parts.length - 1] };
  return { material: `${cleaned} deck board`, color: cleaned };
};

const normalizeCutLength = (length: number) => Math.round(length * 12) / 12;

const expandCutsToStockSegments = (lengths: number[], stockLength = 24) => {
  const expanded: number[] = [];
  lengths.forEach((rawLength) => {
    let length = normalizeCutLength(rawLength);
    if (length <= 0) return;
    while (length > stockLength + 1e-6) {
      expanded.push(stockLength);
      length = normalizeCutLength(length - stockLength);
    }
    if (length > 0) expanded.push(length);
  });
  return expanded;
};

const packStockCuts = (lengths: number[], stockLength = 24) => {
  const cuts = expandCutsToStockSegments(lengths, stockLength)
    .map((length) => normalizeCutLength(length))
    .filter((length) => length > 0)
    .sort((a, b) => b - a);

  const bins: { remaining: number; cuts: number[] }[] = [];
  cuts.forEach((cut) => {
    const bin = bins.find((candidate) => candidate.remaining + 1e-6 >= cut);
    if (bin) {
      bin.cuts.push(cut);
      bin.remaining = normalizeCutLength(bin.remaining - cut);
    } else {
      bins.push({ remaining: normalizeCutLength(stockLength - cut), cuts: [cut] });
    }
  });
  return bins;
};


const joistActualHeightInches = (joistSize: string) => {
  if (joistSize === '2x12') return 11.25;
  if (joistSize === '2x10') return 9.25;
  return 7.25;
};

const optimizeRepeatedCuts = (pieceCount: number, cutLengthFt: number, stock = [8, 10, 12, 16]) => {
  const cleanCut = Math.max(0.25, normalizeCutLength(cutLengthFt));
  let best = { stockLength: stock[0], stockCount: Math.max(0, pieceCount), perStock: 1, waste: Number.POSITIVE_INFINITY };
  stock.forEach((stockLength) => {
    const perStock = Math.max(1, Math.floor((stockLength + 1e-6) / cleanCut));
    const stockCount = Math.ceil(pieceCount / perStock);
    const waste = stockCount * stockLength - pieceCount * cleanCut;
    if (stockCount < best.stockCount || (stockCount === best.stockCount && waste < best.waste - 1e-6) || (stockCount === best.stockCount && Math.abs(waste - best.waste) < 1e-6 && stockLength < best.stockLength)) {
      best = { stockLength, stockCount, perStock, waste };
    }
  });
  return { ...best, cutLength: cleanCut };
};

const summarizeCuts = (lengths: number[]) => {
  const counts = new Map<number, number>();
  expandCutsToStockSegments(lengths, 24).forEach((length) => {
    const clean = normalizeCutLength(length);
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, 8)
    .map(([length, count]) => `${feetAndInches(length)} x${count}`)
    .join(', ');
};

const add24FtStockFromCuts = (materials: MaterialItem[], name: string, category: string, lengths: number[], notes?: string) => {
  const bins = packStockCuts(lengths, 24);
  if (!bins.length) return;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const waste = bins.reduce((sum, bin) => sum + Math.max(0, bin.remaining), 0);
  const cutSummary = summarizeCuts(lengths);
  materials.push(
    toMaterial(
      name,
      category,
      bins.length,
      'sticks',
      '24 ft stock',
      undefined,
      `${total.toFixed(1)} lf total · ${bins.length} stock stick(s) based on actual required pieces, not just linear footage · ${waste.toFixed(1)} lf estimated offcut${cutSummary ? ` · cuts: ${cutSummary}` : ''}${notes ? ` · ${notes}` : ''}`,
    ),
  );
};

const optimizeStockCuts = (lengths: number[], stock = [8, 12, 16, 20]) => {
  const cleanLengths = lengths.map((length) => normalizeCutLength(length)).filter((length) => length > 0);
  let best = { stockLength: stock[0], count: 0, waste: Number.POSITIVE_INFINITY };
  stock.forEach((stockLength) => {
    const bins = packStockCuts(cleanLengths, stockLength).filter((bin) => bin.remaining >= -1e-6);
    if (bins.length === 0 && cleanLengths.length > 0) return;
    if (bins.some((bin) => bin.remaining < -1e-6)) return;
    const waste = bins.reduce((sum, bin) => sum + Math.max(0, bin.remaining), 0);
    if (bins.length < best.count || best.count === 0 || (bins.length === best.count && waste < best.waste - 1e-6) || (bins.length === best.count && Math.abs(waste - best.waste) < 1e-6 && stockLength > best.stockLength)) {
      best = { stockLength, count: bins.length, waste };
    }
  });
  return best;
};

const addCustomCutGroups = (materials: MaterialItem[], name: string, category: string, lengths: number[], note?: string) => {
  const map = new Map<number, number>();
  lengths.forEach((length) => {
    const rounded = Math.round(length * 12) / 12;
    map.set(rounded, (map.get(rounded) ?? 0) + 1);
  });
  [...map.entries()].sort((a, b) => a[0] - b[0]).forEach(([length, count]) => {
    materials.push(toMaterial(`${name} ${feetAndInches(length)}`, category, count, 'ea', 'Custom cut', undefined, note));
  });
};


const totalCutLength = (lengths: number[]) => lengths.reduce((sum, length) => sum + normalizeCutLength(length), 0);

const consolidateMaterials = (materials: MaterialItem[]) => {
  const merged = new Map<string, MaterialItem>();
  materials.forEach((item) => {
    const key = [item.name, item.category, item.unit, item.stockRecommendation, item.color ?? '', item.layoutLabel ?? ''].join('||');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      return;
    }
    existing.quantity = Number((existing.quantity + item.quantity).toFixed(2));
    if (item.notes) existing.notes = existing.notes ? `${existing.notes} · ${item.notes}` : item.notes;
  });
  return [...merged.values()];
};

function sectionDoorWidth(section: SectionConfig) {
  return section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
}



function railNodeKey(point: { x: number; y: number }) {
  const snap = (value: number) => Math.round(value * 4) / 4;
  return `${snap(point.x).toFixed(2)}-${snap(point.y).toFixed(2)}`;
}

function isOppositeDirection(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x + b.x) < 0.2 && Math.abs(a.y + b.y) < 0.2;
}

function deriveTopRailRuns(deck: ReturnType<typeof buildDeckModel>) {
  const topRuns: { start: { x: number; y: number }; end: { x: number; y: number }; length: number }[] = [];
  deck.railCoverage.forEach((coverage) => {
    const edge = deck.edgeSegments[coverage.edgeIndex];
    if (!edge) return;
    const stairStart = deck.stairPlacement.edgeIndex === coverage.edgeIndex ? deck.stairPlacement.offset : null;
    const stairEnd = deck.stairPlacement.edgeIndex === coverage.edgeIndex ? deck.stairPlacement.offset + deck.stairPlacement.width : null;
    const ranges = stairStart === null ? [[coverage.start, coverage.end]] : [[coverage.start, Math.min(coverage.end, stairStart)], [Math.max(coverage.start, stairEnd ?? coverage.end), coverage.end]];
    ranges.forEach(([start, end]) => {
      if (end - start <= 0.05) return;
      const sRatio = start / edge.length;
      const eRatio = end / edge.length;
      const startPt = { x: edge.start.x + (edge.end.x - edge.start.x) * sRatio, y: edge.start.y + (edge.end.y - edge.start.y) * sRatio };
      const endPt = { x: edge.start.x + (edge.end.x - edge.start.x) * eRatio, y: edge.start.y + (edge.end.y - edge.start.y) * eRatio };
      topRuns.push({ start: startPt, end: endPt, length: end - start });
    });
  });
  return topRuns;
}

function interiorPostCount(length: number, maxSpan = 8) {
  const totalPosts = Math.max(2, Math.ceil(length / maxSpan) + 1);
  return Math.max(0, totalPosts - 2);
}

function classifyRailing(deck: ReturnType<typeof buildDeckModel>) {
  const topRuns = deriveTopRailRuns(deck);
  const stairRuns = deck.stairCount > 0 && deck.stairRailSideCount > 0
    ? Array.from({ length: deck.stairCount * deck.stairRailSideCount }, () => ({ length: deck.stairRunFt, kind: 'stair' as const }))
    : [];
  const levelMix = topRuns.reduce((sum, run) => { const opt = optimizeRail(run.length); return { six: sum.six + opt.six, eight: sum.eight + opt.eight }; }, { six: 0, eight: 0 });
  const stairMix = stairRuns.reduce((sum, run) => { const opt = optimizeRail(run.length); return { six: sum.six + opt.six, eight: sum.eight + opt.eight }; }, { six: 0, eight: 0 });
  const stairKeys = new Set<string>();
  if (deck.stairPlacement.edgeIndex !== null && stairRuns.length) {
    const edge = deck.edgeSegments[deck.stairPlacement.edgeIndex];
    if (edge) {
      const sRatio = deck.stairPlacement.offset / edge.length;
      const eRatio = (deck.stairPlacement.offset + deck.stairPlacement.width) / edge.length;
      const a = { x: edge.start.x + (edge.end.x - edge.start.x) * sRatio, y: edge.start.y + (edge.end.y - edge.start.y) * sRatio };
      const b = { x: edge.start.x + (edge.end.x - edge.start.x) * eRatio, y: edge.start.y + (edge.end.y - edge.start.y) * eRatio };
      stairKeys.add(railNodeKey(a));
      stairKeys.add(railNodeKey(b));
    }
  }
  const nodes = new Map<string, { point: { x: number; y: number }; dirs: { x: number; y: number }[] }>();
  topRuns.forEach((run) => {
    const len = Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y) || 1;
    const dir = { x: (run.end.x - run.start.x) / len, y: (run.end.y - run.start.y) / len };
    const entries = [[railNodeKey(run.start), run.start, dir], [railNodeKey(run.end), run.end, { x: -dir.x, y: -dir.y }]] as const;
    entries.forEach(([key, point, direction]) => {
      const current = nodes.get(key);
      if (!current) nodes.set(key, { point, dirs: [direction] });
      else current.dirs.push(direction);
    });
  });
  let endLevelPosts = 0;
  let inlineLevelPosts = 0;
  let cornerLevelPosts = 0;
  nodes.forEach((entry, key) => {
    if (stairKeys.has(key)) return;
    const unique = entry.dirs.filter((dir, index, arr) => arr.findIndex((item) => Math.abs(item.x - dir.x) < 0.05 && Math.abs(item.y - dir.y) < 0.05) === index).slice(0, 3);
    if (unique.length <= 1) endLevelPosts += 1;
    else if (unique.some((dir, idx) => unique.some((other, jdx) => idx !== jdx && isOppositeDirection(dir, other)))) inlineLevelPosts += 1;
    else cornerLevelPosts += 1;
  });
  inlineLevelPosts += topRuns.reduce((sum, run) => sum + interiorPostCount(run.length), 0);
  // If a stair rail starts from a deck edge that has no level railing/post, add
  // a top stair post so the stair rail has something to attach to. When level
  // rail already exists at that opening, the top post is shared.
  const stairsLevelToAngledCornerPosts = stairRuns.length && topRuns.length === 0 ? deck.stairCount * deck.stairRailSideCount : 0;
  const stairsEndPosts = stairRuns.length ? deck.stairCount * deck.stairRailSideCount : 0;
  const stairsInlinePosts = stairRuns.reduce((sum, run) => sum + interiorPostCount(run.length), 0);
  return {
    levelMix,
    stairMix,
    endLevelPosts,
    inlineLevelPosts,
    cornerLevelPosts,
    stairsLevelToAngledCornerPosts,
    stairsInlinePosts,
    stairsEndPosts,
  };
}

function optimizeRail(length: number) {
  let best = { six: 0, eight: 0, waste: Number.POSITIVE_INFINITY, pieces: Number.POSITIVE_INFINITY };
  for (let six = 0; six < 12; six += 1) {
    for (let eight = 0; eight < 12; eight += 1) {
      const covered = six * 6 + eight * 8;
      if (covered + 1e-6 < length) continue;
      const waste = covered - length;
      const pieces = six + eight;
      if (
        pieces < best.pieces ||
        (pieces === best.pieces && waste < best.waste - 1e-6) ||
        (pieces === best.pieces && Math.abs(waste - best.waste) < 1e-6 && eight > best.eight)
      ) {
        best = { six, eight, waste, pieces };
      }
    }
  }
  return best;
}

function optimizeStockLength(totalLf: number, stock = [8, 12, 16, 20]) {
  let best = { stockLength: stock[0], count: Math.max(1, Math.ceil(totalLf / stock[0])), waste: Number.POSITIVE_INFINITY };
  stock.forEach((stockLength) => {
    const count = Math.max(1, Math.ceil(totalLf / stockLength));
    const waste = count * stockLength - totalLf;
    if (count < best.count || (count === best.count && waste < best.waste - 1e-6) || (count === best.count && Math.abs(waste - best.waste) < 1e-6 && stockLength > best.stockLength)) {
      best = { stockLength, count, waste };
    }
  });
  return best;
}

export function calculateEstimate(serviceSlug: string, inputs: EstimateInputs): EstimateResult {
  switch (serviceSlug) {
    case 'decks':
      return estimateDeck(inputs);
    case 'screen-rooms':
      return estimateScreenRoom(inputs, false);
    case 'patio-covers':
      return estimatePatioCover(inputs);
    case 'flat-pans':
      return estimateFlatPans(inputs);
    case 'renaissance-screen-rooms':
      return estimateScreenRoom(inputs, true);
    case 'sunrooms':
      return estimateSunroom(inputs);
    case 'wooden-structures':
      return estimateWoodenStructure(inputs);
    default:
      return { summary: [], materials: [], orderNotes: [] };
  }
}


function estimateFlatPans(inputs: EstimateInputs): EstimateResult {
  const width = Math.max(1, Number(inputs.width ?? 16));
  const projection = Math.max(1, Number(inputs.projection ?? 10));
  const postHeight = Math.max(1, Number(inputs.postHeight ?? 8));
  const attachmentType = String(inputs.attachmentType ?? 'house');
  const beamType = String(inputs.beamType ?? '3x3');
  const requestedPostType = String(inputs.postType ?? '3x3');
  const panColor = String(inputs.panColor ?? 'white');
  const framingColor = String(inputs.framingColor ?? 'white');
  const requires4x4 = beamType === 'i-beam' || beamType === 'c-beam';
  const postType = requires4x4 ? '4x4' : requestedPostType;
  const beamSpan = beamType === '3x3' ? 10 : (beamType === 'atlas' || beamType === '4x4') ? 16 : 24;
  const beamDisplay = beamType === 'atlas' ? 'Atlas beam' : beamType === 'i-beam' ? 'I beam' : beamType === 'c-beam' ? 'C beam' : `${beamType} beam`;
  const panCount = Math.ceil(width);
  const panLength = Number((projection + 1).toFixed(2));
  const needsMidBeam = projection > 10;
  const supportBeamLines = 1 + (needsMidBeam ? 1 : 0);
  const freestandingHeader = attachmentType === 'freestanding';
  const postLines = supportBeamLines + (freestandingHeader ? 1 : 0);
  const postsPerLine = Math.max(2, Math.ceil(width / beamSpan) + 1);
  const postCount = postsPerLine * postLines;
  const stock24 = (totalLf: number) => Math.ceil(Math.max(0, totalLf) / 24);
  const bracketPerPost = beamType === 'atlas' ? 1 : 2;
  const materials: MaterialItem[] = [
    toMaterial('Flat pan panels', 'Flat pans', panCount, 'panels', `${feetAndInches(panLength)} ordered panel length`, panColor, `${panCount} interlocking 12 in pan(s) across ${feetAndInches(width)} width · includes 1 ft front overhang`),
    toMaterial('3 in flat pan header', 'Structure', stock24(width), 'sticks', '24 ft stock', framingColor, `${feetAndInches(width)} header at ${attachmentType === 'house' ? 'house/wall' : attachmentType === 'fascia' ? 'fascia' : 'freestanding rear beam'} attachment`),
    toMaterial(beamDisplay, 'Structure', stock24(width * supportBeamLines), 'sticks', '24 ft stock', framingColor, `${supportBeamLines} support beam line(s): front beam${needsMidBeam ? ' plus required mid beam because projection exceeds 10 ft' : ''}`),
    toMaterial(`${postType} post`, 'Structure', Math.ceil((postCount * postHeight) / 24), 'sticks', '24 ft stock', framingColor, `${postCount} post(s) cut to ${feetAndInches(postHeight)} · ${postsPerLine} post(s) per support line · ${beamDisplay} span limit ${feetAndInches(beamSpan)}`),
    toMaterial('Flat pan side fascia', 'Trim', stock24(projection * 2), 'sticks', '24 ft stock', framingColor, `Left and right side fascia · ${feetAndInches(projection)} each side`),
    toMaterial('Flat pan gutter', 'Trim', stock24(width), 'sticks', '24 ft stock', framingColor, `Front gutter across ${feetAndInches(width)} width`),
    toMaterial('Flat pan gutter/fascia corners', 'Trim', 2, 'ea', '1 left + 1 right corner', framingColor, 'Corners tie side fascia into front gutter'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per flat pan cover', framingColor, 'Standard two downspout kits per cover'),
    toMaterial('3 in lag screws', 'Hardware', Math.ceil((width * 12) / 8), 'ea', 'Every 8 in in W pattern', undefined, 'Header attachment fasteners'),
    toMaterial('3/4 in washer screws', 'Hardware', panCount * 2 * (1 + supportBeamLines + 1), 'ea', '2 at header + 2 at each beam + 2 at gutter per pan', undefined, `${panCount} pan(s), ${supportBeamLines} beam line(s), header, and gutter fastening`),
    toMaterial(`${postType} hidden brackets`, 'Hardware', postCount * bracketPerPost, 'ea', beamType === 'atlas' ? '1 bottom bracket per post' : '1 bottom + 1 top bracket per post', framingColor, beamType === 'atlas' ? 'Atlas beam wings attach at top of post' : 'Hidden brackets at top and bottom of each post'),
    toMaterial('3/4 in tek screws', 'Hardware', (postCount * 12) + (2 * 4), 'ea', '12 per post + 4 per gutter corner', undefined, '6 bottom and 6 top per post; 4 screws at each gutter/fascia corner'),
    toMaterial('NovaFlex sealant', 'Hardware', Math.ceil((width * projection) / 20), 'tubes', '1 tube per 20 sq ft', framingColor, `${(width * projection).toFixed(1)} sq ft flat pan cover area`),
  ];
  if (requires4x4 && requestedPostType !== '4x4') {
    materials.push(toMaterial('Post requirement note', 'Notes', 1, 'note', 'I beam / C beam require 4x4 posts', framingColor, `Post selection automatically treated as 4x4 because ${beamDisplay} was selected`));
  }
  return {
    summary: [
      { label: 'Width', value: feetAndInches(width) },
      { label: 'Projection', value: feetAndInches(projection) },
      { label: 'Area', value: `${(width * projection).toFixed(1)} sf` },
      { label: 'Pan count', value: `${panCount} @ 12 in` },
      { label: 'Pan order length', value: feetAndInches(panLength) },
      { label: 'Beam / post', value: `${beamDisplay} / ${postType}` },
      { label: 'Support beams', value: `${supportBeamLines}` },
      { label: 'Posts', value: `${postCount}` },
    ],
    materials: consolidateMaterials(materials).filter((item) => item.quantity > 0),
    orderNotes: [
      needsMidBeam ? 'Projection exceeds 10 ft, so a mid support beam and post line are included.' : 'Projection is within the 10 ft flat-pan span with 1 ft front overhang.',
      requires4x4 ? 'I beam and C beam selections require 4x4 posts.' : 'Selected beam can use the chosen post size unless field conditions require upgrade.',
      'Verify attachment substrate, flashing, post footing layout, drainage, and local wind/uplift requirements before ordering.',
    ],
  };
}

function estimateDeck(inputs: EstimateInputs): EstimateResult {
  const deck = buildDeckModel(inputs);
  const lowerDeck = buildLowerTierDeckModel(inputs);
  const railingType = String(inputs.railingType ?? 'aluminum');
  const deckingType = String(inputs.deckingType ?? 'composite');
  const deckingMaterial = String(inputs.deckingMaterial ?? (deckingType === 'pressure-treated' ? 'Pressure treated 5/4x6' : 'Composite / PVC decking'));
  const pictureFrameCount = Math.max(0, Math.round(Number(inputs.pictureFrameCount ?? 1)));
  const breakerBoardCount = Math.max(0, Math.round(Number(inputs.breakerBoardCount ?? 0)));
  const resolveBoardStyle = (value: unknown) => String(value ?? 'match') === 'match' ? deckingMaterial : String(value);
  const pictureFrameMaterials = [inputs.pictureFrameMaterial, inputs.pictureFrameMaterial2, inputs.pictureFrameMaterial3].map(resolveBoardStyle);
  const breakerBoardMaterials = [inputs.breakerBoardMaterial, inputs.breakerBoardMaterial2, inputs.breakerBoardMaterial3].map(resolveBoardStyle);
  const spindleType = String(inputs.spindleType ?? 'black-round');
  const drinkRail = inputs.drinkRail === true || String(inputs.drinkRail ?? 'false') === 'true';
  const drinkRailMaterial = resolveBoardStyle(inputs.drinkRailMaterial);
  const drinkStyleInfo = splitDeckStyle(drinkRailMaterial);
  const materials: MaterialItem[] = [];
  const deckingPlan = deriveDeckingLabelPlan(deck);
  const lowerDeckingPlanForTotals = lowerDeck ? deriveDeckingLabelPlan(lowerDeck) : null;
  const deckingStyleInfo = splitDeckStyle(deckingMaterial);
  const fasciaMaterial = resolveBoardStyle(inputs.fasciaMaterial);
  const fasciaStyleInfo = splitDeckStyle(fasciaMaterial);
  const sumGroupLf = (groups: { length?: number; cutLength?: number; count: number }[]) => groups.reduce((sum, group) => sum + Math.max(0, Number(group.length ?? group.cutLength ?? 0)) * Math.max(0, Number(group.count || 0)), 0);
  const useSubfloorDecking = String(inputs.deckingSurface ?? 'deck-boards') === 'subfloor';
  const subfloorSheetCount = (area: number) => Math.max(0, Math.ceil((area / 32) * 1.05));
  const pictureFrameBoardLf = useSubfloorDecking ? 0 : sumGroupLf(deckingPlan.groups.filter((group) => group.kind === 'picture-frame')) + (lowerDeckingPlanForTotals ? sumGroupLf(lowerDeckingPlanForTotals.groups.filter((group) => group.kind === 'picture-frame')) : 0);
  const stairDeckBoardLf = sumGroupLf(deck.stairTreadGroups) + (lowerDeck ? sumGroupLf(lowerDeck.stairTreadGroups) : 0);
  const totalFasciaBoardLf = Math.max(0, Number(deck.fasciaLf || 0)) + (lowerDeck ? Math.max(0, Number(lowerDeck.fasciaLf || 0)) : 0);
  const colorMatchedTrimFastenerPoints = Math.ceil((pictureFrameBoardLf + stairDeckBoardLf + totalFasciaBoardLf) * 2);
  const totalDeckAreaForNails = Math.max(0, Number(deck.area || 0)) + (lowerDeck ? Math.max(0, Number(lowerDeck.area || 0)) : 0);
  const connectorNails = (deck.joistHangers + deck.postBases + deck.lateralLoadBrackets + deck.rafterTies) * 10 + (lowerDeck ? (lowerDeck.joistHangers + lowerDeck.postBases + lowerDeck.lateralLoadBrackets + lowerDeck.rafterTies) * 10 : 0);
  if (useSubfloorDecking) {
    materials.push(toMaterial('4 ft x 8 ft x 3/4 in subfloor sheets', 'Decking', subfloorSheetCount(deck.area), 'sheets', '4 ft x 8 ft x 3/4 in', 'Exterior rated', `${deck.area.toFixed(1)} sq ft main deck area laid out in a staggered brick pattern; includes 5% waste allowance.`));
  } else {
  deckingPlan.groups.filter((group) => group.kind === 'field').forEach((group) => {
    const notes = `${deck.boardRun === 'width' ? 'Field decking. Boards run parallel to the house.' : 'Field decking. Boards run perpendicular to the house.'} Board style: ${deckingMaterial}. Cut length ${feetAndInches(group.cutLength)}. Includes 5% waste/damage buffer.`;
    const stockLength = [8, 12, 16, 20].find((item) => item >= group.cutLength - 1e-6) ?? 20;
    materials.push(toMaterial(deckingStyleInfo.material, 'Decking', Math.ceil(group.count * 1.05), 'boards', `${stockLength} ft stock`, deckingStyleInfo.color, notes, group.label));
  });
  if (!useSubfloorDecking && pictureFrameCount > 0) {
    for (let i = 0; i < pictureFrameCount; i += 1) {
      const style = pictureFrameMaterials[i] || deckingMaterial;
      const styleInfo = splitDeckStyle(style);
      deckingPlan.groups.filter((group) => group.kind === 'picture-frame' && group.course === i).forEach((group) => {
        const stockLength = [8, 12, 16, 20].find((item) => item >= group.cutLength - 1e-6) ?? 20;
        materials.push(toMaterial(`Picture-frame deck board ${i + 1}`, 'Decking', group.count, 'boards', `${stockLength} ft stock`, styleInfo.color, `Picture-frame course ${i + 1} on exposed deck perimeter only. Board style: ${style}. Cut length ${feetAndInches(group.cutLength)} including 1 in overhang allowance at each end.`, group.label));
      });
    }
  }
  if (!useSubfloorDecking && breakerBoardCount > 0) {
    for (let i = 0; i < breakerBoardCount; i += 1) {
      const style = breakerBoardMaterials[i] || deckingMaterial;
      const styleInfo = splitDeckStyle(style);
      deckingPlan.groups.filter((group) => group.kind === 'breaker' && group.course === i).forEach((group) => {
        const stockLength = [8, 12, 16, 20].find((item) => item >= group.cutLength - 1e-6) ?? 20;
        materials.push(toMaterial(`Breaker deck board ${i + 1}`, 'Decking', group.count, 'boards', `${stockLength} ft stock`, styleInfo.color, `Breaker board row ${i + 1} splitting field decking. Board style: ${style}. Cut length ${feetAndInches(group.cutLength)}.`, group.label));
      });
    }
  }
  }
  addBoardGroups(materials, 'Stairs', 'Stair tread deck board', deck.stairTreadGroups, `${String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? 'Two tread boards per tread plus two deck-board riser boards per riser.' : 'Two tread boards per tread only; risers are not deck boards unless decking is pressure treated.'} Board style: ${deckingMaterial}.`, false, deckingStyleInfo.color);
  addBoardGroups(materials, 'Framing', `${deck.joistSize} joist`, deck.joistLengthGroups, 'Joists at 12 in. O.C.', false, 'Pressure treated');
  addBoardGroups(materials, 'Framing', `${deck.beamMemberSize} beam ply`, deck.beamBoardGroups, 'Doubled beam members with overlap handled in the printed layout.', false, 'Pressure treated');
  addBoardGroups(materials, 'Framing', `${deck.joistSize} double band / rim board`, deck.doubleBandGroups, 'Double band applied to full perimeter with interlocked herringbone-style corners in layout preview.', false, 'Pressure treated');

  if (lowerDeck) {
    const lowerDeckingPlan = deriveDeckingLabelPlan(lowerDeck);
    if (useSubfloorDecking) {
      materials.push(toMaterial('4 ft x 8 ft x 3/4 in subfloor sheets', 'Lower tier decking', subfloorSheetCount(lowerDeck.area), 'sheets', '4 ft x 8 ft x 3/4 in', 'Exterior rated', `${lowerDeck.area.toFixed(1)} sq ft lower tier area laid out in a staggered brick pattern; includes 5% waste allowance.`));
    } else {
      lowerDeckingPlan.groups.filter((group) => group.kind === 'field').forEach((group) => {
        const stockLength = [8, 12, 16, 20].find((item) => item >= group.cutLength - 1e-6) ?? 20;
        materials.push(toMaterial(deckingStyleInfo.material, 'Decking', Math.ceil(group.count * 1.05), 'boards', `${stockLength} ft stock`, deckingStyleInfo.color, `Lower tier field decking. Cut length ${feetAndInches(group.cutLength)}. Includes 5% waste/damage buffer.`, group.label));
      });
    }
    addBoardGroups(materials, 'Lower tier stairs', 'Lower tier stair tread deck board', lowerDeck.stairTreadGroups, `${String(inputs.deckingType ?? 'composite') === 'pressure-treated' ? 'Lower tier treads and risers.' : 'Lower tier treads only; risers are not deck boards unless pressure treated.'} Board style: ${deckingMaterial}.`, false, deckingStyleInfo.color);
    addBoardGroups(materials, 'Framing', `${lowerDeck.joistSize} joist`, lowerDeck.joistLengthGroups, 'Lower tier joists at 12 in. O.C.', false, 'Pressure treated');
    addBoardGroups(materials, 'Framing', `${lowerDeck.beamMemberSize} beam ply`, lowerDeck.beamBoardGroups, 'Lower tier doubled beam members.', false, 'Pressure treated');
    addBoardGroups(materials, 'Framing', `${lowerDeck.joistSize} double band / rim board`, lowerDeck.doubleBandGroups, 'Lower tier double band applied to full perimeter.', false, 'Pressure treated');
    const lowerHeightFt = Math.max(0, Number(inputs.lowerDeckHeight ?? inputs.deckHeight ?? 0));
    const lowerPostCutFt = Math.max(0.5, (lowerHeightFt * 12 - joistActualHeightInches(lowerDeck.joistSize)) / 12);
    const lowerPostStock = optimizeRepeatedCuts(lowerDeck.postCount, lowerPostCutFt, [8, 10, 12, 16]);
    materials.push(
      toMaterial('6x6 wood posts', 'Structure', lowerPostStock.stockCount, 'boards', `${lowerPostStock.stockLength} ft stock`, 'Pressure treated', `Lower tier: ${lowerDeck.postCount} post(s) cut to about ${feetAndInches(lowerPostStock.cutLength)} each`),
      toMaterial('Concrete mix', 'Structure', lowerDeck.concreteBags, 'bags', '80 lb bags', undefined, 'Lower tier: 3 bags per post footing'),
      toMaterial('12 in x 48 in Sonotubes', 'Structure', Math.ceil(lowerDeck.postCount / 3), 'tubes', '1 tube per 3 footers', undefined, `Lower tier: ${lowerDeck.postCount} 6x6 post footer(s) total`),
      toMaterial('Post brackets', 'Hardware', lowerDeck.postBases, 'ea', '1 per post', undefined, 'Lower tier post base bracket at each footing'),
      toMaterial('Concrete submersible J Anchors', 'Hardware', lowerDeck.concreteAnchors, 'ea', '1 per post bracket', undefined, 'Lower tier concrete anchor for post base bracket'),
      toMaterial('Joist hangers', 'Hardware', lowerDeck.joistHangers, 'ea', 'Match joist size', undefined, 'Lower tier: one hanger at each end of every joist'),
      ...(lowerDeck.angledJoistHangers > 0 ? [toMaterial('Angled joist hangers', 'Hardware', lowerDeck.angledJoistHangers, 'ea', 'Match joist size', undefined, 'Lower tier joists landing against angled deck edges')] : []),
      toMaterial('Hurricane ties', 'Hardware', lowerDeck.rafterTies, 'ea', '1 per joist to beam condition', undefined, 'Lower tier hurricane ties'),
      toMaterial('Hex head LedgerLOK screws 5 in', 'Hardware', lowerDeck.sdsCorners, 'ea', '4 per corner', undefined, 'Lower tier band-board corners')
    );
  }

  const baseRailSegments = deck.exposedSegments.map((segment) => segment.length);
  const stairOpeningWidth = deck.stairPlacement.edgeIndex !== null ? Math.min(deck.stairPlacement.width, deck.exposedSegments.find((segment) => segment.index === deck.stairPlacement.edgeIndex)?.length ?? 0) : 0;
  const adjustedRailSegments = baseRailSegments.flatMap((length, index) => {
    const seg = deck.exposedSegments[index];
    if (seg.index !== deck.stairPlacement.edgeIndex || stairOpeningWidth <= 0) return [length];
    const leftRight = Math.max(0, length - stairOpeningWidth);
    if (leftRight <= 0) return [];
    return [leftRight / 2, leftRight / 2].filter((value) => value > 0.05);
  });
  if (deck.stairCount > 0 && deck.stairRailSideCount > 0) {
    for (let run = 0; run < deck.stairCount * deck.stairRailSideCount; run += 1) adjustedRailSegments.push(deck.stairRunFt);
  }
  const railingBreakdown = classifyRailing(deck);

  const railingPosts = railingBreakdown.endLevelPosts + railingBreakdown.inlineLevelPosts + railingBreakdown.cornerLevelPosts + railingBreakdown.stairsLevelToAngledCornerPosts + railingBreakdown.stairsInlinePosts + railingBreakdown.stairsEndPosts;
  const deckHeightFt = Math.max(0, Number(inputs.deckHeight ?? 0));
  const structuralPostCutFt = Math.max(0.5, (deckHeightFt * 12 - joistActualHeightInches(deck.joistSize)) / 12);
  const structuralPostStock = optimizeRepeatedCuts(deck.postCount, structuralPostCutFt, [8, 10, 12, 16]);

  materials.push(
    toMaterial('6x6 wood posts', 'Structure', structuralPostStock.stockCount, 'boards', `${structuralPostStock.stockLength} ft stock`, 'Pressure treated', `${deck.postCount} post(s) cut to about ${feetAndInches(structuralPostStock.cutLength)} each after subtracting ${deck.joistSize} joist height from ${feetAndInches(deckHeightFt)} deck height · ${structuralPostStock.perStock} cut(s) per stock board${deck.lockedPosts.length ? ` · ${deck.lockedPosts.length} post position(s) manually locked` : ''}`),
    toMaterial('Concrete mix', 'Structure', deck.concreteBags, 'bags', '80 lb bags', undefined, '3 bags per post footing'),
    toMaterial('12 in x 48 in Sonotubes', 'Structure', Math.ceil(deck.postCount / 3), 'tubes', '1 tube per 3 footers', undefined, `${deck.postCount} 6x6 post footer(s) total`),
    toMaterial('Post brackets', 'Hardware', deck.postBases, 'ea', '1 per post', undefined, 'Post base bracket at each footing'),
    toMaterial('Concrete submersible J Anchors', 'Hardware', deck.concreteAnchors, 'ea', '1 per post bracket', undefined, 'Concrete anchor for post base bracket'),
    toMaterial('Joist hangers', 'Hardware', deck.joistHangers, 'ea', 'Match joist size', undefined, 'One hanger at each end of every joist'),
    ...(deck.angledJoistHangers > 0 ? [toMaterial('Angled joist hangers', 'Hardware', deck.angledJoistHangers, 'ea', 'Match joist size', undefined, 'Joists landing against angled deck edges') ] : []),
    toMaterial('Hurricane ties', 'Hardware', deck.rafterTies, 'ea', '1 per joist to beam condition', undefined, 'One hurricane tie where each joist bears on each beam'),
    toMaterial('Carriage bolt sets', 'Hardware', deck.postCount * 2 + ((railingType === 'wood' || railingType === 'vinyl-composite') ? railingPosts * 2 : 0), 'sets', 'Bolt + washer + nut', undefined),
    toMaterial('Ledger lateral load brackets', 'Hardware', deck.lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', undefined),
    ...(deck.attachment === 'siding' || deck.attachment === 'brick' ? [toMaterial('1/2 in x 6 in lag screws', 'Hardware', Math.max(1, Math.ceil(deck.houseContactLength)), 'ea', 'W pattern every 12 in', undefined, deck.attachment === 'brick' ? 'Lag screws used with shield anchors for brick lateral attachment; posts/beams remain the gravity support' : 'Ledger to house attachment')] : []),
    ...(deck.attachment === 'brick' ? [toMaterial('1/2 in x 3 in lag shield anchors', 'Hardware', Math.max(1, Math.ceil(deck.houseContactLength)), 'ea', 'One shield anchor per lag', undefined, 'Required where lag screws attach to brick/masonry')] : []),
    toMaterial('Hex head LedgerLOK screws 5 in', 'Hardware', deck.sdsCorners, 'ea', '4 per corner', undefined, 'All band-board corners'),
    toMaterial('Joist tape', 'Hardware', deck.joistTapeLf, 'lf', 'Match roll coverage', undefined, 'Tape joists and band-board top edges'),
    toMaterial('3-1/2 in exterior framing screws', 'Hardware', Math.max(1, Math.ceil(deck.deckFastenerCount / 365)), 'boxes', '365 per box', undefined, 'General exterior framing screws added for every deck surface type.'),
    ...(deckingType === 'pressure-treated' ? [toMaterial('3-1/2 in exterior screws used for deck boards', 'Hardware', Math.max(1, Math.ceil((deck.area + (lowerDeck ? lowerDeck.area : 0)) / 300)), '5 lb boxes', '1 box per 300 sq ft of decking', undefined, 'For pressure-treated decking, breaker boards, and picture-frame areas that are face screwed')] : [toMaterial('2-3/8 in CAMO screws', 'Hardware', Math.max(1, Math.ceil(deck.deckFastenerCount / 1750)), 'boxes', '1750 per box', undefined, 'Hidden deck fasteners for composite/PVC decking')]),
    toMaterial('1-1/2 in nails', 'Hardware', connectorNails, 'nails', '10 per connector/tie', undefined, 'Used for joist hangers, post brackets, lateral load brackets, and hurricane ties; replaces separate 3 in nail takeoff for easier ordering'),
    toMaterial('21 degree 3 in x .120 exterior collated nails with ring shank', 'Hardware', Math.max(1, Math.ceil(totalDeckAreaForNails / 200)), 'boxes', '1000 nails per box', undefined, 'Add 1000 nails per 200 sq ft of decking'),
    ...(colorMatchedTrimFastenerPoints > 0 ? [
      toMaterial('Cortex color match fascia screws', 'Hardware', colorMatchedTrimFastenerPoints, 'ea', '2 screws per lf', fasciaStyleInfo.color ?? deckingStyleInfo.color, `Small head screws, not big flat head screws. 2 screws every 1 ft of picture-frame board, stair board, and fascia board used. Picture frame ${pictureFrameBoardLf.toFixed(1)} lf + step boards ${stairDeckBoardLf.toFixed(1)} lf + fascia ${totalFasciaBoardLf.toFixed(1)} lf.`),
      toMaterial('Color match screws for plugs', 'Hardware', colorMatchedTrimFastenerPoints, 'ea', '2 screws per lf', deckingStyleInfo.color ?? fasciaStyleInfo.color, `Same count logic as fascia screws: picture-frame boards, step boards, and fascia board runs.`),
      toMaterial('Color match plugs', 'Hardware', colorMatchedTrimFastenerPoints, 'ea', '1 plug per color-match screw', deckingStyleInfo.color ?? fasciaStyleInfo.color, `Same count logic as fascia screws: picture-frame boards, step boards, and fascia board runs.`),
    ] : []),
    ...(deck.fasciaPieces > 0 ? [toMaterial('Fascia board', 'Trim', deck.fasciaPieces, 'boards', '12 ft fascia boards', fasciaStyleInfo.color, `${deck.fasciaLf.toFixed(1)} lf on exposed deck perimeter plus stair risers/stringer sides only. Fascia style: ${fasciaMaterial}.`)] : []),
  );
  if (deck.stairStringers > 0) {
    materials.push(toMaterial('2x12 stringers', 'Stairs', deck.stairStringerBoardCount, 'boards', `${deck.stairStringerLength} ft stock`, 'Pressure treated', `${deck.stairStringers} stringer cut(s) at about ${feetAndInches(deck.stairStringerCutLength)} each · 12 in. O.C. · ${deck.stairRisers} risers / ${deck.stairTreadsPerRun} treads per run`));
  }
  if (lowerDeck && lowerDeck.stairStringers > 0) {
    materials.push(toMaterial('2x12 stringers', 'Lower tier stairs', lowerDeck.stairStringerBoardCount, 'boards', `${lowerDeck.stairStringerLength} ft stock`, 'Pressure treated', `Lower tier: ${lowerDeck.stairStringers} stringer cut(s) at about ${feetAndInches(lowerDeck.stairStringerCutLength)} each · 12 in. O.C. · ${lowerDeck.stairRisers} risers / ${lowerDeck.stairTreadsPerRun} treads per run`));
  }

  const lowerRailingBreakdown = lowerDeck ? classifyRailing(lowerDeck) : null;
  const lowerRailingPosts = lowerRailingBreakdown ? lowerRailingBreakdown.endLevelPosts + lowerRailingBreakdown.inlineLevelPosts + lowerRailingBreakdown.cornerLevelPosts + lowerRailingBreakdown.stairsLevelToAngledCornerPosts + lowerRailingBreakdown.stairsInlinePosts + lowerRailingBreakdown.stairsEndPosts : 0;

  if (railingType === 'aluminum') {
    if (railingBreakdown.levelMix.eight) materials.push(toMaterial('8 ft level railing sections', 'Railing', railingBreakdown.levelMix.eight, 'sections', '8 ft sections', 'Top-level straight runs'));
    if (railingBreakdown.levelMix.six) materials.push(toMaterial('6 ft level railing sections', 'Railing', railingBreakdown.levelMix.six, 'sections', '6 ft sections', 'Top-level straight runs'));
    if (railingBreakdown.stairMix.eight) materials.push(toMaterial('8 ft angled railing sections', 'Railing', railingBreakdown.stairMix.eight, 'sections', '8 ft sections', 'Stair-side or angled runs'));
    if (railingBreakdown.stairMix.six) materials.push(toMaterial('6 ft angled railing sections', 'Railing', railingBreakdown.stairMix.six, 'sections', '6 ft sections', 'Stair-side or angled runs'));
    if (railingBreakdown.endLevelPosts) materials.push(toMaterial('End level posts', 'Railing', railingBreakdown.endLevelPosts, 'ea', 'Match railing system', 'Post with only one top-level rail attached'));
    if (railingBreakdown.inlineLevelPosts) materials.push(toMaterial('Inline level posts', 'Railing', railingBreakdown.inlineLevelPosts, 'ea', 'Match railing system', 'Post with two opposite top-level rails attached'));
    if (railingBreakdown.cornerLevelPosts) materials.push(toMaterial('Corner level posts', 'Railing', railingBreakdown.cornerLevelPosts, 'ea', 'Match railing system', 'Post with adjacent top-level rails attached'));
    if (railingBreakdown.stairsLevelToAngledCornerPosts) materials.push(toMaterial('Stairs level-to-angled corner posts', 'Railing', railingBreakdown.stairsLevelToAngledCornerPosts, 'ea', 'Match railing system', 'Top posts where level rail turns onto stair rail'));
    if (railingBreakdown.stairsInlinePosts) materials.push(toMaterial('Stairs inline posts', 'Railing', railingBreakdown.stairsInlinePosts, 'ea', 'Match railing system', 'Intermediate stair-side posts'));
    if (railingBreakdown.stairsEndPosts) materials.push(toMaterial('Stairs end posts', 'Railing', railingBreakdown.stairsEndPosts, 'ea', 'Match railing system', 'Bottom stair-end posts'));
    if (lowerRailingBreakdown) {
      if (lowerRailingBreakdown.levelMix.eight) materials.push(toMaterial('8 ft level railing sections', 'Lower tier railing', lowerRailingBreakdown.levelMix.eight, 'sections', '8 ft sections', 'Lower tier straight runs'));
      if (lowerRailingBreakdown.levelMix.six) materials.push(toMaterial('6 ft level railing sections', 'Lower tier railing', lowerRailingBreakdown.levelMix.six, 'sections', '6 ft sections', 'Lower tier straight runs'));
      if (lowerRailingBreakdown.stairMix.eight) materials.push(toMaterial('8 ft angled railing sections', 'Lower tier railing', lowerRailingBreakdown.stairMix.eight, 'sections', '8 ft sections', 'Lower tier stair-side or angled runs'));
      if (lowerRailingBreakdown.stairMix.six) materials.push(toMaterial('6 ft angled railing sections', 'Lower tier railing', lowerRailingBreakdown.stairMix.six, 'sections', '6 ft sections', 'Lower tier stair-side or angled runs'));
      if (lowerRailingBreakdown.endLevelPosts) materials.push(toMaterial('End level posts', 'Lower tier railing', lowerRailingBreakdown.endLevelPosts, 'ea', 'Match railing system', 'Lower tier posts'));
      if (lowerRailingBreakdown.inlineLevelPosts) materials.push(toMaterial('Inline level posts', 'Lower tier railing', lowerRailingBreakdown.inlineLevelPosts, 'ea', 'Match railing system', 'Lower tier posts'));
      if (lowerRailingBreakdown.cornerLevelPosts) materials.push(toMaterial('Corner level posts', 'Lower tier railing', lowerRailingBreakdown.cornerLevelPosts, 'ea', 'Match railing system', 'Lower tier posts'));
      if (lowerRailingBreakdown.stairsLevelToAngledCornerPosts) materials.push(toMaterial('Stairs level-to-angled corner posts', 'Lower tier railing', lowerRailingBreakdown.stairsLevelToAngledCornerPosts, 'ea', 'Match railing system', 'Lower tier stair top posts'));
      if (lowerRailingBreakdown.stairsInlinePosts) materials.push(toMaterial('Stairs inline posts', 'Lower tier railing', lowerRailingBreakdown.stairsInlinePosts, 'ea', 'Match railing system', 'Lower tier stair posts'));
      if (lowerRailingBreakdown.stairsEndPosts) materials.push(toMaterial('Stairs end posts', 'Lower tier railing', lowerRailingBreakdown.stairsEndPosts, 'ea', 'Match railing system', 'Lower tier bottom stair-end posts'));
    }
  } else if (railingType === 'wood') {
    const levelRailLf = deriveTopRailRuns(deck).reduce((sum, run) => sum + run.length, 0);
    const stairRailLf = deck.stairCount > 0 && deck.stairRailSideCount > 0 ? deck.stairRunFt * deck.stairCount * deck.stairRailSideCount : 0;
    const totalWoodRailLf = levelRailLf + stairRailLf;
    const balusterCount = Math.ceil(totalWoodRailLf * 3.1);
    const levelBalusters = Math.ceil(levelRailLf * 3.1);
    const stairBalusters = Math.max(0, balusterCount - levelBalusters);
    const woodRailStock = optimizeStockLength(totalWoodRailLf, [8, 12, 16, 20]);
    if (totalWoodRailLf > 0 && railingPosts) materials.push(toMaterial('4x4 pressure-treated railing posts', 'Railing', Math.ceil(railingPosts / 2), 'boards', '8 ft 4x4 stock', 'Pressure treated', `${railingPosts} rail post cuts total · 2 rail posts per 8 ft 4x4`));
    if (totalWoodRailLf > 0 && lowerRailingPosts) materials.push(toMaterial('4x4 pressure-treated railing posts', 'Lower tier railing', Math.ceil(lowerRailingPosts / 2), 'boards', '8 ft 4x4 stock', 'Pressure treated', `Lower tier: ${lowerRailingPosts} rail post cuts total · 2 rail posts per 8 ft 4x4`));
    if (totalWoodRailLf > 0) materials.push(toMaterial('2x4 pressure-treated top rail', 'Railing', woodRailStock.count, 'boards', `${woodRailStock.stockLength} ft stock`, undefined, `${totalWoodRailLf.toFixed(1)} lf rail run · optimized to reduce board count and handling`));
    if (totalWoodRailLf > 0) materials.push(toMaterial('2x4 pressure-treated bottom rail', 'Railing', woodRailStock.count, 'boards', `${woodRailStock.stockLength} ft stock`, undefined, `${totalWoodRailLf.toFixed(1)} lf rail run · optimized to reduce board count and handling`));
    if (spindleType === 'wood') {
      if (totalWoodRailLf > 0) materials.push(toMaterial('1.5x1.5 wood balusters', 'Railing', balusterCount, 'ea', 'Wood spindle stock', undefined, 'Approx. 4 in max clear spacing'));
      if (totalWoodRailLf > 0) materials.push(toMaterial('Finish nails', 'Hardware', Math.ceil(balusterCount * 2 / 1200), 'boxes', 'Fasten wood balusters', undefined, `${balusterCount * 2} nail points estimated`));
    } else if (spindleType === 'black-round') {
      if (totalWoodRailLf > 0) materials.push(toMaterial('Black round spindles', 'Railing', balusterCount, 'ea', 'Round aluminum balusters', 'black', 'Approx. 4 in max clear spacing'));
      if (levelBalusters) materials.push(toMaterial('Level round-spindle adapter plugs', 'Railing', levelBalusters * 2, 'ea', 'Top and bottom plug per spindle end', 'black', 'For level wood railing runs'));
      if (stairBalusters) materials.push(toMaterial('Angled round-spindle adapter plugs', 'Railing', stairBalusters * 2, 'ea', 'Top and bottom angled plug per spindle end', 'black', 'For stair wood railing runs'));
    } else {
      if (totalWoodRailLf > 0) materials.push(toMaterial('Vinyl spindles for wood rail', 'Railing', balusterCount, 'ea', 'Vinyl balusters', undefined, 'Approx. 4 in max clear spacing'));
    }
    if (drinkRail && totalWoodRailLf > 0) {
      const drinkStock = optimizeStockLength(totalWoodRailLf, [8, 12, 16, 20]);
      materials.push(toMaterial('2x6 pressure-treated drink rail', 'Railing', drinkStock.count, 'boards', `${drinkStock.stockLength} ft stock`, undefined, `${totalWoodRailLf.toFixed(1)} lf drink rail · optimized to reduce board count and handling`));
    }
  } else {
    const vinylCompositeRailPosts = railingPosts + lowerRailingPosts;
    if (railingType === 'vinyl-composite' && vinylCompositeRailPosts > 0) materials.push(toMaterial('4x4 pressure-treated railing posts', 'Railing', Math.ceil(vinylCompositeRailPosts / 2), 'boards', '8 ft 4x4 stock', 'Pressure treated', `${vinylCompositeRailPosts} rail post cuts total for vinyl/composite sleeves · 2 rail posts per 8 ft 4x4`));
    if (railingBreakdown.levelMix.eight) materials.push(toMaterial('8 ft vinyl/composite level railing sections', 'Railing', railingBreakdown.levelMix.eight, 'sections', '8 ft sections', undefined, 'Top-level straight runs'));
    if (railingBreakdown.levelMix.six) materials.push(toMaterial('6 ft vinyl/composite level railing sections', 'Railing', railingBreakdown.levelMix.six, 'sections', '6 ft sections', undefined, 'Top-level straight runs'));
    if (railingBreakdown.stairMix.eight) materials.push(toMaterial('8 ft vinyl/composite angled railing sections', 'Railing', railingBreakdown.stairMix.eight, 'sections', '8 ft sections', undefined, 'Stair-side or angled runs'));
    if (railingBreakdown.stairMix.six) materials.push(toMaterial('6 ft vinyl/composite angled railing sections', 'Railing', railingBreakdown.stairMix.six, 'sections', '6 ft sections', undefined, 'Stair-side or angled runs'));
  }
  if (drinkRail && railingType !== 'wood') {
    const splitRailRunIntoStockCuts = (length: number) => {
      const mix = optimizeRail(length);
      return [
        ...Array.from({ length: mix.eight }, () => 8),
        ...Array.from({ length: mix.six }, () => 6),
      ];
    };
    const drinkRailCuts = [
      ...deriveTopRailRuns(deck).flatMap((run) => splitRailRunIntoStockCuts(run.length)),
      ...(deck.stairCount > 0 && deck.stairRailSideCount > 0 ? Array.from({ length: deck.stairCount * deck.stairRailSideCount }).flatMap(() => splitRailRunIntoStockCuts(deck.stairRunFt)) : []),
    ];
    const drinkRailLf = drinkRailCuts.reduce((sum, length) => sum + length, 0);
    const drinkStock = optimizeStockCuts(drinkRailCuts, [8, 12, 16, 20]);
    if (drinkStock.count > 0) {
      materials.push(toMaterial(
        `${drinkRailMaterial} drink rail boards`,
        'Railing',
        drinkStock.count,
        'boards',
        `${drinkStock.stockLength} ft stock`,
        drinkRailMaterial === deckingMaterial ? deckingStyleInfo.color : drinkStyleInfo.color,
        `${drinkRailLf.toFixed(1)} lf drink rail across ${drinkRailCuts.length} level/angled railing section cut(s) · optimized from available 8, 12, 16, and 20 ft decking stock`,
      ));
    }
  }
  return {
    summary: [
      { label: 'Deck area', value: lowerDeck ? `${(deck.area + lowerDeck.area).toFixed(1)} sq ft total` : `${deck.area.toFixed(1)} sq ft` },
      { label: 'Surface', value: useSubfloorDecking ? '4x8x3/4 subfloor sheets, staggered brick pattern' : (deck.boardRun === 'width' ? 'Deck boards parallel to house / stock tracks width' : 'Deck boards perpendicular to house / stock tracks projection') },
      { label: 'Stairs', value: deck.stairCount ? `${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers` : 'No stairs' },
      { label: 'Railing mix', value: `Level ${railingBreakdown.levelMix.six}x6' + ${railingBreakdown.levelMix.eight}x8' · Angled ${railingBreakdown.stairMix.six}x6' + ${railingBreakdown.stairMix.eight}x8'` },
    ],
    materials: consolidateMaterials(materials).filter((item) => item.quantity > 0),
    orderNotes: [
      deck.attachment === 'brick' ? 'Brick attachment is treated as freestanding, so the house side still needs beam and post support, including beam segments at any inside corner/jut-out.' : 'Siding attachment keeps ledger logic active unless the deck is marked freestanding.',
      deck.stairPlacement.edgeIndex !== null ? `Stairs sit on edge ${deck.stairPlacement.edgeIndex + 1}. Preview now shows tread count, stringer layout, and ${deck.stairRailSideCount === 0 ? 'no stair-side railing' : `${deck.stairRailSideCount} stair-side railing run(s)`} based on the left/right stair railing inputs.` : 'No stair edge is assigned yet in the drawing tool.',
      'Railing optimizer solves each straight run separately, subtracts stair openings from the deck edge, and adds stair-side railing runs when the left/right stair railing inputs are selected.',
      deck.requiredFieldBoardBreaks.length > 0 ? 'Field board run exceeds 20 ft. Add a breaker board to avoid staggered decking; the app no longer shows staggered board seams.' : 'Field decking uses available 8, 12, 16, and 20 ft board lengths with breaker boards where selected.',
      lowerDeck ? `Multi-tier deck mode: lower tier is drawn and included in layout/materials at ${feetAndInches(Number(inputs.lowerDeckHeight ?? 0))} high with ${lowerDeck.area.toFixed(1)} sq ft.` : 'Single tier deck mode.',
      deck.lockedPosts.length > 0 ? 'Locked posts stay in the take-off even after beam edits so you can preserve preferred field locations.' : 'Use post lock mode when you want to hold a post location while still letting the app auto-space the rest.',
    ],
  };
}


function sectionChairRailCount(section: { chairRail: boolean; chairRailCount?: number }) {
  if (!section.chairRail) return 0;
  return Math.max(1, Math.round(section.chairRailCount || 1));
}

function sectionDoorHeight(section: Pick<SectionConfig, 'doorType' | 'doorHeight' | 'height'>) {
  if (section.doorType === 'none') return 0;
  return Math.max(0, Math.min(section.height, Number(section.doorHeight || (6 + 8 / 12))));
}

function sectionChairRailHeights(section: Pick<SectionConfig, 'chairRail' | 'chairRailCount' | 'chairRailHeight' | 'kickPanel' | 'kickPanelHeight' | 'height'>) {
  const count = sectionChairRailCount(section);
  if (count <= 0) return [] as number[];
  const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);
  const first = Math.max(kickHeight + 0.25, Math.min(section.height - 0.25, Number(section.chairRailHeight || 3)));
  if (count === 1) return [first];
  const remaining = Math.max(0, section.height - first);
  return Array.from({ length: count }, (_, index) => index === 0 ? first : first + (remaining * index) / (count - 1))
    .filter((value, index, arr) => value > kickHeight + 0.05 && value < section.height - 0.05 && (index === 0 || value - arr[index - 1] > 0.05));
}

function sectionDoorJambHeight(section: Pick<SectionConfig, 'height' | 'doorType' | 'doorHeight' | 'chairRail' | 'chairRailCount' | 'chairRailHeight' | 'kickPanel' | 'kickPanelHeight'>) {
  const firstRail = sectionChairRailHeights(section as SectionConfig)[0];
  if (section.height > 12 && firstRail) return firstRail;
  return section.height;
}


function sectionDoorLeftFeet(section: SectionConfig) {
  const sectionWidthIn = section.width * 12;
  const doorWidthIn = Math.min(sectionDoorWidth(section) * 12, sectionWidthIn);
  if (section.doorType === 'none' || doorWidthIn <= 0) return 0;
  if (section.doorPlacement === 'left') return 0;
  if (section.doorPlacement === 'right') return Math.max(0, sectionWidthIn - doorWidthIn) / 12;
  if (section.doorPlacement === 'custom') return Math.max(0, Math.min(section.doorOffsetInches, sectionWidthIn - doorWidthIn)) / 12;
  return Math.max(0, (sectionWidthIn - doorWidthIn) / 2) / 12;
}

function sectionSpansExcludingDoorCuts(section: SectionConfig) {
  const doorWidth = sectionDoorWidth(section);
  if (section.doorType === 'none' || doorWidth <= 0.01) return [{ start: 0, end: section.width }];
  const left = sectionDoorLeftFeet(section);
  const right = left + doorWidth;
  return [
    ...(left > 0.01 ? [{ start: 0, end: left }] : []),
    ...(right < section.width - 0.01 ? [{ start: right, end: section.width }] : []),
  ].filter((span) => span.end - span.start > 0.05);
}

function sectionUprightPositionsForCuts(section: SectionConfig) {
  const count = Math.max(0, Math.floor(section.uprights || 0));
  const raw = Array.isArray(section.uprightOffsets) ? section.uprightOffsets : [];
  const spans = sectionSpansExcludingDoorCuts(section);
  return Array.from({ length: count }, (_, index) => raw[index] !== undefined ? Number(raw[index]) : ((index + 1) * section.width) / (count + 1))
    .map((x) => Math.max(0, Math.min(section.width, x)))
    .filter((x) => spans.some((span) => x > span.start + 0.05 && x < span.end - 0.05));
}

function receiverSizeLabel(value: string) {
  return value === '1' ? '1 in' : '5/8 in';
}

function screenRollName(screenType: string) {
  if (screenType === 'suntex-90') return 'Suntex 90 screen rolls';
  if (screenType === 'suntex-80') return 'Suntex 80 screen rolls';
  return '17/20 tuff screen rolls';
}

function splineName(screenType: string) {
  return screenType === 'tuff-screen' ? '.315 spline' : '.285 spline';
}

function masonryReceiverScrews(lf: number) {
  return Math.max(0, Math.ceil(lf / 2.5));
}

function metalReceiverScrews(lf: number) {
  return Math.max(0, Math.ceil(lf / 2.5));
}

function clipCountForSection(section: SectionConfig, doorJambHeight: number) {
  const railCount = sectionChairRailCount(section);
  const doorWidth = sectionDoorWidth(section);
  const wallWidthExcludingDoor = Math.max(0, section.width - doorWidth);
  const hasDoor = section.doorType !== 'none' && doorWidth > 0.01;
  const horizontal2x2Runs = railCount + (section.pickets ? 1 : 0) + (section.kickPanel === 'insulated' ? 1 : 0);
  const interiorUprightCount = Math.max(0, section.uprights);
  const sideFrameIntersections = horizontal2x2Runs * 2;
  const interiorUprightIntersections = interiorUprightCount * (2 + horizontal2x2Runs);
  const doorJambIntersections = hasDoor ? 4 : 0;
  const doorMidRailIntersections = hasDoor && doorJambHeight < section.height - 0.05 ? 2 : 0;
  const doorLeafDividerIntersections = section.doorType === 'french' ? 1 : 0;
  const centeredWideDoorExtra = hasDoor && wallWidthExcludingDoor > 0.01 ? 0 : 0;
  return sideFrameIntersections + interiorUprightIntersections + doorJambIntersections + doorMidRailIntersections + doorLeafDividerIntersections + centeredWideDoorExtra;
}

function estimateScreenRoom(inputs: EstimateInputs, renaissance: boolean): EstimateResult {
  const sections = parseSections(inputs.sections, 3);
  const screenType = String(inputs.screenType ?? 'suntex-80');
  const screenColor = String(inputs.screenColor ?? 'black');
  const framingColor = String(inputs.framingColor ?? 'white');
  const panelColor = String(inputs.panelColor ?? 'white');
  const receiverSize = receiverSizeLabel(String(inputs.receiverSize ?? '5-8'));
  const materials: MaterialItem[] = [];

  let picketCount = 0;
  let picketStockLf = 0;
  let tekScrewCount = 0;
  let capriClips = 0;
  let bracketCount = 0;
  let panelSqFt = 0;
  let singleDoors = 0;
  let frenchDoors = 0;
  let inswingKits = 0;
  let astragals = 0;
  let woodScrews = 0;
  let concreteScrews = 0;
  let selfTappingScrews = 0;
  let flushMountScrews = 0;
  let trimCoilSqFt = 0;
  const singleDoorSizes: string[] = [];
  const frenchDoorSizes: string[] = [];
  const dogDoorGroups = {
    small: { count: 0, sizes: [] as string[] },
    medium: { count: 0, sizes: [] as string[] },
    large: { count: 0, sizes: [] as string[] },
  } as Record<'small' | 'medium' | 'large', { count: number; sizes: string[] }>;
  let receiverFastenerTubesLf = 0;
  let renaissanceReceiverLf = 0;
  const receiverCuts24: number[] = [];
  const oneByTwoCuts24: number[] = [];
  const twoByTwoCuts24: number[] = [];
  const uChannelCuts24: number[] = [];
  const vGroove1x2Cuts24: number[] = [];
  const vGroove2x2Cuts24: number[] = [];
  const insulatedReceiverCuts24: number[] = [];
  const oneByTwoCustom: number[] = [];
  const twoByTwoCustomGroove: number[] = [];
  const twoByTwoCustomNoGroove: number[] = [];
  const gableSections = parseGableSections(inputs.gableSections, 0);
  const gableReceiverCuts: number[] = [];
  const gableOneByTwoCuts: number[] = [];
  const gableUprightCuts: number[] = [];

  sections.forEach((section) => {
    const doorWidth = sectionDoorWidth(section);
    const doorHeight = sectionDoorHeight(section);
    const hasDoor = section.doorType !== 'none' && doorWidth > 0.01;
    const doorJambHeight = sectionDoorJambHeight(section);
    const spans = sectionSpansExcludingDoorCuts(section);
    const spanLengths = spans.map((span) => Math.max(0, span.end - span.start)).filter((len) => len > 0.05);
    const wallWidthExcludingDoor = spanLengths.reduce((sum, len) => sum + len, 0);
    const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);

    const topReceiverCut = section.width;
    const bottomReceiverCuts = spanLengths;
    const sideReceiverCuts = [section.height, section.height];
    const doorReceiverCuts = hasDoor ? [doorJambHeight, doorJambHeight, doorWidth] : [];
    const receiverCuts = [topReceiverCut, ...bottomReceiverCuts, ...sideReceiverCuts, ...doorReceiverCuts];
    const receiverPerimeter = receiverCuts.reduce((sum, len) => sum + len, 0);
    if (!renaissance) receiverCuts24.push(...receiverCuts);
    if (renaissance) renaissanceReceiverLf += receiverPerimeter;

    const floorMountedReceiverLf = bottomReceiverCuts.reduce((sum, len) => sum + len, 0);
    const wallMountedReceiverLf = sideReceiverCuts.reduce((sum, len) => sum + len, 0) + doorReceiverCuts.reduce((sum, len) => sum + len, 0) + topReceiverCut;
    if (section.floorMount === 'concrete') concreteScrews += masonryReceiverScrews(floorMountedReceiverLf);
    else if (section.floorMount === 'metal') selfTappingScrews += metalReceiverScrews(floorMountedReceiverLf);
    else woodScrews += Math.max(0, Math.ceil(floorMountedReceiverLf / 2.5));
    if (section.wallMount === 'concrete') concreteScrews += masonryReceiverScrews(wallMountedReceiverLf);
    else if (section.wallMount === 'metal') selfTappingScrews += metalReceiverScrews(wallMountedReceiverLf);
    else woodScrews += Math.max(0, Math.ceil(wallMountedReceiverLf / 2.5));

    const chairRailYs = sectionChairRailHeights(section);
    const chairRailClassUsesGroove = section.pickets || section.kickPanel === 'insulated';
    const chairRailCuts = chairRailYs.flatMap(() => spanLengths);
    const picketRailCuts = section.pickets ? spanLengths : [];
    const kickTopCuts = section.kickPanel !== 'none' ? spanLengths : [];
    const uprightCuts = sectionUprightPositionsForCuts(section).map(() => section.height);

    if (renaissance) {
      // Match the Renaissance layout exactly: 1x2 7/8 is the outer perimeter
      // (two sides, one top, and only bottom spans not occupied by a door).
      oneByTwoCustom.push(section.width, section.height, section.height, ...spanLengths);

      // Match visible 2x2 7/8 no-channel lines in the layout.
      twoByTwoCustomNoGroove.push(...uprightCuts);
      if (!chairRailClassUsesGroove) twoByTwoCustomNoGroove.push(...chairRailCuts);
      if (section.kickPanel !== 'none' && !chairRailClassUsesGroove) twoByTwoCustomNoGroove.push(...kickTopCuts);
      if (hasDoor) {
        twoByTwoCustomNoGroove.push(doorJambHeight, doorJambHeight, doorWidth);
        if (section.doorType === 'french') twoByTwoCustomNoGroove.push(doorHeight);
      }

      // Match visible 2x2 7/8 with-channel lines in the layout.
      if (chairRailClassUsesGroove) twoByTwoCustomGroove.push(...chairRailCuts);
      if (section.kickPanel !== 'none' && chairRailClassUsesGroove) twoByTwoCustomGroove.push(...kickTopCuts);
      twoByTwoCustomGroove.push(...picketRailCuts);
    } else {
      const perimeter1x2Cuts = [section.width, section.height, section.height, ...(section.kickPanel !== 'insulated' ? spanLengths : []), ...(hasDoor ? [doorJambHeight, doorJambHeight, doorWidth] : [])];
      oneByTwoCuts24.push(...perimeter1x2Cuts);
      twoByTwoCuts24.push(...uprightCuts, ...chairRailCuts, ...picketRailCuts);
      const clips = clipCountForSection(section, doorJambHeight);
      capriClips += clips;
      tekScrewCount += clips * 4;
    }

    const perimeter1x2Lf = (renaissance ? [section.width, section.height, section.height, ...spanLengths] : [section.width, section.height, section.height, ...spanLengths]).reduce((sum, len) => sum + len, 0);
    tekScrewCount += Math.ceil(perimeter1x2Lf / 2);

    if (section.pickets) {
      const sectionPickets = spanLengths.reduce((sum, len) => sum + Math.max(0, Math.ceil((len * 12) / 4)), 0);
      picketCount += sectionPickets;
      if (!renaissance) uChannelCuts24.push(...spanLengths, ...spanLengths);
      if (!renaissance) picketStockLf += sectionPickets * 3;
      tekScrewCount += sectionPickets * 2;
    }

    if (section.kickPanel === 'trim-coil' && !renaissance) {
      vGroove1x2Cuts24.push(...spanLengths);
      vGroove2x2Cuts24.push(...spanLengths);
      trimCoilSqFt += wallWidthExcludingDoor * kickHeight;
    }

    if (section.kickPanel === 'insulated') {
      panelSqFt += wallWidthExcludingDoor * kickHeight;
      insulatedReceiverCuts24.push(...spanLengths);
      if (!renaissance) twoByTwoCuts24.push(...spanLengths);
    }

    if (!renaissance && hasDoor) {
      const headerLf = doorWidth;
      twoByTwoCuts24.push(doorJambHeight, doorJambHeight, headerLf);
      if (section.doorType === 'french') twoByTwoCuts24.push(doorHeight);
    }

    if (section.doorType !== 'none') {
      const doorSize = `${feetAndInches(section.doorWidth)} x ${feetAndInches(sectionDoorHeight(section))}`;
      if (section.dogDoor !== 'none') {
        dogDoorGroups[section.dogDoor].count += 1;
        dogDoorGroups[section.dogDoor].sizes.push(doorSize);
      } else if (section.doorType === 'single') {
        singleDoors += 1;
        singleDoorSizes.push(doorSize);
      } else {
        frenchDoors += 1;
        frenchDoorSizes.push(doorSize);
      }
      if (section.doorSwing === 'inswing') inswingKits += 1;
      if (section.doorType === 'french') astragals += 1;
    }

    if (renaissance) {
      const clips = clipCountForSection(section, doorJambHeight);
      bracketCount += clips;
      flushMountScrews += clips * 4;
    }
  });

  const totalDoorArea = sections.reduce((sum, section) => sum + sectionDoorWidth(section) * sectionDoorHeight(section), 0);
  const dogDoorRows = (['small', 'medium', 'large'] as const).flatMap((size) => {
    const group = dogDoorGroups[size];
    if (!group.count) return [];
    const label = `${size[0].toUpperCase()}${size.slice(1)} dog door`;
    return [toMaterial(label, 'Doors', group.count, 'ea', group.sizes[0] || 'Per selected door', framingColor, group.sizes.join(', ') || undefined)];
  });
  const screenSf = Math.max(0, sections.reduce((sum, section) => sum + (section.width * section.height), 0) - panelSqFt - totalDoorArea);
  const screenRolls = Math.max(1, Math.ceil(screenSf / 1000));
  const spline = splineName(screenType);

  const gableCutsFromStyle = (gable: { width: number; height: number; style: string; uprights?: number }) => {
    const half = gable.width / 2;
    const rafter = Math.sqrt(half ** 2 + gable.height ** 2);
    const receiverPerimeterCuts = [half, rafter, half, rafter];
    const screenFrameCuts = [...receiverPerimeterCuts];
    const braceDiag = Math.sqrt((half * 0.42) ** 2 + (gable.height * 0.45) ** 2);
    switch (gable.style) {
      case 'king-post':
        screenFrameCuts.push(gable.height, gable.height);
        break;
      case 'tied-king-post':
        screenFrameCuts.push(braceDiag, braceDiag, braceDiag, braceDiag, gable.height * 0.55, gable.height * 0.55);
        break;
      case 'braced-king-post':
        screenFrameCuts.push(braceDiag, braceDiag, braceDiag, braceDiag, braceDiag, braceDiag, gable.height * 0.55, gable.height * 0.55);
        break;
      case 'queen-king-post':
        screenFrameCuts.push(gable.height, gable.height, half * 0.2, half * 0.2, half * 0.2, half * 0.2);
        break;
      case 'none':
      default:
        break;
    }
    const uprightCuts: number[] = [];
    const uprightScreenFrameCuts: number[] = [];
    const uprightCount = Math.max(0, Math.floor(gable.uprights ?? 0));
    for (let i = 1; i <= uprightCount; i += 1) {
      const x = (gable.width * i) / (uprightCount + 1);
      const localHeight = x <= half ? (gable.height * x) / half : (gable.height * (gable.width - x)) / half;
      if (localHeight > 0.05) {
        uprightCuts.push(localHeight);
        uprightScreenFrameCuts.push(localHeight, localHeight);
      }
    }
    screenFrameCuts.push(...uprightScreenFrameCuts);
    return { receiverPerimeterCuts, screenFrameCuts, uprightCuts };
  };

  gableSections.forEach((gable) => {
    if (gable.width <= 0 || gable.height <= 0) return;
    const { receiverPerimeterCuts, screenFrameCuts, uprightCuts } = gableCutsFromStyle(gable);
    const half = gable.width / 2;
    const rafter = Math.sqrt(half ** 2 + gable.height ** 2);
    const connectionCount = receiverPerimeterCuts.length + (screenFrameCuts.length - receiverPerimeterCuts.length) / 2 + uprightCuts.length;
    const addFasteners = (mount: string, lf: number) => {
      if (mount === 'concrete') concreteScrews += masonryReceiverScrews(lf);
      else if (mount === 'metal') selfTappingScrews += metalReceiverScrews(lf);
      else woodScrews += Math.max(0, Math.ceil(lf / 2.5));
    };
    addFasteners(gable.mountingSurface, gable.width);
    addFasteners(gable.sideMount, rafter * 2);
    const gableReceiverLf = receiverPerimeterCuts.reduce((sum, len) => sum + len, 0);
    if (renaissance) renaissanceReceiverLf += gableReceiverLf;
    if (renaissance) {
      gableOneByTwoCuts.push(...screenFrameCuts);
      gableUprightCuts.push(...uprightCuts);
      bracketCount += connectionCount;
      flushMountScrews += connectionCount * 4;
    } else {
      gableReceiverCuts.push(...receiverPerimeterCuts);
      gableOneByTwoCuts.push(...screenFrameCuts);
      gableUprightCuts.push(...uprightCuts);
      capriClips += connectionCount;
      tekScrewCount += connectionCount * 4;
    }
  });

  receiverFastenerTubesLf += renaissance ? renaissanceReceiverLf : totalCutLength([...receiverCuts24, ...gableReceiverCuts]);
  const sealantTubes = Math.max(1, Math.ceil(receiverFastenerTubesLf / 24));

  if (renaissance) {

    addCustomCutGroups(materials, '1x2 7/8', 'Frame', oneByTwoCustom, 'perimeter pieces');
    addCustomCutGroups(materials, '2x2 7/8 no-channel', 'Frame', twoByTwoCustomNoGroove, 'uprights, chair rail only, and door framing');
    addCustomCutGroups(materials, '2x2 7/8 with channel', 'Frame', twoByTwoCustomGroove, 'pickets and insulated kick panel');
    materials.push(
      toMaterial('Decorative brackets with caps', 'Hardware', bracketCount, 'ea', 'Bracket system', undefined, undefined),
      toMaterial('Flush mount screws', 'Hardware', flushMountScrews, 'ea', '4 per bracket', undefined, undefined),
      toMaterial('Pickets 36 in', 'Railing', picketCount, 'ea', 'Precut 36 in', undefined, undefined),
      toMaterial('Insulated panel sheets', 'Panel', Math.ceil(panelSqFt / 40), 'sheets', '4x10 sheets', panelColor, `${panelSqFt.toFixed(1)} sq ft total`),
      toMaterial(screenRollName(screenType), 'Screen', screenRolls, 'rolls', '10 ft x 100 ft', screenColor, `${screenSf.toFixed(1)} sq ft net screen`),
      toMaterial(spline, 'Screen', screenRolls, 'rolls', '1 per screen roll', 'black', undefined),
      toMaterial('NovaFlex', 'Hardware', sealantTubes, 'tubes', '1 tube per 24 lf of receiver', undefined, `${receiverFastenerTubesLf.toFixed(1)} lf receiver perimeter`),
      toMaterial('Single doors', 'Doors', singleDoors, 'ea', singleDoorSizes[0] || `Default ${feetAndInches(3)} x ${feetAndInches(6 + 8 / 12)}`, framingColor, singleDoorSizes.join(', ') || undefined),
      toMaterial('French doors', 'Doors', frenchDoors, 'sets', frenchDoorSizes[0] || `Double leaf · default ${feetAndInches(3)} x ${feetAndInches(6 + 8 / 12)}`, framingColor, frenchDoorSizes.map((size) => `opening ${size}`).join(', ') || undefined),
      ...dogDoorRows,
      toMaterial('Inswing kits', 'Doors', inswingKits, 'ea', 'Hydraulic jack kit', undefined, undefined),
      toMaterial('Astragals', 'Doors', astragals, 'ea', 'French door center', undefined, undefined),
      toMaterial('Concrete screws', 'Hardware', concreteScrews, 'ea', 'Approx. 1 every 2.5 ft of receiver on masonry', framingColor, undefined),
      toMaterial('Wood screws', 'Hardware', woodScrews, 'ea', 'Wood mounts', framingColor, undefined),
    );
  } else {
    add24FtStockFromCuts(materials, `${receiverSize} receiver`, 'Frame', [...receiverCuts24, ...insulatedReceiverCuts24], `includes extra receiver for insulated kick panel`);
    add24FtStockFromCuts(materials, '1x2', 'Frame', oneByTwoCuts24, 'perimeter inside receiver');
    add24FtStockFromCuts(materials, '2x2', 'Frame', twoByTwoCuts24, 'uprights, chair rail, kick-panel top, and door framing');
    add24FtStockFromCuts(materials, 'U-channel', 'Railing', uChannelCuts24, 'Top and bottom of picket runs');
    add24FtStockFromCuts(materials, '1x2 V-groove', 'Kick panel', vGroove1x2Cuts24, 'Trim coil kick panel only');
    add24FtStockFromCuts(materials, '2x2 V-groove', 'Kick panel', vGroove2x2Cuts24, 'Trim coil kick panel only');
    materials.push(
      toMaterial('Capri clips', 'Hardware', capriClips, 'ea', '50 per box', undefined, undefined),
      toMaterial('Tek screws', 'Hardware', tekScrewCount + selfTappingScrews, 'ea', 'Approx. every 2 ft + Capri clips + metal-mount screws', undefined, undefined),
      toMaterial('Pickets 36 in cut pieces', 'Railing', picketCount, 'ea', 'Field cut', undefined, undefined),
      toMaterial('24 ft picket stock', 'Railing', packStockCuts(Array.from({ length: picketCount }, () => 3)).length, 'sticks', '24 ft stock', undefined, `${picketStockLf.toFixed(1)} lf total picket stock`),
      toMaterial('Insulated panel sheets', 'Panel', Math.ceil(panelSqFt / 40), 'sheets', '4x10 sheets', panelColor, `${panelSqFt.toFixed(1)} sq ft total`),
      toMaterial(screenRollName(screenType), 'Screen', screenRolls, 'rolls', '10 ft x 100 ft', screenColor, `${screenSf.toFixed(1)} sq ft net screen`),
      toMaterial(spline, 'Screen', screenRolls, 'rolls', '1 per screen roll', 'black', undefined),
      toMaterial('NovaFlex', 'Hardware', sealantTubes, 'tubes', '1 tube per 24 ft receiver', undefined, `${receiverFastenerTubesLf.toFixed(1)} lf receiver perimeter`),
      toMaterial('Single doors', 'Doors', singleDoors, 'ea', singleDoorSizes[0] || `Default ${feetAndInches(3)} x ${feetAndInches(6 + 8 / 12)}`, framingColor, singleDoorSizes.join(', ') || undefined),
      toMaterial('French doors', 'Doors', frenchDoors, 'sets', frenchDoorSizes[0] || `Double leaf · default ${feetAndInches(3)} x ${feetAndInches(6 + 8 / 12)}`, framingColor, frenchDoorSizes.map((size) => `opening ${size}`).join(', ') || undefined),
      ...dogDoorRows,
      toMaterial('Inswing kits', 'Doors', inswingKits, 'ea', 'Hydraulic jack kit', undefined, undefined),
      toMaterial('Astragals', 'Doors', astragals, 'ea', 'French door center', undefined, undefined),
      ...(trimCoilSqFt > 0 ? [toMaterial('Trim coil', 'Kick panel', Math.ceil(trimCoilSqFt), 'sq ft', 'Field cut coil stock', panelColor, `${trimCoilSqFt.toFixed(1)} sq ft total`)] : []),
      toMaterial('Concrete screws', 'Hardware', concreteScrews, 'ea', 'Approx. 1 every 2.5 ft of receiver on masonry', framingColor, undefined),
      toMaterial('Wood screws', 'Hardware', woodScrews, 'ea', 'Wood mounts', framingColor, undefined),
    );
  }

  const assignColor = (item: MaterialItem, names: string[], color: string) => {
    if (names.some((name) => item.name.toLowerCase().includes(name))) item.color = color;
  };

  if (gableSections.length) {
    if (renaissance) {
      addCustomCutGroups(materials, 'Gable 1x2 7/8', 'Gable', gableOneByTwoCuts, 'gable screen framing around wood members');
      addCustomCutGroups(materials, 'Gable 2x2 7/8', 'Gable', gableUprightCuts, 'gable uprights');
    } else {
      add24FtStockFromCuts(materials, `${receiverSize} gable receiver`, 'Gable', gableReceiverCuts, 'gable screen framing receiver');
      add24FtStockFromCuts(materials, 'Gable 1x2', 'Gable', gableOneByTwoCuts, 'gable screen framing 1x2');
      add24FtStockFromCuts(materials, 'Gable 2x2 uprights', 'Gable', gableUprightCuts, 'gable uprights');
    }
  }


  materials.forEach((item) => {
    if (!item.color) item.color = framingColor;
    assignColor(item, ['receiver', '1x2', '2x2', 'gable receiver', 'gable 1x2', 'gable 2x2', 'u-channel', 'capri', 'tek screw', 'flush mount screw', 'decorative bracket', 'wood screw', 'concrete screw', 'single door', 'french door', 'astragal', 'dog door'], framingColor);
    assignColor(item, ['insulated panel sheets', 'trim coil'], panelColor);
    assignColor(item, ['screen roll'], screenColor);
    assignColor(item, ['spline'], 'black');
  });
  return {
    summary: [
      { label: 'Sections', value: `${sections.length}` },
      { label: 'Screen area', value: `${screenSf.toFixed(1)} sq ft` },
      { label: 'Doors', value: `${singleDoors} single · ${frenchDoors} french` },
      { label: 'Mounting mix', value: `${sections.filter((s) => s.floorMount === 'concrete').length} concrete floor · ${sections.filter((s) => s.wallMount === 'concrete').length} masonry walls` },
      ...(gableSections.length ? [{ label: 'Gables', value: `${gableSections.length} section(s)` }] : []),
    ],
    materials: consolidateMaterials(materials).filter((item) => item.quantity > 0),
    orderNotes: [
      renaissance ? 'Renaissance output is cut-list driven: 1x2 7/8 and 2x2 7/8 members are grouped by exact required length.' : 'Standard screen output groups framing into 24 ft stock so it matches field ordering.',
      'Door openings subtract infill across the opening, then add receiver, 1x2, and jamb/header framing back in around the door opening.',
      'New sections inherit the first section so repeated bays are faster to build out, but every section stays editable.',
    ],
  };
}


function estimateSunroom(inputs: EstimateInputs): EstimateResult {
  const system = String(inputs.roomSystem ?? '3-thermal');
  const isThreeIn = system === '3-thermal';
  const buildMode = String(inputs.buildMode ?? 'existing-structure');
  const framingColor = String(inputs.framingColor ?? inputs.roomColor ?? 'white');
  const panelColor = String(inputs.panelColor ?? framingColor);
  const windowColor = String(inputs.windowColor ?? framingColor);
  const sections = parseSunroomSections(inputs.sunroomSections, 3);
  const frontWidth = sections.reduce((sum, section) => sum + section.width, 0);
  const roomHeight = Math.max(...sections.map((section) => section.height), 0);
  const extrusionName = (three: string, two: string) => isThreeIn ? three : two;
  const materials: MaterialItem[] = [];
  const cutGroups = {
    base: [] as number[],
    receiver: [] as number[],
    topCap: [] as number[],
    hBeam: [] as number[],
    drc: [] as number[],
    chase: [] as number[],
    wallPanelArea: 0,
  };
  let doorSingles = 0;
  let doorSliders = 0;
  let sealantLf = 0;
  const fastenerLf: Record<'wood' | 'metal' | 'concrete', number> = { wood: 0, metal: 0, concrete: 0 };

  const isWindowZone = (kind: string) => kind === 'horizontal-sliders' || kind === 'picture-window' || kind === 'window';
  const doorWidthFeet = (section: typeof sections[number]) => Math.min(section.doorType === 'slider' ? 6 : section.doorType === 'single' ? 3 : 0, section.width);
  const doorOffsetFeet = (section: typeof sections[number]) => {
    const doorWidth = doorWidthFeet(section);
    const maxOffset = Math.max(0, section.width - doorWidth);
    if (section.doorType === 'none') return 0;
    if (section.doorPlacement === 'left') return 0;
    if (section.doorPlacement === 'right') return maxOffset;
    if (section.doorPlacement === 'custom') return Math.max(0, Math.min(maxOffset, Number(section.doorOffsetInches || 0) / 12));
    return maxOffset / 2;
  };
  const horizontalSpansExcludingDoor = (section: typeof sections[number]) => {
    const doorWidth = doorWidthFeet(section);
    if (section.doorType === 'none' || doorWidth <= 0) return [{ start: 0, end: section.width }];
    const doorLeft = doorOffsetFeet(section);
    const doorRight = doorLeft + doorWidth;
    return [
      ...(doorLeft > 0.01 ? [{ start: 0, end: doorLeft }] : []),
      ...(doorRight < section.width - 0.01 ? [{ start: doorRight, end: section.width }] : []),
    ];
  };
  const horizontalVisibleWidths = (section: typeof sections[number]) => horizontalSpansExcludingDoor(section)
    .map((span) => normalizeCutLength(span.end - span.start))
    .filter((length) => length > 0.01);
  const uprightOffsetsExcludingDoor = (section: typeof sections[number]) => {
    const spans = horizontalSpansExcludingDoor(section).filter((span) => span.end - span.start > 0.05);
    const total = Math.max(0, Math.floor(Number(section.uprights || 0)));
    if (total === 0 || spans.length === 0) return [] as number[];
    const totalWidth = spans.reduce((sum, span) => sum + (span.end - span.start), 0);
    const allocations = spans.map((span) => {
      const exact = totalWidth > 0 ? total * (span.end - span.start) / totalWidth : 0;
      return { span, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let remaining = total - allocations.reduce((sum, item) => sum + item.count, 0);
    allocations.sort((a, b) => b.remainder - a.remainder || (b.span.end - b.span.start) - (a.span.end - a.span.start));
    for (const item of allocations) {
      if (remaining <= 0) break;
      item.count += 1;
      remaining -= 1;
    }
    allocations.sort((a, b) => a.span.start - b.span.start);
    return allocations.flatMap(({ span, count }) => Array.from({ length: count }, (_, idx) => span.start + ((idx + 1) * (span.end - span.start)) / (count + 1)));
  };
  const addVisibleHorizontal = (target: number[], section: typeof sections[number], piecesPerSpan = 1) => {
    horizontalVisibleWidths(section).forEach((width) => {
      for (let index = 0; index < piecesPerSpan; index += 1) target.push(width);
    });
  };
  const addFasteners = (surface: 'wood' | 'metal' | 'concrete', length: number) => {
    if (length > 0) fastenerLf[surface] += length;
  };

  sections.forEach((section) => {
    const doorWidth = doorWidthFeet(section);
    const usableWidth = Math.max(0, section.width - doorWidth);
    const doorOffset = doorOffsetFeet(section);
    const touchesLeft = section.doorType !== 'none' && doorOffset <= 0.01;
    const touchesRight = section.doorType !== 'none' && doorOffset + doorWidth >= section.width - 0.01;
    const transomNeeded = section.transomType === 'panel' || section.transomType === 'picture-window' || (section.transomType === 'auto' && section.height > 10 && section.mainSection !== 'picture-window');
    const transomMaxHeight = transomNeeded ? Math.max(section.leftTransomHeight, section.rightTransomHeight) : 0;
    const transomFillHeight = transomNeeded ? (section.leftTransomHeight + section.rightTransomHeight) / 2 : 0;
    const kickHeight = Math.max(0, Math.min(section.kickHeight, 4));
    const mainHeight = Math.max(0, section.height - kickHeight - transomMaxHeight);
    const uprightHeight = section.uprightMode === 'main-only'
      ? mainHeight
      : section.uprightMode === 'main-kick'
        ? mainHeight + kickHeight
        : section.uprightMode === 'main-transom'
          ? mainHeight + transomMaxHeight
          : section.height;

    // Layout-matched perimeter pieces. These are the always-visible red and
    // purple vertical lines drawn at the outside of every section.
    cutGroups.base.push(section.width);
    cutGroups.topCap.push(section.width);
    cutGroups.receiver.push(section.height, section.height);
    cutGroups.drc.push(section.height, section.height);

    // Layout top receiver: red line across the top whenever the section has a
    // window zone or transom. It is a full-width piece, even when a door is at an edge.
    if (section.mainSection !== 'panel' || transomNeeded) {
      cutGroups.receiver.push(section.width);
    }

    // Upright H-beams and their DRC are placed only in the remaining opening
    // space after subtracting the door, using the same allocation as the layout.
    uprightOffsetsExcludingDoor(section).forEach(() => {
      if (uprightHeight > 0) {
        cutGroups.hBeam.push(uprightHeight);
        cutGroups.drc.push(uprightHeight, uprightHeight);
        if (section.electricChase) cutGroups.chase.push(uprightHeight);
      }
    });

    // If uprights do not run into the kick/transom, the layout still shows a
    // support H-beam across each visible non-door span.
    if (section.kickSection !== 'none' && (section.uprightMode === 'main-only' || section.uprightMode === 'main-transom')) {
      addVisibleHorizontal(cutGroups.hBeam, section);
    }
    if (transomNeeded && (section.uprightMode === 'main-only' || section.uprightMode === 'main-kick')) {
      addVisibleHorizontal(cutGroups.hBeam, section);
    }

    // Main/kick horizontal break. Count the exact red/purple line types the
    // layout draws, but as actual non-door cut pieces instead of a single gross width.
    if (section.kickSection !== 'none') {
      const kickWindow = isWindowZone(section.kickSection);
      const mainWindow = isWindowZone(section.mainSection);
      if (kickWindow && mainWindow) {
        addVisibleHorizontal(cutGroups.hBeam, section);
        addVisibleHorizontal(cutGroups.drc, section, 2);
        addVisibleHorizontal(cutGroups.receiver, section); // bottom receiver for window kick zone
      } else if (kickWindow && !mainWindow) {
        addVisibleHorizontal(cutGroups.hBeam, section);
        addVisibleHorizontal(cutGroups.drc, section); // DRC fits into the H-beam on the kick-window side
        addVisibleHorizontal(cutGroups.receiver, section); // bottom receiver for the kick window/base side
      } else if (!kickWindow && mainWindow) {
        addVisibleHorizontal(cutGroups.hBeam, section);
        addVisibleHorizontal(cutGroups.drc, section); // DRC fits into the H-beam; receiver does not
      } else {
        addVisibleHorizontal(cutGroups.hBeam, section);
      }
    }

    // Transom horizontal break. Same rule as the layout: window-to-window gets
    // DRC on both sides; window-to-panel gets receiver on the window side.
    if (transomNeeded) {
      const mainWindow = isWindowZone(section.mainSection);
      const transomWindow = isWindowZone(section.transomType);
      if (mainWindow && transomWindow) {
        addVisibleHorizontal(cutGroups.hBeam, section);
        addVisibleHorizontal(cutGroups.drc, section, 2);
      } else if ((mainWindow && !transomWindow) || (!mainWindow && transomWindow)) {
        addVisibleHorizontal(cutGroups.hBeam, section);
        addVisibleHorizontal(cutGroups.drc, section); // DRC fits into the H-beam between transom/main zones
      } else {
        addVisibleHorizontal(cutGroups.hBeam, section);
      }
    }

    // Infill material is based on the same visible non-door spans used above.
    if (section.mainSection === 'panel' && buildMode !== 'existing-structure') {
      cutGroups.wallPanelArea += usableWidth * mainHeight;
    }
    if (section.kickSection === 'panel' || section.kickSection === 'insulated') {
      cutGroups.wallPanelArea += usableWidth * kickHeight;
    }
    if (transomNeeded && section.transomType !== 'picture-window') {
      cutGroups.wallPanelArea += usableWidth * transomFillHeight;
    }

    if (section.doorType !== 'none') {
      const doorHeight = 6 + 8 / 12;
      const aboveDoorHeight = Math.max(0, section.height - doorHeight);
      // Door jamb H-beams run full section height so they tie into the top cap.
      if (!touchesLeft) cutGroups.hBeam.push(section.height);
      if (!touchesRight) cutGroups.hBeam.push(section.height);
      cutGroups.hBeam.push(doorWidth);
      // Purple DRC shown at the door jambs/header. Edge-mounted doors reuse the
      // already-counted edge DRC and receiver on the side touching the opening edge.
      cutGroups.drc.push(doorWidth, doorWidth);
      if (!touchesLeft) cutGroups.drc.push(section.height, section.height);
      if (!touchesRight) cutGroups.drc.push(section.height, section.height);
      if (aboveDoorHeight > 0) {
        if (section.doorAboveSection === 'window') cutGroups.receiver.push(doorWidth);
        if (section.doorAboveSection === 'panel') cutGroups.wallPanelArea += doorWidth * aboveDoorHeight;
      }
      if (section.doorType === 'single') doorSingles += 1; else doorSliders += 1;
    }

    sealantLf += section.width * 2 + section.height * 2;
    addFasteners(section.bottomAttach, section.width);
    addFasteners(section.topAttach, section.width);
    addFasteners(section.leftAttach, section.height);
    addFasteners(section.rightAttach, section.height);
  });

  const add24 = (name: string, category: string, lengths: number[], notes?: string) => {
    add24FtStockFromCuts(materials, name, category, lengths, notes);
  };
  add24(extrusionName('Base channel with weep', 'Cabana base / base channel'), 'Sunroom frame', cutGroups.base, 'perimeter base');
  add24(extrusionName('Receiving channel', 'Receiving channel'), 'Sunroom frame', cutGroups.receiver, 'red layout lines counted as individual full-height edge pieces and visible horizontal pieces');
  add24(extrusionName('Top cap, flat', 'Top cap'), 'Sunroom frame', cutGroups.topCap, 'perimeter cap');
  add24(extrusionName('H-beam', 'H-beam'), 'Sunroom frame', cutGroups.hBeam, 'uprights and horizontal dividers');
  add24(extrusionName('DRC', 'DRC'), 'Sunroom frame', cutGroups.drc, 'purple layout lines counted as individual edge, upright, divider, and door pieces');
  if (cutGroups.chase.length) add24(extrusionName('Channel with chase & snap', 'Channel with chase'), 'Sunroom frame', cutGroups.chase, 'electric chase enabled in selected sections');
  if (buildMode === 'new-structure') materials.push(toMaterial(extrusionName('Corner post', 'Corner post'), 'Sunroom frame', 2, 'ea', isThreeIn ? '8 ft or 25 ft stock' : '8 ft or 24 ft stock', framingColor, 'Only for build-from-scratch corners'));
  if (cutGroups.wallPanelArea > 0) materials.push(toMaterial('Wall panel stock', 'Sunroom panels', Math.ceil(cutGroups.wallPanelArea / 40), 'panels', isThreeIn ? '4x10 panel stock' : 'Cut from 24 ft stock', panelColor, `${cutGroups.wallPanelArea.toFixed(1)} sq ft panel fill`));
  if (doorSingles) materials.push(toMaterial('Prime glass door 3 ft x 6 ft 8 in', 'Doors', doorSingles, 'ea', 'Standard unit', undefined, undefined));
  if (doorSliders) materials.push(toMaterial('Prime glass door 6 ft x 6 ft 8 in', 'Doors', doorSliders, 'ea', 'Standard unit', undefined, undefined));
  materials.push(toMaterial('Novaflex caulking', 'Sealants', Math.max(1, Math.ceil(sealantLf / 10)), 'tubes', '1 tube per 10 lf perimeter', framingColor, `${sealantLf.toFixed(1)} lf opening / section perimeter`));
  if (fastenerLf.wood > 0) materials.push(toMaterial('1 1/8 in wood screws', 'Hardware', Math.ceil(fastenerLf.wood / 2.5), 'ea', 'Fasteners every 2.5 ft', undefined, `${fastenerLf.wood.toFixed(1)} lf attaching to wood`));
  if (fastenerLf.metal > 0) materials.push(toMaterial('3/4 in tek screws', 'Hardware', Math.ceil(fastenerLf.metal / 2.5), 'ea', 'Fasteners every 2.5 ft', undefined, `${fastenerLf.metal.toFixed(1)} lf attaching to metal`));
  if (fastenerLf.concrete > 0) materials.push(toMaterial('1 1/2 in Tapcon screws', 'Hardware', Math.ceil(fastenerLf.concrete / 2.5), 'ea', 'Fasteners every 2.5 ft', undefined, `${fastenerLf.concrete.toFixed(1)} lf attaching to concrete`));

  materials.forEach((item) => {
    const lower = item.name.toLowerCase();
    if (lower.includes('receiving channel') || lower.includes('drc')) item.color = windowColor;
    else if (lower.includes('wall panel stock')) item.color = panelColor;
    else if (lower.includes('base channel') || lower.includes('top cap') || lower.includes('h-beam') || lower.includes('corner post') || lower.includes('channel with chase')) item.color = framingColor;
  });

  return {
    summary: [
      { label: 'System', value: isThreeIn ? '3 in thermally broken' : '2 in non-thermal' },
      { label: 'Sections', value: `${sections.length} front sections · ${frontWidth.toFixed(1)} lf` },
      { label: 'Room height', value: feetAndInches(roomHeight) },
      { label: 'Structure', value: buildMode === 'existing-structure' ? 'Existing structure' : 'Build from scratch' },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      buildMode === 'existing-structure' ? 'Existing-structure mode avoids unnecessary corner-post assumptions.' : 'Build-from-scratch mode adds corner-post assumptions.',
      'Sunroom receiving channel and DRC are now taken from the same red/purple section pieces used in the layout and packed as individual 24 ft stock cuts.',
      'Door openings subtract horizontal pieces through the door width, while top receivers and side edge receiver/DRC remain full pieces where the layout shows them.',
    ],
  };
}



function parseWoodShape(raw: string | number | boolean | undefined, width: number, projection: number) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed as { x: number; y: number }[];
    } catch {}
  }
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: projection },
    { x: 0, y: projection },
  ];
}

function parseWoodObstructions(raw: string | number | boolean | undefined) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as { id?: string; type?: string; x: number; y: number; width: number; height: number; label?: string }[];
    } catch {}
  }
  return [] as { id?: string; type?: string; x: number; y: number; width: number; height: number; label?: string }[];
}

function parseWoodHouseSides(raw: string | number | boolean | undefined) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    } catch {}
  }
  return { '0': true } as Record<string, boolean>;
}

function estimateWoodenStructure(inputs: EstimateInputs): EstimateResult {
  const width = Math.max(1, Number(inputs.width ?? 16));
  const projection = Math.max(1, Number(inputs.projection ?? 12));
  const structureType = String(inputs.structureType ?? 'attached');
  const roofType = String(inputs.roofType ?? 'gable');
  const pitch = Math.max(0.25, Number(inputs.roofPitch ?? 4));
  const spacingIn = Math.max(12, Number(inputs.joistSpacing ?? 16));
  const spacingFt = spacingIn / 12;
  const eaveOverhang = Math.max(0, Number(inputs.eaveOverhang ?? 1));
  const gableOverhang = Math.max(0, Number(inputs.gableOverhang ?? 1));
  const supportLayout = String(inputs.supportLayout ?? 'auto-front-beam');
  const attachedCondition = String(inputs.attachedCondition ?? 'ledger-to-existing-wall');
  const overallHeight = Math.max(1, Number(inputs.overallHeight ?? 9));
  const shape = parseWoodShape(inputs.woodenShape, width, projection);
  const obstructions = parseWoodObstructions(inputs.woodenObstructions);
  const houseSides = parseWoodHouseSides(inputs.woodenHouseSides);
  const xs = shape.map((point) => point.x);
  const ys = shape.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bboxWidth = Math.max(1, maxX - minX);
  const bboxDepth = Math.max(1, maxY - minY);
  const planArea = Math.abs(shape.reduce((sum, current, index) => {
    const next = shape[(index + 1) % shape.length];
    return sum + (current.x * next.y - next.x * current.y);
  }, 0) / 2);
  const roofArea = (planArea + obstructions.filter((item) => item.type === 'bump-out').reduce((sum, item) => sum + item.width * item.height, 0)) - obstructions.filter((item) => item.type === 'cutout').reduce((sum, item) => sum + item.width * item.height, 0);
  const planWidth = bboxWidth + gableOverhang * 2;
  const planDepth = bboxDepth + eaveOverhang;
  const edges = shape.map((point, index) => {
    const next = shape[(index + 1) % shape.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    return { index, point, next, dx, dy, length: Math.hypot(dx, dy), house: !!houseSides[String(index)] };
  });
  const houseEdges = edges.filter((edge) => edge.house);
  const mainHouseEdge = houseEdges[0] || edges[0];
  const attachmentAxis: 'horizontal' | 'vertical' = Math.abs(mainHouseEdge.dy) <= Math.abs(mainHouseEdge.dx) ? 'horizontal' : 'vertical';
  const mainSideName = attachmentAxis === 'horizontal'
    ? ((mainHouseEdge.point.y + mainHouseEdge.next.y) / 2 <= minY + bboxDepth / 2 ? 'top' : 'bottom')
    : ((mainHouseEdge.point.x + mainHouseEdge.next.x) / 2 <= minX + bboxWidth / 2 ? 'left' : 'right');
  const mainHouseLength = mainHouseEdge.length || (attachmentAxis === 'horizontal' ? bboxWidth : bboxDepth);
  const primarySpan = roofType === 'gable' ? (attachmentAxis === 'horizontal' ? bboxWidth / 2 : bboxDepth / 2) : (attachmentAxis === 'horizontal' ? bboxDepth : bboxWidth);
  const conservativeMaxSpan = spacingIn >= 24 ? 11 : spacingIn >= 16 ? 13.5 : 15.5;
  const extraSupportLines = Math.max(0, Math.ceil(primarySpan / conservativeMaxSpan) - 1);
  const roofRise = (pitch / 12) * primarySpan;
  const slopedMemberLength = Math.sqrt(primarySpan * primarySpan + roofRise * roofRise) + (roofType === 'gable' ? eaveOverhang : 0);
  const memberRun = roofType === 'gable' ? (attachmentAxis === 'horizontal' ? bboxDepth : bboxWidth) : (attachmentAxis === 'horizontal' ? bboxWidth : bboxDepth);
  const memberCount = Math.ceil(memberRun / spacingFt) + 1;
  const postCount = supportLayout === 'bearing-walls' ? 0 : Math.max(2, Number(inputs.postCount ?? 3) || Math.max(2, Math.ceil(bboxWidth / 8) + 1));
  const beamLines = supportLayout === 'bearing-walls' ? 0 : 1;
  const irregularCount = obstructions.length + Math.max(0, houseEdges.length - 1);
  const materials: MaterialItem[] = [];

  if (roofType === 'gable') {
    materials.push(toMaterial('Common rafters', 'Wood framing', memberCount * 2, 'ea', `${feetAndInches(slopedMemberLength)} conceptual cuts`, undefined, `${spacingIn} in O.C.; ridge direction follows selected house wall logic; final sizing and birdsmouth details by engineer`));
    materials.push(toMaterial('Ridge board / ridge beam', 'Wood framing', Math.max(1, Math.ceil((attachmentAxis === 'horizontal' ? bboxDepth : bboxWidth) / 16)), 'sticks', '16 ft stock assumption', undefined, `Ridge runs perpendicular to selected house wall (${mainSideName}); engineer to verify ridge board vs structural ridge beam`));
    materials.push(toMaterial('Gable end outlookers / rake framing', 'Wood framing', Math.max(4, Math.ceil((attachmentAxis === 'horizontal' ? bboxWidth : bboxDepth) / 2) * 2), 'ea', 'Field cut', undefined, `${feetAndInches(gableOverhang)} side overhang assumption`));
  } else {
    materials.push(toMaterial('Flat roof joists', 'Wood framing', memberCount, 'ea', `${feetAndInches(primarySpan + eaveOverhang)} conceptual cuts`, undefined, `${spacingIn} in O.C.; slope direction shown on plan; final size by engineer/span table`));
    materials.push(toMaterial('Slope sleepers / tapered drainage build-up', 'Wood framing', Math.max(1, Math.ceil(memberRun / 8)), 'runs', 'Field verify', undefined, `Drainage slope concept based on ${pitch}:12 input`));
  }

  if (structureType === 'attached') {
    materials.push(toMaterial(attachedCondition === 'tie-into-roof' ? 'Existing roof tie-in / header line' : 'Ledger / attachment line', 'Load path', 1, 'line', feetAndInches(mainHouseLength), undefined, attachedCondition === 'tie-into-roof' ? 'Tie-in flashing, load path, and existing roof framing must be reviewed by engineer' : `Attachment follows selected house wall side(s); ledger fastener schedule, flashing, and lateral restraint by engineer`));
  }
  if (beamLines > 0) {
    materials.push(toMaterial('Primary support beam line', 'Load path', beamLines, 'line', feetAndInches(mainHouseLength), undefined, supportLayout === 'known-posts' ? 'Post locations shown as field-known; engineer to verify spans and tributary loading' : 'Auto support beam line shown opposite selected house/reference side'));
    if (extraSupportLines > 0) {
      materials.push(toMaterial('Intermediate support beam line', 'Load path', extraSupportLines, 'line', 'Added for conservative span review', undefined, 'Concept span exceeds simplified prescriptive placeholder; final beam/post/member sizing by engineer'));
    }
    materials.push(toMaterial('Posts', 'Load path', postCount + extraSupportLines * Math.max(2, Math.ceil((attachmentAxis === 'horizontal' ? bboxDepth : bboxWidth) / 8) + 1), 'ea', `${feetAndInches(overallHeight)} max height input`, undefined, 'Post size, base, uplift, lateral bracing, and footing by engineer'));
    materials.push(toMaterial('Post bases / anchors', 'Connections', postCount, 'ea', 'Engineer-selected hardware', undefined, 'Footing and anchor type depend on site conditions'));
    materials.push(toMaterial('Beam-to-post connectors', 'Connections', postCount, 'ea', 'Engineer-selected hardware', undefined, 'Uplift and lateral connection to be specified'));
  }
  if (irregularCount > 0) {
    materials.push(toMaterial('Framing transitions around jogs / offsets / roofline conflicts', 'Engineer review', irregularCount, 'areas', 'Field framed per stamped plan', undefined, 'Each marked irregular area should be reviewed for headers, collectors, and load transfer'));
  }
  materials.push(toMaterial('Rafter / joist hangers or hurricane ties', 'Connections', memberCount * (structureType === 'attached' ? 1 : 2), 'ea', 'Engineer-selected hardware', undefined, 'Connector schedule must follow engineered uplift/load path'));
  materials.push(toMaterial('Roof sheathing area', 'Roof system', Math.max(1, Math.ceil((planWidth * planDepth) / 32)), 'sheets', '4x8 sheets', undefined, `${roofArea.toFixed(1)} sf footprint before waste; verify around irregular areas`));
  materials.push(toMaterial('Engineer review item', 'Engineering notes', 1, 'package', 'Required before permit/stamp', undefined, 'Verify spans, member sizes, uplift, lateral bracing, footings, attachments, drainage, and irregular existing conditions'));

  const missing: string[] = [];
  if (!String(inputs.existingConditionNotes ?? '').trim() && structureType === 'attached') missing.push('existing wall/roof framing condition notes');
  if (!String(inputs.obstructionNotes ?? '').trim() && obstructions.length === 0) missing.push('jogs/bump-outs/chimneys/offset confirmation');
  if (supportLayout === 'known-posts') missing.push('dimensioned post locations');

  const obstructionSummary = obstructions.length
    ? obstructions.map((item) => `${item.label || item.type} (${feetAndInches(item.width)} × ${feetAndInches(item.height)})`).join(', ')
    : 'none marked in footprint editor';

  return {
    summary: [
      { label: 'Roof mode', value: roofType === 'gable' ? 'Gable framing' : 'Flat roof framing' },
      { label: 'Footprint', value: `${feetAndInches(bboxWidth)} × ${feetAndInches(bboxDepth)}` },
      { label: 'Pitch / slope', value: `${pitch}:12` },
      { label: 'Framing spacing', value: `${spacingIn} in O.C.` },
      { label: 'IRC baseline', value: '2024 IRC concept' },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      'Project assumptions: concept uses the 2024 IRC as the baseline prescriptive reference unless a local jurisdiction or project-specific requirement supersedes it.',
      `Input summary: ${structureType} ${roofType} roof, ${feetAndInches(width)} overall width by ${feetAndInches(projection)} projection, ${pitch}:12 pitch/slope, ${spacingIn} in O.C. framing, selected house/reference side ${mainSideName}.`,
      roofType === 'gable'
        ? `Framing layout concept: ridge runs perpendicular to selected house wall (${mainSideName}), rafters bear to the ridge and outer support lines, and any jogs/bump-outs/offsets are controlled by the point-to-point footprint.`
        : `Framing layout concept: joists run based on selected house/reference side (${mainSideName}) with slope/drainage direction called out, and support beam/bearing logic is shown opposite the high side.`,
      `Engineer review notes: marked irregular areas include ${obstructionSummary}. Verify member sizes, headers/collectors, connections, fasteners, footings, uplift, lateral bracing, roof diaphragm, and existing structure attachment before stamp.`,
      `Missing information needed for final engineer-ready completion: ${missing.length ? missing.join(', ') : 'none noted from current inputs; field verification still required'}.`,
    ],
  };
}

function estimatePatioCover(inputs: EstimateInputs): EstimateResult {
  const width = Number(inputs.width ?? 21);
  const projection = Number(inputs.projection ?? 10);
  const attachmentHeight = Number(inputs.attachmentHeight ?? 9);
  const lowSideHeight = Number(inputs.lowSideHeight ?? 8.25);
  const structureType = String(inputs.structureType ?? 'attached');
  const panelWidth = Number(inputs.panelWidth ?? 4);
  const panelThickness = Number(inputs.panelThickness ?? 3);
  const metalGauge = String(inputs.metalGauge ?? '.26');
  const foamDensity = Number(inputs.foamDensity ?? 1);
  const framingColor = String(inputs.framingColor ?? 'white');
  const panelColor = String(inputs.panelColor ?? 'white');
  const fanBeamCount = Math.max(0, Number(inputs.fanBeamCount ?? 0));
  const postAttachmentPoint = String(inputs.postAttachmentPoint ?? 'concrete');
  const houseAttachmentMaterial = String(inputs.houseAttachmentMaterial ?? 'wood-fascia');
  const screenUnderneath = Boolean(inputs.screenUnderneath ?? false);
  const beamStyle = screenUnderneath ? '3x3' : 'atlas';
  const projectionOverhang = Math.max(0, Math.min(2, Number(inputs.projectionOverhang ?? 2)));
  const effectiveProjection = Math.max(0, projection - projectionOverhang);
  const slopeDrop = Math.max(attachmentHeight - lowSideHeight, projection * (0.5 / 12));

  let maxProjection = 15;
  if (panelThickness === 3 && metalGauge === '.32' && foamDensity === 2) maxProjection = 19;
  if (panelThickness === 6 && metalGauge === '.32' && foamDensity === 2) maxProjection = 26;
  const overLimit = effectiveProjection > maxProjection;
  const standard3In = panelThickness === 3 && !(metalGauge === '.32' && foamDensity === 2);
  const extraBeams = Math.max(0, Number(inputs.extraBeamCount ?? 0));
  const supportBeamCount = (standard3In && effectiveProjection > 13 ? Math.ceil(effectiveProjection / 13) - 1 : 0) + extraBeams;

  const panelLayout = buildPatioPanelLayout(width, panelWidth, fanBeamCount, String(inputs.fanBeamSelections ?? ''));
  const panelCount = panelLayout.pieces.length;
  const panelLength = Math.ceil(projection);
  const regular4Count = panelLayout.pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 4).length;
  const regular2Count = panelLayout.pieces.filter((piece) => piece.kind === 'regular' && piece.panelWidth === 2).length;
  const cutPanels = panelLayout.pieces.filter((piece) => piece.kind === 'cut');
  const fanPanels = panelLayout.pieces.filter((piece) => piece.kind === 'fan-beam');
  const autoPostCount = (() => {
    if (beamStyle === 'atlas') {
      if (width <= 16) return 2;
      if (width <= 24) return 3;
      return Math.max(4, Math.ceil((width - 2) / 8));
    }
    if (width <= 12) return 2;
    if (width <= 18) return 3;
    if (width <= 24) return 4;
    return Math.max(4, Math.ceil((width - 2) / 6));
  })();
  const frontPostCount = Math.max(2, Number(inputs.postCount ?? 0) > 0 ? Number(inputs.postCount) : autoPostCount);
  const supportPostCount = supportBeamCount > 0 ? Math.max(2, Number(inputs.supportBeamPostCount ?? 0) > 0 ? Number(inputs.supportBeamPostCount) : frontPostCount) : 0;
  const hiddenBracketPerPost = beamStyle === '3x3' ? 2 : 1;
  const totalSupportPosts = supportBeamCount * supportPostCount;
  const hiddenBracketCount = (frontPostCount + totalSupportPosts) * hiddenBracketPerPost;
  const totalBeamLines = 1 + supportBeamCount;
  const washerScrews = panelCount * totalBeamLines * 5;
  const tekScrewLf = width + (projection * 2) + (structureType === 'attached' ? width : 0);
  const tekScrews = Math.ceil((tekScrewLf * 12) / 6);
  const cChannelFasteners = structureType === 'attached' ? Math.ceil((width * 12) / 8) : 0;
  const panelSeams = Math.max(panelCount - 1, 0);
  const perimeterLf = (width * 2) + (projection * 2);
  const seamLf = panelSeams * projection;
  const sealantLf = seamLf + perimeterLf + (structureType === 'attached' ? width : 0);
  const sealantTubes = Math.max(1, Math.ceil(sealantLf / 10));
  const butylTapeLf = perimeterLf + seamLf;
  const butylTapeRolls = Math.max(1, Math.ceil(butylTapeLf / 50));
  const gutterPieces = Math.ceil(width / 24);
  const cChannelPieces = structureType === 'attached' ? Math.ceil(width / 24) : 0;
  const fasciaLf = (projection + (5 / 12)) * 2;
  const fasciaPieces = Math.ceil(fasciaLf / 24);
  const beamStockPieces = Math.ceil((width * totalBeamLines) / 24);
  const postCutLength = Math.ceil(lowSideHeight + 1);
  const totalPostCount = frontPostCount + totalSupportPosts;
  const postStockPieces = packStockCuts(Array.from({ length: totalPostCount }, () => postCutLength), 24).length;

  const materials: MaterialItem[] = [
    toMaterial('4 ft regular roof panels', 'Roof system', regular4Count, 'panels', `${panelLength} ft factory-cut panel`, panelColor, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('2 ft regular roof panels', 'Roof system', regular2Count, 'panels', `${panelLength} ft factory-cut panel`, panelColor, 'Standard full-width 2 ft panels'),
    toMaterial('Closure roof panels', 'Roof system', cutPanels.length, 'panels', `${panelLength} ft factory-cut panel`, panelColor, cutPanels.map((piece, index) => `${index === 0 ? 'L' : index === cutPanels.length - 1 ? 'R' : 'Closure'} ${piece.widthFt} ft`).join(' · ') || 'Rip-cut from 2 ft stock'),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', framingColor, 'Front lower side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', framingColor, `${fasciaLf.toFixed(1)} lf including 5 in gutter cap return on both sides`),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', framingColor, 'Attached conditions only'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per cover', framingColor, 'Standard on every patio cover'),
    toMaterial(beamStyle === '3x3' ? '3x3 beam stock' : 'Atlas beam stock', 'Structure', beamStockPieces, 'sticks', '24 ft sections', framingColor, screenUnderneath ? 'Screened-under cover uses 3x3 beam and post system' : 'Open cover uses Atlas beam sitting on top of posts'),
    toMaterial('3x3 post stock', 'Structure', postStockPieces, 'sticks', '24 ft stock', framingColor, `${totalPostCount} total posts cut to about ${postCutLength} ft each`),
    toMaterial('Hidden brackets', 'Hardware', hiddenBracketCount, 'ea', 'Per post', framingColor, beamStyle === '3x3' ? 'Two hidden brackets per post for screened-under framing' : 'One hidden bracket per post when using Atlas beam'),
    toMaterial('Washer screws', 'Hardware', washerScrews, 'ea', '5 per panel per beam line', framingColor, `${panelCount} panels across ${totalBeamLines} beam line(s)`),
    toMaterial('Tek screws', 'Hardware', tekScrews, 'ea', 'Approx. every 6 in', framingColor, 'For gutter, fascia, and general hardware not otherwise itemized'),
    toMaterial('Solar Seal sealant', 'Hardware', sealantTubes, 'tubes', 'Approx. 10 lf per tube', panelColor, `Snap-lock seams + full perimeter + behind C-channel = ${sealantLf.toFixed(1)} lf`),
    toMaterial('Butyl tape', 'Hardware', butylTapeRolls, 'rolls', '50 ft rolls', panelColor, `Full patio-cover perimeter ${perimeterLf.toFixed(1)} lf + panel seams ${seamLf.toFixed(1)} lf = ${butylTapeLf.toFixed(1)} lf`),
    ...(postAttachmentPoint === 'concrete' ? [toMaterial('2.5 in Tapcon screws', 'Hardware', totalPostCount * 4, 'ea', '4 per post base bracket', undefined, `${totalPostCount} post base bracket(s) attached to concrete`)] : []),
    ...(postAttachmentPoint === 'wood-deck' ? [toMaterial('Wood lags', 'Hardware', totalPostCount * 4, 'ea', '4 per post base bracket', undefined, `${totalPostCount} post base bracket(s) attached to wooden deck/framing`)] : []),
    ...(structureType === 'attached' && houseAttachmentMaterial === 'brick-masonry' ? [toMaterial('2.5 in Tapcon screws', 'Hardware', cChannelFasteners, 'ea', 'Every 8 in along C-channel', undefined, `${feetAndInches(width)} C-channel into brick/masonry house siding`)] : []),
    ...(structureType === 'attached' && houseAttachmentMaterial !== 'brick-masonry' ? [toMaterial('Wood lags', 'Hardware', cChannelFasteners, 'ea', 'Every 8 in along C-channel', undefined, `${feetAndInches(width)} C-channel into ${houseAttachmentMaterial === 'wood-siding' ? 'wood house siding' : 'wood fascia'}`)] : []),
  ].filter((item) => item.quantity > 0);

  const fanPanelGroups = fanPanels.reduce((groups, piece) => {
    const key = `${piece.panelWidth}`;
    groups[key] = groups[key] || { panelWidth: piece.panelWidth, count: 0, placements: [] as string[] };
    groups[key].count += 1;
    const placement = piece.fanPlacement === 'female-offset' ? 'female side' : piece.fanPlacement === 'male-offset' ? 'male side' : 'centered';
    groups[key].placements.push(`Panel ${piece.positionIn / 12}-${(piece.positionIn + piece.widthIn) / 12} ft ${placement}`);
    return groups;
  }, {} as Record<string, { panelWidth: number; count: number; placements: string[] }>);
  Object.values(fanPanelGroups).forEach((group) => {
    materials.push(toMaterial(`${group.panelWidth} ft x ${panelLength} ft fan-beam roof panel`, 'Roof system', group.count, 'ea', `${panelLength} ft factory-cut fan beam panel`, panelColor, group.placements.join(' · ')));
  });
  if (supportBeamCount > 0) {
    materials.push(toMaterial(beamStyle === '3x3' ? 'Intermediate 3x3 support beam' : 'Intermediate support beam', 'Structure', supportBeamCount, 'lines', `${width.toFixed(1)} ft each`, framingColor, 'Added because projection exceeds 13 ft without the full upgrade package'));
  }

  return {
    summary: [
      { label: 'Roof area', value: `${(width * projection).toFixed(1)} sq ft` },
      { label: 'Panel mix', value: `${regular4Count} regular 4' + ${regular2Count} regular 2' + ${cutPanels.length} cut${fanPanels.length ? ` + ${fanPanels.length} fan beam` : ''}` },
      { label: 'Low-side height', value: feetAndInches(lowSideHeight) },
      { label: 'Projection check', value: overLimit ? `Over ${maxProjection} ft rule` : `Within ${maxProjection} ft rule` },
      { label: 'Projection overhang', value: feetAndInches(projectionOverhang) },
    ],
    materials,
    orderNotes: [
      `Minimum slope check uses 1/2 in per foot. Current drop is ${feetAndInches(slopeDrop)} from attachment to low side.`,
      `This selection checks against your ${maxProjection} ft max projection rule for the chosen panel package.${overLimit ? ' Current inputs exceed that limit and need more upgrade or redesign.' : ''}`,
      supportBeamCount > 0 ? `Projection is over 13 ft without the full upgrade package, so ${supportBeamCount} intermediate support beam line(s) were added with ${supportPostCount} posts per support beam.` : 'No intermediate support beam was required by the current projection/upgrade combination.',
      panelLayout.notes.join(' '),
      Number(inputs.postCount ?? 0) > 0 ? 'Front post count was manually overridden.' : `Front post count auto-sized to ${frontPostCount} based on the selected beam system.`,
      `Post bracket fasteners use ${postAttachmentPoint === 'wood-deck' ? 'wood lags for wooden deck/framing' : '2.5 in Tapcons for concrete'}; C-channel fasteners use ${houseAttachmentMaterial === 'brick-masonry' ? '2.5 in Tapcons for brick/masonry' : 'wood lags for wood fascia/siding'} every 8 in.`,
    ].filter(Boolean),
  };
}
