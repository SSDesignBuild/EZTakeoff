import { createSection } from '../lib/sectioning';

export interface ServiceFieldOption {
  label: string;
  value: string;
}

export interface ServiceField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean' | 'text' | 'date';
  min?: number;
  step?: number;
  helper?: string;
  options?: ServiceFieldOption[];
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

const sharedScreenDefaults = JSON.stringify([
  createSection(0, { width: 8, height: 8, chairRail: true }),
  createSection(1, { width: 6, height: 8, chairRail: true, pickets: true }),
  createSection(2, { width: 3, height: 8, chairRail: false, doorType: 'single', doorPlacement: 'right', doorSwing: 'inswing' }),
]);

export const SERVICES: ServiceDefinition[] = [
  {
    slug: 'decks',
    label: 'Decks',
    intro: 'Draw the deck footprint, lock posts where you want to keep them, move beam lines, and build grouped take-offs that follow how S&S frames decks in the field.',
    highlights: ['Drag points', 'Undo / redo', 'Snap cleaner corners', 'Lock post locations'],
    defaults: {
      deckHeight: 8,
      attachment: 'siding',
      boardRun: 'width',
      deckingType: 'composite',
      borderSameBoard: true,
      stairWidth: 4,
      stairRise: 0,
      stairCount: 1,
      railingType: 'aluminum',
      perimeterRailingFt: 24,
      stairEdgeIndex: 2,
      stairOffset: 0,
      customBeamYs: JSON.stringify([]),
      manualRailingEdges: JSON.stringify([]),
      lockedPosts: JSON.stringify([]),
      beamEdits: JSON.stringify([]),
      beamCantilever: 2,
      quickWidth: 16,
      quickProjection: 12,
      deckShape: JSON.stringify([]),
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
        key: 'boardRun',
        label: 'Board run direction',
        type: 'select',
        options: [
          { label: 'Parallel to house / run with width', value: 'width' },
          { label: 'Perpendicular to house / run with projection', value: 'projection' },
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
      { key: 'stairCount', label: 'Stair runs', type: 'number', min: 0, step: 1 },
      { key: 'stairWidth', label: 'Stair width (ft)', type: 'number', min: 0, step: 0.1 },
      { key: 'stairRise', label: 'Total stair rise (ft)', type: 'number', min: 0, step: 0.1, helper: 'Leave 0 to use deck height.' },
      { key: 'quickWidth', label: 'Quick width (ft)', type: 'number', min: 1, step: 1 },
      { key: 'quickProjection', label: 'Quick projection (ft)', type: 'number', min: 1, step: 1 },
      { key: 'beamCantilever', label: 'Beam cantilever to post (ft)', type: 'select', options: [
        { label: '0 ft', value: '0' },
        { label: '1 ft', value: '1' },
        { label: '2 ft', value: '2' },
      ] },
    ],
    formulaNotes: [
      'Joists are calculated at 12 in. on center and sized from your span table: 2x8 to 12 ft, 2x10 to 14 ft, 2x12 to 16 ft.',
      'Attached siding decks try to keep the main beam about 2 ft back from the front edge. Brick walls are treated as freestanding and add support on the house side.',
      'Beam members are doubled and sized one board larger than the joists where possible, with post bases, anchors, carriage bolts, hangers, rafter ties, tape, fascia, and railing grouped into order-ready families.',
    ],
  },
  {
    slug: 'screen-rooms',
    label: 'Screen Rooms',
    intro: 'Edit each wall section one by one, including mixed widths, doors, pickets, kick panels, and mounting conditions. The take-off rolls section rules into 24 ft stock ordering.',
    highlights: ['Section-by-section editing', 'Door placement by section', '24 ft material logic', 'Screen + spline bundles'],
    defaults: {
      framingColor: 'white',
      panelColor: 'white',
      screenType: 'suntex-80',
      mountingSurface: 'concrete',
      sections: sharedScreenDefaults,
    },
    fields: [
      {
        key: 'framingColor',
        label: 'Frame color',
        type: 'select',
        options: [
          { label: 'White', value: 'white' },
          { label: 'Bronze', value: 'bronze' },
          { label: 'Black', value: 'black' },
          { label: 'Wheat', value: 'wheat' },
          { label: 'Clay', value: 'clay' },
        ],
      },
      {
        key: 'panelColor',
        label: 'Insulated panel color',
        type: 'select',
        options: [
          { label: 'White', value: 'white' },
          { label: 'Wheat', value: 'wheat' },
          { label: 'Clay', value: 'clay' },
          { label: 'Bronze', value: 'bronze' },
        ],
      },
      {
        key: 'mountingSurface',
        label: 'Mounting surface',
        type: 'select',
        options: [
          { label: 'Concrete', value: 'concrete' },
          { label: 'Wood', value: 'wood' },
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
      'Standard screen room framing uses 24 ft stock sections for receiver, 1x2, 2x2, U-channel, and kick trim parts.',
      'Concrete screws or wood screws switch from the mounting surface selector. Capri clips are packed in 50s and each clip uses four tek screws.',
      'Screen rolls are based on 10 ft x 100 ft stock. Suntex uses .285 spline and standard tuff screen uses .315 spline.',
    ],
  },
  {
    slug: 'patio-covers',
    label: 'Patio Covers',
    intro: 'Estimate panel count, attachment trim, gutter, fascia, and upgrade paths for longer projections while keeping the UI simple enough for the field.',
    highlights: ['2 ft or 4 ft panels', 'Fan beam option', 'Projection upgrade checks', '24 ft trim pieces'],
    defaults: {
      width: 21,
      projection: 10,
      attachmentHeight: 9,
      lowSideHeight: 8.25,
      structureType: 'attached',
      panelWidth: 4,
      panelThickness: 3,
      metalGauge: '.26',
      foamDensity: 1,
      fanBeam: 'none',
      fanBeamCount: 1,
      fanBeamShift: 0,
      frontOverhang: 1,
      projectionOverhang: 2,
      extraBeamCount: 0,
      supportBeamPostCount: 0,
      screenUnderneath: false,
      beamStyle: 'atlas',
      postCount: 0,
    },
    fields: [
      { key: 'width', label: 'Width (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'projection', label: 'Projection (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'attachmentHeight', label: 'Attachment height (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'lowSideHeight', label: 'Low-side height (ft)', type: 'number', min: 1, step: 1 / 12 },
      {
        key: 'structureType',
        label: 'Structure type',
        type: 'select',
        options: [
          { label: 'Attached to house', value: 'attached' },
          { label: 'Freestanding', value: 'freestanding' },
        ],
      },
      {
        key: 'panelWidth',
        label: 'Preferred panel width',
        type: 'select',
        options: [
          { label: '4 ft panels preferred', value: '4' },
          { label: '2 ft panels preferred', value: '2' },
        ],
      },
      {
        key: 'panelThickness',
        label: 'Panel thickness',
        type: 'select',
        options: [
          { label: '3 in', value: '3' },
          { label: '6 in', value: '6' },
        ],
      },
      {
        key: 'metalGauge',
        label: 'Metal thickness',
        type: 'select',
        options: [
          { label: '.26', value: '.26' },
          { label: '.32', value: '.32' },
        ],
      },
      {
        key: 'foamDensity',
        label: 'Foam density',
        type: 'select',
        options: [
          { label: '1 lb', value: '1' },
          { label: '2 lb', value: '2' },
        ],
      },
      {
        key: 'fanBeam',
        label: 'Fan beam style',
        type: 'select',
        options: [
          { label: 'No fan beam', value: 'none' },
          { label: 'Centered fan beam', value: 'centered' },
          { label: '1 ft from female side', value: 'female-offset' },
          { label: '1 ft from male side', value: 'male-offset' },
        ],
      },
      { key: 'fanBeamCount', label: 'Fan beam count', type: 'number', min: 1, step: 1 },
      { key: 'frontOverhang', label: 'Front beam overhang (ft)', type: 'number', min: 0, step: 1, helper: '0, 1, or 2 ft typical' },
      { key: 'projectionOverhang', label: 'Projection overhang (ft)', type: 'select', options: [
        { label: '0 ft', value: '0' },
        { label: '1 ft', value: '1' },
        { label: '2 ft', value: '2' },
      ] },
      { key: 'extraBeamCount', label: 'Extra support beams', type: 'number', min: 0, step: 1 },
      { key: 'supportBeamPostCount', label: 'Extra beam post count (0 = match front beam)', type: 'number', min: 0, step: 1 },
      { key: 'fanBeamPlacementMode', label: 'Fan beam placement', type: 'select', options: [
        { label: 'Spread symmetrically', value: 'spread' },
        { label: 'Cluster near center', value: 'cluster-center' },
        { label: 'Inner pair focus', value: 'inner-pair' },
        { label: 'Outer pair focus', value: 'outer-pair' },
        { label: 'Bias toward female side', value: 'female-bias' },
        { label: 'Bias toward male side', value: 'male-bias' },
      ] },
      { key: 'postCount', label: 'Front post count (0 = auto)', type: 'number', min: 0, step: 1 },
      { key: 'screenUnderneath', label: 'Screen room below cover', type: 'boolean', helper: 'Uses 3x3 beam/post system with hidden brackets when checked.' },
    ],
    formulaNotes: [
      'Panel projection logic follows your 3 in / upgraded 3 in / 6 in rules. Standard 3 in panels beyond 13 ft add intermediate support beams unless upgraded.',
      'Centered fan beam layouts can force mixed 4 ft and 2 ft panel ordering to stay symmetrical. Offset fan beams are kept on valid panel positions only.',
      'Gutter, C-channel, and drip-edge fascia are grouped in 24 ft stock lengths. C-channel is attached jobs only, gutter is the front low side only, and every cover gets two downspout kits.',
    ],
  },
  {
    slug: 'renaissance-screen-rooms',
    label: 'Renaissance Screen Rooms',
    intro: 'Use the same section editing flow with Renaissance-specific framing, custom cut sizes, and order-ready door/panel outputs.',
    highlights: ['Custom cut lists', 'Renaissance framing colors', 'Door + picket logic', 'Panelized outputs'],
    defaults: {
      framingColor: 'white',
      panelColor: 'white',
      screenType: 'suntex-80',
      mountingSurface: 'concrete',
      sections: sharedScreenDefaults,
    },
    fields: [
      {
        key: 'framingColor',
        label: 'Frame color',
        type: 'select',
        options: [
          { label: 'White', value: 'white' },
          { label: 'Bronze', value: 'bronze' },
          { label: 'Black', value: 'black' },
          { label: 'Sandstone', value: 'sandstone' },
        ],
      },
      {
        key: 'panelColor',
        label: 'Insulated panel color',
        type: 'select',
        options: [
          { label: 'White', value: 'white' },
          { label: 'Bronze', value: 'bronze' },
          { label: 'Black', value: 'black' },
          { label: 'Sandstone', value: 'sandstone' },
        ],
      },
      {
        key: 'mountingSurface',
        label: 'Mounting surface',
        type: 'select',
        options: [
          { label: 'Concrete', value: 'concrete' },
          { label: 'Wood', value: 'wood' },
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
      'Renaissance framing is ordered as custom lengths: 1x2 7/8, 2x2 7/8 no groove, and 2x2 7/8 with groove are split apart in the cut list.',
      'Door frames, chair rail only sections, and plain uprights use the no-groove member. Groove members are reserved for pickets and insulated kick panel conditions.',
      'Screen rolls still use 10 ft x 100 ft stock, with spline switching from screen type.',
    ],
  },
];

export function getServiceBySlug(slug = '') {
  return SERVICES.find((service) => service.slug === slug) ?? SERVICES[0];
}
