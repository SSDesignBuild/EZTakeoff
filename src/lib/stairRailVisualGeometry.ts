import type {DeckModel,StairPlacement} from './deckModel';
export type StairRailPoint3D=[number,number,number];
export interface StairRailVisualPanel{
 startFt:number;endFt:number;lengthFt:number;from:StairRailPoint3D;to:StairRailPoint3D;
}
export interface StairRailVisualRun{
 placementIndex:number;edgeIndex:number;side:'left'|'right';
 runFt:number;widthFt:number;panels:StairRailVisualPanel[];
 posts:StairRailPoint3D[];
 postBaseYs:number[];insetFt:number;slopedLengthFt:number;
 /** The level return ends at the deck nosing; a post moved onto a tread has none. */
 landingReturnFt?:number;
}
export interface StairRailClearanceWall {
 from:readonly [number,number];to:readonly [number,number];halfDepthFt:number;
}
/** Shared outward frame for actual 3D stair stringers and matching rail runs. */
export function stairFlightFrame(model:DeckModel,placement:StairPlacement,
 center:readonly [number,number]){
 const start=placement.start,end=placement.end;
 if(!start||!end)return null;
 const dx=end.x-start.x,dz=end.y-start.y,width=Math.hypot(dx,dz);
 if(width<.1)return null;
 const winding=model.points.reduce((sum,p,i)=>{
  const next=model.points[(i+1)%model.points.length];return sum+p.x*next.y-next.x*p.y;
 },0);
 const outwardX=(winding>=0?dz:-dz)/width;
 const outwardZ=(winding>=0?-dx:dx)/width;
 return {widthFt:width,yaw:Math.atan2(outwardX,outwardZ),
  originX:(start.x+end.x)/2-center[0],
  originZ:(start.y+end.y)/2-center[1],outwardX,outwardZ};
}
/** Do not suppress a chosen stair guard just because a screen or sunroom
 * occupies the top landing. Deck railing selections govern EACH side. */
export function planStairRailingRuns(model:DeckModel,
 center:readonly [number,number],deckHeightFt:number,
 postOutsideWidthFt=3.5/12,maxBayFt=6,
 insetFt=(postOutsideWidthFt+.06)*Math.SQRT2/2+.5/12,
 enclosureWalls:readonly StairRailClearanceWall[]=[]):StairRailVisualRun[]{
 if(model.stairCount<=0||model.stairTreadsPerRun<=0||model.stairRunFt<=.01)return [];
 const runs:StairRailVisualRun[]=[];
 const rise=deckHeightFt/Math.max(1,model.stairRisers);
 const descent=rise*model.stairTreadsPerRun;
 const sides:Array<['left'|'right',number,boolean]>=[
  ['left',-1,model.stairRailingLeft],['right',1,model.stairRailingRight],
 ];
 for(const [i,placement]of model.stairPlacements.entries()){
  if(placement.edgeIndex===null)continue;
  const frame=stairFlightFrame(model,placement,center);
  if(!frame)continue;
  const runFt=model.stairRunFt;
  const treadDepth=runFt/Math.max(1,model.stairTreadsPerRun);
  const inset=Math.min(insetFt,frame.widthFt/3);
  const baseHalf=(postOutsideWidthFt+.06)/2;
  const projectedHalf=baseHalf*(Math.abs(frame.outwardX)+Math.abs(frame.outwardZ));
  const clearHalf=Math.max(projectedHalf,inset-.5/12),clearGap=.5/12;
  let firstStation=-inset;
  for(const sign of [-1,1]){
   const cross=sign*(frame.widthFt/2-inset);
   const origin:[number,number]=[frame.originX+Math.cos(frame.yaw)*cross,
    frame.originZ-Math.sin(frame.yaw)*cross];
   for(const wall of enclosureWalls){
    const dx=wall.to[0]-wall.from[0],dz=wall.to[1]-wall.from[1],length=Math.hypot(dx,dz);
    if(length<.01)continue;
    const tangent=[dx/length,dz/length],normal=[-tangent[1],tangent[0]];
    let enter=-Infinity,leave=Infinity;
    for(const [axis,min,max]of [[tangent,-clearHalf,length+clearHalf],
     [normal,-wall.halfDepthFt-clearHalf,wall.halfDepthFt+clearHalf]] as const){
     const offset=(origin[0]-wall.from[0])*axis[0]+(origin[1]-wall.from[1])*axis[1];
     const direction=frame.outwardX*axis[0]+frame.outwardZ*axis[1];
     if(Math.abs(direction)<1e-8){if(offset<min||offset>max){enter=Infinity;break;}}
     else {
      const a=(min-offset)/direction,b=(max-offset)/direction;
      enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
     }
    }
    // Only the top-landing enclosure can affect this rail. A wall farther
    // along the flight must not drag a post across several stair treads.
    if(enter<=leave&&leave>=-inset&&enter<=treadDepth&&leave<runFt-inset)
     firstStation=Math.max(firstStation,leave+clearGap);
   }
  }
  if(firstStation>-projectedHalf-.02){
   // A relocated top post seats fully on the first available tread. It
   // must never hang across the drop between the deck and that tread.
   const tread=Math.max(0,Math.floor(firstStation/treadDepth));
   const near=tread*treadDepth+projectedHalf+.02;
   const far=(tread+1)*treadDepth-projectedHalf-.02;
   firstStation=Math.max(firstStation,near);
   if(firstStation>far)firstStation=(tread+1)*treadDepth+projectedHalf+.02;
  }
  const finalStation=runFt-inset;
  if(firstStation>=finalStation-.05)firstStation=-inset;
  const landingReturnFt=Math.max(0,-firstStation);
  for(const [side,sign,defaultEnabled]of sides){
   // The stored placement is authoritative, including independently
   // configured additional stair flights. A screen room must never
   // override this explicit selected side.
   const enabled=side==='left'
     ?placement.left??defaultEnabled:placement.right??defaultEnabled;
   if(!enabled)continue;
   const pitch=descent/Math.max(.001,finalStation);
   const slopedLengthFt=landingReturnFt+Math.hypot(finalStation-Math.max(0,firstStation),
    descent-pitch*Math.max(0,firstStation));
   const count=Math.max(1,Math.ceil(slopedLengthFt/Math.max(.5,maxBayFt)));
   const cross=sign*(frame.widthFt/2-inset);
   const at=(z:number):StairRailPoint3D=>{
    return [frame.originX+Math.cos(frame.yaw)*cross+Math.sin(frame.yaw)*z,
      deckHeightFt-descent*Math.max(0,z)/Math.max(.001,runFt-inset),
      frame.originZ-Math.sin(frame.yaw)*cross+Math.cos(frame.yaw)*z];
   };
   const stations=Array.from({length:count+1},(_,j)=>{
    if(j===0)return firstStation;
    if(j===count)return finalStation;
    // Put an intermediate base at a tread centre, never astride a riser.
    const desired=firstStation+(finalStation-firstStation)*j/count;
    return (Math.floor(desired/treadDepth)+.5)*treadDepth;
   });
   const posts=stations.map(at);
   const postBaseYs=posts.map((_,j)=>{
    const z=stations[j];
    if(z<=0)return deckHeightFt;
    const tread=Math.max(1,Math.min(model.stairTreadsPerRun,Math.ceil(z/treadDepth)));
    return deckHeightFt-rise*tread;
   });
   runs.push({placementIndex:i,edgeIndex:placement.edgeIndex,side,
    runFt,widthFt:frame.widthFt,posts,postBaseYs,insetFt:inset,landingReturnFt,slopedLengthFt,
    panels:Array.from({length:count},(_,j)=>({
     startFt:stations[j]-firstStation,endFt:stations[j+1]-firstStation,
     lengthFt:j===0?landingReturnFt+Math.hypot(stations[j+1]-Math.max(0,firstStation),posts[j+1][1]-posts[j][1]):
       Math.hypot(stations[j+1]-stations[j],posts[j+1][1]-posts[j][1]),
     from:posts[j],to:posts[j+1],
    }))});
  }
 }
 return runs;
}

/** Height of the cap's supporting datum at any point on a stair flight.
 * Includes the level return over the landing post and the continued pitch
 * past the terminal post to the end of its cap board. */
export function stairRailDatumAt(run:StairRailVisualRun,x:number,z:number){
 const a=run.posts[0],b=run.posts[run.posts.length-1];
 const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
 if(length<1e-8)return a[1];
 const station=((x-a[0])*(b[0]-a[0])+(z-a[2])*(b[2]-a[2]))/length;
 const landing=run.landingReturnFt??run.insetFt;
 return a[1]+(b[1]-a[1])*Math.max(0,station-landing)/Math.max(.001,length-landing);
}
/** A concealed post is cut to the underside of the drink board across its
 * complete footprint, not to the board height at only the post centre. */
export function stairDrinkPostVertices(run:StairRailVisualRun,index:number,
 postWidthFt:number,guardHeightFt:number,boardUndersideOffsetFt=.0285){
 const p=run.posts[index],half=postWidthFt/2,base=run.postBaseYs[index];
 const corners=[[-half,-half],[half,-half],[half,half],[-half,half]];
 const top:StairRailPoint3D[]=corners.map(([x,z])=>[p[0]+x,
   stairRailDatumAt(run,p[0]+x,p[2]+z)+guardHeightFt+boardUndersideOffsetFt,p[2]+z]);
 const bottom:StairRailPoint3D[]=corners.map(([x,z])=>[p[0]+x,base,p[2]+z]);
 return {top,bottom};
}
