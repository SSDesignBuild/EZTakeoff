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



function polygonOrientation(points: { x: number; y: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (next.x - current.x) * (next.y + current.y);
  }
  return sum > 0 ? 'clockwise' : 'counterclockwise';
}

function cornerRole(points: { x: number; y: number }[], index: number) {
  const prev = points[(index - 1 + points.length) % points.length];
  const curr = points[index];
  const next = points[(index + 1) % points.length];
  const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  const orientation = polygonOrientation(points);
  const reflex = orientation === 'counterclockwise' ? cross < 0 : cross > 0;
  return reflex ? 'inside-corner' : 'corner';
}

function classifyRailing(deck: ReturnType<typeof buildDeckModel>) {
  const approxEq = (a: number, b: number) => Math.abs(a - b) < 0.12;
  const stairSegmentIndex = deck.stairPlacement.edgeIndex;
  const topRuns = deck.exposedSegments.flatMap((segment) => {
    if (segment.index !== stairSegmentIndex || !deck.stairPlacement.width) return [{ length: segment.length, kind: 'level' as const }];
    const left = deck.stairPlacement.offset;
    const right = segment.length - deck.stairPlacement.offset - deck.stairPlacement.width;
    return [left, right].filter((value) => value > 0.05).map((length) => ({ length, kind: 'level' as const }));
  });
  const stairRuns = deck.stairRisers > 3 && deck.stairCount > 0
    ? Array.from({ length: deck.stairCount * 2 }, () => ({ length: deck.stairRunFt, kind: 'stair' as const }))
    : [];
  const levelMix = topRuns.reduce((sum, run) => { const opt = optimizeRail(run.length); return { six: sum.six + opt.six, eight: sum.eight + opt.eight }; }, { six: 0, eight: 0 });
  const stairMix = stairRuns.reduce((sum, run) => { const opt = optimizeRail(run.length); return { six: sum.six + opt.six, eight: sum.eight + opt.eight }; }, { six: 0, eight: 0 });
  const vertexRoles = new Map<string, string>();
  deck.exposedSegments.forEach((segment) => {
    const startIndex = deck.points.findIndex((point) => approxEq(point.x, segment.start.x) && approxEq(point.y, segment.start.y));
    const endIndex = deck.points.findIndex((point) => approxEq(point.x, segment.end.x) && approxEq(point.y, segment.end.y));
    if (startIndex >= 0) vertexRoles.set(`${Math.round(segment.start.x*12)}-${Math.round(segment.start.y*12)}`, cornerRole(deck.points, startIndex));
    if (endIndex >= 0) vertexRoles.set(`${Math.round(segment.end.x*12)}-${Math.round(segment.end.y*12)}`, cornerRole(deck.points, endIndex));
  });
  let inlinePosts = 0;
  topRuns.forEach((run) => { inlinePosts += Math.max(0, Math.max(2, Math.ceil(run.length / 6) + 1) - 2); });
  return {
    levelMix, stairMix,
    cornerPosts: [...vertexRoles.values()].filter((role) => role === 'corner').length,
    insideCornerPosts: [...vertexRoles.values()].filter((role) => role === 'inside-corner').length,
    inlinePosts,
    stairPosts: stairRuns.length > 0 ? 4 * deck.stairCount : 0,
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

  const railingPosts = railingType === 'aluminum'
    ? railingBreakdown.cornerPosts + railingBreakdown.insideCornerPosts + railingBreakdown.inlinePosts + railingBreakdown.stairPosts
    : adjustedRailSegments.reduce((sum, length) => sum + Math.max(2, Math.ceil(length / 6) + 1), 0);

  materials.push(
    toMaterial('Blocking', 'Framing', deck.blockingBoardCount, 'boards', '8 ft stock', `${deck.blockingCount} blocks across ${deck.blockingRows} rows`),
    toMaterial('Posts', 'Structure', deck.postCount, 'ea', `${deck.postLength} ft stock`, deck.lockedPosts.length ? `${deck.lockedPosts.length} post position(s) manually locked` : 'Auto-spaced with optional manual locks'),
    toMaterial('Concrete mix', 'Structure', deck.concreteBags, 'bags', '80 lb bags', '3 bags per post footing'),
    toMaterial('Post brackets', 'Hardware', deck.postBases, 'ea', '1 per post', undefined),
    toMaterial('Concrete anchors', 'Hardware', deck.concreteAnchors, 'ea', '1 per post bracket', undefined),
    toMaterial('Joist hangers', 'Hardware', deck.joistHangers, 'ea', 'Match joist size', undefined),
    toMaterial('Rafter ties', 'Hardware', deck.rafterTies, 'ea', '1 per joist to beam condition', undefined),
    toMaterial('Carriage bolt sets', 'Hardware', deck.postCount * 2 + (railingPosts > 0 ? railingPosts * 2 : 0), 'sets', 'Bolt + washer + nut', undefined),
    toMaterial('Ledger lateral load brackets', 'Hardware', deck.lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', undefined),
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
    if (railingBreakdown.cornerPosts) materials.push(toMaterial('Corner posts', 'Railing', railingBreakdown.cornerPosts, 'ea', 'Match railing system', 'Top-level outside corners'));
    if (railingBreakdown.insideCornerPosts) materials.push(toMaterial('Inside corner posts', 'Railing', railingBreakdown.insideCornerPosts, 'ea', 'Match railing system', 'Top-level inside corners'));
    if (railingBreakdown.inlinePosts) materials.push(toMaterial('Inline posts', 'Railing', railingBreakdown.inlinePosts, 'ea', 'Match railing system', 'Top-level inline posts between corners'));
    if (railingBreakdown.stairPosts) materials.push(toMaterial('Stair posts', 'Railing', railingBreakdown.stairPosts, 'ea', 'Match railing system', 'Posts serving stair-side railing'));
  } else {
    materials.push(toMaterial('Level posts', 'Railing', Math.max(0, railingBreakdown.cornerPosts + railingBreakdown.insideCornerPosts + railingBreakdown.inlinePosts), 'ea', '4x4 stock', 'Top-level wood/vinyl/composite posts'));
    if (railingBreakdown.stairPosts) materials.push(toMaterial('Stair posts', 'Railing', railingBreakdown.stairPosts, 'ea', '4x4 stock', 'Posts serving stair-side railing'));
    if (railingBreakdown.cornerPosts) materials.push(toMaterial('Corner posts', 'Railing', railingBreakdown.cornerPosts, 'ea', '4x4 stock', 'Top-level outside corners'));
    if (railingBreakdown.insideCornerPosts) materials.push(toMaterial('Inside corner posts', 'Railing', railingBreakdown.insideCornerPosts, 'ea', '4x4 stock', 'Top-level inside corners'));
    if (railingBreakdown.inlinePosts) materials.push(toMaterial('Inline posts', 'Railing', railingBreakdown.inlinePosts, 'ea', '4x4 stock', 'Top-level inline posts between corners'));
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

  return {
    summary: [
      { label: 'Sections', value: `${sections.length}` },
      { label: 'Screen area', value: `${screenSf.toFixed(1)} sq ft` },
      { label: 'Doors', value: `${singleDoors} single · ${frenchDoors} french` },
      { label: 'Mounting mix', value: `${sections.filter((s) => s.floorMount === 'concrete').length} concrete floor · ${sections.filter((s) => s.wallMount === 'concrete').length} masonry walls` },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      renaissance ? 'Renaissance output is cut-list driven: 1x2 7/8 and 2x2 7/8 members are grouped by exact required length.' : 'Standard screen output groups framing into 24 ft stock so it matches field ordering.',
      'Door openings subtract out receiver, chair rail, pickets, kick panel, and other infill the full width of the door, then add jamb/header framing back in.',
      'New sections inherit the first section so repeated bays are faster to build out, but every section stays editable.',
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
  const slopeDrop = Math.max(attachmentHeight - lowSideHeight, projection * (0.5 / 12));

  let maxProjection = 15;
  if (panelThickness === 3 && metalGauge === '.32' && foamDensity === 2) maxProjection = 19;
  if (panelThickness === 6 && metalGauge === '.32' && foamDensity === 2) maxProjection = 26;
  const overLimit = projection > maxProjection;
  const standard3In = panelThickness === 3 && !(metalGauge === '.32' && foamDensity === 2);
  const supportBeamCount = standard3In && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;

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
  const hiddenBracketPerPost = beamStyle === '3x3' ? 2 : 1;
  const hiddenBracketCount = frontPostCount * hiddenBracketPerPost;
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
  const postStockPieces = Math.ceil((frontPostCount * postCutLength) / 24);

  const materials: MaterialItem[] = [
    toMaterial('4 ft regular roof panels', 'Roof system', regular4Count, 'panels', `${panelLength} ft factory-cut panel`, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('2 ft regular roof panels', 'Roof system', regular2Count, 'panels', `${panelLength} ft factory-cut panel`, 'Standard full-width 2 ft panels'),
    toMaterial('Closure roof panels', 'Roof system', cutPanels.length, 'panels', `${panelLength} ft factory-cut panel`, cutPanels.map((piece, index) => `${index === 0 ? 'L' : index === cutPanels.length - 1 ? 'R' : 'Closure'} ${piece.widthFt} ft`).join(' · ') || 'Rip-cut from 2 ft stock'),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', 'Front lower side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', `${fasciaLf.toFixed(1)} lf including 5 in gutter cap return on both sides`),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', 'Attached conditions only'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per cover', 'Standard on every patio cover'),
    toMaterial(beamStyle === '3x3' ? '3x3 beam stock' : 'Atlas beam stock', 'Structure', beamStockPieces, 'sticks', '24 ft sections', screenUnderneath ? 'Screened-under cover uses 3x3 beam and post system' : 'Open cover uses Atlas beam sitting on top of posts'),
    toMaterial('3x3 post stock', 'Structure', postStockPieces, 'sticks', '24 ft stock', `${frontPostCount} posts cut to about ${postCutLength} ft each`),
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
    ],
    materials,
    orderNotes: [
      `Minimum slope check uses 1/2 in per foot. Current drop is ${feetAndInches(slopeDrop)} from attachment to low side.`,
      `This selection checks against your ${maxProjection} ft max projection rule for the chosen panel package.${overLimit ? ' Current inputs exceed that limit and need more upgrade or redesign.' : ''}`,
      supportBeamCount > 0 ? `Projection is over 13 ft without the full upgrade package, so ${supportBeamCount} intermediate support beam line(s) were added.` : 'No intermediate support beam was required by the current projection/upgrade combination.',
      panelLayout.notes.join(' '),
      Number(inputs.postCount ?? 0) > 0 ? 'Front post count was manually overridden.' : `Front post count auto-sized to ${frontPostCount} based on the selected beam system.`,
    ].filter(Boolean),
  };
}
