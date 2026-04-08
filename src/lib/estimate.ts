import { parseSections } from './sectioning';
import { buildDeckModel } from './deckModel';
import { EstimateResult, MaterialItem } from './types';

export type EstimateInputs = Record<string, string | number | boolean>;

const toMaterial = (name: string, category: string, quantity: number, unit: string, stockRecommendation: string, notes?: string): MaterialItem => ({
  name,
  category,
  quantity: Number(quantity.toFixed(2)),
  unit,
  stockRecommendation,
  notes,
});

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);
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
  addBoardGroups(materials, 'Decking', 'Field deck board', deck.boardGroups, deck.boardRun === 'width' ? 'Board direction follows deck width, so stock length tracks projection spans.' : 'Board direction follows deck projection, so stock length tracks width spans.');
  addBoardGroups(materials, 'Decking', 'Border / picture-frame board', deck.borderGroups, 'Border boards grouped from exposed perimeter segments only.');
  addBoardGroups(materials, 'Stairs', 'Stair tread board', deck.stairTreadGroups, 'Two tread boards per tread.');
  addBoardGroups(materials, 'Framing', `${deck.joistSize} joist`, deck.joistLengthGroups, 'Joists at 12 in. O.C.');
  addBoardGroups(materials, 'Framing', `${deck.beamMemberSize} beam ply`, deck.beamBoardGroups, 'Doubled beam members.');
  addBoardGroups(materials, 'Framing', 'Double band / rim board', deck.doubleBandGroups, 'Double band applied to full perimeter and staggered in layout preview.');
  materials.push(
    toMaterial('Blocking', 'Framing', deck.blockingBoardCount, 'boards', '8 ft stock', `${deck.blockingCount} blocks across ${deck.blockingRows} rows`),
    toMaterial('Posts', 'Structure', deck.postCount, 'ea', `${deck.postLength} ft stock`, deck.lockedPosts.length ? `${deck.lockedPosts.length} post position(s) manually locked` : 'Auto-spaced with optional manual locks'),
    toMaterial('Concrete mix', 'Structure', deck.concreteBags, 'bags', '80 lb bags', '3 bags per post footing'),
    toMaterial('Post brackets', 'Hardware', deck.postBases, 'ea', '1 per post', undefined),
    toMaterial('Concrete anchors', 'Hardware', deck.concreteAnchors, 'ea', '1 per post bracket', undefined),
    toMaterial('Joist hangers', 'Hardware', deck.joistHangers, 'ea', 'Match joist size', undefined),
    toMaterial('Rafter ties', 'Hardware', deck.rafterTies, 'ea', '1 per joist to beam condition', undefined),
    toMaterial('Carriage bolt sets', 'Hardware', deck.carriageBolts, 'sets', 'Bolt + washer + nut', undefined),
    toMaterial('Ledger lateral load brackets', 'Hardware', deck.lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', undefined),
    toMaterial('SDS structural screws', 'Hardware', deck.sdsCorners, 'ea', '4 per corner', 'All band-board corners'),
    toMaterial('Joist tape', 'Hardware', deck.joistTapeLf, 'lf', 'Match roll coverage', undefined),
    toMaterial(deck.fastenerType === 'top screws' ? '3 in deck screws' : '2-3/8 in CAMO screws', 'Hardware', deck.deckFastenerBoxes, 'boxes', deck.fastenerType === 'top screws' ? '365 per box' : '1750 per box', undefined),
    toMaterial('3 in nails', 'Hardware', deck.joistHangers * 10 + deck.postBases * 10 + deck.lateralLoadBrackets * 10, 'nails', '10 per connector', 'Joist hangers, post brackets, and lateral load brackets'),
    toMaterial('1-1/2 in nails', 'Hardware', deck.rafterTies * 10, 'nails', '10 per rafter tie', 'For rafter ties'),
    toMaterial('Fascia', 'Trim', deck.fasciaPieces, 'boards', '12 ft fascia boards', `${deck.fasciaLf.toFixed(1)} lf including stair sides and risers`),
  );
  if (deck.stairStringers > 0) materials.push(toMaterial('2x12 stringers', 'Stairs', deck.stairStringers, 'boards', `${deck.stairStringerLength} ft stock`, `Stringers cut on site at 12 in. O.C. · ${deck.stairRisers} risers / ${deck.stairTreadsPerRun} treads per run`));
  if (railingType === 'aluminum') {
    if (deck.railingSections8) materials.push(toMaterial('8 ft aluminum railing sections', 'Railing', deck.railingSections8, 'sections', '8 ft sections', undefined));
    if (deck.railingSections6) materials.push(toMaterial('6 ft aluminum railing sections', 'Railing', deck.railingSections6, 'sections', '6 ft sections', undefined));
  } else {
    materials.push(toMaterial('4x4 railing posts', 'Railing', deck.railingPosts, 'ea', 'Match railing height stock', 'For wood, vinyl, or composite railing systems'));
    if (deck.railingSections8) materials.push(toMaterial('8 ft railing infill sections', 'Railing', deck.railingSections8, 'sections', '8 ft sections', undefined));
    if (deck.railingSections6) materials.push(toMaterial('6 ft railing infill sections', 'Railing', deck.railingSections6, 'sections', '6 ft sections', undefined));
  }

  return {
    summary: [
      { label: 'Deck area', value: `${deck.area.toFixed(1)} sq ft` },
      { label: 'Board direction', value: deck.boardRun === 'width' ? 'Parallel with house / stock tracks projection' : 'Perpendicular to house / stock tracks width' },
      { label: 'Stairs', value: deck.stairCount ? `${deck.stairRisers} risers · ${deck.stairTreadsPerRun} treads · ${deck.stairStringers} stringers` : 'No stairs' },
      { label: 'Railing mix', value: `${deck.railingSections6}x6' + ${deck.railingSections8}x8'` },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      deck.attachment === 'brick' ? 'Brick attachment is treated as freestanding, so the house side still needs beam and post support.' : 'Siding attachment keeps ledger logic active unless the deck is marked freestanding.',
      deck.stairPlacement.edgeIndex !== null ? `Stairs sit on edge ${deck.stairPlacement.edgeIndex + 1}. Preview now shows tread count and stringer layout.` : 'No stair edge is assigned yet in the drawing tool.',
      `Railing optimizer favors the lowest-waste combination of 6 ft and 8 ft sections instead of defaulting to long sections.`,
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
  let chairRailLf = 0;
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
    const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
    const wallWidthExcludingDoor = Math.max(0, section.width - doorWidth);
    const receiverPerimeter = section.width * 2 + section.height * 2 - doorWidth;
    receiverLf += receiverPerimeter;
    receiverFastenerTubesLf += receiverPerimeter;
    if (section.floorMount === 'concrete') concreteScrews += ceilDiv(receiverPerimeter / 2, 100) * 100;
    else woodScrews += ceilDiv(receiverPerimeter / 2, 100) * 100;

    const perimeter1x2Lf = renaissance ? receiverPerimeter : receiverPerimeter - (section.kickPanel === 'insulated' ? wallWidthExcludingDoor : 0);
    oneByTwoLf += Math.max(0, perimeter1x2Lf);

    if (section.uprights > 0) {
      const uprightLf = section.uprights * section.height;
      if (renaissance) twoByTwoCustomNoGroove.push(...Array.from({ length: section.uprights }, () => section.height));
      else twoByTwoLf += uprightLf;
    }

    if (section.chairRail) {
      chairRailLf += wallWidthExcludingDoor;
      if (renaissance) {
        if (section.pickets || section.kickPanel === 'insulated') twoByTwoCustomGroove.push(wallWidthExcludingDoor);
        else twoByTwoCustomNoGroove.push(wallWidthExcludingDoor);
      } else twoByTwoLf += wallWidthExcludingDoor;
    }

    if (section.pickets) {
      const picketSpanIn = wallWidthExcludingDoor * 12;
      const sectionPickets = Math.max(0, Math.ceil(picketSpanIn / 4));
      picketCount += sectionPickets;
      if (renaissance) {
        if (section.chairRail) twoByTwoCustomGroove.push(wallWidthExcludingDoor);
      } else {
        uChannelLf += wallWidthExcludingDoor * 2;
        picketStockLf += sectionPickets * 3;
      }
    }

    if (section.kickPanel === 'trim-coil') {
      const kickWidth = wallWidthExcludingDoor;
      vGroove1x2Lf += kickWidth;
      vGroove2x2Lf += kickWidth;
    }

    if (section.kickPanel === 'insulated') {
      const kickWidth = wallWidthExcludingDoor;
      const kickHeight = Math.min(section.kickPanelHeight, 4);
      panelSqFt += kickWidth * kickHeight;
      insulatedReceiverLf += kickWidth;
      if (renaissance) twoByTwoCustomGroove.push(kickWidth);
      else twoByTwoLf += kickWidth;
    }

    if (section.doorType !== 'none') {
      if (section.doorType === 'single') singleDoors += 1;
      if (section.doorType === 'french') { frenchDoors += 1; astragals += 1; }
      if (section.doorSwing === 'inswing') inswingKits += 1;
      const doorHeader = doorWidth;
      if (renaissance) {
        twoByTwoCustomNoGroove.push(section.height, section.height, doorHeader);
      } else {
        twoByTwoLf += (2 * section.height) + doorHeader;
      }
    }

    if (renaissance) {
      oneByTwoCustom.push(section.width, section.width, section.height, section.height);
      const connectionPieces = section.uprights * 2 + (section.chairRail ? 2 : 0) + (section.doorType !== 'none' ? 6 : 0);
      bracketCount += connectionPieces;
      flushMountScrews += connectionPieces * 4;
    } else {
      const connectionPieces = section.uprights * 2 + (section.chairRail ? 2 : 0) + (section.doorType !== 'none' ? 6 : 0);
      capriClips += connectionPieces;
      tekScrewCount += connectionPieces * 4;
    }
  });

  const screenSf = sections.reduce((sum, section) => {
    const doorWidth = section.doorType === 'none' ? 0 : Math.min(section.doorWidth, section.width);
    const kickHeight = section.kickPanel === 'none' ? 0 : Math.min(section.kickPanelHeight, section.kickPanel === 'trim-coil' ? 2 : 4);
    const openWidth = Math.max(0, section.width - doorWidth);
    return sum + openWidth * Math.max(section.height - kickHeight, 0);
  }, 0);
  const screenRolls = Math.max(1, Math.ceil(screenSf / 1000));
  const spline = screenType === 'suntex-80' ? '.285 spline' : '.315 spline';
  const novaflexTubes = Math.max(1, Math.ceil(receiverFastenerTubesLf / 24));
  tekScrewCount += Math.ceil(oneByTwoLf / 2) + Math.ceil(uChannelLf * 2) + Math.ceil(vGroove1x2Lf / 2) + Math.ceil(vGroove2x2Lf / 2);

  if (renaissance) {
    addCustomCutGroups(materials, '1x2 7/8', 'Frame', oneByTwoCustom, `${framingColor} · exact cut list`);
    addCustomCutGroups(materials, '2x2 7/8 no-channel', 'Frame', twoByTwoCustomNoGroove, `${framingColor} · chair rail and doors`);
    addCustomCutGroups(materials, '2x2 7/8 with channel', 'Frame', twoByTwoCustomGroove, `${framingColor} · pickets and insulated kick panel`);
    materials.push(
      toMaterial('Decorative brackets with caps', 'Hardware', bracketCount, 'ea', '4 flush screws each', undefined),
      toMaterial('Flush mount screws', 'Hardware', flushMountScrews, 'ea', '4 per bracket', undefined),
      toMaterial('Pickets 36 in', 'Railing', picketCount, 'ea', 'Precut 36 in', undefined),
      toMaterial('Insulated panel sheets', 'Panel', Math.ceil(panelSqFt / 40), 'sheets', `4x10 sheets · ${panelColor}`, `${panelSqFt.toFixed(1)} sq ft total`),
      toMaterial(screenType === 'suntex-80' ? 'Suntex 80 screen rolls' : '17/20 tuff screen rolls', 'Screen', screenRolls, 'rolls', '10 ft x 100 ft', `${screenSf.toFixed(1)} sq ft net screen`),
      toMaterial(spline, 'Screen', screenRolls, 'rolls', '1 per screen roll', undefined),
      toMaterial('NovaFlex', 'Hardware', novaflexTubes, 'tubes', '1 tube per 24 lf of 1x2', undefined),
      toMaterial('Single doors', 'Doors', singleDoors, 'ea', 'Custom door width', undefined),
      toMaterial('French doors', 'Doors', frenchDoors, 'sets', 'Custom door width', undefined),
      toMaterial('Inswing kits', 'Doors', inswingKits, 'ea', 'Hydraulic jack kit', undefined),
      toMaterial('Astragals', 'Doors', astragals, 'ea', 'French door center', undefined),
      toMaterial('Concrete screws', 'Hardware', concreteScrews, 'ea', 'Floor / masonry mounts', undefined),
      toMaterial('Wood screws', 'Hardware', woodScrews, 'ea', 'Wood mounts', undefined),
    );
  } else {
    add24FtStock(materials, 'Receiver', 'Frame', receiverLf + insulatedReceiverLf, `${framingColor} · includes extra receiver for insulated kick panel`);
    add24FtStock(materials, '1x2', 'Frame', oneByTwoLf, `${framingColor}`);
    add24FtStock(materials, '2x2', 'Frame', twoByTwoLf, `${framingColor} · includes door jambs and headers`);
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
      toMaterial('NovaFlex', 'Hardware', novaflexTubes, 'tubes', '1 tube per 24 ft receiver', undefined),
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
      'Door openings subtract out the wall materials they replace, then add jamb/header framing back in.',
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
  const screenUnderneath = Boolean(inputs.screenUnderneath ?? false);
  const beamStyle = screenUnderneath ? '3x3' : 'atlas';
  const slopeDrop = Math.max(0.5 / 12 * width, attachmentHeight - lowSideHeight);

  let maxProjection = 15;
  if (panelThickness === 3 && metalGauge === '.32' && foamDensity === 2) maxProjection = 19;
  if (panelThickness === 6 && metalGauge === '.32' && foamDensity === 2) maxProjection = 26;
  const overLimit = projection > maxProjection;
  const standard3In = panelThickness === 3 && !(metalGauge === '.32' && foamDensity === 2);
  const supportBeamCount = standard3In && projection > 13 ? Math.ceil(projection / 13) - 1 : 0;

  let panelMix4 = panelWidth === 4 ? Math.floor(width / 4) : 0;
  let panelMix2 = panelWidth === 2 ? Math.ceil(width / 2) : Math.ceil((width - panelMix4 * 4) / 2);
  let notes = 'Standard panel layout';
  if (fanBeam === 'centered' && Math.round(width) % 4 === 0) {
    panelMix4 = Math.max(1, Math.floor((width - 4) / 4));
    const remaining = Math.max(0, width - (panelMix4 * 4) - 4);
    panelMix2 = Math.ceil(remaining / 2);
    notes = 'Centered fan beam layout can mix 4 ft and 2 ft panels to keep symmetry.';
  }
  const panelCount = panelMix4 + panelMix2;
  const panelLength = Math.ceil(projection);
  const frontPostCount = Math.max(2, Math.ceil(width / 6) + 1);
  const hiddenBracketPerPost = beamStyle === '3x3' ? 2 : 1;
  const hiddenBracketCount = frontPostCount * hiddenBracketPerPost;
  const totalBeamLines = 1 + supportBeamCount;
  const washerScrews = panelCount * totalBeamLines * 5;
  const tekScrewLf = width + (projection * 2) + (structureType === 'attached' ? width : 0);
  const tekScrews = Math.ceil((tekScrewLf * 12) / 6);
  const panelSeams = Math.max(panelCount - 1, 0);
  const sealantLf = (panelSeams * projection) + (width * 2) + (projection * 2) + (structureType === 'attached' ? width : 0);
  const sealantTubes = Math.max(1, Math.ceil(sealantLf / 24));
  const gutterPieces = Math.ceil(width / 24);
  const cChannelPieces = structureType === 'attached' ? Math.ceil(width / 24) : 0;
  const fasciaLf = (projection + (5 / 12)) * 2;
  const fasciaPieces = Math.ceil(fasciaLf / 24);
  const beamStockPieces = Math.ceil((width * totalBeamLines) / 24);
  const postStockPieces = Math.ceil((frontPostCount * Math.ceil(lowSideHeight + 1)) / 24);

  const materials: MaterialItem[] = [
    toMaterial('4 ft insulated roof panels', 'Roof system', panelMix4, 'panels', `${panelLength} ft custom length`, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('2 ft insulated roof panels', 'Roof system', panelMix2, 'panels', `${panelLength} ft custom length`, notes),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', 'Front lower side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', `${fasciaLf.toFixed(1)} lf including 5 in gutter cap return on both sides`),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', 'Attached conditions only'),
    toMaterial('Downspout kits', 'Trim', 2, 'kits', '2 per cover', 'Standard on every patio cover'),
    toMaterial(beamStyle === '3x3' ? '3x3 beam stock' : 'Atlas beam stock', 'Structure', beamStockPieces, 'sticks', '24 ft sections', screenUnderneath ? 'Screened-under cover uses 3x3 beam and post system' : 'Open cover uses Atlas beam sitting on top of posts'),
    toMaterial('3x3 post stock', 'Structure', postStockPieces, 'sticks', '24 ft stock', `${frontPostCount} posts cut from stock lengths`),
    toMaterial('Hidden brackets', 'Hardware', hiddenBracketCount, 'ea', `${hiddenBracketPerPost} per post`, beamStyle === '3x3' ? 'Two hidden brackets per post for screened-under framing' : 'One hidden bracket per post when using Atlas beam'),
    toMaterial('Washer screws', 'Hardware', washerScrews, 'ea', '5 per panel per beam line', `${panelCount} panels across ${totalBeamLines} beam line(s)`),
    toMaterial('Tek screws', 'Hardware', tekScrews, 'ea', 'Approx. every 6 in', 'For C-channel, gutter, and fascia'),
    toMaterial('Sealant / NovaFlex', 'Hardware', sealantTubes, 'tubes', 'Approx. 24 lf per tube', `Snap-lock seams + full perimeter + behind C-channel = ${sealantLf.toFixed(1)} lf`),
  ].filter((item) => item.quantity > 0);
  if (fanBeam !== 'none') materials.push(toMaterial('Fan beam panel', 'Roof system', 1, 'ea', fanBeam === 'centered' ? 'Centered' : fanBeam === 'female-offset' ? '1 ft from female side' : '1 ft from male side', 'Panel mix adjusts to accommodate fan beam landing rules'));
  if (supportBeamCount > 0) materials.push(toMaterial(beamStyle === '3x3' ? 'Intermediate 3x3 support beam' : 'Intermediate support beam', 'Structure', supportBeamCount, 'lines', `${width.toFixed(1)} ft each`, 'Added because projection exceeds 13 ft without the full upgrade package'));

  return {
    summary: [
      { label: 'Roof area', value: `${(width * projection).toFixed(1)} sq ft` },
      { label: 'Panel mix', value: `${panelMix4}x4' + ${panelMix2}x2'` },
      { label: 'Slope drop', value: feetAndInches(Math.max(slopeDrop, projection * (0.5 / 12))) },
      { label: 'Projection check', value: overLimit ? `Over ${maxProjection} ft rule` : `Within ${maxProjection} ft rule` },
    ],
    materials,
    orderNotes: [
      `Minimum slope check uses 1/2 in per foot.`,
      `This selection checks against your ${maxProjection} ft max projection rule for the chosen panel package.${overLimit ? ' Current inputs exceed that limit and need more upgrade or redesign.' : ''}`,
      supportBeamCount > 0 ? `Projection is over 13 ft without the full upgrade package, so ${supportBeamCount} intermediate support beam line(s) were added.` : 'No intermediate support beam was required by the current projection/upgrade combination.',
      fanBeam === 'none' ? 'No fan beam selected.' : notes,
    ],
  };
}
