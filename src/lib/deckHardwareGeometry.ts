import type { DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { planRimPlies,planJoistCuts,memberFootprint,type FramingCut } from './constructionFraming';
import { planPhysicalDeckBoards } from './deckPhysicalFinish';
import { triangulateDeckFace,clipDeckFace,mergeDeckFaces,deckFaceArea,type DeckFacePoint } from './deckSurfaceClipping';

export interface DeckBoardContact {id:string;boardId:string;boardKind:'field-board'|'picture-frame'|'breaker';supportIds:string[];point:DeckPoint;fasteners:2;verticalOffsetFt:number;}
export interface DeckBeamContact {id:string;joistId:string;beamId:string;point:DeckPoint;}
export interface DeckJoistEnd {id:string;joistId:string;rimIds:string[];point:DeckPoint;angled:boolean;}
export interface DeckHardwarePlan {
  boardContacts:DeckBoardContact[];beamContacts:DeckBeamContact[];joistEnds:DeckJoistEnd[];
  fieldFasteners:number;trimFasteners:number;deckFasteners:number;hangers:number;angledHangers:number;ties:number;
}
type P=DeckFacePoint;
const xy=(p:DeckPoint):P=>[p.x,p.y];
const signedArea=(poly:readonly P[])=>poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
function intersect(a:readonly P[],b:readonly P[]):P[]{
  const clip=signedArea(b)<0?[...b].reverse():b;let p=[...a];
  for(let i=0;i<clip.length&&p.length;i++)p=clipDeckFace(p,clip[i],clip[(i+1)%clip.length],true);
  return p;
}
const bounds=(face:DeckPoint[])=>({minX:Math.min(...face.map(p=>p.x)),maxX:Math.max(...face.map(p=>p.x)),minY:Math.min(...face.map(p=>p.y)),maxY:Math.max(...face.map(p=>p.y))});
const overlap=(a:ReturnType<typeof bounds>,b:ReturnType<typeof bounds>)=>a.minX<b.maxX-1e-8&&a.maxX>b.minX+1e-8&&a.minY<b.maxY-1e-8&&a.maxY>b.minY+1e-8;
function centroid(poly:readonly P[]):DeckPoint{
  const twiceArea=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  let x=0,y=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],cross=p[0]*q[1]-q[0]*p[1];x+=(p[0]+q[0])*cross;y+=(p[1]+q[1])*cross;}
  return Math.abs(twiceArea)>1e-12?{x:x/(3*twiceArea),y:y/(3*twiceArea)}:{x:poly[0][0],y:poly[0][1]};
}
function within(point:DeckPoint,poly:readonly DeckPoint[]):boolean{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i];if(nearest(point,a,b).distance<1e-7)return true;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function insideCentroid(poly:readonly P[]):DeckPoint{
  const candidate=centroid(poly);
  if(within(candidate,poly.map(p=>({x:p[0],y:p[1]}))))return candidate;
  const triangle=triangulateDeckFace(poly).sort((a,b)=>deckFaceArea(b)-deckFaceArea(a))[0];
  return centroid(triangle??poly);
}
function nearest(point:DeckPoint,from:DeckPoint,to:DeckPoint){
  const dx=to.x-from.x,dy=to.y-from.y,l2=dx*dx+dy*dy,t=l2?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/l2)):0;
  const hit={x:from.x+t*dx,y:from.y+t*dy};return {hit,distance:Math.hypot(point.x-hit.x,point.y-hit.y)};
}
/** Physical intersections define contact anchors. Two fasteners/contact and
 * maximum12-in spacing on continuous parallel backing are ordering rules,
 * not manufactured drill locations. Joined rim plies form ONE bearing group. */
export function planDeckHardware(deck:DeckModel,knownJoists?:FramingCut[],knownRims?:FramingCut[]):DeckHardwarePlan{
  const rims=knownRims??planRimPlies(deck.points,deck.edgeSegments),joists=knownJoists??planJoistCuts(deck.points,deck.edgeSegments,deck.joistDirection,deck.joistPositions,rims);
  const supports:Array<{id:string;ids:string[];faces:DeckPoint[][];from:DeckPoint;to:DeckPoint}>=joists.map(p=>({id:p.id,ids:[p.id],faces:[p.footprint],from:p.from,to:p.to}));
  for(const edge of deck.edgeSegments){const plies=rims.filter(p=>p.edgeIndex===edge.index);if(plies.length)supports.push({id:`R-E${edge.index+1}`,ids:plies.map(p=>p.id),faces:plies.map(p=>p.footprint),from:edge.start,to:edge.end});}
  for(const piece of deck.finishSupport.pieces)supports.push({id:piece.id,ids:[piece.id],faces:[piece.corners],from:piece.from,to:piece.to});
  const supportData=supports.map(s=>({...s,bounds:bounds(s.faces.flat()),triangles:s.faces.flatMap(face=>triangulateDeckFace(face.map(xy)))}));
  const boardContacts:DeckBoardContact[]=[];
  for(const board of planPhysicalDeckBoards(deck)){
    const box=bounds(board.footprint),triangles=triangulateDeckFace(board.footprint.map(xy));
    const dx=board.to.x-board.from.x,dy=board.to.y-board.from.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
    for(const support of supportData){
      if(!overlap(box,support.bounds))continue;
      const faces=mergeDeckFaces(triangles.flatMap(t=>support.triangles.map(s=>intersect(t,s))).filter(face=>face.length>=3&&deckFaceArea(face)>1e-7));
      if(!faces.length)continue;
      const sx=support.to.x-support.from.x,sy=support.to.y-support.from.y,sl=Math.hypot(sx,sy),parallel=Math.abs((ux*sx+uy*sy)/sl)>.98;
      for(const [region,face]of faces.entries()){
        const stations=face.map(p=>p[0]*ux+p[1]*uy),min=Math.min(...stations),max=Math.max(...stations);
        const count=parallel?Math.max(1,Math.ceil((max-min)-1e-8)):1;
        for(let i=0;i<count;i++){
          const low=min+(max-min)*i/count,high=min+(max-min)*(i+1)/count;
          let patch=face;
          if(count>1){
            const cross=face.map(p=>-p[0]*uy+p[1]*ux),lo=Math.min(...cross)-1,hi=Math.max(...cross)+1;
            const at=(u:number,v:number):P=>[ux*u-uy*v,uy*u+ux*v];
            patch=clipDeckFace(patch,at(low,hi),at(low,lo),true);
            patch=clipDeckFace(patch,at(high,lo),at(high,hi),true);
          }
          if(patch.length<3||deckFaceArea(patch)<1e-7)continue;
          const point=insideCentroid(patch),supportIds=support.faces.flatMap((f,index)=>within(point,f)?[support.ids[index]]:[]);
          if(!supportIds.length||!within(point,board.footprint))continue;
          boardContacts.push({id:`${board.id}-${support.id}-${region+1}-${i+1}`,boardId:board.id,boardKind:board.kind,supportIds,point,fasteners:2,
            verticalOffsetFt:deck.deckBoardThicknessFt-board.thicknessFt});
        }
      }
    }
  }
  const joistEnds:DeckJoistEnd[]=joists.flatMap(joist=>[joist.from,joist.to].map((point,i)=>{
    const candidates=deck.edgeSegments.map(edge=>({edge,...nearest(point,edge.start,edge.end)})).sort((a,b)=>a.distance-b.distance);
    const edge=candidates[0]?.edge,dx=joist.to.x-joist.from.x,dy=joist.to.y-joist.from.y;
    const ex=edge?edge.end.x-edge.start.x:0,ey=edge?edge.end.y-edge.start.y:0;
    return {id:`${joist.id}-END${i+1}`,joistId:joist.id,rimIds:rims.filter(r=>r.edgeIndex===edge?.index).map(r=>r.id),point,
      angled:Math.abs(dx*ex+dy*ey)>1e-5};
  }));
  const beams:Array<{id:string;from:DeckPoint;to:DeckPoint}>=deck.beamLines.flatMap((line,i)=>line.segments.map((segment,j)=>({id:`B${i+1}-S${j+1}`,
    from:deck.joistDirection==='vertical'?{x:segment.startX,y:line.y}:{x:line.y,y:segment.startX},
    to:deck.joistDirection==='vertical'?{x:segment.endX,y:line.y}:{x:line.y,y:segment.endX}})));
  deck.angledBeamLines.forEach(line=>beams.push({id:`BA${line.edgeIndex+1}`,from:line.start,to:line.end}));
  const beamContacts:DeckBeamContact[]=[];
  for(const joist of joists)for(const beam of beams){
    const face=memberFootprint(beam.from,beam.to,3/12).map(xy),regions=triangulateDeckFace(joist.footprint.map(xy)).map(p=>intersect(p,face)).filter(p=>p.length>=3&&deckFaceArea(p)>1e-7);
    if(regions.length){const merged=mergeDeckFaces(regions);beamContacts.push({id:`${joist.id}-${beam.id}`,joistId:joist.id,beamId:beam.id,point:insideCentroid(merged[0])});}
  }
  const fieldFasteners=boardContacts.filter(c=>c.boardKind==='field-board').length*2,trimFasteners=boardContacts.filter(c=>c.boardKind!=='field-board').length*2;
  const angledHangers=joistEnds.filter(end=>end.angled).length;
  return {boardContacts,beamContacts,joistEnds,fieldFasteners,trimFasteners,deckFasteners:fieldFasteners+trimFasteners,
    hangers:joistEnds.length-angledHangers,angledHangers,ties:beamContacts.length};
}
