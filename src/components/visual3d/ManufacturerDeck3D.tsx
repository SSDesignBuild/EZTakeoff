import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getDeckVisualProduct } from '../../data/visualCatalog';
import { surfaceStrips, breakerVisualStrips } from '../../lib/visualGeometry';
import { planMiteredPictureFrames } from '../../lib/deckMiterGeometry';
import { resolvePictureFrameMaterials, resolveBreakerBoardMaterials, resolveFasciaMaterial, resolveStairSideFasciaMaterial } from '../../lib/deckTrimSelection';
import { Beam, type P2 } from './Primitives';
import { DeckStructure3D } from './DeckStructure3D';
import { DeckStairAssembly3D } from './DeckStairAssembly3D';
import { DeckSkirting3D } from './DeckSkirting3D';
import { ManufacturerRailing3D } from './ManufacturerRailing3D';
import { RenaissanceCover3D } from './RenaissanceCover3D';

/** Loads first-party Netlify-cached manufacturer photographs, not generated hue. */
function useManufacturerTexture(name:unknown){
  const sample=getDeckVisualProduct(name);
  const [map,setMap]=useState<THREE.Texture|null>(null);
  const [missing,setMissing]=useState(false);
  useEffect(()=>{
    let alive=true;
    let texture:THREE.Texture|null=null;
    const image=new Image();
    let completed=false;
    let deadline:ReturnType<typeof setTimeout>|null=null;
    setMap(null);setMissing(!sample);
    if(!sample)return ()=>{alive=false;};
    const clear=()=>{if(deadline!==null){clearTimeout(deadline);deadline=null;}};
    const fail=()=>{
      if(!alive||completed)return;
      completed=true;clear();setMap(null);setMissing(true);
      image.onload=null;image.onerror=null;
      image.removeAttribute('src'); // abort a stalled browser image delivery
    };
    image.decoding='async';
    image.onload=()=>{
      if(!alive||completed)return;
      completed=true;clear();
      // The very same first-party photograph used by the product card now
      // becomes the true top-surface map. Do not tint it with generic colors.
      texture=new THREE.Texture(image);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=THREE.RepeatWrapping;
      texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=8;
      texture.repeat.set(1,1);
      texture.needsUpdate=true;
      setMap(texture);setMissing(false);
    };
    image.onerror=fail;
    deadline=setTimeout(fail,8500);
    image.src=sample.swatch;
    return ()=>{
      alive=false;clear();
      image.onload=null;image.onerror=null;
      if(!completed)image.removeAttribute('src');
      texture?.dispose();
    };
  },[sample?.swatch]);
  return {map,missing,hasVerifiedSource:!!sample};
}
function PolygonSubstrate({model,center,deckHeight}:{model:DeckModel;center:P2;deckHeight:number}){
  const geo=useMemo(()=>{
    const shape=new THREE.Shape();
    model.points.forEach((point,i)=>{
      const x=point.x-center[0],y=-(point.y-center[1]);
      if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
    });
    shape.closePath();
    const mesh=new THREE.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:false,curveSegments:1,steps:1});
    mesh.rotateX(-Math.PI/2);
    return mesh;
  },[model.points,center]);
  useEffect(()=>()=>geo.dispose(),[geo]);
  return <mesh geometry={geo} position={[0,deckHeight-.21,0]} castShadow receiveShadow>
    <meshStandardMaterial color="#504d45" roughness={.88}/>
  </mesh>;
}
function VisibleDeckBoards({model,center,height,boardName}:{
  model:DeckModel;center:P2;height:number;boardName:unknown;
}){
  const strips=useMemo(()=>surfaceStrips(model),[model]);
  const {map,missing}=useManufacturerTexture(boardName);
  const ref=useRef<THREE.InstancedMesh>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const d=new THREE.Object3D();
    strips.forEach((strip,i)=>{
      d.position.set(strip.x-center[0],height+.015,strip.z-center[1]);
      d.rotation.set(0,strip.axis==='z'?Math.PI/2:0,0);
      d.scale.set(strip.lengthFt,.095,strip.widthFt);
      d.updateMatrix();
      ref.current!.setMatrixAt(i,d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[strips,center,height]);
  if(!strips.length)return null;
  return <group name={missing?'decking-needs-manufacturer-texture':'genuine-manufacturer-board-texture'}>
    <instancedMesh ref={ref} args={[undefined,undefined,strips.length]} castShadow receiveShadow>
      <boxGeometry args={[1,1,1]}/>
      {map
        ? <>
          <meshStandardMaterial attach="material-0" color="#ada99f" map={map} roughness={.78}/>
          <meshStandardMaterial attach="material-1" color="#ada99f" map={map} roughness={.78}/>
          <meshBasicMaterial attach="material-2" color="#ffffff" map={map} toneMapped={false}/>
          <meshStandardMaterial attach="material-3" color="#8b8277" roughness={.85}/>
          <meshStandardMaterial attach="material-4" color="#ada99f" map={map} roughness={.78}/>
          <meshStandardMaterial attach="material-5" color="#ada99f" map={map} roughness={.78}/>
        </>
        : <meshStandardMaterial color="#bfc5c7" roughness={.78} metalness={0}/>}
    </instancedMesh>
  </group>;
}
/**
 * Uses the SAME manufacturer top-surface photograph/material pipeline as
 * VisibleDeckBoards. A frame board isn't a white default Beam proxy anymore.
 */
function DeckTrimBeam({start,end,height,texture,color}:{
  start:P2;end:P2;height:number;texture:THREE.Texture|null;color:string;
}){
  const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz);
  if(length<.005)return null;
  return <mesh position={[(start[0]+end[0])/2,height,(start[1]+end[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
    <boxGeometry args={[length,.095,.44]}/>
    {texture?<>
      <meshStandardMaterial attach="material-0" color="#ffffff" map={texture} roughness={.78}/>
      <meshStandardMaterial attach="material-1" color="#ffffff" map={texture} roughness={.78}/>
      <meshBasicMaterial attach="material-2" color="#ffffff" map={texture} toneMapped={false}/>
      <meshStandardMaterial attach="material-3" color="#847d75" roughness={.83}/>
      <meshStandardMaterial attach="material-4" color="#ffffff" map={texture} roughness={.78}/>
      <meshStandardMaterial attach="material-5" color="#ffffff" map={texture} roughness={.78}/>
    </>:<meshStandardMaterial color={color} roughness={.82}/>}
  </mesh>;
}
/**
 * Real polygon-mitered 5.5-inch picture-frame courses, not offset rectangular
 * beams with exposed square corners. Adjacent ends share the exact polygon
 * corner miter and square off where a house-facing course was omitted.
 */
function BorderBoards({model,center,deckHeight,maps,colors}:{
  model:DeckModel;center:P2;deckHeight:number;
  maps:(THREE.Texture|null)[];colors:string[];
}){
  const outlines=useMemo(()=>planMiteredPictureFrames(
    model.points,model.pictureFrameSegments,model.pictureFrameCount),
    [model.points,model.pictureFrameSegments,model.pictureFrameCount]);
  const geometries=useMemo(()=>outlines.map(strip=>{
    const s=new THREE.Shape();
    strip.corners.forEach(([x,z],i)=>{
      if(i===0)s.moveTo(x-center[0],-(z-center[1]));
      else s.lineTo(x-center[0],-(z-center[1]));
    });
    s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{
      depth:.095,bevelEnabled:false,curveSegments:1,steps:1,
    });
    g.rotateX(-Math.PI/2);g.computeVertexNormals();
    return {strip,geometry:g};
  }),[outlines,center]);
  useEffect(()=>()=>geometries.forEach(item=>item.geometry.dispose()),[geometries]);
  return <group name="miter-cut-authentic-picture-frame-courses">
    {geometries.map(({strip,geometry})=><mesh key={'miter-'+strip.edgeIndex+'-'+strip.course}
      geometry={geometry} position={[0,deckHeight+.015-.0475,0]} castShadow receiveShadow>
      {maps[strip.course]
        ?<meshBasicMaterial color="#ffffff" map={maps[strip.course]} toneMapped={false} side={THREE.DoubleSide}/>
        :<meshStandardMaterial color={colors[strip.course]??'#a5a29d'}
          side={THREE.DoubleSide} roughness={.81}/>}
    </mesh>)}
  </group>;
}
/** Cross-field breaker courses use their selected real manufacturer swatch. */
function BreakerBoards({model,center,height,maps,colors}:{
  model:DeckModel;center:P2;height:number;maps:(THREE.Texture|null)[];
  colors:string[];
}){
  const strips=useMemo(()=>breakerVisualStrips(model),[model]);
  if(!strips.length)return null;
  return <group name="independently-selected-perpendicular-breaker-boards">
    {strips.map((strip,i)=>{
      const start:P2=strip.axis==='x'
        ?[strip.startFt-center[0],strip.z-center[1]]
        :[strip.x-center[0],strip.startFt-center[1]];
      const end:P2=strip.axis==='x'
        ?[strip.endFt-center[0],strip.z-center[1]]
        :[strip.x-center[0],strip.endFt-center[1]];
      return <DeckTrimBeam key={'breaker-course-'+strip.course+'-'+i}
        start={start} end={end} height={height+.015}
        texture={maps[strip.course]??null} color={colors[strip.course]??'#a1a6a9'}/>;
    })}
  </group>;
}
function DeckFascia({model,center,height,texture}:{model:DeckModel;center:P2;height:number;texture:THREE.Texture|null}){
  const rimDepth=(model.joistSize==='2x12'?11.25:model.joistSize==='2x10'?9.25:7.25)/12;
  return <group name="full-depth-deck-fascia">
    {model.exposedSegments.map(edge=><Beam key={'fascia-'+edge.index}
      start={[edge.start.x-center[0],edge.start.y-center[1]]}
      end={[edge.end.x-center[0],edge.end.y-center[1]]}
      height={height-.10-rimDepth/2} thickness={rimDepth+.05} depth={.076}
      color="#a49c90" texture={texture}/>)}
  </group>;
}
export function ManufacturerDeck3D({model,project,center,deckHeight,covered=true,lowerTier=false}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;covered?:boolean;lowerTier?:boolean;
}){
  const selected=getDeckVisualProduct(project.values.deckingMaterial);
  const borderNames=resolvePictureFrameMaterials(project.values);
  const {map:borderMap1}=useManufacturerTexture(borderNames[0]);
  const {map:borderMap2}=useManufacturerTexture(borderNames[1]);
  const {map:borderMap3}=useManufacturerTexture(borderNames[2]);
  const borderMaps=[borderMap1,borderMap2,borderMap3];
  const borderColors=borderNames.map(name=>
    getDeckVisualProduct(name)?'#99948a':'#a1a6a9');
  const breakerNames=resolveBreakerBoardMaterials(project.values);
  const {map:breakerMap1}=useManufacturerTexture(model.breakerBoardCount>0?breakerNames[0]:null);
  const {map:breakerMap2}=useManufacturerTexture(model.breakerBoardCount>1?breakerNames[1]:null);
  const {map:breakerMap3}=useManufacturerTexture(model.breakerBoardCount>2?breakerNames[2]:null);
  const breakerMaps=[breakerMap1,breakerMap2,breakerMap3];
  const breakerColors=breakerNames.map(name=>
    getDeckVisualProduct(name)?'#99948a':'#a1a6a9');
  const fasciaName=resolveFasciaMaterial(project.values);
  const {map:fasciaMap}=useManufacturerTexture(fasciaName);
  const stairFasciaName=resolveStairSideFasciaMaterial(project.values);
  const {map:stairFasciaMap}=useManufacturerTexture(stairFasciaName);
  const skirtName=project.values.skirtingColor||project.values.deckingMaterial;
  const {map:skirtMap}=useManufacturerTexture(skirtName);
  const stairName=project.values.stairTreadStyle==='match'||!project.values.stairTreadStyle
    ?project.values.deckingMaterial:project.values.stairTreadStyle;
  const {map:stairMap}=useManufacturerTexture(stairName);
  const riserStyle=String(project.values.stairRiserStyle??'auto');
  const riserName=riserStyle==='fascia'||(riserStyle==='auto'&&project.values.deckingType!=='pressure-treated')
    ?fasciaName:riserStyle==='auto'||riserStyle==='match'
      ?String(project.values.deckingMaterial):riserStyle;
  const {map:riserMap}=useManufacturerTexture(riserName);
  return <group name="manufacturer-visualized-deck">
    <DeckStructure3D model={model} center={center} height={deckHeight}/>
    <PolygonSubstrate model={model} center={center} deckHeight={deckHeight}/>
    <VisibleDeckBoards model={model} center={center} height={deckHeight} boardName={project.values.deckingMaterial}/>
    <BorderBoards model={model} center={center} deckHeight={deckHeight} maps={borderMaps} colors={borderColors}/>
    <BreakerBoards model={model} center={center} height={deckHeight} maps={breakerMaps} colors={breakerColors}/>
    <DeckFascia model={model} center={center} height={deckHeight} texture={fasciaMap}/>
    <DeckSkirting3D model={model} center={center} height={deckHeight} values={project.values} texture={skirtMap} lowerTier={lowerTier}/>
    <ManufacturerRailing3D model={model} values={project.values} center={center} deckHeight={deckHeight}/>
    <DeckStairAssembly3D model={model} center={center} height={deckHeight} values={project.values}
      texture={stairMap} fasciaTexture={stairFasciaMap}
      riserTexture={riserMap} skirtTexture={skirtMap}/>
    {covered&&<RenaissanceCover3D model={model} project={project} center={center} deckHeight={deckHeight}/>}
    {!selected&&<group name="manufacturer-board-texture-not-yet-verified"/>}
  </group>;
}
