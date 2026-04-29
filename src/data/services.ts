import { createGableSection, createSection, createSunroomSection } from '../lib/sectioning';

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

const sharedGableDefaults = JSON.stringify([createGableSection(0, { width: 8, height: 2, style: 'king-post' })]);
const sharedSunroomDefaults = JSON.stringify([
  createSunroomSection(0, { width: 8, mainSection: 'horizontal-sliders', kickSection: 'insulated', kickHeight: 2 }),
  createSunroomSection(1, { width: 8, mainSection: 'horizontal-sliders', kickSection: 'insulated', kickHeight: 2 }),
  createSunroomSection(2, { width: 3, mainSection: 'panel', kickSection: 'insulated', kickHeight: 2, doorType: 'single' }),
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
      receiverSize: '5-8',
      screenType: 'suntex-80',
      screenColor: 'black',
      jobNotes: '',
      sections: sharedScreenDefaults,
gableSections: sharedGableDefaults,
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
        key: 'receiverSize',
        label: 'Receiver size',
        type: 'select',
        options: [
          { label: '5/8 in', value: '5-8' },
          { label: '1 in', value: '1' },
        ],
      },
      {
        key: 'screenType',
        label: 'Screen type',
        type: 'select',
        options: [
          { label: 'Suntex 80', value: 'suntex-80' },
          { label: 'Suntex 90', value: 'suntex-90' },
          { label: '17/20 Tuff Screen', value: 'tuff-screen' },
        ],
      },
      {
        key: 'screenColor',
        label: 'Screen color',
        type: 'select',
        options: [
          { label: 'Black', value: 'black' },
          { label: 'Stucco', value: 'stucco' },
          { label: 'Beige', value: 'beige' },
          { label: 'Grey', value: 'grey' },
          { label: 'Brown', value: 'brown' },
          { label: 'Dark Bronze', value: 'dark bronze' },
        ],
      },
      { key: 'jobNotes', label: 'Job notes', type: 'text' },

    ],
    formulaNotes: [
      'Standard screen room framing uses 24 ft stock sections for receiver, 1x2, 2x2, U-channel, and kick trim parts.',
      'Each wall section carries its own floor and wall mounting selections, and gables now carry separate base and side mounting selections. Capri clips are packed in 50s and each clip uses four tek screws.',
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
      framingColor: 'white',
      panelColor: 'white',
      fanBeamCount: 0,
      fanBeamSelections: '[]',
      activeFanBeamIndex: 0,
      frontOverhang: 1,
      projectionOverhang: 2,
      extraBeamCount: 0,
      supportBeamPostCount: 0,
      screenUnderneath: false,
      beamStyle: 'atlas',
      postCount: 0,
      jobNotes: '',
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
      { key: 'framingColor', label: 'Framing color', type: 'select', options: [
        { label: 'White', value: 'white' },
        { label: 'Bronze', value: 'bronze' },
        { label: 'Sandstone', value: 'sandstone' },
        { label: 'Black', value: 'black' },
      ] },
      { key: 'panelColor', label: 'Panel color', type: 'select', options: [
        { label: 'White', value: 'white' },
        { label: 'Bronze', value: 'bronze' },
        { label: 'Sandstone', value: 'sandstone' },
        { label: 'Black', value: 'black' },
      ] },
      { key: 'fanBeamCount', label: 'Fan beam count', type: 'number', min: 0, step: 1, helper: 'Set 0 for none. Use the layout arrows to move each fan beam panel.' },
      { key: 'frontOverhang', label: 'Front beam overhang (ft)', type: 'number', min: 0, step: 1, helper: '0, 1, or 2 ft typical' },
      { key: 'projectionOverhang', label: 'Projection overhang (ft)', type: 'select', options: [
        { label: '0 ft', value: '0' },
        { label: '1 ft', value: '1' },
        { label: '2 ft', value: '2' },
      ] },
      { key: 'extraBeamCount', label: 'Extra support beams', type: 'number', min: 0, step: 1 },
      { key: 'supportBeamPostCount', label: 'Extra beam post count (0 = match front beam)', type: 'number', min: 0, step: 1 },
      { key: 'postCount', label: 'Front post count (0 = auto)', type: 'number', min: 0, step: 1 },
      { key: 'screenUnderneath', label: 'Screen room below cover', type: 'boolean', helper: 'Uses 3x3 beam/post system with hidden brackets when checked.' },
      { key: 'jobNotes', label: 'Job notes', type: 'text', helper: 'Optional notes for the material export.' },
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
      receiverSize: '5-8',
      screenType: 'suntex-80',
      screenColor: 'black',
      jobNotes: '',
      sections: sharedScreenDefaults,
gableSections: sharedGableDefaults,
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
        key: 'receiverSize',
        label: 'Receiver size',
        type: 'select',
        options: [
          { label: '5/8 in', value: '5-8' },
          { label: '1 in', value: '1' },
        ],
      },
      {
        key: 'screenType',
        label: 'Screen type',
        type: 'select',
        options: [
          { label: 'Suntex 80', value: 'suntex-80' },
          { label: 'Suntex 90', value: 'suntex-90' },
          { label: '17/20 Tuff Screen', value: 'tuff-screen' },
        ],
      },
      {
        key: 'screenColor',
        label: 'Screen color',
        type: 'select',
        options: [
          { label: 'Black', value: 'black' },
          { label: 'Stucco', value: 'stucco' },
          { label: 'Beige', value: 'beige' },
          { label: 'Grey', value: 'grey' },
          { label: 'Brown', value: 'brown' },
          { label: 'Dark Bronze', value: 'dark bronze' },
        ],
      },
      { key: 'jobNotes', label: 'Job notes', type: 'text' },

    ],
    formulaNotes: [
      'Renaissance framing is ordered as custom lengths: 1x2 7/8, 2x2 7/8 no groove, and 2x2 7/8 with groove are split apart in the cut list.',
      'Door frames, chair rail only sections, and plain uprights use the no-groove member. Groove members are reserved for pickets and insulated kick panel conditions.',
      'Each wall section carries its own floor and wall mounting selections, and gables now carry separate base and side mounting selections. Decorative brackets, screws, and NovaFlex include gable takeoff too.',
      'Screen rolls still use 10 ft x 100 ft stock, with spline switching from screen type.',
    ],
  },

  {
    slug: 'wooden-structures',
    label: 'Wooden Structures',
    intro: 'Create clean, permit-ready wood roof framing concept layouts for engineer review and stamp, with simple inputs and clear IRC-aware assumptions.',
    highlights: ['Gable or flat roof modes', 'Engineer review notes', 'Plan-view framing layout', 'Load-path callouts'],
    defaults: {
      structureType: 'attached',
      roofType: 'gable',
      width: 16,
      projection: 12,
      overallHeight: 9,
      roofPitch: 4,
      eaveOverhang: 1,
      gableOverhang: 1,
      supportLayout: 'auto-front-beam',
      postCount: 3,
      attachmentSide: 'top',
      attachedCondition: 'ledger-to-existing-wall',
      existingConditionNotes: '',
      obstructionNotes: '',
      joistSpacing: 16,
      memberSizingMode: 'engineer-review',
      woodenShape: JSON.stringify([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 12 }, { x: 0, y: 12 }]),
      woodenObstructions: JSON.stringify([]),
      woodenHouseSides: JSON.stringify({ '0': true }),
      jobNotes: '',
    },
    fields: [
      { key: 'structureType', label: 'Structure type', type: 'select', options: [
        { label: 'Attached', value: 'attached' },
        { label: 'Freestanding', value: 'freestanding' },
      ] },
      { key: 'roofType', label: 'Roof type', type: 'select', options: [
        { label: 'Gable roof framing layout', value: 'gable' },
        { label: 'Flat roof framing layout', value: 'flat' },
      ] },
      { key: 'width', label: 'Overall width (ft)', type: 'number', min: 1, step: 0.5 },
      { key: 'projection', label: 'Projection / depth (ft)', type: 'number', min: 1, step: 0.5 },
      { key: 'overallHeight', label: 'Overall height at high side (ft)', type: 'number', min: 1, step: 0.1 },
      { key: 'roofPitch', label: 'Roof pitch (rise per 12)', type: 'number', min: 0.25, step: 0.25 },
      { key: 'eaveOverhang', label: 'Eave/front overhang (ft)', type: 'number', min: 0, step: 0.25 },
      { key: 'gableOverhang', label: 'Side/gable overhang (ft)', type: 'number', min: 0, step: 0.25 },
      { key: 'supportLayout', label: 'Support layout', type: 'select', options: [
        { label: 'Auto front beam + posts', value: 'auto-front-beam' },
        { label: 'Known post locations / field verify', value: 'known-posts' },
        { label: 'Existing walls / bearing both sides', value: 'bearing-walls' },
      ] },
      { key: 'postCount', label: 'Post count if beam supported', type: 'number', min: 0, step: 1 },
      { key: 'attachmentSide', label: 'Attachment / high side', type: 'select', options: [
        { label: 'Top', value: 'top' },
        { label: 'Right', value: 'right' },
        { label: 'Bottom', value: 'bottom' },
        { label: 'Left', value: 'left' },
      ] },
      { key: 'attachedCondition', label: 'Existing structure condition', type: 'select', options: [
        { label: 'Ledger to existing wall', value: 'ledger-to-existing-wall' },
        { label: 'Tie into existing roof', value: 'tie-into-roof' },
        { label: 'Freestanding near house', value: 'freestanding-near-house' },
      ] },
      { key: 'joistSpacing', label: 'Rafter / joist spacing (in O.C.)', type: 'select', options: [
        { label: '12 in O.C.', value: '12' },
        { label: '16 in O.C.', value: '16' },
        { label: '24 in O.C.', value: '24' },
      ] },
      { key: 'existingConditionNotes', label: 'Existing walls / roofline notes', type: 'text' },
      { key: 'obstructionNotes', label: 'Jogs, bump-outs, chimneys, offsets', type: 'text' },
      { key: 'jobNotes', label: 'Engineer package notes', type: 'text' },
    ],
    formulaNotes: [
      'Uses the current IRC as a prescriptive baseline, defaulting to 2024 IRC assumptions unless the project jurisdiction says otherwise.',
      'Member sizing is shown as a framing concept unless the span/load condition is clearly prescriptive. Final member sizes, uplift, lateral bracing, and attachment details are flagged for engineer review.',
      'Layouts identify ridge/rafter direction for gables and joist/slope direction for flat roofs, with support lines, posts, load path, and review notes called out for stamping.',
    ],
  },
  {
    slug: 'sunrooms',
    label: 'Sunrooms',
    intro: 'Build an Elite Add-A-Room wall take-off with editable front sections, 24 ft stock optimization, and section-by-section glazing / panel choices.',
    highlights: ['2 in or 3 in system', 'Section-by-section wall editor', '24 ft stock cut logic', 'Existing structure aware'],
    defaults: {
      roomSystem: '3-thermal',
      framingColor: 'white',
      panelColor: 'white',
      windowColor: 'white',
      buildMode: 'existing-structure',
      sunroomSections: sharedSunroomDefaults,
    },
    fields: [
      { key: 'roomSystem', label: 'System type', type: 'select', options: [
        { label: '3 in thermally broken', value: '3-thermal' },
        { label: '2 in non-thermal', value: '2-nonthermal' },
      ] },
      { key: 'framingColor', label: 'Framing color', type: 'select', options: [
        { label: 'White', value: 'white' },
        { label: 'Wheat', value: 'wheat' },
        { label: 'Clay', value: 'clay' },
        { label: 'Bronze', value: 'bronze' },
      ] },
      { key: 'panelColor', label: 'Panel color', type: 'select', options: [
        { label: 'White', value: 'white' },
        { label: 'Wheat', value: 'wheat' },
        { label: 'Clay', value: 'clay' },
        { label: 'Bronze', value: 'bronze' },
      ] },
      { key: 'windowColor', label: 'Window color', type: 'select', options: [
        { label: 'White', value: 'white' },
        { label: 'Wheat', value: 'wheat' },
        { label: 'Clay', value: 'clay' },
        { label: 'Bronze', value: 'bronze' },
      ] },
      { key: 'buildMode', label: 'Structure type', type: 'select', options: [
        { label: 'Existing structure', value: 'existing-structure' },
        { label: 'Build from scratch', value: 'new-structure' },
      ] },
    ],
    formulaNotes: [
      'Elite Add-A-Room uses 24 ft extrusions such as base channel, receiving channel, DRC, H-beam, self-mating H-beam, top cap, and optional chase channel, with cut waste tracked from 24 ft stock.',
      'The catalog and installation sheets show 3 in thermally broken and 2 in non-thermal systems, with corner post used mainly when building free-standing room structure rather than tying into existing walls.',
      'Per-section glazing / panel choices drive whether DRC, receiver, H-beam, channels, and wall panels are ordered and how much cut waste remains from 24 ft stock.',
    ],
  },

];

export function getServiceBySlug(slug = '') {
  return SERVICES.find((service) => service.slug === slug) ?? SERVICES[0];
}
