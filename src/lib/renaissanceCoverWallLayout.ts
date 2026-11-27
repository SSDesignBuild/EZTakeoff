import type { DeckModel } from './deckModel';
import type { ConsultationProject } from './consultationProject';
import { getCoverVisualProduct } from '../data/visualCatalog';
import { maxReferenceOverhangFt } from './renaissanceGuidance';
import { seatCanopyPost } from './coverDeckPlacement';
import { getRenaissanceExtrusion,makeRenaissanceFramePlan,
 inchToFoot,RENAISSANCE_INSULATED_ROOF } from './renaissanceManufacturer';
import { renaissanceRoofPanelUndersideAtPost } from './renaissancePostClearance';
import { ELITE_CATALOG_PROFILES } from './eliteAddARoomExtrusions';

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
 // Measure at the actual wall stations after seating the posts on the
 // deck. The theoretical overhanging roof edge is not a wall endpoint.
 // Using its higher rear elevation could push a freestanding receiver
 // into the panel even after its own sloped cut was corrected.
 const soffitAt=(x:number,z:number)=>isSolid?
  renaissanceRoofPanelUndersideAtPost({
   xFt:x,zFt:z,headerCrownFt:plan.frontTopFt,
   roofRearZFt:theoreticalBack-plan.rearOverhangFt,
   roofFrontZFt:theoreticalFront+plan.frontOverhangFt,
   roofRearCenterFt:roofRearY,
   roofFrontCenterFt:plan.gable?plan.frontTopFt:roofFrontY,
   roofPanelThicknessFt,gable:plan.gable,midXFt:xMid,
   roofWidthFt:plan.roofWidthFt,eaveCenterFt:plan.frontTopFt,
   gableRiseFt:plan.ridgeTopFt-plan.backTopFt,
  }):roofRearY+(roofFrontY-roofRearY)*
    (z-(theoreticalBack-plan.rearOverhangFt))/plan.roofProjectionFt-.10;
 const screenRearSoffit=Math.min(soffitAt(frameLeft,back),soffitAt(frameRight,back));
 const screenFrontSoffit=Math.min(soffitAt(frameLeft,frameFront),soffitAt(frameRight,frameFront));
 const elite=project.coverScreenStyle==='elite-add-a-room';
 const eliteSystem=project.eliteSunroom?.roomSystem==='2-nonthermal'?'2-nonthermal':'3-thermal';
 const wallCapHalfDepth=elite?inchToFoot(ELITE_CATALOG_PROFILES[eliteSystem].topOutsideIn)/2:0;
 // A level cap across the wall thickness must clear the downhill edge of
 // a gable panel, not just the roof height at its center. This is the real
 // profile envelope, including its catalog overhang, with 1/8in fit space.
 const sideSoffitAt=(x:number,z:number)=>Math.min(
  soffitAt(x-wallCapHalfDepth,z),soffitAt(x+wallCapHalfDepth,z))-
  (elite?.125/12:0);
 const wallRuns:RenaissanceWallRun[]=[
  {id:'front',from:[frameLeft,frameFront],to:[frameRight,frameFront],
   topFrom:screenFrontSoffit,topTo:screenFrontSoffit},
  {id:'left',from:[frameLeft,back],to:[frameLeft,frameFront],
   topFrom:sideSoffitAt(frameLeft,back),topTo:sideSoffitAt(frameLeft,frameFront)},
  {id:'right',from:[frameRight,back],to:[frameRight,frameFront],
   topFrom:sideSoffitAt(frameRight,back),topTo:sideSoffitAt(frameRight,frameFront)},
  ...(!plan.attached?[{id:'rear' as const,from:[frameLeft,back] as PlanarPoint,
   to:[frameRight,back] as PlanarPoint,
   topFrom:screenRearSoffit,topTo:screenRearSoffit}]:[]),
 ];
 // deckHeight is the finished deck-board surface. Base channel and door
 // threshold thickness are modeled by the enclosure, not a floating datum.
 const bottomY=deckHeight;
 // The solid roof soffit is NOT the top of a wall placed directly
 // underneath a structural main header. Front/rear glazing and all factory
 // cuts must stop at the UNDERSIDE of the actual Renaissance beam. Side
 // walls continue to follow the pitched roof where no main header runs.
 // Dolce screen/roof connectors retain their separate wallRuns authority.
 const mainHeaderHeightFt=inchToFoot(profile.headerHeightIn);
 const frontBeamBottomFt=plan.frontTopFt-mainHeaderHeightFt;
 const rearBeamBottomFt=plan.backTopFt-mainHeaderHeightFt;
 const measuredRuns:RenaissanceWallMeasure[]=wallRuns.map(wall=>{
  const dx=wall.to[0]-wall.from[0],dz=wall.to[1]-wall.from[1];
  const centerSpan=Math.hypot(dx,dz);
  const postHalf=inchToFoot(profile.postOutsideIn)/2;
  const columnAt=(point:PlanarPoint)=>[...frontPosts,...rearPosts]
   .some(post=>Math.hypot(post[0]-point[0],post[1]-point[1])<.025);
  // Elite receivers mount on the INSIDE face of the existing cover
  // columns. Center-to-center sections buried both receivers inside the
  // structural posts and overstated every clear glazing opening.
  const startTrim=columnAt(wall.from)?postHalf:0;
  const endTrim=columnAt(wall.to)?postHalf:0;
  const at=(distance:number):PlanarPoint=>[
   wall.from[0]+dx*distance/Math.max(.01,centerSpan),
   wall.from[1]+dz*distance/Math.max(.01,centerSpan),
  ];
  const topAt=(distance:number)=>wall.topFrom+
   (wall.topTo-wall.topFrom)*distance/Math.max(.01,centerSpan);
  const from=at(startTrim),to=at(centerSpan-endTrim);
  const cap=wall.id==='front'?frontBeamBottomFt:
    wall.id==='rear'?rearBeamBottomFt:null;
  const topFrom=cap===null?topAt(startTrim):Math.min(topAt(startTrim),cap);
  const topTo=cap===null?topAt(centerSpan-endTrim):Math.min(topAt(centerSpan-endTrim),cap);
  return {...wall,from,to,topFrom,topTo,bottomY,
    widthFt:Math.hypot(to[0]-from[0],to[1]-from[1])};
 });
 return {plan,profile,xMid,zMid,theoreticalBack,theoreticalFront,
  frontPosts,rearPosts,frameLeft,frameRight,back,frameFront,
  screenRearSoffit,screenFrontSoffit,wallRuns,measuredRuns,bottomY};
}
