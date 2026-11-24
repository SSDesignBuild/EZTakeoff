/**
 * Renaissance 2026 privacy wall sheet, pp 1-3. Tubes are 2 x 2in with
 * 0.040in wall, receiver U is 2.100 x 1.500in with 0.045in material,
 * spacers are 2 x 4 x 5/16in, with 2/4/6in CLEAR tube gaps.
 *
 * Pure planning only; supplier piece-stock lengths, engineering connections,
 * wind load, wall anchor and full attachment BOM need manufacturer approval.
 */
export type PrivacyWallClearGapIn=0|2|4|6;
export interface PrivacyTubeCourse{
  centerAboveBaseFt:number;
  lowerAboveBaseFt:number;
  upperAboveBaseFt:number;
}
export const PRIVACY_TUBE_OUTSIDE_IN=2;
export const PRIVACY_TUBE_WALL_IN=.040;
export const PRIVACY_RECEIVER_OUTSIDE_IN=2.1;
export const PRIVACY_RECEIVER_DEPTH_IN=1.5;
export const PRIVACY_RECEIVER_WALL_IN=.045;
export const PRIVACY_SPACER_HEIGHT_IN=4;
export const PRIVACY_SPACER_DEPTH_IN=5/16;
export const PRIVACY_SPACER_FASTENER='#10 x 3/4-inch hex';
export function planPrivacyTubeCourses(heightFt:number,gapIn:PrivacyWallClearGapIn):PrivacyTubeCourse[]{
  if(!Number.isFinite(heightFt)||heightFt<=0||![2,4,6].includes(gapIn))return [];
  const tubeFt=PRIVACY_TUBE_OUTSIDE_IN/12,gapFt=gapIn/12;
  const bottomClearanceFt=1/12,topClearanceFt=1/12;
  const available=heightFt-bottomClearanceFt-topClearanceFt;
  if(available<tubeFt)return [];
  const count=Math.min(100,Math.floor((available+gapFt+1e-9)/(tubeFt+gapFt)));
  return Array.from({length:count},(_,i)=>{
    const lower=bottomClearanceFt+i*(tubeFt+gapFt);
    return {
      lowerAboveBaseFt:lower,
      centerAboveBaseFt:lower+tubeFt/2,
      upperAboveBaseFt:lower+tubeFt,
    };
  });
}
export function privacyWallHasDesign(sideGaps:Partial<Record<'front'|'left'|'right'|'rear',PrivacyWallClearGapIn>>|undefined){
  return !!sideGaps&&Object.values(sideGaps).some(g=>[2,4,6].includes(Number(g)));
}
