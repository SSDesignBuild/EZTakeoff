/**
 * Elite Add-A-Room catalog 3in pp4-5, 2in pp9-10 (provided privately).
 * Outside envelopes in inches; 24ft manufactured stock is handled by the
 * EXISTING Admin Sunrooms estimator, not by this visual cross-section module.
 *
 * Wall gauge and exact screw-boss/weep groove internals were NOT dimensioned
 * by the supplied catalog. `illustrativeSheetIn` is visual topology only,
 * never a structural/stock gauge claim.
 */
export type EliteProfileSystem='3-thermal'|'2-nonthermal';
export type EliteSectionProfile='receiver'|'drc'|'h-vertical'|'h-horizontal'|'bottom'|'top';
export interface EliteProfileDimensions {
  depthIn:number;receiverLipIn:number;drcLipIn:number;hFaceIn:number;
  bottomLeftLipIn:number;bottomRightLipIn:number;
  topOutsideIn:number;topLipIn:number;
}
export const ELITE_CATALOG_PROFILES:Record<EliteProfileSystem,EliteProfileDimensions>={
 '3-thermal':{
  depthIn:3,receiverLipIn:1.5,drcLipIn:1,hFaceIn:2,
  bottomLeftLipIn:1.25,bottomRightLipIn:1.5,
  topOutsideIn:5.25,topLipIn:1.25,
 },
 '2-nonthermal':{
  depthIn:2,receiverLipIn:1.5,drcLipIn:.75,hFaceIn:1,
  bottomLeftLipIn:1.25,bottomRightLipIn:1,
  topOutsideIn:3.75,topLipIn:1.25,
 },
};
export const ELITE_ILLUSTRATIVE_SHEET_IN=.065;
export type ProfileContourPt=readonly [number,number];
const t=ELITE_ILLUSTRATIVE_SHEET_IN;
function uSection(widthIn:number,legIn:number):ProfileContourPt[]{
 const w=widthIn/2;
 // U channel: mouth along +X; measured outside width along Y.
 return [[0,-w],[legIn,-w],[legIn,-w+t],[t,-w+t],
  [t,w-t],[legIn,w-t],[legIn,w],[0,w]];
}
function hSection(faceIn:number,depthIn:number):ProfileContourPt[]{
 const f=faceIn/2,d=depthIn/2,web=Math.min(.11,faceIn*.24);
 return [[-f,-d],[f,-d],[f,-d+t],[web/2,-d+t],
  [web/2,d-t],[f,d-t],[f,d],[-f,d],[-f,d-t],
  [-web/2,d-t],[-web/2,-d+t],[-f,-d+t]];
}
function bottomSection(depth:number,leftLip:number,rightLip:number):ProfileContourPt[]{
 const d=depth/2;
 // U section opens upward, with manufacturer-shown asymmetric weep lip.
 return [[-d,leftLip],[-d+t,leftLip],[-d+t,t],
  [d-t,t],[d-t,rightLip],[d,rightLip],[d,0],[-d,0]];
}
function topSection(depth:number,outside:number,lip:number):ProfileContourPt[]{
 const w=outside/2,d=depth/2,half=t/2;
 // 3in top cap extends to 5.25in, 2in cap to 3.75in.
 return [[-w,0],[w,0],[w,-t],[d+half,-t],
  [d+half,-lip],[d-half,-lip],[d-half,-t],
  [-d+half,-t],[-d+half,-lip],[-d-half,-lip],
  [-d-half,-t],[-w,-t]];
}
/** Cross section is a single open-profile polygon, NOT a solid bar. */
export function eliteProfileContourIn(system:EliteProfileSystem,
 kind:EliteSectionProfile):ProfileContourPt[]{
 const p=ELITE_CATALOG_PROFILES[system];
 if(kind==='receiver')return uSection(p.depthIn,p.receiverLipIn);
 if(kind==='drc')return uSection(p.depthIn,p.drcLipIn);
 if(kind==='h-vertical')return hSection(p.hFaceIn,p.depthIn);
 if(kind==='h-horizontal')return hSection(p.depthIn,p.hFaceIn);
 if(kind==='bottom')return bottomSection(p.depthIn,p.bottomLeftLipIn,p.bottomRightLipIn);
 return topSection(p.depthIn,p.topOutsideIn,p.topLipIn);
}
export function eliteProfileEnvelopeIn(system:EliteProfileSystem,kind:EliteSectionProfile){
 const path=eliteProfileContourIn(system,kind);
 return {
  width:Math.max(...path.map(p=>p[0]))-Math.min(...path.map(p=>p[0])),
  height:Math.max(...path.map(p=>p[1]))-Math.min(...path.map(p=>p[1])),
 };
}
