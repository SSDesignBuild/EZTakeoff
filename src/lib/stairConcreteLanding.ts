/**
 * Sales-consultation stair landing planning, not a structural slab design.
 * An explicit site choice is required: unknown/existing concrete never add
 * materials. "bare-ground" adds one landing per drawn stair flight.
 * 80 lb dry concrete bags typically yield about 0.60 cubic feet; field mix,
 * slab thickness, soil/base prep and local code require independent review.
 */
export type StairLandingSurface='unknown'|'existing'|'bare-ground';
export interface StairLandingPlan{
 widthFt:number;depthFt:number;thicknessIn:number;volumeCuFt:number;
 wasteAdjustedCuFt:number;bags80lb:number;
}
export const CONCRETE_BAG_80LB_YIELD_CUFT=.60;
export const LANDING_CONCRETE_WASTE_FACTOR=1.05;
export const DEFAULT_LANDING_DEPTH_FT=4;
export const DEFAULT_LANDING_THICKNESS_IN=5;
export function planStairLanding(widthFt:number,depthFt=DEFAULT_LANDING_DEPTH_FT,
 thicknessIn=DEFAULT_LANDING_THICKNESS_IN):StairLandingPlan|null{
 if(![widthFt,depthFt,thicknessIn].every(Number.isFinite)||
   widthFt<2||widthFt>30||depthFt<3||depthFt>20||
   thicknessIn<4||thicknessIn>12)return null;
 const width=Math.max(4,widthFt);
 const volume=width*depthFt*thicknessIn/12;
 const waste=volume*LANDING_CONCRETE_WASTE_FACTOR;
 return {widthFt:width,depthFt,thicknessIn,volumeCuFt:volume,
   wasteAdjustedCuFt:waste,bags80lb:Math.ceil(waste/CONCRETE_BAG_80LB_YIELD_CUFT-1e-9)};
}
export function landingSurface(input:unknown):StairLandingSurface{
 return input==='bare-ground'||input==='existing'?input:'unknown';
}
export function planStairLandings(stairWidthsFt:readonly number[],
 values:Record<string,string|number|boolean>):StairLandingPlan[]{
 if(landingSurface(values.stairLandingSurface)!=='bare-ground')return [];
 const depth=Number(values.stairLandingDepthFt??DEFAULT_LANDING_DEPTH_FT);
 const thickness=Number(values.stairLandingThicknessIn??DEFAULT_LANDING_THICKNESS_IN);
 return stairWidthsFt.map(width=>planStairLanding(width,depth,thickness)).filter(
   (p):p is StairLandingPlan=>p!==null);
}
