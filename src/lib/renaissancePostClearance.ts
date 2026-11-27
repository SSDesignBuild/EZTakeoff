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
 const clamp=(n:number)=>Math.min(1,Math.max(0,n));
 if(p.gable){
  const offset=clamp(Math.abs(p.xFt-p.midXFt)/Math.max(.01,p.roofWidthFt/2));
  const center=p.eaveCenterFt+p.gableRiseFt*(1-offset);
  return center-p.roofPanelThicknessFt/2;
 }
 const zt=clamp((p.zFt-p.roofRearZFt)/
   Math.max(.01,p.roofFrontZFt-p.roofRearZFt));
 const center=p.roofRearCenterFt+
   (p.roofFrontCenterFt-p.roofRearCenterFt)*zt;
 return center-p.roofPanelThicknessFt/2;
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
