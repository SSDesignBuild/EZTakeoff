import { EstimateResult, MaterialItem } from './types';

export type EstimateInputs = Record<string, string | number | boolean>;

const roundUp = (value: number, precision = 0) => {
  const factor = 10 ** precision;
  return Math.ceil(value * factor) / factor;
};

const areaWithCutIn = (width: number, depth: number, cutInWidth: number, cutInDepth: number) => {
  const base = width * depth;
  const notch = cutInWidth * cutInDepth;
  return Math.max(base - notch, 0);
};

const toMaterial = (name: string, category: string, quantity: number, unit: string, stockRecommendation: string, notes?: string): MaterialItem => ({
  name,
  category,
  quantity: Number(quantity.toFixed(2)),
  unit,
  stockRecommendation,
  notes,
});

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
  const width = Number(inputs.width ?? 0);
  const depth = Number(inputs.depth ?? 0);
  const cutInWidth = Number(inputs.cutInWidth ?? 0);
  const cutInDepth = Number(inputs.cutInDepth ?? 0);
  const deckHeight = Number(inputs.deckHeight ?? 0);
  const railingRun = Number(inputs.perimeterRailingFt ?? 0);
  const stairCount = Number(inputs.stairCount ?? 0);
  const pictureFrame = Boolean(inputs.pictureFrame);
  const attachment = String(inputs.attachment ?? 'siding');

  const area = areaWithCutIn(width, depth, cutInWidth, cutInDepth);
  const joistCount = Math.max(2, Math.ceil((width * 12) / 16) + 1);
  const joistLength = roundUp(depth + (pictureFrame ? 0.75 : 0), 0);
  const deckBoardsLf = roundUp((area / 0.4583) * 1.08, 0);
  const fasciaLf = roundUp(((width * 2) + (depth * 2) + (cutInWidth * 2) + (cutInDepth * 2)) * 1.05, 0);
  const beamLines = attachment === 'freestanding' ? 2 : 1;
  const postCount = Math.max(4, Math.ceil(width / 8) * beamLines + (deckHeight > 8 ? 2 : 0));
  const footingCount = postCount;
  const hangers = joistCount * beamLines;
  const ledgerLf = attachment === 'freestanding' ? 0 : roundUp(width, 0);

  const materials = [
    toMaterial('Composite / deck boards', 'Decking', deckBoardsLf, 'lf', 'Mix 12 ft / 16 ft / 20 ft lengths to minimize waste'),
    toMaterial('2x10 joists', 'Framing', joistCount, 'ea', `${joistLength} ft stock`, 'Assumes 16 in O.C. framing'),
    toMaterial('2x10 beams', 'Framing', beamLines * Math.ceil(width / 10), 'ea', '10 ft or 20 ft beam stock', 'Replace with exact beam design rules once provided'),
    toMaterial('6x6 posts', 'Framing', postCount, 'ea', `${Math.max(8, roundUp(deckHeight + 2, 0))} ft stock`, 'Height includes trim allowance'),
    toMaterial('Footings / concrete forms', 'Foundation', footingCount, 'ea', '12 in form tube + concrete mix', 'One footing per post in demo logic'),
    toMaterial('Joist hangers', 'Hardware', hangers, 'ea', '2x10 hanger', undefined),
    toMaterial('Ledger board', 'Framing', ledgerLf, 'lf', '2x10 PT ledger stock', 'Only used for attached deck conditions'),
    toMaterial('Fascia boards', 'Trim', fasciaLf, 'lf', '12 ft stock preferred', undefined),
    toMaterial('Railing sections', 'Railing', roundUp(railingRun / 6, 0), 'sections', '6 ft rail kits', undefined),
    toMaterial('Stair material package', 'Stairs', stairCount, 'sets', 'Stringers, treads, connectors', 'One bundle per stair run for planning'),
  ].filter((item) => item.quantity > 0);

  return {
    summary: [
      { label: 'Net deck area', value: `${area.toFixed(1)} sq ft` },
      { label: 'Estimated joists', value: `${joistCount}` },
      { label: 'Estimated posts', value: `${postCount}` },
      { label: 'Attachment', value: attachment },
    ],
    materials,
    orderNotes: [
      'Demo rules are scaffolded to be replaced by S&S-specific framing logic and stock optimization tables.',
      'Deck footprint editor supports cut-ins today and can be extended to multi-segment polygons next.',
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
