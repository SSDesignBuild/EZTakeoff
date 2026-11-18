import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getDeckVisualProduct } from '../../data/visualCatalog';
import { surfaceStrips } from '../../lib/visualGeometry';
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
    setMap(null);setMissing(false);
    if(!sample){setMissing(true);return;}
    new THREE.TextureLoader().load(sample.swatch,(loaded)=>{
      loaded.colorSpace=THREE.SRGBColorSpace;
      loaded.wrapS=THREE.RepeatWrapping;
      loaded.wrapT=THREE.RepeatWrapping;
      loaded.anisotropy=8;
      // The source is a real manufacturer board photo. Repetition is only a
      // visual tiling strategy and not a production grain batch prediction.
      loaded.repeat.set(1,1);
      texture=loaded;
      if(alive)setMap(loaded);else loaded.dispose();
    },undefined,()=>{if(alive)setMissing(true);});
    return ()=>{alive=false;if(texture)texture.dispose();};
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
function BorderBoards({model,center,deckHeight,color,texture}:{
  model:DeckModel;center:P2;deckHeight:number;color:string;texture:THREE.Texture|null;
}){
  if(model.pictureFrameCount<=0)return null;
  return <group name="picture-frame-borders">
    {model.pictureFrameSegments.map((edge)=>Array.from({length:model.pictureFrameCount},(_,i)=>{
      // Reusing exact perimeter edges keeps house-side selection consistent
      // with the authoritative takeoff; visual corner miters remain indicative.
      const from:P2=[edge.start.x-center[0],edge.start.y-center[1]],
        to:P2=[edge.end.x-center[0],edge.end.y-center[1]];
      const inward=.18+i*.48;
      const along=Number(edge.orientation==='vertical');
      return <Beam key={'frame-'+edge.index+'-'+i}
        start={[from[0]+(along?inward:0),from[1]+(along?0:inward)]}
        end={[to[0]+(along?inward:0),to[1]+(along?0:inward)]}
        height={deckHeight+.07} thickness={.095} depth={.44}
        color={color} texture={texture}/>;
    }))}
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
export function ManufacturerDeck3D({model,project,center,deckHeight,covered=true}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;covered?:boolean;
}){
  const selected=getDeckVisualProduct(project.values.deckingMaterial);
  const borderName=project.values.pictureFrameMaterial==='match'||!project.values.pictureFrameMaterial
    ?project.values.deckingMaterial:project.values.pictureFrameMaterial;
  const borderProduct=getDeckVisualProduct(borderName);
  // Border/trim colors only use real manufacturer samples where available.
  // Otherwise the deck uses neutral material instead of inventing a color.
  const {map:borderMap}=useManufacturerTexture(borderName);
  const fasciaName=project.values.fasciaMaterial==='match'||!project.values.fasciaMaterial
    ?project.values.deckingMaterial:project.values.fasciaMaterial;
  const {map:fasciaMap}=useManufacturerTexture(fasciaName);
  const skirtName=project.values.skirtingColor||project.values.deckingMaterial;
  const {map:skirtMap}=useManufacturerTexture(skirtName);
  const stairName=project.values.stairTreadStyle==='match'||!project.values.stairTreadStyle
    ?project.values.deckingMaterial:project.values.stairTreadStyle;
  const {map:stairMap}=useManufacturerTexture(stairName);
  const borderTint=borderProduct?'#85807c':'#a1a6a9';
  return <group name="manufacturer-visualized-deck">
    <DeckStructure3D model={model} center={center} height={deckHeight}/>
    <PolygonSubstrate model={model} center={center} deckHeight={deckHeight}/>
    <VisibleDeckBoards model={model} center={center} height={deckHeight} boardName={project.values.deckingMaterial}/>
    <BorderBoards model={model} center={center} deckHeight={deckHeight} color={borderTint} texture={borderMap}/>
    <DeckFascia model={model} center={center} height={deckHeight} texture={fasciaMap}/>
    <DeckSkirting3D model={model} center={center} height={deckHeight} values={project.values} texture={skirtMap}/>
    <ManufacturerRailing3D model={model} values={project.values} center={center} deckHeight={deckHeight}/>
    <DeckStairAssembly3D model={model} center={center} height={deckHeight} values={project.values} texture={stairMap}/>
    {covered&&<RenaissanceCover3D model={model} project={project} center={center} deckHeight={deckHeight}/>}
    {!selected&&<group name="manufacturer-board-texture-not-yet-verified"/>}
  </group>;
}
