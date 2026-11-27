import type { StairFasciaCoverage,StairSideFasciaPoint } from './stairFasciaGeometry';
export interface StairFasciaStockPiece {kind:'main'|'lower-rip';index:number;outline:StairSideFasciaPoint[];cutLengthFt:number;}
const maxCut=12-(.125+.25)/12;
function clip(poly:readonly StairSideFasciaPoint[],station:number,after:boolean):StairSideFasciaPoint[]{
  const out:StairSideFasciaPoint[]=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],d=(p.runFt-station)*(after?1:-1),e=(q.runFt-station)*(after?1:-1);
    if(d>=-1e-9)out.push(p);
    if(d*e<0){const f=d/(d-e);out.push({runFt:station,riseFt:p.riseFt+(q.riseFt-p.riseFt)*f});}
  }return out;
}
const cutLength=(poly:readonly StairSideFasciaPoint[],slope:number)=>{
  const projected=poly.map(p=>(p.runFt-slope*p.riseFt)/Math.sqrt(1+slope*slope));
  return Math.max(...projected)-Math.min(...projected);
};
/** Physical side-fascia pieces fit selected12-ft stock, including sloped
 * long-point end projections,1/8-in kerf and1/4-in trim. Seams sit on the
 * continuous stringer backing. No full20-ft fascia object is fabricated. */
export function planStairFasciaStockPieces(coverage:Pick<StairFasciaCoverage,'main'|'lowerRip'>,riseFt:number,treadDepthFt:number):StairFasciaStockPiece[]{
  const result:StairFasciaStockPiece[]=[],slope=riseFt/treadDepthFt;
  for(const [kind,outline]of [['main',coverage.main],['lower-rip',coverage.lowerRip]] as const){
    if(outline.length<3)continue;
    const start=Math.min(...outline.map(p=>p.runFt)),end=Math.max(...outline.map(p=>p.runFt));let cursor=start,index=0;
    while(cursor<end-1e-7&&index<100){
      const remainder=clip(outline,cursor,true);let stop=end;
      if(cutLength(remainder,slope)>maxCut+1e-8){
        let lo=cursor,hi=end;
        for(let n=0;n<45;n++){const middle=(lo+hi)/2,part=clip(remainder,middle,false);if(cutLength(part,slope)<=maxCut)lo=middle;else hi=middle;}
        // A whole tread station makes the visible join easy to set out.
        const treadStation=Math.floor(lo/treadDepthFt)*treadDepthFt;
        stop=treadStation>cursor+.25?treadStation:lo;
      }
      if(stop<=cursor+1e-7)break;
      const lo=cursor+(index===0?0:.125/24),hi=stop-(stop<end-1e-7?.125/24:0);
      const poly=clip(clip(outline,lo,true),hi,false);
      if(poly.length>=3)result.push({kind,index:outline===coverage.main?index:index+100,outline:poly,cutLengthFt:cutLength(poly,slope)});
      cursor=stop;index++;
    }
  }
  return result;
}
