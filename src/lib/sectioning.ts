import { GableSectionConfig, SectionConfig, SunroomSectionConfig } from './types';

export const DEFAULT_SCREEN_SECTION: SectionConfig = {
  id: 'section-1',
  label: 'Section 1',
  width: 8,
  height: 8,
  uprights: 1,
  chairRail: true,
  pickets: false,
  kickPanel: 'none',
  kickPanelHeight: 2,
  doorType: 'none',
  doorPlacement: 'center',
  doorOffsetInches: 0,
  doorWidth: 3,
  doorSwing: 'outswing',
  dogDoor: 'none',
  floorMount: 'concrete',
  wallMount: 'wood',
};

export const DEFAULT_GABLE_SECTION: GableSectionConfig = {
  id: 'gable-1',
  label: 'Gable 1',
  width: 8,
  height: 2,
  style: 'none',
  uprights: 0,
  mountingSurface: 'wood',
  sideMount: 'wood',
};

export const DEFAULT_SUNROOM_SECTION: SunroomSectionConfig = {
  id: 'sunroom-1',
  label: 'Section 1',
  width: 8,
  height: 10,
  uprights: 1,
  uprightMode: 'all',
  electricChase: false,
  mainSection: 'horizontal-sliders',
  kickSection: 'insulated',
  kickHeight: 2,
  transomType: 'auto',
  leftTransomHeight: 1,
  rightTransomHeight: 1,
  doorType: 'none',
};

export function createSection(index: number, overrides: Partial<SectionConfig> = {}): SectionConfig {
  return {
    ...DEFAULT_SCREEN_SECTION,
    id: `section-${Date.now()}-${index}`,
    label: `Section ${index + 1}`,
    ...overrides,
  };
}

export function createGableSection(index: number, overrides: Partial<GableSectionConfig> = {}): GableSectionConfig {
  return {
    ...DEFAULT_GABLE_SECTION,
    id: `gable-${Date.now()}-${index}`,
    label: `Gable ${index + 1}`,
    ...overrides,
  };
}

export function createSunroomSection(index: number, overrides: Partial<SunroomSectionConfig> = {}): SunroomSectionConfig {
  return {
    ...DEFAULT_SUNROOM_SECTION,
    id: `sunroom-${Date.now()}-${index}`,
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
          kickPanelHeight: Number(item.kickPanelHeight ?? DEFAULT_SCREEN_SECTION.kickPanelHeight),
          doorType: (item.doorType ?? 'none') as SectionConfig['doorType'],
          doorPlacement: (item.doorPlacement ?? 'center') as SectionConfig['doorPlacement'],
          doorOffsetInches: Number(item.doorOffsetInches ?? DEFAULT_SCREEN_SECTION.doorOffsetInches),
          doorWidth: Number(item.doorWidth ?? DEFAULT_SCREEN_SECTION.doorWidth),
          doorSwing: (item.doorSwing ?? 'outswing') as SectionConfig['doorSwing'],
          dogDoor: (item.dogDoor ?? 'none') as SectionConfig['dogDoor'],
          floorMount: (item.floorMount ?? 'concrete') as SectionConfig['floorMount'],
          wallMount: (item.wallMount ?? 'wood') as SectionConfig['wallMount'],
        }));
      }
    } catch {}
  }
  return Array.from({ length: count }, (_, index) => createSection(index));
}

export function parseGableSections(raw: string | number | boolean | undefined, count = 0): GableSectionConfig[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, index) => ({
          ...DEFAULT_GABLE_SECTION,
          ...item,
          id: String(item.id ?? `gable-${index + 1}`),
          label: String(item.label ?? `Gable ${index + 1}`),
          width: Number(item.width ?? DEFAULT_GABLE_SECTION.width),
          height: Number(item.height ?? DEFAULT_GABLE_SECTION.height),
          style: (item.style ?? 'none') as GableSectionConfig['style'],
          uprights: Number(item.uprights ?? DEFAULT_GABLE_SECTION.uprights),
          mountingSurface: (item.mountingSurface ?? DEFAULT_GABLE_SECTION.mountingSurface) as GableSectionConfig['mountingSurface'],
          sideMount: (item.sideMount ?? item.wallMount ?? DEFAULT_GABLE_SECTION.sideMount) as GableSectionConfig['sideMount'],
        }));
      }
    } catch {}
  }
  return Array.from({ length: count }, (_, index) => createGableSection(index));
}

export function parseSunroomSections(raw: string | number | boolean | undefined, count = 3): SunroomSectionConfig[] {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, index) => ({
          ...DEFAULT_SUNROOM_SECTION,
          ...item,
          id: String(item.id ?? `sunroom-${index + 1}`),
          label: String(item.label ?? `Section ${index + 1}`),
          width: Number(item.width ?? DEFAULT_SUNROOM_SECTION.width),
          height: Number(item.height ?? DEFAULT_SUNROOM_SECTION.height),
          uprights: Number(item.uprights ?? DEFAULT_SUNROOM_SECTION.uprights),
          uprightMode: (item.uprightMode ?? DEFAULT_SUNROOM_SECTION.uprightMode) as SunroomSectionConfig['uprightMode'],
          electricChase: Boolean(item.electricChase ?? DEFAULT_SUNROOM_SECTION.electricChase),
          mainSection: (item.mainSection ?? DEFAULT_SUNROOM_SECTION.mainSection) as SunroomSectionConfig['mainSection'],
          kickSection: (item.kickSection ?? DEFAULT_SUNROOM_SECTION.kickSection) as SunroomSectionConfig['kickSection'],
          kickHeight: Number(item.kickHeight ?? DEFAULT_SUNROOM_SECTION.kickHeight),
          transomType: (item.transomType ?? DEFAULT_SUNROOM_SECTION.transomType) as SunroomSectionConfig['transomType'],
          leftTransomHeight: Number(item.leftTransomHeight ?? item.transomHeight ?? DEFAULT_SUNROOM_SECTION.leftTransomHeight),
          rightTransomHeight: Number(item.rightTransomHeight ?? item.transomHeight ?? DEFAULT_SUNROOM_SECTION.rightTransomHeight),
          doorType: (item.doorType ?? DEFAULT_SUNROOM_SECTION.doorType) as SunroomSectionConfig['doorType'],
        }));
      }
    } catch {}
  }
  return Array.from({ length: count }, (_, index) => createSunroomSection(index));
}
