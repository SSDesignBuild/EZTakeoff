import { DECK_BOARD_FACE_FT, DECK_GAP_FT, boardStockSegments, type DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import { getCoverVisualProduct, getRailVisualProduct, getDeckVisualProduct } from '../data/visualCatalog';

export interface SurfaceStrip {
  axis:'x'|'z';
  x:number;z:number;lengthFt:number;widthFt:number;
  startFt:number;endFt:number;row:number;
}
export const VISIBLE_BOARD_WIDTH_FT = DECK_BOARD_FACE_FT;
export const VISIBLE_BOARD_GAP_FT = DECK_GAP_FT;
const INSTALLATION_END_GAP_FT = 0.125 / 12;
/**
 * A visual board row uses the same 5.5-inch face and 1/8-inch gap as
 * buildDeckModel. Its pieces follow the SAME stock segmentation routine
 * (20-ft upper bound and selected breaker location) as the material takeoff.
 *
 * For angled/concave outlines, intersect the center scanline interval with
 * the two row-boundary intervals. This conservative trim prevents 3D plank
 * corners extending outside the drawn deck. Precise miters remain field cuts.
 * Material purchasing is always governed by buildDeckModel, never these meshes.
 */
export function surfaceStrips(
  model:Pick<DeckModel,'points'|'boardRun'|'minX'|'maxX'|'minY'|'maxY'> &
    Partial<Pick<DeckModel,'breakerBoardPositions'>>,
  boardWidthFt=VISIBLE_BOARD_WIDTH_FT,gapFt=VISIBLE_BOARD_GAP_FT,
):SurfaceStrip[]{
  const points=model.points;
  if(points.length<3||!Number.isFinite(boardWidthFt)||boardWidthFt<=0||
    !Number.isFinite(gapFt)||gapFt<0)return [];
  const runX=model.boardRun==='width';
  const min=runX?model.minY:model.minX;
  const max=runX?model.maxY:model.maxX;
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return [];
  const step=boardWidthFt+gapFt;
  const scan=(station:number):number[][]=>{
    const hits:number[]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const av=runX?a.y:a.x,bv=runX?b.y:b.x;
      if((av<=station&&bv>station)||(bv<=station&&av>station)){
        const t=(station-av)/(bv-av);
        const au=runX?a.x:a.y,bu=runX?b.x:b.y;
        hits.push(au+(bu-au)*t);
      }
    }
    hits.sort((a,b)=>a-b);
    const intervals:number[][]=[];
    for(let i=0;i+1<hits.length;i+=2)intervals.push([hits[i],hits[i+1]]);
    return intervals;
  };
  const result:SurfaceStrip[]=[];
  for(let row=0;row<2000;row++){
    const bandStart=min+row*step;
    if(bandStart>=max-.001||result.length>=1400)break;
    const bandWidth=Math.min(boardWidthFt,max-bandStart);
    if(bandWidth<=.001)continue;
    const sample=bandStart+bandWidth/2;
    const epsilon=Math.min(.001,bandWidth/4);
    const middle=scan(sample),low=scan(bandStart+epsilon),high=scan(bandStart+bandWidth-epsilon);
    for(const [startMid,endMid] of middle){
      const midpoint=(startMid+endMid)/2;
      const find=(intervals:number[][])=>intervals.find(([a,b])=>midpoint>=a-.000001&&midpoint<=b+.000001);
      const atLow=find(low),atHigh=find(high);
      if(!atLow||!atHigh)continue;
      const start=Math.max(startMid,atLow[0],atHigh[0])+.01;
      const end=Math.min(endMid,atLow[1],atHigh[1])-.01;
      const len=end-start;
      if(len<=.04)continue;
      const relativeBreaks=(model.breakerBoardPositions??[]).map(station=>station-start);
      const pieces=boardStockSegments(len,relativeBreaks);
      let cursor=start;
      for(let part=0;part<pieces.length;part++){
        const cutLength=pieces[part];
        const seam=part<pieces.length-1?Math.min(INSTALLATION_END_GAP_FT,cutLength*.1):0;
        const actualLength=cutLength-seam;
        if(actualLength>.04){
          const center=cursor+actualLength/2;
          result.push({axis:runX?'x':'z',
            x:runX?center:bandStart+bandWidth/2,
            z:runX?bandStart+bandWidth/2:center,
            lengthFt:actualLength,widthFt:bandWidth,
            startFt:cursor,endFt:cursor+actualLength,row});
        }
        cursor+=cutLength;
      }
      if(result.length>=1400)break;
    }
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
