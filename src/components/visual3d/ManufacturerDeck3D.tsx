import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getDeckVisualProduct } from '../../data/visualCatalog';
import { surfaceStrips } from '../../lib/visualGeometry';
import { Beam, Block, Rod, type P2, type P3 } from './Primitives';
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
      <meshStandardMaterial color={map?'#ffffff':'#bfc5c7'}
        map={map??undefined} roughness={.78} metalness={0}/>
    </instancedMesh>
  </group>;
}
function BorderBoards({model,center,deckHeight,color}:{
  model:DeckModel;center:P2;deckHeight:number;color:string;
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
        color={color}/>;
    }))}
  </group>;
}
function StructuralDeck({model,center,height}:{
  model:DeckModel;center:P2;height:number;
}){
  return <group name="S&S-deck-structure">
    {model.beamLines.flatMap((line,index)=>line.segments.map((segment,i)=>{
      const vertical=model.joistDirection==='vertical';
      const from:P2=vertical?[segment.startX-center[0],line.y-center[1]]:[line.y-center[0],segment.startX-center[1]];
      const to:P2=vertical?[segment.endX-center[0],line.y-center[1]]:[line.y-center[0],segment.endX-center[1]];
      return <Beam key={'beam-'+index+'-'+i} start={from} end={to}
        height={height-.92} thickness={.44} depth={.35} color="#775d43"/>;
    }))}
    {model.postLocations.map((post)=><group key={post.reference}>
      <Block position={[post.x-center[0],Math.max(.45,height-1.14)/2,post.y-center[1]]}
        size={[model.postSize==='8x8'?.67:.5,Math.max(.45,height-1.14),model.postSize==='8x8'?.67:.5]}
        color="#876b4e"/>
      <Block position={[post.x-center[0],.12,post.y-center[1]]}
        size={[.72,.24,.72]} color="#8d9391"/>
    </group>)}
  </group>;
}
function FasciaAndSkirting({model,center,height,values}:{
  model:DeckModel;center:P2;height:number;values:ConsultationProject['values'];
}){
  const skirt=values.skirtingEnabled===true||values.skirtingEnabled==='true';
  const gap=.035,face=.4;
  return <group name="fascia-and-deck-skirting">
    {model.exposedSegments.map((edge)=><group key={'fascia-'+edge.index}>
      <Beam start={[edge.start.x-center[0],edge.start.y-center[1]]}
        end={[edge.end.x-center[0],edge.end.y-center[1]]}
        height={height-.43} thickness={.65} depth={.075} color="#9c8a76"/>
      {skirt&&Array.from({length:Math.min(90,Math.max(1,Math.floor(edge.length/(face+gap))))},(_,i,all)=>{
        const t=(i+.5)/all.length;
        const x=edge.start.x+(edge.end.x-edge.start.x)*t-center[0],
          z=edge.start.y+(edge.end.y-edge.start.y)*t-center[1];
        const size=Math.max(.4,height-.7);
        return <Block key={'skirt-'+i} position={[x,size/2,z]}
          size={[edge.orientation==='horizontal'?face:.075,size,edge.orientation==='vertical'?face:.075]}
          color={values.skirtingMaterial==='pvc'?'#dadcda':'#9d886b'}/>;
      })}
    </group>)}
  </group>;
}
function DeckStairs({model,center,height,boardName}:{
  model:DeckModel;center:P2;height:number;boardName:unknown;
}){
  const {map}=useManufacturerTexture(boardName);
  if(!model.stairCount||!model.stairPlacements.length)return null;
  const winding=model.points.reduce((sum,p,i)=>{
    const next=model.points[(i+1)%model.points.length];
    return sum+p.x*next.y-next.x*p.y;
  },0);
  return <group name="dimensioned-deck-stairs">
    {model.stairPlacements.map((placement,index)=>{
      if(!placement.start||!placement.end||placement.edgeIndex===null)return null;
      const dx=placement.end.x-placement.start.x,dz=placement.end.y-placement.start.y;
      const length=Math.hypot(dx,dz);if(length<.1)return null;
      const nx=(winding>=0?dz:-dz)/length,nz=(winding>=0?-dx:dx)/length;
      const cx=(placement.start.x+placement.end.x)/2-center[0],cz=(placement.start.y+placement.end.y)/2-center[1];
      const count=Math.max(1,Math.min(28,model.stairTreadsPerRun));
      const rise=Math.min(.65,height/count);
      const footprint=.9;
      const angle=-Math.atan2(dz,dx);
      return <group key={'stair-'+index}>
        {Array.from({length:count},(_,i)=>{
          const reach=(i+.5)*footprint;
          const level=Math.max(.07,height-(i+1)*rise);
          return <group key={'tread-'+i}>
            <mesh position={[cx+nx*reach,level,cz+nz*reach]} rotation={[0,angle,0]} castShadow receiveShadow>
              <boxGeometry args={[length,.11,footprint-.025]}/>
              <meshStandardMaterial color={map?'#ffffff':'#bbc0c2'} map={map??undefined} roughness={.79}/>
            </mesh>
            <mesh position={[cx+nx*(reach+footprint/2),level-rise/2,cz+nz*(reach+footprint/2)]}
              rotation={[0,angle,0]} castShadow>
              <boxGeometry args={[length,rise-.06,.07]}/>
              <meshStandardMaterial color="#a0a4a1" roughness={.79}/>
            </mesh>
          </group>;
        })}
        {[0,.5,1].map((t)=>{
          const x=placement.start!.x+dx*t-center[0],z=placement.start!.y+dz*t-center[1];
          const from:P3=[x,height-.2,z],to:P3=[x+nx*count*footprint,.2,z+nz*count*footprint];
          return <Rod key={'stringer-'+t} from={from} to={to} radius={.10} color="#8c7557" metalness={0}/>;
        })}
      </group>;
    })}
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
  const borderTint=borderProduct?'#85807c':'#a1a6a9';
  return <group name="manufacturer-visualized-deck">
    <StructuralDeck model={model} center={center} height={deckHeight}/>
    <PolygonSubstrate model={model} center={center} deckHeight={deckHeight}/>
    <VisibleDeckBoards model={model} center={center} height={deckHeight} boardName={project.values.deckingMaterial}/>
    <BorderBoards model={model} center={center} deckHeight={deckHeight} color={borderTint}/>
    {/* Matte-tex border accent only if its true manufacturer image is available. */}
    {borderMap&&model.pictureFrameSegments.length>0&&
      model.pictureFrameSegments.slice(0,0).map(()=>null)}
    <FasciaAndSkirting model={model} center={center} height={deckHeight} values={project.values}/>
    <ManufacturerRailing3D model={model} values={project.values} center={center} deckHeight={deckHeight}/>
    <DeckStairs model={model} center={center} height={deckHeight}
      boardName={project.values.stairTreadStyle==='match'?project.values.deckingMaterial:project.values.stairTreadStyle}/>
    {covered&&<RenaissanceCover3D model={model} project={project} center={center} deckHeight={deckHeight}/>}
    {!selected&&<group name="manufacturer-board-texture-not-yet-verified"/>}
  </group>;
}
