import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { buildDeckSkirting } from '../../lib/deckSkirting';
import { getDeckVisualProduct } from '../../data/visualCatalog';
import { polygonLineSpans, nominalLumberDepthFt, stairFrameGeometry } from '../../lib/geometry3dCore';
import { surfaceStrips } from '../../lib/visualGeometry';
import { Beam, Block, SlopedPlank, type P2, type P3 } from './Primitives';
import { ManufacturerRailing3D } from './ManufacturerRailing3D';
import { RenaissanceCover3D } from './RenaissanceCover3D';

type Values=ConsultationProject['values'];
const isTrue=(v:unknown)=>v===true||v==='true';
/** Finite texture delivery deadline: a missing image never hangs the viewer. */
function useManufacturerTexture(name:unknown){
  const item=getDeckVisualProduct(name);
  const [map,setMap]=useState<THREE.Texture|null>(null);
  const [state,setState]=useState<'waiting'|'ready'|'missing'>(item?'waiting':'missing');
  useEffect(()=>{
    let live=true,texture:THREE.Texture|null=null;
    setMap(null);setState(item?'waiting':'missing');
    if(!item)return;
    const timer=setTimeout(()=>{if(live)setState('missing');},7500);
    new THREE.TextureLoader().load(item.swatch,(loaded)=>{
      loaded.colorSpace=THREE.SRGBColorSpace;
      loaded.wrapS=THREE.RepeatWrapping;loaded.wrapT=THREE.RepeatWrapping;
      loaded.repeat.set(2.2,1);
      loaded.anisotropy=8;
      texture=loaded;
      if(live){clearTimeout(timer);setMap(loaded);setState('ready');}
      else loaded.dispose();
    },undefined,()=>{if(live){clearTimeout(timer);setState('missing');}});
    return ()=>{live=false;clearTimeout(timer);if(texture)texture.dispose();};
  },[item?.swatch]);
  return {map,state,product:item};
}
function FloorSubstrate({model,center,height}:{model:DeckModel;center:P2;height:number}){
  const geo=useMemo(()=>{
    const shape=new THREE.Shape();
    model.points.forEach((point,i)=>{
      const x=point.x-center[0],z=-(point.y-center[1]);
      if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z);
    });
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:false,steps:1,curveSegments:1});
    geometry.rotateX(-Math.PI/2);
    return geometry;
  },[model.points,center]);
  useEffect(()=>()=>geo.dispose(),[geo]);
  return <mesh geometry={geo} position={[0,height-.17,0]} receiveShadow>
    <meshStandardMaterial color="#413f37" roughness={.9}/>
  </mesh>;
}
function PlankSurface({model,center,height,boardName}:{model:DeckModel;center:P2;height:number;boardName:unknown}){
  const strips=useMemo(()=>surfaceStrips(model),[model]);
  const {map,state,product}=useManufacturerTexture(boardName);
  const ref=useRef<THREE.InstancedMesh>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const obj=new THREE.Object3D();
    strips.forEach((strip,i)=>{
      obj.position.set(strip.x-center[0],height+.008,strip.z-center[1]);
      obj.rotation.set(0,strip.axis==='z'?Math.PI/2:0,0);
      obj.scale.set(strip.lengthFt,.09,strip.widthFt);
      obj.updateMatrix();
      ref.current!.setMatrixAt(i,obj.matrix);
    });
    ref.current.instanceMatrix.needsUpdate=true;
    ref.current.computeBoundingSphere();
  },[strips,center,height]);
  return <group name={product?'TimberTech-'+product.collection+'-'+product.color:'unverified-deck-finish'}>
    {strips.length>0&&<instancedMesh ref={ref} args={[undefined,undefined,strips.length]}
      castShadow receiveShadow>
      <boxGeometry args={[1,1,1]}/>
      <meshStandardMaterial map={map??undefined} color={map?'#ffffff':'#9da5aa'}
        roughness={.84} metalness={0} toneMapped={!map}/>
    </instancedMesh>}
    {state==='missing'&&<group name="manufacturer-grain-not-loaded-show-warning"/>}
  </group>;
}
function BorderTrim({model,center,height,values}:{model:DeckModel;center:P2;height:number;values:Values}){
  const chosen=values.pictureFrameMaterial==='match'||!values.pictureFrameMaterial?
    values.deckingMaterial:values.pictureFrameMaterial;
  const {map}=useManufacturerTexture(chosen);
  return <group name="picture-frame-trim">
    {model.pictureFrameSegments.flatMap((edge)=>Array.from({length:model.pictureFrameCount},(_,index)=>{
      const dx=edge.end.x-edge.start.x,dz=edge.end.y-edge.start.y,len=Math.hypot(dx,dz);
      if(len<.02)return null;
      const mid={x:(edge.start.x+edge.end.x)/2,y:(edge.start.y+edge.end.y)/2};
      const centroid={x:model.points.reduce((s,p)=>s+p.x,0)/model.points.length,
        y:model.points.reduce((s,p)=>s+p.y,0)/model.points.length};
      let nx=-dz/len,nz=dx/len;
      if((centroid.x-mid.x)*nx+(centroid.y-mid.y)*nz<0){nx*=-1;nz*=-1;}
      const inset=.22+index*.47;
      const from:P2=[edge.start.x+nx*inset-center[0],edge.start.y+nz*inset-center[1]];
      const to:P2=[edge.end.x+nx*inset-center[0],edge.end.y+nz*inset-center[1]];
      return <Beam key={edge.index+'-'+index} start={from} end={to} height={height+.008}
        thickness={.09} depth={.44} color="#a1a6aa" texture={map}/>;
    }))}
  </group>;
}
function DeckFraming({model,center,height}:{model:DeckModel;center:P2;height:number}){
  const joistDepth=nominalLumberDepthFt(model.joistSize);
  const beamDepth=nominalLumberDepthFt(model.beamMemberSize);
  const joistCenter=height-.105-joistDepth/2;
  const beamTop=height-.105-joistDepth;
  const beamCenter=beamTop-beamDepth/2;
  const postWidth=model.postSize==='8x8'?7.5/12:5.5/12;
  const joistAxis=model.joistDirection==='vertical'?'vertical':'horizontal';
  const lumber='#9a805b';
  return <group name="S&S-exact-size-deck-framing">
    {model.joistPositions.flatMap((station,j)=>polygonLineSpans(model.points,joistAxis,station).map((span,i)=>{
      const from:P2=joistAxis==='vertical'?[station-center[0],span.start-center[1]]:
        [span.start-center[0],station-center[1]];
      const to:P2=joistAxis==='vertical'?[station-center[0],span.end-center[1]]:
        [span.end-center[0],station-center[1]];
      return <Beam key={'joist-'+j+'-'+i} start={from} end={to}
        height={joistCenter} thickness={joistDepth} depth={1.5/12} color={lumber}/>;
    }))}
    {model.edgeSegments.map((edge,i)=><Beam key={'double-rim-'+i}
      start={[edge.start.x-center[0],edge.start.y-center[1]]}
      end={[edge.end.x-center[0],edge.end.y-center[1]]}
      height={joistCenter} thickness={joistDepth} depth={3/12} color="#8c7252"/>)}
    {model.beamLines.flatMap((line,j)=>line.segments.flatMap((span,i)=>{
      const vertical=model.joistDirection==='vertical';
      const from:P2=vertical?[span.startX-center[0],line.y-center[1]]:
        [line.y-center[0],span.startX-center[1]];
      const to:P2=vertical?[span.endX-center[0],line.y-center[1]]:
        [line.y-center[0],span.endX-center[1]];
      // Two real 2x10/2x12 plies: 1.5" each with a visible joint.
      const dx=to[0]-from[0],dz=to[1]-from[1],len=Math.hypot(dx,dz);
      const perpX=-dz/Math.max(.01,len),perpZ=dx/Math.max(.01,len);
      return [0,1].map((ply)=><Beam key={'beam-'+j+'-'+i+'-'+ply}
        start={[from[0]+perpX*(ply?1:-1)*.068,from[1]+perpZ*(ply?1:-1)*.068]}
        end={[to[0]+perpX*(ply?1:-1)*.068,to[1]+perpZ*(ply?1:-1)*.068]}
        height={beamCenter} thickness={beamDepth} depth={1.5/12}
        color={ply===0?'#876644':'#aa875c'}/>);
    }))}
    {model.angledBeamLines.flatMap((line,i)=>[0,1].map((ply)=><Beam key={'angled-beam-'+i+'-'+ply}
      start={[line.start.x-center[0],line.start.y-center[1]]}
      end={[line.end.x-center[0],line.end.y-center[1]]}
      height={beamCenter} thickness={beamDepth} depth={1.5/12}
      color={ply===0?'#8b6e4d':'#aa875d'}/>))}
    {model.postLocations.map((post)=>{
      const length=Math.max(.4,beamTop-.12);
      return <group key={post.reference}>
        <Block position={[post.x-center[0],length/2+.12,post.y-center[1]]}
          size={[postWidth,length,postWidth]} color="#96744f"/>
        <Block position={[post.x-center[0],.13,post.y-center[1]]}
          size={[postWidth+.14,.18,postWidth+.14]} color="#787c7d" metalness={.55}/>
        <Block position={[post.x-center[0],beamTop-.16,post.y-center[1]]}
          size={[postWidth,.15,postWidth]} color="#866848"/>
      </group>;
    })}
  </group>;
}
function DeckSkirtFascia({model,center,height,values}:{model:DeckModel;center:P2;height:number;values:Values}){
  const joistDepth=nominalLumberDepthFt(model.joistSize);
  const {map:fasciaMap}=useManufacturerTexture(values.fasciaMaterial==='match'||!values.fasciaMaterial?
    values.deckingMaterial:values.fasciaMaterial);
  const skirt=useMemo(()=>buildDeckSkirting(model.edgeSegments,model.exposedSegments,
    height,joistDepth*12,values),[model,height,joistDepth,values]);
  const orientation=String(values.skirtingOrientation??'vertical');
  const {map:skirtMap}=useManufacturerTexture(values.skirtingColor);
  const color=values.skirtingMaterial==='kdat'?'#9f8968':'#bbc1bc';
  const topY=height-.12-joistDepth;
  const boardFace=Math.max(.12,Math.min(1,Number(values.skirtingFaceIn??4.5)/12));
  return <group name="fascia-and-supplier-planned-skirting">
    {model.exposedSegments.map((edge)=><Beam key={'fascia-'+edge.index}
      start={[edge.start.x-center[0],edge.start.y-center[1]]}
      end={[edge.end.x-center[0],edge.end.y-center[1]]}
      height={height-.1-joistDepth/2} thickness={joistDepth}
      depth={.075} color="#b0ada5" texture={fasciaMap}/>)}
    {skirt.sides.flatMap((side)=>{
      const edge=model.edgeSegments.find((e)=>e.index===side.edgeIndex);
      if(!edge)return [];
      const dx=(edge.end.x-edge.start.x)/Math.max(.001,edge.length);
      const dz=(edge.end.y-edge.start.y)/Math.max(.001,edge.length);
      const angle=-Math.atan2(dz,dx);
      const station=(t:number):P2=>[edge.start.x+dx*t-center[0],
        edge.start.y+dz*t-center[1]];
      if(orientation==='horizontal')return side.courses.map((course,i)=>{
        const a=station(course.start),b=station(course.end);
        return <Beam key={'horizontal-skirt-'+side.edgeIndex+'-'+i} start={a} end={b}
          height={topY-(course.row+.5)*(boardFace+Number(values.skirtingGapIn??.25)/12)}
          thickness={boardFace} depth={.08} color={color} texture={skirtMap}/>;
      });
      return side.finish.map((board,i)=>{
        const [x,z]=station(board.station);
        const bh=Math.min(height,Math.max(.1,board.heightFt));
        return <mesh key={'vertical-skirt-'+side.edgeIndex+'-'+i}
          position={[x,topY-bh/2,z]} rotation={[0,angle,0]} castShadow>
          <boxGeometry args={[boardFace,bh,.075]}/>
          <meshStandardMaterial map={skirtMap??undefined} color={skirtMap?'#ffffff':color}
            roughness={.85} toneMapped={!skirtMap}/>
        </mesh>;
      });
    })}
  </group>;
}
function Stairs3D({model,center,height,values}:{model:DeckModel;center:P2;height:number;values:Values}){
  const treadName=values.stairTreadStyle==='match'||!values.stairTreadStyle?
    values.deckingMaterial:values.stairTreadStyle;
  const riserName=values.stairRiserStyle==='match'?values.deckingMaterial:
    values.stairRiserStyle==='fascia'?values.fasciaMaterial:values.deckingMaterial;
  const {map}=useManufacturerTexture(treadName);
  const {map:riserMap}=useManufacturerTexture(riserName);
  const {map:sideFascia}=useManufacturerTexture(values.fasciaMaterial==='match'?
    values.deckingMaterial:values.fasciaMaterial);
  const {map:skirtMap}=useManufacturerTexture(values.skirtingColor);
  const skirting=isTrue(values.skirtingEnabled)&&isTrue(values.skirtingStairsEnabled);
  const winding=model.points.reduce((sum,a,i)=>{
    const b=model.points[(i+1)%model.points.length];return sum+a.x*b.y-b.x*a.y;
  },0);
  return <group name="dimensioned-stairs-2x12-stringers-and-trim">
    {model.stairPlacements.map((placement,index)=>{
      if(!placement.start||!placement.end||placement.edgeIndex===null)return null;
      const dx=placement.end.x-placement.start.x,dz=placement.end.y-placement.start.y;
      const width=Math.hypot(dx,dz);
      if(width<.1)return null;
      const sx=dx/width,sz=dz/width;
      const nx=(winding>=0?dz:-dz)/width,nz=(winding>=0?-dx:dx)/width;
      const fromCenter:P2=[(placement.start.x+placement.end.x)/2-center[0],
        (placement.start.y+placement.end.y)/2-center[1]];
      const stairRise=Number(model.stairRiseFt)>0?model.stairRiseFt:height;
      const geo=stairFrameGeometry(stairRise,model.stairRunFt,model.stairTreadsPerRun,width);
      const angle=-Math.atan2(dz,dx);
      const world=(x:number,projection:number,y:number):P3=>
        [fromCenter[0]+sx*x+nx*projection,y,fromCenter[1]+sz*x+nz*projection];
      const toGround=Math.max(0,height-stairRise);
      return <group key={'flight-'+index} name={'stair-flight-'+index}>
        {Array.from({length:geo.treads},(_,i)=>{
          const reach=(i+.5)*geo.depth;
          const treadY=Math.max(toGround+.06,height-(i+1)*geo.rise);
          return <group key={'step-'+i}>
            {[0,1].map((board)=><mesh key={'board-'+board} castShadow receiveShadow
              position={world(0,reach+(board-.5)*geo.depth/2,treadY)}
              rotation={[0,angle,0]}>
              <boxGeometry args={[width,.105,geo.depth/2-.012]}/>
              <meshStandardMaterial map={map??undefined}
                color={map?'#ffffff':'#a9b2b3'} toneMapped={!map} roughness={.84}/>
            </mesh>)}
            <mesh castShadow position={world(0,(i+1)*geo.depth,Math.max(toGround+.05,treadY-geo.rise/2))}
              rotation={[0,angle,0]}>
              <boxGeometry args={[width,Math.max(.08,geo.rise-.045),.095]}/>
              <meshStandardMaterial map={riserMap??undefined}
                color={riserMap?'#ffffff':'#b2b5ae'} toneMapped={!riserMap} roughness={.8}/>
            </mesh>
          </group>;
        })}
        {Array.from({length:geo.stringers},(_,i)=>{
          const x=-width/2+width*i/Math.max(1,geo.stringers-1);
          return <SlopedPlank key={'real-2x12-stringer-'+i}
            from={world(x,.05,height-.24)}
            to={world(x,geo.run,toGround+.13)}
            depthFt={11.25/12} widthFt={1.5/12} color="#9b7852"/>;
        })}
        {[-1,1].map((side,i)=>{
          const x=side*(width/2+.04);
          return <group key={'fascia-side-'+i}>
            <SlopedPlank from={world(x,.05,height-.2)} to={world(x,geo.run,toGround+.16)}
              depthFt={.93} widthFt={.072} color="#adb4b1" texture={sideFascia}/>
            {skirting&&Array.from({length:Math.max(1,Math.floor(geo.run/(.4+Number(values.skirtingGapIn??.25)/12)))},(_,k)=>{
              const count=Math.max(1,Math.floor(geo.run/(.4+Number(values.skirtingGapIn??.25)/12)));
              const station=geo.run*(k+.5)/count;
              const top=height-station/geo.run*(stairRise-.15)-.35;
              const bh=Math.max(.08,top-toGround-.12);
              const [wx,_,wz]=world(x,station,toGround+bh/2+.12);
              return <mesh key={'stair-skirt-'+k} position={[wx,toGround+bh/2+.12,wz]}
                rotation={[0,angle,0]} castShadow>
                <boxGeometry args={[.075,bh,Math.max(.1,Number(values.skirtingFaceIn??4.5)/12)]}/>
                <meshStandardMaterial map={skirtMap??undefined}
                  color={skirtMap?'#ffffff':values.skirtingMaterial==='kdat'?'#a38b67':'#c8cac3'}
                  toneMapped={!skirtMap} roughness={.82}/>
              </mesh>;
            })}
          </group>;
        })}
      </group>;
    })}
  </group>;
}
export function ManufacturerDeck3D({model,project,center,deckHeight,covered=true}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;covered?:boolean;
}){
  const board=getDeckVisualProduct(project.values.deckingMaterial);
  return <group name="S&S-manufacturer-deck-and-real-framing">
    <DeckFraming model={model} center={center} height={deckHeight}/>
    <FloorSubstrate model={model} center={center} height={deckHeight}/>
    <PlankSurface model={model} center={center} height={deckHeight} boardName={project.values.deckingMaterial}/>
    <BorderTrim model={model} center={center} height={deckHeight} values={project.values}/>
    <DeckSkirtFascia model={model} center={center} height={deckHeight} values={project.values}/>
    <ManufacturerRailing3D model={model} values={project.values} center={center} deckHeight={deckHeight}/>
    <Stairs3D model={model} center={center} height={deckHeight} values={project.values}/>
    {covered&&<RenaissanceCover3D model={model} project={project} center={center} deckHeight={deckHeight}/>}
    {!board&&<group name="unverified-product-photo-missing"/>}
  </group>;
}
