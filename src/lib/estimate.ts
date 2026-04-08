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

const addBoardGroups = (materials: MaterialItem[], category: string, prefix: string, groups: { length: number; count: number }[], notes: string) => {
  groups.forEach((group) => {
    if (group.count > 0) materials.push(toMaterial(`${prefix} ${group.length}'`, category, group.count, 'boards', `${group.length} ft stock`, notes));
  });
};

const add24FtStock = (materials: MaterialItem[], name: string, category: string, lf: number, notes?: string) => {
  if (lf <= 0) return;
  materials.push(toMaterial(name, category, Math.ceil(lf / 24), 'sticks', '24 ft stock', `${lf.toFixed(1)} lf total${notes ? ` · ${notes}` : ''}`));
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

  addBoardGroups(materials, 'Decking', 'Field deck board', deck.boardGroups, deck.boardRun === 'width' ? 'Boards run out from the house.' : 'Boards run parallel to the house.');
  addBoardGroups(materials, 'Decking', 'Border / picture-frame board', deck.borderGroups, 'Border boards grouped from exposed perimeter segments only.');
  addBoardGroups(materials, 'Stairs', 'Stair tread board', deck.stairTreadGroups, 'Two tread boards per tread.');
  addBoardGroups(materials, 'Framing', `${deck.joistSize} joist`, deck.joistLengthGroups, 'Joists at 12 in. O.C.');
  addBoardGroups(materials, 'Framing', `${deck.beamMemberSize} beam ply`, deck.beamBoardGroups, 'Doubled beam members.');
  addBoardGroups(materials, 'Framing', 'Double band / rim board', deck.doubleBandGroups, 'Double band applied to full perimeter.');

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
    toMaterial('SDS structural screws', 'Hardware', deck.sdsCorners, 'ea', 'Corners of band board', undefined),
    toMaterial('Joist tape', 'Hardware', deck.joistTapeLf, 'lf', 'Match roll coverage', undefined),
    toMaterial(deck.fastenerType === 'top screws' ? '3 in deck screws' : '2-3/8 in CAMO screws', 'Hardware', deck.deckFastenerBoxes, 'boxes', deck.fastenerType === 'top screws' ? '365 per box' : '1750 per box', undefined),
    toMaterial('3 in framing nails', 'Hardware', Math.ceil((deck.joistHangers + deck.postBases) / 50), 'boxes', '50 ct box', 'For hangers and post brackets'),
    toMaterial('1-1/2 in nails', 'Hardware', Math.ceil(deck.rafterTies / 120), 'boxes', '120 ct box', 'For rafter ties'),
    toMaterial('Fascia', 'Trim', deck.fasciaPieces, 'boards', '12 ft fascia boards', `${deck.fasciaLf.toFixed(1)} lf including stair sides and risers`),
  );

  if (deck.stairStringers > 0) materials.push(toMaterial('2x12 stringers', 'Stairs', deck.stairStringers, 'boards', `${deck.stairStringerLength} ft stock`, 'Stringers cut on site at 12 in. O.C.'));
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
      { label: 'Joists', value: `${deck.joistSize} @ 12 in O.C.` },
      { label: 'Beam lines / posts', value: `${deck.beamLines.length} / ${deck.postCount}` },
      { label: 'Railing run', value: `${deck.railingRun.toFixed(1)} lf` },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      deck.attachment === 'brick' ? 'Brick attachment is treated as freestanding, so the house side still needs beam and post support.' : 'Siding attachment keeps ledger logic active unless the deck is marked freestanding.',
      deck.stairPlacement.edgeIndex !== null ? `Stairs are assigned to edge ${deck.stairPlacement.edgeIndex + 1} and can be dragged along that edge in the drawing tool.` : 'No stair edge is assigned yet in the drawing tool.',
      deck.manualRailingEdges.length > 0 ? `Manual railing selection is active on ${deck.manualRailingEdges.length} edge(s).` : 'Railing defaults to exposed edges until you override them in the drawing tool.',
      deck.lockedPosts.length > 0 ? 'Locked posts stay in the take-off even after beam edits so you can preserve preferred field locations.' : 'Use post lock mode when you want to hold a post location while still letting the app auto-space the rest.',
    ],
  };
}

function estimateScreenRoom(inputs: EstimateInputs, renaissance: boolean): EstimateResult {
  const sections = parseSections(inputs.sections, 3);
  const screenType = String(inputs.screenType ?? 'suntex-80');
  const mountingSurface = String(inputs.mountingSurface ?? 'concrete');
  const framingColor = String(inputs.framingColor ?? 'white');
  const panelColor = String(inputs.panelColor ?? 'white');
  const prefix = renaissance ? 'Renaissance' : 'Standard';
  const totalWidth = sections.reduce((sum, section) => sum + section.width, 0);
  const totalScreenSf = sections.reduce((sum, section) => {
    const kickHeight = section.kickPanel === 'none' ? 0 : 3;
    return sum + section.width * Math.max(section.height - kickHeight, 0);
  }, 0);
  const screenRolls = Math.max(1, Math.ceil(totalScreenSf / 1000));
  const spline = screenType === 'suntex-80' ? '.285 spline' : '.315 spline';

  let receiverLf = 0;
  let oneByTwoLf = 0;
  let twoByTwoLf = 0;
  let chairRailLf = 0;
  let uChannelLf = 0;
  let picketCount = 0;
  let picketSpacerCount = 0;
  let tekScrewCount = 0;
  let capriClips = 0;
  let bracketCount = 0;
  let kick1x2Lf = 0;
  let kick2x2Lf = 0;
  let panelSqFt = 0;
  let singleDoors = 0;
  let frenchDoors = 0;
  let inswingKits = 0;
  let astragals = 0;

  sections.forEach((section) => {
    const perimeterLf = (section.width * 2) + (section.height * 2);
    receiverLf += perimeterLf;
    oneByTwoLf += renaissance ? perimeterLf : section.kickPanel === 'insulated' ? perimeterLf - section.width : perimeterLf;
    if (!renaissance && section.kickPanel === 'insulated') receiverLf += section.width;

    twoByTwoLf += section.uprights * section.height;
    if (section.chairRail) {
      twoByTwoLf += section.width;
      chairRailLf += section.width;
    }

    if (section.pickets) {
      const sectionPickets = Math.ceil((section.width * 12) / 4);
      picketCount += sectionPickets;
      picketSpacerCount += Math.max(sectionPickets - 1, 0);
      uChannelLf += section.width * 2;
    }

    if (section.kickPanel === 'trim-coil') {
      kick1x2Lf += section.width;
      kick2x2Lf += section.width;
    }
    if (section.kickPanel === 'insulated') panelSqFt += section.width * 3;

    if (section.doorType !== 'none') {
      twoByTwoLf += 2 * section.height + 3;
      if (section.doorType === 'single') singleDoors += 1;
      if (section.doorType === 'french') {
        frenchDoors += 1;
        astragals += 1;
      }
      if (section.doorSwing === 'inswing') inswingKits += 1;
    }

    const connectionPieces = section.uprights * 2 + (section.chairRail ? 2 : 0) + (section.doorType !== 'none' ? 6 : 0);
    if (renaissance) bracketCount += connectionPieces;
    else capriClips += connectionPieces;
  });

  const concreteOrWoodFasteners = Math.max(1, Math.ceil((receiverLf / 2) / 100));
  tekScrewCount = renaissance ? bracketCount * 4 : Math.ceil(oneByTwoLf / 2) + capriClips * 4 + picketCount * 2;
  const tekBags = Math.max(1, Math.ceil(tekScrewCount / 250));
  const novaflex = Math.max(1, Math.ceil((renaissance ? oneByTwoLf : receiverLf) / 24));
  const panelSheets = panelSqFt > 0 ? Math.ceil(panelSqFt / 40) : 0;
  const trimCoilRolls = kick1x2Lf > 0 ? Math.max(1, Math.ceil(totalWidth / 100)) : 0;
  const materials: MaterialItem[] = [];

  if (renaissance) {
    materials.push(
      toMaterial(`${framingColor} 1x2 7/8 custom cuts`, 'Frame', oneByTwoLf, 'lf', 'Custom cut lengths', 'Perimeter framing'),
      toMaterial(`${framingColor} 2x2 7/8 custom cuts`, 'Frame', twoByTwoLf, 'lf', 'Custom cut lengths', 'Uprights, chair rail, and door framing'),
      toMaterial('L brackets with decorative caps', 'Hardware', bracketCount, 'ea', '4 flush-mount screws each', undefined),
    );
    if (picketCount) materials.push(toMaterial('Renaissance pickets', 'Railing', picketCount, 'ea', '36 in pickets', undefined));
    if (picketSpacerCount) materials.push(toMaterial('Picket spacers', 'Railing', picketSpacerCount, 'ea', 'Match picket count', undefined));
  } else {
    add24FtStock(materials, `${framingColor} receiver`, 'Frame', receiverLf, 'Perimeter receiver');
    add24FtStock(materials, `${framingColor} 1x2`, 'Frame', oneByTwoLf, sections.some((section) => section.kickPanel === 'insulated') ? 'Bottom 1x2 removed where insulated panel slides into receiver' : 'Full perimeter infill');
    add24FtStock(materials, `${framingColor} 2x2`, 'Frame', twoByTwoLf, 'Uprights, chair rail, and door framing');
    if (uChannelLf) add24FtStock(materials, 'U-channel', 'Railing', uChannelLf, 'Top and bottom for picket sections');
    if (capriClips) materials.push(toMaterial('Capri clips', 'Hardware', Math.ceil(capriClips / 50), 'packs', '50 per pack', `${capriClips} clips total`));
    if (kick1x2Lf) add24FtStock(materials, '1x2 V-groove', 'Kick panel', kick1x2Lf, 'Trim coil kick panel');
    if (kick2x2Lf) add24FtStock(materials, '2x2 V-groove', 'Kick panel', kick2x2Lf, 'Trim coil kick panel');
  }

  if (chairRailLf) materials.push(toMaterial('Chair rail run', 'Railing', chairRailLf, 'lf', renaissance ? 'Included in custom 2x2 7/8 cuts' : 'Included in 2x2 stock', undefined));
  if (picketCount) materials.push(toMaterial('Pickets', 'Railing', picketCount, 'ea', '36 in pickets', renaissance ? 'Slides into center channels with spacers' : 'Screwed top and bottom to U-channel'));
  if (panelSheets) materials.push(toMaterial(`${panelColor} insulated panels`, 'Kick panel', panelSheets, 'sheets', renaissance ? '4 ft x 10 ft x 3/4 in' : '4 ft x 10 ft x 2 in', undefined));
  if (trimCoilRolls) materials.push(toMaterial('24 in trim coil', 'Kick panel', trimCoilRolls, 'rolls', '2 ft x 100 ft roll', undefined));
  if (singleDoors) materials.push(toMaterial('Single doors', 'Doors', singleDoors, 'ea', renaissance ? '36x80 Renaissance door' : '3x6-8 door', undefined));
  if (frenchDoors) materials.push(toMaterial('French doors', 'Doors', frenchDoors, 'ea', renaissance ? 'Renaissance French doors' : 'French door package', undefined));
  if (inswingKits) materials.push(toMaterial('Inswing kits', 'Doors', inswingKits, 'kits', '1 per inswing door set', undefined));
  if (astragals) materials.push(toMaterial('Astragals', 'Doors', astragals, 'ea', '1 per French door set', undefined));
  materials.push(
    toMaterial(mountingSurface === 'concrete' ? 'Concrete screw bags' : '3 in wood screw bags', 'Hardware', concreteOrWoodFasteners, 'bags', 'Receiver fasteners', undefined),
    toMaterial('Tek screw bags', 'Hardware', tekBags, 'bags', 'Approx. 250 per bag', `${tekScrewCount} screws estimated`),
    toMaterial(spline, 'Screening', Math.max(1, screenRolls), 'rolls', 'Match screen rolls', undefined),
    toMaterial(screenType === 'suntex-80' ? 'Suntex 80 screen' : '17/20 tuff screen', 'Screening', screenRolls, 'rolls', '10 ft x 100 ft', `${totalScreenSf.toFixed(1)} sq ft of screen area`),
    toMaterial('NovaFlex', 'Accessories', novaflex, 'tubes', '1 tube per 24 lf', undefined),
  );

  return {
    summary: [
      { label: 'Sections', value: `${sections.length}` },
      { label: 'Frontage', value: `${totalWidth.toFixed(1)} lf` },
      { label: 'Screen area', value: `${totalScreenSf.toFixed(1)} sq ft` },
      { label: 'System', value: prefix },
    ],
    materials: materials.filter((item) => item.quantity > 0),
    orderNotes: [
      'Each section can be edited independently, including width, height, uprights, chair rail, pickets, kick panel type, and door placement.',
      renaissance ? 'Renaissance output keeps frame members as custom-cut lengths instead of collapsing everything into 24 ft sticks.' : 'Standard screen room output groups frame members into 24 ft stock to match your ordering workflow.',
      `Screen type is ${screenType === 'suntex-80' ? 'Suntex 80 with .285 spline' : 'standard tuff screen with .315 spline'}.`,
    ],
  };
}

function estimatePatioCover(inputs: EstimateInputs): EstimateResult {
  const width = Number(inputs.width ?? 0);
  const projection = Number(inputs.projection ?? 0);
  const attachmentHeight = Number(inputs.attachmentHeight ?? 0);
  const lowSideHeight = Number(inputs.lowSideHeight ?? 0);
  const structureType = String(inputs.structureType ?? 'attached');
  const panelWidth = Number(inputs.panelWidth ?? 4);
  const panelThickness = Number(inputs.panelThickness ?? 3);
  const metalGauge = String(inputs.metalGauge ?? '.26');
  const foamDensity = Number(inputs.foamDensity ?? 1);
  const fanBeam = String(inputs.fanBeam ?? 'none');
  const slopeDrop = Math.max(attachmentHeight - lowSideHeight, 0);
  const panelCount = Math.ceil(width / panelWidth);
  const panelLength = Math.ceil(projection);
  const gutterPieces = Math.ceil(width / 24);
  const fasciaPieces = Math.ceil((projection * 2) / 24);
  const cChannelPieces = structureType === 'attached' ? Math.ceil(width / 24) : 0;
  const postCount = structureType === 'freestanding' ? Math.max(4, Math.ceil(width / 8) + 1) : Math.max(2, Math.ceil(width / 10));
  const maxProjection = panelThickness === 6 ? 26 : metalGauge === '.32' && foamDensity === 2 ? 19 : 15;
  const overLimit = projection > maxProjection;
  const materials: MaterialItem[] = [
    toMaterial(`${panelWidth} ft insulated roof panels`, 'Roof system', panelCount, 'panels', `${panelLength} ft custom length`, `${panelThickness} in panel · ${metalGauge} skin · ${foamDensity} lb foam`),
    toMaterial('Front gutter', 'Trim', gutterPieces, 'sticks', '24 ft sections', 'Used on front low side only'),
    toMaterial('Drip-edge fascia', 'Trim', fasciaPieces, 'sticks', '24 ft sections', 'Left and right sides'),
    toMaterial('C-channel', 'Trim', cChannelPieces, 'sticks', '24 ft sections', 'Attached conditions only'),
    toMaterial('Front beam line', 'Structure', 1, 'ea', `${width.toFixed(1)} ft total`, fanBeam !== 'none' ? `Fan beam: ${fanBeam}` : 'No fan beam'),
    toMaterial('Posts', 'Structure', postCount, 'ea', `${Math.ceil(lowSideHeight + 1)} ft stock`, structureType === 'freestanding' ? 'Freestanding cover' : 'Front support line'),
  ].filter((item) => item.quantity > 0);

  return {
    summary: [
      { label: 'Roof area', value: `${(width * projection).toFixed(1)} sq ft` },
      { label: 'Panel count', value: `${panelCount}` },
      { label: 'Slope drop', value: `${slopeDrop.toFixed(2)} ft` },
      { label: 'Projection check', value: overLimit ? `Over ${maxProjection} ft rule` : `Within ${maxProjection} ft rule` },
    ],
    materials,
    orderNotes: [
      `This selection checks against an approximate ${maxProjection} ft max projection based on panel thickness, metal thickness, and foam density.`,
      structureType === 'attached' ? 'Attached jobs include C-channel where panels slide into the house connection and get screwed from the top.' : 'Freestanding jobs remove the house C-channel and need full support framing.',
      fanBeam === 'none' ? 'No fan beam selected.' : `Fan beam selected: ${fanBeam}.`,
    ],
  };
}
