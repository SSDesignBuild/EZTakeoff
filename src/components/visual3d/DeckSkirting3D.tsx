import { useMemo } from 'react';
import type * as THREE from 'three';
import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { buildDeckSkirting } from '../../lib/deckSkirting';
import { planSkirtingGateFace } from '../../lib/skirtingGateFace';
import { Block, Beam, SlopedBeam, type P2 } from './Primitives';

/** Both the gate and the fixed header use real individually spaced finish
 * planks. The prior solid slab had no courses or reveals unlike adjacent skirting.
 */
function SkirtingAccessFace({width,height,orientation,faceIn,gapIn,color,texture}:{
  width:number;height:number;orientation:'vertical'|'horizontal';
  faceIn:number;gapIn:number;color:string;texture:THREE.Texture|null;
}){
  const boards=planSkirtingGateFace(width,height,orientation,faceIn,gapIn);
  return <group name="individual-skirting-access-finish-boards">
    {boards.map((board,i)=>orientation==='vertical'
      ?<Block key={'vertical-access-plank-'+i}
        position={[-width/2+board.stationFt+board.faceFt/2,0,0]}
        size={[board.faceFt,height,.075]} color={color} texture={texture}/>
      :<Block key={'horizontal-access-plank-'+i}
        position={[0,height/2-board.stationFt-board.faceFt/2,0]}
        size={[width,board.faceFt,.075]} color={color} texture={texture}/>)}
  </group>;
}
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
      const yaw=-Math.atan2(edge.end.y-edge.start.y,edge.end.x-edge.start.x);
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
          return <group key={'stud2x4-'+i} position={[x,top-v.heightFt/2,z]}
            rotation={[0,yaw,0]}>
            <Block position={[0,0,0]} size={[.125,v.heightFt,.292]} color="#867054"/>
          </group>;
        })}
        {plan.options.orientation==='vertical'
          ? side.finish.map((v,i)=>{
            const [x,z]=point(edge,Math.min(side.lengthFt,v.station+face/2),'finish');
            return <group key={'vertical-finish-'+i}
              position={[x,top-v.heightFt/2,z]} rotation={[0,yaw,0]}>
              <Block position={[0,0,0]} size={[face,v.heightFt,.082]}
                color={color} texture={showPhoto?texture:null}/>
            </group>;
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
          const middle=opening.offset+opening.width/2;
          const at=(station:number)=>side.startHeightFt+
            (side.endHeightFt-side.startHeightFt)*station/side.lengthFt;
          const leastGrade=Math.min(at(opening.offset),at(opening.offset+opening.width));
          const allowed=Math.max(.3,leastGrade-.18);
          const h=Math.max(.3,Math.min(allowed,opening.heightFt??allowed));
          const gateBottom=top-leastGrade+.09;
          const gateMid=gateBottom+h/2;
          const infillH=Math.max(0,allowed-h);
          const [x,z]=point(edge,middle,'finish');
          const width=Math.max(.2,opening.width-.08);
          return <group key={'access-gate-leaf-'+i} name="placed-hinged-skirting-access-gate">
            {infillH>.12&&<group name="fixed-skirting-infill-above-short-gate">
              {plan.options.orientation==='vertical'&&
                // Follow exactly the adjacent continuous wall-wide station
                // grid: never center a second patched upper-panel pattern.
                Array.from({length:Math.ceil(side.lengthFt/((plan.options.faceIn+
                  plan.options.gapIn)/12))},(_,boardIdx)=>{
                  const pitch=(plan.options.faceIn+plan.options.gapIn)/12;
                  const boardStart=boardIdx*pitch;
                  const clippedStart=Math.max(opening.offset,boardStart);
                  const clippedEnd=Math.min(opening.offset+opening.width,
                    boardStart+plan.options.faceIn/12);
                  if(clippedEnd-clippedStart<=.001)return null;
                  const [cx,cz]=point(edge,(clippedStart+clippedEnd)/2,'finish');
                  return <group key={'continuous-upper-wall-plank-'+boardIdx}
                    position={[cx,top-infillH/2,cz]} rotation={[0,yaw,0]}>
                    <Block position={[0,0,0]}
                      size={[clippedEnd-clippedStart,infillH,.082]}
                      color={color} texture={showPhoto?texture:null}/>
                  </group>;
                })}
              {/* Horizontal upper courses are ALREADY drawn by side.courses,
                  physically crossing the full gate width. Render no separate
                  upper infill face or phantom vertical patch seams. */}
              <Beam start={point(edge,opening.offset,'frame')}
                end={point(edge,opening.offset+opening.width,'frame')}
                height={top-infillH-.03} thickness={.125} depth={.25} color="#8b7657"/>
            </group>}
            <group position={[x,gateMid,z]} rotation={[0,yaw,0]}>
              <SkirtingAccessFace width={width} height={h}
                orientation={plan.options.orientation}
                faceIn={plan.options.faceIn} gapIn={plan.options.gapIn}
                color={color} texture={showPhoto?texture:null}/>
            </group>
            {[opening.offset+.12,opening.offset+opening.width-.12].map((station,k)=>{
              const [sx,sz]=point(edge,station,'finish');
              return <Block key={'access-gate-stile-'+k} position={[sx,gateMid,sz]}
                size={[.08,h,.08]} color="#8c7357"/>;
            })}
            {(h>4?[.20,.50,.80]:[.25,.75]).map((portion,k)=>{
              const [hx,hz]=point(edge,opening.offset,'jamb');
              return <Block key={'access-gate-hinge-'+k} position={[hx,gateBottom+h*portion,hz]}
                size={[.14,.13,.14]} color="#565b5f" metalness={.4}/>;
            })}
            <Block position={[x,gateMid,z]}
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
