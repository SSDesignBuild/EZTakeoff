import { parseSections } from './sectioning';
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

const add24FtStock = (materials: MaterialItem[], name: string, category: string, lf: number, notes?: string) => {
  if (lf <= 0) return;
  materials.push(toMaterial(name, category, Math.ceil(lf / 24), 'sticks', '24 ft stock', `${lf.toFixed(1)} lf total${notes ? ` · ${notes}` : ''}`));
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
  return `${Math.round(point.x * 12)}-${Math.round(point.y * 12)}`;
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
  const nodes = new Map<string, { point: { x: number; y: number }; dirs: { x: number; y: number }[] }>();
  topRuns.forEach((run) => {
    const len = Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y) || 1;
    const dir = { x: (run.end.x - run.start.x) / len, y: (run.end.y - run.start.y) / len };
    const startKey = railNodeKey(run.start);
    const endKey = railNodeKey(run.end);
    nodes.set(startKey, nodes.has(startKey) ? { ...nodes.get(startKey)!, dirs: [...nodes.get(startKey)!.dirs, dir] } : { point: run.start, dirs: [dir] });
    nodes.set(endKey, nodes.has(endKey) ? { ...nodes.get(endKey)!, dirs: [...nodes.get(endKey)!.dirs, { x: -dir.x, y: -dir.y }] } : { point: run.end, dirs: [{ x: -dir.x, y: -dir.y }] });
  });
  let endLevelPosts = 0;
  let inlineLevelPosts = 0;
  let cornerLevelPosts = 0;
  nodes.forEach((entry) => {
    const unique = entry.dirs.slice(0, 2);
    if (unique.length <= 1) endLevelPosts += 1;
    else if (isOppositeDirection(unique[0], unique[1])) inlineLevelPosts += 1;
    else cornerLevelPosts += 1;
  });
  inlineLevelPosts += topRuns.reduce((sum, run) => sum + interiorPostCount(run.length), 0);
  const stairsLevelToAngledCornerPosts = stairRuns.length ? deck.stairCount * 2 : 0;
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

  let receiverLf = 0;
  let oneByTwoLf = 0;
  let twoByTwoLf = 0;
  let uChannelLf = 0;
  let picketCount = 0;
  let picketStockLf = 0;
  let tekScrewCount = 0;
  let capriClips = 0;
  let bracketCount = 0;
  let vGroove1x2Lf = 0;
  let vGroove2x2Lf = 0;
  let panelSqFt = 0;
  let insulatedReceiverLf = 0;
  let singleDoors = 0;
  let frenchDoors = 0;
  let inswingKits = 0;
  let astragals = 0;
  let woodScrews = 0;
  let concreteScrews = 0;
  let flushMountScrews = 0;
  let receiverFastenerTubesLf = 0;
  const oneByTwoCustom: number[] = [];
  const twoByTwoCustomGroove: number[] = [];
  const twoByTwoCustomNoGroove: number[] = [];
  const gableEnabled = Boolean(inputs.gableEnabled ?? false);
  const gableWidth = Number(inputs.gableWidth ?? 0);
  const gableHeight = Number(inputs.gableHeight ?? 0);
  const gableStyle = String(inputs.gableStyle ?? 'king-post');

  sections.forEach((section) => {
    const doorWidth = sectionDoorWidth(section);
    const wallWidthExcludingDoor = Math.max(0, section.width - doorWidth);
    const receiverPerimeter = section.width * 2 + section.height * 2 - doorWidth;
    receiverLf += receiverPerimeter;
    receiverFastenerTubesLf += receiverPerimeter;
    if (section.floorMount === 'concrete') concreteScrews += Math.ceil(receiverPerimeter / 2);
    else woodScrews += Math.ceil(receiverPerimeter / 2);

    const perimeter1x2Lf = renaissance ? receiverPerimeter : receiverPerimeter - (section.kickPanel === 'insulated' ? wallWidthExcludingDoor : 0);
    if (renaissance) oneByTwoCustom.push(section.width, section.width, section.height, section.height);
    else oneByTwoLf += Math.max(0, perimeter1x2Lf);
    tekScrewCount += Math.ceil(perimeter1x2Lf / 2);

    const chairRailOnlyLength = section.chairRail && !section.pickets ? wallWidthExcludingDoor : 0;
    const picketRailLength = section.pickets ? wallWidthExcludingDoor : 0;
    const uprightCount = Math.max(0, section.uprights);
    const uprightsLf = uprightCount * section.height;
    const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);

    if (renaissance) {
      for (let i = 0; i < uprightCount; i += 1) twoByTwoCustomNoGroove.push(section.height);
      if (chairRailOnlyLength > 0) twoByTwoCustomNoGroove.push(chairRailOnlyLength);
      if (section.kickPanel === 'insulated') twoByTwoCustomGroove.push(wallWidthExcludingDoor);
      if (picketRailLength > 0) twoByTwoCustomGroove.push(picketRailLength);
    } else {
      twoByTwoLf += uprightsLf + chairRailOnlyLength + picketRailLength;
      capriClips += uprightCount + ((section.chairRail || section.pickets) ? 2 : 0) + (section.doorType !== 'none' ? 3 : 0) + (section.kickPanel === 'insulated' ? 2 : 0);
      tekScrewCount += capriClips * 4;
    }

    if (section.pickets) {
      const picketSpanIn = wallWidthExcludingDoor * 12;
      const sectionPickets = Math.max(0, Math.ceil(picketSpanIn / 4));
      picketCount += sectionPickets;
      uChannelLf += wallWidthExcludingDoor * 2;
      if (renaissance) {
        // Precut 36 in pickets for Renaissance.
      } else {
        picketStockLf += sectionPickets * 3;
      }
      tekScrewCount += sectionPickets * 2;
    }

    if (section.kickPanel === 'trim-coil' && !renaissance) {
      vGroove1x2Lf += wallWidthExcludingDoor;
      vGroove2x2Lf += wallWidthExcludingDoor;
      panelSqFt += wallWidthExcludingDoor * kickHeight;
    }

    if (section.kickPanel === 'insulated') {
      panelSqFt += wallWidthExcludingDoor * kickHeight;
      insulatedReceiverLf += wallWidthExcludingDoor;
      if (renaissance) twoByTwoCustomGroove.push(wallWidthExcludingDoor);
      else twoByTwoLf += wallWidthExcludingDoor;
    }

    if (section.doorType !== 'none') {
      const headerLf = doorWidth;
      const jambLf = section.height * 2;
      if (renaissance) {
        twoByTwoCustomNoGroove.push(section.height, section.height, headerLf);
      } else {
        twoByTwoLf += jambLf + headerLf;
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

  if (gableEnabled && gableWidth > 0 && gableHeight > 0) {
    const rafterLength = Math.sqrt((gableWidth / 2) ** 2 + gableHeight ** 2);
    if (renaissance) {
      oneByTwoCustom.push(gableWidth);
      if (gableStyle === 'queen-king-post') twoByTwoCustomNoGroove.push(gableHeight, gableHeight, gableHeight);
      else twoByTwoCustomNoGroove.push(gableHeight);
      if (gableStyle === 'tied-king-post' || gableStyle === 'queen-king-post') twoByTwoCustomNoGroove.push(gableWidth);
      if (gableStyle === 'braced-king-post') twoByTwoCustomNoGroove.push(rafterLength / 2, rafterLength / 2);
    } else {
      receiverLf += gableWidth + (2 * rafterLength);
      oneByTwoLf += gableWidth + (2 * rafterLength);
      twoByTwoLf += gableHeight + ((gableStyle === 'queen-king-post') ? gableHeight * 2 : 0) + ((gableStyle === 'tied-king-post' || gableStyle === 'queen-king-post') ? gableWidth : 0) + (gableStyle === 'braced-king-post' ? rafterLength : 0);
    }
  }

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
    );
  } else {
    add24FtStock(materials, 'Receiver', 'Frame', receiverLf + insulatedReceiverLf, `${framingColor} · includes extra receiver for insulated kick panel`);
    add24FtStock(materials, '1x2', 'Frame', oneByTwoLf, `${framingColor} · perimeter inside receiver`);
    add24FtStock(materials, '2x2', 'Frame', twoByTwoLf, `${framingColor} · uprights, chair rail, kick-panel top, and door framing`);
    add24FtStock(materials, 'U-channel', 'Railing', uChannelLf, 'Top and bottom of picket runs');
    add24FtStock(materials, '1x2 V-groove', 'Kick panel', vGroove1x2Lf, 'Trim coil kick panel only');
    add24FtStock(materials, '2x2 V-groove', 'Kick panel', vGroove2x2Lf, 'Trim coil kick panel only');
    materials.push(
      toMaterial('Capri clips', 'Hardware', capriClips, 'ea', '50 per box', undefined),
      toMaterial('Tek screws', 'Hardware', tekScrewCount, 'ea', 'Approx. every 2 ft + clip connections', undefined),
      toMaterial('Pickets 36 in cut pieces', 'Railing', picketCount, 'ea', 'Field cut', undefined),
      toMaterial('24 ft picket stock', 'Railing', Math.ceil(picketStockLf / 24), 'sticks', '24 ft stock', `${picketStockLf.toFixed(1)} lf total picket stock`),
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
    );
  }

  if (gableEnabled && gableWidth > 0 && gableHeight > 0) {
    materials.push(toMaterial('Gable framing set', 'Gable', 1, 'set', `${feetAndInches(gableWidth)} wide × ${feetAndInches(gableHeight)} rise`, `${gableStyle.replace(/-/g, ' ')}`));
  }

  return {
    summary: [
      { label: 'Sections', value: `${sections.length}` },
      { label: 'Screen area', value: `${screenSf.toFixed(1)} sq ft` },
      { label: 'Doors', value: `${singleDoors} single · ${frenchDoors} french` },
      { label: 'Mounting mix', value: `${sections.filter((s) => s.floorMount === 'concrete').length} concrete floor · ${sections.filter((s) => s.wallMount === 'concrete').length} masonry walls` },
      ...(gableEnabled && gableWidth > 0 ? [{ label: 'Gable', value: `${feetAndInches(gableWidth)} × ${feetAndInches(gableHeight)} · ${gableStyle.replace(/-/g, ' ')}` }] : []),
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
  const frontWidth = Number(inputs.frontWidth ?? 16);
  const leftProjection = Number(inputs.leftProjection ?? 12);
  const rightProjection = Number(inputs.rightProjection ?? 12);
  const sideStartHeight = Number(inputs.sideStartHeight ?? 8);
  const frontHeight = Number(inputs.frontHeight ?? 8);
  const roomHeight = Number(inputs.roomHeight ?? Math.max(sideStartHeight, frontHeight));
  const electricChase = Boolean(inputs.electricChase ?? false);
  const kickPanelType = String(inputs.kickPanelType ?? 'insulated');
  const kickPanelHeight = Number(inputs.kickPanelHeight ?? 2);
  const pictureWindow = Boolean(inputs.pictureWindow ?? false);
  const pictureWindowHeight = Number(inputs.pictureWindowHeight ?? 6);
  const transomMode = String(inputs.transomMode ?? 'auto');
  const transomNeeded = transomMode === 'yes' || (transomMode === 'auto' && roomHeight > 10 && !pictureWindow);
  const transomHeight = transomNeeded ? Number(inputs.transomHeight ?? Math.max(0.5, roomHeight - (kickPanelHeight + 6))) : 0;
  const doorType = String(inputs.doorType ?? 'single');
  const doorCount = Math.max(0, Number(inputs.doorCount ?? 1));
  const wallPanelFacing = String(inputs.wallPanelFacing ?? 'durashield');
  const roofStyle = String(inputs.roofStyle ?? 'studio');
  const wallPerimeter = frontWidth + leftProjection + rightProjection;
  const extrusionName = (three: string, two: string) => isThreeIn ? three : two;
  const baseLf = wallPerimeter;
  const starterLf = wallPerimeter;
  const topCapLf = wallPerimeter;
  const hostHeaderLf = frontWidth + (roofStyle === 'studio' ? Math.max(leftProjection, rightProjection) : frontWidth);
  const verticalSupportCount = Math.max(4, Math.ceil(frontWidth / 4) + Math.ceil(leftProjection / 4) + Math.ceil(rightProjection / 4));
  const hBeamLf = verticalSupportCount * roomHeight;
  const kneePanelArea = wallPerimeter * Math.min(kickPanelHeight, 4);
  const transomArea = transomNeeded ? wallPerimeter * transomHeight : 0;
  const cornerPosts = buildMode === 'new-structure' ? 2 : 0;
  const doorWidth = doorType === 'slider' ? 6 : 3;
  const doorHeight = 6 + 8/12;
  const drcLf = doorCount * (doorHeight * 2 + doorWidth);
  const chaseLf = electricChase ? wallPerimeter : 0;
  const roofPanelCount = Math.max(1, Math.ceil(frontWidth / 4));
  const roofPanelLf = roofPanelCount * Math.max(leftProjection, rightProjection);
  const sealBulbRolls = Math.max(1, Math.ceil((frontWidth * 2 + leftProjection * 2 + rightProjection * 2) / 500));
  const lagBolts = Math.max(1, Math.ceil(hostHeaderLf * 2));
  const sealantTubes = Math.max(2, Math.ceil((wallPerimeter * 3 + roofPanelLf + hostHeaderLf) / 10));
  const materials: MaterialItem[] = [];
  add24FtStock(materials, extrusionName('Base channel with weep', 'Cabana base / base channel'), 'Sunroom frame', baseLf, 'Perimeter base around front and side walls');
  add24FtStock(materials, electricChase ? extrusionName('Channel with chase & snap', 'Top cap / chase channel') : extrusionName('Receiving channel', 'Receiving channel'), 'Sunroom frame', starterLf, electricChase ? 'Use chase where electric raceway is required' : 'Starter / receiving channel against host structure and panel caps');
  add24FtStock(materials, extrusionName('H-beam', 'H-beam'), 'Sunroom frame', hBeamLf, 'Vertical supports between fillers, windows, and doors');
  add24FtStock(materials, extrusionName('DRC', 'DRC'), 'Sunroom frame', drcLf, 'Door/window finish channel');
  add24FtStock(materials, electricChase ? extrusionName('Channel with chase & snap', 'Top cap') : extrusionName(roofStyle === 'studio' ? '3/12 top cap' : 'Top cap, flat', roofStyle === 'studio' ? '3/12 top cap' : 'Top cap'), 'Sunroom frame', topCapLf, roofStyle === 'studio' ? 'Sloped top cap for studio roof conditions' : 'Flat top cap for wall cap / roof connection');
  add24FtStock(materials, extrusionName('Wall header', 'Wall header'), 'Roof system', hostHeaderLf, 'Host wall header / attachment channel');
  materials.push(
    toMaterial('Insulated roof panels', 'Roof system', roofPanelCount, 'panels', 'Factory-cut to room projection', `${roofStyle} roof · panels install left-to-right female left / male right`),
    toMaterial(kickPanelType === 'insulated' ? 'Wall panel stock' : 'Window kick / filler stock', 'Sunroom panels', Math.ceil((kneePanelArea + transomArea) / 32), 'panels', `Cut from stock · ${wallPanelFacing}`, `${(kneePanelArea + transomArea).toFixed(1)} sq ft total fillers, knee walls, and transoms`),
    toMaterial('Rounded weather seal bulb vinyl', 'Hardware', sealBulbRolls, 'rolls', '500 ft rolls', 'For glazing clip weather seal'),
    toMaterial('Lag bolts with neoprene washers', 'Hardware', lagBolts, 'ea', 'Perimeter roof anchorage', 'Header / roof attachment'),
    toMaterial('Structural adhesive sealant', 'Hardware', sealantTubes, 'tubes', 'Approx. 10 lf per tube', 'Base channel, receiver, panel seams, gutter/fascia, and attachment wall joints')
  );
  if (cornerPosts) materials.push(toMaterial(extrusionName('Corner post', 'Corner post'), 'Sunroom frame', cornerPosts, 'ea', isThreeIn ? '8 ft or 25 ft stock' : '8 ft or 24 ft stock', 'Needed when building new free-standing corners'));
  if (electricChase) materials.push(toMaterial(extrusionName('Self mating H-beam / chase channel', 'Channel with chase'), 'Sunroom frame', Math.max(1, Math.ceil(chaseLf / 24)), 'sticks', '24 ft stock', 'Raceway-ready members for electric runs'));
  if (transomNeeded) materials.push(toMaterial('Transom fill sections', 'Sunroom panels', Math.max(1, Math.ceil(transomArea / 16)), 'sections', 'Cut from 24 ft stock wall panels', `${transomArea.toFixed(1)} sq ft transom area`));
  if (doorCount) materials.push(toMaterial(doorType === 'slider' ? "Sliding doors 6' × 6'8\"" : "Single swinging doors 3' × 6'8\"", 'Doors', doorCount, 'ea', 'Standard unit', 'Door width and threshold opening deducted from wall fill calculations'));
  return {
    summary: [
      { label: 'System', value: isThreeIn ? '3 in thermally broken' : '2 in non-thermal' },
      { label: 'Wall perimeter', value: `${wallPerimeter.toFixed(1)} lf` },
      { label: 'Room height', value: feetAndInches(roomHeight) },
      { label: 'Transom', value: transomNeeded ? `${feetAndInches(transomHeight)} transom` : 'Not required' },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      isThreeIn ? '3 in Add-A-Room uses 24 ft base channel, receiving channel, DRC, H-beam, self-mating H-beam, corner post, and top cap extrusions per the Elite catalog.' : '2 in Add-A-Room uses 24 ft cabana base/basechannel, receiving channel, DRC, H-beam, corner post, and top cap extrusions per the Elite catalog.',
      buildMode === 'existing-structure' ? 'Existing structure mode minimizes corner-post usage and assumes you are tying the room into the host walls/roof.' : 'Build-from-scratch mode adds corner posts at free-standing corners.',
      electricChase ? 'Electric chase is enabled, so chase-compatible channel / self-mating members are included.' : 'Electric chase not enabled, so standard receiving / top cap members are used.',
      transomNeeded ? 'Transom was added because the selected room height exceeds the standard kick-panel plus 6 ft window stack.' : 'No transom was added under the current height/package selection.',
      pictureWindow ? `Picture window package selected at ${feetAndInches(pictureWindowHeight)}.` : `Kick panels set as ${kickPanelType}.`,
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
