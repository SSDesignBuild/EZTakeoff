import { useMemo } from 'react';
import * as THREE from 'three';
import {
  inchToFoot,type RenaissanceExtrusionProfile,
  RENAISSANCE_ROOF_C_CHANNEL,RENAISSANCE_TRUSS,RENAISSANCE_SHADE_TUBE,
} from '../../lib/renaissanceManufacturer';
import type { P2 } from './Primitives';
import type { GutterRun } from '../../lib/renaissanceGutterGeometry';
import { architecturalGutterOutlineFt,miterAlongFt } from '../../lib/renaissanceGutterGeometry';

function outlineWithRibs(width:number,height:number){
  // Physical beam silhouette: repeated extrusion tongues along each vertical
  // side, exact outside envelope. Actual tight corner radii are not dimensioned
  // in the supplied elevation, so no radius is represented as verified.
  const w=width/2,h=height/2,g=Math.min(.006,width*.10);
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
    const w=inchToFoot(profile.headerDepthIn),h=inchToFoot(profile.headerHeightIn);
    const t=inchToFoot(profile.headerWallIn);
    const outside=outlineWithRibs(w,h),hole=new THREE.Path();
    hole.moveTo(-w/2+t,-h/2+t);hole.lineTo(-w/2+t,h/2-t);
    hole.lineTo(w/2-t,h/2-t);hole.lineTo(w/2-t,-h/2+t);hole.closePath();
    outside.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(
      outside,{depth:length,steps:1,bevelEnabled:false,curveSegments:2},
    );
    g.translate(0,0,-length/2);
    g.rotateY(Math.PI/2);
    g.computeVertexNormals();
    return g;
  },[length,profile.headerDepthIn,profile.headerHeightIn,profile.headerWallIn]);
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

/**
 * Measured Renaissance slope-faced ARCHITECTURAL gutter (not the 5x5 structural
 * gutter channel). A 45° miter is applied to the ends of the extruded contour
 * so the three sides meet cleanly at both outside corners.
 *
 * Local -X faces away from the roof. Local +Z is the drain run direction.
 * A vertical shear follows roof grade, keeping the gutter section upright.
 */
export function RenaissanceGutter({run,color}:{
  run:GutterRun;color:string;
}){
  const dx=run.end[0]-run.start[0],dz=run.end[1]-run.start[1];
  const length=Math.hypot(dx,dz);
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const points=architecturalGutterOutlineFt();
    const s=new THREE.Shape();
    points.forEach(([x,y],i)=>{
      if(i===0)s.moveTo(x,y);else s.lineTo(x,y);
    });
    s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:length,steps:1,bevelEnabled:false});
    const pos=g.getAttribute('position');
    for(let i=0;i<pos.count;i++){
      const along=pos.getZ(i),outside=pos.getX(i);
      const isStart=along<length/2;
      const miter=miterAlongFt(outside,isStart,!isStart,run);
      const grade=(run.endTopFt-run.startTopFt)*along/length;
      pos.setZ(i,along+miter-length/2);
      pos.setY(i,pos.getY(i)+grade);
    }
    pos.needsUpdate=true;g.computeVertexNormals();
    return g;
  },[length,run.startTopFt,run.endTopFt,run.miterStart,run.miterEnd]);
  if(!geometry)return null;
  const rotationY=Math.atan2(dx,dz);
  return <mesh geometry={geometry}
    position={[(run.start[0]+run.end[0])/2,run.startTopFt,
      (run.start[1]+run.end[1])/2]}
    rotation={[0,rotationY,0]} castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.42} roughness={.31} side={THREE.DoubleSide}/>
  </mesh>;
}

/**
 * 3-inch roof receiving C-channel at the building-side attachment.
 * Dimensions are the outside 2-1/16 x 3-9/16 in profile from supplied
 * Renaissance part drawing. Not shown on freestanding covers.
 */
export function RenaissanceReceivingChannel({fromX,toX,z,y,color}:{
  fromX:number;toX:number;z:number;y:number;color:string;
}){
  const length=toX-fromX;
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const w=inchToFoot(RENAISSANCE_ROOF_C_CHANNEL.outsideWidthIn);
    const h=inchToFoot(RENAISSANCE_ROOF_C_CHANNEL.outsideHeightIn);
    const t=inchToFoot(RENAISSANCE_ROOF_C_CHANNEL.wallIn);
    const s=new THREE.Shape();
    s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);
    s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);
    s.lineTo(-w/2,h/2-t);s.lineTo(w/2-t,h/2-t);
    s.lineTo(w/2-t,-h/2+t);s.lineTo(-w/2,-h/2+t);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:length,steps:1,bevelEnabled:false});
    g.translate(0,0,-length/2);g.rotateY(Math.PI/2);
    g.computeVertexNormals();
    return g;
  },[length]);
  if(!geometry)return null;
  return <mesh geometry={geometry} position={[(fromX+toX)/2,y,z]}
    castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.4} roughness={.3} side={THREE.DoubleSide}/>
  </mesh>;
}

/**
 * Exterior gutter drop / rectangular aluminum downspout preview.
 * Routing, section size and actual elbow are NOT specified on the drawings;
 * finish matches the framing, and this is a visualization placeholder
 * pending an approved downspout schedule, not a material-order quantity.
 */
export function RenaissanceDownspout({x,z,top,bottom,color}:{
  x:number;z:number;top:number;bottom:number;color:string;
}){
  const height=Math.max(0,top-bottom);
  const geometry=useMemo(()=>{
    if(height<.05)return null;
    const w=inchToFoot(2),d=inchToFoot(3),t=inchToFoot(.045);
    const s=new THREE.Shape();
    s.moveTo(-w/2,-d/2);s.lineTo(w/2,-d/2);
    s.lineTo(w/2,d/2);s.lineTo(-w/2,d/2);s.closePath();
    const hole=new THREE.Path();
    hole.moveTo(-w/2+t,-d/2+t);hole.lineTo(-w/2+t,d/2-t);
    hole.lineTo(w/2-t,d/2-t);hole.lineTo(w/2-t,-d/2+t);hole.closePath();
    s.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,steps:1});
    g.rotateX(-Math.PI/2);g.computeVertexNormals();
    return g;
  },[height]);
  if(!geometry)return null;
  return <group name="renaissance-gutter-drop-and-downspout">
    <mesh geometry={geometry} position={[x,bottom,z]} castShadow receiveShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={.32} roughness={.35}/>
    </mesh>
    {[.22,.74].map((fraction,i)=><mesh key={'downspout-strap-'+i}
      position={[x,bottom+height*fraction,z]} castShadow>
      <boxGeometry args={[inchToFoot(2.55),inchToFoot(.5),inchToFoot(3.4)]}/>
      <meshStandardMaterial color={color} metalness={.4} roughness={.34}/>
    </mesh>)}
  </group>;
}

/**
 * Ribbed 6x2-inch open-air truss silhouette from the Aria/Fresco part sheets.
 * Both external dimensions are exact; unmeasured corner radii are omitted.
 */
export function RenaissanceTruss({from,to,color}:{
  from:[number,number,number];to:[number,number,number];color:string;
}){
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const delta=b.clone().sub(a),length=delta.length();
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const shape=outlineWithRibs(inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn),
      inchToFoot(RENAISSANCE_TRUSS.outsideHeightIn));
    const g=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,steps:1});
    g.translate(0,0,-length/2);g.computeVertexNormals();
    return g;
  },[length]);
  if(!geometry)return null;
  const quaternion=new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0,0,1),delta.normalize());
  return <mesh geometry={geometry}
    position={a.add(b).multiplyScalar(.5).toArray() as [number,number,number]}
    quaternion={quaternion} castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.38} roughness={.32}/>
  </mesh>;
}

/** Hollow 2x2-inch Aria shade tube, 0.040-in wall, as supplied in the detail. */
export function RenaissanceShadeTube({from,to,color}:{
  from:[number,number,number];to:[number,number,number];color:string;
}){
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const delta=b.clone().sub(a),length=delta.length();
  const geometry=useMemo(()=>{
    if(length<.01)return null;
    const outerIn=RENAISSANCE_SHADE_TUBE.outsideWidthIn,wallIn=RENAISSANCE_SHADE_TUBE.wallIn;
    const w=inchToFoot(outerIn),t=inchToFoot(wallIn);
    const s=new THREE.Shape();
    s.moveTo(-w/2,-w/2);s.lineTo(w/2,-w/2);
    s.lineTo(w/2,w/2);s.lineTo(-w/2,w/2);s.closePath();
    const inset=w/2-t,hole=new THREE.Path();
    hole.moveTo(-inset,-inset);hole.lineTo(-inset,inset);
    hole.lineTo(inset,inset);hole.lineTo(inset,-inset);hole.closePath();
    s.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(s,{depth:length,steps:1,bevelEnabled:false});
    g.translate(0,0,-length/2);g.computeVertexNormals();
    return g;
  },[length]);
  if(!geometry)return null;
  const quaternion=new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0,0,1),delta.normalize());
  return <mesh geometry={geometry}
    position={a.add(b).multiplyScalar(.5).toArray() as [number,number,number]}
    quaternion={quaternion} castShadow receiveShadow>
    <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={.36} roughness={.32}/>
  </mesh>;
}


/**
 * Decorative truss-end silhouette from Contempo/Classico product imagery.
 * Outside 2-in cross-section matches the documented projection truss envelope.
 * Curved end cuts are visual approximations (not dimensioned manufacturer CAD).
 *
 * The upper edge follows the selected canopy; the tail stops at its front
 * overhang. Extrusion thickness is the actual 2-inch visual member width.
 */
export function RenaissanceCurvedTrussEnd({x,frontZ,topY,projectionFt,color}:{
  x:number;frontZ:number;topY:number;projectionFt:number;color:string;
}){
  const front=Math.max(.02,Math.min(1.25,projectionFt));
  const geometry=useMemo(()=>{
    const inner=.65;
    const shape=new THREE.Shape();
    shape.moveTo(-inner,0);
    shape.lineTo(front,0);
    shape.lineTo(front,-.16);
    shape.bezierCurveTo(front-.04,-.29,front-.27,-.45,front-.44,-.48);
    shape.bezierCurveTo(-.20,-.54,-.43,-.49,-inner,-.49);
    shape.closePath();
    const thickness=inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn);
    const g=new THREE.ExtrudeGeometry(shape,{
      depth:thickness,steps:1,bevelEnabled:false,curveSegments:12,
    });
    g.translate(0,0,-thickness/2);
    // Shape X corresponds to roof projection (world +Z).
    g.rotateY(-Math.PI/2);
    g.computeVertexNormals();
    return g;
  },[front]);
  return <mesh geometry={geometry} position={[x,topY,frontZ]} castShadow receiveShadow>
    <meshStandardMaterial color={color} metalness={.4} roughness={.3}/>
  </mesh>;
}
