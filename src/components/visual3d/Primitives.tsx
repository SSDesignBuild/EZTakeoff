import * as THREE from 'three';
export type P2=[number,number];
export type P3=[number,number,number];
export function Block({position,size,color,metalness=0,roughness=.72,texture,name}:{
  position:P3;size:P3;color:string;metalness?:number;roughness?:number;texture?:THREE.Texture|null;
  name?:string;
}){
  return <mesh position={position} name={name} castShadow receiveShadow>
    <boxGeometry args={size}/>
    {texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false}/>:<meshStandardMaterial color={color} metalness={metalness} roughness={roughness}/>}
  </mesh>;
}
export function Beam({start,end,height,thickness,depth,color,metalness=0,texture}:{
  start:P2;end:P2;height:number;thickness:number;depth:number;color:string;metalness?:number;texture?:THREE.Texture|null;
}){
  const dx=end[0]-start[0],dz=end[1]-start[1],len=Math.hypot(dx,dz);
  if(len<.005)return null;
  return <mesh position={[(start[0]+end[0])/2,height,(start[1]+end[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
    <boxGeometry args={[len,thickness,depth]}/>
    {texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false}/>:<meshStandardMaterial color={color} metalness={metalness} roughness={.52}/>}
  </mesh>;
}
export function Rod({from,to,radius,color,metalness=.2,segments=8}:{
  from:P3;to:P3;radius:number;color:string;metalness?:number;segments?:number;
}){
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const vec=b.clone().sub(a),len=vec.length();
  if(len<.004)return null;
  const axis=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion().setFromUnitVectors(axis,vec.normalize());
  return <mesh position={a.add(b).multiplyScalar(.5).toArray() as P3} quaternion={q} castShadow>
    <cylinderGeometry args={[radius,radius,len,segments]}/>
    <meshStandardMaterial color={color} metalness={metalness} roughness={.46}/>
  </mesh>;
}

/** A rectangular 2x member aligned to 3D endpoints, including sloping grade. */
export function SlopedBeam({start,end,thickness,depth,color}:{
  start:P3;end:P3;thickness:number;depth:number;color:string;
}){
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end);
  const diff=b.clone().sub(a),length=diff.length();
  if(length<.005)return null;
  const rotation=new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1,0,0),diff.normalize());
  return <mesh position={a.add(b).multiplyScalar(.5).toArray() as P3}
    quaternion={rotation} castShadow receiveShadow>
    <boxGeometry args={[length,thickness,depth]}/>
    <meshStandardMaterial color={color} roughness={.73}/>
  </mesh>;
}
