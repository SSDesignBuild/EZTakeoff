import type { DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { planMiteredPictureFrames } from './deckMiterGeometry';
import { clipDeckFace, subtractDeckFace, mergeDeckFaces, deckFaceArea, triangulateDeckFace, type DeckFacePoint } from './deckSurfaceClipping';
import { stockBoardSegments } from './finishStockGeometry';
import { packSkirtCuts } from './deckSkirting';

export type FinishSupportLumber='2x6'|'2x8'|'2x10'|'2x12';
export interface DeckFinishSupportPiece {
  id:string;kind:'picture-frame'|'breaker';sourceIds:string[];
  from:DeckPoint;to:DeckPoint;corners:DeckPoint[];
  lengthFt:number;widthFt:number;thicknessFt:number;
  nominalSize:FinishSupportLumber;stockWidthFt:number;
}
export interface DeckFinishSupportStock {
  nominalSize:FinishSupportLumber;stockLengthFt:number;quantity:number;
  cutIds:string[];cutLengthsFt:number[];
}
export interface DeckFinishSupportPlan {
  pieces:DeckFinishSupportPiece[];stock:DeckFinishSupportStock[];
  totalLinearFt:number;coveredAreaSqFt:number;issues:string[];notes:string[];
}
type SupportModel=Pick<DeckModel,'points'|'edgeSegments'|'joistDirection'|'joistPositions'|
  'pictureFrameSegments'|'pictureFrameCount'|'breakerBoardCount'|'breakerBoardPositions'>;
type Zone={kind:DeckFinishSupportPiece['kind'];id:string;face:DeckFacePoint[];direction:DeckFacePoint};
const RIM_WIDTH_FT=3/12;
const JOIST_HALF_WIDTH_FT=.75/12;
export const FINISH_SUPPORT_THICKNESS_FT=1.5/12;
/** Backing for adjacent field-board ends, separate from a structural bearing specification. */
export const FINISH_SUPPORT_FIELD_END_BACKING_FT=1.5/12;
const LUMBER:readonly {size:FinishSupportLumber;widthFt:number}[]=[
  {size:'2x6',widthFt:5.5/12},{size:'2x8',widthFt:7.25/12},
  {size:'2x10',widthFt:9.25/12},{size:'2x12',widthFt:11.25/12},
];
const eps=1e-7;
const signedArea=(points:DeckPoint[])=>points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;
},0)/2;

/** Continuous flat nailers share the real finish footprints with 3D, CAD and
 * stock ordering. Upright rim/joist footprints are removed, so the nailer is
 * beside those members, never coincident with their top 1.5 inches. */
export function planDeckFinishSupport(model:SupportModel):DeckFinishSupportPlan {
  const pieces:DeckFinishSupportPiece[]=[],issues:string[]=[];
  if(model.points.length<3)return {pieces,stock:[],totalLinearFt:0,coveredAreaSqFt:0,issues,notes:[]};
  const vertical=model.joistDirection==='vertical';
  const uv=(p:DeckFacePoint):DeckFacePoint=>vertical?p:[p[1],p[0]];
  const xy=(u:number,v:number):DeckFacePoint=>vertical?[u,v]:[v,u];
  const points=model.points.map(p=>uv([p.x,p.y]));
  const sign=signedArea(model.points)<0?-1:1;
  const scan=(u:number):Array<[number,number]>=>{
    const hits:number[]=[];
    points.forEach((p,i)=>{
      const q=points[(i+1)%points.length];
      if((p[0]<=u&&q[0]>u)||(q[0]<=u&&p[0]>u))
        hits.push(p[1]+(q[1]-p[1])*(u-p[0])/(q[0]-p[0]));
    });
    hits.sort((a,b)=>a-b);
    return hits.flatMap((v,i)=>i%2===0&&hits[i+1]>v?[[v,hits[i+1]] as [number,number]]:[]);
  };
  const zones:Zone[]=[];
  const frames=planMiteredPictureFrames(model.points,model.pictureFrameSegments,model.pictureFrameCount);
  for(const edge of model.pictureFrameSegments){
    const courses=frames.filter(frame=>frame.edgeIndex===edge.index);
    if(!courses.length)continue;
    // End borders already cross the normal joists. Side borders run with them.
    const parallel=vertical?edge.orientation==='vertical':edge.orientation==='horizontal';
    if(!parallel&&edge.orientation!=='angled')continue;
    const last=courses.reduce((a,b)=>a.course>b.course?a:b);
    const dx=edge.end.x-edge.start.x,dy=edge.end.y-edge.start.y,len=Math.hypot(dx,dy);
    const nx=-dy/len*sign,ny=dx/len*sign;
    const inner=(p:DeckFacePoint):DeckFacePoint=>[p[0]+nx*FINISH_SUPPORT_FIELD_END_BACKING_FT,
      p[1]+ny*FINISH_SUPPORT_FIELD_END_BACKING_FT];
    zones.push({kind:'picture-frame',id:'PF-E'+(edge.index+1),direction:[dx/len,dy/len],face:[
      [edge.start.x,edge.start.y],[edge.end.x,edge.end.y],inner(last.corners[2]),inner(last.corners[3]),
    ]});
  }
  const breakerCount=Math.max(0,Math.min(3,Math.floor(model.breakerBoardCount)));
  const breakerWidth=(breakerCount*5.5+Math.max(0,breakerCount-1)*.125)/12;
  if(breakerCount)model.breakerBoardPositions.forEach((station,index)=>{
    const low=station-breakerWidth/2-FINISH_SUPPORT_FIELD_END_BACKING_FT;
    const high=station+breakerWidth/2+FINISH_SUPPORT_FIELD_END_BACKING_FT;
    const stops=[...new Set([low,high,...points.map(p=>p[0]).filter(u=>u>low+eps&&u<high-eps)])].sort((a,b)=>a-b);
    for(let i=0;i+1<stops.length;i++){
      const a=stops[i],b=stops[i+1],nudge=Math.min(1e-8,(b-a)/1000);
      const left=scan(a+nudge),right=scan(b-nudge);
      for(const [v0,v1] of scan((a+b)/2)){
        const mid=(v0+v1)/2;
        const first=left.find(([x,y])=>mid>=x-eps&&mid<=y+eps);
        const last=right.find(([x,y])=>mid>=x-eps&&mid<=y+eps);
        if(!first||!last)continue;
        zones.push({kind:'breaker',id:'BR-'+(index+1),direction:vertical?[0,1]:[1,0],
          face:[xy(a,first[0]),xy(b,last[0]),xy(b,last[1]),xy(a,first[1])]});
      }
    }
  });
  const blockers:DeckFacePoint[][]=[];
  for(const edge of model.edgeSegments){
    const dx=edge.end.x-edge.start.x,dy=edge.end.y-edge.start.y,len=Math.hypot(dx,dy);
    if(len<eps)continue;
    const nx=-dy/len*sign*RIM_WIDTH_FT,ny=dx/len*sign*RIM_WIDTH_FT;
    blockers.push([[edge.start.x,edge.start.y],[edge.end.x,edge.end.y],
      [edge.end.x+nx,edge.end.y+ny],[edge.start.x+nx,edge.start.y+ny]]);
  }
  // Actual upright joists, including all normal stations. Their clipped
  // footprints are excluded even when a breaker runs exactly over one.
  model.joistPositions.forEach(station=>scan(station).forEach(([a,b])=>{
    blockers.push([xy(station-JOIST_HALF_WIDTH_FT,a),xy(station+JOIST_HALF_WIDTH_FT,a),
      xy(station+JOIST_HALF_WIDTH_FT,b),xy(station-JOIST_HALF_WIDTH_FT,b)]);
  }));
  const accepted:DeckFacePoint[][]=[];
  const acceptedBlockers:DeckFacePoint[][]=[];
  const footprint=triangulateDeckFace(model.points.map(p=>[p.x,p.y]));
  for(const zone of zones){
    // An angled perimeter nailer follows the perimeter, then stops at each
    // upright joist bay. Stock cut length is measured ALONG that nailer,
    // not along a world-axis bounding box.
    const [dx,dy]=zone.direction;
    const project=(p:DeckFacePoint):DeckFacePoint=>[p[0]*dy-p[1]*dx,p[0]*dx+p[1]*dy];
    const unproject=(u:number,v:number):DeckFacePoint=>[u*dy+v*dx,-u*dx+v*dy];
    const clipBand=(face:DeckFacePoint[],u0:number,u1:number,v0:number,v1:number)=>{
      let result=face.map(project);
      for(const [a,b] of [
        [[u0,v0],[u1,v0]],[[u1,v0],[u1,v1]],[[u1,v1],[u0,v1]],[[u0,v1],[u0,v0]],
      ] as [DeckFacePoint,DeckFacePoint][])result=clipDeckFace(result,a,b,true);
      return result.map(p=>unproject(p[0],p[1]));
    };
    // Trim to the actual deck before removing upright framing. Offsetting an
    // angled side must not leave a little nailer beyond an unframed house end.
    let faces=footprint.flatMap(triangle=>{
      let face=zone.face;
      for(let i=0;i<triangle.length;i++)face=clipDeckFace(face,triangle[i],triangle[(i+1)%triangle.length],true);
      return face.length>=3&&deckFaceArea(face)>.000001?[face]:[];
    });
    for(const blocker of [...blockers,...acceptedBlockers]){
      faces=faces.flatMap(face=>subtractDeckFace(face,blocker));
      if(!faces.length)break;
    }
    for(const face of mergeDeckFaces(faces)){
      if(deckFaceArea(face)<.001)continue;
      const coords=face.map(project),lowU=Math.min(...coords.map(p=>p[0])),highU=Math.max(...coords.map(p=>p[0]));
      const lowV=Math.min(...coords.map(p=>p[1])),highV=Math.max(...coords.map(p=>p[1]));
      // Very wide residual bays become adjacent physical lumber strips.
      for(let u=lowU;u<highU-eps;u+=LUMBER[3].widthFt){
        const endU=Math.min(highU,u+LUMBER[3].widthFt);
        let v=lowV;
        for(const length of stockBoardSegments(highV-lowV)){
          const cut=clipBand(face,u,endU,v,v+length);v+=length;
          if(cut.length<3||deckFaceArea(cut)<.001)continue;
          const c=cut.map(project),u0=Math.min(...c.map(p=>p[0])),u1=Math.max(...c.map(p=>p[0]));
          const v0=Math.min(...c.map(p=>p[1])),v1=Math.max(...c.map(p=>p[1]));
          const width=u1-u0;
          if(width<.125/12||v1-v0<.1)continue;
          const lumber=LUMBER.find(spec=>spec.widthFt>=width-eps)??LUMBER[3];
          const from=unproject((u0+u1)/2,v0),to=unproject((u0+u1)/2,v1);
          const id='FS-'+String(pieces.length+1).padStart(3,'0');
          pieces.push({id,kind:zone.kind,sourceIds:[zone.id],from:{x:from[0],y:from[1]},to:{x:to[0],y:to[1]},
            corners:cut.map(p=>({x:p[0],y:p[1]})),lengthFt:v1-v0,widthFt:width,
            thicknessFt:FINISH_SUPPORT_THICKNESS_FT,nominalSize:lumber.size,stockWidthFt:lumber.widthFt});
          accepted.push(cut);
          acceptedBlockers.push(...triangulateDeckFace(cut));
        }
      }
    }
  }
  const stock:DeckFinishSupportStock[]=[];
  for(const lumber of LUMBER){
    const cuts=pieces.filter(piece=>piece.nominalSize===lumber.size).map(piece=>({
      id:piece.id,edgeIndex:-1,material:lumber.size,lengthFt:piece.lengthFt,
      location:piece.sourceIds.join(', ')+'; flat rip '+(piece.widthFt*12).toFixed(3)+' in',
    }));
    const packed=packSkirtCuts(cuts,[8,12,16,20]);
    issues.push(...packed.issues);
    for(const length of [...new Set(packed.stock.map(board=>board.stockLengthFt))]){
      const boards=packed.stock.filter(board=>board.stockLengthFt===length);
      stock.push({nominalSize:lumber.size,stockLengthFt:length,quantity:boards.length,
        cutIds:boards.flatMap(board=>board.cuts.map(cut=>cut.id)),
        cutLengthsFt:boards.flatMap(board=>board.cuts.map(cut=>cut.lengthFt))});
    }
  }
  return {pieces,stock,totalLinearFt:pieces.reduce((sum,p)=>sum+p.lengthFt,0),
    coveredAreaSqFt:accepted.reduce((sum,face)=>sum+deckFaceArea(face),0),issues,
    notes:pieces.length?[
      'Continuous pressure-treated flat nailers: wide face horizontal, 1.5 in vertical thickness, top flush with joists; rip actual width to the clear framing bay.',
      'Includes backing beside the innermost picture frame and both field-board ends at breaker courses. Attachment, splices and fasteners require the selected framing design; no new structural span or connection capacity is assumed.',
      ...(model.pictureFrameSegments.some(edge=>edge.orientation==='angled')?
        ['Angled picture-frame nailers are cut to the shared polygon inside each joist bay. Confirm compound end cuts and connection details; their actual cut stock is included.']:[]),
      '8/12/16/20-ft lumber stock is optimized with 1/8-in kerf and 1/4-in end trim. Each scheduled rip remains a physical piece; narrow rip leftovers are not assumed reusable.',
    ]:[]};
}
