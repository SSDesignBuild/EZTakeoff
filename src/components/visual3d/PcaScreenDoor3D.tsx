import { useEffect,useMemo } from 'react';
import * as THREE from 'three';
import { Block,type P2 } from './Primitives';
import {
  PCA_3068,PCA_PET_OPENINGS,PCA_PET_FRAME,
  effectivePcaKickPlateIn,pcaPetCompatibility,
  type PcaPetDoor,type PcaDoorModel,
} from '../../lib/pcaScreenDoorGeometry';

type DoorProps={
  from:P2;to:P2;bottom:number;finish:string;
  model:PcaDoorModel;pet:PcaPetDoor;
  kickPlateIn:number;hinge:'left'|'right';swing:'in'|'out';
};
const IN=1/12;

/** PCA Magnador is installed THROUGH a continuous full-width kick panel.
 * Never paint independent left/right rectangles with empty space above the flap.
 * The panel, the pet-frame cutout and the mesh all share one opening datum.
 */
export function PcaScreenDoor3D({from,to,bottom,finish,model,pet,kickPlateIn,hinge,swing}:DoorProps){
  const dx=to[0]-from[0],dz=to[1]-from[1];
  const run=Math.hypot(dx,dz),width=Math.min(run,PCA_3068.widthFt),height=PCA_3068.heightFt;
  const petModel=pcaPetCompatibility(model,pet)?pet:'none';
  const petDims=petModel==='none'?null:PCA_PET_OPENINGS[petModel];
  const frame=petModel==='none'?null:PCA_PET_FRAME[petModel];
  const pw=(petDims?.widthIn??0)*IN,ph=(petDims?.heightIn??0)*IN;
  const plateIn=effectivePcaKickPlateIn(petModel,kickPlateIn);
  const kickH=plateIn*IN;
  // The molded frame sits INSIDE the solid kick panel, even for 24in large.
  // Opening is inset within the mold's actual external frame and saw cutout.
  const frameBottom=.125*IN;
  const cutLow=frameBottom+((frame?.outerHeightIn??0)-(frame?.cutHeightIn??0))*.5*IN;
  const flapLow=frameBottom+((frame?.outerHeightIn??0)-(petDims?.heightIn??0))*.5*IN;
  const cutW=(frame?.cutWidthIn??0)*IN,cutH=(frame?.cutHeightIn??0)*IN;
  const outerW=(frame?.outerWidthIn??0)*IN,outerH=(frame?.outerHeightIn??0)*IN;

  const screenGeo=useMemo(()=>{
    const boundary=new THREE.Shape();
    const w=width/2-.09,lo=Math.max(.13,kickH),hi=height-.08;
    if(hi<=lo)return null;
    boundary.moveTo(-w,lo);boundary.lineTo(w,lo);boundary.lineTo(w,hi);
    boundary.lineTo(-w,hi);boundary.closePath();
    return new THREE.ShapeGeometry(boundary);
  },[width,height,kickH]);

  const kickGeo=useMemo(()=>{
    if(kickH<=0)return null;
    const shape=new THREE.Shape(),left=-width/2+.07,right=width/2-.07;
    shape.moveTo(left,.065);shape.lineTo(right,.065);
    shape.lineTo(right,kickH);shape.lineTo(left,kickH);shape.closePath();
    if(frame){
      const hole=new THREE.Path();
      const l=-cutW/2,r=cutW/2,b=cutLow,t=cutLow+cutH;
      hole.moveTo(l,b);hole.lineTo(l,t);hole.lineTo(r,t);
      hole.lineTo(r,b);hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape);
  },[width,kickH,frame,cutW,cutH,cutLow]);
  useEffect(()=>()=>{
    screenGeo?.dispose();kickGeo?.dispose();
  },[screenGeo,kickGeo]);
  const dark=finish.toLowerCase().includes('white')?'#373f43':'#293138';
  const hardware='#6d7375';
  return <group name={'pca-'+model+'-3068-opening-with-real-pet-door'}
    position={[(from[0]+to[0])/2,bottom,(from[1]+to[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]}>
    {[-1,1].map(sign=><Block key={'pca-jamb-'+sign}
      position={[sign*(width/2-.065),height/2,0]}
      size={[.13,height,.16]} color={finish} metalness={.38}/>)}
    {[.065,height-.065].map((y,i)=><Block key={'pca-crossbar-'+i}
      position={[0,y,0]} size={[width,.13,.16]} color={finish} metalness={.38}/>)}
    {screenGeo&&<mesh geometry={screenGeo} position={[0,0,.009]} receiveShadow
      name="pca-upper-screen-above-solid-kick">
      <meshPhysicalMaterial color={dark} side={THREE.DoubleSide}
        transparent opacity={.26} depthWrite={false} roughness={.9}/>
    </mesh>}
    <Block position={[0,3.45,.055]} size={[width-.15,.15,.075]}
      color={finish} metalness={.30}/>
    {kickGeo&&<mesh name={'pca-continuous-full-width-kick-panel-'+plateIn+'in'}
      geometry={kickGeo} position={[0,0,.045]} castShadow receiveShadow>
      <meshStandardMaterial color={finish} side={THREE.DoubleSide}
        metalness={.32} roughness={.52}/>
    </mesh>}
    {frame&&petDims&&<group name={'PCA-Magnador-'+petModel+'-pet-insert'}>
      {/* The real molded outer frame surrounds the manufacturer's saw
          cutout, which is LARGER than the pass-through pet flap. */}
      {[-1,1].map(sign=><Block key={'pet-outer-jamb-'+sign}
        position={[sign*(outerW/2-.026),frameBottom+outerH/2,.095]}
        size={[Math.max(.05,(outerW-cutW)/2),outerH,.065]}
        color={finish} metalness={.14}/>)}
      {[-1,1].map((sign,i)=><Block key={'pet-outer-header-'+i}
        position={[0,frameBottom+(sign===-1?.027:outerH-.027),.096]}
        size={[outerW,.055,.065]} color={finish} metalness={.14}/>)}
      <mesh position={[0,flapLow+ph/2,.105]} name="magnet-held-pet-flap">
        <planeGeometry args={[pw,ph]}/>
        <meshPhysicalMaterial color={finish} side={THREE.DoubleSide}
          transparent opacity={.76} roughness={.63}/>
      </mesh>
      {[-1,1].map(sign=><mesh key={'pet-lock-'+sign}
        position={[sign*(pw/2-.10),flapLow+.10,.14]}>
        <cylinderGeometry args={[.025,.025,.015,10]}/>
        <meshStandardMaterial color={hardware} metalness={.7}/>
      </mesh>)}
    </group>}
    {[1.8,height-1.8].map((y,i)=><Block key={'door-hinge-'+i}
      position={[(hinge==='left'?-1:1)*width/2,y,.12]}
      size={[.08,.15,.18]} color={hardware} metalness={.67}/>)}
    <Block position={[(hinge==='left'?1:-1)*(width/2-.17),3.4,.16]}
      size={[.075,.38,.10]} color={hardware} metalness={.70}/>
    <group name={'swing-'+swing}/>
  </group>;
}
