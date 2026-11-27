import type { DeckModel } from './deckModel';
import { DECK_BOARD_FACE_FT, DECK_GAP_FT } from './deckBoardDimensions';
import { stockBoardSegments as boardStockSegments } from './finishStockGeometry';
import { planMiteredPictureFrames } from './deckMiterGeometry';
import { subtractDeckFace, mergeDeckFaces, deckFaceArea, type DeckFacePoint } from './deckSurfaceClipping';

export interface SurfaceStrip {
  axis:'x'|'z';
  x:number;z:number;lengthFt:number;widthFt:number;
  startFt:number;endFt:number;row:number;
  /** Exact saw-cut face when a border or angled edge leaves a nonrectangular piece. */
  outline?:DeckFacePoint[];
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
 * These physical cut faces also drive field-board takeoff. Narrow perimeter
 * rips stay in this shared layout; enclosure choices never add a patch course.
 */
export function surfaceStrips(
  model:Pick<DeckModel,'points'|'boardRun'|'minX'|'maxX'|'minY'|'maxY'> &
    Partial<Pick<DeckModel,'breakerBoardPositions'|'breakerBoardCount'|'pictureFrameSegments'|'pictureFrameCount'|'deckBoardFaceFt'|'pictureFrameFaceFts'|'breakerFaceFts'|'fasciaThicknessFt'>>,
  boardWidthFt=model.deckBoardFaceFt??VISIBLE_BOARD_WIDTH_FT,gapFt=VISIBLE_BOARD_GAP_FT,
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
    const rowStart=min+row*step;
    if(rowStart>=max-.001||result.length>=1400)break;
    const rowEnd=Math.min(rowStart+boardWidthFt,max);
    // A notch may change the available width partway across one board.
    // Keep the surviving rip on both sides of that exact vertex station.
    const stations=[...new Set([rowStart,...points.map(p=>runX?p.y:p.x)
      .filter(v=>v>rowStart+1e-8&&v<rowEnd-1e-8),rowEnd])].sort((a,b)=>a-b);
    for(let bandIndex=0;bandIndex+1<stations.length;bandIndex++){
    const bandStart=stations[bandIndex],bandWidth=stations[bandIndex+1]-bandStart;
    if(bandWidth<=.001)continue;
    const sample=bandStart+bandWidth/2;
    // Sample extremely near the true edge: a wider inset can leave 3D board
    // corners outside diagonal boundaries even after the .01-ft end trim.
    const epsilon=Math.min(.000001,bandWidth/1000);
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
      // A visual breaker is a REAL perpendicular board with physical face
      // width. Reserve its full footprint + edge gaps in the field board row.
      const breakerCount=Math.max(0,Math.min(3,Math.round(model.breakerBoardCount??0)));
      const band=Array.from({length:breakerCount},(_,i)=>model.breakerFaceFts?.[i]??boardWidthFt).reduce((a,b)=>a+b,0)+(breakerCount+1)*gapFt;
      const blockers=breakerCount>0?(model.breakerBoardPositions??[]).map(station=>
        [station-band/2,station+band/2] as const):[];
      let permitted:[[number,number]]|Array<[number,number]>=[[start,end]];
      for(const [clipA,clipB] of blockers){
        const next:Array<[number,number]>=[];
        for(const [a,b] of permitted){
          if(b<=clipA||a>=clipB){next.push([a,b]);continue;}
          if(clipA-a>.04)next.push([a,clipA]);
          if(b-clipB>.04)next.push([clipB,b]);
        }
        permitted=next;
      }
      for(const [segmentStart,segmentEnd] of permitted){
        const len=segmentEnd-segmentStart;
        if(len<=.04)continue;
        const pieces=boardStockSegments(len);
        let cursor=segmentStart;
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
      }
      if(result.length>=1400)break;
    }
    }
  }

  // Subtract the real picture-frame faces in TWO dimensions. A narrow rip
  // alongside a parallel border is still a real board; projecting the whole
  // blocker onto the run axis used to throw that entire row away.
  const frames=planMiteredPictureFrames(model.points,model.pictureFrameSegments??[],
    model.pictureFrameCount??0,model.pictureFrameFaceFts??boardWidthFt,gapFt,model.fasciaThicknessFt??.75/12);
  if(!frames.length)return result;
  return clipSurfaceStrips(result,frames,gapFt);
}
function clipSurfaceStrips<T extends SurfaceStrip>(result:T[],frames:ReturnType<typeof planMiteredPictureFrames>,gapFt:number):T[]{
  if(!frames.length)return result;
  const margin=Math.max(.005,Math.min(.025,gapFt));
  return result.flatMap(strip=>{
    const low=(strip.axis==='x'?strip.z:strip.x)-strip.widthFt/2;
    const high=low+strip.widthFt;
    const face:DeckFacePoint[]=strip.axis==='x'
      ?[[strip.startFt,low],[strip.endFt,low],[strip.endFt,high],[strip.startFt,high]]
      :[[low,strip.startFt],[high,strip.startFt],[high,strip.endFt],[low,strip.endFt]];
    let pieces:DeckFacePoint[][]=[face];
    for(const frame of frames){
      const minX=Math.min(...frame.corners.map(p=>p[0]))-margin;
      const maxX=Math.max(...frame.corners.map(p=>p[0]))+margin;
      const minY=Math.min(...frame.corners.map(p=>p[1]))-margin;
      const maxY=Math.max(...frame.corners.map(p=>p[1]))+margin;
      pieces=pieces.flatMap(poly=>{
        if(poly.every(p=>p[0]<minX)||poly.every(p=>p[0]>maxX)||
          poly.every(p=>p[1]<minY)||poly.every(p=>p[1]>maxY))return [poly];
        return subtractDeckFace(poly,frame.corners,margin);
      });
      if(!pieces.length)break;
    }
    return mergeDeckFaces(pieces).flatMap(poly=>{
      const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
      const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      const startFt=strip.axis==='x'?x0:y0,endFt=strip.axis==='x'?x1:y1;
      const widthFt=strip.axis==='x'?y1-y0:x1-x0;
      if(endFt-startFt<=.04||widthFt<=.001||deckFaceArea(poly)<.0001)return [];
      const rectangle=poly.every(([x,y])=>(Math.abs(x-x0)<1e-7||Math.abs(x-x1)<1e-7)&&
        (Math.abs(y-y0)<1e-7||Math.abs(y-y1)<1e-7));
      return [{...strip,startFt,endFt,lengthFt:endFt-startFt,widthFt,
        x:(x0+x1)/2,z:(y0+y1)/2,...(rectangle?{}:{outline:poly})}];
    });
  });
}
export interface BreakerVisualStrip extends SurfaceStrip {
  course:number;
  stationFt:number;
}
/**
 * Perpendicular breaker courses at the EXACT takeoff station, using 5.5-inch
 * face boards separated by the common installation gap. Rows are clipped to
 * each polygon interval (including concave footprints), never full-width
 * rectangular impostors. Manufacturing source determines appearance only.
 */
export function breakerVisualStrips(
  model:Pick<DeckModel,'points'|'boardRun'|'minX'|'maxX'|'minY'|'maxY'> &
    Partial<Pick<DeckModel,'breakerBoardPositions'|'breakerBoardCount'|'breakerFaceFts'|'pictureFrameSegments'|'pictureFrameCount'|'pictureFrameFaceFts'|'fasciaThicknessFt'>>,
  boardWidthFt=VISIBLE_BOARD_WIDTH_FT,gapFt=VISIBLE_BOARD_GAP_FT,
):BreakerVisualStrip[]{
  const count=Math.max(0,Math.min(3,Math.round(model.breakerBoardCount??0)));
  if(count===0||model.points.length<3||!Number.isFinite(boardWidthFt)||boardWidthFt<=0||
    !Number.isFinite(gapFt)||gapFt<0)return [];
  const runX=model.boardRun==='width';
  // Breaker orientation is PERPENDICULAR to the main field.
  const min=runX?model.minX:model.minY,max=runX?model.maxX:model.maxY;
  const faceAxis=runX?'x':'z';
  const results:BreakerVisualStrip[]=[];
  const scan=(station:number):Array<[number,number]>=>{
    const hits:number[]=[];
    const points=model.points;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const av=runX?a.x:a.y,bv=runX?b.x:b.y;
      if((av<=station&&bv>station)||(bv<=station&&av>station)){
        const t=(station-av)/(bv-av);
        hits.push((runX?a.y:a.x)+t*((runX?b.y:b.x)-(runX?a.y:a.x)));
      }
    }
    hits.sort((a,b)=>a-b);
    const intervals:Array<[number,number]>=[];
    for(let i=0;i+1<hits.length;i+=2)intervals.push([hits[i],hits[i+1]]);
    return intervals;
  };
  const widths=Array.from({length:count},(_,i)=>model.breakerFaceFts?.[i]??boardWidthFt);
  const bandWidth=widths.reduce((a,b)=>a+b,0)+Math.max(0,count-1)*gapFt;
  for(const station of model.breakerBoardPositions??[]){
    if(!Number.isFinite(station)||station<min||station>max)continue;
    for(let course=0;course<count;course++){
      const faceWidth=widths[course];
      const center=station-bandWidth/2+widths.slice(0,course).reduce((sum,width)=>sum+width+gapFt,0)+faceWidth/2;
      const side1=center-faceWidth/2,side2=center+faceWidth/2;
      const epsilon=Math.min(.000001,boardWidthFt/1000);
      if(side1<min||side2>max)continue;
      const middle=scan(center),low=scan(side1+epsilon),high=scan(side2-epsilon);
      for(const [a,b] of middle){
        const midpoint=(a+b)/2;
        const find=(pairs:Array<[number,number]>)=>pairs.find(([x,y])=>midpoint>=x-.000001&&midpoint<=y+.000001);
        const la=find(low),ha=find(high);
        if(!la||!ha)continue;
        const start=Math.max(a,la[0],ha[0])+.01;
        const end=Math.min(b,la[1],ha[1])-.01;
        if(end-start<.04)continue;
        const pieces=boardStockSegments(end-start);
        let cursor=start;
        for(let i=0;i<pieces.length;i++){
          const seam=i<pieces.length-1?INSTALLATION_END_GAP_FT:0;
          const lengthFt=pieces[i]-seam;
          if(lengthFt>.04)results.push({
            axis:faceAxis==='x'?'z':'x',
            x:faceAxis==='x'?center:cursor+lengthFt/2,
            z:faceAxis==='x'?cursor+lengthFt/2:center,
            lengthFt,widthFt:faceWidth,
            startFt:cursor,endFt:cursor+lengthFt,
            row:course,course,stationFt:station,
          });
          cursor+=pieces[i];
        }
      }
    }
  }
  const frames=planMiteredPictureFrames(model.points,model.pictureFrameSegments??[],model.pictureFrameCount??0,
    model.pictureFrameFaceFts??boardWidthFt,gapFt,model.fasciaThicknessFt??.75/12);
  return clipSurfaceStrips(results,frames,gapFt);
}
