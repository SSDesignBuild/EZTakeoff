import { useEffect,useMemo } from 'react';
import * as THREE from 'three';
import { Block,type P2 } from './Primitives';
import {
  PCA_3068,PCA_PET_OPENINGS,pcaPetCompatibility,
  type PcaPetDoor,type PcaDoorModel,
} from '../../lib/pcaScreenDoorGeometry';
type DoorProps={
  from:P2;to:P2;bottom:number;finish:string;
  model:PcaDoorModel;pet:PcaPetDoor;
  kickPlateIn:number;hinge:'left'|'right';swing:'in'|'out';
};
export function PcaScreenDoor3D({from,to,bottom,finish,model,pet,kickPlateIn,hinge,swing}:DoorProps){
  const dx=to[0]-from[0],dz=to[1]-from[1];
  const run=Math.hypot(dx,dz),width=Math.min(run,PCA_3068.widthFt),height=PCA_3068.heightFt;
  const petModel=pcaPetCompatibility(model,pet)?pet:'none';
  const petDims=petModel!=='none'?PCA_PET_OPENINGS[petModel]:null;
  const pw=(petDims?.widthIn??0)/12,ph=(petDims?.heightIn??0)/12;
  const petBottom=.15;
  const kickH=Math.min(Math.max(0,kickPlateIn/12),height-.3);
  const solidHeight=Math.max(.07,kickH);
  const screenGeo=useMemo(()=>{
    const boundary=new THREE.Shape();
    const x=width/2-.09,y=.08,h=height-.18;
    boundary.moveTo(-x,y);boundary.lineTo(x,y);
    boundary.lineTo(x,y+h);boundary.lineTo(-x,y+h);boundary.closePath();
    if(petDims){
      const hole=new THREE.Path();
      const left=-pw/2,right=pw/2,low=petBottom,high=Math.min(height-.17,low+ph);
      hole.moveTo(left,low);hole.lineTo(left,high);hole.lineTo(right,high);
      hole.lineTo(right,low);hole.closePath();
      boundary.holes.push(hole);
    }
    return new THREE.ShapeGeometry(boundary);
  },[width,height,pw,ph,petDims]);
  useEffect(()=>()=>screenGeo.dispose(),[screenGeo]);
  const dark=finish.toLowerCase().includes('white')?'#373f43':'#293138';
  const hardware='#6d7375';
  return <group name={'pca-'+model+'-3068-opening-with-real-pet-door'}
    position={[(from[0]+to[0])/2,bottom,(from[1]+to[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]}>
    {/* 36x80 opening. The 2-3/4in stile presentation is illustrative;
        the selected PCA door is manufactured to measured order opening. */}
    {[-1,1].map(sign=><Block key={'pca-jamb-'+sign}
      position={[sign*(width/2-.065),height/2,0]}
      size={[.13,height,.16]} color={finish} metalness={.38}/>)}
    {[.065,height-.065].map((y,i)=><Block key={'pca-crossbar-'+i}
      position={[0,y,0]} size={[width,.13,.16]} color={finish} metalness={.38}/>)}
    <mesh geometry={screenGeo} position={[0,0,.009]} receiveShadow>
      <meshPhysicalMaterial color={dark} side={THREE.DoubleSide}
        transparent opacity={.26} depthWrite={false} roughness={.9}/>
    </mesh>
    {/* PCA A-100 installed horizontal pushbar. */}
    <Block position={[0,3.45,.055]} size={[width-.15,.15,.075]}
      color={finish} metalness={.30}/>
    {kickH>0&&<group name="PCA-option-kick-panel">
      {petDims?[-1,1].map(sign=>{
        const half=(width-pw)/4-.07;
        return <Block key={'split-kick-'+sign}
          position={[sign*(pw/2+half/2+.06),solidHeight/2,.042]}
          size={[Math.max(.05,half),solidHeight,.065]}
          color={finish} metalness={.36}/>;
      }):<Block position={[0,solidHeight/2,.042]}
        size={[width-.14,solidHeight,.065]} color={finish} metalness={.36}/>}
    </group>}
    {petDims&&<group name={'PCA-Magnador-'+petModel+'-pet-insert'}>
      {[-1,1].map(sign=><Block key={'pet-jamb-'+sign}
        position={[sign*(pw/2+.02),petBottom+ph/2,.08]}
        size={[.045,ph+.05,.065]} color={finish}/>)}
      {[petBottom,petBottom+ph].map((y,i)=><Block key={'pet-header-'+i}
        position={[0,y,.08]} size={[pw+.10,.05,.065]} color={finish}/>)}
      <mesh position={[0,petBottom+ph/2,.07]}>
        <planeGeometry args={[pw-.02,ph-.02]}/>
        <meshPhysicalMaterial color={finish} side={THREE.DoubleSide}
          transparent opacity={.76} roughness={.63}/>
      </mesh>
      {[-1,1].map(sign=><mesh key={'pet-lock-'+sign}
        position={[sign*(pw/2-.10),petBottom+.10,.11]}>
        <cylinderGeometry args={[.025,.025,.015,10]}/>
        <meshStandardMaterial color={hardware} metalness={.7}/>
      </mesh>)}
    </group>}
    {/* Hardware mounted opposite the selected hinge stile. */}
    {[1.8,height-1.8].map((y,i)=><Block key={'door-hinge-'+i}
      position={[(hinge==='left'?-1:1)*width/2,y,.12]}
      size={[.08,.15,.18]} color={hardware} metalness={.67}/>)}
    <Block position={[(hinge==='left'?1:-1)*(width/2-.17),3.4,.16]}
      size={[.075,.38,.10]} color={hardware} metalness={.70}/>
    <group name={'swing-'+swing}/>
  </group>;
}
