import { useEffect,useMemo } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import type { ConstructionPart,ConstructionConnection } from '../../lib/constructionAssembly';
import { buildConstructionSkirting } from '../../lib/constructionSkirting';
import { Block,type P2 } from './Primitives';

/** The source polygon is the actual cut face. Two ordered profile faces
 * make one physical prism; no full-width replacement board or extra jamb. */
function SkirtPart({part,center,texture}:{part:ConstructionPart;center:P2;texture:THREE.Texture|null}){
 const geometry=useMemo(()=>{
  const vertices=part.vertices??[],profile=part.profile??[],n=profile.length;
  if(n<3||vertices.length!==2*n)return null;
  const shape=profile.map(p=>new THREE.Vector2(p.stationFt,p.elevationFt));
  const faces=THREE.ShapeUtils.triangulateShape(shape,[]);
  const indices:number[]=[];
  for(const [a,b,c]of faces)indices.push(c,b,a,n+a,n+b,n+c);
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
  const positions:number[]=[],uv:number[]=[];
  const s0=Math.min(...profile.map(p=>p.stationFt)),s1=Math.max(...profile.map(p=>p.stationFt));
  const vertical=Math.hypot(part.axis.to.x-part.axis.from.x,part.axis.to.y-part.axis.from.y)<.001;
  for(const index of indices){
   const p=vertices[index],q=profile[index%n];positions.push(p.x-center[0],p.z,p.y-center[1]);
   const along=(q.stationFt-s0)/Math.max(.001,s1-s0),up=(q.elevationFt-part.zBottom)/Math.max(.001,part.zTop-part.zBottom);
   uv.push(vertical?up:along,vertical?along:up);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
 },[part,center]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 if(!geometry)return null;
 const frame=part.kind==='skirt-support',synthetic=!frame&&!part.material.includes('KDAT');
 const color=frame?'#927654':part.material.includes('PVC')?'#d8dad6':synthetic?'#bcb5aa':'#b19a79';
 return <mesh name={part.id} geometry={geometry} castShadow receiveShadow
   userData={{constructionPartId:part.id,stockReference:part.stockReference}}>
   {synthetic&&texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false} side={THREE.DoubleSide}/>:
    <meshStandardMaterial color={color} roughness={.82} side={THREE.DoubleSide}/>}
 </mesh>;
}
function GateHardware({connection,parts,center}:{connection:ConstructionConnection;parts:ConstructionPart[];center:P2}){
 const top=parts.find(p=>p.source.notes.some(n=>n.includes(': gate-top;')));
 if(!top?.vertices?.length||!top.profile?.length)return null;
 const n=top.profile.length,a=top.vertices[0],b=top.vertices[n];
 const depth=Math.hypot(b.x-a.x,b.y-a.y),nx=(b.x-a.x)/depth,ny=(b.y-a.y)/depth;
 const bottom=Math.min(...parts.map(p=>p.zBottom)),upper=Math.max(...parts.map(p=>p.zTop));
 const count=connection.hardware.find(h=>h.name.includes('hinge'))?.quantity??2;
 const along=[top.axis.to.x-top.axis.from.x,top.axis.to.y-top.axis.from.y];
 const length=Math.hypot(...along),ux=along[0]/length,uy=along[1]/length;
 const yaw=-Math.atan2(uy,ux);
 const at=(s:number,z:number):[number,number,number]=>[
  connection.point.x+ux*s+nx*.095-center[0],z,connection.point.y+uy*s+ny*.095-center[1]];
 return <group name="placed-hinged-skirting-access-gate-hardware">
   {Array.from({length:count},(_,i)=><group key={i} position={at(0,bottom+(upper-bottom)*(i+1)/(count+1))} rotation={[0,yaw,0]}>
     <Block position={[0,0,0]} size={[.14,.13,.10]} color="#565b5f" metalness={.4}/>
   </group>)}
   <group position={at(length,(bottom+upper)/2)} rotation={[0,yaw,0]}>
    <Block position={[0,0,0]} size={[.11,.13,.10]} color="#555c60" metalness={.42}/>
   </group>
   {connection.hardware.some(h=>h.name.includes('cane bolt'))&&<group position={at(length-.14,bottom+.25)} rotation={[0,yaw,0]}>
    <Block position={[0,0,0]} size={[.045,.5,.055]} color="#555c60" metalness={.42}/>
   </group>}
 </group>;
}
export function DeckSkirting3D({model,center,height,values,texture,lowerTier=false}:{
 model:DeckModel;center:P2;height:number;lowerTier?:boolean;
 values:ConsultationProject['values'];texture:THREE.Texture|null;
}){
 const assembly=useMemo(()=>buildConstructionSkirting({id:lowerTier?'L':'M',label:lowerTier?'Lower deck':'Main deck',
  deck:model,heightFt:height,values}),[model,height,values,lowerTier]);
 if(!assembly.parts.length)return null;
 const partMap=new Map(assembly.parts.map(part=>[part.id,part]));
 return <group name="exact-deck-and-stair-skirting-from-construction-parts">
  {assembly.parts.map(part=><SkirtPart key={part.id} part={part} center={center} texture={texture}/>)}
  {assembly.connections.filter(c=>c.kind==='skirting-access-gate').map(connection=><GateHardware
    key={connection.id} connection={connection} center={center}
    parts={connection.partIds.flatMap(id=>{const part=partMap.get(id);return part?[part]:[];})}/>)}
 </group>;
}
