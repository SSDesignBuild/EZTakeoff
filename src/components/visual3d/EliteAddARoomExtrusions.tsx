import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {
  eliteProfileContourIn,type EliteProfileSystem,type EliteSectionProfile,
} from '../../lib/eliteAddARoomExtrusions';

const inchFt=(n:number)=>n/12;
const PROFILE_METALNESS=.46;
function contourShape(system:EliteProfileSystem,kind:EliteSectionProfile){
 const contour=eliteProfileContourIn(system,kind);
 const shape=new THREE.Shape();
 contour.forEach(([x,y],i)=>i===0?
  shape.moveTo(inchFt(x),inchFt(y)):
  shape.lineTo(inchFt(x),inchFt(y)));
 shape.closePath();
 return shape;
}
/** Sweep actual U/H channel outside silhouette into a continuous vertical
 * metal section. Inner ribs/screw bosses are not dimensioned by catalog.
 * The Renaissance post itself remains separate: never create Elite corners.
 */
export function EliteVerticalExtrusion({kind,system,x,bottom,height,color,flip=false,name}:{
 kind:'receiver'|'drc'|'h-vertical';system:EliteProfileSystem;
 x:number;bottom:number;height:number;color:string;flip?:boolean;name:string;
}){
 const geometry=useMemo(()=>{
  if(height<.03||!Number.isFinite(height))return null;
  const shape=contourShape(system,kind);
  const g=new THREE.ExtrudeGeometry(shape,{depth:height,steps:1,
    bevelEnabled:false,curveSegments:1});
  g.rotateX(-Math.PI/2); // extrusion axis +Y; section spans X/Z
  if(flip)g.scale(-1,1,1);
  g.computeVertexNormals();
  return g;
 },[kind,system,height,flip]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 if(!geometry)return null;
 return <mesh name={name} geometry={geometry} position={[x,bottom,0]}
   castShadow receiveShadow>
   <meshStandardMaterial color={color} metalness={PROFILE_METALNESS}
     roughness={.33} side={THREE.DoubleSide}/>
 </mesh>;
}
/**
 * H break, U base, or overhanging factory top-cap: genuine catalog outside
 * contour extruded as one run, with optional pitched roof-following shear.
 * Cross section is local XY; extrusion+Z rotates into world+X.
 */
export function EliteHorizontalExtrusion({kind,system,start,end,yLeft,yRight,color,name}:{
 kind:'bottom'|'h-horizontal'|'top';system:EliteProfileSystem;
 start:number;end:number;yLeft:number;yRight:number;color:string;name:string;
}){
 const length=end-start;
 const grade=yRight-yLeft;
 const geometry=useMemo(()=>{
  if(length<.04||!Number.isFinite(length)||!Number.isFinite(grade))return null;
  const shape=contourShape(system,kind);
  const g=new THREE.ExtrudeGeometry(shape,{depth:length,steps:1,
    bevelEnabled:false,curveSegments:1});
  g.rotateY(Math.PI/2);
  g.translate(-length/2,0,0);
  if(Math.abs(grade)>.00001){
    const positions=g.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const fraction=Math.max(0,Math.min(1,(positions.getX(i)+length/2)/length));
      positions.setY(i,positions.getY(i)+grade*fraction);
    }
    positions.needsUpdate=true;
  }
  g.computeVertexNormals();
  return g;
 },[kind,system,length,grade]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 if(!geometry)return null;
 return <mesh name={name} geometry={geometry}
   position={[(start+end)/2,yLeft,0]} castShadow receiveShadow>
   <meshStandardMaterial color={color} metalness={PROFILE_METALNESS}
     roughness={.34} side={THREE.DoubleSide}/>
 </mesh>;
}
