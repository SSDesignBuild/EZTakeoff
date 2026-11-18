import { useMemo } from 'react';
import type * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { buildDeckSkirting } from '../../lib/deckSkirting';
import { Block, Beam, type P2 } from './Primitives';

export function DeckSkirting3D({model,center,height,values,texture}:{
  model:DeckModel;center:P2;height:number;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
}){
  const rimDepth=Math.max(3.5,Number(model.joistSize.split('x')[1]??8)-.75);
  const plan=useMemo(()=>buildDeckSkirting(model.edgeSegments,model.exposedSegments,height,rimDepth,values),
    [model,values,height,rimDepth]);
  if(!plan.enabled||plan.sides.length===0)return null;
  const top=height-(rimDepth+1)/12;
  const color=plan.options.material==='kdat'?'#a89572':
    plan.options.material==='pvc'?'#cdd0cd':'#bab3a9';
  const showPhoto=plan.options.material!=='kdat';
  const point=(edge:typeof model.edgeSegments[number],s:number):P2=>{
    const t=Math.min(1,Math.max(0,s/Math.max(.001,edge.length)));
    return [edge.start.x+(edge.end.x-edge.start.x)*t-center[0],
      edge.start.y+(edge.end.y-edge.start.y)*t-center[1]];
  };
  return <group name="exact-deck-skirting-selected-sides-access-and-grade">
    {plan.sides.map(side=>{
      const edge=model.edgeSegments.find(e=>e.index===side.edgeIndex);
      if(!edge)return null;
      const face=Math.max(.10,plan.options.faceIn/12);
      return <group key={'skirt-side-'+side.edgeIndex}>
        {side.topRails.map((rail,i)=><Beam key={'top2x4-'+i}
          start={point(edge,rail.start)} end={point(edge,rail.end)}
          height={top-.12} thickness={.25} depth={.125} color="#977a58"/>)}
        {side.bottomRails.map((rail,i)=><Beam key={'bottom2x4-'+i}
          start={point(edge,rail.start)} end={point(edge,rail.end)}
          height={Math.max(-2,top-(side.startHeightFt+side.endHeightFt)/2)+.15}
          thickness={.25} depth={.125} color="#79644c"/>)}
        {side.verticals.map((v,i)=>{
          const [x,z]=point(edge,v.station);
          return <Block key={'stud2x4-'+i} position={[x,top-v.heightFt/2,z]}
            size={[edge.orientation==='horizontal'?.125:.292,v.heightFt,edge.orientation==='horizontal'?.292:.125]}
            color="#867054"/>;
        })}
        {plan.options.orientation==='vertical'
          ? side.finish.map((v,i)=>{
            const [x,z]=point(edge,Math.min(side.lengthFt,v.station+face/2));
            return <Block key={'vertical-finish-'+i} position={[x,top-v.heightFt/2,z]}
              size={[edge.orientation==='horizontal'?face:.082,v.heightFt,
                edge.orientation==='horizontal'?.082:face]}
              color={color} texture={showPhoto?texture:null}/>;
          })
          :side.courses.map((course,i)=>{
            const a=point(edge,course.start),b=point(edge,course.end);
            const y=top-(course.row*(plan.options.faceIn+plan.options.gapIn)/12)-course.depthFt/2;
            return <Beam key={'horizontal-finish-'+i} start={a} end={b}
              height={y} thickness={course.depthFt} depth={.09}
              color={color} texture={showPhoto?texture:null}/>;
          })}
        {/* Clear openings are excluded by the exact skirting cut model.
            Show their jamb boundaries, not fake solid infill. */}
        {side.openings.map((opening,i)=>[opening.offset,opening.offset+opening.width].map((s,k)=>{
          const [x,z]=point(edge,s);
          return <Block key={'jamb-'+i+'-'+k} position={[x,top-(side.startHeightFt+side.endHeightFt)/4,z]}
            size={[.12,(side.startHeightFt+side.endHeightFt)/2,.12]} color="#81694d"/>;
        }))}
      </group>;
    })}
  </group>;
}
