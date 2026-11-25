import type { DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { stairFlightFrame } from './stairRailVisualGeometry';

export interface StairPlanFootprint {
  sourceIndex: number;
  corners: DeckPoint[];
  treads: Array<[DeckPoint, DeckPoint]>;
  sides: Array<{side: 'left' | 'right'; enabled: boolean; start: DeckPoint; end: DeckPoint}>;
  center: DeckPoint;
  runFt: number;
}

/** The plan uses the same outward frame and run as the rendered stair assembly. */
export function planStairFootprints(model: DeckModel): StairPlanFootprint[] {
  if (model.stairRunFt <= 0 || model.stairTreadsPerRun <= 0) return [];
  return model.stairPlacements.flatMap((placement, index) => {
    const frame = stairFlightFrame(model, placement, [0, 0]);
    if (!frame) return [];
    const at = (cross: number, run: number): DeckPoint => ({
      x: frame.originX + Math.cos(frame.yaw) * cross + frame.outwardX * run,
      y: frame.originZ - Math.sin(frame.yaw) * cross + frame.outwardZ * run,
    });
    const left = -frame.widthFt / 2, right = frame.widthFt / 2;
    const run = model.stairRunFt;
    return [{
      sourceIndex: placement.sourceIndex ?? index,
      corners: [at(left, 0), at(right, 0), at(right, run), at(left, run)],
      treads: Array.from({length: model.stairTreadsPerRun}, (_, step) => {
        const station = run * (step + 1) / model.stairTreadsPerRun;
        return [at(left, station), at(right, station)] as [DeckPoint, DeckPoint];
      }),
      sides: [
        {side: 'left' as const, enabled: placement.left ?? model.stairRailingLeft,
          start: at(left, 0), end: at(left, run)},
        {side: 'right' as const, enabled: placement.right ?? model.stairRailingRight,
          start: at(right, 0), end: at(right, run)},
      ],
      center: at(0, run / 2), runFt: run,
    }];
  });
}
