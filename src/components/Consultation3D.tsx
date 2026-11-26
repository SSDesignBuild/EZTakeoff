import { Suspense, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import type { ConsultationProject } from '../lib/consultationProject';
import { getDeckVisualProduct, getCoverVisualProduct, getRailVisualProduct } from '../data/visualCatalog';
import { ManufacturerDeck3D } from './visual3d/ManufacturerDeck3D';
import { SiteConcrete3D } from './visual3d/SiteConcrete3D';
import { LightingAddons3D } from './visual3d/LightingAddons3D';
import { StudioCameraFit } from './visual3d/StudioCameraFit';
import { planSiteConcrete, siteConcreteSceneBounds } from '../lib/siteConcrete';

function Scene({project,photoMode,lightingPreview,focusHeight,fitRequest}:{project:ConsultationProject;photoMode:boolean;lightingPreview:boolean;focusHeight:number;fitRequest:number}){
  const content=useRef<THREE.Group>(null);
  const initialTarget=useRef<[number,number,number]>([0,focusHeight,0]);
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const lower=useMemo(()=>buildLowerTierDeckModel(project.values),[project.values]);
  const bounds=useMemo(()=>siteConcreteSceneBounds(project.values),[project.values]);
  const concrete=useMemo(()=>planSiteConcrete(project.values),[project.values]);
  const center=bounds.center;
  const height=Math.max(.35,Math.min(26,Number(project.values.deckHeight??5)));
  const span=Math.max(bounds.width,bounds.depth,12);
  const geometryKey=JSON.stringify([
    model.points,model.stairPlacements,height,lower?.points,lower?.stairPlacements,project.values.lowerDeckHeight,
    project.coverFamily,project.coverRoofStyle,project.coverWidthFt,project.coverProjectionFt,
    project.coverHeightFt,project.coverMount,project.coverSideOverhangFt,project.coverFrontOverhangFt,
    project.coverTrussMount,project.coverAccentEnd,
    concrete.areas.map(area=>[area.points,area.thicknessIn,area.elevationFt]),
  ]);
  return <>
    <ambientLight intensity={lightingPreview?.18:.9}/>
    <hemisphereLight args={['#e0ebfb','#b5a58e',lightingPreview?.25:.95]}/>
    <directionalLight position={[span*.5,span*1.2,span*.8]} intensity={lightingPreview?.3:2.25} color={lightingPreview?'#adbedc':'#fff7ed'}
      castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-near={.5} shadow-camera-far={span*5}
      shadow-camera-left={-span*1.5} shadow-camera-right={span*1.5}
      shadow-camera-top={span*1.5} shadow-camera-bottom={-span*1.5}/>
    <group ref={content} name="studio-design-content">
    <ManufacturerDeck3D model={model} project={project} center={center} deckHeight={height}/>
    {lower&&<ManufacturerDeck3D model={lower} project={project} center={center}
      deckHeight={Math.max(.35,Math.min(26,Number(project.values.lowerDeckHeight??3)))}
      covered={false} lowerTier/>}
    <SiteConcrete3D areas={concrete.areas} center={center}/>
    <LightingAddons3D project={project} center={center} lightingPreview={lightingPreview}/>
    </group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.11,0]} receiveShadow>
      <planeGeometry args={[Math.max(70,span*3),Math.max(70,span*3)]}/>
      {photoMode
        ? <shadowMaterial transparent opacity={.17}/>
        : <meshStandardMaterial color={lightingPreview?'#929a9c':'#e9e8e3'} roughness={1}/>}
    </mesh>
    <OrbitControls makeDefault enableDamping dampingFactor={.08}
      minDistance={Math.max(5,span*.45)} maxDistance={span*6}
      maxPolarAngle={Math.PI*.492}
      target={initialTarget.current}/>
    <StudioCameraFit content={content} geometryKey={geometryKey} request={fitRequest}/>
  </>;
}
export function Consultation3D({project,photoUrl,photoMode=false,viewportHeight=740,lightingPreview=false,fitRequest=0}:{
  project:ConsultationProject;photoUrl:string|null;photoMode?:boolean;
  viewportHeight?:number;
  lightingPreview?:boolean;
  fitRequest?:number;
}){
  const bounds=useMemo(()=>siteConcreteSceneBounds(project.values),[project.values]);
  const dimension=Math.max(bounds.width,bounds.depth,12);
  const height=Math.max(1,Number(project.values.deckHeight??5));
  const board=getDeckVisualProduct(project.values.deckingMaterial);
  const rail=getRailVisualProduct(project.values.railingVisualId);
  const cover=getCoverVisualProduct(project.coverFamily);
  const sceneHeight=height+(project.coverFamily==='none'?3.5:Math.max(6,Number(project.coverHeightFt??9)));
  const focusHeight=sceneHeight*.45;
  const framingSpan=Math.max(dimension,sceneHeight*1.5);
  // Keep the actual camera instance stable. The fit component handles later
  // geometry/viewport changes without discarding the user's orbit direction.
  const camera=useRef({position:[framingSpan*.64,focusHeight+framingSpan*.54,framingSpan*.88] as [number,number,number],
    fov:45,near:.1,far:Math.max(900,framingSpan*10)}).current;
  return <div className={'consultation-3d-frame'+(photoMode?' with-photo':'')+(lightingPreview?' studio-evening':'')}
    style={{height:Math.max(280,Math.min(1200,viewportHeight))}}>
    {photoMode&&photoUrl&&<img className="consultation-house-background" src={photoUrl}
      alt="Client property used as the background for a manually aligned concept model"/>}
    <div className="consultation-3d-canvas" style={photoMode?{
      transform:'translate('+project.calibration.offsetX+'%,'+project.calibration.offsetY+
        '%) scale('+project.calibration.scale+') rotate('+project.calibration.rotationDeg+'deg)',
    }:undefined}>
      <Suspense fallback={<div className="consultation-canvas-placeholder">Loading manufacturer materials and 3D geometry…</div>}>
        <Canvas dpr={[1,1.7]} shadows
          onCreated={({gl})=>gl.setClearColor('#000000',0)}
          camera={camera}
          gl={{antialias:true,alpha:true,preserveDrawingBuffer:true,
            toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.25}}>
          <Scene project={project} photoMode={photoMode} lightingPreview={lightingPreview} focusHeight={focusHeight} fitRequest={fitRequest}/>
        </Canvas>
      </Suspense>
    </div>
    <div className="consultation-render-stamp">
      {photoMode?'Concept photo overlay · align to site':
        lightingPreview?'Evening lighting preview':'Design preview · confirm physical samples'}
    </div>
    <div className="consultation-render-specs">
      <span>{board?board.collection+' · '+board.color:'Deck finish preview'}</span>
      <span>{rail.label}</span>
      {project.coverFamily!=='none'&&<span>Renaissance {cover.name} · Frame: {project.coverColor}
        {['solid-studio','solid-truss-ends','full-trusses'].includes(cover.family)
          ?` · Roof: ${project.coverRoofColor??'White'}`:''}</span>}
    </div>
  </div>;
}
