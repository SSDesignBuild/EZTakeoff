/**
 * Geometry shared by Dolce open-view and standard screen visualizations.
 * Screen run tops follow the actual corresponding Renaissance roof bearing
 * elevations; no flat-topped mesh may hang below a sloped roof.
 * Profile is a visualization envelope, not a manufacturer screen cut list.
 */
export interface DolceScreenProfile {
  lengthFt:number;
  bottomFt:number;
  topFromFt:number;
  topToFt:number;
  bayCount:number;
  contour:Array<{alongFt:number;riseFt:number}>;
  mullions:Array<{alongFt:number;bottomFt:number;topFt:number;heightFt:number}>;
}
export function planDolceScreenProfile(input:{
  from:readonly [number,number];to:readonly [number,number];
  bottomFt:number;topFromFt:number;topToFt:number;
  openView:boolean;
  /** Intermediate mullions only; outer support columns are modeled separately. */
  interiorUprights?:number;
}):DolceScreenProfile|null{
  const [x0,z0]=input.from,[x1,z1]=input.to;
  const vals=[x0,z0,x1,z1,input.bottomFt,input.topFromFt,input.topToFt];
  if(vals.some(value=>!Number.isFinite(value)))return null;
  const lengthFt=Math.hypot(x1-x0,z1-z0);
  const clearFrom=input.topFromFt-input.bottomFt;
  const clearTo=input.topToFt-input.bottomFt;
  if(lengthFt<.3||clearFrom<1||clearTo<1)return null;
  // Open-view is a single uninterrupted screen field irrespective of run length.
  // Standard screens take an explicit count; when omitted, retain legacy ~5ft bays.
  if(input.interiorUprights!==undefined&&!Number.isFinite(input.interiorUprights))return null;
  const interior=input.openView?0:input.interiorUprights===undefined
    ?Math.max(0,Math.ceil(lengthFt/5)-1)
    :Math.max(0,Math.min(24,Math.round(input.interiorUprights)));
  const bayCount=interior+1;
  const mullions=Array.from({length:bayCount+1},(_,i)=>{
    const fraction=i/bayCount;
    const topFt=input.topFromFt+(input.topToFt-input.topFromFt)*fraction;
    return {alongFt:lengthFt*fraction,bottomFt:input.bottomFt,topFt,
      heightFt:topFt-input.bottomFt};
  });
  const contour=[
    {alongFt:0,riseFt:0},
    {alongFt:lengthFt,riseFt:0},
    {alongFt:lengthFt,riseFt:clearTo},
    {alongFt:0,riseFt:clearFrom},
  ];
  return {...input,lengthFt,bayCount,contour,mullions};
}
/** Height on the canopy's front/back supporting rail, from frame roof line. */
export function roofLineAtX(input:{
  xFt:number;midXFt:number;roofWidthFt:number;
  eaveFt:number;gableRiseFt:number;gable:boolean;
  studioFrontFt:number;studioRearFt:number;rear:boolean;
}):number{
  if(!input.gable)return input.rear?input.studioRearFt:input.studioFrontFt;
  const half=Math.max(.001,input.roofWidthFt/2);
  const across=Math.min(1,Math.abs(input.xFt-input.midXFt)/half);
  return input.eaveFt+input.gableRiseFt*(1-across);
}

/**
 * Dolce Standard has one dedicated intermediate screen rail ONLY when it is
 * not using an integrated picket-guard assembly. The latter already draws
 * its own top rail at guard height, so rendering both creates an unwanted
 * second line crossing the pickets.
 *
 * Dolce Open View never receives a standard intermediate rail.
 */
export const showDolceStandardIntermediateRail = (
  openView:boolean,treatment:string,
):boolean => !openView && treatment !== 'integrated-picket';
