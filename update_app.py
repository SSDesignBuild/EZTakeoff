from pathlib import Path
base = Path('/mnt/data/work/app/src')

# types
(base/'lib/types.ts').write_text('''export interface MaterialItem {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  stockRecommendation: string;
  notes?: string;
}

export interface EstimateResult {
  summary: { label: string; value: string }[];
  materials: MaterialItem[];
  orderNotes: string[];
}

export interface DeckPoint {
  x: number;
  y: number;
}

export interface DeckEdgeSegment {
  start: DeckPoint;
  end: DeckPoint;
  length: number;
  orientation: 'horizontal' | 'vertical' | 'angled';
  index: number;
}

export interface LockedPostPoint {
  beamIndex: number;
  x: number;
}

export interface SectionConfig {
  id: string;
  label: string;
  width: number;
  height: number;
  uprights: number;
  chairRail: boolean;
  pickets: boolean;
  kickPanel: 'none' | 'trim-coil' | 'insulated';
  doorType: 'none' | 'single' | 'french';
  doorPlacement: 'left' | 'center' | 'right';
  doorSwing: 'inswing' | 'outswing';
}
''')

# section parsing helpers
(base/'lib/sectioning.ts').write_text('''import { SectionConfig } from './types';

export const DEFAULT_SCREEN_SECTION: SectionConfig = {
  id: 'section-1',
  label: 'Section 1',
  width: 8,
  height: 8,
  uprights: 1,
  chairRail: true,
  pickets: false,
  kickPanel: 'none',
  doorType: 'none',
  doorPlacement: 'center',
  doorSwing: 'outswing',
};

export function createSection(index: number, overrides: Partial<SectionConfig> = {}): SectionConfig {
  return {
    ...DEFAULT_SCREEN_SECTION,
    id: `section-${Date.now()}-${index}`,
    label: `Section ${index + 1}`,
    ...overrides,
  };
}

export function parseSections(raw: string | number | boolean | undefined, count = 3): SectionConfig[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, index) => ({
          ...DEFAULT_SCREEN_SECTION,
          ...item,
          id: String(item.id ?? `section-${index + 1}`),
          label: String(item.label ?? `Section ${index + 1}`),
          width: Number(item.width ?? DEFAULT_SCREEN_SECTION.width),
          height: Number(item.height ?? DEFAULT_SCREEN_SECTION.height),
          uprights: Number(item.uprights ?? DEFAULT_SCREEN_SECTION.uprights),
          chairRail: Boolean(item.chairRail),
          pickets: Boolean(item.pickets),
          kickPanel: (item.kickPanel ?? 'none') as SectionConfig['kickPanel'],
          doorType: (item.doorType ?? 'none') as SectionConfig['doorType'],
          doorPlacement: (item.doorPlacement ?? 'center') as SectionConfig['doorPlacement'],
          doorSwing: (item.doorSwing ?? 'outswing') as SectionConfig['doorSwing'],
        }));
      }
    } catch {
      // ignore
    }
  }

  return Array.from({ length: count }, (_, index) => createSection(index));
}
''')

# services
(base/'data/services.ts').write_text('''import { createSection } from '../lib/sectioning';

export interface ServiceFieldOption {
  label: string;
  value: string;
}

export interface ServiceField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
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
      elevation: 'second-story',
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
          { label: 'Run with width', value: 'width' },
          { label: 'Run with projection', value: 'projection' },
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
      {
        key: 'panelWidth',
        label: 'Panel width',
        type: 'select',
        options: [
          { label: '4 ft panels', value: '4' },
          { label: '2 ft panels', value: '2' },
        ],
      },
      {
        key: 'panelThickness',
        label: 'Panel thickness',
        type: 'select',
        options: [
          { label: '3 in panel', value: '3' },
          { label: '6 in panel', value: '6' },
        ],
      },
      {
        key: 'metalGauge',
        label: 'Metal thickness',
        type: 'select',
        options: [
          { label: '.26 standard', value: '.26' },
          { label: '.32 upgraded', value: '.32' },
        ],
      },
      {
        key: 'foamDensity',
        label: 'Foam density',
        type: 'select',
        options: [
          { label: '1 lb foam', value: '1' },
          { label: '2 lb foam', value: '2' },
        ],
      },
      {
        key: 'fanBeam',
        label: 'Fan beam',
        type: 'select',
        options: [
          { label: 'No fan beam', value: 'none' },
          { label: 'Centered fan beam', value: 'centered' },
          { label: 'Fan beam 1 ft from male / female side', value: 'offset' },
        ],
      },
    ],
    formulaNotes: [
      '3 in panels are checked against a 15 ft projection limit with a 2 ft overhang assumption. Upgraded .32 metal with 2 lb foam can extend that to about 19 ft, and 6 in upgraded panels can carry longer projections.',
      'Gutter is only used on the front low side. C-channel only appears on attached jobs. Drip-edge fascia caps the left and right sides.',
      'Gutter, C-channel, and fascia are grouped in 24 ft stock lengths for ordering.',
    ],
  },
  {
    slug: 'renaissance-screen-rooms',
    label: 'Renaissance Screen Rooms',
    intro: 'Use the same section-by-section workflow but calculate Renaissance-specific profiles, custom-sized members, decorative brackets, and the 3/4 in insulated panel system.',
    highlights: ['Custom cut lengths', 'Decorative bracket counts', 'Door kits + astragal', 'Renaissance panel logic'],
    defaults: {
      framingColor: 'white',
      panelColor: 'white',
      screenType: 'tuff-screen',
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
      'Renaissance framing uses custom cut 1x2 7/8 and 2x2 7/8 pieces instead of only 24 ft stock grouping.',
      'Decorative brackets with caps use four flush-mount screws each. Door openings add full 2x2 framing and French doors add an astragal.',
      '3/4 in insulated panels are ordered from 4 ft x 10 ft sheets based on section width and kick height.',
    ],
  },
];

export function getServiceBySlug(slug: string | undefined) {
  return SERVICES.find((service) => service.slug == slug) ?? SERVICES[0];
}
''')
