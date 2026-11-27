import type { DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { surfaceStrips,breakerVisualStrips,type SurfaceStrip } from './deckSurfaceLayout';
import { planMiteredPictureFrames,splitMiteredPictureFrames,openPictureFrameMiterGaps,planVisiblePictureFrameMiterSeams } from './deckMiterGeometry';

export interface PhysicalDeckBoard {
  id:string;kind:'field-board'|'picture-frame'|'breaker';course:number;
  footprint:DeckPoint[];from:DeckPoint;to:DeckPoint;lengthFt:number;widthFt:number;thicknessFt:number;
}
const distance=(a:DeckPoint,b:DeckPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
export function physicalStripOutline(strip:SurfaceStrip):DeckPoint[]{
  if(strip.outline)return strip.outline.map(p=>({x:p[0],y:p[1]}));
  const dx=strip.axis==='x'?strip.lengthFt/2:strip.widthFt/2,dy=strip.axis==='x'?strip.widthFt/2:strip.lengthFt/2;
  return [{x:strip.x-dx,y:strip.z-dy},{x:strip.x+dx,y:strip.z-dy},{x:strip.x+dx,y:strip.z+dy},{x:strip.x-dx,y:strip.z+dy}];
}
function stripPart(strip:SurfaceStrip,id:string,kind:PhysicalDeckBoard['kind'],course:number,thicknessFt:number):PhysicalDeckBoard{
  const from=strip.axis==='x'?{x:strip.startFt,y:strip.z}:{x:strip.x,y:strip.startFt};
  const to=strip.axis==='x'?{x:strip.endFt,y:strip.z}:{x:strip.x,y:strip.endFt};
  return {id,kind,course,from,to,footprint:physicalStripOutline(strip),lengthFt:strip.lengthFt,widthFt:strip.widthFt,thicknessFt};
}
/** The complete real finish-cut registry used by hardware, CAD and takeoff. */
export function planPhysicalDeckBoards(deck:DeckModel):PhysicalDeckBoard[]{
  if(deck.deckingSurface==='subfloor')return [];
  const parts:PhysicalDeckBoard[]=[],rows=new Map<number,number>();
  for(const strip of surfaceStrips(deck)){
    const n=(rows.get(strip.row)??0)+1;rows.set(strip.row,n);
    parts.push(stripPart(strip,`D-R${String(strip.row+1).padStart(3,'0')}-${n}`,'field-board',0,deck.deckBoardThicknessFt));
  }
  const seams=planVisiblePictureFrameMiterSeams(deck.points,deck.pictureFrameSegments,deck.pictureFrameCount,deck.houseEdgeIndices,deck.pictureFrameHouseSide,deck.pictureFrameFaceFts,deck.fasciaThicknessFt);
  const frames=openPictureFrameMiterGaps(splitMiteredPictureFrames(planMiteredPictureFrames(deck.points,deck.pictureFrameSegments,deck.pictureFrameCount,deck.pictureFrameFaceFts,.125/12,deck.fasciaThicknessFt)),seams);
  const frameCounts=new Map<string,number>();
  for(const strip of frames){
    const key=`PF-E${strip.edgeIndex+1}-C${strip.course+1}`,n=(frameCounts.get(key)??0)+1;frameCounts.set(key,n);
    const footprint=strip.corners.map(p=>({x:p[0],y:p[1]})),[p,q,r,s]=footprint;
    parts.push({id:`${key}-${n}`,kind:'picture-frame',course:strip.course,footprint,
      from:{x:(p.x+s.x)/2,y:(p.y+s.y)/2},to:{x:(q.x+r.x)/2,y:(q.y+r.y)/2},
      lengthFt:Math.max(distance(p,q),distance(r,s)),widthFt:deck.pictureFrameFaceFts[strip.course],thicknessFt:deck.pictureFrameThicknessFts[strip.course]});
  }
  const counts=new Map<number,number>();
  for(const strip of breakerVisualStrips(deck)){
    const n=(counts.get(strip.course)??0)+1;counts.set(strip.course,n);
    parts.push(stripPart(strip,`BR-C${strip.course+1}-${n}`,'breaker',strip.course,deck.breakerThicknessFts[strip.course]));
  }
  return parts;
}
