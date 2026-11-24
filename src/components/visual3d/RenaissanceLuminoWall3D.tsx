import * as THREE from 'three';
import type { P2 } from './Primitives';
import { Block,Beam } from './Primitives';

/**
 * Lumino wall concept based on Renaissance Dolce 2026 pp 16-17:
 * window bay mullions sit in a bottom receiver above a full-width solid
 * insulated knee wall. Window profile SKU dimensions and insulation R value
 * have not been supplied and are NOT represented as procurement accuracy.
 */
export function RenaissanceLuminoWall3D({id,from,to,bottom,topFrom,topTo,finish}:{
  id:'front'|'left'|'right'|'rear';from:P2;to:P2;bottom:number;
  topFrom:number;topTo:number;finish:string;
}){
  const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz);
  const lowTop=Math.min(topFrom,topTo);
  const height=lowTop-bottom-.14;
  if(length<2||height<4)return null;
  // Illustration height, not a manufacturer-certified insulated panel size.
  const kneeHeight=Math.min(2.25,Math.max(1.75,height*.29));
  const panes=Math.max(1,Math.ceil(length/2.3));
  const angle=-Math.atan2(dz,dx);
  const mid:P2=[(from[0]+to[0])/2,(from[1]+to[1])/2];
  const openingTop=bottom+height;
  const lowerPanelCenter=bottom+kneeHeight/2;
  const windowHeight=height-kneeHeight;
  const frameWidth=.085;
  const offset=(along:number):P2=>[from[0]+dx*along,from[1]+dz*along];
  return <group name={'lumino-insulated-kneewall-window-assembly-'+id}>
    {/* Continuous foam-core concept sandwiched between visible aluminum skins.
        Separate head and sill channels preserve the supplied section logic. */}
    <mesh name="continuous-insulated-solid-kneewall"
      position={[mid[0],lowerPanelCenter,mid[1]]}
      rotation={[0,angle,0]} castShadow receiveShadow>
      <boxGeometry args={[length,kneeHeight,.145]}/>
      <meshStandardMaterial color={finish} metalness={.24} roughness={.5}/>
    </mesh>
    <Beam start={from} end={to} height={bottom+.05}
      thickness={.14} depth={.17} color={finish}/>
    <Beam start={from} end={to} height={bottom+kneeHeight}
      thickness={.14} depth={.17} color={finish}/>
    <Beam start={from} end={to} height={openingTop}
      thickness={.14} depth={.17} color={finish}/>
    {Array.from({length:panes},(_,i)=>{
      const fromT=i/panes,toT=(i+1)/panes;
      const sideA=offset(fromT),sideB=offset(toT);
      const a=(fromT+toT)/2;
      const width=length/panes-.09;
      return <group key={'lumino-window-bay-'+i}>
        <mesh name="transparent-glazed-window-lite"
          position={[mid[0]+dx*(a-.5),bottom+kneeHeight+windowHeight/2,
            mid[1]+dz*(a-.5)]}
          rotation={[0,angle,0]}>
          <planeGeometry args={[Math.max(.1,width),Math.max(.1,windowHeight-.14)]}/>
          <meshPhysicalMaterial color="#a4bcca" transparent opacity={.38}
            metalness={.03} roughness={.13} depthWrite={false}
            side={THREE.DoubleSide}/>
        </mesh>
        {[sideA,sideB].map((pt,j)=><Block key={'window-frame-jamb-'+j}
          position={[pt[0],bottom+kneeHeight+windowHeight/2,pt[1]]}
          size={[frameWidth,windowHeight,frameWidth]}
          color={finish} metalness={.4}/>)}
      </group>;
    })}
    {/* Clipped ceiling infill needs a verified gable detail. No false
        engineered upper glazing is drawn above the lowest soffit. */}
  </group>;
}
