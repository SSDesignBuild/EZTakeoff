import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import type { ConsultationProject } from '../lib/consultationProject';
import { getDeckVisualProduct, getCoverVisualProduct, getRailVisualProduct } from '../data/visualCatalog';
import { ManufacturerDeck3D } from './visual3d/ManufacturerDeck3D';

function Scene({project,photoMode}:{project:ConsultationProject;photoMode:boolean}){
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const lower=useMemo(()=>buildLowerTierDeckModel(project.values),[project.values]);
  const center=useMemo<[number,number]>(()=>[
    (model.minX+model.maxX)/2,(model.minY+model.maxY)/2,
  ],[model.minX,model.maxX,model.minY,model.maxY]);
  const height=Math.max(.35,Math.min(26,Number(project.values.deckHeight??5)));
  const span=Math.max(model.width,model.depth,12);
  return <>
    <ambientLight intensity={.9}/>
    <hemisphereLight args={['#e0ebfb','#b5a58e',.95]}/>
    <directionalLight position={[span*.5,span*1.2,span*.8]} intensity={2.25} color="#fff7ed"
      castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-near={.5} shadow-camera-far={span*5}
      shadow-camera-left={-span*1.5} shadow-camera-right={span*1.5}
      shadow-camera-top={span*1.5} shadow-camera-bottom={-span*1.5}/>
    <ManufacturerDeck3D model={model} project={project} center={center} deckHeight={height}/>
    {lower&&<ManufacturerDeck3D model={lower} project={project} center={center}
      deckHeight={Math.max(.35,Math.min(26,Number(project.values.lowerDeckHeight??3)))}
      covered={false} lowerTier/>}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.11,0]} receiveShadow>
      <planeGeometry args={[Math.max(70,span*3),Math.max(70,span*3)]}/>
      {photoMode
        ? <shadowMaterial transparent opacity={.17}/>
        : <meshStandardMaterial color="#e9e8e3" roughness={1}/>}
    </mesh>
    <OrbitControls makeDefault enableDamping dampingFactor={.08}
      minDistance={Math.max(5,span*.45)} maxDistance={span*6}
      maxPolarAngle={Math.PI*.492}
      target={[0,Math.min(8,height/2),0]}/>
  </>;
}
export function Consultation3D({project,photoUrl,photoMode=false}:{
  project:ConsultationProject;photoUrl:string|null;photoMode?:boolean;
}){
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const dimension=Math.max(model.width,model.depth,12);
  const height=Math.max(1,Number(project.values.deckHeight??5));
  const board=getDeckVisualProduct(project.values.deckingMaterial);
  const rail=getRailVisualProduct(project.values.railingVisualId);
  const cover=getCoverVisualProduct(project.coverFamily);
  return <div className={'consultation-3d-frame'+(photoMode?' with-photo':'')}>
    {photoMode&&photoUrl&&<img className="consultation-house-background" src={photoUrl}
      alt="Client property used as the background for a manually aligned concept model"/>}
    <div className="consultation-3d-canvas" style={photoMode?{
      transform:'translate('+project.calibration.offsetX+'%,'+project.calibration.offsetY+
        '%) scale('+project.calibration.scale+') rotate('+project.calibration.rotationDeg+'deg)',
    }:undefined}>
      <Suspense fallback={<div className="consultation-canvas-placeholder">Loading manufacturer materials and 3D geometry…</div>}>
        <Canvas dpr={[1,1.7]} shadows
          camera={{position:[dimension*.82,height+dimension*.85,dimension*1.2],fov:48,near:.1,far:900}}
          gl={{antialias:true,alpha:photoMode,preserveDrawingBuffer:true,
            toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.25}}>
          <Scene project={project} photoMode={photoMode}/>
        </Canvas>
      </Suspense>
    </div>
    <div className="consultation-render-stamp">
      {photoMode?'HOUSE PHOTO + MANUALLY ALIGNED 3D · NOT A MEASURED PHOTOMONTAGE':
        '3D DECK · INDIVIDUAL BOARD GEOMETRY · MANUFACTURER MODEL FAMILIES'}
    </div>
    <div className="consultation-render-specs">
      <span>{board?board.collection+' / '+board.color+' — TimberTech photo texture':
        'Deck manufacturer swatch not verified; neutral presentation material'}</span>
      <span>{rail.label}</span>
      {project.coverFamily!=='none'&&<span>Renaissance {cover.name} · Frame: {project.coverColor}
        {['solid-studio','solid-truss-ends','full-trusses'].includes(cover.family)
          ?` · Roof: ${project.coverRoofColor??'White'} · Ceiling: ${project.coverCeilingFinish??'White'}`
          :''} · concept dimensions</span>}
    </div>
  </div>;
}
