/** Polygon scanline intervals shared by the 3D framing model.
 *  Uses the same half-open crossing rule as buildDeckModel; never extends joists
 *  into concave cutouts or beyond the deck's actual perimeter.
 */
export type Point2D={x:number;y:number};
export type Span2D={start:number;end:number;length:number};
export function polygonLineSpans(points:readonly Point2D[],axis:'horizontal'|'vertical',position:number):Span2D[]{
  if(points.length<3||!Number.isFinite(position))return [];
  const xMode=axis==='vertical',intersections:number[]=[];
  for(let index=0;index<points.length;index++){
    const a=points[index],b=points[(index+1)%points.length];
    const av=xMode?a.x:a.y,bv=xMode?b.x:b.y;
    if((av<=position&&bv>position)||(bv<=position&&av>position)){
      const t=(position-av)/(bv-av);
      intersections.push(xMode?a.y+t*(b.y-a.y):a.x+t*(b.x-a.x));
    }
  }
  intersections.sort((a,b)=>a-b);
  const result:Span2D[]=[];
  for(let i=0;i+1<intersections.length;i+=2){
    const start=intersections[i],end=intersections[i+1];
    if(end-start>0.01)result.push({start,end,length:end-start});
  }
  return result;
}
export function nominalLumberDepthFt(label:string):number{
  if(label==='PSL')return 11.25/12; // visual placeholder; engineered PSL actual size not known
  const inches=Number(label.split('x')[1]);
  return Number.isFinite(inches)&&inches>=2?(inches-.75)/12:7.25/12;
}
export function stairFrameGeometry(heightFt:number,stairRunFt:number,treads:number,widthFt:number){
  const valid=Math.max(1,Math.min(40,Math.floor(treads)));
  const run=Math.max(.5,stairRunFt);
  const rise=Math.max(.03,heightFt)/Math.max(1,valid+1);
  return {treads:valid,run,depth:run/valid,rise,stringers:Math.max(2,Math.floor(widthFt)+1)};
}
