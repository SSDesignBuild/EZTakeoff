/**
 * Reference-derived visible sculpted truss end CAP silhouette.
 *
 * Fresco Connection Details 2025 p4 shows "TRUSS CURVED END CAP":
 * a continuous reverse-S nose with a strong lower rear shoulder.
 * Aria Connection Details 2025 p3 shows "TRUSS SCALLOP END CAP":
 * a smooth elongated concave scallop with a rounded terminal nose.
 *
 * The manufacturer sheets do NOT DIMENSION the cast tip contour length
 * or mold radii; these normalized tracing stations reproduce the visual
 * profile of the supplied perspective parts illustration, but are NOT
 * fabrication CAD. All main trusses remain exact 2x6x.060in extrusions.
 * Classico uses the same visibly curved exposed truss tip family as the
 * manufacturer's fully exposed Classico/Contempo construction photos.
 *
 * Stations monotonically increase along the last 12.6in of the member;
 * depth values are a proportion of the main 6in member, measured from
 * the unbroken UPPER edge. A single bounded contour (no overlapping cap
 * mesh) prevents the old random-wavy/finicky S from self-intersecting.
 */
export type RenaissanceTrussEndStyle=
 'straight'|'fresco-s'|'aria-scallop'|'classico-s';
export const RENAISSANCE_END_REFERENCE={
 'fresco-s':{
  tailIn:12.6,
  // side view: rear body 6-in full depth -> rising sweep -> rounded nose.
  samples:[[0,1],[.12,.98],[.23,.92],[.38,.66],[.49,.45],
   [.58,.42],[.67,.46],[.75,.47],[.83,.40],[.92,.26],[1,.22]],
 },
 'aria-scallop':{
  tailIn:12.6,
  samples:[[0,1],[.14,.98],[.30,.88],[.46,.68],
   [.61,.47],[.76,.35],[.90,.26],[1,.22]],
 },
 'classico-s':{
  tailIn:12.6,
  samples:[[0,1],[.12,.98],[.23,.92],[.38,.66],[.49,.45],
   [.58,.42],[.67,.46],[.75,.47],[.83,.40],[.92,.26],[1,.22]],
 },
} as const;
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
export function referenceTrussTailDepthRatio(
 progress:number,style:RenaissanceTrussEndStyle,
):number{
 if(style==='straight')return 1;
 const u=clamp(progress),pts=RENAISSANCE_END_REFERENCE[style].samples;
 for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i];
  if(u>b[0])continue;
  // Smoothly interpolate each vector-traced part without creating
  // additional overshooting S-bends outside the reference contour.
  const fraction=clamp((u-a[0])/(b[0]-a[0]));
  const eased=fraction*fraction*(3-2*fraction);
  return a[1]+(b[1]-a[1])*eased;
 }
 return pts[pts.length-1][1];
}
export function renaissanceTrussTailDepthFt(
 stationFt:number,lengthFt:number,fullDepthFt:number,
 style:RenaissanceTrussEndStyle,
):number{
 if(style==='straight')return fullDepthFt;
 const tailFt=Math.min(RENAISSANCE_END_REFERENCE[style].tailIn/12,
  Math.max(.16,lengthFt*.35));
 const tailStart=Math.max(0,lengthFt-tailFt);
 if(stationFt<=tailStart)return fullDepthFt;
 return fullDepthFt*referenceTrussTailDepthRatio(
  (stationFt-tailStart)/Math.max(.001,lengthFt-tailStart),style);
}
export function renaissanceTrussContactOverlapFt(input:{
 beamTopFt:number;beamBottomFt:number;
 trussTopFt:number;trussBottomFt:number;
}):number{
 return Math.max(0,Math.min(input.beamTopFt,input.trussTopFt)-
  Math.max(input.beamBottomFt,input.trussBottomFt));
}
