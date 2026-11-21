/**
 * Clean straight side-fascia panel. The visible upper edge is one straight
 * stringer-parallel line, not a succession of tread/riser notches. This is
 * distinct from the structural notched stair stringer.
 * Quantity and cut scheduling remain with the takeoff, not the mesh.
 */
export interface StairSideFasciaPoint {runFt:number;riseFt:number;}
export function planStraightStairFascia(input:{
  treadDepthFt:number;treads:number;riseFt:number;heightFt:number;
  boardFaceFt?:number;
}):StairSideFasciaPoint[] {
  const {treadDepthFt,treads,riseFt,heightFt}=input;
  const faceFt=input.boardFaceFt??.72;
  if([treadDepthFt,treads,riseFt,heightFt,faceFt].some(n=>!Number.isFinite(n))||
    treadDepthFt<=0||treads<=0||riseFt<=0||heightFt<=0||faceFt<=0)return [];
  const run=treads*treadDepthFt;
  // Continuous straight fascia edge sits above every tread nosing.
  // Previously it was one full rise below the corner at each step.
  const upperStart=Math.max(.15,heightFt+.14);
  const upperEnd=Math.max(.15,heightFt-treads*riseFt+.14);
  const lowerStart=Math.max(.035,upperStart-faceFt);
  const lowerEnd=Math.max(.035,upperEnd-faceFt);
  return [
    {runFt:0,riseFt:upperStart},
    {runFt:run,riseFt:upperEnd},
    {runFt:run,riseFt:lowerEnd},
    {runFt:0,riseFt:lowerStart},
  ];
}
