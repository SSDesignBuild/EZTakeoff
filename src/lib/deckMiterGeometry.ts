import type { DeckPoint,DeckEdgeSegment } from './types';
import { stockBoardSegments,FINISH_SEAM_GAP_FT } from './finishStockGeometry';
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
  count:number,boardFaceFt:number|readonly number[]=5.5/12,gapFt=.125/12,
  fasciaThicknessFt=.75/12,overhangFt=.75/12):MiterFrameStrip[]{
  const result:MiterFrameStrip[]=[];
  const widths=typeof boardFaceFt==='number'?[boardFaceFt,boardFaceFt,boardFaceFt]:boardFaceFt;
  if(points.length<3||!widths.length||widths.some(width=>!Number.isFinite(width)||width<=0)||
    !Number.isFinite(gapFt)||gapFt<0||Math.abs(signedArea(points))<.001)return result;
  const selected=new Set(segments.map(s=>s.index));
  const sign=signedArea(points)>=0?1:-1;
  const stations=Math.max(0,Math.min(3,Math.floor(count)));
  for(let edge=0;edge<points.length;edge++){
    if(!selected.has(edge))continue;
    const previous=(edge+points.length-1)%points.length;
    const next=(edge+1)%points.length;
    for(let course=0;course<stations;course++){
      // Fascia is installed OUTSIDE the structural rim. Its actual selected
      // thickness plus the measured overhang sets the finished outer face.
      const outer=-(fasciaThicknessFt+overhangFt)
        +widths.slice(0,course).reduce((sum,width)=>sum+width+gapFt,0);
      const inner=outer+(widths[course]??widths[0]);
      const at=(offset:number,first:boolean):V2=>{
        const e=shiftedEdge(points,edge,offset,sign);
        if(!e) return [points[edge].x,points[edge].y];
        const index=first?edge:next;
        const p=points[index],basic=add([p.x,p.y],scale(e.normal,offset));
        const neighbor=first?previous:next;
        if(!selected.has(neighbor))return basic;
        const other=shiftedEdge(points,neighbor,offset,sign);
        const intersection=other&&intersect(e,other);
        if(!intersection||length(minus(intersection,basic))>Math.max(.2,Math.abs(offset)*3))return basic;
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

/** Open the physical saw-cut gap at shared miters, without changing the
 * nominal corner location used by layout dimensions and stock allowances. */
export function openPictureFrameMiterGaps(strips:MiterFrameStrip[],
  seams:readonly PictureFrameMiterSeam[],gapFt=.125/12):MiterFrameStrip[]{
  if(!Number.isFinite(gapFt)||gapFt<=0)return strips;
  const isSeam=(a:V2,b:V2,course:number)=>seams.some(seam=>seam.course===course&&
    ((length(minus(a,seam.from))<1e-6&&length(minus(b,seam.to))<1e-6)||
     (length(minus(a,seam.to))<1e-6&&length(minus(b,seam.from))<1e-6)));
  return strips.map(strip=>{
    const [a,b,c,d]=strip.corners;
    const outer=minus(b,a),inner=minus(c,d);
    const ot=scale(outer,1/length(outer)),it=scale(inner,1/length(inner));
    const shift=(point:V2,other:V2,tangent:V2,sign:number):V2=>{
      const cut=minus(other,point),cutLen=length(cut);
      const sine=Math.abs(cross(scale(cut,1/cutLen),tangent));
      if(sine<.05)return point;
      return add(point,scale(tangent,sign*Math.min(gapFt/(2*sine),.05)));
    };
    const start=isSeam(a,d,strip.course),end=isSeam(b,c,strip.course);
    return {...strip,corners:[start?shift(a,d,ot,1):a,end?shift(b,c,ot,-1):b,
      end?shift(c,b,it,-1):c,start?shift(d,a,it,1):d] as [V2,V2,V2,V2]};
  });
}

/**
 * Split an existing polygon-mitered border course along its LENGTH, retaining
 * the exact four-corner miter at its outer ends. The internal seams are square,
 * located symmetrically across the board face with a visible 1/8-inch gap.
 * No geometry piece is longer than a purchasable stock cut.
 */
export function splitMiteredPictureFrames(
 strips:MiterFrameStrip[],gapFt=FINISH_SEAM_GAP_FT,
 maxCutFt?:number,
):MiterFrameStrip[]{
 return strips.flatMap(strip=>{
  const [a,b,c,d]=strip.corners;
  const outer=length(minus(b,a)),inner=length(minus(c,d));
  const span=Math.max(outer,inner);
  const lengths=stockBoardSegments(span,[],maxCutFt);
  if(lengths.length<=1)return [strip];
  const lerp=(p:V2,q:V2,t:number):V2=>[
   p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,
  ];
  let cursor=0;
  return lengths.map((len,i)=>{
   const first=(cursor+(i===0?0:gapFt/2))/span;
   const last=(cursor+len-(i===lengths.length-1?0:gapFt/2))/span;
   cursor+=len;
   const from=Math.min(1,Math.max(0,first)),to=Math.min(1,Math.max(from,last));
   return {edgeIndex:strip.edgeIndex,course:strip.course,
    corners:[lerp(a,b,from),lerp(a,b,to),lerp(d,c,to),lerp(d,c,from)]
    } as MiterFrameStrip;
  });
 });
}

export interface PictureFrameMiterSeam {
  course:number;
  cornerIndex:number;
  edgeIndex:number;
  from:V2;to:V2;
}
/**
 * A visible miter is legal ONLY when both adjacent selected picture-frame
 * edges meet at the same exterior corner. Exclude all house contact edges
 * when the designer's house-side picture-frame checkbox is off.
 * The seam endpoints are the actual shared polygon cut, not a decal
 * drawn at every outline end.
 */
export function planVisiblePictureFrameMiterSeams(
  points:DeckPoint[],selectedEdges:DeckEdgeSegment[],count:number,
  houseEdgeIndices:readonly number[]=[],includeHouseSide=false,
  boardFaceFt:number|readonly number[]=5.5/12,
  fasciaThicknessFt=.75/12,
):PictureFrameMiterSeam[]{
  if(points.length<3||count<=0)return [];
  const selected=new Set(selectedEdges.map(edge=>edge.index)
    .filter(index=>includeHouseSide||!houseEdgeIndices.includes(index)));
  const strips=planMiteredPictureFrames(points,
    selectedEdges.filter(edge=>selected.has(edge.index)),count,boardFaceFt,.125/12,fasciaThicknessFt);
  return strips.filter(strip=>
    selected.has(strip.edgeIndex)&&selected.has((strip.edgeIndex+1)%points.length))
   .map(strip=>({
    course:strip.course,edgeIndex:strip.edgeIndex,
    cornerIndex:(strip.edgeIndex+1)%points.length,
    from:strip.corners[1],to:strip.corners[2],
   }))
   .filter(seam=>length(minus(seam.from,seam.to))>.10);
}
