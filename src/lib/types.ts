export interface MaterialItem {
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

export interface DeckRailCoverage {
  edgeIndex: number;
  start: number;
  end: number;
  kind: "level" | "angled";
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
  kickPanelHeight: number;
  doorType: 'none' | 'single' | 'french';
  doorPlacement: 'left' | 'center' | 'right' | 'custom';
  doorOffsetInches: number;
  doorWidth: number;
  doorSwing: 'inswing' | 'outswing';
  dogDoor: 'none' | 'small' | 'medium' | 'large';
  floorMount: 'concrete' | 'wood';
  wallMount: 'concrete' | 'wood';
}

export interface GableSectionConfig {
  id: string;
  label: string;
  width: number;
  height: number;
  style: 'king-post' | 'tied-king-post' | 'braced-king-post' | 'queen-king-post';
}

export interface SunroomSectionConfig {
  id: string;
  label: string;
  width: number;
  height: number;
  uprights: number;
  windowCount: number;
  mainSection: 'horizontal-sliders' | 'panel' | 'picture-window';
  kickSection: 'panel' | 'window' | 'insulated' | 'none';
  kickHeight: number;
  transomType: 'none' | 'panel' | 'picture-window' | 'auto';
  transomHeight: number;
  doorType: 'none' | 'single' | 'slider';
}
