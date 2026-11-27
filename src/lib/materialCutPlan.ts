import type { MaterialCutPlan, MaterialItem } from './types';

/** Keep cut assignment data intact; never derive purchasing quantities from
 * this display layer or rewrite the legacy layout label / saved row identity. */
export function withMaterialCutPlan(item: MaterialItem, boards: MaterialCutPlan['boards'],
  label: string, kerfIn = .125, trimIn = .25): MaterialItem {
  return { ...item, cutPlan: { label, kerfIn, trimIn, boards: boards.map(board => ({
    stockLengthFt: board.stockLengthFt, remainderIn: board.remainderIn,
    kerfIn: board.kerfIn ?? kerfIn, trimIn: board.trimIn ?? trimIn,
    cuts: board.cuts.map(cut => ({ id: cut.id, lengthFt: cut.lengthFt, location: cut.location })),
  })) } };
}

export function materialDrawingLabel(item: MaterialItem): string {
  return item.cutPlan?.label ?? item.layoutLabel ?? '';
}

/** Group identical assignments for readable tables without dropping a cut ID.
 * The exact decimal length remains the grouping key; only display rounds. */
export function materialCutGroups(plan: MaterialCutPlan) {
  const groups = new Map<string, { location: string; lengthFt: number; count: number; ids: string[] }>();
  for (const board of plan.boards) for (const cut of board.cuts) {
    const key = JSON.stringify([cut.location, cut.lengthFt]);
    const prior = groups.get(key);
    if (prior) { prior.count++; prior.ids.push(cut.id); }
    else groups.set(key, { location: cut.location, lengthFt: cut.lengthFt, count: 1, ids: [cut.id] });
  }
  return [...groups.values()];
}

export function mergeMaterialCutPlans(a: MaterialCutPlan | undefined, b: MaterialCutPlan | undefined): MaterialCutPlan | undefined {
  if (!a) return b;
  if (!b) return a;
  const exactBoards = (plan: MaterialCutPlan) => plan.boards.map(board => ({ ...board,
    kerfIn: board.kerfIn ?? plan.kerfIn, trimIn: board.trimIn ?? plan.trimIn }));
  return { ...a, label: a.label === b.label ? a.label : a.label + ' / ' + b.label,
    boards: [...exactBoards(a), ...exactBoards(b)] };
}
