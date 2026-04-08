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
    intro: 'Draw the deck footprint, define structural conditions, and generate a grouped take-off that follows S&S framing habits instead of spreadsheet guesswork.',
    highlights: ['Interactive footprint editor', 'Beam + post layout preview', 'Deck boards grouped by stock length', 'Attached vs brick/freestanding framing'],
    defaults: {
      deckHeight: 8,
      attachment: 'siding',
      elevation: 'second-story',
      boardRun: 'width',
      deckingType: 'composite',
      borderSameBoard: true,
      stairWidth: 4,
      stairRise: 0,
      stairCount: 1,
      railingType: 'aluminum',
      perimeterRailingFt: 24,
      deckShape: JSON.stringify([
        { x: 0, y: 0 },
        { x: 16, y: 0 },
        { x: 16, y: 12 },
        { x: 0, y: 12 },
      ]),
    },
    fields: [
      { key: 'deckHeight', label: 'Deck height (ft)', type: 'number', min: 0, step: 0.1 },
      {
        key: 'attachment',
        label: 'Attachment condition',
        type: 'select',
        options: [
          { label: 'Attached to siding wall', value: 'siding' },
          { label: 'Brick wall (freestanding against house)', value: 'brick' },
          { label: 'Freestanding', value: 'freestanding' },
        ],
      },
      {
        key: 'elevation',
        label: 'Elevation',
        type: 'select',
        options: [
          { label: 'Low to grade', value: 'low' },
          { label: 'Second story / elevated', value: 'second-story' },
        ],
      },
      {
        key: 'boardRun',
        label: 'Board run direction',
        type: 'select',
        options: [
          { label: 'Run with width (example: 10x12 uses 12 ft boards)', value: 'width' },
          { label: 'Run with projection (example: 10x12 uses 10 ft boards)', value: 'projection' },
        ],
      },
      {
        key: 'deckingType',
        label: 'Decking type',
        type: 'select',
        options: [
          { label: 'Pressure treated', value: 'pressure-treated' },
          { label: 'Composite / PVC', value: 'composite' },
        ],
      },
      { key: 'borderSameBoard', label: 'Border boards use same decking style/color', type: 'boolean' },
      {
        key: 'railingType',
        label: 'Railing type',
        type: 'select',
        options: [
          { label: 'Aluminum top-mounted', value: 'aluminum' },
          { label: 'Wood railing', value: 'wood' },
          { label: 'Vinyl / composite railing over 4x4', value: 'vinyl-composite' },
        ],
      },
      { key: 'perimeterRailingFt', label: 'Railing run (lf)', type: 'number', min: 0, step: 0.1 },
      { key: 'stairCount', label: 'Stair runs', type: 'number', min: 0, step: 1 },
      { key: 'stairWidth', label: 'Stair width (ft)', type: 'number', min: 0, step: 0.1 },
      { key: 'stairRise', label: 'Total stair rise (ft)', type: 'number', min: 0, step: 0.1, helper: 'Leave 0 when no stairs are needed.' },
    ],
    formulaNotes: [
      'Joists are calculated at 12 in on-center and sized from the span table you provided: 2x8 to 12 ft, 2x10 to 14 ft, and 2x12 to 16 ft.',
      'Attached siding decks assume the first beam can sit at projection minus 2 ft when that fits the joist span. Brick conditions are treated as freestanding against the house.',
      'Take-off groups decking by stock length and splits field boards, border boards, stair tread boards, double band boards, fascia, and hardware bundles.',
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
