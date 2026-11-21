import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  inchToFoot,type RenaissanceExtrusionProfile,
  RENAISSANCE_ROOF_C_CHANNEL,RENAISSANCE_TRUSS,RENAISSANCE_SHADE_TUBE,
} from '../../lib/renaissanceManufacturer';
import type { P2 } from './Primitives';
import type { GutterRun } from '../../lib/renaissanceGutterGeometry';
import { architecturalGutterOutlineFt,miterAlongFt } from '../../lib/renaissanceGutterGeometry';
import type { DownspoutLayout } from '../../lib/renaissanceDownspoutRouting';

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
 * Actual rectangular 2x3-in hollow aluminum downspout geometry, routed
 * through paired A/B elbows and attached to structural posts with straps.
 * The 75-degree elbow radius and the field routing are visual approximations,
 * not a manufacturer-certified elbow SKU or installation quantity.
 */
type RoutedSection={
  geometry:THREE.ExtrudeGeometry;
  position:[number,number,number];rotation:THREE.Quaternion;
};
/**
 * Production downspouts have straight 2x3-in aluminum tube sections and
 * separate A/B elbows. A global Catmull-Rom curve causes warped soft hoses,
 * especially at the eave: each section below is now truly straight.
 */
function routedDownspoutSections(layout:DownspoutLayout):RoutedSection[]{
  const w=inchToFoot(2),d=inchToFoot(3),t=inchToFoot(.045);
  const outer=new THREE.Shape();
  outer.moveTo(-w/2,-d/2);outer.lineTo(w/2,-d/2);
  outer.lineTo(w/2,d/2);outer.lineTo(-w/2,d/2);outer.closePath();
  const hole=new THREE.Path();
  hole.moveTo(-w/2+t,-d/2+t);hole.lineTo(-w/2+t,d/2-t);
  hole.lineTo(w/2-t,d/2-t);hole.lineTo(w/2-t,-d/2+t);hole.closePath();
  outer.holes.push(hole);
  return layout.points.slice(1).flatMap((point,i)=>{
    const from=new THREE.Vector3(...layout.points[i]);
    const to=new THREE.Vector3(...point);
    const direction=to.clone().sub(from),length=direction.length();
    if(length<.02)return [];
    // Real hollow rectangular extrusion, including terminal open ends.
    const g=new THREE.ExtrudeGeometry(outer,{
      depth:length+.014,steps:1,bevelEnabled:false,curveSegments:1,
    });
    g.translate(0,0,-(length+.014)/2);
    g.computeVertexNormals();
    const rotation=new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0,0,1),direction.normalize());
    return [{geometry:g,
      position:from.add(to).multiplyScalar(.5).toArray() as [number,number,number],
      rotation}];
  });
}
export function RenaissanceDownspout({layout,color}:{
  layout:DownspoutLayout;color:string;
}){
  const sections=useMemo(()=>routedDownspoutSections(layout),[layout]);
  useEffect(()=>()=>sections.forEach(section=>section.geometry.dispose()),[sections]);
  return <group name="post-mounted-rectangular-downspout-with-A-and-B-elbows">
    {sections.map((section,i)=><mesh key={'straight-pipe-section-'+i}
      geometry={section.geometry} position={section.position}
      quaternion={section.rotation} castShadow receiveShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide}
        metalness={.38} roughness={.32}/>
    </mesh>)}
    {/* A and B elbow ferrules are modeled at the actual transitions,
        not at arbitrary locations on a dangling vertical cylinder. */}
    {layout.elbows.map((elbow,i)=>{
      const p=layout.points[elbow.atIndex];
      const before=layout.points[Math.max(0,elbow.atIndex-1)];
      const after=layout.points[Math.min(layout.points.length-1,elbow.atIndex+1)];
      const center=new THREE.Vector3(...p);
      const directions=[before,after].map(other=>
        new THREE.Vector3(other[0]-p[0],other[1]-p[1],other[2]-p[2]).normalize());
      return <group key={'elbow-'+i} name={'downspout-'+elbow.type+'-elbow-'+elbow.location}>
        {directions.map((vector,j)=>{
          const q=new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0,0,1),vector);
          const pos=center.clone().addScaledVector(vector,inchToFoot(.7)).toArray() as [number,number,number];
          return <mesh key={'die-cast-sleeve-'+j} position={pos}
            quaternion={q} castShadow receiveShadow>
            <boxGeometry args={[inchToFoot(2.12),inchToFoot(3.12),inchToFoot(1.8)]}/>
            <meshStandardMaterial color={color} metalness={.44} roughness={.30}/>
          </mesh>;
        })}
      </group>;
    })}
    {/* Straps terminate on the actual nearest cover/deck POST centers. */}
    {layout.straps.map((strap,i)=>{
      const [x,y,z]=strap.at,[px,pz]=strap.post;
      const depth=Math.hypot(x-px,z-pz);
      return <group key={'post-strap-'+i} name={'downspout-attached-'+strap.kind+'-post'}>
        <mesh position={[x,y,z]} castShadow>
          <boxGeometry args={[inchToFoot(2.6),inchToFoot(.45),inchToFoot(3.35)]}/>
          <meshStandardMaterial color={color} metalness={.46} roughness={.31}/>
        </mesh>
        <mesh position={[(x+px)/2,y,(z+pz)/2]}
          rotation={[0,-Math.atan2(z-pz,x-px),0]} castShadow>
          <boxGeometry args={[Math.max(.03,depth),.05,.055]}/>
          <meshStandardMaterial color={color} metalness={.45} roughness={.31}/>
        </mesh>
        {[-1,1].map(sign=><mesh key={'strap-screw-'+sign}
          position={[x+sign*inchToFoot(.82),y,z+inchToFoot(1.8)]}>
          <sphereGeometry args={[inchToFoot(.075),8,5]}/>
          <meshStandardMaterial color="#666a6d" metalness={.8} roughness={.3}/>
        </mesh>)}
      </group>;
    })}
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
export function RenaissanceCurvedTrussEnd({x,frontZ,topY,projectionFt,pitchInPerFt=0,color}:{
  x:number;frontZ:number;topY:number;projectionFt:number;pitchInPerFt?:number;color:string;
}){
  // The tail begins at a short lap behind the front header and terminates
  // at the TRUE eave. It does not recreate a 1.65ft decorative plank over
  // a full-length truss, which previously made overlapping dark spikes.
  const front=Math.max(.06,Math.min(1.25,projectionFt));
  const inner=Math.min(.30,front*.5+.12);
  const pitch=pitchInPerFt/12;
  const geometry=useMemo(()=>{
    const top=(z:number)=>-pitch*z;
    const shape=new THREE.Shape();
    shape.moveTo(-inner,top(-inner));
    shape.lineTo(front,top(front));
    shape.lineTo(front,top(front)-.12);
    shape.bezierCurveTo(front-.08,top(front)-.26,
      front-.25,top(front)-.46,front-.43,top(front)-.48);
    shape.bezierCurveTo(-.08,top(-.08)-.48,-.23,top(-.20)-.46,
      -inner,top(-inner)-.45);
    shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{
      depth:inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn),
      steps:1,bevelEnabled:false,curveSegments:12,
    });
    g.translate(0,0,-inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn)/2);
    g.rotateY(-Math.PI/2);g.computeVertexNormals();
    return g;
  },[front,inner,pitch]);
  return <mesh geometry={geometry} position={[x,topY,frontZ]} castShadow receiveShadow>
    <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={.4} roughness={.3}/>
  </mesh>;
}
