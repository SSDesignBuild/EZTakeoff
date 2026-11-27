import type { DeckModel } from './deckModel';
import type { DeckRailCoverage } from './types';
import { planStairRailingRuns, type StairRailVisualRun } from './stairRailVisualGeometry';
import { subtractRailingOpenings, type StairsOrGateOpening } from './salesRailOpenings';

export type RailPoint = [number,number,number];
export type RailPlanPoint = [number,number];
export interface LevelRailRun {
 id:string;edgeIndex:number;from:RailPoint;to:RailPoint;
 lengthFt:number;posts:RailPoint[];
}
export interface DrinkRailPiece {
 id:string;kind:'level'|'stair'|'landing';edgeIndex:number;
 /** Top face corners, in physical world feet. The underside is a vertical offset. */
 corners:[RailPoint,RailPoint,RailPoint,RailPoint];
 lengthFt:number;
}
const cross=(a:RailPlanPoint,b:RailPlanPoint)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:RailPlanPoint,b:RailPlanPoint):RailPlanPoint=>[a[0]-b[0],a[1]-b[1]];
const len=(a:RailPlanPoint)=>Math.hypot(a[0],a[1]);
const unit=(a:RailPlanPoint):RailPlanPoint=>{const l=len(a)||1;return [a[0]/l,a[1]/l];};
const xz=(p:RailPoint):RailPlanPoint=>[p[0],p[2]];
const distance=(a:RailPoint,b:RailPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const railPointKey=(p:readonly number[])=>p.map(n=>Math.round(n*100000)).join('/');
/** Keep the existing rendered base skirt and cap completely on the finish surface. */
export function railingSurfaceInsetFt(postWidthFt:number,topWidthFt=0){
 return Math.max((postWidthFt+.06)*Math.SQRT2/2,topWidthFt/2)+.5/12;
}
function intersection(a:RailPlanPoint,da:RailPlanPoint,b:RailPlanPoint,db:RailPlanPoint){
 const determinant=cross(da,db);
 if(Math.abs(determinant)<1e-9)return null;
 const t=cross(sub(b,a),db)/determinant;
 return [a[0]+da[0]*t,a[1]+da[1]*t] as RailPlanPoint;
}
/** Inset full edge lines meet at a single corner. Never shift X/Z by a global sign. */
export function railingEdgePoint(model:DeckModel,edgeIndex:number,stationFt:number,
 center:readonly [number,number],insetFt:number):RailPlanPoint|null{
 const edge=model.edgeSegments.find(e=>e.index===edgeIndex);if(!edge)return null;
 const signed=model.points.reduce((s,p,i)=>{const q=model.points[(i+1)%model.points.length];return s+p.x*q.y-q.x*p.y;},0);
 const sign=signed>=0?1:-1;
 const edgeLine=(index:number)=>{
  const e=model.edgeSegments.find(item=>item.index===index);if(!e)return null;
  const dir=unit([e.end.x-e.start.x,e.end.y-e.start.y]);
  const normal:RailPlanPoint=[-dir[1]*sign,dir[0]*sign];
  return {dir,normal,start:[e.start.x+normal[0]*insetFt,e.start.y+normal[1]*insetFt] as RailPlanPoint};
 };
 const line=edgeLine(edgeIndex)!;
 const station=Math.max(0,Math.min(edge.length,stationFt));
 let p:RailPlanPoint=[line.start[0]+line.dir[0]*station,line.start[1]+line.dir[1]*station];
 if(station<1e-6||edge.length-station<1e-6){
  const neighbor=edgeLine((edgeIndex+(station<1e-6?model.points.length-1:1))%model.points.length);
  const corner=neighbor&&intersection(line.start,line.dir,neighbor.start,neighbor.dir);
  // For extremely acute vertices, trim to the local footprint instead of
  // creating a several-foot miter spur. Normal 45/90 degree plans intersect.
  if(corner&&Math.hypot(corner[0]-p[0],corner[1]-p[1])<=insetFt*8+.01)p=corner;
 }
 return [p[0]-center[0],p[1]-center[1]];
}
export function planLevelRailingRuns(model:DeckModel,center:readonly [number,number],deckHeightFt:number,
 postWidthFt:number,topWidthFt:number,maxBayFt=7.1,
 coverage:DeckRailCoverage[]=model.railCoverage,extraOpenings:StairsOrGateOpening[]=[]):LevelRailRun[]{
 const inset=railingSurfaceInsetFt(postWidthFt,topWidthFt);
 const stairs=planStairRailingRuns(model,center,deckHeightFt,postWidthFt,maxBayFt,inset);
 const stairCuts=model.stairPlacements.filter(s=>s.edgeIndex!==null)
  .map(s=>({edgeIndex:s.edgeIndex!,startFt:s.offset,endFt:s.offset+s.width}));
 const spans=subtractRailingOpenings(coverage,[...stairCuts,...extraOpenings]);
 return spans.flatMap((span,index)=>{
  const a=railingEdgePoint(model,span.edgeIndex,span.start,center,inset);
  const b=railingEdgePoint(model,span.edgeIndex,span.end,center,inset);if(!a||!b)return [];
  const edge=model.edgeSegments.find(e=>e.index===span.edgeIndex)!;
  const pointAt=(station:number,p:RailPlanPoint):RailPoint=>{
   // A level rail terminates at the SAME top post as its selected stair
   // side. No duplicate post outside the stair or clearance gap in the cap.
   const raw:RailPoint=[edge.start.x+(edge.end.x-edge.start.x)*station/edge.length-center[0],deckHeightFt,
    edge.start.y+(edge.end.y-edge.start.y)*station/edge.length-center[1]];
   const candidates=stairs.filter(s=>s.edgeIndex===span.edgeIndex).map(s=>s.posts[0]);
   const shared=candidates.find(q=>Math.hypot(q[0]-raw[0],q[2]-raw[2])<inset*1.5+.001);
   if(shared)return [...shared];
   // Unjoined free ends also keep their square base completely on deck.
   return [p[0],deckHeightFt,p[1]];
  };
  const from=pointAt(span.start,a),to=pointAt(span.end,b),lengthFt=distance(from,to);
  if(lengthFt<.08)return [];
  const count=Math.max(1,Math.ceil(lengthFt/maxBayFt));
  return [{id:'level-'+span.edgeIndex+'-'+index,edgeIndex:span.edgeIndex,from,to,lengthFt,
   posts:Array.from({length:count+1},(_,i)=>[
    from[0]+(to[0]-from[0])*i/count,deckHeightFt,from[2]+(to[2]-from[2])*i/count,
   ] as RailPoint)}];
 });
}
interface BoardPath{ id:string;kind:DrinkRailPiece['kind'];edgeIndex:number;from:RailPoint;to:RailPoint; }
/** Actual miter-cut top polygons; adjacent pieces share the exact cut face.
 * The short level return over a stair's landing post meets its pitched board
 * at the deck nosing. This keeps the plan miter horizontal and the pitch
 * transition square/plumb, rather than twisting a cap through a corner post. */
export function planDrinkRailPieces(level:LevelRailRun[],stairs:StairRailVisualRun[],
 boardWidthFt=5.5/12,topOffsetFt=3+.075+.093/2):DrinkRailPiece[]{
 const paths:BoardPath[]=[];
 for(const r of level){
  // Stock-length joins occur over real support posts. Adjacent board pieces
  // share one square cut; nothing stops at every panel or leaves a gap.
  let first=0,part=0;
  while(first<r.posts.length-1){
   let last=first+1;
   while(last+1<r.posts.length&&distance(r.posts[first],r.posts[last+1])<=20-boardWidthFt)last++;
   const a=r.posts[first],b=r.posts[last];
   paths.push({id:r.id+'-'+part++,kind:'level',edgeIndex:r.edgeIndex,
    from:[a[0],a[1]+topOffsetFt,a[2]],to:[b[0],b[1]+topOffsetFt,b[2]]});
   first=last;
  }
 }
 for(const run of stairs){
  const from=run.posts[0],to=run.posts[run.posts.length-1];if(!from||!to)continue;
  const direction=unit([to[0]-from[0],to[2]-from[2]]);
  const returnFt=run.landingReturnFt??run.insetFt;
  const landing:RailPoint=[from[0]+direction[0]*returnFt,from[1]+topOffsetFt,
    from[2]+direction[1]*returnFt];
  const start:RailPoint=[from[0],from[1]+topOffsetFt,from[2]];
  if(returnFt>1e-6)paths.push({id:'stair-landing-'+run.placementIndex+'-'+run.side,kind:'landing',edgeIndex:run.edgeIndex,from:start,to:landing});
  const supports:RailPoint[]=[landing,...run.posts.slice(1).map(p=>
    [p[0],p[1]+topOffsetFt,p[2]] as RailPoint)];
  let first=0,part=0;
  while(first<supports.length-1){
   let last=first+1;
   while(last+1<supports.length&&distance(supports[first],supports[last+1])<=20-boardWidthFt)last++;
   paths.push({id:'stair-'+run.placementIndex+'-'+run.side+'-'+part++,kind:'stair',edgeIndex:run.edgeIndex,
    from:supports[first],to:supports[last]});
   first=last;
  }
 }
 const h=boardWidthFt/2;
 const cutAt=(path:BoardPath,first:boolean):[RailPoint,RailPoint]=>{
  const p=first?path.from:path.to,other=first?path.to:path.from;
  const d=unit(sub(xz(other),xz(p)));
  const adjacent=paths.find(q=>q!==path&&(distance(q.from,p)<1e-5||distance(q.to,p)<1e-5));
  let off:RailPlanPoint=[-d[1]*h,d[0]*h];
  let endpoint=p;
  if(adjacent){
   const otherEnd=distance(adjacent.from,p)<1e-5?adjacent.to:adjacent.from;
   const e=unit(sub(xz(otherEnd),xz(p)));
   const bisector:RailPlanPoint=[d[0]+e[0],d[1]+e[1]];
   if(len(bisector)>1e-6){
    const b=unit(bisector),denom=Math.abs(cross(d,b));
    if(denom>.15)off=[b[0]*h/denom,b[1]*h/denom];
   }
  }else{
   // A free terminal covers the complete end post, not only its centre.
   endpoint=[p[0]-d[0]*h,p[1],p[2]-d[1]*h];
   if(path.kind==='stair'){
    const horizontal=Math.hypot(path.to[0]-path.from[0],path.to[2]-path.from[2]);
    const slope=(other[1]-p[1])/Math.max(.001,horizontal);
    endpoint[1]-=slope*h;
   }
  }
  return [[endpoint[0]+off[0],endpoint[1],endpoint[2]+off[1]],
    [endpoint[0]-off[0],endpoint[1],endpoint[2]-off[1]]];
 };
 return paths.flatMap(path=>{
  const direction=unit(sub(xz(path.to),xz(path.from)));
  const order=(pair:[RailPoint,RailPoint],p:RailPoint)=>cross(direction,sub(xz(pair[0]),xz(p)))>=0?pair:[pair[1],pair[0]];
  const [a,d]=order(cutAt(path,true),path.from),[b,c]=order(cutAt(path,false),path.to);
  const lengthFt=Math.max(distance(a,b),distance(d,c));
  if(lengthFt<.01)return [];
  return [{id:path.id,kind:path.kind,edgeIndex:path.edgeIndex,corners:[a,b,c,d],lengthFt} as DrinkRailPiece];
 });
}
export function resolveDrinkRailMaterial(values:Record<string,string|number|boolean>){
 const selected=String(values.drinkRailMaterial??'match');
 return selected==='match'||!selected?String(values.deckingMaterial??''):selected;
}
