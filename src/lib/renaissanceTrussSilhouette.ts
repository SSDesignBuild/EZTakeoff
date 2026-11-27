/**
 * Visual ogee end cut, checked against the owner's curved/straight sample
 * photo and the Fresco p4 / Aria p3 parts sheets on 2026-11-26.
 * The upright showroom sample must be read in its installed orientation:
 * the top stays on the roof line, while the underside rises through a broad
 * reverse curve to the rounded tip. Longitudinal extrusion grooves remain
 * at their full-section heights and terminate at this cut; they do not bend
 * or squeeze with a deformed section. The former downturned top was wrong.
 * Stations and tail length are visual approximations, NOT fabrication CAD.
 */
export type RenaissanceTrussEndStyle=
 'straight'|'fresco-s'|'aria-scallop'|'classico-s'|'contempo-s';
type Section=[number,number,number];
// [progress from full-depth body to nose, upper drop, lower drop] / 6in.
// Broad central shoulder between two turns, as visible in the supplied cap.
const ogee:Section[]=[
 [0,0,1],[.06,0,.82],[.16,0,.60],[.28,0,.46],
 [.42,0,.41],[.56,0,.385],[.68,0,.34],[.79,0,.27],
 [.88,0,.19],[.95,0,.105],[1,0,.045],
];
export const RENAISSANCE_END_REFERENCE={
 'fresco-s':{tailIn:9,samples:ogee},
 'aria-scallop':{tailIn:9,samples:ogee.map(p=>[...p] as Section)},
 'classico-s':{tailIn:9,samples:ogee.map(p=>[...p] as Section)},
 'contempo-s':{tailIn:9,samples:ogee.map(p=>[...p] as Section)},
} as const;
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
/** Continuous, shape-preserving C1 cubic for factory illustration trace.
 * The previous segment-by-segment smoothstep made each reference station a
 * FLAT spot with a visible step-like change in slope -- exactly the kind of
 * finicky ornamental curve rejected by the user. These PCHIP tangents
 * preserve a smooth line without overshooting the traced nose envelope. */
function traceCoordinate(pts:readonly Section[],u:number,coordinate:1|2):number{
 const t=clamp(u),n=pts.length;
 if(t<=pts[0][0])return pts[0][coordinate];
 if(t>=pts[n-1][0])return pts[n-1][coordinate];
 const secant=(i:number)=>
   (pts[i+1][coordinate]-pts[i][coordinate])/
   (pts[i+1][0]-pts[i][0]);
 const tangent=(i:number):number=>{
   if(i===0)return secant(0);
   if(i===n-1)return secant(n-2);
   const a=secant(i-1),b=secant(i);
   if(a*b<=0)return 0;
   const h0=pts[i][0]-pts[i-1][0];
   const h1=pts[i+1][0]-pts[i][0];
   const w0=2*h1+h0,w1=h1+2*h0;
   return (w0+w1)/(w0/a+w1/b);
 };
 for(let i=1;i<n;i++){
  const a=pts[i-1],b=pts[i];
  if(t>b[0])continue;
  const h=b[0]-a[0],v=(t-a[0])/h;
  const v2=v*v,v3=v2*v;
  const interpolated=(2*v3-3*v2+1)*a[coordinate]+
    (v3-2*v2+v)*h*tangent(i-1)+
    (-2*v3+3*v2)*b[coordinate]+
    (v3-v2)*h*tangent(i);
  return Math.max(Math.min(a[coordinate],b[coordinate]),
    Math.min(Math.max(a[coordinate],b[coordinate]),interpolated));
 }
 return pts[n-1][coordinate];
}
const sample=(progress:number,style:RenaissanceTrussEndStyle):Section=>{
 if(style==='straight')return [clamp(progress),0,1];
 const u=clamp(progress),pts=RENAISSANCE_END_REFERENCE[style].samples;
 const top=traceCoordinate(pts,u,1),lower=traceCoordinate(pts,u,2);
 return [u,top,Math.max(top+.035,lower)];
};
export function referenceTrussTailDepthRatio(
 progress:number,style:RenaissanceTrussEndStyle,
):number{
 const [,top,lower]=sample(progress,style);
 return lower-top;
}
export function renaissanceTrussTailLengthFt(lengthFt:number,
 style:RenaissanceTrussEndStyle,availableTailFt?:number):number{
 if(style==='straight')return 0;
 return Math.max(.001,Math.min(RENAISSANCE_END_REFERENCE[style].tailIn/12,
  Math.max(.001,lengthFt-Math.min(.02,lengthFt*.1)),availableTailFt??lengthFt));
}
const tailFraction=(stationFt:number,lengthFt:number,
 style:RenaissanceTrussEndStyle):number=>{
 if(style==='straight')return 0;
 const tailFt=renaissanceTrussTailLengthFt(lengthFt,style);
 return clamp((stationFt-(lengthFt-tailFt))/tailFt);
};
/** Longitudinal cut station at a fixed original section height. The inverse
 * avoids scaling the rebates to the shrinking silhouette. */
export function renaissanceTrussEndStationFt(dropRatio:number,lengthFt:number,
 style:RenaissanceTrussEndStyle,availableTailFt?:number):number{
 if(style==='straight')return lengthFt;
 const d=clamp(dropRatio),tail=renaissanceTrussTailLengthFt(lengthFt,style,availableTailFt);
 if(d<=sample(1,style)[2])return lengthFt;
 if(d>=1)return lengthFt-tail;
 let lo=0,hi=1;
 for(let i=0;i<35;i++){
  const mid=(lo+hi)/2;
  if(sample(mid,style)[2]>d)lo=mid;else hi=mid;
 }
 return lengthFt-tail+tail*(lo+hi)/2;
}
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
