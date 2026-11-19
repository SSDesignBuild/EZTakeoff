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
}):DolceScreenProfile|null{
  const [x0,z0]=input.from,[x1,z1]=input.to;
  const vals=[x0,z0,x1,z1,input.bottomFt,input.topFromFt,input.topToFt];
  if(vals.some(value=>!Number.isFinite(value)))return null;
  const lengthFt=Math.hypot(x1-x0,z1-z0);
  const clearFrom=input.topFromFt-input.bottomFt;
  const clearTo=input.topToFt-input.bottomFt;
  if(lengthFt<.3||clearFrom<1||clearTo<1)return null;
  // Open View may form one uninterrupted field up to ~12ft; conventional
  // panels carry intermediate mullions at approximately 5ft.
  const bayCount=Math.max(1,Math.ceil(lengthFt/(input.openView?12:5)));
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
