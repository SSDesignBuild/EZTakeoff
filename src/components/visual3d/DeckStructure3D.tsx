import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { DeckFinishSupportPiece } from '../../lib/deckFinishSupport';
import { Beam, Block, type P2 } from './Primitives';
import { actualPostWidthFt } from '../../lib/visualStructure';
import { planRimPlies,planJoistCuts,planPostSaddleCheeks,type FramingCut,framingDepthFt } from '../../lib/constructionFraming';

const cm=(n:number)=>Number(n.toFixed(4));
function FlatFinishNailer({piece,center,top}:{piece:DeckFinishSupportPiece;center:P2;top:number}){
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();
    piece.corners.forEach((point,index)=>{
      const x=point.x-center[0],z=point.y-center[1];
      if(index===0)shape.moveTo(x,-z);else shape.lineTo(x,-z);
    });
    shape.closePath();
    const mesh=new THREE.ExtrudeGeometry(shape,{depth:piece.thicknessFt,bevelEnabled:false,steps:1});
    mesh.rotateX(-Math.PI/2);
    return mesh;
  },[piece,center]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh name={'flat-finish-support-'+piece.id} geometry={geometry}
    position={[0,top-piece.thicknessFt,0]} castShadow receiveShadow>
    <meshStandardMaterial color="#b6976d" roughness={.82}/>
  </mesh>;
}
export function DeckStructure3D({model,center,height}:{
  model:DeckModel;center:P2;height:number;
}){
  const boardThickness=model.deckBoardThicknessFt;
  const joistD=framingDepthFt(model.joistSize);
  const beamD=framingDepthFt(model.beamMemberSize);
  const joistTop=height-boardThickness;
  const joistBottom=joistTop-joistD;
  const beamTop=joistBottom;
  const beamBottom=beamTop-beamD;
  const vertical=model.joistDirection==='vertical';
  const rims=useMemo(()=>planRimPlies(model.points,model.edgeSegments),[model.points,model.edgeSegments]);
  const joists=useMemo(()=>planJoistCuts(model.points,model.edgeSegments,model.joistDirection,model.joistPositions,rims),[model.points,model.edgeSegments,model.joistDirection,model.joistPositions,rims]);
  return <group name="actual-framing-joists-double-beams-bearing-posts">
    <group name="continuous-flat-picture-frame-and-breaker-nailers">
      {model.finishSupport.pieces.map(piece=><FlatFinishNailer key={piece.id}
        piece={piece} center={center} top={joistTop}/>)}
    </group>
    {joists.map(cut=><InstalledFramingCut key={cut.id} cut={cut} center={center} bottom={joistBottom} depth={joistD} color="#aa8560"/>)}
    {rims.map(cut=><InstalledFramingCut key={cut.id} cut={cut} center={center} bottom={joistBottom} depth={joistD} color={cut.ply===0?'#957356':'#b28b61'}/>)}
    {model.beamLines.flatMap((line,index)=>line.segments.map((segment,i)=>{
      const a:P2=vertical?[segment.startX-center[0],line.y-center[1]]:[line.y-center[0],segment.startX-center[1]];
      const b:P2=vertical?[segment.endX-center[0],line.y-center[1]]:[line.y-center[0],segment.endX-center[1]];
      // Both 1.5" plies are physical, continuous below joists; end posts
      // carry the bottom of beam, rather than a thin visual bar.
      const delta=(vertical?1:-1)*(.75/12);
      const off=(sign:number,p:P2):P2=>[p[0]+(vertical?0:sign*delta),p[1]+(vertical?sign*delta:0)];
      return <group key={'double-beam-'+index+'-'+i}>
        {[-1,1].map(n=><Beam key={n} start={off(n,a)} end={off(n,b)}
          height={beamTop-beamD/2} thickness={beamD} depth={1.5/12}
          color={model.beamMemberSize==='PSL'?'#a8916c':'#a47b54'}/>)}
      </group>;
    }))}
    {model.angledBeamLines.flatMap((line,i)=>[-1,1].map(ply=>{
      const dx=line.end.x-line.start.x,dy=line.end.y-line.start.y,len=Math.hypot(dx,dy);
      const nx=-dy/len*ply*.75/12,ny=dx/len*ply*.75/12;
      return <Beam key={'angled-member-'+i+'-'+ply}
        start={[line.start.x+nx-center[0],line.start.y+ny-center[1]]}
        end={[line.end.x+nx-center[0],line.end.y+ny-center[1]]}
        height={beamTop-beamD/2} thickness={beamD} depth={1.5/12} color="#a47b54"/>;
    }))}
    {model.postLocations.map(post=>{
      const x=cm(post.x-center[0]),z=cm(post.y-center[1]);
      const nominal=actualPostWidthFt(model.postSize);
      const clear=Math.max(.1,beamBottom);
      const footerSize=Math.max(.72,model.footingDiameterIn/12);
      return <group key={'support-'+post.reference}>
        <Block position={[x,clear/2,z]} size={[nominal,clear,nominal]} color="#977651"/>
        {/* Preserve the legacy saddle visual with a real3-in slot. Cheek
            rise remains representative until the job connection is approved. */}
        {planPostSaddleCheeks(model,post,nominal).map((footprint,i)=><InstalledFramingCut key={'notch-cheek-'+i}
          cut={{id:`${post.reference}-CHEEK${i+1}`,footprint,from:footprint[0],to:footprint[1],lengthFt:nominal,widthFt:nominal}}
          center={center} bottom={beamBottom} depth={.36} color="#9a7855"/>)}
        <mesh position={[x,-model.footingDepthIn/24,z]} receiveShadow>
          <cylinderGeometry args={[footerSize/2,footerSize/2,model.footingDepthIn/12,32]}/>
          <meshStandardMaterial color="#aeb4b2" roughness={.92}/>
        </mesh>

      </group>;
    })}
  </group>;
}

function InstalledFramingCut({cut,center,bottom,depth,color}:{cut:FramingCut;center:P2;bottom:number;depth:number;color:string}){
  const geometry=useMemo(()=>{
    const shape=new THREE.Shape();cut.footprint.forEach((p,i)=>i===0?shape.moveTo(p.x-center[0],-(p.y-center[1])):shape.lineTo(p.x-center[0],-(p.y-center[1])));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);return g;
  },[cut,center,depth]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh name={'installed-framing-'+cut.id} geometry={geometry} position={[0,bottom,0]} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.82}/></mesh>;
}
