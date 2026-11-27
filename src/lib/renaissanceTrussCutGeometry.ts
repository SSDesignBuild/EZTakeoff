import { renaissanceFormedProfileContour } from './renaissanceFactoryProfiles';
import { renaissanceTrussEndStationFt,type RenaissanceTrussEndStyle } from './renaissanceTrussSilhouette';

type V3=[number,number,number];
/** Constant factory section terminated by an ogee cut. All units are feet.
 * Pure coordinates let independent QA verify the same surface the viewer uses.
 * The cap is a representative .060in skin; no factory mold radius is claimed.
 */
export function buildRenaissanceTrussCutMesh(input:{length:number;width:number;
 height:number;rise:number;wall:number;style:RenaissanceTrussEndStyle;availableTailFt?:number}){
 const {length,width,height,rise,style,availableTailFt}=input;
 const wall=Math.max(.0001,Math.min(input.wall,width/4,height/4));
 if(![length,width,height,rise,wall].every(Number.isFinite)||length<=.001||width<=0||height<=0)
  return {positions:[] as number[],sectionLevels:[] as number[]};
 const outline=renaissanceFormedProfileContour(width,height,'truss');
 const levels=[...new Set([...outline.map(p=>p[1]),
  ...Array.from({length:97},(_,i)=>-height/2+height*i/96)])].sort((a,b)=>a-b);
 const halfWidth=(y:number)=>{
  for(let i=0;i<outline.length;i++){
   const a=outline[i],b=outline[(i+1)%outline.length];
   if(a[0]<=0||b[0]<=0||Math.abs(a[1]-b[1])<1e-10)continue;
   if(y>=Math.min(a[1],b[1])-1e-9&&y<=Math.max(a[1],b[1])+1e-9){
    const t=(y-a[1])/(b[1]-a[1]);return a[0]+(b[0]-a[0])*t;
   }
  }
  return width/2;
 };
 const section=(inner:boolean)=>{
  const right=levels.map(y=>[halfWidth(y)-(inner?wall:0),
   inner?y*(height-2*wall)/height:y] as [number,number]);
  return [...right,...[...right].reverse().map(([x,y])=>[-x,y] as [number,number])];
 };
 const outer=section(false),inner=section(true);
 const endZ=(y:number,inside:boolean)=>Math.max(.0001,
  renaissanceTrussEndStationFt((height/2-y)/height,length,style,availableTailFt)-(inside?wall:0));
 const point=(x:number,y:number,z:number):V3=>[x,y+rise*z/length,z];
 const positions:number[]=[];
 const tri=(a:V3,b:V3,c:V3)=>positions.push(...a,...b,...c);
 const quad=(a:V3,b:V3,c:V3,d:V3)=>{tri(a,b,c);tri(a,c,d);};
 for(let i=0;i<outer.length;i++){
  const j=(i+1)%outer.length,a=outer[i],b=outer[j],c=inner[i],d=inner[j];
  quad(point(...a,0),point(...b,0),point(...b,endZ(b[1],false)),point(...a,endZ(a[1],false)));
  quad(point(...d,0),point(...c,0),point(...c,endZ(c[1],true)),point(...d,endZ(d[1],true)));
  quad(point(...b,0),point(...a,0),point(...c,0),point(...d,0));
 }
 // Matching horizontal bands close both sides of the thin cast cap.
 for(let i=1;i<levels.length;i++){
  for(const inside of [false,true]){
   const ring=inside?inner:outer,a=ring[i-1],b=ring[i];
   const a0=point(-a[0],a[1],endZ(a[1],inside)),a1=point(a[0],a[1],endZ(a[1],inside));
   const b0=point(-b[0],b[1],endZ(b[1],inside)),b1=point(b[0],b[1],endZ(b[1],inside));
   if(inside)quad(a1,a0,b0,b1);else quad(a0,a1,b1,b0);
  }
 }
 return {positions,sectionLevels:levels};
}
