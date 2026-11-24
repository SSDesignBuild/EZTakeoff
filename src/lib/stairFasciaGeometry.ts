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

/**
 * Actual FINISH side fascia, not a copy of the structural 2x12 stringer.
 * Top edge follows each individual tread seat and plumb riser cut, extending
 * to the selected nose. The continuous underside encloses the stringer's
 * exposed bottom line. The profile is mirrored unchanged on both stair sides.
 *
 * This is visual cut geometry; a supplier may require alternative fascia
 * joint/treatment based on board width, finished rise and board availability.
 */
export function planProfiledStairFascia(input:{
  treadDepthFt:number;treads:number;riseFt:number;heightFt:number;
  nosingFt?:number;
}):StairSideFasciaPoint[]{
 const {treadDepthFt,riseFt,heightFt}=input;
 const count=Math.round(input.treads);
 if(![treadDepthFt,riseFt,heightFt,input.treads].every(Number.isFinite)||
   treadDepthFt<=0||riseFt<=0||heightFt<=0||count<1)return [];
 const nose=Math.max(0,Math.min(.125,Number(input.nosingFt??0)));
 const outline:StairSideFasciaPoint[]=[];
 const upper=(step:number)=>heightFt-step*riseFt+.09;
 outline.push({runFt:0,riseFt:upper(1)});
 for(let step=1;step<=count;step++){
  const z=step*treadDepthFt+nose;
  outline.push({runFt:z,riseFt:upper(step)});
  if(step<count)outline.push({runFt:z,riseFt:upper(step+1)});
 }
 // The finish must hide the diagonal stringer underside all the way
 // to the toe, with both sides sharing the exact same cut coordinates.
 const end=Math.max(.025,heightFt-(count+1)*riseFt+.015);
 const start=Math.max(.08,heightFt-riseFt-.80);
 outline.push({runFt:count*treadDepthFt+nose,riseFt:end});
 outline.push({runFt:0,riseFt:start});
 return outline;
}

export function planStairSideFascia(input:{
  treadDepthFt:number;treads:number;riseFt:number;heightFt:number;
  style:'profiled'|'straight';nosingFt?:number;
}):StairSideFasciaPoint[]{
 return input.style==='straight'?planStraightStairFascia(input):
  planProfiledStairFascia(input);
}
