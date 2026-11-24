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
/** A stair-side board is cut to the fascia's diagonal underside, not a square box. */
function StairSkirtPanel({contour,x,color,texture}:{
  contour:readonly (readonly [number,number])[];
  x:number;color:string;texture:THREE.Texture|null;
}){
  const geometry=useMemo(()=>{
    if(contour.length<3)return null;
    const shape=new THREE.Shape();
    contour.forEach(([runFt,riseFt],i)=>{
      if(i===0)shape.moveTo(runFt,riseFt);
      else shape.lineTo(runFt,riseFt);
    });
    shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.075,steps:1,bevelEnabled:false});
    geo.translate(0,0,-.0375);
    geo.rotateY(-Math.PI/2);
    geo.computeVertexNormals();
    return geo;
  },[contour]);
  useEffect(()=>()=>geometry?.dispose(),[geometry]);
  if(!geometry)return null;
  return <mesh geometry={geometry} position={[x,0,0]} castShadow receiveShadow>
    <meshStandardMaterial color={texture?'#ffffff':color} map={texture??null}
      roughness={.82} side={THREE.DoubleSide}/>
  </mesh>;
}
const clipUnderSlope=(rectangle:Array<readonly [number,number]>,
  heightAt:(z:number)=>number):Array<readonly [number,number]>=>{
  const result:Array<readonly [number,number]>=[];
  const d=(p:readonly [number,number])=>p[1]-heightAt(p[0]);
  for(let i=0;i<rectangle.length;i++){
    const a=rectangle[i],b=rectangle[(i+1)%rectangle.length];
    const da=d(a),db=d(b);
    if(da<=.000001)result.push(a);
    if((da<0&&db>0)||(da>0&&db<0)){
      const t=da/(da-db);
      result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return result;
};
function Flight({placement,model,center,height,values,texture,fasciaTexture,riserTexture,skirtTexture}:{
  placement:StairPlacement;model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
  riserTexture:THREE.Texture|null;skirtTexture:THREE.Texture|null;
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
  // Two individual 5.5-inch boards separated by 1/8 inch on an 11-inch tread.
  const boardFaceFt=5.5/12,boardGapFt=.125/12;
  const fasciaRisers=values.stairRiserStyle==='fascia'||
    (values.stairRiserStyle==='auto'&&values.deckingType!=='pressure-treated');
  const nosingFt=(fasciaRisers ? 0.5 : 1)/12;
  const stringers=Math.max(2,Math.ceil(width)+1);
  const geo=useMemo(()=>makeStringer(treadDepth,treads,rise,height),[treadDepth,treads,rise,height]);
  const straightFasciaGeo=useMemo(()=>makeStraightFascia(treadDepth,treads,rise,height),
    [treadDepth,treads,rise,height]);
  const fasciaStyle=values.stairFasciaStyle==='straight'?'straight':'profiled';
  // Center the facade thickness about its intended stair-edge station rather
  // than projecting the extrusion to just one side of the stringer.
  const fasciaGeo=useMemo(()=>{
    const g=(fasciaStyle==='straight'?straightFasciaGeo:geo).clone();
    g.translate(0,0,-.0625);
    g.rotateY(-Math.PI/2);
    g.computeVertexNormals();
    return g;
  },[geo,straightFasciaGeo,fasciaStyle]);
  useEffect(()=>()=>{geo.dispose();straightFasciaGeo.dispose();fasciaGeo.dispose();},
    [geo,straightFasciaGeo,fasciaGeo]);
  const skirt=values.skirtingEnabled===true&&values.skirtingStairsEnabled!==false;
  const boardFace=Math.max(.25,Number(values.skirtingFaceIn??4.5)/12);
  const boardGap=Math.max(0,Number(values.skirtingGapIn??.25)/12);
  const horizontal=values.skirtingOrientation==='horizontal';
  const finish=values.skirtingMaterial==='pvc'?'#d8dad6':values.skirtingMaterial==='composite'?
    '#bcb5aa':'#b19a79';
  const fascia=values.stairStringerFascia!==false;
  const contour=planStraightStairFascia({treadDepthFt:treadDepth,treads,riseFt:rise,heightFt:height});
  const lowerStart=fasciaStyle==='straight'?contour[3].riseFt:Math.max(.05,height-rise-.72);
  const lowerEnd=fasciaStyle==='straight'?contour[2].riseFt:
    Math.max(.055,height-(treads+1)*rise+.02);
  const underFasciaAt=(station:number)=>Math.max(.04,
    lowerStart+(lowerEnd-lowerStart)*Math.max(0,Math.min(1,station/run))-.04);
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
        {Array.from({length:2},(_,boardIndex)=>{
          const front=(i+1)*treadDepth+nosingFt;
          const centerZ=front-boardFaceFt/2-boardIndex*(boardFaceFt+boardGapFt);
          return <mesh key={'individual-deck-tread-board-'+i+'-'+boardIndex}
            position={[0,stepHeight+.05,centerZ]} castShadow receiveShadow>
            <boxGeometry args={[width,.105,boardFaceFt]}/>
            {texture
              ? <>
                <meshStandardMaterial attach="material-0" color="#ffffff" map={texture} roughness={.77}/>
                <meshStandardMaterial attach="material-1" color="#ffffff" map={texture} roughness={.77}/>
                <meshBasicMaterial attach="material-2" color="#ffffff" map={texture} toneMapped={false}/>
                <meshStandardMaterial attach="material-3" color="#786a5e" roughness={.87}/>
                <meshStandardMaterial attach="material-4" color="#ffffff" map={texture} roughness={.77}/>
                <meshStandardMaterial attach="material-5" color="#ffffff" map={texture} roughness={.77}/>
              </>
              :<meshStandardMaterial color="#b6b8b9" roughness={.82}/>}
          </mesh>;
        })}
        {/* Move riser fascia in FRONT of the stringer plumb cut (rather than
            coplanar with it), while preserving the selected tread nosing. */}
        {values.stairRiserStyle!=='open'&&<Block
          position={[0,stepHeight-rise/2+.04,(i+1)*treadDepth-.004]}
          size={[width,Math.max(.12,rise-.08),.07]}
          color={riserTexture?'#ffffff':'#ac9885'} texture={riserTexture}/>}
      </group>;
    })}
    {[-1,1].map((sign)=>{
      const x=sign*(width/2+.08),n=Math.max(2,Math.ceil(run/(boardFace+boardGap)));
      return <group key={'stair-side-'+sign}>
        {fascia&&<mesh geometry={fasciaGeo}
          position={[x,0,0]} castShadow receiveShadow>
          <meshStandardMaterial color={fasciaTexture?'#ffffff':'#92795e'}
            map={fasciaTexture??null} side={THREE.DoubleSide} roughness={.78}/>
        </mesh>}
        {/* Actual polygon-cut skirting follows the underside of the fascia. */}
        {skirt&&(horizontal
          ?Array.from({length:Math.ceil(lowerStart/(boardFace+boardGap))},(_,i)=>{
            const bottom=.10+i*(boardFace+boardGap);
            const topBoard=bottom+boardFace;
            const contour=clipUnderSlope([
              [0,bottom],[run,bottom],[run,topBoard],[0,topBoard],
            ],underFasciaAt);
            if(contour.length<3)return null;
            return <StairSkirtPanel key={'slope-cut-horizontal-skirt-'+i}
              x={sign*(width/2-.09)} contour={contour}
              color={finish} texture={skirtTexture}/>;
          })
          :Array.from({length:n},(_,i)=>{
            const start=i*(boardFace+boardGap);
            const end=Math.min(run,start+boardFace);
            if(end-start<.025)return null;
            const contour=clipUnderSlope([
              [start,.10],[end,.10],[end,Math.max(.10,underFasciaAt(end))],
              [start,Math.max(.10,underFasciaAt(start))],
            ],underFasciaAt);
            if(contour.length<3)return null;
            return <StairSkirtPanel key={'slope-cut-vertical-skirt-'+i}
              x={sign*(width/2-.09)} contour={contour}
              color={finish} texture={skirtTexture}/>;
          }))}
        {skirt&&[0,1].map((endIdx)=><Block key={'concealed-stair-skirt-support-'+endIdx}
          position={[sign*(width/2-.22),.20+endIdx*.22,run/2]}
          size={[.125,.25,run]} color="#7c664c"/>)}
      </group>;
    })}
  </group>;
}
export function DeckStairAssembly3D({model,center,height,values,texture,fasciaTexture,riserTexture,skirtTexture}:{
  model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
  riserTexture:THREE.Texture|null;skirtTexture:THREE.Texture|null;
}){
  if(!model.stairCount||!model.stairPlacements.length)return null;
  return <group name="stair-stringer-framing-and-selectable-fascia">
    {model.stairPlacements.filter(item=>item.start&&item.end&&item.edgeIndex!==null).map((placement,i)=>
      <Flight key={placement.edgeIndex+'-'+i} placement={placement} model={model}
        center={center} height={height} values={values} texture={texture}
        fasciaTexture={fasciaTexture} riserTexture={riserTexture}
        skirtTexture={skirtTexture}/>)}
  </group>;
}
