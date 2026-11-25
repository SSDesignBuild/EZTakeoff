import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SiteConcreteAreaPlan } from '../../lib/siteConcrete';

function ConcreteSlab({area,center}:{area:SiteConcreteAreaPlan;center:readonly [number,number]}){
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();
    area.points.forEach((point,index)=>{
      const x=point.x-center[0],y=-(point.y-center[1]);
      if(index===0)shape.moveTo(x,y);else shape.lineTo(x,y);
    });
    shape.closePath();
    const result=new THREE.ExtrudeGeometry(shape,{
      depth:area.thicknessIn/12,steps:1,bevelEnabled:false,curveSegments:1,
    });
    result.rotateX(-Math.PI/2);
    return result;
  },[area.points,area.thicknessIn,center]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh name={'drawn-concrete-'+area.id} geometry={geometry}
    position={[0,area.elevationFt-area.thicknessIn/12,0]} castShadow receiveShadow>
    <meshStandardMaterial color="#aaa9a5" roughness={.96} metalness={0}/>
  </mesh>;
}
export function SiteConcrete3D({areas,center}:{
  areas:SiteConcreteAreaPlan[];center:readonly [number,number];
}){
  return <group name="site-concrete-from-drawn-polygons">
    {areas.map(area=><ConcreteSlab key={area.id} area={area} center={center}/>)}
  </group>;
}
