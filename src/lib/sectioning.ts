import { SectionConfig } from './types';

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
    } catch {
      // ignore parse failure
    }
  }

  return Array.from({ length: count }, (_, index) => createSection(index));
}
