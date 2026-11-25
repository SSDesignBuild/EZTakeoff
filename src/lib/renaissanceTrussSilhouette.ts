/**
 * Image-traced *presentation* silhouette of the Renaissance cast truss ends.
 *
 * Fresco 2025 structural parts p4 "TRUSS CURVED END CAP" and
 * Aria 2025 p3 "TRUSS SCALLOP END CAP" were inspected visually.
 * The molded cap in BOTH pictures curves DOWNWARD at the exposed nose:
 * its TOP bends downward; its UNDERSIDE first scoops up and then drops
 * again. The earlier single-boundary model kept an impossible straight
 * roof top through the cast nose, creating a sharp decorative wedge.
 *
 * Trace contains top and lower outline values independently, as ratios
 * of the measured 6in beam height; [u,upperDrop,lowerDrop].
 * u=0 starts at the full structural 6in section; u=1 is the exposed tip.
 * These sampled, smoothed points match the visible perspective outline
 * and are NOT factory mold dimensions / fabrication CAD. The manufacturer
 * sheets omit the actual cast tip length, radii and side-view dimensions.
 */
export type RenaissanceTrussEndStyle=
 'straight'|'fresco-s'|'aria-scallop'|'classico-s';
type Section=[number,number,number];
export const RENAISSANCE_END_REFERENCE={
 'fresco-s':{
  tailIn:12.6,
  samples:[
   [0,0,1],[.12,.00,.98],[.23,.03,.91],[.38,.10,.77],
   [.49,.16,.64],[.58,.23,.58],[.67,.33,.60],
   [.75,.42,.69],[.83,.50,.79],[.92,.55,.85],[1,.57,.92],
  ] as Section[],
 },
 'aria-scallop':{
  tailIn:12.6,
  samples:[
   [0,0,1],[.14,.01,.98],[.30,.05,.86],[.46,.12,.73],
   [.61,.20,.63],[.76,.35,.69],[.90,.47,.81],[1,.55,.88],
  ] as Section[],
 },
 'classico-s':{
  tailIn:12.6,
  // Classico full trusses use the 2025 curved cast-tip family; do not
  // substitute a short loose brace between its tip and main beam.
  samples:[
   [0,0,1],[.12,.00,.98],[.23,.03,.91],[.38,.10,.77],
   [.49,.16,.64],[.58,.23,.58],[.67,.33,.60],
   [.75,.42,.69],[.83,.50,.79],[.92,.55,.85],[1,.57,.92],
  ] as Section[],
 },
} as const;
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
const sample=(progress:number,style:RenaissanceTrussEndStyle):Section=>{
 if(style==='straight')return [clamp(progress),0,1];
 const u=clamp(progress),pts=RENAISSANCE_END_REFERENCE[style].samples;
 for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i];
  if(u>b[0])continue;
  const t=clamp((u-a[0])/(b[0]-a[0]));
  const eased=t*t*(3-2*t);
  const top=a[1]+(b[1]-a[1])*eased;
  const lower=a[2]+(b[2]-a[2])*eased;
  return [u,top,Math.max(top+.13,lower)];
 }
 const last=pts[pts.length-1];
 return [u,last[1],last[2]];
};
export function referenceTrussTailDepthRatio(
 progress:number,style:RenaissanceTrussEndStyle,
):number{
 const [,top,lower]=sample(progress,style);
 return lower-top;
}
const tailFraction=(stationFt:number,lengthFt:number,
 style:RenaissanceTrussEndStyle):number=>{
 if(style==='straight')return 0;
 const tailFt=Math.min(RENAISSANCE_END_REFERENCE[style].tailIn/12,
  Math.max(.16,lengthFt*.35));
 return clamp((stationFt-(lengthFt-tailFt))/Math.max(.001,tailFt));
};
export function renaissanceTrussTailTopDropFt(
 stationFt:number,lengthFt:number,fullDepthFt:number,
 style:RenaissanceTrussEndStyle,
):number{
 return fullDepthFt*sample(tailFraction(stationFt,lengthFt,style),style)[1];
}
export function renaissanceTrussTailLowerDropFt(
 stationFt:number,lengthFt:number,fullDepthFt:number,
 style:RenaissanceTrussEndStyle,
):number{
 return fullDepthFt*sample(tailFraction(stationFt,lengthFt,style),style)[2];
}
export function renaissanceTrussTailDepthFt(
 stationFt:number,lengthFt:number,fullDepthFt:number,
 style:RenaissanceTrussEndStyle,
):number{
 return renaissanceTrussTailLowerDropFt(stationFt,lengthFt,fullDepthFt,style)-
  renaissanceTrussTailTopDropFt(stationFt,lengthFt,fullDepthFt,style);
}
export function renaissanceTrussContactOverlapFt(input:{
 beamTopFt:number;beamBottomFt:number;
 trussTopFt:number;trussBottomFt:number;
}):number{
 return Math.max(0,Math.min(input.beamTopFt,input.trussTopFt)-
  Math.max(input.beamBottomFt,input.trussBottomFt));
}
