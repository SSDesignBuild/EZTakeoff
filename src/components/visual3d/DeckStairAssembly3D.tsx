import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { DeckModel, StairPlacement } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { Block, type P2 } from './Primitives';
import { planStraightStairFascia } from '../../lib/stairFasciaGeometry';

const riseFor=(model:DeckModel,height:number)=>height/Math.max(1,model.stairRisers);
function makeStringer(runFt:number,treads:number,riseFt:number,height:number){
  // A sawn 2x12-style stair stringer has horizontal tread seats, plumb
  // riser cuts and a continuous diagonal lower edge; it is not a cylinder.
  const shape=new THREE.Shape();
  shape.moveTo(0,height-riseFt-.04);
  for(let i=0;i<treads;i++){
    const z=(i+1)*runFt,stepY=height-(i+1)*riseFt-.04;
    shape.lineTo(z,stepY);
    if(i<treads-1)shape.lineTo(z,stepY-riseFt);
  }
  shape.lineTo(treads*runFt,Math.max(.055,height-(treads+1)*riseFt+.02));
  shape.lineTo(0,Math.max(.05,height-riseFt-.72));
  shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.125,bevelEnabled:false,steps:1});
  geo.computeVertexNormals();
  return geo;
}
function makeStraightFascia(runFt:number,treads:number,riseFt:number,height:number){
  const contour=planStraightStairFascia({
    treadDepthFt:runFt,treads,riseFt,heightFt:height,
  });
  const shape=new THREE.Shape();
  contour.forEach((p,i)=>{
    if(i===0)shape.moveTo(p.runFt,p.riseFt);
    else shape.lineTo(p.runFt,p.riseFt);
  });
  shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.125,steps:1,bevelEnabled:false});
  geo.computeVertexNormals();
  return geo;
}
function Flight({placement,model,center,height,values,texture,fasciaTexture}:{
  placement:StairPlacement;model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
}){
  const start=placement.start!,end=placement.end!;
  const dx=end.x-start.x,dz=end.y-start.y;
  const width=Math.hypot(dx,dz);
  const winding=model.points.reduce((sum,p,i)=>{
    const next=model.points[(i+1)%model.points.length];return sum+p.x*next.y-next.x*p.y;
  },0);
  const outwardX=(winding>=0?dz:-dz)/width,outwardZ=(winding>=0?-dx:dx)/width;
  const yaw=Math.atan2(outwardX,outwardZ);
  const treads=Math.max(1,model.stairTreadsPerRun);
  const rise=riseFor(model,height);
  const treadDepth=Math.max(.65,model.stairRunFt/treads);
  const run=treads*treadDepth;
  const stringers=Math.max(2,Math.ceil(width)+1);
  const geo=useMemo(()=>makeStringer(treadDepth,treads,rise,height),[treadDepth,treads,rise,height]);
  const straightFasciaGeo=useMemo(()=>makeStraightFascia(treadDepth,treads,rise,height),
    [treadDepth,treads,rise,height]);
  useEffect(()=>()=>{geo.dispose();straightFasciaGeo.dispose();},[geo,straightFasciaGeo]);
  const skirt=values.skirtingEnabled===true&&values.skirtingStairsEnabled!==false;
  const boardFace=Math.max(.25,Number(values.skirtingFaceIn??4.5)/12);
  const boardGap=Math.max(0,Number(values.skirtingGapIn??.25)/12);
  const horizontal=values.skirtingOrientation==='horizontal';
  const finish=values.skirtingMaterial==='pvc'?'#d8dad6':values.skirtingMaterial==='composite'?
    '#bcb5aa':'#b19a79';
  const fascia=values.stairStringerFascia!==false;
  const fasciaStyle=values.stairFasciaStyle==='straight'?'straight':'profiled';
  return <group name={'stair-flight-'+placement.edgeIndex}
    position={[(start.x+end.x)/2-center[0],0,(start.y+end.y)/2-center[1]]}
    rotation={[0,yaw,0]}>
    {Array.from({length:stringers},(_,i)=>{
      const x=-width/2+width*i/(stringers-1);
      return <mesh key={'2x12-stringer-'+i} geometry={geo} position={[x,0,0]}
        rotation={[0,-Math.PI/2,0]} castShadow receiveShadow>
        <meshStandardMaterial color="#977759" roughness={.9}/>
      </mesh>;
    })}
    {Array.from({length:treads},(_,i)=>{
      const stepHeight=Math.max(.09,height-(i+1)*rise);
      return <group key={'stair-tread-'+i}>
        <mesh position={[0,stepHeight+.05,(i+.5)*treadDepth]} castShadow receiveShadow>
          <boxGeometry args={[width,.105,treadDepth-.035]}/>
          {texture
            ? <>
              <meshStandardMaterial attach="material-0" color="#92867a" map={texture} roughness={.77}/>
              <meshStandardMaterial attach="material-1" color="#92867a" map={texture} roughness={.77}/>
              <meshBasicMaterial attach="material-2" color="#ffffff" map={texture} toneMapped={false}/>
              <meshStandardMaterial attach="material-3" color="#786a5e" roughness={.87}/>
              <meshStandardMaterial attach="material-4" color="#92867a" map={texture} roughness={.77}/>
              <meshStandardMaterial attach="material-5" color="#92867a" map={texture} roughness={.77}/>
            </>
            :<meshStandardMaterial color="#b6b8b9" roughness={.82}/>}
        </mesh>
        {values.stairRiserStyle!=='open'&&<Block
          position={[0,stepHeight-rise/2+.01,(i+1)*treadDepth-.035]}
          size={[width,Math.max(.12,rise-.09),.07]}
          color={values.stairRiserStyle==='fascia'?'#d9d4ce':'#aa9884'}/>}
      </group>;
    })}
    {[-1,1].map((sign)=>{
      const x=sign*(width/2+.08),n=Math.max(2,Math.ceil(run/(boardFace+boardGap)));
      return <group key={'stair-side-'+sign}>
        {fascia&&<mesh geometry={fasciaStyle==='straight'?straightFasciaGeo:geo}
          position={[x,0,0]} rotation={[0,-Math.PI/2,0]} castShadow receiveShadow>
          <meshStandardMaterial color={fasciaTexture?'#ffffff':'#a99a89'}
            map={fasciaTexture} roughness={.78}/>
        </mesh>}
        {skirt&&(horizontal
          ?Array.from({length:Math.ceil(height/(boardFace+boardGap))},(_,i)=>{
            const y=.15+i*(boardFace+boardGap)+boardFace/2;
            const visible=Math.max(0,Math.min(run,run*(1-y/Math.max(.01,height))));
            if(visible<.18)return null;
            return <Block key={'skirt-course-'+i}
              position={[x+sign*.12,y,visible/2]}
              size={[.07,boardFace,visible]} color={finish}/>;
          })
          :Array.from({length:n},(_,i)=>{
            const z=(i+.5)*(run/n);
            const available=Math.max(.15,height*(1-z/run)-.34);
            return <Block key={'skirt-vertical-'+i}
              position={[x+sign*.12,available/2,z]}
              size={[.072,available,Math.min(boardFace,run/n-.015)]} color={finish}/>;
          }))}
        {skirt&&[0,1].map((endIdx)=><Block key={'skirt-support-'+endIdx}
          position={[x+sign*.08,.26+endIdx*.22,run/2]}
          size={[.125,.25,run]} color="#7c664c"/>)}
      </group>;
    })}
  </group>;
}
export function DeckStairAssembly3D({model,center,height,values,texture,fasciaTexture}:{
  model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
}){
  if(!model.stairCount||!model.stairPlacements.length)return null;
  return <group name="stair-stringer-framing-and-selectable-fascia">
    {model.stairPlacements.filter(item=>item.start&&item.end&&item.edgeIndex!==null).map((placement,i)=>
      <Flight key={placement.edgeIndex+'-'+i} placement={placement} model={model}
        center={center} height={height} values={values} texture={texture}
        fasciaTexture={fasciaTexture}/>)}
  </group>;
}
