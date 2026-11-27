import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getDeckVisualProduct } from '../../data/visualCatalog';
import { surfaceStrips, breakerVisualStrips } from '../../lib/visualGeometry';
import { planMiteredPictureFrames,splitMiteredPictureFrames,planVisiblePictureFrameMiterSeams,openPictureFrameMiterGaps } from '../../lib/deckMiterGeometry';
import { deckPlanToScene } from '../../lib/deckSurfaceClipping';
import { resolvePictureFrameMaterials, resolveBreakerBoardMaterials, resolveFasciaMaterial, resolveStairSideFasciaMaterial } from '../../lib/deckTrimSelection';
import { type P2 } from './Primitives';
import { planDeckFasciaCuts,planSubfloorCuts } from '../../lib/constructionFinish';
import { framingDepthFt } from '../../lib/constructionFraming';
import { DeckStructure3D } from './DeckStructure3D';
import { DeckStairAssembly3D } from './DeckStairAssembly3D';
import { DeckSkirting3D } from './DeckSkirting3D';
import { ManufacturerRailing3D } from './ManufacturerRailing3D';
import { RenaissanceCover3D } from './RenaissanceCover3D';
import { stairEnclosureClearanceWalls } from '../../lib/stairEnclosureClearance';
import { lightingCapPostKeys,lightingScreenIntegrated } from '../../lib/lightingAddons';

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
  const pieces=useMemo(()=>planSubfloorCuts(model).map(cut=>{
    const shape=new THREE.Shape();cut.footprint.forEach((p,i)=>i===0?shape.moveTo(p.x-center[0],-(p.y-center[1])):shape.lineTo(p.x-center[0],-(p.y-center[1])));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.75/12,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);
    const edge=new THREE.BufferGeometry().setFromPoints([...cut.footprint,cut.footprint[0]].map(p=>new THREE.Vector3(p.x-center[0],deckHeight+.0001,p.y-center[1])));
    return {id:cut.id,geometry,edge};
  }),[model,center,deckHeight]);
  useEffect(()=>()=>pieces.forEach(p=>{p.geometry.dispose();p.edge.dispose();}),[pieces]);
  return <group name="actual-staggered-four-by-eight-subfloor-sheets">{pieces.map(piece=><group key={piece.id}>
    <mesh name={piece.id} geometry={piece.geometry} position={[0,deckHeight-.75/12,0]} castShadow receiveShadow><meshStandardMaterial color="#b79a72" roughness={.88}/></mesh>
    <lineLoop geometry={piece.edge}><lineBasicMaterial color="#6e5d48"/></lineLoop>
  </group>)}</group>;
}
function VisibleDeckBoards({model,center,height,boardName}:{
  model:DeckModel;center:P2;height:number;boardName:unknown;
}){
  const allStrips=useMemo(()=>surfaceStrips(model),[model]);
  const strips=useMemo(()=>allStrips.filter(strip=>!strip.outline),[allStrips]);
  const cutFaces=useMemo(()=>allStrips.filter(strip=>strip.outline).map(strip=>{
    const shape=new THREE.Shape();
    strip.outline!.forEach((point,i)=>{
      const [x,z]=deckPlanToScene(point,center);
      if(i===0)shape.moveTo(x,-z);else shape.lineTo(x,-z);
    });
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:model.deckBoardThicknessFt,bevelEnabled:false});
    geometry.rotateX(-Math.PI/2);
    const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i)+center[0],z=positions.getZ(i)+center[1];
      uv.setXY(i,((strip.axis==='x'?x:z)-strip.startFt)/strip.lengthFt,
        ((strip.axis==='x'?z:x)-(strip.axis==='x'?strip.z:strip.x)+strip.widthFt/2)/strip.widthFt);
    }
    uv.needsUpdate=true;
    return geometry;
  }),[allStrips,center,model.deckBoardThicknessFt]);
  useEffect(()=>()=>cutFaces.forEach(geometry=>geometry.dispose()),[cutFaces]);
  const {map,missing}=useManufacturerTexture(boardName);
  const ref=useRef<THREE.InstancedMesh>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const d=new THREE.Object3D();
    strips.forEach((strip,i)=>{
      d.position.set(strip.x-center[0],height-model.deckBoardThicknessFt/2,strip.z-center[1]);
      d.rotation.set(0,strip.axis==='z'?Math.PI/2:0,0);
      d.scale.set(strip.lengthFt,model.deckBoardThicknessFt,strip.widthFt);
      d.updateMatrix();
      ref.current!.setMatrixAt(i,d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[strips,center,height,model.deckBoardThicknessFt]);
  if(!allStrips.length)return null;
  return <group name={missing?'decking-needs-manufacturer-texture':'genuine-manufacturer-board-texture'}>
    {strips.length>0&&<instancedMesh ref={ref} args={[undefined,undefined,strips.length]} castShadow receiveShadow>
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
    </instancedMesh>}
    {cutFaces.map((geometry,i)=><mesh key={'field-rip-'+i} name="field-board-ripped-to-picture-frame"
      geometry={geometry} position={[0,height-model.deckBoardThicknessFt,0]} castShadow receiveShadow>
      {map?<meshBasicMaterial map={map} color="#ffffff" toneMapped={false}/>
        :<meshStandardMaterial color="#bfc5c7" roughness={.78}/>}
    </mesh>)}
  </group>;
}
/**
 * Uses the SAME manufacturer top-surface photograph/material pipeline as
 * VisibleDeckBoards. A frame board isn't a white default Beam proxy anymore.
 */
function DeckTrimBeam({start,end,height,texture,color,widthFt,thicknessFt}:{
  start:P2;end:P2;height:number;texture:THREE.Texture|null;color:string;
  widthFt:number;thicknessFt:number;
}){
  const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz);
  if(length<.005)return null;
  return <mesh position={[(start[0]+end[0])/2,height,(start[1]+end[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
    <boxGeometry args={[length,thicknessFt,widthFt]}/>
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
  const visibleEdges=useMemo(()=>model.pictureFrameHouseSide?
    model.pictureFrameSegments:
    model.pictureFrameSegments.filter(edge=>!model.houseEdgeIndices.includes(edge.index)),
    [model.pictureFrameSegments,model.pictureFrameHouseSide,model.houseEdgeIndices]);
  const nominalOutlines=useMemo(()=>splitMiteredPictureFrames(planMiteredPictureFrames(
    model.points,visibleEdges,model.pictureFrameCount,model.pictureFrameFaceFts,.125/12,model.fasciaThicknessFt)),
    [model.points,visibleEdges,model.pictureFrameCount,model.pictureFrameFaceFts,model.fasciaThicknessFt]);
  const cutSeams=useMemo(()=>planVisiblePictureFrameMiterSeams(
    model.points,model.pictureFrameSegments,model.pictureFrameCount,
    model.houseEdgeIndices,model.pictureFrameHouseSide,model.pictureFrameFaceFts,model.fasciaThicknessFt),
    [model.points,model.pictureFrameSegments,model.pictureFrameCount,
      model.houseEdgeIndices,model.pictureFrameHouseSide,model.pictureFrameFaceFts,model.fasciaThicknessFt]);
  const outlines=useMemo(()=>openPictureFrameMiterGaps(nominalOutlines,cutSeams),
    [nominalOutlines,cutSeams]);
  const geometries=useMemo(()=>outlines.map(strip=>{
    const s=new THREE.Shape();
    strip.corners.forEach(([x,z],i)=>{
      if(i===0)s.moveTo(x-center[0],-(z-center[1]));
      else s.lineTo(x-center[0],-(z-center[1]));
    });
    s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{
      depth:model.pictureFrameThicknessFts[strip.course],bevelEnabled:false,curveSegments:1,steps:1,
    });
    g.rotateX(-Math.PI/2);g.computeVertexNormals();
    return {strip,geometry:g};
  }),[outlines,center,model.pictureFrameThicknessFts]);
  useEffect(()=>()=>geometries.forEach(item=>item.geometry.dispose()),[geometries]);
  // The dark joint occupies the real 1/8-inch saw-cut opening. Use the
  // SAME plan-to-scene transform as the boards so it cannot mirror away
  // from its board into the field or outside the deck.
  const miterSeams=useMemo(()=>cutSeams.map(seam=>{
      const [x1,z1]=deckPlanToScene(seam.from,center);
      const [x2,z2]=deckPlanToScene(seam.to,center);
      return {edgeIndex:seam.edgeIndex,course:seam.course,
        x:(x1+x2)/2,z:(z1+z2)/2,length:Math.hypot(x2-x1,z2-z1),
        yaw:-Math.atan2(z2-z1,x2-x1)};
    }),[cutSeams,center]);
  return <group name="miter-cut-authentic-picture-frame-courses">
    {geometries.map(({strip,geometry},index)=><mesh key={'miter-'+strip.edgeIndex+'-'+strip.course+'-'+index}
      geometry={geometry} position={[0,deckHeight-model.pictureFrameThicknessFts[strip.course],0]} castShadow receiveShadow>
      {maps[strip.course]
        ?<meshBasicMaterial color="#ffffff" map={maps[strip.course]} toneMapped={false} side={THREE.DoubleSide}/>
        :<meshStandardMaterial color={colors[strip.course]??'#a5a29d'}
          side={THREE.DoubleSide} roughness={.81}/>}
    </mesh>)}
    {miterSeams.map(seam=><mesh key={'visible-miter-joint-'+seam.edgeIndex+'-'+seam.course}
      name="true-diagonal-picture-frame-miter-joint"
      position={[seam.x,deckHeight-.002,seam.z]}
      rotation={[0,seam.yaw,0]}>
      <boxGeometry args={[seam.length,.004,.125/12]}/>
      <meshBasicMaterial color="#33312d"/>
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
      if(strip.outline)return <CutBreakerBoard key={'breaker-course-'+strip.course+'-'+i}
        outline={strip.outline} center={center} height={height} thickness={model.breakerThicknessFts[strip.course]}
        texture={maps[strip.course]??null} color={colors[strip.course]??'#a1a6a9'}/>;
      const start:P2=strip.axis==='x'
        ?[strip.startFt-center[0],strip.z-center[1]]
        :[strip.x-center[0],strip.startFt-center[1]];
      const end:P2=strip.axis==='x'
        ?[strip.endFt-center[0],strip.z-center[1]]
        :[strip.x-center[0],strip.endFt-center[1]];
      return <DeckTrimBeam key={'breaker-course-'+strip.course+'-'+i}
        start={start} end={end} height={height-model.breakerThicknessFts[strip.course]/2}
        widthFt={strip.widthFt} thicknessFt={model.breakerThicknessFts[strip.course]}
        texture={maps[strip.course]??null} color={colors[strip.course]??'#a1a6a9'}/>;
    })}
  </group>;
}
function CutBreakerBoard({outline,center,height,thickness,texture,color}:{outline:readonly (readonly[number,number])[];center:P2;height:number;thickness:number;texture:THREE.Texture|null;color:string}){
  const geometry=useMemo(()=>{const shape=new THREE.Shape();outline.forEach(([x,y],i)=>i===0?shape.moveTo(x-center[0],-(y-center[1])):shape.lineTo(x-center[0],-(y-center[1])));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);return g;
  },[outline,center,thickness]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} position={[0,height-thickness,0]} castShadow receiveShadow>
    {texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false}/>:<meshStandardMaterial color={color} roughness={.82}/>}</mesh>;
}
function FasciaCut({cut,model,center,height,texture}:{cut:ReturnType<typeof planDeckFasciaCuts>[number];model:DeckModel;center:P2;height:number;texture:THREE.Texture|null}){
  const depth=Math.min(model.fasciaFaceFt,framingDepthFt(model.joistSize));
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();cut.footprint.forEach((p,i)=>i===0?shape.moveTo(p.x-center[0],-(p.y-center[1])):shape.lineTo(p.x-center[0],-(p.y-center[1])));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);return g;
  },[cut,center,depth]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh name={cut.id} geometry={geometry} position={[0,height-model.deckBoardThicknessFt-depth,0]} castShadow receiveShadow>
    <meshStandardMaterial color={texture?'#ffffff':'#a49c90'} map={texture} roughness={.82}/>
  </mesh>;
}
function DeckFascia({model,center,height,texture}:{model:DeckModel;center:P2;height:number;texture:THREE.Texture|null}){
  const cuts=useMemo(()=>planDeckFasciaCuts(model),[model]);
  return <group name="full-depth-deck-fascia">{cuts.map(cut=><FasciaCut key={cut.id} cut={cut} model={model} center={center} height={height} texture={texture}/>)}</group>;
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
  const screenIntegrated=covered&&lightingScreenIntegrated(project);
  const enclosureWalls=useMemo(()=>covered&&!lowerTier?
    stairEnclosureClearanceWalls(model,project,center,deckHeight):[],[model,project,center,deckHeight,covered,lowerTier]);
  const capLightPosts=useMemo(()=>lightingCapPostKeys(model,project.values,center,deckHeight,
    screenIntegrated,lowerTier?'lower':'main',enclosureWalls),[model,project.values,center,deckHeight,screenIntegrated,lowerTier,enclosureWalls]);
  return <group name="manufacturer-visualized-deck">
    <DeckStructure3D model={model} center={center} height={deckHeight}/>
    {project.values.deckingSurface==='subfloor'&&<PolygonSubstrate model={model} center={center} deckHeight={deckHeight}/>}
    {model.deckingSurface!=='subfloor'&&<VisibleDeckBoards model={model} center={center} height={deckHeight} boardName={project.values.deckingMaterial}/>}
    <BorderBoards model={model} center={center} deckHeight={deckHeight} maps={borderMaps} colors={borderColors}/>
    <BreakerBoards model={model} center={center} height={deckHeight} maps={breakerMaps} colors={breakerColors}/>
    <DeckFascia model={model} center={center} height={deckHeight} texture={fasciaMap}/>
    <DeckSkirting3D model={model} center={center} height={deckHeight} values={project.values} texture={skirtMap} lowerTier={lowerTier}/>
    <ManufacturerRailing3D model={model} values={project.values} center={center}
      deckHeight={deckHeight} screenIntegrated={screenIntegrated} lightCapPostKeys={capLightPosts} enclosureWalls={enclosureWalls}/>
    <DeckStairAssembly3D model={model} center={center} height={deckHeight} values={project.values}
      texture={stairMap} fasciaTexture={stairFasciaMap}
      riserTexture={riserMap}/>
    {covered&&<RenaissanceCover3D model={model} project={project} center={center} deckHeight={deckHeight}/>}
    {!selected&&<group name="manufacturer-board-texture-not-yet-verified"/>}
  </group>;
}
