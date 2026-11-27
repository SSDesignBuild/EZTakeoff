import type { DeckModel } from './deckModel';
import { planMiteredPictureFrames,splitMiteredPictureFrames } from './deckMiterGeometry';
import { triangulateDeckFace,clipDeckFace,mergeDeckFaces,deckFaceArea,type DeckFacePoint } from './deckSurfaceClipping';

/** Each fascia board is outside the structural rim, with a physical corner
 * cut and actual12-ft stock seam. No whole16-ft fascia impostor is drawn. */
export function planDeckFasciaCuts(model:DeckModel){
  return splitMiteredPictureFrames(planMiteredPictureFrames(model.points,model.fasciaSegments,1,
    model.fasciaThicknessFt,0,0,model.fasciaThicknessFt),.125/12,12-(.125+.25)/12-.01).map((cut,index)=>{
    const footprint=cut.corners.map(p=>({x:p[0],y:p[1]}));
    const from={x:(footprint[0].x+footprint[3].x)/2,y:(footprint[0].y+footprint[3].y)/2};
    const to={x:(footprint[1].x+footprint[2].x)/2,y:(footprint[1].y+footprint[2].y)/2};
    return {id:`FA-E${cut.edgeIndex+1}-${index+1}`,edgeIndex:cut.edgeIndex,footprint,from,to,
      lengthFt:Math.max(Math.hypot(footprint[1].x-footprint[0].x,footprint[1].y-footprint[0].y),
        Math.hypot(footprint[2].x-footprint[3].x,footprint[2].y-footprint[3].y))};
  });
}
/** Real4×8 sheet grid with alternate rows offset4ft, clipped to the polygon. */
export function planSubfloorCuts(model:DeckModel){
  const triangles=triangulateDeckFace(model.points.map(p=>[p.x,p.y] as DeckFacePoint)),runX=model.boardRun==='width';
  const minU=runX?model.minX:model.minY,maxU=runX?model.maxX:model.maxY,minV=runX?model.minY:model.minX,maxV=runX?model.maxY:model.maxX;
  const at=(u:number,v:number):DeckFacePoint=>runX?[u,v]:[v,u];
  const result:Array<{id:string;sheetId:string;footprint:{x:number;y:number}[];from:{x:number;y:number};to:{x:number;y:number};lengthFt:number;widthFt:number}>=[];
  for(let row=0,v=minV;v<maxV-1e-8;row++,v+=4){
    for(let col=0,u=minU-(row%2?4:0);u<maxU-1e-8;col++,u+=8){
      let rectangle=[at(u,v),at(u+8,v),at(u+8,v+4),at(u,v+4)];if(!runX)rectangle=rectangle.reverse();
      const clipped=triangles.map(triangle=>{let face=rectangle;for(let i=0;i<triangle.length;i++)face=clipDeckFace(face,triangle[i],triangle[(i+1)%triangle.length],true);return face;});
      const faces=mergeDeckFaces(clipped.filter(p=>p.length>=3&&deckFaceArea(p)>1e-7));
      for(const [i,face]of faces.entries()){
        const us=face.map(p=>p[runX?0:1]),vs=face.map(p=>p[runX?1:0]),a=Math.min(...us),b=Math.max(...us),cross=(Math.min(...vs)+Math.max(...vs))/2;
        const f=at(a,cross),t=at(b,cross),sheetId=`SUB-R${row+1}-C${col+1}`;
        result.push({id:`${sheetId}-${i+1}`,sheetId,footprint:face.map(p=>({x:p[0],y:p[1]})),from:{x:f[0],y:f[1]},to:{x:t[0],y:t[1]},lengthFt:b-a,widthFt:Math.max(...vs)-Math.min(...vs)});
      }
    }
  }
  return result;
}
