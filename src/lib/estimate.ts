import { DeckPoint, EstimateResult, MaterialItem } from './types';

export type EstimateInputs = Record<string, string | number | boolean>;

const STOCK_LENGTHS = [8, 10, 12, 16, 20];
const DECK_BOARD_COVERAGE_FT = 5.5 / 12;
const DECK_BOARD_GAP_FT = 0.125 / 12;
const EFFECTIVE_BOARD_COVERAGE = DECK_BOARD_COVERAGE_FT + DECK_BOARD_GAP_FT;
const JOIST_SPACING_FT = 1;
const POST_TARGET_SPACING = 6.5;
const POST_MAX_SPACING = 7.5;

const roundUp = (value: number, precision = 0) => {
  const factor = 10 ** precision;
  return Math.ceil(value * factor) / factor;
};

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

const chooseStockLength = (required: number, available: number[] = STOCK_LENGTHS) => {
  const found = available.find((length) => length >= required);
  return found ?? available[available.length - 1];
};

const parseDeckShape = (raw: string | number | boolean | undefined): DeckPoint[] => {
  if (typeof raw !== 'string') {
    return [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 12 },
      { x: 0, y: 12 },
    ];
  }

  try {
    const parsed = JSON.parse(raw) as DeckPoint[];
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    }
  } catch {
    return [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 12 },
      { x: 0, y: 12 },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 12 },
    { x: 0, y: 12 },
  ];
};

const polygonArea = (points: DeckPoint[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum / 2);
};

const polygonPerimeter = (points: DeckPoint[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return sum;
};

const polygonBounds = (points: DeckPoint[]) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
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
  const deckShape = parseDeckShape(inputs.deckShape);
  const attachment = String(inputs.attachment ?? 'siding');
  const boardRun = String(inputs.boardRun ?? 'width');
  const deckingType = String(inputs.deckingType ?? 'composite');
  const borderSameBoard = Boolean(inputs.borderSameBoard);
  const deckHeight = Number(inputs.deckHeight ?? 0);
  const railingRun = Number(inputs.perimeterRailingFt ?? 0);
  const railingType = String(inputs.railingType ?? 'aluminum');
  const stairCount = Number(inputs.stairCount ?? 0);
  const stairWidth = Number(inputs.stairWidth ?? 0);
  const stairRise = Number(inputs.stairRise ?? 0);

  const area = polygonArea(deckShape);
  const perimeter = polygonPerimeter(deckShape);
  const { width, depth } = polygonBounds(deckShape);
  const boardLengthRequired = boardRun === 'width' ? depth : width;
  const boardStockLength = chooseStockLength(boardLengthRequired, [8, 12, 16, 20]);
  const boardCount = Math.ceil((boardRun === 'width' ? width : depth) / EFFECTIVE_BOARD_COVERAGE);
  const stairRisers = stairCount > 0 ? Math.ceil((stairRise * 12) / 7.5) : 0;
  const stairTreadsPerRun = stairCount > 0 ? Math.max(stairRisers - 1, 1) : 0;
  const stairTreadBoards = stairCount > 0 ? Math.ceil((stairWidth * stairTreadsPerRun * stairCount * 2) / chooseStockLength(stairWidth, [8, 12, 16])) : 0;

  const joistSpanTarget = attachment === 'siding'
    ? Math.max(depth - 2, depth / 2)
    : depth <= 14
      ? depth / 2
      : Math.min(depth / 2, 14);

  const joistSize = joistSpanTarget <= 12 ? '2x8' : joistSpanTarget <= 14 ? '2x10' : '2x12';
  const joistStockLength = chooseStockLength(Math.min(depth, joistSize === '2x8' ? 12 : joistSize === '2x10' ? 14 : 16));
  const joistCount = Math.max(2, Math.floor(width / JOIST_SPACING_FT) + 1);
  const joistLinearFeet = joistCount * joistStockLength;

  const beamRows = attachment === 'siding' ? 1 : depth > 14 ? 2 : 2;
  const beamSize = joistSize === '2x8' ? '2x10' : joistSize === '2x10' ? '2x12' : 'PSL';
  const frontBeamSpan = width;
  const postsPerBeam = Math.max(3, Math.ceil(frontBeamSpan / POST_TARGET_SPACING) + 1);
  const actualPostSpacing = frontBeamSpan / Math.max(postsPerBeam - 1, 1);
  const postsPerBeamAdjusted = actualPostSpacing > POST_MAX_SPACING ? postsPerBeam + 1 : postsPerBeam;
  const postCount = beamRows * postsPerBeamAdjusted;
  const postStockLength = chooseStockLength(deckHeight + 2, [8, 10, 12, 16]);
  const beamStockLength = beamSize === 'PSL'
    ? 20
    : chooseStockLength(Math.min(frontBeamSpan / Math.max(postsPerBeamAdjusted - 1, 1) + 1, beamSize === '2x10' ? 7 : 9), [8, 10, 12, 16]);
  const beamSegmentsPerRow = Math.ceil(frontBeamSpan / (beamSize === '2x10' ? 7 : beamSize === '2x12' ? 9 : 13));

  const deckBoardWasteFactor = 1.08;
  const deckBoardPieces = Math.ceil(boardCount * deckBoardWasteFactor);
  const borderLf = borderSameBoard ? perimeter : 0;
  const borderPieces = borderSameBoard ? Math.ceil(borderLf / boardStockLength) : 0;
  const houseSideLength = width;
  const doubleBandLf = perimeter + houseSideLength;
  const bandBoardSize = joistSize;
  const bandBoardStock = chooseStockLength(Math.max(width, depth), [8, 10, 12, 16, 20]);
  const bandBoardPieces = Math.ceil((doubleBandLf * 2) / bandBoardStock);
  const blockingRows = 2;
  const blockingCount = joistCount * blockingRows;
  const blockingStockPieces = Math.ceil((blockingCount * 1.5) / 8);

  const joistTapeLf = joistLinearFeet + doubleBandLf;
  const joistHangers = attachment === 'siding' ? joistCount : joistCount * 2;
  const rafterTies = joistCount * beamRows;
  const postBases = postCount;
  const concreteBags = postCount * 3;
  const concreteAnchors = postCount;
  const carriageBolts = postCount * 2 + (railingType === 'wood' || railingType === 'vinyl-composite' ? Math.max(2, Math.ceil(railingRun / 6) + 1) * 2 : 0);
  const washers = carriageBolts;
  const nuts = carriageBolts;
  const lateralLoadBrackets = attachment === 'siding' ? Math.max(2, Math.ceil(width / 2)) : 0;
  const sdsCorners = 4;
  const framingScrews3In = Math.ceil(width / 2) + blockingCount;
  const hangerNails3In = joistHangers + postBases;
  const rafterTieNails = rafterTies * 4;
  const fastenerIntersections = deckBoardPieces * joistCount;
  const deckFastenerBoxes = deckingType === 'pressure-treated'
    ? Math.ceil((fastenerIntersections * 2) / 365)
    : Math.ceil((fastenerIntersections * 2) / 1750);

  const fasciaLf = perimeter + (stairCount > 0 ? stairWidth * stairCount * 2 + stairRisers * stairWidth * stairCount : 0);
  const fasciaStockLength = 12;
  const fasciaPieces = Math.ceil(fasciaLf / fasciaStockLength);

  const stairStringersPerRun = stairCount > 0 ? Math.max(2, Math.floor((stairWidth * 12) / 12) + 1) : 0;
  const stringerStockLength = chooseStockLength(Math.max(stairRise * 1.5, 12), [12, 16, 20]);
  const stairStringers = stairStringersPerRun * stairCount;

  const railingSections6 = Math.floor(railingRun / 8) === 0 ? Math.ceil(railingRun / 6) : Math.max(0, Math.ceil((railingRun % 8) / 6));
  const railingSections8 = Math.floor(railingRun / 8);
  const railingPosts = railingType === 'aluminum' ? 0 : Math.max(2, Math.ceil(railingRun / 6) + 1);

  const materials: MaterialItem[] = [
    toMaterial(`Deck board ${boardStockLength}'`, 'Decking', deckBoardPieces, 'boards', `${boardStockLength} ft stock`, `Board run set to ${boardRun}; includes 8% waste.`),
    borderSameBoard ? toMaterial(`Border / picture-frame board ${boardStockLength}'`, 'Decking', borderPieces, 'boards', `${boardStockLength} ft stock`, 'Same decking style/color as main field boards.') : null,
    stairTreadBoards > 0 ? toMaterial(`Stair tread board ${chooseStockLength(stairWidth, [8, 12, 16])}'`, 'Decking', stairTreadBoards, 'boards', `${chooseStockLength(stairWidth, [8, 12, 16])} ft stock`, 'Assumes two tread boards per tread.') : null,
    toMaterial(`${joistSize} joists`, 'Framing', joistCount, 'boards', `${joistStockLength} ft stock`, '12 in on-center joists.'),
    toMaterial(`${beamSize} beam boards`, 'Framing', beamRows * beamSegmentsPerRow * 2, 'boards', `${beamStockLength} ft stock`, 'Double beam with one size larger member than joists.'),
    toMaterial(`${bandBoardSize} double band / rim boards`, 'Framing', bandBoardPieces, 'boards', `${bandBoardStock} ft stock`, 'Includes double band for strength.'),
    toMaterial(`${joistSize} border blocking`, 'Framing', blockingStockPieces, 'boards', '8 ft stock', 'Blocking at both sides to support border boards.'),
    toMaterial('6x6 posts', 'Foundation + posts', postCount, 'posts', `${postStockLength} ft stock`, 'Post length includes trim/notch allowance.'),
    toMaterial('80 lb concrete bags', 'Foundation + posts', concreteBags, 'bags', '3 bags per post', 'Based on your footer standard.'),
    toMaterial('Post brackets', 'Foundation + posts', postBases, 'ea', 'One per post', 'Beam sits on notched post above bracket.'),
    toMaterial('1/2 in concrete anchors', 'Foundation + posts', concreteAnchors, 'ea', 'One per bracket', 'Anchor each post bracket to footing.'),
    toMaterial('Joist hangers', 'Hardware', joistHangers, 'ea', `${joistSize} hanger`, attachment === 'siding' ? 'Ledger-mounted joists.' : 'Freestanding condition counts both ends.'),
    toMaterial('Rafter ties', 'Hardware', rafterTies, 'ea', 'One per joist at beam', 'Installed at beam line.'),
    attachment === 'siding' ? toMaterial('Lateral load brackets', 'Hardware', lateralLoadBrackets, 'ea', 'Every 2 ft on ledger', 'Attached decks only.') : null,
    toMaterial('Structural SDS screws', 'Hardware', sdsCorners, 'ea', 'Corners of band board', 'One at each corner.'),
    toMaterial('1/2 in carriage bolts', 'Hardware', carriageBolts, 'ea', 'Beam/post + railing posts', 'Includes nuts and washers in separate lines.'),
    toMaterial('1/2 in washers', 'Hardware', washers, 'ea', 'Match carriage bolts', undefined),
    toMaterial('1/2 in nuts', 'Hardware', nuts, 'ea', 'Match carriage bolts', undefined),
    toMaterial('3 in exterior screws', 'Hardware', framingScrews3In, 'ea', 'Front framing / blocking', 'Used for front of deck assembly.'),
    toMaterial('3 in hanger / bracket nails', 'Hardware', hangerNails3In, 'ea', 'For hangers and post brackets', undefined),
    toMaterial('1-1/2 in rafter tie nails', 'Hardware', rafterTieNails, 'ea', 'Rafter tie install', undefined),
    deckingType === 'pressure-treated'
      ? toMaterial('Top-mount deck screw boxes', 'Hardware', deckFastenerBoxes, 'boxes', '365 screws / box', 'Two screws per joist intersection.')
      : toMaterial('2-3/8 in CAMO screw boxes', 'Hardware', deckFastenerBoxes, 'boxes', '1750 screws / box', 'Two hidden screws per joist intersection.'),
    toMaterial('Joist tape', 'Hardware', roundUp(joistTapeLf, 0), 'lf', 'Rolls by linear footage', 'Covers joists and band boards.'),
    toMaterial(`Fascia board ${fasciaStockLength}'`, 'Trim', fasciaPieces, 'boards', `${fasciaStockLength} ft stock`, 'Includes band board fascia plus stair sides/risers.'),
    stairStringers > 0 ? toMaterial('2x12 stair stringers', 'Stairs', stairStringers, 'boards', `${stringerStockLength} ft stock`, 'Site-built stringers at 12 in O.C.') : null,
    railingSections8 > 0 ? toMaterial('8 ft railing sections', 'Railing', railingSections8, 'sections', '8 ft kits', `Railing type: ${railingType}.`) : null,
    railingSections6 > 0 ? toMaterial('6 ft railing sections', 'Railing', railingSections6, 'sections', '6 ft kits', `Railing type: ${railingType}.`) : null,
    railingPosts > 0 ? toMaterial('4x4 railing posts', 'Railing', railingPosts, 'posts', '4x4 PT posts', 'Used for wood, vinyl, or composite railing systems.') : null,
  ].filter(Boolean) as MaterialItem[];

  return {
    summary: [
      { label: 'Deck area', value: `${area.toFixed(1)} sq ft` },
      { label: 'Perimeter', value: `${perimeter.toFixed(1)} lf` },
      { label: 'Joists', value: `${joistCount} @ ${joistSize}` },
      { label: 'Posts', value: `${postCount}` },
      { label: 'Beam rows', value: `${beamRows}` },
      { label: 'Board stock', value: `${boardStockLength} ft` },
    ],
    materials,
    orderNotes: [
      `${attachment === 'brick' ? 'Brick wall condition is treated as freestanding, so the deck adds the house-side beam/post row.' : 'Attached siding condition keeps the house side on a ledger and moves the main beam to allow up to 2 ft joist cantilever where possible.'}`,
      `Post layout targets about ${POST_TARGET_SPACING.toFixed(1)} ft spacing to stay comfortably inside the ${POST_MAX_SPACING.toFixed(1)} ft max you gave, rather than designing right at the limit.`,
      `Deck boards are grouped by stock length, with border boards and stair tread boards split into separate order lines so the crew can see exactly where each board family is used.`,
      'This pass is a strong starting ruleset, but beam layout on irregular shapes should still be field-checked until we add beam-line editing directly into the footprint tool.',
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
