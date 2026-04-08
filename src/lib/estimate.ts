import { buildDeckModel } from './deckModel';
import { EstimateResult, MaterialItem } from './types';

export type EstimateInputs = Record<string, string | number | boolean>;

const toMaterial = (
  name: string,
  category: string,
  quantity: number,
  unit: string,
  stockRecommendation: string,
  notes?: string,
): MaterialItem => ({
  name,
  category,
  quantity: Number(quantity.toFixed(2)),
  unit,
  stockRecommendation,
  notes,
});

const addBoardGroups = (
  materials: MaterialItem[],
  category: string,
  prefix: string,
  groups: { length: number; count: number }[],
  notes: string,
) => {
  groups.forEach((group) => {
    if (group.count > 0) {
      materials.push(toMaterial(`${prefix} ${group.length}'`, category, group.count, 'boards', `${group.length} ft stock`, notes));
    }
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
  addBoardGroups(
    materials,
    'Decking',
    'Field deck board',
    deck.boardGroups,
    deck.boardRun === 'width'
      ? 'Boards run out from the house; counts are grouped by stock length from the drawn footprint.'
      : 'Boards run parallel to the house; counts are grouped by stock length from the drawn footprint.',
  );
  addBoardGroups(
    materials,
    'Decking',
    'Border / picture-frame board',
    deck.borderGroups,
    'Border boards grouped from exposed perimeter segments only.',
  );
  addBoardGroups(
    materials,
    'Stairs',
    'Stair tread board',
    deck.stairTreadGroups,
    'Two boards per tread, grouped by stair width.',
  );
  addBoardGroups(
    materials,
    'Framing',
    `${deck.joistSize} joist`,
    deck.joistLengthGroups,
    '12 in on-center joists from the drawn footprint.',
  );
  addBoardGroups(
    materials,
    'Framing',
    `${deck.beamMemberSize} beam ply`,
    deck.beamBoardGroups,
    'Double beam, one size larger than joists.',
  );
  addBoardGroups(
    materials,
    'Framing',
    `${deck.joistSize} double band / rim board`,
    deck.doubleBandGroups,
    'Double band all around for strength.',
  );

  materials.push(
    toMaterial(`${deck.joistSize} blocking`, 'Framing', deck.blockingBoardCount, 'boards', '8 ft stock', 'Blocking added on left and right sides for border support.'),
    toMaterial('6x6 posts', 'Foundation + posts', deck.postCount, 'posts', `${deck.postLength} ft stock`, 'Notched posts with beam sitting on post.'),
    toMaterial('80 lb concrete bags', 'Foundation + posts', deck.concreteBags, 'bags', '3 bags per post', 'Footer standard: 3 bags per post.'),
    toMaterial('Post brackets', 'Foundation + posts', deck.postBases, 'ea', 'One per post', 'Each bracket anchored to footing.'),
    toMaterial('1/2 in concrete anchors', 'Foundation + posts', deck.concreteAnchors, 'ea', 'One per bracket', 'One concrete anchor per post bracket.'),
    toMaterial('Joist hangers', 'Hardware', deck.joistHangers, 'ea', `${deck.joistSize} hangers`, deck.isFreestanding ? 'Freestanding condition counts house-side and outer-side hangers.' : 'Attached ledger counts one hanger per joist.'),
    toMaterial('Rafter ties', 'Hardware', deck.rafterTies, 'ea', 'One per joist at each beam line', 'Attached with 1-1/2 in nails.'),
    toMaterial('1/2 in carriage bolts', 'Hardware', deck.carriageBolts, 'ea', 'Beam/post and railing posts', 'Two per beam post connection and two per wood/vinyl railing post.'),
    toMaterial('1/2 in washers', 'Hardware', deck.carriageBolts, 'ea', 'Match carriage bolts', undefined),
    toMaterial('1/2 in nuts', 'Hardware', deck.carriageBolts, 'ea', 'Match carriage bolts', undefined),
    toMaterial('3 in framing screws', 'Hardware', Math.max(1, Math.ceil(deck.width / 2) + deck.blockingCount), 'ea', 'Front framing + blocking', 'Used for the front of the deck and blocking assembly.'),
    toMaterial('3 in hanger / bracket nails', 'Hardware', deck.joistHangers + deck.postBases, 'ea', 'Hangers and post brackets', 'Used for hangers and post brackets.'),
    toMaterial('1-1/2 in tie nails', 'Hardware', deck.rafterTies * 4, 'ea', 'Rafter tie install', 'Used for rafter ties.'),
    toMaterial('Lateral load brackets', 'Hardware', deck.lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', 'Ledger-only hardware. Omitted on freestanding/brick conditions.'),
    toMaterial('Structural SDS screws', 'Hardware', deck.sdsCorners, 'ea', 'Band board corners', 'One at each band corner.'),
    toMaterial(deck.fastenerType === 'top screws' ? 'Top-mount deck screw boxes' : '2-3/8 in CAMO screw boxes', 'Hardware', deck.deckFastenerBoxes, 'boxes', deck.fastenerType === 'top screws' ? '365 screws / box' : '1750 screws / box', 'Two fasteners per joist intersection.'),
    toMaterial('Joist tape', 'Hardware', Math.ceil(deck.joistTapeLf), 'lf', 'Linear footage', 'Covers joists and band boards.'),
    toMaterial("Fascia board 12'", 'Trim', deck.fasciaPieces, 'boards', '12 ft stock', 'Includes band board fascia plus stair sides and risers.'),
    toMaterial('Color matching fascia screw boxes', 'Trim', Math.max(1, Math.ceil(deck.fasciaPieces / 8)), 'boxes', '75 / box', 'For fascia install.'),
    toMaterial('2x12 stair stringers', 'Stairs', deck.stairStringers, 'boards', `${deck.stairStringerLength} ft stock`, 'Stringers built on site at 12 in on-center.'),
    toMaterial('8 ft railing sections', 'Railing', deck.railingSections8, 'sections', '8 ft kits', `Railing type: ${railingType}.`),
    toMaterial('6 ft railing sections', 'Railing', deck.railingSections6, 'sections', '6 ft kits', `Railing type: ${railingType}.`),
    toMaterial('4x4 railing posts', 'Railing', deck.railingPosts, 'posts', 'PT 4x4 stock', 'Required for wood, vinyl, and composite railing systems.'),
  );

  const filteredMaterials = materials.filter((item) => item.quantity > 0);

  return {
    summary: [
      { label: 'Deck area', value: `${deck.area.toFixed(1)} sq ft` },
      { label: 'Exposed perimeter', value: `${deck.exposedPerimeter.toFixed(1)} lf` },
      { label: 'Joist package', value: `${deck.joistCount} @ ${deck.joistSize}` },
      { label: 'Beam lines', value: `${deck.beamLines.length}` },
      { label: 'Posts', value: `${deck.postCount}` },
      { label: 'Stair risers', value: `${deck.stairRisers}` },
    ],
    materials: filteredMaterials,
    orderNotes: [
      deck.attachment === 'brick'
        ? 'Brick wall decks are treated as freestanding, so the house side gets its own beam and post line instead of a ledger.'
        : deck.attachment === 'siding'
          ? 'Attached siding decks keep the ledger at the house and work backward from a 2 ft front cantilever with roughly 10 ft max support spacing.'
          : 'Freestanding decks receive beam/post support at the house side and the front side.',
      `Post layout targets about 6 ft spacing so the design stays comfortably inside your 7.5 ft maximum and avoids designing at the limit.`,
      `Beam package uses ${deck.beamMemberSize} because the widest clear post span in this layout is about ${Math.max(0, ...deck.beamLines.flatMap((line) => line.postXs.slice(1).map((x, index) => x - line.postXs[index]))).toFixed(2)} ft.`,
      'Deck boards, border boards, stair treads, and framing members are grouped by stock length so the order sheet reads more like how your crew buys and stages materials.',
      deck.stairPlacement.edgeIndex !== null
        ? `Stairs are assigned to edge P${deck.stairPlacement.edgeIndex + 1} with about ${deck.stairPlacement.offset.toFixed(1)} ft offset from the start of that edge.`
        : 'No stair edge is assigned yet in the drawing tool.',
      deck.manualRailingEdges.length > 0
        ? `Manual railing selection is active on ${deck.manualRailingEdges.length} edge${deck.manualRailingEdges.length === 1 ? '' : 's'}.`
        : 'Railing defaults to all exposed edges until you manually override it in the drawing tool.',
      'Beam lines can now be dragged in the drawing tool, but the final framing should still be field-checked before ordering.',
    ],
  };
}

function estimateScreenRoom(inputs: EstimateInputs, renaissance: boolean): EstimateResult {
  const openingCount = Number(inputs.openingCount ?? 0);
  const openingWidth = Number(inputs.openingWidth ?? 0);
  const openingHeight = Number(inputs.openingHeight ?? 0);
  const uprightsPerOpening = Number(inputs.uprightsPerOpening ?? 0);
  const doorCount = Number(inputs.doorCount ?? 0);
  const doorType = String(inputs.doorType ?? 'single');
  const screenType = String(inputs.screenType ?? 'suntex-80');
  const chairRailMode = String(inputs.chairRailMode ?? 'chair-rail');
  const picketSections = Number(inputs.picketSections ?? 0);

  const perimeterLf = openingCount * openingWidth;
  const totalScreenSf = openingCount * openingWidth * openingHeight;
  const screenRolls = Math.max(1, Math.ceil((totalScreenSf * 1.12) / 100));
  const doorKits = doorType === 'french' ? doorCount * 2 : doorCount;
  const uprightCount = openingCount * uprightsPerOpening;

  const prefix = renaissance ? 'Renaissance' : 'Standard';
  const materials = [
    toMaterial(`${prefix} receiver`, 'Extrusions', perimeterLf * 2, 'lf', '10 ft / 12 ft stock', 'Top + bottom runs'),
    toMaterial(`${prefix} posts`, 'Extrusions', openingCount + 1, 'ea', `${Math.ceil(openingHeight + 1)} ft post stock`, undefined),
    toMaterial(`${prefix} uprights`, 'Extrusions', uprightCount, 'ea', `${Math.ceil(openingHeight)} ft stock`, undefined),
    toMaterial('Chair rail members', 'Infill', chairRailMode === 'chair-rail' || chairRailMode === 'pickets-chair-rail' ? openingCount : 0, 'ea', `${Math.ceil(openingWidth)} ft stock`, undefined),
    toMaterial('Picket packages', 'Infill', chairRailMode === 'pickets-chair-rail' ? Math.max(picketSections, openingCount) : 0, 'sections', 'Match opening widths', undefined),
    toMaterial('Door kits', 'Doors', doorKits, 'kits', doorType === 'french' ? 'French door package' : 'Single door package', undefined),
    toMaterial('Screen rolls', 'Screening', screenRolls, 'rolls', screenType === 'suntex-80' ? '100 lf Suntex 80' : '100 lf 17/20 Tuff Screen', undefined),
    toMaterial('Spline / fastener bundle', 'Accessories', openingCount, 'bundles', '.285 / .310 spline + screws', 'Bundle logic should map to exact vendor SKUs later'),
  ].filter((item) => item.quantity > 0);

  return {
    summary: [
      { label: 'Opening run', value: `${perimeterLf.toFixed(1)} lf` },
      { label: 'Screen area', value: `${totalScreenSf.toFixed(1)} sq ft` },
      { label: 'Door kits', value: `${doorKits}` },
      { label: 'System', value: renaissance ? 'Renaissance' : 'Standard' },
    ],
    materials,
    orderNotes: [
      'All extrusion counts are split from accessories so S&S can swap in exact vendor product codes later.',
      'Door placement, individual opening widths, and mixed opening layouts can be layered into the next rule iteration.',
    ],
  };
}

function estimatePatioCover(inputs: EstimateInputs): EstimateResult {
  const width = Number(inputs.width ?? 0);
  const projection = Number(inputs.projection ?? 0);
  const attachmentHeight = Number(inputs.attachmentHeight ?? 0);
  const lowSideHeight = Number(inputs.lowSideHeight ?? 0);
  const structureType = String(inputs.structureType ?? 'attached');
  const beamCount = Number(inputs.beamCount ?? 0);
  const slopeDrop = Math.max(attachmentHeight - lowSideHeight, 0);
  const panelCount = Math.ceil(width);
  const postCount = structureType === 'freestanding' ? Math.max(4, Math.ceil(width / 10) + 1) : Math.max(2, Math.ceil(width / 10));
  const trussSpacing = width / Math.max(panelCount - 1, 1);

  const materials = [
    toMaterial('Roof panels', 'Roof System', panelCount, 'ea', `${Math.ceil(projection)} ft panel length`, 'Assumes ~12 in module widths'),
    toMaterial('Front beam', 'Structure', beamCount, 'ea', `${Math.ceil(width)} ft stock or segmented beam`, undefined),
    toMaterial('Posts', 'Structure', postCount, 'ea', `${Math.ceil(lowSideHeight + 1)} ft stock`, undefined),
    toMaterial('Attachment channel', 'Structure', structureType === 'attached' ? 1 : 0, 'ea', `${Math.ceil(width)} ft channel`, undefined),
    toMaterial('Gutter / fascia trim', 'Trim', Math.ceil(width), 'lf', '10 ft sections', undefined),
    toMaterial('Anchor + fastener package', 'Hardware', postCount, 'kits', 'Per-post hardware bundle', undefined),
  ].filter((item) => item.quantity > 0);

  return {
    summary: [
      { label: 'Roof area', value: `${(width * projection).toFixed(1)} sq ft` },
      { label: 'Slope drop', value: `${slopeDrop.toFixed(2)} ft` },
      { label: 'Estimated posts', value: `${postCount}` },
      { label: 'Avg. truss spacing', value: `${trussSpacing.toFixed(2)} ft` },
    ],
    materials,
    orderNotes: [
      'Current panel logic uses width modules; replace with manufacturer-specific panel widths and frame member tables when provided.',
      'The patio cover view can expand to support integrated screen room conversion later without reworking the UI shell.',
    ],
  };
}
