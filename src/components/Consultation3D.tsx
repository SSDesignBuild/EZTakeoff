import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildDeckModel, buildLowerTierDeckModel, type DeckModel } from '../lib/deckModel';
import type { ConsultationProject } from '../lib/consultationProject';
import type { DeckEdgeSegment } from '../lib/types';

const shade=(name:string)=>{
  const n=name.toLowerCase();
  if(/white|coastline|sea salt|stone ash|silver maple|clamshell|clam shell/.test(n))return '#a7a6a0';
  if(/dark|black|espresso|charcoal|hickory/.test(n))return '#48413b';
  if(/gray|grey|foggy|weathered|pebble|slate|driftwood/.test(n))return '#777a74';
  if(/mahogany|redwood|saddle|mocha/.test(n))return '#795643';
  if(/honey|oak|wheat|teak|sand|birch/.test(n))return '#ad8c67';
  return '#9a8067';
};
const Box=({position,size,color,castShadow=true}:{
  position:[number,number,number];size:[number,number,number];color:string;castShadow?:boolean;
})=><mesh position={position} castShadow={castShadow} receiveShadow>
  <boxGeometry args={size}/>
  <meshStandardMaterial color={color} roughness={.84} metalness={.03}/>
</mesh>;
const Between=({start,end,height,width,color}:{
  start:[number,number];end:[number,number];height:number;width:number;color:string;
})=>{
  const dx=end[0]-start[0],dz=end[1]-start[1],len=Math.hypot(dx,dz);
  if(len<.01)return null;
  return <mesh position={[(start[0]+end[0])/2,height,(start[1]+end[1])/2]}
    rotation={[0,-Math.atan2(dz,dx),0]} castShadow>
    <boxGeometry args={[len,.13,width]}/>
    <meshStandardMaterial color={color} roughness={.75}/>
  </mesh>;
};
function DeckSurface({model,color,center,height}:{model:DeckModel;color:string;center:[number,number];height:number}){
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();
    model.points.forEach((point,i)=>{
      const x=point.x-center[0],y=-(point.y-center[1]);
      if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
    });
    shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false,curveSegments:1,steps:1});
    geo.rotateX(-Math.PI/2);
    return geo;
  },[model.points,center[0],center[1]]);
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=256;canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='rgba(30,28,26,.28)';ctx.lineWidth=3;
    for(let x=0;x<=256;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}
    ctx.strokeStyle='rgba(255,255,255,.085)';ctx.lineWidth=1;
    for(let x=0;x<=256;x+=28){ctx.beginPath();ctx.moveTo(x+4,0);ctx.lineTo(x+4,256);ctx.stroke();}
    const tex=new THREE.CanvasTexture(canvas);
    tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(.27,.27);tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  },[color]);
  return <mesh geometry={geometry} position={[0,height-.18,0]} castShadow receiveShadow>
    <meshStandardMaterial map={texture} roughness={.86}/>
  </mesh>;
}
function Railing({model,center,height,color}:{model:DeckModel;center:[number,number];height:number;color:string}){
  const edgeMap=new Map(model.edgeSegments.map((edge)=>[edge.index,edge]));
  const loc=(edge:DeckEdgeSegment,station:number):[number,number]=>{
    const t=Math.max(0,Math.min(1,station/Math.max(.001,edge.length)));
    return [edge.start.x+(edge.end.x-edge.start.x)*t-center[0],edge.start.y+(edge.end.y-edge.start.y)*t-center[1]];
  };
  return <group>
    {model.railCoverage.map((rail,idx)=>{
      const edge=edgeMap.get(rail.edgeIndex);
      if(!edge)return null;
      const from=loc(edge,rail.start),to=loc(edge,rail.end),length=rail.end-rail.start;
      const count=Math.max(1,Math.ceil(length/6));
      const balusterCount=Math.max(2,Math.ceil(length/.4));
      return <group key={'rail-'+idx}>
        <Between start={from} end={to} height={height+3.05} width={.12} color={color}/>
        <Between start={from} end={to} height={height+.24} width={.09} color={color}/>
        {Array.from({length:count+1},(_,i)=>{
          const p=loc(edge,rail.start+length*i/count);
          return <Box key={'post-'+i} position={[p[0],height+1.55,p[1]]} size={[.17,3.2,.17]} color={color}/>;
        })}
        {Array.from({length:balusterCount},(_,i)=>{
          const p=loc(edge,rail.start+length*(i+.5)/balusterCount);
          return <Box key={'baluster-'+i} position={[p[0],height+1.65,p[1]]} size={[.045,2.65,.045]} color={color}/>;
        })}
      </group>;
    })}
  </group>;
}
function Stairs({model,center,height,color}:{model:DeckModel;center:[number,number];height:number;color:string}){
  if(!model.stairCount||!model.stairPlacements.length)return null;
  const signed=model.points.reduce((s,p,i)=>{
    const next=model.points[(i+1)%model.points.length];
    return s+p.x*next.y-next.x*p.y;
  },0);
  return <group>
    {model.stairPlacements.map((stair,index)=>{
      if(!stair.start||!stair.end||stair.edgeIndex===null)return null;
      const dx=stair.end.x-stair.start.x,dz=stair.end.y-stair.start.y;
      const len=Math.hypot(dx,dz);
      if(len<.1)return null;
      const nx=(signed>=0?dz:-dz)/len,nz=(signed>=0?-dx:dx)/len;
      const cx=(stair.start.x+stair.end.x)/2-center[0];
      const cz=(stair.start.y+stair.end.y)/2-center[1];
      const count=Math.min(24,Math.max(1,model.stairTreadsPerRun));
      const riser=Math.min(.65,height/Math.max(1,count));
      return <group key={index}>
        {Array.from({length:count},(_,i)=>{
          const out=(i+.5)*.88;
          const y=Math.max(.18,height-(i+1)*riser);
          return <mesh key={i} position={[cx+nx*out,y,cz+nz*out]}
            rotation={[0,-Math.atan2(dz,dx),0]} castShadow receiveShadow>
            <boxGeometry args={[len,.12,.86]}/>
            <meshStandardMaterial color={color} roughness={.8}/>
          </mesh>;
        })}
      </group>;
    })}
  </group>;
}
function CoverConcept({model,center,height,family,color}:{
  model:DeckModel;center:[number,number];height:number;family:string;color:string;
}){
  if(family==='none')return null;
  const width=model.width,depth=model.depth,roofY=height+8.5;
  const aluminum=color==='Bronze'?'#564e45':'#d9d9d5';
  const postPoints:[[number,number],[number,number]]=[
    [model.minX-center[0]+.5,model.maxY-center[1]-.5],
    [model.maxX-center[0]-.5,model.maxY-center[1]-.5],
  ];
  return <group>
    {postPoints.map(([x,z],i)=><Box key={i} position={[x,(roofY+height)/2,z]} size={[.23,roofY-height,.23]} color={aluminum}/>)}
    {family==='Aria'
      ? Array.from({length:Math.max(3,Math.round(width/2))},(_,i)=><Box key={i}
          position={[model.minX-center[0]+width*(i+.5)/Math.max(3,Math.round(width/2)),roofY,0]}
          size={[.11,.18,depth]} color={aluminum}/>)
      : <Box position={[0,roofY,0]} size={[width+.5,.36,depth+.5]} color={aluminum}/>}
    <Box position={[0,roofY-.37,model.maxY-center[1]]} size={[width+.65,.46,.28]} color={aluminum}/>
  </group>;
}
function DeckAssembly({model,height,center,boardColor,railColor,coverFamily,coverColor}:{
  model:DeckModel;height:number;center:[number,number];boardColor:string;railColor:string;
  coverFamily:string;coverColor:string;
}){
  return <group>
    <DeckSurface model={model} center={center} height={height} color={boardColor}/>
    {model.beamLines.flatMap((beam,idx)=>beam.segments.map((s,i)=>{
      const mainVertical=model.joistDirection==='vertical';
      const from:[number,number]=mainVertical?[s.startX-center[0],beam.y-center[1]]:[beam.y-center[0],s.startX-center[1]];
      const to:[number,number]=mainVertical?[s.endX-center[0],beam.y-center[1]]:[beam.y-center[0],s.endX-center[1]];
      return <Between key={'beam-'+idx+'-'+i} start={from} end={to} height={height-1.2} width={.25} color="#735740"/>;
    }))}
    {model.postLocations.map((post)=><Box key={post.reference}
      position={[post.x-center[0],Math.max(.35,height-1.2)/2,post.y-center[1]]}
      size={[.5,Math.max(.35,height-1.2),.5]} color="#8e6c4c"/>)}
    {model.pictureFrameCount>0&&model.pictureFrameSegments.map((edge)=>{
      const from:[number,number]=[edge.start.x-center[0],edge.start.y-center[1]];
      const to:[number,number]=[edge.end.x-center[0],edge.end.y-center[1]];
      return <Between key={'frame-'+edge.index} start={from} end={to} height={height+.05}
        width={.42*model.pictureFrameCount} color="#5d4b3d"/>;
    })}
    <Railing model={model} center={center} height={height} color={railColor}/>
    <Stairs model={model} center={center} height={height} color={boardColor}/>
    <CoverConcept model={model} center={center} height={height} family={coverFamily} color={coverColor}/>
  </group>;
}
function Scene({project}:{project:ConsultationProject}){
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const lower=useMemo(()=>buildLowerTierDeckModel(project.values),[project.values]);
  const center=useMemo<[number,number]>(()=>[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2],
    [model.minX,model.maxX,model.minY,model.maxY]);
  const boardColor=shade(String(project.values.deckingMaterial??''));
  const railColor=String(project.values.railingColor??'black')==='white'?'#e7e7e4'
    :String(project.values.railingColor??'black')==='dark-bronze'?'#51453b':'#222628';
  const height=Math.max(.3,Math.min(22,Number(project.values.deckHeight??5)));
  const span=Math.max(model.width,model.depth,12);
  return <>
    <ambientLight intensity={.85}/>
    <hemisphereLight args={['#e7eeff','#b9a997',1.15]}/>
    <directionalLight position={[span,.9*span,span/2]} intensity={2.2} castShadow
      shadow-mapSize-width={2048} shadow-mapSize-height={2048}/>
    <DeckAssembly model={model} height={height} center={center}
      boardColor={boardColor} railColor={railColor}
      coverFamily={project.coverFamily} coverColor={project.coverColor}/>
    {lower&&<DeckAssembly model={lower}
      height={Math.max(.3,Math.min(22,Number(project.values.lowerDeckHeight??2)))}
      center={center} boardColor={boardColor} railColor={railColor}
      coverFamily="none" coverColor={project.coverColor}/>}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.04,0]} receiveShadow>
      <planeGeometry args={[Math.max(65,span*3),Math.max(65,span*3)]}/>
      <shadowMaterial transparent opacity={.16}/>
    </mesh>
    <OrbitControls makeDefault enableDamping dampingFactor={.1}
      minDistance={Math.max(5,span*.5)} maxDistance={span*6}
      maxPolarAngle={Math.PI*.485} target={[0,Math.min(6,height/2),0]}/>
  </>;
}
export function Consultation3D({project,photoUrl,photoMode=false}:{
  project:ConsultationProject;photoUrl:string|null;photoMode?:boolean;
}){
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const dimension=Math.max(model.width,model.depth,12);
  const height=Math.max(1,Number(project.values.deckHeight??5));
  return <div className={'consultation-3d-frame'+(photoMode?' with-photo':'')}>
    {photoMode&&photoUrl&&<img className="consultation-house-background" src={photoUrl} alt="Client property used as the concept background"/>}
    <div className="consultation-3d-canvas" style={photoMode?{
      transform:'translate('+project.calibration.offsetX+'%,'+project.calibration.offsetY+'%) scale('+project.calibration.scale+') rotate('+project.calibration.rotationDeg+'deg)',
    }:undefined}>
      <Suspense fallback={<div className="consultation-canvas-placeholder">Preparing live geometry…</div>}>
        <Canvas dpr={[1,1.7]} shadows camera={{
          position:[dimension*.82,height+dimension*.9,dimension*1.15],fov:48,near:.1,far:800,
        }} gl={{antialias:true,alpha:true,preserveDrawingBuffer:true}}>
          <Scene project={project}/>
        </Canvas>
      </Suspense>
    </div>
    <div className="consultation-render-stamp">
      {photoMode?'PHOTO OVERLAY · PERSPECTIVE ALIGNMENT APPROXIMATE':'LIVE PARAMETRIC 3D · DESIGN CONCEPT'}
    </div>
  </div>;
}
export const getPreviewShade=shade;
