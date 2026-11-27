/**
 * Sales-consultation stair landing planning, not a structural slab design.
 * An explicit site choice is required: unknown/existing concrete never add
 * materials. "bare-ground" adds one landing per drawn stair flight.
 * 80 lb dry concrete bags typically yield about 0.60 cubic feet; field mix,
 * slab thickness, soil/base prep and local code require independent review.
 */
export type StairLandingSurface='unknown'|'existing'|'bare-ground'|'site-plan';
export interface StairLandingPlan{
 widthFt:number;depthFt:number;thicknessIn:number;volumeCuFt:number;
 wasteAdjustedCuFt:number;bags80lb:number;
 orderAllowancePercent:number;bagYieldCuFt:number;
}
export const CONCRETE_BAG_80LB_YIELD_CUFT=.60;
export const DEFAULT_LANDING_ALLOWANCE_PERCENT=25;
export const DEFAULT_LANDING_DEPTH_FT=4;
export const DEFAULT_LANDING_THICKNESS_IN=4;
export function planStairLanding(widthFt:number,depthFt=DEFAULT_LANDING_DEPTH_FT,
 thicknessIn=DEFAULT_LANDING_THICKNESS_IN,
 orderAllowancePercent=DEFAULT_LANDING_ALLOWANCE_PERCENT,
 bagYieldCuFt=CONCRETE_BAG_80LB_YIELD_CUFT):StairLandingPlan|null{
 if(![widthFt,depthFt,thicknessIn,orderAllowancePercent,bagYieldCuFt].every(Number.isFinite)||
   widthFt<2||widthFt>30||depthFt<3||depthFt>20||
   thicknessIn<4||thicknessIn>12||orderAllowancePercent<0||orderAllowancePercent>100||
   bagYieldCuFt<.1||bagYieldCuFt>1)return null;
 const width=Math.max(4,widthFt);
 const volume=width*depthFt*thicknessIn/12;
 // S&S's editable ordering allowance is separate from actual slab volume.
 // At 4 x 4 x 4 in, 25% plus whole-bag rounding orders twelve 80-lb bags.
 const waste=volume*(1+orderAllowancePercent/100);
 return {widthFt:width,depthFt,thicknessIn,volumeCuFt:volume,
   wasteAdjustedCuFt:waste,orderAllowancePercent,bagYieldCuFt,
   bags80lb:Math.ceil(waste/bagYieldCuFt-1e-9)};
}
export function planStairLandingForValues(widthFt:number,
 values:Record<string,string|number|boolean>):StairLandingPlan|null{
 const selectedWidthFt=Number(values.stairLandingWidthFt??4);
 if(!Number.isFinite(selectedWidthFt)||selectedWidthFt<4||selectedWidthFt>30)return null;
 return planStairLanding(Math.max(widthFt,selectedWidthFt),Number(values.stairLandingDepthFt??DEFAULT_LANDING_DEPTH_FT),
   Number(values.stairLandingThicknessIn??DEFAULT_LANDING_THICKNESS_IN),
   Number(values.stairLandingAllowancePercent??DEFAULT_LANDING_ALLOWANCE_PERCENT),
   Number(values.concreteBag80lbYieldCuFt??CONCRETE_BAG_80LB_YIELD_CUFT));
}
export function landingSurface(input:unknown):StairLandingSurface{
 return input==='bare-ground'||input==='existing'||input==='site-plan'?input:'unknown';
}
export function planStairLandings(stairWidthsFt:readonly number[],
 values:Record<string,string|number|boolean>):StairLandingPlan[]{
 if(landingSurface(values.stairLandingSurface)!=='bare-ground')return [];
 return stairWidthsFt.map(width=>planStairLandingForValues(width,values)).filter(
   (p):p is StairLandingPlan=>p!==null);
}
