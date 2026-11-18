import { useMemo } from 'react';
import type { DeckModel } from '../../lib/deckModel';
import { Beam, Block, type P2 } from './Primitives';
import { actualPostWidthFt, rimPlyCenterlines } from '../../lib/visualStructure';

type Point={x:number;y:number};
const edgeClip=(points:Point[],vertical:boolean,station:number):number[]=>{
  const hits:number[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    const v1=vertical?a.x:a.y,v2=vertical?b.x:b.y;
    if((v1<=station&&v2>station)||(v2<=station&&v1>station)){
      const t=(station-v1)/(v2-v1);
      hits.push((vertical?a.y:a.x)+t*((vertical?b.y:b.x)-(vertical?a.y:a.x)));
    }
  }
  return hits.sort((a,b)=>a-b);
};
const joistDepth=(size:string)=>size==='2x12'?11.25/12:size==='2x10'?9.25/12:7.25/12;
const beamDepth=(size:string)=>size==='2x12'?11.25/12:size==='PSL'?11.875/12:9.25/12;
const cm=(n:number)=>Number(n.toFixed(4));
export function DeckStructure3D({model,center,height}:{
  model:DeckModel;center:P2;height:number;
}){
  const boardThickness=.095;
  const joistD=joistDepth(model.joistSize);
  const beamD=beamDepth(model.beamMemberSize);
  const joistTop=height-boardThickness;
  const joistBottom=joistTop-joistD;
  const beamTop=joistBottom;
  const beamBottom=beamTop-beamD;
  const vertical=model.joistDirection==='vertical';
  const joists=useMemo(()=>{
    const all:{a:P2;b:P2;key:string}[]=[];
    model.joistPositions.forEach((station,i)=>{
      const hits=edgeClip(model.points,vertical,station);
      for(let k=0;k+1<hits.length;k+=2){
        const start=hits[k]+.04,end=hits[k+1]-.04;
        if(end-start<.08)continue;
        const a:P2=vertical?[station-center[0],start-center[1]]:[start-center[0],station-center[1]];
        const b:P2=vertical?[station-center[0],end-center[1]]:[end-center[0],station-center[1]];
        all.push({a,b,key:'J'+i+'-'+k});
      }
    });
    return all;
  },[model.points,model.joistPositions,vertical,center]);
  return <group name="actual-framing-joists-double-beams-notched-posts">
    {joists.map(joist=><Beam key={joist.key} start={joist.a} end={joist.b}
      height={joistTop-joistD/2} thickness={joistD} depth={1.5/12} color="#aa8560"/>)}
    {model.edgeSegments.map(edge=><group key={'rim-'+edge.index}>
      {rimPlyCenterlines(model.points,edge).map((ply,i)=><Beam key={'rim-ply-'+i}
        start={[ply.start.x-center[0],ply.start.y-center[1]]}
        end={[ply.end.x-center[0],ply.end.y-center[1]]}
        height={joistTop-joistD/2} thickness={joistD} depth={1.5/12}
        color={i===0?'#957356':'#b28b61'}/>)}
    </group>)}
    {model.beamLines.flatMap((line,index)=>line.segments.map((segment,i)=>{
      const a:P2=vertical?[segment.startX-center[0],line.y-center[1]]:[line.y-center[0],segment.startX-center[1]];
      const b:P2=vertical?[segment.endX-center[0],line.y-center[1]]:[line.y-center[0],segment.endX-center[1]];
      // Both 1.5" plies are physical, continuous below joists; end posts
      // carry the bottom of beam, rather than a thin visual bar.
      const delta=(vertical?1:-1)*.063;
      const off=(sign:number,p:P2):P2=>[p[0]+(vertical?0:sign*delta),p[1]+(vertical?sign*delta:0)];
      return <group key={'double-beam-'+index+'-'+i}>
        {[-1,1].map(n=><Beam key={n} start={off(n,a)} end={off(n,b)}
          height={beamTop-beamD/2} thickness={beamD} depth={1.5/12}
          color={model.beamMemberSize==='PSL'?'#a8916c':'#a47b54'}/>)}
      </group>;
    }))}
    {model.angledBeamLines.map((line,i)=><Beam key={'angled-member-'+i}
      start={[line.start.x-center[0],line.start.y-center[1]]}
      end={[line.end.x-center[0],line.end.y-center[1]]}
      height={beamTop-beamD/2} thickness={beamD} depth={3/12} color="#a47b54"/>)}
    {model.postLocations.map(post=>{
      const x=cm(post.x-center[0]),z=cm(post.y-center[1]);
      const nominal=actualPostWidthFt(model.postSize);
      const clear=Math.max(.1,beamBottom);
      const footerSize=Math.max(.72,model.footingDiameterIn/12);
      return <group key={'support-'+post.reference}>
        <Block position={[x,clear/2,z]} size={[nominal,clear,nominal]} color="#977651"/>
        {/* Notched cheek fragments visibly seat the doubled drop beam. */}
        {post.beamIndex!==null&&<group>
          <Block position={[x-(vertical?0:nominal*.36),beamBottom+.18,z-(vertical?nominal*.36:0)]}
            size={[vertical?nominal:nominal*.27,.36,vertical?nominal*.27:nominal]} color="#9a7855"/>
          <Block position={[x+(vertical?0:nominal*.36),beamBottom+.18,z+(vertical?nominal*.36:0)]}
            size={[vertical?nominal:nominal*.27,.36,vertical?nominal*.27:nominal]} color="#9a7855"/>
        </group>}
        <mesh position={[x,.075,z]} receiveShadow>
          <cylinderGeometry args={[footerSize/2,footerSize/2,.15,14]}/>
          <meshStandardMaterial color="#aeb4b2" roughness={.92}/>
        </mesh>
        <Block position={[x,.17,z]} size={[nominal+.09,.18,nominal+.09]} color="#747f81" metalness={.3}/>
      </group>;
    })}
  </group>;
}
