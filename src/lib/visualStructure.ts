import type { DeckPoint, DeckEdgeSegment } from './types';

/** Actual dressed lumber, not nominal order sizes, used in the 3D model. */
export const actualPostWidthFt=(size:'6x6'|'8x8'):number=>
  (size==='8x8'?7.5:5.5)/12;

/**
 * Two independent 1.5-inch rim plies sit INSIDE the drawn perimeter.
 * The signed polygon winding selects the inward normal for clockwise and
 * counter-clockwise custom deck drawings.
 */
export function rimPlyCenterlines(points:DeckPoint[],edge:DeckEdgeSegment){
  const dx=edge.end.x-edge.start.x,dy=edge.end.y-edge.start.y;
  const length=Math.hypot(dx,dy);
  if(length<.001||points.length<3)return [];
  const signedArea=points.reduce((sum,p,i)=>{
    const next=points[(i+1)%points.length];
    return sum+p.x*next.y-next.x*p.y;
  },0);
  const sign=signedArea<0?-1:1;
  const nx=-dy/length*sign,ny=dx/length*sign;
  const plyFt=1.5/12;
  return [.5*plyFt,1.5*plyFt].map((inset)=>({
    start:{x:edge.start.x+nx*inset,y:edge.start.y+ny*inset},
    end:{x:edge.end.x+nx*inset,y:edge.end.y+ny*inset},
  }));
}
