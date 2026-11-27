import {planStairFasciaStockPieces,type StairFasciaStockPiece} from '../../lib/stairFasciaCuts';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { DeckModel, StairPlacement } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { Block, type P2 } from './Primitives';
import { planStairFasciaCoverage,type StairSideFasciaPoint } from '../../lib/stairFasciaGeometry';
import { planStairLandingForValues,landingSurface } from '../../lib/stairConcreteLanding';
import { stairFlightFrame } from '../../lib/stairRailVisualGeometry';
import { planConstructionStair,type StairProfilePoint } from '../../lib/constructionStairs';
import { resolveFasciaDimensions } from '../../lib/deckProductDimensions';
import { resolveStairSideFasciaMaterial,hasDecorativeStairFascia,stairFasciaDimensionOverrides } from '../../lib/deckTrimSelection';

function makeStringer(profile:readonly StairProfilePoint[]){
  const shape=new THREE.Shape();profile.forEach((p,i)=>i===0?shape.moveTo(p.stationFt,p.elevationFt):shape.lineTo(p.stationFt,p.elevationFt));shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:1.5/12,bevelEnabled:false,steps:1});geo.computeVertexNormals();return geo;
}
/** Selected manufacturer/configured finish cut from 12ft fascia stock.
 * Both primary and optional ripped lower strip use the SAME silhouette
 * orientation and selected finish texture, never the structural stringer. */
function makeStairFinishGeometry(outline:readonly StairSideFasciaPoint[],thickFt:number){
 if(outline.length<3)return null;
 const shape=new THREE.Shape();
 outline.forEach((p,i)=>i===0?
  shape.moveTo(p.runFt,p.riseFt):shape.lineTo(p.runFt,p.riseFt));
 shape.closePath();

 const g=new THREE.ExtrudeGeometry(shape,{
  depth:thickFt,bevelEnabled:false,curveSegments:1,steps:1,
 });
 g.translate(0,0,-thickFt/2);
 g.rotateY(-Math.PI/2);
 g.computeVertexNormals();
 return g;
}
function Flight({placement,model,center,height,values,texture,fasciaTexture,riserTexture}:{
  placement:StairPlacement;model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
  riserTexture:THREE.Texture|null;
}){
  // One physical frame authority for stair stringers, finishes and the
  // independently chosen stair railing. Enclosure placement never changes it.
  const stairFrame=stairFlightFrame(model,placement,center);
  const physical=planConstructionStair(model,placement,height,values);
  const width=physical?.widthFt??placement.width;
  const yaw=stairFrame?.yaw??0;
  const treads=Math.max(1,model.stairTreadsPerRun);
  const rise=physical?.riseFt??height/Math.max(1,model.stairRisers);
  const treadDepth=physical?.treadDepthFt??model.stairRunFt/treads;
  const run=treads*treadDepth;
  const landing=landingSurface(values.stairLandingSurface)==='bare-ground'
    ?planStairLandingForValues(width,values):null;
  const nosingFt=physical?.nosingFt??1/12;
  const stringerStations=physical?.stringerStations??[];
  const profile=physical?.stringerProfile??[];
  const geo=useMemo(()=>makeStringer(profile),[profile]);
  const fasciaDimensions=resolveFasciaDimensions(resolveStairSideFasciaMaterial(values),stairFasciaDimensionOverrides(values));
  const fasciaThicknessFt=fasciaDimensions.thicknessIn/12;
  const fasciaStyle=values.stairFasciaStyle==='straight'?'straight':'profiled';
  // A FINISH board has its own geometry, not a clone of the notched 2x12
  // structural stringer. Both stair sides use this one mirrored outline.
  const fasciaCoverage=useMemo(()=>planStairFasciaCoverage({
    treadDepthFt:treadDepth,treads,riseFt:rise,heightFt:height,style:fasciaStyle,
    nosingFt,boardFaceFt:fasciaDimensions.faceIn/12,boardThicknessIn:fasciaDimensions.thicknessIn,treadThicknessFt:physical?.treadThicknessFt,
  }),[treadDepth,treads,rise,height,fasciaStyle,nosingFt,fasciaDimensions.faceIn,fasciaDimensions.thicknessIn,physical?.treadThicknessFt]);
  const fasciaCuts=useMemo(()=>planStairFasciaStockPieces(fasciaCoverage,rise,treadDepth),[fasciaCoverage,rise,treadDepth]);
  useEffect(()=>()=>geo.dispose(),[geo]);
  const fascia=hasDecorativeStairFascia(values);
  return <group name={'stair-flight-'+placement.edgeIndex}
    position={[stairFrame?.originX??0,0,stairFrame?.originZ??0]}
    rotation={[0,yaw,0]}>
    {/* The measured concrete pad sits at the stair exit, rather than
        under the entire staircase. Most of its thickness is below grade. */}
    {landing&&<group name="automatic-dimensioned-concrete-stair-landing">
      <Block position={[0,-landing.thicknessIn/24,run+landing.depthFt/2]}
        size={[landing.widthFt,landing.thicknessIn/12,landing.depthFt]}
        color="#aaa9a5"/>
    </group>}
    {stringerStations.map((x,i)=>{
      return <mesh key={'2x12-stringer-'+i} geometry={geo} position={[x,0,0]}
        rotation={[0,-Math.PI/2,0]} castShadow receiveShadow>
        <meshStandardMaterial color="#977759" roughness={.9}/>
      </mesh>;
    })}
    {(physical?.treadBoards??[]).map(board=><mesh key={'individual-deck-tread-board-'+board.step+'-'+board.board}
      position={[0,(board.topFt+board.bottomFt)/2,(board.startFt+board.endFt)/2]} castShadow receiveShadow>
      <boxGeometry args={[width,board.topFt-board.bottomFt,board.endFt-board.startFt]}/>
      {texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false}/>:<meshStandardMaterial color="#b6b8b9" roughness={.82}/>}
    </mesh>)}
    {(physical?.risers??[]).map(riser=><Block key={'individual-riser-'+riser.step+'-'+riser.board}
      position={[0,(riser.bottomFt+riser.topFt)/2,riser.stationFt+riser.thicknessFt/2]}
      size={[width,riser.topFt-riser.bottomFt,riser.thicknessFt]}
      color={riserTexture?'#ffffff':'#ac9885'} texture={riserTexture}/>)}
    {[-1,1].map(sign=><group key={'stair-side-'+sign}>
      {fascia&&fasciaCuts.map(cut=><StairFasciaCut key={cut.kind+'-'+cut.index} cut={cut}
        x={sign*(width/2+fasciaThicknessFt/2)} thickness={fasciaThicknessFt} texture={fasciaTexture}/>)}
    </group>)}
  </group>;
}
export function DeckStairAssembly3D({model,center,height,values,texture,fasciaTexture,riserTexture}:{
  model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
  fasciaTexture:THREE.Texture|null;
  riserTexture:THREE.Texture|null;
}){
  if(!model.stairCount||!model.stairPlacements.length)return null;
  return <group name="stair-stringer-framing-and-selectable-fascia">
    {model.stairPlacements.filter(item=>item.start&&item.end&&item.edgeIndex!==null).map((placement,i)=>
      <Flight key={placement.edgeIndex+'-'+i} placement={placement} model={model}
        center={center} height={height} values={values} texture={texture}
        fasciaTexture={fasciaTexture} riserTexture={riserTexture}
/>)}
  </group>;
}

function StairFasciaCut({cut,x,thickness,texture}:{cut:StairFasciaStockPiece;x:number;thickness:number;texture:THREE.Texture|null}){
  const geometry=useMemo(()=>makeStairFinishGeometry(cut.outline,thickness),[cut,thickness]);
  useEffect(()=>()=>geometry?.dispose(),[geometry]);
  if(!geometry)return null;
  return <mesh name={cut.kind==='main'?'actual-selected-stair-side-fascia-cut':'lower-ripped-fascia-strip-conceals-structural-stringer'} geometry={geometry} position={[x,0,0]} castShadow receiveShadow>
    {texture?<meshBasicMaterial color="#ffffff" map={texture} toneMapped={false} side={THREE.DoubleSide}/>:<meshStandardMaterial color="#92795e" side={THREE.DoubleSide} roughness={.78}/>}</mesh>;
}
