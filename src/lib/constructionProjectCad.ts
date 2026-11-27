import type { MaterialItem } from './types';
import { buildConstructionDrawingSet } from './constructionCad';
import { buildEnclosureConstructionSheets } from './constructionEnclosureCad';

/** One entry point for UI review and both download buttons. Studio's full
 * enclosure context accompanies the editable Admin copy all the way here. */
export function buildProjectConstructionDrawingSet(
  values: Parameters<typeof buildConstructionDrawingSet>[0], items: MaterialItem[],
  options: Parameters<typeof buildConstructionDrawingSet>[2] = {},
) {
  const enclosure = buildEnclosureConstructionSheets(values, options.project);
  const drawing = buildConstructionDrawingSet(values, items, { ...options,
    issues: [...(options.issues ?? []), ...enclosure.issues],
    extraSheets: [...(options.extraSheets ?? []), ...enclosure.sheets],
  });
  drawing.warnings.push(...enclosure.warnings);
  drawing.assemblyPartIds = [...new Set([...(drawing.assemblyPartIds ?? []), ...enclosure.partIds])];
  return drawing;
}
