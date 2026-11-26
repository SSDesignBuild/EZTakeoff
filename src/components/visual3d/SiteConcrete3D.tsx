import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { concreteDecorativeGeometry,triangulateSiteConcretePolygon,
  type SiteConcreteAreaPlan } from '../../lib/siteConcrete';
import { resolveConcreteAppearance } from '../../lib/sikaConcreteCatalog';
import { createConcreteStampTexture } from '../../lib/concreteStampTexture';
import { siteConcreteBodyGeometry } from '../../lib/siteConcreteMesh';
import type { DeckPoint } from '../../lib/types';

function surfaceGeometry(faces:DeckPoint[][],center:readonly [number,number],
  uvAt:(p:DeckPoint,faceIndex:number)=>[number,number]){
  const positions:number[]=[],uvs:number[]=[],normals:number[]=[];
  faces.forEach((face,faceIndex)=>{
    for(const triangle of triangulateSiteConcretePolygon(face)){
      const [a,b,c]=triangle;
      const ccw=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>0;
      for(const point of ccw?[a,c,b]:triangle){
        positions.push(point.x-center[0],0,point.y-center[1]);
        uvs.push(...uvAt(point,faceIndex));normals.push(0,1,0);
      }
    }
  });
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return result;
}

function ConcreteSlab({area,center}:{area:SiteConcreteAreaPlan;center:readonly [number,number]}){
  const selected=resolveConcreteAppearance(area);
  const facePlan=useMemo(()=>concreteDecorativeGeometry(area),[area]);
  const fieldTexture=useMemo(()=>createConcreteStampTexture(selected.stamp,selected.color.swatch),
    [selected.stamp,selected.color.swatch]);
  const borderTexture=useMemo(()=>createConcreteStampTexture(selected.border,selected.borderColor.swatch),
    [selected.border,selected.borderColor.swatch]);
  const geometry=useMemo(()=>siteConcreteBodyGeometry(area,center),[area.points,area.thicknessIn,center]);
  const fieldGeometry=useMemo(()=>surfaceGeometry(facePlan.fieldPolygons,center,p=>[
    (p.x-area.points[0].x)/fieldTexture.scale.widthFt,
    (p.y-area.points[0].y)/fieldTexture.scale.depthFt]),
    [facePlan,center,area.points,fieldTexture.scale]);
  const borderGeometry=useMemo(()=>surfaceGeometry(facePlan.borderPieces.map(piece=>piece.points),center,(p,i)=>{
    const {origin,direction}=facePlan.borderPieces[i],dx=p.x-origin.x,dy=p.y-origin.y;
    return [(dx*direction.x+dy*direction.y)/borderTexture.scale.widthFt,
      (-dx*direction.y+dy*direction.x)/borderTexture.scale.depthFt];
  }),[facePlan,center,borderTexture.scale]);
  useEffect(()=>()=>{geometry.dispose();fieldGeometry.dispose();borderGeometry.dispose();},
    [geometry,fieldGeometry,borderGeometry]);
  useEffect(()=>()=>fieldTexture.texture?.dispose(),[fieldTexture]);
  useEffect(()=>()=>borderTexture.texture?.dispose(),[borderTexture]);
  return <group name={'drawn-concrete-'+area.id} userData={{concreteAreaId:area.id,
    stampId:selected.stamp.id,colorId:selected.color.id,borderStampId:selected.border.id,
    borderColorId:selected.borderColor.id,borderWidthIn:selected.borderWidthIn}}>
    <mesh name={'concrete-slab-body-'+area.id} geometry={geometry}
    position={[0,area.elevationFt-area.thicknessIn/12,0]} castShadow receiveShadow>
    <meshStandardMaterial color="#aaa9a5" roughness={.96} metalness={0}/>
    </mesh>
    <mesh name={'concrete-field-finish-'+area.id} geometry={fieldGeometry}
      position={[0,area.elevationFt,0]} receiveShadow>
      <meshStandardMaterial color={fieldTexture.texture?'#ffffff':selected.color.swatch}
        map={fieldTexture.texture} bumpMap={fieldTexture.texture} bumpScale={selected.stamp.id==='plain'?.002:.008}
        roughness={.86} metalness={0}/>
    </mesh>
    {facePlan.borderPieces.length>0&&<mesh name={'concrete-border-finish-'+area.id} geometry={borderGeometry}
      position={[0,area.elevationFt,0]} receiveShadow>
      <meshStandardMaterial color={borderTexture.texture?'#ffffff':selected.borderColor.swatch}
        map={borderTexture.texture} bumpMap={borderTexture.texture} bumpScale={.008}
        roughness={.86} metalness={0}/>
    </mesh>}
  </group>;
}
export function SiteConcrete3D({areas,center}:{
  areas:SiteConcreteAreaPlan[];center:readonly [number,number];
}){
  return <group name="site-concrete-from-drawn-polygons">
    {areas.map(area=><ConcreteSlab key={area.id} area={area} center={center}/>)}
  </group>;
}
