import { useMemo } from 'react';
import type * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { buildDeckSkirting } from '../../lib/deckSkirting';
import { Block, Beam, SlopedBeam, type P2 } from './Primitives';

export function DeckSkirting3D({model,center,height,values,texture,lowerTier=false}:{
  model:DeckModel;center:P2;height:number;lowerTier?:boolean;
  values:ConsultationProject['values'];texture:THREE.Texture|null;
}){
  const rimDepth=Math.max(3.5,Number(model.joistSize.split('x')[1]??8)-.75);
  const plan=useMemo(()=>buildDeckSkirting(model.edgeSegments,model.exposedSegments,height,rimDepth,values,lowerTier?'lower':''),
    [model,values,height,rimDepth,lowerTier]);
  if(!plan.enabled||plan.sides.length===0)return null;
  const top=height-(rimDepth+1)/12;
  const color=plan.options.material==='kdat'?'#a89572':
    plan.options.material==='pvc'?'#cdd0cd':'#bab3a9';
  const showPhoto=plan.options.material!=='kdat';
  const winding=model.points.reduce((sum,p,i)=>{
    const q=model.points[(i+1)%model.points.length];
    return sum+p.x*q.y-q.x*p.y;
  },0);
  const outwardSign=winding>=0?1:-1;
  // Finish planks sit OUTSIDE the 2x4 support frame, leaving the real framing
  // hidden behind finished skirting rather than exposed in front of it.
  const point=(edge:typeof model.edgeSegments[number],s:number,
    layer:'frame'|'finish'|'jamb'='frame'):P2=>{
    const t=Math.min(1,Math.max(0,s/Math.max(.001,edge.length)));
    const dx=(edge.end.x-edge.start.x)/Math.max(.001,edge.length),
      dy=(edge.end.y-edge.start.y)/Math.max(.001,edge.length);
    const nx=dy*outwardSign,ny=-dx*outwardSign;
    const offset=layer==='finish'?.075:layer==='jamb'?.02:-.155;
    return [edge.start.x+(edge.end.x-edge.start.x)*t-center[0]+nx*offset,
      edge.start.y+(edge.end.y-edge.start.y)*t-center[1]+ny*offset];
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
        {side.bottomRails.map((rail,i)=>{
          const a=point(edge,rail.start),b=point(edge,rail.end);
          const grade=(s:number)=>side.startHeightFt+(side.endHeightFt-side.startHeightFt)*s/side.lengthFt;
          return <SlopedBeam key={'bottom2x4-'+i}
            start={[a[0],top-grade(rail.start)+.15,a[1]]}
            end={[b[0],top-grade(rail.end)+.15,b[1]]}
            thickness={.25} depth={.125} color="#79644c"/>;
        })}
        {side.verticals.map((v,i)=>{
          const [x,z]=point(edge,v.station);
          return <Block key={'stud2x4-'+i} position={[x,top-v.heightFt/2,z]}
            size={[edge.orientation==='horizontal'?.125:.292,v.heightFt,edge.orientation==='horizontal'?.292:.125]}
            color="#867054"/>;
        })}
        {plan.options.orientation==='vertical'
          ? side.finish.map((v,i)=>{
            const [x,z]=point(edge,Math.min(side.lengthFt,v.station+face/2),'finish');
            return <Block key={'vertical-finish-'+i} position={[x,top-v.heightFt/2,z]}
              size={[edge.orientation==='horizontal'?face:.082,v.heightFt,
                edge.orientation==='horizontal'?.082:face]}
              color={color} texture={showPhoto?texture:null}/>;
          })
          :side.courses.map((course,i)=>{
            const a=point(edge,course.start,'finish'),b=point(edge,course.end,'finish');
            const y=top-(course.row*(plan.options.faceIn+plan.options.gapIn)/12)-course.depthFt/2;
            return <Beam key={'horizontal-finish-'+i} start={a} end={b}
              height={y} thickness={course.depthFt} depth={.09}
              color={color} texture={showPhoto?texture:null}/>;
          })}
        {/* Hinged access gate leaf is actually modeled in its chosen gap,
            with inset framing, vertical/horizontal selected finish and hinges. */}
        {side.openings.filter(opening=>opening.kind==='hinged-gate').map((opening,i)=>{
          const h=Math.max(.3,
            (side.startHeightFt+(side.endHeightFt-side.startHeightFt)*
              (opening.offset+opening.width/2)/side.lengthFt)-.18);
          const middle=opening.offset+opening.width/2;
          const [x,z]=point(edge,middle,'finish');
          const width=Math.max(.2,opening.width-.09);
          const isHorizontal=edge.orientation==='horizontal';
          return <group key={'access-gate-leaf-'+i} name="placed-hinged-skirting-access-gate">
            <Block position={[x,top-h/2,z]}
              size={[isHorizontal?width:.075,h,isHorizontal?.075:width]}
              color={color} texture={showPhoto?texture:null}/>
            {[opening.offset+.12,opening.offset+opening.width-.12].map((station,k)=>{
              const [sx,sz]=point(edge,station,'finish');
              return <Block key={'access-gate-stile-'+k} position={[sx,top-h/2,sz]}
                size={[.08,h,.08]} color="#8c7357"/>;
            })}
            {[.25,.75].map((portion,k)=>{
              const [hx,hz]=point(edge,opening.offset,'jamb');
              return <Block key={'access-gate-hinge-'+k} position={[hx,top-h*portion,hz]}
                size={[.14,.13,.14]} color="#565b5f" metalness={.4}/>;
            })}
            <Block position={[x,top-h*.5,z]}
              size={[.11,.13,.11]} color="#555c60" metalness={.42}/>
          </group>;
        })}
        {/* Clear openings are excluded by the exact skirting cut model.
            Show their jamb boundaries, not fake solid infill. */}
        {side.openings.map((opening,i)=>[opening.offset,opening.offset+opening.width].map((s,k)=>{
          const [x,z]=point(edge,s,'jamb');
          return <Block key={'jamb-'+i+'-'+k} position={[x,top-(side.startHeightFt+side.endHeightFt)/4,z]}
            size={[.12,(side.startHeightFt+side.endHeightFt)/2,.12]} color="#81694d"/>;
        }))}
      </group>;
    })}
  </group>;
}
