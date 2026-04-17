import { parseGableSections, parseSections, parseSunroomSections } from './sectioning';
import { buildDeckModel } from './deckModel';
import { EstimateResult, MaterialItem, SectionConfig } from './types';
import { buildPatioPanelLayout } from './patioLayout';

export type EstimateInputs = Record<string, string | number | boolean>;

const toMaterial = (name: string, category: string, quantity: number, unit: string, stockRecommendation: string, notes?: string): MaterialItem => ({
  name,
  category,
  quantity: Number(quantity.toFixed(2)),
  unit,
  stockRecommendation,
  notes,
});

const feetAndInches = (feet: number) => {
  const totalInches = Math.round(feet * 12);
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${ft}' ${inches}"` : `${ft}'`;
};

const addBoardGroups = (materials: MaterialItem[], category: string, prefix: string, groups: { length: number; count: number }[], notes: string) => {
  groups.forEach((group) => {
    if (group.count > 0) materials.push(toMaterial(`${prefix} ${group.length}'`, category, group.count, 'boards', `${group.length} ft stock`, notes));
  });
};

const normalizeCutLength = (length: number) => Math.round(length * 12) / 12;

const packStockCuts = (lengths: number[], stockLength = 24) => {
  const cuts = lengths
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

const add24FtStockFromCuts = (materials: MaterialItem[], name: string, category: string, lengths: number[], notes?: string) => {
  const bins = packStockCuts(lengths, 24);
  if (!bins.length) return;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const waste = bins.reduce((sum, bin) => sum + Math.max(0, bin.remaining), 0);
  materials.push(
    toMaterial(
      name,
      category,
      bins.length,
      'sticks',
      '24 ft stock',
      `${total.toFixed(1)} lf total · ${waste.toFixed(1)} lf estimated offcut${notes ? ` · ${notes}` : ''}`,
    ),
  );
};

const addCustomCutGroups = (materials: MaterialItem[], name: string, category: string, lengths: number[], note?: string) => {
  const map = new Map<number, number>();
  lengths.forEach((length) => {
    const rounded = Math.round(length * 12) / 12;
    map.set(rounded, (map.get(rounded) ?? 0) + 1);
  });
  [...map.entries()].sort((a, b) => a[0] - b[0]).forEach(([length, count]) => {
    materials.push(toMaterial(`${name} ${feetAndInches(length)}`, category, count, 'ea', 'Custom cut', note));
  });
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
  const stairRuns = deck.stairRisers > 3 && deck.stairCount > 0
    ? Array.from({ length: deck.stairCount * 2 }, () => ({ length: deck.stairRunFt, kind: 'stair' as const }))
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
  const stairsLevelToAngledCornerPosts = stairKeys.size;
  const stairsEndPosts = stairRuns.length ? deck.stairCount * 2 : 0;
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
        waste < best.waste - 1e-6 ||
        (Math.abs(waste - best.waste) < 1e-6 && pieces < best.pieces) ||
        (Math.abs(waste - best.waste) < 1e-6 && pieces === best.pieces && six > best.six)
      ) {
        best = { six, eight, waste, pieces };
      }
    }
  }
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
    case 'renaissance-screen-rooms':
      return estimateScreenRoom(inputs, true);
    case 'sunrooms':
      return estimateSunroom(inputs);
    default:
      return { summary: [], materials: [], orderNotes: [] };
  }
}

function estimateDeck(inputs: EstimateInputs): EstimateResult {
  const deck = buildDeckModel(inputs);
  const railingType = String(inputs.railingType ?? 'aluminum');
  const materials: MaterialItem[] = [];
  addBoardGroups(materials, 'Decking', 'Field deck board', deck.boardGroups, deck.boardRun === 'width' ? 'Boards run parallel to the house, so stock length tracks deck width.' : 'Boards run perpendicular to the house, so stock length tracks projection.');
  addBoardGroups(materials, 'Decking', 'Border / picture-frame board', deck.borderGroups, 'Border boards grouped from exposed perimeter segments only.');
  addBoardGroups(materials, 'Stairs', 'Stair tread board', deck.stairTreadGroups, 'Two tread boards per tread.');
  addBoardGroups(materials, 'Framing', `${deck.joistSize} joist`, deck.joistLengthGroups, 'Joists at 12 in. O.C.');
  addBoardGroups(materials, 'Framing', `${deck.beamMemberSize} beam ply`, deck.beamBoardGroups, 'Doubled beam members with overlap handled in the printed layout.');
  addBoardGroups(materials, 'Framing', 'Double band / rim board', deck.doubleBandGroups, 'Double band applied to full perimeter and staggered in layout preview.');

  const baseRailSegments = deck.exposedSegments.map((segment) => segment.length);
  const stairOpeningWidth = deck.stairPlacement.edgeIndex !== null ? Math.min(deck.stairPlacement.width, deck.exposedSegments.find((segment) => segment.index === deck.stairPlacement.edgeIndex)?.length ?? 0) : 0;
  const adjustedRailSegments = baseRailSegments.flatMap((length, index) => {
    const seg = deck.exposedSegments[index];
    if (seg.index !== deck.stairPlacement.edgeIndex || stairOpeningWidth <= 0) return [length];
    const leftRight = Math.max(0, length - stairOpeningWidth);
    if (leftRight <= 0) return [];
    return [leftRight / 2, leftRight / 2].filter((value) => value > 0.05);
  });
  if (deck.stairRisers > 3 && deck.stairCount > 0) {
    for (let run = 0; run < deck.stairCount * 2; run += 1) adjustedRailSegments.push(deck.stairRunFt);
  }
  const railingBreakdown = classifyRailing(deck);

  const railingPosts = railingBreakdown.endLevelPosts + railingBreakdown.inlineLevelPosts + railingBreakdown.cornerLevelPosts + railingBreakdown.stairsLevelToAngledCornerPosts + railingBreakdown.stairsInlinePosts + railingBreakdown.stairsEndPosts;

  materials.push(
    toMaterial('Blocking', 'Framing', deck.blockingBoardCount, 'boards', '8 ft stock', `${deck.blockingCount} blocks across ${deck.blockingRows} rows`),
    toMaterial(`6x6 wood posts ${deck.postLength}'`, 'Structure', deck.postCount, 'ea', `${deck.postLength} ft stock`, deck.lockedPosts.length ? `${deck.lockedPosts.length} post position(s) manually locked` : 'Auto-spaced beam support posts'),
    toMaterial('Concrete mix', 'Structure', deck.concreteBags, 'bags', '80 lb bags', '3 bags per post footing'),
    toMaterial('Post brackets', 'Hardware', deck.postBases, 'ea', '1 per post', undefined),
    toMaterial('Concrete anchors', 'Hardware', deck.concreteAnchors, 'ea', '1 per post bracket', undefined),
    toMaterial('Joist hangers', 'Hardware', deck.joistHangers, 'ea', 'Match joist size', undefined),
    toMaterial('Rafter ties', 'Hardware', deck.rafterTies, 'ea', '1 per joist to beam condition', undefined),
    toMaterial('Carriage bolt sets', 'Hardware', deck.postCount * 2 + ((railingType === 'wood' || railingType === 'vinyl-composite') ? railingPosts * 2 : 0), 'sets', 'Bolt + washer + nut', undefined),
    toMaterial('Ledger lateral load brackets', 'Hardware', deck.lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', undefined),
    ...(deck.attachment === 'siding' ? [toMaterial('1/2 in x 6 in lag screws', 'Hardware', Math.max(1, Math.ceil(deck.houseContactLength)), 'ea', 'W pattern every 12 in', 'Ledger to house attachment')] : []),
    toMaterial('SDS structural screws', 'Hardware', deck.sdsCorners, 'ea', '4 per corner', 'All band-board corners'),
    toMaterial('Joist tape', 'Hardware', deck.joistTapeLf, 'lf', 'Match roll coverage', undefined),
    toMaterial(deck.fastenerType === 'top screws' ? '3 in deck screws' : '2-3/8 in CAMO screws', 'Hardware', deck.deckFastenerBoxes, 'boxes', deck.fastenerType === 'top screws' ? '365 per box' : '1750 per box', undefined),
    toMaterial('3 in nails', 'Hardware', deck.joistHangers * 10 + deck.postBases * 10 + deck.lateralLoadBrackets * 10, 'nails', '10 per connector', 'Joist hangers, post brackets, and lateral load brackets'),
    toMaterial('1-1/2 in nails', 'Hardware', deck.rafterTies * 10, 'nails', '10 per rafter tie', 'For rafter ties'),
    toMaterial('Fascia', 'Trim', deck.fasciaPieces, 'boards', '12 ft fascia boards', `${deck.fasciaLf.toFixed(1)} lf including stair sides and risers`),
  );
  if (deck.stairStringers > 0) {
    materials.push(toMaterial('2x12 stringers', 'Stairs', deck.stairStringers, 'boards', `${deck.stairStringerLength} ft stock`, `Stringers cut on site at 12 in. O.C. · ${deck.stairRisers} risers / ${deck.stairTreadsPerRun} treads per run`));
  }

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
    if (railingPosts) materials.push(toMaterial('Blocking under top-mount aluminum posts', 'Railing', railingPosts, 'locations', '2x framing blocking', 'Blocking required under each aluminum post location'));
  } else {
    if (railingBreakdown.endLevelPosts) materials.push(toMaterial('4x4 wood end level posts', 'Railing', railingBreakdown.endLevelPosts, 'ea', '4x4 stock', 'Post with only one top-level rail attached'));
    if (railingBreakdown.inlineLevelPosts) materials.push(toMaterial('4x4 wood inline level posts', 'Railing', railingBreakdown.inlineLevelPosts, 'ea', '4x4 stock', 'Post with two opposite top-level rails attached'));
    if (railingBreakdown.cornerLevelPosts) materials.push(toMaterial('4x4 wood corner level posts', 'Railing', railingBreakdown.cornerLevelPosts, 'ea', '4x4 stock', 'Post with adjacent top-level rails attached'));
    if (railingBreakdown.stairsLevelToAngledCornerPosts) materials.push(toMaterial('4x4 wood stairs level-to-angled corner posts', 'Railing', railingBreakdown.stairsLevelToAngledCornerPosts, 'ea', '4x4 stock', 'Top posts where level rail turns onto stair rail'));
    if (railingBreakdown.stairsInlinePosts) materials.push(toMaterial('4x4 wood stairs inline posts', 'Railing', railingBreakdown.stairsInlinePosts, 'ea', '4x4 stock', 'Intermediate stair-side posts'));
    if (railingBreakdown.stairsEndPosts) materials.push(toMaterial('4x4 wood stairs end posts', 'Railing', railingBreakdown.stairsEndPosts, 'ea', '4x4 stock', 'Bottom stair-end posts'));
    if (railingBreakdown.levelMix.eight) materials.push(toMaterial('8 ft level railing infill sections', 'Railing', railingBreakdown.levelMix.eight, 'sections', '8 ft sections', 'Top-level straight runs'));
    if (railingBreakdown.levelMix.six) materials.push(toMaterial('6 ft level railing infill sections', 'Railing', railingBreakdown.levelMix.six, 'sections', '6 ft sections', 'Top-level straight runs'));
    if (railingBreakdown.stairMix.eight) materials.push(toMaterial('8 ft angled railing infill sections', 'Railing', railingBreakdown.stairMix.eight, 'sections', '8 ft sections', 'Stair-side or angled runs'));
    if (railingBreakdown.stairMix.six) materials.push(toMaterial('6 ft angled railing infill sections', 'Railing', railingBreakdown.stairMix.six, 'sections', '6 ft sections', 'Stair-side or angled runs'));
  }

  return {
    summary: [
      { label: 'Deck area', value: `${deck.area.toFixed(1)} sq ft` },
      { label: 'Board direction', value: deck.boardRun === 'width' ? 'Parallel to house / stock tracks width' : 'Perpendicular to house / stock tracks projection' },
      { label: 'Stairs', value: deck.stairCount ? `${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers` : 'No stairs' },
      { label: 'Railing mix', value: `Level ${railingBreakdown.levelMix.six}x6' + ${railingBreakdown.levelMix.eight}x8' · Angled ${railingBreakdown.stairMix.six}x6' + ${railingBreakdown.stairMix.eight}x8'` },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      deck.attachment === 'brick' ? 'Brick attachment is treated as freestanding, so the house side still needs beam and post support, including beam segments at any inside corner/jut-out.' : 'Siding attachment keeps ledger logic active unless the deck is marked freestanding.',
      deck.stairPlacement.edgeIndex !== null ? `Stairs sit on edge ${deck.stairPlacement.edgeIndex + 1}. Preview now shows tread count, stringer layout, and stair-side railing when more than 3 risers are required.` : 'No stair edge is assigned yet in the drawing tool.',
      'Railing optimizer solves each straight run separately, subtracts stair openings from the deck edge, and adds stair-side railing runs when the stair count requires guard rail.',
      deck.lockedPosts.length > 0 ? 'Locked posts stay in the take-off even after beam edits so you can preserve preferred field locations.' : 'Use post lock mode when you want to hold a post location while still letting the app auto-space the rest.',
    ],
  };
}

function estimateScreenRoom(inputs: EstimateInputs, renaissance: boolean): EstimateResult {
  const sections = parseSections(inputs.sections, 3);
  const screenType = String(inputs.screenType ?? 'suntex-80');
  const framingColor = String(inputs.framingColor ?? 'white');
  const panelColor = String(inputs.panelColor ?? 'white');
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
  let receiverFastenerTubesLf = 0;
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
    const wallWidthExcludingDoor = Math.max(0, section.width - doorWidth);
    const receiverPerimeter = section.width * 2 + section.height * 2 - doorWidth;
    const topReceiverCut = section.width;
    const bottomReceiverCut = Math.max(0, section.width - doorWidth);
    if (!renaissance) receiverCuts24.push(topReceiverCut, bottomReceiverCut, section.height, section.height);
    receiverFastenerTubesLf += receiverPerimeter;
    const floorMountLf = Math.max(0, bottomReceiverCut);
    const wallMountLf = section.height * 2;
    const addFasteners = (mount: string, lf: number, spacing = 2) => {
      const qty = Math.max(0, Math.ceil(lf / spacing));
      if (mount === 'concrete') concreteScrews += qty;
      else if (mount === 'metal') selfTappingScrews += qty;
      else woodScrews += qty;
    };
    addFasteners(section.floorMount, floorMountLf);
    addFasteners(section.wallMount, wallMountLf);

    const perimeter1x2Lf = renaissance ? receiverPerimeter : receiverPerimeter - (section.kickPanel === 'insulated' ? wallWidthExcludingDoor : 0);
    if (renaissance) oneByTwoCustom.push(section.width, section.width, section.height, section.height);
    else {
      oneByTwoCuts24.push(section.width, section.height, section.height);
      if (section.kickPanel !== 'insulated') oneByTwoCuts24.push(Math.max(0, section.width - doorWidth));
    }
    tekScrewCount += Math.ceil(perimeter1x2Lf / 2);

    const chairRailOnlyLength = section.chairRail && !section.pickets ? wallWidthExcludingDoor : 0;
    const picketRailLength = section.pickets ? wallWidthExcludingDoor : 0;
    const uprightCount = Math.max(0, section.uprights);
    const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);

    if (renaissance) {
      for (let i = 0; i < uprightCount; i += 1) twoByTwoCustomNoGroove.push(section.height);
      if (chairRailOnlyLength > 0) twoByTwoCustomNoGroove.push(chairRailOnlyLength);
      if (section.kickPanel === 'insulated') twoByTwoCustomGroove.push(wallWidthExcludingDoor);
      if (picketRailLength > 0) twoByTwoCustomGroove.push(picketRailLength);
    } else {
      for (let i = 0; i < uprightCount; i += 1) twoByTwoCuts24.push(section.height);
      if (chairRailOnlyLength > 0) twoByTwoCuts24.push(chairRailOnlyLength);
      if (picketRailLength > 0) twoByTwoCuts24.push(picketRailLength);
      capriClips += uprightCount + ((section.chairRail || section.pickets) ? 2 : 0) + (section.doorType !== 'none' ? 3 : 0) + (section.kickPanel === 'insulated' ? 2 : 0);
      tekScrewCount += capriClips * 4;
    }

    if (section.pickets) {
      const picketSpanIn = wallWidthExcludingDoor * 12;
      const sectionPickets = Math.max(0, Math.ceil(picketSpanIn / 4));
      picketCount += sectionPickets;
      if (!renaissance) uChannelCuts24.push(wallWidthExcludingDoor, wallWidthExcludingDoor);
      if (renaissance) {
        // Precut 36 in pickets for Renaissance.
      } else {
        picketStockLf += sectionPickets * 3;
      }
      tekScrewCount += sectionPickets * 2;
    }

    if (section.kickPanel === 'trim-coil' && !renaissance) {
      vGroove1x2Cuts24.push(wallWidthExcludingDoor);
      vGroove2x2Cuts24.push(wallWidthExcludingDoor);
      panelSqFt += wallWidthExcludingDoor * kickHeight;
    }

    if (section.kickPanel === 'insulated') {
      panelSqFt += wallWidthExcludingDoor * kickHeight;
      insulatedReceiverCuts24.push(wallWidthExcludingDoor);
      if (renaissance) twoByTwoCustomGroove.push(wallWidthExcludingDoor);
      else {
        twoByTwoCuts24.push(wallWidthExcludingDoor);
      }
    }

    if (section.doorType !== 'none') {
      const headerLf = doorWidth;
      if (renaissance) {
        twoByTwoCustomNoGroove.push(section.height, section.height, headerLf);
      } else {
        twoByTwoCuts24.push(section.height, section.height, headerLf);
      }
      if (section.doorType === 'single') singleDoors += 1;
      else frenchDoors += 1;
      if (section.doorSwing === 'inswing') inswingKits += 1;
      if (section.doorType === 'french') astragals += 1;
    }

    if (renaissance) {
      const clips = Math.max(0, uprightCount) + ((section.chairRail || section.pickets) ? 2 : 0) + (section.kickPanel === 'insulated' ? 2 : 0) + (section.doorType !== 'none' ? 3 : 0);
      bracketCount += clips;
      flushMountScrews += clips * 4;
    }
  });

  const totalHeight = sections.reduce((sum, section) => sum + section.height, 0);
  const totalDoorWidth = sections.reduce((sum, section) => sum + sectionDoorWidth(section), 0);
  const screenSf = Math.max(0, sections.reduce((sum, section) => sum + (section.width * section.height), 0) - panelSqFt - (totalDoorWidth * (totalHeight / sections.length || 0)));
  const screenRolls = Math.max(1, Math.ceil(screenSf / 1000));
  const spline = screenType === 'suntex-80' ? '.285 spline' : '.315 spline';
  const sealantTubes = renaissance ? Math.max(1, Math.ceil(oneByTwoCustom.reduce((sum, len) => sum + len, 0) / 24)) : Math.max(1, Math.ceil(receiverFastenerTubesLf / 24));

  const gableOpenings = (gable: { width: number; height: number; style: string; uprights?: number }) => {
    const half = gable.width / 2;
    const rafter = Math.sqrt(half ** 2 + gable.height ** 2);
    const diag = Math.sqrt((half * 0.42) ** 2 + (gable.height * 0.45) ** 2);
    const cuts: number[] = [half, rafter, half, rafter];
    switch (gable.style) {
      case 'none':
        break;
      case 'king-post':
        cuts.push(gable.height, gable.height);
        break;
      case 'tied-king-post':
        cuts.push(diag, diag, diag, diag, gable.height * 0.55, gable.height * 0.55);
        break;
      case 'braced-king-post':
        cuts.push(diag, diag, diag, diag, diag, diag, gable.height * 0.55, gable.height * 0.55);
        break;
      case 'queen-king-post':
        cuts.push(gable.height, gable.height, half * 0.2, half * 0.2, half * 0.2, half * 0.2);
        break;
      default:
        cuts.push(gable.height, gable.height);
        break;
    }
    const uprightCount = Math.max(0, Math.floor(gable.uprights ?? 0));
    for (let i = 1; i <= uprightCount; i += 1) {
      const x = (gable.width * i) / (uprightCount + 1);
      const localHeight = x <= half ? (gable.height * x) / half : (gable.height * (gable.width - x)) / half;
      const h = Math.max(0, localHeight);
      if (h > 0.05) cuts.push(h, h);
    }
    return cuts;
  };

  gableSections.forEach((gable) => {
    if (gable.width <= 0 || gable.height <= 0) return;
    const cuts = gableOpenings(gable);
    if (renaissance) {
      oneByTwoCustom.push(...cuts);
      gableOneByTwoCuts.push(...cuts);
      const uprightCount = Math.max(0, Math.floor(gable.uprights ?? 0));
      if (uprightCount > 0) {
        for (let i = 1; i <= uprightCount; i += 1) {
          const x = (gable.width * i) / (uprightCount + 1);
          const localHeight = x <= gable.width / 2 ? (gable.height * x) / (gable.width / 2) : (gable.height * (gable.width - x)) / (gable.width / 2);
          if (localHeight > 0.05) gableUprightCuts.push(localHeight);
        }
      }
    } else {
      gableReceiverCuts.push(...cuts);
      gableOneByTwoCuts.push(...cuts);
      const uprightCount = Math.max(0, Math.floor(gable.uprights ?? 0));
      if (uprightCount > 0) {
        for (let i = 1; i <= uprightCount; i += 1) {
          const x = (gable.width * i) / (uprightCount + 1);
          const localHeight = x <= gable.width / 2 ? (gable.height * x) / (gable.width / 2) : (gable.height * (gable.width - x)) / (gable.width / 2);
          if (localHeight > 0.05) gableUprightCuts.push(localHeight);
        }
      }
    }
  });

  if (renaissance) {

    addCustomCutGroups(materials, '1x2 7/8', 'Frame', oneByTwoCustom, `${framingColor} · perimeter pieces`);
    addCustomCutGroups(materials, '2x2 7/8 no-channel', 'Frame', twoByTwoCustomNoGroove, `${framingColor} · uprights, chair rail only, and door framing`);
    addCustomCutGroups(materials, '2x2 7/8 with channel', 'Frame', twoByTwoCustomGroove, `${framingColor} · pickets and insulated kick panel`);
    materials.push(
      toMaterial('Decorative brackets with caps', 'Hardware', bracketCount, 'ea', 'Bracket system', undefined),
      toMaterial('Flush mount screws', 'Hardware', flushMountScrews, 'ea', '4 per bracket', undefined),
      toMaterial('Pickets 36 in', 'Railing', picketCount, 'ea', 'Precut 36 in', undefined),
      toMaterial('Insulated panel sheets', 'Panel', Math.ceil(panelSqFt / 40), 'sheets', `4x10 sheets · ${panelColor}`, `${panelSqFt.toFixed(1)} sq ft total`),
      toMaterial(screenType === 'suntex-80' ? 'Suntex 80 screen rolls' : '17/20 tuff screen rolls', 'Screen', screenRolls, 'rolls', '10 ft x 100 ft', `${screenSf.toFixed(1)} sq ft net screen`),
      toMaterial(spline, 'Screen', screenRolls, 'rolls', '1 per screen roll', undefined),
      toMaterial('NovaFlex', 'Hardware', sealantTubes, 'tubes', '1 tube per 24 lf of 1x2 7/8', undefined),
      toMaterial('Single doors', 'Doors', singleDoors, 'ea', 'Custom door width', undefined),
      toMaterial('French doors', 'Doors', frenchDoors, 'sets', 'Custom door width', undefined),
      toMaterial('Inswing kits', 'Doors', inswingKits, 'ea', 'Hydraulic jack kit', undefined),
      toMaterial('Astragals', 'Doors', astragals, 'ea', 'French door center', undefined),
      toMaterial('Concrete screws', 'Hardware', concreteScrews, 'ea', 'Floor / masonry mounts', undefined),
      toMaterial('Wood screws', 'Hardware', woodScrews, 'ea', 'Wood mounts', undefined),
      toMaterial('3/4 in self-tapping screws', 'Hardware', selfTappingScrews, 'ea', 'Metal mounts', undefined),
    );
  } else {
    add24FtStockFromCuts(materials, 'Receiver', 'Frame', [...receiverCuts24, ...insulatedReceiverCuts24], `${framingColor} · includes extra receiver for insulated kick panel`);
    add24FtStockFromCuts(materials, '1x2', 'Frame', oneByTwoCuts24, `${framingColor} · perimeter inside receiver`);
    add24FtStockFromCuts(materials, '2x2', 'Frame', twoByTwoCuts24, `${framingColor} · uprights, chair rail, kick-panel top, and door framing`);
    add24FtStockFromCuts(materials, 'U-channel', 'Railing', uChannelCuts24, 'Top and bottom of picket runs');
    add24FtStockFromCuts(materials, '1x2 V-groove', 'Kick panel', vGroove1x2Cuts24, 'Trim coil kick panel only');
    add24FtStockFromCuts(materials, '2x2 V-groove', 'Kick panel', vGroove2x2Cuts24, 'Trim coil kick panel only');
    materials.push(
      toMaterial('Capri clips', 'Hardware', capriClips, 'ea', '50 per box', undefined),
      toMaterial('Tek screws', 'Hardware', tekScrewCount, 'ea', 'Approx. every 2 ft + clip connections', undefined),
      toMaterial('Pickets 36 in cut pieces', 'Railing', picketCount, 'ea', 'Field cut', undefined),
      toMaterial('24 ft picket stock', 'Railing', packStockCuts(Array.from({ length: picketCount }, () => 3)).length, 'sticks', '24 ft stock', `${picketStockLf.toFixed(1)} lf total picket stock`),
      toMaterial('Insulated panel sheets', 'Panel', Math.ceil(panelSqFt / 40), 'sheets', `4x10 sheets · ${panelColor}`, `${panelSqFt.toFixed(1)} sq ft total`),
      toMaterial(screenType === 'suntex-80' ? 'Suntex 80 screen rolls' : '17/20 tuff screen rolls', 'Screen', screenRolls, 'rolls', '10 ft x 100 ft', `${screenSf.toFixed(1)} sq ft net screen`),
      toMaterial(spline, 'Screen', screenRolls, 'rolls', '1 per screen roll', undefined),
      toMaterial('NovaFlex', 'Hardware', sealantTubes, 'tubes', '1 tube per 24 ft receiver', undefined),
      toMaterial('Single doors', 'Doors', singleDoors, 'ea', 'Custom door width', undefined),
      toMaterial('French doors', 'Doors', frenchDoors, 'sets', 'Custom door width', undefined),
      toMaterial('Inswing kits', 'Doors', inswingKits, 'ea', 'Hydraulic jack kit', undefined),
      toMaterial('Astragals', 'Doors', astragals, 'ea', 'French door center', undefined),
      toMaterial('Concrete screws', 'Hardware', concreteScrews, 'ea', 'Floor / masonry mounts', undefined),
      toMaterial('Wood screws', 'Hardware', woodScrews, 'ea', 'Wood mounts', undefined),
      toMaterial('3/4 in self-tapping screws', 'Hardware', selfTappingScrews, 'ea', 'Metal mounts', undefined),
    );
  }

  if (gableSections.length) {
    if (renaissance) {
      addCustomCutGroups(materials, 'Gable 1x2 7/8', 'Gable', gableOneByTwoCuts, `${framingColor} · gable screen framing around wood members`);
      addCustomCutGroups(materials, 'Gable 2x2 7/8', 'Gable', gableUprightCuts, `${framingColor} · gable uprights`);
    } else {
      add24FtStockFromCuts(materials, 'Gable receiver', 'Gable', gableReceiverCuts, `${framingColor} · gable screen framing receiver`);
      add24FtStockFromCuts(materials, 'Gable 1x2', 'Gable', gableOneByTwoCuts, `${framingColor} · gable screen framing 1x2`);
      add24FtStockFromCuts(materials, 'Gable 2x2 uprights', 'Gable', gableUprightCuts, `${framingColor} · gable uprights`);
    }
  }

  return {
    summary: [
      { label: 'Sections', value: `${sections.length}` },
      { label: 'Screen area', value: `${screenSf.toFixed(1)} sq ft` },
      { label: 'Doors', value: `${singleDoors} single · ${frenchDoors} french` },
      { label: 'Mounting mix', value: `${sections.filter((s) => s.floorMount === 'concrete').length} concrete floor · ${sections.filter((s) => s.wallMount === 'concrete').length} masonry walls` },
      ...(gableSections.length ? [{ label: 'Gables', value: `${gableSections.length} section(s)` }] : []),
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      renaissance ? 'Renaissance output is cut-list driven: 1x2 7/8 and 2x2 7/8 members are grouped by exact required length.' : 'Standard screen output groups framing into 24 ft stock so it matches field ordering.',
      'Door openings subtract out receiver, chair rail, pickets, kick panel, and other infill the full width of the door, then add jamb/header framing back in.',
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
  const cutGroups = { base: [] as number[], receiver: [] as number[], topCap: [] as number[], hBeam: [] as number[], drc: [] as number[], chase: [] as number[], wallPanelArea: 0 };
  let doorSingles = 0;
  let doorSliders = 0;
  let sealantLf = 0;
  let lagBoltLf = 0;
  let weatherSealLf = 0;

  const addWindowBay = (count: number, totalWidth: number, bayHeight: number, includeBottomReceiver = false) => {
    if (count <= 0 || totalWidth <= 0 || bayHeight <= 0) return;
    const bayWidth = totalWidth / Math.max(1, count);
    for (let i = 0; i < count; i += 1) {
      cutGroups.receiver.push(bayWidth);
      if (includeBottomReceiver) cutGroups.receiver.push(bayWidth);
      cutGroups.drc.push(bayHeight, bayHeight);
      weatherSealLf += bayWidth * (includeBottomReceiver ? 2 : 1) + bayHeight * 2;
    }
  };

  sections.forEach((section) => {
    const doorWidth = section.doorType === 'slider' ? 6 : section.doorType === 'single' ? 3 : 0;
    const usableWidth = Math.max(0, section.width - doorWidth);
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
    for (let i = 0; i < section.uprights; i += 1) {
      if (uprightHeight > 0) {
        cutGroups.hBeam.push(uprightHeight);
        cutGroups.drc.push(uprightHeight, uprightHeight);
        if (section.electricChase) cutGroups.chase.push(uprightHeight);
      }
    }
    if (section.kickSection !== 'none' && (section.uprightMode === 'main-only' || section.uprightMode === 'main-transom')) {
      cutGroups.hBeam.push(section.width);
    }
    if (transomNeeded && (section.uprightMode === 'main-only' || section.uprightMode === 'main-kick')) {
      cutGroups.hBeam.push(section.width);
    }

    cutGroups.base.push(section.width);
    cutGroups.topCap.push(section.width);
    if (section.mainSection !== 'panel' || transomNeeded) {
      cutGroups.receiver.push(section.width);
    }

    const bayCount = Math.max(1, section.uprights + 1);
    if (section.mainSection !== 'panel') {
      addWindowBay(bayCount, usableWidth, mainHeight);
    } else if (buildMode !== 'existing-structure') {
      cutGroups.wallPanelArea += usableWidth * mainHeight;
    }

    if (section.kickSection === 'window') {
      cutGroups.receiver.push(section.width);
      cutGroups.drc.push(section.width, section.width);
      addWindowBay(bayCount, usableWidth, kickHeight, true);
    } else if ((section.kickSection === 'panel' || section.kickSection === 'insulated')) {
      cutGroups.wallPanelArea += usableWidth * kickHeight;
    }

    if (transomNeeded) {
      cutGroups.receiver.push(section.width);
      if (section.transomType === 'picture-window') {
        cutGroups.drc.push(section.width, section.width);
        addWindowBay(bayCount, usableWidth, transomFillHeight);
      } else {
        cutGroups.wallPanelArea += usableWidth * transomFillHeight;
      }
    }

    if (section.doorType !== 'none') {
      const doorHeight = 6 + 8 / 12;
      cutGroups.drc.push(doorHeight, doorHeight, doorWidth);
      if (section.doorType === 'single') doorSingles += 1; else doorSliders += 1;
    }

    sealantLf += section.width * 2 + section.height * 2;
    lagBoltLf += section.width;
  });

  const add24 = (name: string, category: string, lengths: number[], notes?: string) => {
    add24FtStockFromCuts(materials, name, category, lengths, notes);
  };
  add24(extrusionName('Base channel with weep', 'Cabana base / base channel'), 'Sunroom frame', cutGroups.base, `${framingColor} · perimeter base`);
  add24(extrusionName('Receiving channel', 'Receiving channel'), 'Sunroom frame', cutGroups.receiver, `${windowColor} · window receiving channel`);
  add24(extrusionName('Top cap, flat', 'Top cap'), 'Sunroom frame', cutGroups.topCap, `${framingColor} · perimeter cap`);
  add24(extrusionName('H-beam', 'H-beam'), 'Sunroom frame', cutGroups.hBeam, `${framingColor} · uprights`);
  add24(extrusionName('DRC', 'DRC'), 'Sunroom frame', cutGroups.drc, `${windowColor} · window / upright finish channel`);
  if (cutGroups.chase.length) add24(extrusionName('Channel with chase & snap', 'Channel with chase'), 'Sunroom frame', cutGroups.chase, `${framingColor} · electric chase enabled in selected sections`);
  if (buildMode === 'new-structure') materials.push(toMaterial(extrusionName('Corner post', 'Corner post'), 'Sunroom frame', 2, 'ea', isThreeIn ? '8 ft or 25 ft stock' : '8 ft or 24 ft stock', 'Only for build-from-scratch corners'));
  if (cutGroups.wallPanelArea > 0) materials.push(toMaterial('Wall panel stock', 'Sunroom panels', Math.ceil(cutGroups.wallPanelArea / 40), 'panels', isThreeIn ? `4x10 panel stock · ${panelColor}` : `Cut from 24 ft stock · ${panelColor}`, `${cutGroups.wallPanelArea.toFixed(1)} sq ft panel fill`));
  if (doorSingles) materials.push(toMaterial("Single swinging doors 3 ft x 6 ft 8 in", 'Doors', doorSingles, 'ea', 'Standard unit', undefined));
  if (doorSliders) materials.push(toMaterial("Sliding doors 6 ft x 6 ft 8 in", 'Doors', doorSliders, 'ea', 'Standard unit', undefined));
  if (weatherSealLf > 0) materials.push(toMaterial('Rounded weather seal bulb vinyl', 'Hardware', Math.max(1, Math.ceil(weatherSealLf / 500)), 'rolls', '500 ft rolls', `${weatherSealLf.toFixed(1)} lf glazing seal`));
  materials.push(toMaterial('Structural adhesive sealant', 'Hardware', Math.max(2, Math.ceil(sealantLf / 10)), 'tubes', 'Approx. 10 lf per tube', `${sealantLf.toFixed(1)} lf around channels, windows, seams`));
  materials.push(toMaterial('1/4 in lag bolts with neoprene washers', 'Hardware', Math.max(1, Math.ceil(lagBoltLf * 2)), 'ea', 'Perimeter roof / attachment', `${lagBoltLf.toFixed(1)} lf around attachment perimeter`));

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
      'Sunroom framing is grouped from 24 ft stock lengths, so leftover stock can be reused on equal-or-shorter cuts before waste occurs.',
      'Window zones use receiver + DRC logic. H-beams are finished with DRC on both sides unless one side is panel. Panel zones use wall panel stock where the section fill is panel / insulated, including kick and transom areas.',
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
  const fanBeam = String(inputs.fanBeam ?? 'none');
  const fanBeamCount = Math.max(1, Number(inputs.fanBeamCount ?? 1));
  const fanBeamPlacementMode = String(inputs.fanBeamPlacementMode ?? 'spread');
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

  const panelLayout = buildPatioPanelLayout(width, fanBeam, panelWidth, fanBeamCount, fanBeamPlacementMode);
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
  const panelSeams = Math.max(panelCount - 1, 0);
  const sealantLf = (panelSeams * projection) + (width * 2) + (projection * 2) + (structureType === 'attached' ? width : 0);
  const sealantTubes = Math.max(1, Math.ceil(sealantLf / 10));
  const gutterPieces = Math.ceil(width / 24);
  const cChannelPieces = structureType === 'attached' ? Math.ceil(width / 24) : 0;
  const fasciaLf = (projection + (5 / 12)) * 2;
  const fasciaPieces = Math.ceil(fasciaLf / 24);
  const beamStockPieces = Math.ceil((width * totalBeamLines) / 24);
  const postCutLength = Math.ceil(lowSideHeight + 1);
  const postStockPieces = Math.ceil(((frontPostCount + totalSupportPosts) * postCutLength) / 24);

  const materials: MaterialItem[] = [
    toMaterial('4 ft regular roof panels', 'Roof system', regular4Count, 'panels', `${panelLength} ft factory-cut panel`, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('2 ft regular roof panels', 'Roof system', regular2Count, 'panels', `${panelLength} ft factory-cut panel`, 'Standard full-width 2 ft panels'),
    toMaterial('Closure roof panels', 'Roof system', cutPanels.length, 'panels', `${panelLength} ft factory-cut panel`, cutPanels.map((piece, index) => `${index === 0 ? 'L' : index === cutPanels.length - 1 ? 'R' : 'Closure'} ${piece.widthFt} ft`).join(' · ') || 'Rip-cut from 2 ft stock'),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', 'Front lower side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', `${fasciaLf.toFixed(1)} lf including 5 in gutter cap return on both sides`),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', 'Attached conditions only'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per cover', 'Standard on every patio cover'),
    toMaterial(beamStyle === '3x3' ? '3x3 beam stock' : 'Atlas beam stock', 'Structure', beamStockPieces, 'sticks', '24 ft sections', screenUnderneath ? 'Screened-under cover uses 3x3 beam and post system' : 'Open cover uses Atlas beam sitting on top of posts'),
    toMaterial('3x3 post stock', 'Structure', postStockPieces, 'sticks', '24 ft stock', `${frontPostCount + totalSupportPosts} total posts cut to about ${postCutLength} ft each`),
    toMaterial('Hidden brackets', 'Hardware', hiddenBracketCount, 'ea', `${hiddenBracketPerPost} per post`, beamStyle === '3x3' ? 'Two hidden brackets per post for screened-under framing' : 'One hidden bracket per post when using Atlas beam'),
    toMaterial('Washer screws', 'Hardware', washerScrews, 'ea', '5 per panel per beam line', `${panelCount} panels across ${totalBeamLines} beam line(s)`),
    toMaterial('Tek screws', 'Hardware', tekScrews, 'ea', 'Approx. every 6 in', 'For C-channel, gutter, and fascia'),
    toMaterial('Solar Seal sealant', 'Hardware', sealantTubes, 'tubes', 'Approx. 10 lf per tube', `Snap-lock seams + full perimeter + behind C-channel = ${sealantLf.toFixed(1)} lf`),
  ].filter((item) => item.quantity > 0);

  if (fanPanels.length > 0) {
    materials.push(toMaterial('Fan-beam roof panel', 'Roof system', fanPanels.length, 'ea', fanBeam === 'centered' ? 'Centered fan-beam panel' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side', fanPanels.map((piece) => piece.panelWidth === 4 ? '4 ft fan-beam panel' : '2 ft fan-beam panel').join(' · ')));
  }
  if (supportBeamCount > 0) {
    materials.push(toMaterial(beamStyle === '3x3' ? 'Intermediate 3x3 support beam' : 'Intermediate support beam', 'Structure', supportBeamCount, 'lines', `${width.toFixed(1)} ft each`, 'Added because projection exceeds 13 ft without the full upgrade package'));
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
    ].filter(Boolean),
  };
}
