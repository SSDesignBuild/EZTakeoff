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
type RoutedBend={
  geometry:THREE.ExtrudeGeometry;
  type:'A'|'B';location:string;
};
/** Measured nominal 2 x 3-in hollow downspout section, with folded sheet wall. */
function makeRectangularDownspoutProfile(){
  const width=inchToFoot(2),depth=inchToFoot(3),wall=inchToFoot(.045);
  const outer=new THREE.Shape();
  outer.moveTo(-width/2,-depth/2);outer.lineTo(width/2,-depth/2);
  outer.lineTo(width/2,depth/2);outer.lineTo(-width/2,depth/2);outer.closePath();
  const hole=new THREE.Path();
  hole.moveTo(-width/2+wall,-depth/2+wall);
  hole.lineTo(-width/2+wall,depth/2-wall);
  hole.lineTo(width/2-wall,depth/2-wall);
  hole.lineTo(width/2-wall,-depth/2+wall);hole.closePath();
  outer.holes.push(hole);
  return outer;
}
function getElbowRadii(layout:DownspoutLayout):Map<number,number>{
  const radii=new Map<number,number>();
  for(const elbow of layout.elbows){
    const i=elbow.atIndex;
    if(i<=0||i>=layout.points.length-1)continue;
    const incoming=new THREE.Vector3(...layout.points[i]).sub(
      new THREE.Vector3(...layout.points[i-1]));
    const outgoing=new THREE.Vector3(...layout.points[i+1]).sub(
      new THREE.Vector3(...layout.points[i]));
    if(incoming.length()<.04||outgoing.length()<.04)continue;
    const dot=incoming.clone().normalize().dot(outgoing.clone().normalize());
    if(dot>.995)continue;
    // Proper curved A/B elbow, joined to straight factory-like cut lengths.
    // Curved fitting length is kept inside the adjacent real pipe runs.
    const radius=Math.min(.24,incoming.length()*.29,outgoing.length()*.29);
    if(radius>.012)radii.set(i,radius);
  }
  return radii;
}
/**
 * Each long run is STRAIGHT rectangular stock. Tangency cuts avoid an
 * ugly elbow/pipe overlap, rather than assembling several floating cubes.
 */
function routedDownspoutSections(layout:DownspoutLayout,
  radii:Map<number,number>):RoutedSection[]{
  const profile=makeRectangularDownspoutProfile();
  return layout.points.slice(1).flatMap((p,index)=>{
    const a=new THREE.Vector3(...layout.points[index]);
    const b=new THREE.Vector3(...p);
    const direction=b.clone().sub(a),length=direction.length();
    if(length<.03)return [];
    const unit=direction.normalize();
    const from=a.clone().addScaledVector(unit,radii.get(index)??0);
    const to=b.clone().addScaledVector(unit,-(radii.get(index+1)??0));
    const cutLen=to.distanceTo(from);
    if(cutLen<.02)return [];
    const g=new THREE.ExtrudeGeometry(profile,{depth:cutLen+.008,steps:1,
      bevelEnabled:false,curveSegments:1});
    g.translate(0,0,-(cutLen+.008)/2);g.computeVertexNormals();
    return [{geometry:g,
      position:from.add(to).multiplyScalar(.5).toArray() as [number,number,number],
      rotation:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),unit)}];
  });
}
/**
 * True swept aluminum elbow with circular centerline and hollow 2x3 section.
 * A and B are mirror-oriented by incoming/outgoing vectors, not drawn as
 * placeholder solid rectangular boxes.
 */
function routedDownspoutElbows(layout:DownspoutLayout,
  radii:Map<number,number>):RoutedBend[]{
  const profile=makeRectangularDownspoutProfile();
  return layout.elbows.flatMap(elbow=>{
    const index=elbow.atIndex,trim=radii.get(index);
    if(!trim||index<1||index>=layout.points.length-1)return [];
    const p=new THREE.Vector3(...layout.points[index]);
    const prev=new THREE.Vector3(...layout.points[index-1]);
    const next=new THREE.Vector3(...layout.points[index+1]);
    const a=p.clone().addScaledVector(p.clone().sub(prev).normalize(),-trim);
    const b=p.clone().addScaledVector(next.clone().sub(p).normalize(),trim);
    // Quadratic elbow joins the two miter tangent ends and stays entirely
    // within the cover/deck envelope. The mesh has hollow sheet thickness.
    const curve=new THREE.QuadraticBezierCurve3(a,p,b);
    const geometry=new THREE.ExtrudeGeometry(profile,{
      extrudePath:curve,steps:12,bevelEnabled:false,curveSegments:12,
    });
    geometry.computeVertexNormals();
    return [{geometry,type:elbow.type,location:elbow.location}];
  });
}
export function RenaissanceDownspout({layout,color}:{
  layout:DownspoutLayout;color:string;
}){
  const geometries=useMemo(()=>{
    const radii=getElbowRadii(layout);
    return {straight:routedDownspoutSections(layout,radii),
      elbows:routedDownspoutElbows(layout,radii)};
  },[layout]);
  useEffect(()=>()=>{geometries.straight.forEach(section=>section.geometry.dispose());
    geometries.elbows.forEach(bend=>bend.geometry.dispose());},[geometries]);
  return <group name="post-mounted-rectangular-downspout-with-A-and-B-elbows">
    {geometries.straight.map((section,i)=><mesh key={'straight-pipe-section-'+i}
      geometry={section.geometry} position={section.position}
      quaternion={section.rotation} castShadow receiveShadow>
      <meshStandardMaterial color={color} side={THREE.DoubleSide}
        metalness={.39} roughness={.32}/>
    </mesh>)}
    {geometries.elbows.map((bend,i)=><mesh key={'true-elbow-'+i}
      name={'real-'+bend.type+'-elbow-'+bend.location}
      geometry={bend.geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={.42} roughness={.30}
        side={THREE.DoubleSide}/>
    </mesh>)}
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
export function RenaissanceCurvedTrussEnd({x,frontZ,topY,projectionFt,pitchInPerFt=0,color,endStyle='curved'}:{
  x:number;frontZ:number;topY:number;projectionFt:number;pitchInPerFt?:number;color:string;
  endStyle?:'straight'|'curved';
}){
  // Tail begins at the outside header face; curved end is a visually distinct
  // reverse S-inflection rather than a single rounded edge. It is NOT a
  // manufacturer dimensioned CAD cut.
  const front=Math.max(.06,Math.min(1.25,projectionFt));
  const pitch=pitchInPerFt/12;
  const geometry=useMemo(()=>{
    const top=(z:number)=>-pitch*z;
    const shape=new THREE.Shape();
    shape.moveTo(0,top(0));
    shape.lineTo(front,top(front));
    if(endStyle==='straight'){
      shape.lineTo(front,top(front)-.45);
      shape.lineTo(0,top(0)-.45);
    }else{
      const at=(u:number,drop:number)=>top(front*u)-drop;
      // Roll over the tip, recess at the center and swing back to the root:
      // three connected cubic arcs form a recognizable S-shaped cut.
      shape.lineTo(front,top(front)-.12);
      shape.bezierCurveTo(front*.94,at(.94,.19),
        front*.86,at(.86,.39),front*.68,at(.68,.39));
      shape.bezierCurveTo(front*.51,at(.51,.39),
        front*.48,at(.48,.19),front*.34,at(.34,.20));
      shape.bezierCurveTo(front*.20,at(.20,.23),
        front*.14,at(.14,.45),0,at(0,.45));
    }
    shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{
      depth:inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn),
      steps:1,bevelEnabled:false,curveSegments:12,
    });
    g.translate(0,0,-inchToFoot(RENAISSANCE_TRUSS.outsideWidthIn)/2);
    g.rotateY(-Math.PI/2);g.computeVertexNormals();
    return g;
  },[front,pitch,endStyle]);
  return <mesh geometry={geometry} position={[x,topY,frontZ]} castShadow receiveShadow>
    <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={.4} roughness={.3}/>
  </mesh>;
}
