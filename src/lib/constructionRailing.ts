import { resolveBoardDimensions } from './deckProductDimensions';
import type { DeckModel } from './deckModel';
import type { ConsultationProject } from './consultationProject';
import { getRailVisualProduct,type RailVisualProduct } from '../data/visualCatalog';
import { lightingScreenIntegrated } from './lightingAddons';
import { stairEnclosureClearanceWalls } from './stairEnclosureClearance';
import { planLevelRailingRuns,planDrinkRailPieces,railingSurfaceInsetFt,resolveDrinkRailMaterial,railPointKey } from './railingLayout';
import type { LevelRailRun } from './railingLayout';
import { planStairRailingRuns,stairRailDatumAt,type StairRailVisualRun,type StairRailVisualPanel,type StairRailPoint3D } from './stairRailVisualGeometry';
import { parseDeckGates } from './deckGates';

/** The selected enclosure owns the same level guard runs in drawing and 3D.
 * Stair selections remain untouched. Suppression does not mutate saved inputs. */
export function constructionDeckRailModel(model:DeckModel,project?:ConsultationProject,lowerTier=false):DeckModel{
  return project&&!lowerTier&&lightingScreenIntegrated(project)?{...model,railCoverage:[],manualRailingEdges:[]}:model;
}
export function resolveConstructionRailStyle(values:Record<string,string|number|boolean>):RailVisualProduct{
  const type=String(values.railingType??'aluminum');
  const id=typeof values.railingVisualId==='string'?values.railingVisualId:
    type==='wood'?(values.spindleType==='black-round'?'sns-wood-round':'sns-wood-pickets'):
    type.includes('vinyl')||type==='vinyl-composite'?'tt-statement':
    values.railingTopProfile==='modern'?'tt-ire-modern':values.railingTopProfile==='drink'?'tt-ire-drink':'tt-ire-classic';
  const selected=getRailVisualProduct(id),requestedPost=Number(String(values.railingPostSize??'3x3').split('x')[0]);
  return selected.takeoffSystem==='timbertech-ire'&&[2,3,4].includes(requestedPost)?{...selected,postWidthIn:requestedPost}:selected;
}
/** One real rail panel/cut per post bay. Run endpoints remain the post
 * centerlines; rail/infill clear endpoints are displaced by half the post. */
export function constructionLevelRailBays(runs:readonly LevelRailRun[],postWidthFt:number){
  return runs.flatMap(run=>run.posts.slice(1).map((to,index)=>{
    const from=run.posts[index],lengthFt=Math.hypot(to[0]-from[0],to[2]-from[2]);
    const trim=Math.min(lengthFt/3,postWidthFt/2),t=trim/Math.max(lengthFt,1e-9);
    const at=(f:number):[number,number,number]=>[from[0]+(to[0]-from[0])*f,from[1]+(to[1]-from[1])*f,from[2]+(to[2]-from[2])*f];
    return {...run,id:`${run.id}-B${index+1}`,parentRunId:run.id,bayIndex:index,from,to,posts:[from,to],lengthFt,
      clearFrom:at(t),clearTo:at(1-t),clearLengthFt:Math.max(0,lengthFt-2*trim)};
  }));
}
export function constructionStairRailBay(run:StairRailVisualRun,panel:StairRailVisualPanel,postWidthFt:number){
  const dx=panel.to[0]-panel.from[0],dy=panel.to[2]-panel.from[2],span=Math.hypot(dx,dy),ux=dx/span,uy=dy/span;
  const trim=Math.min(postWidthFt/2,span/3),clearSpanFt=span-2*trim;
  const at=(fraction:number):StairRailPoint3D=>{
    const x=panel.from[0]+ux*(trim+clearSpanFt*fraction),z=panel.from[2]+uy*(trim+clearSpanFt*fraction);
    return [x,stairRailDatumAt(run,x,z),z];
  };
  const from=at(0),to=at(1),first=run.posts[0],returnFt=run.landingReturnFt??run.insetFt;
  const landing:[number,number,number]=[first[0]+ux*returnFt,first[1],first[2]+uy*returnFt];
  const station=(landing[0]-from[0])*ux+(landing[2]-from[2])*uy;
  const bend=station>1e-7&&station<clearSpanFt-1e-7?landing:undefined;
  return {from,to,bend,clearSpanFt,at,lengthFt:bend?
    Math.hypot(bend[0]-from[0],bend[1]-from[1],bend[2]-from[2])+Math.hypot(to[0]-bend[0],to[1]-bend[1],to[2]-bend[2]):
    Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2])};
}
export function planConstructionRailing(model:DeckModel,values:Record<string,string|number|boolean>,heightFt:number,
 options:{project?:ConsultationProject;lowerTier?:boolean}={}){
  const style=resolveConstructionRailStyle(values),postWidthFt=style.postWidthIn/12,topWidthFt=style.topWidthIn/12;
  const topThicknessFt=Math.max(.12,style.topHeightIn/12),guardHeightFt=Math.max(3,Math.min(3.5,Number(values.railingHeightIn??36)/12));
  const metallic=style.family==='metal',wooden=style.family==='wood',drink=style.geometry.includes('drink');
  const drinkDimensions=resolveBoardDimensions(resolveDrinkRailMaterial(values)),drinkWidthFt=drinkDimensions.faceIn/12,drinkThicknessFt=drinkDimensions.thicknessIn/12;
  const infill=style.infills.includes(String(values.railingInfill) as typeof style.infills[number])?String(values.railingInfill):style.infills[0];
  const gates=parseDeckGates(values.deckGateEntries).flatMap(gate=>{
    const edge=model.edgeSegments.find(e=>e.index===gate.edgeIndex);if(!edge)return [];
    const stair=gate.placement==='stairs'?model.stairPlacements.find(p=>p.edgeIndex===edge.index):undefined;
    const width=Math.min(edge.length,Math.max(.5,stair?.width??gate.widthFt));
    const start=Math.min(Math.max(0,edge.length-width),Math.max(0,stair?.offset??gate.offsetFt??0));
    return [{...gate,edgeIndex:edge.index,start,end:start+width}];
  });
  const visible=constructionDeckRailModel(model,options.project,options.lowerTier);
  const insetFt=railingSurfaceInsetFt(postWidthFt,drink?drinkWidthFt:topWidthFt);
  const levels=planLevelRailingRuns(visible,[0,0],heightFt,postWidthFt,drink?drinkWidthFt:topWidthFt,metallic?7.1:6,
    visible.railCoverage,gates.map(g=>({edgeIndex:g.edgeIndex,startFt:g.start,endFt:g.end})));
  const walls=options.project&&!options.lowerTier?stairEnclosureClearanceWalls(model,options.project,[0,0],heightFt):[];
  const stairs=planStairRailingRuns(model,[0,0],heightFt,postWidthFt,metallic?7.1:6,insetFt,walls);
  const drinkPieces=drink?planDrinkRailPieces(levels,stairs,drinkWidthFt,guardHeightFt+.0285+drinkThicknessFt):[];
  return {style,postWidthFt,topWidthFt,topThicknessFt,guardHeightFt,metallic,wooden,drink,infill,
    drinkWidthFt,drinkThicknessFt,levels,levelBays:constructionLevelRailBays(levels,postWidthFt),stairs,drinkPieces,gates,visibleModel:visible};
}
/** Shared-post intersections count once, exactly as the installed assembly. */
export function constructionRailPostCount(plan:ReturnType<typeof planConstructionRailing>):number{
  return new Set([...plan.levelBays.flatMap(bay=>bay.posts),...plan.stairs.flatMap(run=>run.posts)].map(railPointKey)).size;
}
/** Existing two-bolt purchasing allowance for selected wood/composite post
 * mounts; approved mounting detail determines actual bolts and drilling. */
export function carriageBoltSetsPerRailPost(values:Record<string,string|number|boolean>):number{
  return ['wood','vinyl-composite'].includes(String(values.railingType))?2:0;
}
