export type FieldType = 'number' | 'select' | 'boolean';

export interface ServiceField {
  key: string;
  label: string;
  type: FieldType;
  min?: number;
  step?: number;
  options?: { label: string; value: string }[];
  helper?: string;
}

export interface ServiceDefinition {
  slug: string;
  label: string;
  intro: string;
  highlights: string[];
  defaults: Record<string, string | number | boolean>;
  fields: ServiceField[];
  formulaNotes: string[];
}

export const SERVICES: ServiceDefinition[] = [
  {
    slug: 'decks',
    label: 'Decks',
    intro: 'Define custom deck geometry, attachment conditions, elevation, and framing assumptions. The estimator returns framing, decking, railing, and hardware recommendations.',
    highlights: ['Custom footprint', 'Openings + cut-ins', 'Ledger and freestanding logic', 'Order-ready framing summary'],
    defaults: {
      width: 24,
      depth: 14,
      cutInWidth: 0,
      cutInDepth: 0,
      deckHeight: 8,
      perimeterRailingFt: 30,
      boardGap: 0.125,
      attachment: 'siding',
      elevation: 'second-story',
      stairCount: 1,
      pictureFrame: true,
    },
    fields: [
      { key: 'width', label: 'Overall width (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'depth', label: 'Overall depth (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'cutInWidth', label: 'Cut-in width (ft)', type: 'number', min: 0, step: 0.1 },
      { key: 'cutInDepth', label: 'Cut-in depth (ft)', type: 'number', min: 0, step: 0.1 },
      { key: 'deckHeight', label: 'Deck height (ft)', type: 'number', min: 0, step: 0.1 },
      { key: 'perimeterRailingFt', label: 'Railing run (lf)', type: 'number', min: 0, step: 0.1 },
      {
        key: 'attachment',
        label: 'Attachment condition',
        type: 'select',
        options: [
          { label: 'Attached to brick wall', value: 'brick' },
          { label: 'Attached to siding wall', value: 'siding' },
          { label: 'Freestanding', value: 'freestanding' },
        ],
      },
      {
        key: 'elevation',
        label: 'Elevation',
        type: 'select',
        options: [
          { label: 'Low to grade', value: 'low' },
          { label: 'Second story', value: 'second-story' },
        ],
      },
      { key: 'stairCount', label: 'Stair sections', type: 'number', min: 0, step: 1 },
      { key: 'pictureFrame', label: 'Picture-frame border', type: 'boolean' },
    ],
    formulaNotes: [
      'Decking uses 5.5 in coverage with waste allowance and optional picture-frame border.',
      'Joists assume 16 in on-center for the demo rules and snap to stock lengths.',
      'Posts and beams are estimated from span bands and elevation conditions.',
    ],
  },
  {
    slug: 'screen-rooms',
    label: 'Screen Rooms',
    intro: 'Configure opening counts, sizes, uprights, chair rail / picket conditions, doors, and screen type. The app converts opening logic into extrusion and accessory counts.',
    highlights: ['Opening-by-opening setup', 'Door placement summary', 'Screen roll recommendations', 'Order list by stock size'],
    defaults: {
      openingCount: 6,
      openingWidth: 6,
      openingHeight: 8,
      uprightsPerOpening: 2,
      doorCount: 1,
      doorType: 'single',
      screenType: 'suntex-80',
      chairRailMode: 'chair-rail',
      picketSections: 0,
    },
    fields: [
      { key: 'openingCount', label: 'Screened openings', type: 'number', min: 1, step: 1 },
      { key: 'openingWidth', label: 'Opening width (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'openingHeight', label: 'Opening height (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'uprightsPerOpening', label: 'Uprights per opening', type: 'number', min: 0, step: 1 },
      {
        key: 'chairRailMode',
        label: 'Opening infill',
        type: 'select',
        options: [
          { label: 'Chair rail only', value: 'chair-rail' },
          { label: 'Pickets with chair rail', value: 'pickets-chair-rail' },
        ],
      },
      { key: 'picketSections', label: 'Picket sections', type: 'number', min: 0, step: 1 },
      { key: 'doorCount', label: 'Door count', type: 'number', min: 0, step: 1 },
      {
        key: 'doorType',
        label: 'Door type',
        type: 'select',
        options: [
          { label: 'Single door', value: 'single' },
          { label: 'French doors', value: 'french' },
        ],
      },
      {
        key: 'screenType',
        label: 'Screen type',
        type: 'select',
        options: [
          { label: 'Suntex 80', value: 'suntex-80' },
          { label: '17/20 Tuff Screen', value: 'tuff-screen' },
        ],
      },
    ],
    formulaNotes: [
      'Receiver, post, and extrusion counts are derived from opening count, width, and upright assumptions.',
      'Door kits add sweep/inswing hardware based on selected door type.',
      'Screen rolls are rounded to 100 lf stock units for order readiness.',
    ],
  },
  {
    slug: 'patio-covers',
    label: 'Patio Covers',
    intro: 'Input projection, width, attachment height, low-side height, and attachment mode. The estimator produces structural members, panel counts, and framing references.',
    highlights: ['Attached or freestanding', 'Roof slope check', 'Post count recommendation', 'Frame + panel order summary'],
    defaults: {
      width: 21,
      projection: 8,
      attachmentHeight: 9,
      lowSideHeight: 8.5,
      structureType: 'attached',
      beamCount: 2,
    },
    fields: [
      { key: 'width', label: 'Width (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'projection', label: 'Projection (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'attachmentHeight', label: 'Attachment height (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'lowSideHeight', label: 'Low-side height (ft)', type: 'number', min: 1, step: 0.1 },
      {
        key: 'structureType',
        label: 'Structure type',
        type: 'select',
        options: [
          { label: 'Attached to house', value: 'attached' },
          { label: 'Freestanding', value: 'freestanding' },
        ],
      },
      { key: 'beamCount', label: 'Primary beams', type: 'number', min: 1, step: 1 },
    ],
    formulaNotes: [
      'Panel count is based on 12 in panel modules rounded up from project width.',
      'Post count bands use width and attached/freestanding condition.',
      'Slope and overhang values are surfaced as checks for field validation.',
    ],
  },
  {
    slug: 'renaissance-screen-rooms',
    label: 'Renaissance Screen Rooms',
    intro: 'Use the same opening-centric workflow as standard screen rooms, but with Renaissance-specific posts, receivers, channels, and panel stock.',
    highlights: ['Renaissance-specific profiles', 'Door + screen packages', 'Order list by part family', 'Ready for expanded product tables'],
    defaults: {
      openingCount: 5,
      openingWidth: 5.5,
      openingHeight: 8,
      uprightsPerOpening: 2,
      doorCount: 1,
      doorType: 'single',
      screenType: 'tuff-screen',
      chairRailMode: 'pickets-chair-rail',
      picketSections: 3,
    },
    fields: [
      { key: 'openingCount', label: 'Screened openings', type: 'number', min: 1, step: 1 },
      { key: 'openingWidth', label: 'Opening width (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'openingHeight', label: 'Opening height (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'uprightsPerOpening', label: 'Uprights per opening', type: 'number', min: 0, step: 1 },
      {
        key: 'chairRailMode',
        label: 'Opening infill',
        type: 'select',
        options: [
          { label: 'Chair rail', value: 'chair-rail' },
          { label: 'Pickets with chair rail', value: 'pickets-chair-rail' },
        ],
      },
      { key: 'picketSections', label: 'Picket sections', type: 'number', min: 0, step: 1 },
      { key: 'doorCount', label: 'Door count', type: 'number', min: 0, step: 1 },
      {
        key: 'doorType',
        label: 'Door type',
        type: 'select',
        options: [
          { label: 'Single door', value: 'single' },
          { label: 'French doors', value: 'french' },
        ],
      },
      {
        key: 'screenType',
        label: 'Screen type',
        type: 'select',
        options: [
          { label: 'Suntex 80', value: 'suntex-80' },
          { label: '17/20 Tuff Screen', value: 'tuff-screen' },
        ],
      },
    ],
    formulaNotes: [
      'Renaissance receiver, U-channel, post, and panel families are separated from standard screen room logic.',
      'The rule layer is intentionally data-driven so future part tables can replace demo assumptions without changing the UI.',
      'Door packages and screen rolls are grouped into order-ready families.',
    ],
  },
];

export function getServiceBySlug(slug?: string) {
  return SERVICES.find((service) => service.slug === slug) ?? SERVICES[0];
}
