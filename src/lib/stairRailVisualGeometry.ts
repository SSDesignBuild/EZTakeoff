import type {DeckModel,StairPlacement} from './deckModel';
export type StairRailPoint3D=[number,number,number];
export interface StairRailVisualPanel{
 startFt:number;endFt:number;from:StairRailPoint3D;to:StairRailPoint3D;
}
export interface StairRailVisualRun{
 placementIndex:number;edgeIndex:number;side:'left'|'right';
 runFt:number;widthFt:number;panels:StairRailVisualPanel[];
 posts:StairRailPoint3D[];
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
 postOutsideWidthFt=3.5/12,maxBayFt=6):StairRailVisualRun[]{
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
  const count=Math.max(1,Math.ceil(runFt/Math.max(.5,maxBayFt)));
  for(const [side,sign,defaultEnabled]of sides){
   // The stored placement is authoritative, including independently
   // configured additional stair flights. A screen room must never
   // override this explicit selected side.
   const enabled=side==='left'
     ?placement.left??defaultEnabled:placement.right??defaultEnabled;
   if(!enabled)continue;
   const cross=sign*(frame.widthFt/2+postOutsideWidthFt/2+.045);
   const at=(fraction:number):StairRailPoint3D=>{
    const t=Math.max(0,Math.min(1,fraction)),z=runFt*t;
    return [frame.originX+Math.cos(frame.yaw)*cross+Math.sin(frame.yaw)*z,
      deckHeightFt-descent*t,
      frame.originZ-Math.sin(frame.yaw)*cross+Math.cos(frame.yaw)*z];
   };
   const posts=Array.from({length:count+1},(_,j)=>at(j/count));
   runs.push({placementIndex:i,edgeIndex:placement.edgeIndex,side,
    runFt,widthFt:frame.widthFt,posts,
    panels:Array.from({length:count},(_,j)=>({
     startFt:runFt*j/count,endFt:runFt*(j+1)/count,
     from:posts[j],to:posts[j+1],
    }))});
  }
 }
 return runs;
}
