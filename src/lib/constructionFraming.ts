import type { DeckPoint, DeckEdgeSegment } from './types';
import type { DeckModel } from './deckModel';
import { clipDeckFace, subtractDeckFace, mergeDeckFaces, triangulateDeckFace, deckFaceArea, type DeckFacePoint } from './deckSurfaceClipping';

/** All dimensions are installed, dressed dimensions in feet. No stock rounding. */
export const FRAMING_PLY_FT=1.5/12;
export interface FramingCut {
  id:string; from:DeckPoint; to:DeckPoint; footprint:DeckPoint[];
  lengthFt:number; widthFt:number; edgeIndex?:number; ply?:number; stationIndex?:number;
}
type P=DeckFacePoint;
const eps=1e-7;
const area=(p:readonly P[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
export function memberFootprint(from:DeckPoint,to:DeckPoint,widthFt:number):DeckPoint[]{
  const dx=to.x-from.x,dy=to.y-from.y,l=Math.hypot(dx,dy);
  if(l<eps)return [];
  const nx=-dy/l*widthFt/2,ny=dx/l*widthFt/2;
  return [{x:from.x+nx,y:from.y+ny},{x:to.x+nx,y:to.y+ny},
    {x:to.x-nx,y:to.y-ny},{x:from.x-nx,y:from.y-ny}];
}
function intersection(subject:readonly P[],clip:readonly P[]):P[]{
  const boundary=area(clip)<0?[...clip].reverse():clip;
  let result=[...subject];
  for(let i=0;i<boundary.length&&result.length;i++)result=clipDeckFace(result,boundary[i],boundary[(i+1)%boundary.length],true);
  return result;
}
function withinDeck(face:readonly P[],triangles:P[][]):P[][]{
  return mergeDeckFaces(triangles.map(t=>intersection(face,t)).filter(p=>p.length>=3&&deckFaceArea(p)>eps));
}
function asCut(id:string,face:readonly P[],direction:DeckPoint,widthFt:number,extra:Partial<FramingCut>={}):FramingCut{
  const u=face.map(p=>p[0]*direction.x+p[1]*direction.y),v=face.map(p=>-p[0]*direction.y+p[1]*direction.x);
  const start=Math.min(...u),end=Math.max(...u),cross=(Math.min(...v)+Math.max(...v))/2;
  const at=(t:number)=>({x:t*direction.x-cross*direction.y,y:t*direction.y+cross*direction.x});
  return {id,from:at(start),to:at(end),footprint:face.map(p=>({x:p[0],y:p[1]})),
    lengthFt:end-start,widthFt,...extra};
}
/**
 * Square corners use full horizontal bands and butted vertical bands. On an
 * angled/custom corner the following member is scribed to the preceding
 * footprint. Subtraction makes each physical ply disjoint, including notches.
 * This is a cut/setout convention, not a connection or structural approval.
 */
export function planRimPlies(points:DeckPoint[],edges:DeckEdgeSegment[]):FramingCut[]{
  if(points.length<3)return [];
  const triangles=triangulateDeckFace(points.map(p=>[p.x,p.y] as P));
  const winding=area(points.map(p=>[p.x,p.y] as P))<0?-1:1;
  const occupied:P[][]=[],result:FramingCut[]=[];
  const sorted=[...edges].sort((a,b)=>(a.orientation==='horizontal'?0:1)-(b.orientation==='horizontal'?0:1)||a.index-b.index);
  for(const edge of sorted){
    const dx=edge.end.x-edge.start.x,dy=edge.end.y-edge.start.y,length=Math.hypot(dx,dy);
    if(length<eps)continue;
    const direction={x:dx/length,y:dy/length},normal={x:-dy/length*winding,y:dx/length*winding};
    for(let ply=0;ply<2;ply++){
      const at=(p:DeckPoint,offset:number):P=>[p.x+normal.x*offset,p.y+normal.y*offset];
      const face=[at(edge.start,ply*FRAMING_PLY_FT),at(edge.end,ply*FRAMING_PLY_FT),
        at(edge.end,(ply+1)*FRAMING_PLY_FT),at(edge.start,(ply+1)*FRAMING_PLY_FT)];
      let faces=withinDeck(face,triangles);
      for(const existing of occupied)faces=faces.flatMap(p=>subtractDeckFace(p,existing));
      faces=mergeDeckFaces(faces).filter(p=>deckFaceArea(p)>eps);
      for(const [piece,poly]of faces.entries()){
        const cut=asCut(`R-E${edge.index+1}-P${ply+1}-${piece+1}`,poly,direction,FRAMING_PLY_FT,{edgeIndex:edge.index,ply});
        if(cut.lengthFt>eps){result.push(cut);occupied.push(poly);}
      }
    }
  }
  return result.sort((a,b)=>(a.edgeIndex??0)-(b.edgeIndex??0)||(a.ply??0)-(b.ply??0)||a.id.localeCompare(b.id));
}
/** Joists stop at the actual inner double-rim faces, rather than running through them. */
export function planJoistCuts(points:DeckPoint[],edges:DeckEdgeSegment[],direction:'vertical'|'horizontal',positions:readonly number[],rims=planRimPlies(points,edges)):FramingCut[]{
  if(points.length<3)return [];
  const triangles=triangulateDeckFace(points.map(p=>[p.x,p.y] as P)),vertical=direction==='vertical';
  const min=Math.min(...points.map(p=>vertical?p.y:p.x))-1,max=Math.max(...points.map(p=>vertical?p.y:p.x))+1;
  const result:FramingCut[]=[];
  for(const [stationIndex,station]of positions.entries()){
    const from=vertical?{x:station,y:min}:{x:min,y:station},to=vertical?{x:station,y:max}:{x:max,y:station};
    let faces=withinDeck(memberFootprint(from,to,FRAMING_PLY_FT).map(p=>[p.x,p.y] as P),triangles);
    for(const rim of rims)faces=faces.flatMap(face=>subtractDeckFace(face,rim.footprint.map(p=>[p.x,p.y] as P)));
    faces=mergeDeckFaces(faces).filter(p=>deckFaceArea(p)>eps).sort((a,b)=>Math.min(...a.map(p=>p[vertical?1:0]))-Math.min(...b.map(p=>p[vertical?1:0])));
    for(const [index,face]of faces.entries()){
      const cut=asCut(`J${stationIndex+1}-${index+1}`,face,vertical?{x:0,y:1}:{x:1,y:0},FRAMING_PLY_FT,{stationIndex});
      if(cut.lengthFt>.01)result.push(cut);
    }
  }
  return result;
}
export const framingDepthFt=(size:string)=>({ '2x8':7.25,'2x10':9.25,'2x12':11.25,PSL:11.875 }[size]??9.25)/12;

/** Representative legacy saddle silhouette, with real beam clearance.
 * Subtract the pack from the square post even at angled beams, so rotated
 * decorative cheek boxes cannot extend beyond the dressed post footprint. */
export function planPostSaddleCheeks(model:DeckModel,post:DeckModel['postLocations'][number],postWidthFt:number):DeckPoint[][]{
  const angled=post.beamIndex===null?model.angledBeamLines.find(line=>line.postPoints.some(p=>Math.hypot(p.x-post.x,p.y-post.y)<.001)):undefined;
  const dx=angled?angled.end.x-angled.start.x:model.joistDirection==='vertical'?1:0;
  const dy=angled?angled.end.y-angled.start.y:model.joistDirection==='vertical'?0:1,l=Math.hypot(dx,dy);
  const from={x:post.x-dx/l*postWidthFt*2,y:post.y-dy/l*postWidthFt*2},to={x:post.x+dx/l*postWidthFt*2,y:post.y+dy/l*postWidthFt*2};
  const half=postWidthFt/2,base:P[]=[[post.x-half,post.y-half],[post.x+half,post.y-half],[post.x+half,post.y+half],[post.x-half,post.y+half]];
  return mergeDeckFaces(subtractDeckFace(base,memberFootprint(from,to,3/12).map(p=>[p.x,p.y] as P)))
    .filter(poly=>deckFaceArea(poly)>eps).map(poly=>poly.map(p=>({x:p[0],y:p[1]})));
}
