import { useMemo } from 'react';
import * as THREE from 'three';
import {
  inchToFoot,type RenaissanceExtrusionProfile,
  RENAISSANCE_STRUCTURAL_GUTTER,RENAISSANCE_TRUSS,
} from '../../lib/renaissanceManufacturer';
import type { P2 } from './Primitives';

function outlineWithRibs(width:number,height:number){
  // Physical beam silhouette: repeated extrusion tongues along each vertical
  // side, exact outside envelope. Actual tight corner radii are not dimensioned
  // in the supplied elevation, so no radius is represented as verified.
  const w=width/2,h=height/2,g=Math.min(.020,width*.12);
  const shape=new THREE.Shape();
  shape.moveTo(-w,-h);shape.lineTo(w,-h);
  for(const level of [-.57,-.48,.25,.34]){
    const y=level*h;
    shape.lineTo(w,y);shape.lineTo(w-g,y+g);shape.lineTo(w-g,y+g*2);shape.lineTo(w,y+g*3);
  }
  shape.lineTo(w,h);shape.lineTo(-w,h);
  for(const level of [.34,.25,-.48,-.57]){
    const y=level*h;
    shape.lineTo(-w,y);shape.lineTo(-w+g,y-g);shape.lineTo(-w+g,y-g*2);shape.lineTo(-w,y-g*3);
  }
  shape.closePath();
  return shape;
}

/** Measured external envelope; HD differs from SD in wall gauge, not outer size. */
export function RenaissanceHeader({start,end,midY,profile,color}:{
  start:P2;end:P2;midY:number;profile:RenaissanceExtrusionProfile;color:string;
}){
  const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz);
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const g=new THREE.ExtrudeGeometry(
      outlineWithRibs(inchToFoot(profile.headerDepthIn),inchToFoot(profile.headerHeightIn)),
      {depth:length,steps:1,bevelEnabled:false,curveSegments:2},
    );
    g.translate(0,0,-length/2);
    g.rotateY(Math.PI/2);
    g.computeVertexNormals();
    return g;
  },[length,profile.headerDepthIn,profile.headerHeightIn]);
  if(!geometry)return null;
  return <mesh geometry={geometry}
    position={[(start[0]+end[0])/2,midY,(start[1]+end[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.48} roughness={.29}/>
  </mesh>;
}

/** Open-ended hollow rectangular aluminum extrusion, measured OD and wall. */
export function RenaissancePost({x,z,bottom,top,profile,color}:{
  x:number;z:number;bottom:number;top:number;profile:RenaissanceExtrusionProfile;color:string;
}){
  const height=Math.max(0,top-bottom);
  const geometry=useMemo(()=>{
    if(height<.01)return null;
    const side=inchToFoot(profile.postOutsideIn);
    const t=inchToFoot(profile.postWallIn);
    const outer=new THREE.Shape();
    outer.moveTo(-side/2,-side/2);outer.lineTo(side/2,-side/2);
    outer.lineTo(side/2,side/2);outer.lineTo(-side/2,side/2);outer.closePath();
    const inner=new THREE.Path();
    const hole=side/2-t;
    inner.moveTo(-hole,-hole);inner.lineTo(-hole,hole);
    inner.lineTo(hole,hole);inner.lineTo(hole,-hole);inner.closePath();
    outer.holes.push(inner);
    const g=new THREE.ExtrudeGeometry(outer,{depth:height,steps:1,bevelEnabled:false});
    g.rotateX(-Math.PI/2);g.computeVertexNormals();
    return g;
  },[height,profile.postOutsideIn,profile.postWallIn]);
  if(!geometry)return null;
  return <mesh geometry={geometry} position={[x,bottom,z]} castShadow receiveShadow>
    <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={.42} roughness={.31}/>
  </mesh>;
}

/** Actual 5 x 5 x .072 structural gutter L section from SD drawing set. */
export function RenaissanceGutter({start,end,topY,color}:{
  start:P2;end:P2;topY:number;color:string;
}){
  const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz);
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const w=inchToFoot(RENAISSANCE_STRUCTURAL_GUTTER.outsideWidthIn);
    const h=inchToFoot(RENAISSANCE_STRUCTURAL_GUTTER.outsideHeightIn);
    const t=inchToFoot(RENAISSANCE_STRUCTURAL_GUTTER.wallIn);
    const s=new THREE.Shape();
    s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);
    s.lineTo(w/2-t,h/2);s.lineTo(w/2-t,-h/2+t);
    s.lineTo(-w/2+t,-h/2+t);s.lineTo(-w/2+t,h/2);
    s.lineTo(-w/2,h/2);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:length,steps:1,bevelEnabled:false});
    g.translate(0,0,-length/2);g.rotateY(Math.PI/2);g.computeVertexNormals();
    return g;
  },[length]);
  if(!geometry)return null;
  return <mesh geometry={geometry}
    position={[(start[0]+end[0])/2,topY-inchToFoot(RENAISSANCE_STRUCTURAL_GUTTER.outsideHeightIn)/2,
      (start[1]+end[1])/2]} rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.4} roughness={.3} side={THREE.DoubleSide}/>
  </mesh>;
}

/** Rectangular 6 x 2-in open-air truss, not a round pipe/rod. */
export function RenaissanceTruss({from,to,color}:{
  from:[number,number,number];to:[number,number,number];color:string;
}){
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const delta=b.clone().sub(a),length=delta.length();
  if(length<.01)return null;
  const quaternion=new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0,0,1),delta.normalize());
  return <mesh position={a.add(b).multiplyScalar(.5).toArray() as [number,number,number]}
    quaternion={quaternion} castShadow receiveShadow>
    <boxGeometry args={[inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn),
      inchToFoot(RENAISSANCE_TRUSS.outsideHeightIn),length]}/>
    <meshStandardMaterial color={color} metalness={.36} roughness={.33}/>
  </mesh>;
}
