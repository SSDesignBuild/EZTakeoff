/**
 * Visual intersection of a structural Renaissance post with its actual roof.
 *
 * Structural header stations remain owned by makeRenaissanceFramePlan. A
 * post's VISIBLE top (including trim cap) must not project through the
 * colored insulated roof panel whose mid-plane follows the sloped studio
 * roof or the gable roof. This is a renderer clipping constraint, NOT a
 * change to approved post stock/cut lengths or fastening engineering.
 */
export interface RenaissanceRoofPostClearance {
 xFt:number;zFt:number;headerCrownFt:number;
 roofRearZFt:number;roofFrontZFt:number;
 roofRearCenterFt:number;roofFrontCenterFt:number;
 roofPanelThicknessFt:number;postWidthFt?:number;
 gable:boolean;midXFt:number;roofWidthFt:number;
 eaveCenterFt:number;gableRiseFt:number;
}
export function renaissanceRoofPanelUndersideAtPost(p:RenaissanceRoofPostClearance):number{
 if(p.gable){
  const halfWidth=Math.max(.01,p.roofWidthFt/2);
  // Extend the cut plane over a column's outboard half at a zero-overhang
  // eave. Clamping to the roof edge leaves that half square above the slope.
  const offset=Math.abs(p.xFt-p.midXFt)/halfWidth;
  const center=p.eaveCenterFt+p.gableRiseFt*(1-offset);
  // The catalog panel thickness is normal to the roof. A vertical line
  // through a rotated panel reaches its underside at t/(2*cos(pitch)).
  return center-p.roofPanelThicknessFt/2*Math.hypot(1,p.gableRiseFt/halfWidth);
 }
 const run=Math.max(.01,p.roofFrontZFt-p.roofRearZFt);
 const rise=p.roofFrontCenterFt-p.roofRearCenterFt;
 const zt=(p.zFt-p.roofRearZFt)/run;
 const center=p.roofRearCenterFt+
   rise*zt;
 return center-p.roofPanelThicknessFt/2*Math.hypot(1,rise/run);
}
/** The cap ends at least 1/8in BELOW the panel underside, including
 * the matching aluminum post cap and its physical thickness. */
export function renaissanceVisiblePostTopFt(p:RenaissanceRoofPostClearance):number{
 const half=Math.max(0,p.postWidthFt??0)/2;
 // Check the complete cap footprint. Checking just its center lets the
 // downhill corner of a wide post pierce a pitched/gable roof.
 const safe=Math.min(...[-half,half].flatMap(dx=>[-half,half].map(dz=>
  renaissanceRoofPanelUndersideAtPost({...p,xFt:p.xFt+dx,zFt:p.zFt+dz}))))-.125/12;
 return Math.min(p.headerCrownFt,safe);
}
