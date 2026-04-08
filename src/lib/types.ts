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
