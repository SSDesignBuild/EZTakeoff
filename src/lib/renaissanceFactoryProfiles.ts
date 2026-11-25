/**
 * Renaissance factory drawing cross-sections, 2025.
 *
 * Fresco Connection Details p4 "TRUSS BEAM" (2 x 6 x .060in);
 * Aria Connection Details p3 identical truss section;
 * Fresco/Aria SD POST FRAME DETAILS pp5/4 "MAIN BEAM SD"
 * (7 x 2.75 x .080in; HD .125in).
 *
 * Both sections have TWO DISTINCT recessed bands on EACH cheek. A prior
 * wide central notch was incorrect. Station distances below are traced from
 * the dimensioned drawing's straight-line section outline, scaled by the
 * measured 6-/7-in exterior heights. The drawing does not dimension the
 * small return radii; this model preserves the actual two-bend arrangement
 * without pretending to be a die specification.
 */
export type RenaissanceFormedMember='truss'|'header';
export type FormedOutlinePoint=[number,number];

export const RENAISSANCE_FACTORY_GROOVES={
 truss:{
   heightIn:6,widthIn:2,wallIn:.060,
   grooveDepthIn:.28,
   // Each group lists the top-to-bottom corner distances from the upper
   // exterior edge: notch start, inset start, inset end, notch end.
   topGrooveIn:[.95,1.22,1.87,2.15],
   lowerGrooveIn:[3.85,4.14,4.78,5.05],
 },
 header:{
   heightIn:7,widthIn:2.75,wallIn:.080,
   grooveDepthIn:.28,
   topGrooveIn:[1.00,1.28,1.96,2.22],
   lowerGrooveIn:[3.94,4.20,4.90,5.18],
 },
} as const;

const positive=(value:number,defaultValue:number)=>
 Number.isFinite(value)&&value>0?value:defaultValue;

/** Traverses the right/left silhouette and returns a winding-safe closed
 * ring. widthFt and heightFt are the ACTUAL outer/member envelope. */
export function renaissanceFormedProfileContour(
 widthFt:number,heightFt:number,member:RenaissanceFormedMember='truss',
):FormedOutlinePoint[]{
 const spec=RENAISSANCE_FACTORY_GROOVES[member];
 const width=positive(widthFt,spec.widthIn/12);
 const height=positive(heightFt,spec.heightIn/12);
 const hx=width/2,hy=height/2;
 const verticalScale=height/(spec.heightIn/12);
 const inset=Math.min(spec.grooveDepthIn/12,Math.max(.0001,width*.25));
 const yAt=(inchesFromTop:number)=>hy-(inchesFromTop/12)*verticalScale;
 const [t1,t2,t3,t4]=spec.topGrooveIn;
 const [b1,b2,b3,b4]=spec.lowerGrooveIn;
 // From bottom exterior right up to the top exterior right, through TWO
 // separate vertical recessed channels. No single recessed center face.
 const right:FormedOutlinePoint[]=[
  [hx,-hy],
  [hx,yAt(b4)],[hx-inset,yAt(b3)],[hx-inset,yAt(b2)],[hx,yAt(b1)],
  [hx,yAt(t4)],[hx-inset,yAt(t3)],[hx-inset,yAt(t2)],[hx,yAt(t1)],
  [hx,hy],
 ];
 const left=[...right].reverse().map(([x,y]):FormedOutlinePoint=>[-x,y]);
 return [[-hx,-hy],...right,...left.slice(1)];
}
export function renaissanceFormedProfileGrooveCount(
 contour:readonly FormedOutlinePoint[],
 widthFt:number,
):number{
 const outside=widthFt/2;
 let count=0,inside=false;
 for(const [x] of contour.slice(1)){
  if(x<0)break;
  const current=outside-x>.01/12;
  if(current&&!inside)count++;
  inside=current;
 }
 return count;
}

/** True face band stations for independent 2025 header/truss extrusions.
 * The renderer's material grooves should follow these TWO locations, not
 * a fake line down the center of a large flat panel. */
export function renaissanceFormedGrooveBandsFt(
 heightFt:number,member:RenaissanceFormedMember,
):Array<{fromBottomFt:number;toBottomFt:number;recessFt:number}>{
 const spec=RENAISSANCE_FACTORY_GROOVES[member];
 const scale=heightFt/(spec.heightIn/12);
 return [spec.lowerGrooveIn,spec.topGrooveIn].map(v=>({
  fromBottomFt:heightFt-v[3]/12*scale,
  toBottomFt:heightFt-v[0]/12*scale,
  recessFt:spec.grooveDepthIn/12,
 }));
}
