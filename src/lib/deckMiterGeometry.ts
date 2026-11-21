import type { DeckPoint,DeckEdgeSegment } from './types';
export type V2=readonly [number,number];
export interface MiterFrameStrip {
  edgeIndex:number;course:number;corners:[V2,V2,V2,V2];
}
const cross=(a:V2,b:V2)=>a[0]*b[1]-a[1]*b[0];
const add=(a:V2,b:V2):V2=>[a[0]+b[0],a[1]+b[1]];
const scale=(a:V2,t:number):V2=>[a[0]*t,a[1]*t];
const minus=(a:V2,b:V2):V2=>[a[0]-b[0],a[1]-b[1]];
const length=(v:V2)=>Math.hypot(v[0],v[1]);
const signedArea=(points:DeckPoint[])=>points.reduce((s,p,i)=> {
  const next=points[(i+1)%points.length];return s+p.x*next.y-next.x*p.y;
},0)/2;
function shiftedEdge(points:DeckPoint[],i:number,offset:number,insideSign:number){
  const p=points[i],q=points[(i+1)%points.length];
  const start:V2=[p.x,p.y],vec:V2=[q.x-p.x,q.y-p.y];
  const len=length(vec);if(len<.000001)return null;
  const tangent=scale(vec,1/len),normal:V2=[-tangent[1]*insideSign,tangent[0]*insideSign];
  return {start:add(start,scale(normal,offset)),tangent,normal};
}
function intersect(a:{start:V2;tangent:V2},b:{start:V2;tangent:V2}):V2|null{
  const denom=cross(a.tangent,b.tangent);
  if(Math.abs(denom)<.00001)return null;
  const t=cross(minus(b.start,a.start),b.tangent)/denom;
  const p=add(a.start,scale(a.tangent,t));
  return p.every(Number.isFinite)?p:null;
}
/**
 * Course outlines follow polygon winding, not hard-coded positive X/Z.
 * Consecutive picture-frame courses meet with actual 45-degree corner cuts
 * on a rectangle and angle-bisector miter cuts on arbitrary corner angles.
 * Ends adjacent to unframed house sides remain square.
 */
export function planMiteredPictureFrames(points:DeckPoint[],segments:DeckEdgeSegment[],
  count:number,boardFaceFt=5.5/12,gapFt=.125/12):MiterFrameStrip[]{
  const result:MiterFrameStrip[]=[];
  if(points.length<3||!Number.isFinite(boardFaceFt)||boardFaceFt<=0||
    !Number.isFinite(gapFt)||gapFt<0||Math.abs(signedArea(points))<.001)return result;
  const selected=new Set(segments.map(s=>s.index));
  const sign=signedArea(points)>=0?1:-1;
  const stations=Math.max(0,Math.min(3,Math.floor(count)));
  for(let edge=0;edge<points.length;edge++){
    if(!selected.has(edge))continue;
    const previous=(edge+points.length-1)%points.length;
    const next=(edge+1)%points.length;
    for(let course=0;course<stations;course++){
      const outer=.045+course*(boardFaceFt+gapFt);
      const inner=outer+boardFaceFt;
      const at=(offset:number,first:boolean):V2=>{
        const e=shiftedEdge(points,edge,offset,sign);
        if(!e) return [points[edge].x,points[edge].y];
        const index=first?edge:next;
        const p=points[index],basic=add([p.x,p.y],scale(e.normal,offset));
        const neighbor=first?previous:next;
        if(!selected.has(neighbor))return basic;
        const other=shiftedEdge(points,neighbor,offset,sign);
        const intersection=other&&intersect(e,other);
        if(!intersection||length(minus(intersection,basic))>Math.max(.2,offset*3))return basic;
        return intersection;
      };
      const corners:[V2,V2,V2,V2]=[at(outer,true),at(outer,false),at(inner,false),at(inner,true)];
      // Short degenerate miter wedges cannot represent a cut board.
      if(length(minus(corners[0],corners[1]))<.05||
        length(minus(corners[2],corners[3]))<.05)continue;
      result.push({edgeIndex:edge,course,corners});
    }
  }
  return result;
}
