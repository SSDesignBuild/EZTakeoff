import type { DeckModel } from './deckModel';
import type { ConsultationProject } from './consultationProject';
import { getCoverVisualProduct } from '../data/visualCatalog';
import { maxReferenceOverhangFt } from './renaissanceGuidance';
import { seatCanopyPost } from './coverDeckPlacement';
import { getRenaissanceExtrusion,makeRenaissanceFramePlan,
 inchToFoot,RENAISSANCE_INSULATED_ROOF } from './renaissanceManufacturer';

export type CoverWallSide='front'|'left'|'right'|'rear';
export type PlanarPoint=[number,number];
export interface RenaissanceWallRun{
 id:CoverWallSide;
 from:PlanarPoint;
 to:PlanarPoint;
 topFrom:number;
 topTo:number;
}
export interface RenaissanceWallMeasure extends RenaissanceWallRun{
 widthFt:number;
 bottomY:number;
}

/**
 * Single roof/post placement authority for all Renaissance 3D enclosure
 * systems AND Sales wall controls. Column positions are the *actual* seated
 * coordinates after footprint/cap safety checks, not an assumed roof width.
 */
export function planRenaissanceCoverWalls(model:DeckModel,project:ConsultationProject,
 center:PlanarPoint,deckHeight:number){
 const variant=project.coverFraming??'standard';
 const profile=getRenaissanceExtrusion(variant);
 const plan=makeRenaissanceFramePlan({
  family:project.coverFamily,variant,mount:project.coverMount??'wall-attached',
  roofStyle:project.coverRoofStyle??'studio',
  frameWidthFt:project.coverWidthFt&&project.coverWidthFt>0?project.coverWidthFt:model.width,
  frameProjectionFt:project.coverProjectionFt&&project.coverProjectionFt>0?
   project.coverProjectionFt:model.depth,
  deckHeightFt:deckHeight,postHeightFt:project.coverHeightFt??9,
  sideOverhangFt:Math.min(maxReferenceOverhangFt(project.coverFamily),project.coverSideOverhangFt??1),
  frontOverhangFt:Math.min(maxReferenceOverhangFt(project.coverFamily),project.coverFrontOverhangFt??1),
  requestedFrontPosts:project.coverPostCount??0,
 });
 const frameWidth=plan.frameWidthFt,frameDepth=plan.frameProjectionFt;
 const xMid=(model.minX+model.maxX)/2-center[0];
 const zMid=(model.minY+model.maxY)/2-center[1];
 const theoreticalBack=zMid-frameDepth/2;
 const theoreticalFront=theoreticalBack+frameDepth;
 const footprint=inchToFoot(profile.postOutsideIn+1.8);
 const seat=(x:number,z:number):PlanarPoint|null=>{
  const placed=seatCanopyPost([x+center[0],z+center[1]],model.points,footprint);
  return placed?[placed[0]-center[0],placed[1]-center[1]]:null;
 };
 const frontPosts=plan.frontPostXsFt.map(x=>seat(xMid+x,theoreticalFront))
  .filter((p):p is PlanarPoint=>p!==null);
 const rearPosts=plan.rearPostXsFt.map(x=>seat(xMid+x,theoreticalBack))
  .filter((p):p is PlanarPoint=>p!==null);
 const frameLeft=frontPosts.length?Math.min(...frontPosts.map(p=>p[0])):xMid-frameWidth/2;
 const frameRight=frontPosts.length?Math.max(...frontPosts.map(p=>p[0])):xMid+frameWidth/2;
 const back=rearPosts.length?rearPosts.reduce((sum,p)=>sum+p[1],0)/rearPosts.length:theoreticalBack;
 const frameFront=frontPosts.length?frontPosts.reduce((sum,p)=>sum+p[1],0)/frontPosts.length:theoreticalFront;
 const roofFrontY=plan.frontTopFt-plan.frontOverhangFt*plan.pitchInPerFt/12;
 const roofRearY=plan.gable?plan.frontTopFt:
  plan.backTopFt+plan.rearOverhangFt*plan.pitchInPerFt/12;
 const product=getCoverVisualProduct(project.coverFamily);
 const isSolid=['solid-studio','solid-truss-ends','full-trusses'].includes(product.family);
 const roofPanelThicknessFt=inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn);
 const screenRearSoffit=roofRearY-(isSolid?roofPanelThicknessFt/2:.10);
 const screenFrontSoffit=(plan.gable?plan.frontTopFt:roofFrontY)-
  (isSolid?roofPanelThicknessFt/2:.10);
 const wallRuns:RenaissanceWallRun[]=[
  {id:'front',from:[frameLeft,frameFront],to:[frameRight,frameFront],
   topFrom:screenFrontSoffit,topTo:screenFrontSoffit},
  {id:'left',from:[frameLeft,back],to:[frameLeft,frameFront],
   topFrom:screenRearSoffit,topTo:screenFrontSoffit},
  {id:'right',from:[frameRight,back],to:[frameRight,frameFront],
   topFrom:screenRearSoffit,topTo:screenFrontSoffit},
  ...(!plan.attached?[{id:'rear' as const,from:[frameLeft,back] as PlanarPoint,
   to:[frameRight,back] as PlanarPoint,
   topFrom:screenRearSoffit,topTo:screenRearSoffit}]:[]),
 ];
 const bottomY=deckHeight+.12;
 // The solid roof soffit is NOT the top of a wall placed directly
 // underneath a structural main header. Front/rear glazing and all factory
 // cuts must stop at the UNDERSIDE of the actual Renaissance beam. Side
 // walls continue to follow the pitched roof where no main header runs.
 // Dolce screen/roof connectors retain their separate wallRuns authority.
 const mainHeaderHeightFt=inchToFoot(profile.headerHeightIn);
 const frontBeamBottomFt=plan.frontTopFt-mainHeaderHeightFt;
 const rearBeamBottomFt=plan.backTopFt-mainHeaderHeightFt;
 const measuredRuns:RenaissanceWallMeasure[]=wallRuns.map(wall=>{
  const cap=wall.id==='front'?frontBeamBottomFt:
    wall.id==='rear'?rearBeamBottomFt:null;
  const topFrom=cap===null?wall.topFrom:Math.min(wall.topFrom,cap);
  const topTo=cap===null?wall.topTo:Math.min(wall.topTo,cap);
  return {...wall,topFrom,topTo,bottomY,
    widthFt:Math.hypot(wall.to[0]-wall.from[0],wall.to[1]-wall.from[1])};
 });
 return {plan,profile,xMid,zMid,theoreticalBack,theoreticalFront,
  frontPosts,rearPosts,frameLeft,frameRight,back,frameFront,
  screenRearSoffit,screenFrontSoffit,wallRuns,measuredRuns,bottomY};
}
