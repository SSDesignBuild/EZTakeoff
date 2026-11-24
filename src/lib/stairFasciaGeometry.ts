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
  const faceFt=input.boardFaceFt??1; // 12-inch manufacturer fascia stock face
  if([treadDepthFt,treads,riseFt,heightFt,faceFt].some(n=>!Number.isFinite(n))||
    treadDepthFt<=0||treads<=0||riseFt<=0||heightFt<=0||faceFt<=0)return [];
  const run=treads*treadDepthFt;
  // Continuous straight fascia edge sits above every tread nosing.
  // Previously it was one full rise below the corner at each step.
  const upperStart=Math.max(.15,heightFt+.14);
  const upperEnd=Math.max(.15,heightFt-treads*riseFt+.14);
  // A 12-in face is measured PERPENDICULAR to a diagonal board, not as
  // a 12-in vertical world-space box. An extra ripped lower strip may be
  // necessary to hide the structural stringer's underside (computed below).
  const slope=(upperEnd-upperStart)/run;
  const verticalDrop=faceFt*Math.sqrt(1+slope*slope);
  const lowerStart=Math.max(.025,upperStart-verticalDrop);
  const lowerEnd=Math.max(.025,upperEnd-verticalDrop);
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

/**
 * Structural stringers share a finite 1 1/2-in thickness, and Three.js's
 * extruded/rotated 2x12 profiles project in the negative local X direction.
 * Keep BOTH outermost stringers wholly INSIDE the finished tread width;
 * finished fascia sits OUTSIDE either tread end and conceals both faces.
 * This corrects the formerly asymmetric left stringer outside the fascia.
 */
export function planStairStringerFaceStations(
  treadWidthFt:number,stringerCount:number,stringerThicknessFt=1.5/12,
):number[]{
 if(!Number.isFinite(treadWidthFt)||treadWidthFt<=stringerThicknessFt||
   !Number.isFinite(stringerCount)||stringerCount<2||
   !Number.isFinite(stringerThicknessFt)||stringerThicknessFt<=0)return [];
 const count=Math.max(2,Math.floor(stringerCount));
 const start=-treadWidthFt/2+stringerThicknessFt;
 const end=treadWidthFt/2;
 return Array.from({length:count},(_,i)=>start+(end-start)*i/(count-1));
}

export interface StairFasciaCoverage {
 main:StairSideFasciaPoint[];
 lowerRip:StairSideFasciaPoint[];
 ripMaxWidthIn:number;
 ripRunFt:number;
 boardThicknessIn:0.75;
 boardFaceIn:12;
 stockLengthFt:12;
}
/**
 * Source of truth for ALL stair fascia 3D and ordering. We use actual
 * 3/4 x 12 x 12-ft finish stock. A straight 12-in fascia along the nosings
 * can sit too HIGH to hide a notched 2x12 lower chord; fill the missing
 * wedge with a second, ripped strip of matching stock, rather than leave
 * structural lumber visible under the finish.
 *
 * This calculation uses the SAME structural stringer lower centerline as
 * DeckStairAssembly3D.makeStringer (with .02-ft concealment allowance).
 * Coordinates and returns are local stair run/rise feet.
 */
export function planStairFasciaCoverage(input:{
 treadDepthFt:number;treads:number;riseFt:number;heightFt:number;
 style:'profiled'|'straight';nosingFt?:number;
}):StairFasciaCoverage{
 const main=planStairSideFascia(input);
 const empty:StairFasciaCoverage={
  main,lowerRip:[],ripMaxWidthIn:0,ripRunFt:0,
  boardThicknessIn:.75,boardFaceIn:12,stockLengthFt:12,
 };
 if(!main.length||input.style!=='straight')return empty;
 const {treadDepthFt,riseFt,heightFt}=input;
 const run=input.treads*treadDepthFt;
 const boardLowerStart=main[3].riseFt,boardLowerEnd=main[2].riseFt;
 const structuralStart=Math.max(.05,heightFt-riseFt-.72);
 const structuralEnd=Math.max(.055,heightFt-(input.treads+1)*riseFt+.02);
 const desiredStart=Math.max(.02,structuralStart-.055);
 const desiredEnd=Math.max(.02,structuralEnd-.055);
 const diffStart=boardLowerStart-desiredStart;
 const diffEnd=boardLowerEnd-desiredEnd;
 if(Math.max(diffStart,diffEnd)<=.012)return empty;
 const crossing=(Math.abs(diffStart-diffEnd)<1e-8)?run:
   Math.max(0,Math.min(run,run*diffStart/(diffStart-diffEnd)));
 const startsPositive=diffStart>.012;
 const ripRunFt=(diffStart>0&&diffEnd>0)?run:startsPositive?crossing:run-crossing;
 if(ripRunFt<=.02)return empty;
 const from=startsPositive?0:crossing,to=startsPositive?crossing:run;
 const lerp=(a:number,b:number,x:number)=>a+(b-a)*x/run;
 const topAt=(x:number)=>lerp(boardLowerStart,boardLowerEnd,x);
 const bottomAt=(x:number)=>lerp(desiredStart,desiredEnd,x);
 const corners=[
  {runFt:from,riseFt:topAt(from)},
  {runFt:to,riseFt:topAt(to)},
  {runFt:to,riseFt:Math.min(topAt(to),bottomAt(to))},
  {runFt:from,riseFt:Math.min(topAt(from),bottomAt(from))},
 ];
 return {...empty,lowerRip:corners,ripRunFt:to-from,
  ripMaxWidthIn:Math.max(0,diffStart,diffEnd)*12};
}
