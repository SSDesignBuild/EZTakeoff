import type { DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { getCoverVisualProduct, getRailVisualProduct, getDeckVisualProduct } from '../data/visualCatalog';

export interface SurfaceStrip {
  axis:'x'|'z';
  x:number;z:number;lengthFt:number;widthFt:number;
  startFt:number;endFt:number;row:number;
}
export const VISIBLE_BOARD_WIDTH_FT=5.5/12;
export const VISIBLE_BOARD_GAP_FT=3/16/12;
/**
 * Clip visible board rows to actual concave footprint using half-open
 * scanline edge intersections. This never draws a board through an L-shape
 * missing corner. Exact purchasable cuts still come from the deck takeoff.
 */
export function surfaceStrips(
  model:Pick<DeckModel,'points'|'boardRun'|'minX'|'maxX'|'minY'|'maxY'>,
  boardWidthFt=VISIBLE_BOARD_WIDTH_FT,gapFt=VISIBLE_BOARD_GAP_FT,
):SurfaceStrip[]{
  const points=model.points;
  if(points.length<3)return [];
  const runX=model.boardRun==='width';
  const min=runX?model.minY:model.minX;
  const max=runX?model.maxY:model.maxX;
  const step=boardWidthFt+gapFt;
  const result:SurfaceStrip[]=[];
  for(let row=0;row<2000;row++){
    const bandStart=min+row*step;
    if(bandStart>=max-.001)break;
    const bandWidth=Math.min(boardWidthFt,max-bandStart);
    const sample=bandStart+bandWidth/2;
    const intersections:number[]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const av=runX?a.y:a.x,bv=runX?b.y:b.x;
      if((av<=sample&&bv>sample)||(bv<=sample&&av>sample)){
        const t=(sample-av)/(bv-av);
        const au=runX?a.x:a.y,bu=runX?b.x:b.y;
        intersections.push(au+(bu-au)*t);
      }
    }
    intersections.sort((a,b)=>a-b);
    for(let i=0;i+1<intersections.length;i+=2){
      const start=intersections[i]+.01,end=intersections[i+1]-.01,len=end-start;
      if(len<=.04)continue;
      result.push({axis:runX?'x':'z',
        x:runX?(start+end)/2:bandStart+bandWidth/2,
        z:runX?bandStart+bandWidth/2:(start+end)/2,
        lengthFt:len,widthFt:bandWidth,startFt:start,endFt:end,row});
    }
    if(result.length>1400)break;
  }
  return result;
}
export interface VisualPartSummary {
  roof:'none'|'opaque'|'transparent'|'lattice'|'louvers';
  exposedTrusses:boolean;decorativeEnds:boolean;gutters:boolean;
  rails:'manufacturer-family'|'unverified'|'none';
  texture:'verified-photo'|'unavailable';
}
export function visualPartSummary(values:Record<string,string|number|boolean>,coverFamily:string):VisualPartSummary{
  const cover=getCoverVisualProduct(coverFamily);
  const selectedRail=getRailVisualProduct(values.railingVisualId);
  const roof=coverFamily==='none'?'none':cover.family==='translucent'?'transparent':
    cover.family==='lattice'?'lattice':cover.family==='louvered'?'louvers':'opaque';
  return {roof,
    exposedTrusses:cover.family==='full-trusses',
    decorativeEnds:cover.family==='solid-truss-ends'||cover.family==='full-trusses',
    gutters:coverFamily!=='none'&&['solid-studio','solid-truss-ends','full-trusses','translucent'].includes(cover.family),
    rails:selectedRail.takeoffSystem==='timbertech-ire'?'manufacturer-family':'unverified',
    texture:getDeckVisualProduct(values.deckingMaterial)?'verified-photo':'unavailable'};
}
export function offsetPoint(points:DeckPoint[],dx:number,dy:number):DeckPoint[]{
  return points.map((point)=>({x:point.x+dx,y:point.y+dy}));
}
