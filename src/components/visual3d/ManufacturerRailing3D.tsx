import type { DeckModel } from '../../lib/deckModel';
import { getRailVisualProduct, railVisualProducts, type RailVisualProduct } from '../../data/visualCatalog';
import { Beam, Block, Rod, type P2, type P3 } from './Primitives';
import { parseDeckGates } from '../../lib/deckGates';
import { subtractRailingOpenings } from '../../lib/salesRailOpenings';

type Values=Record<string,string|number|boolean>;
const colors:Record<string,string>={
  white:'#e5e6e2','matte-white':'#e5e3dc',black:'#222629','matte-black':'#242628',
  'dark-bronze':'#55463a','matte-espresso':'#372c25',kona:'#60462e',khaki:'#b6a68e',
  'pressure-treated':'#987c59',
};
function resolveStyle(values:Values):RailVisualProduct {
  if(typeof values.railingVisualId==='string')return getRailVisualProduct(values.railingVisualId);
  const type=String(values.railingType??'aluminum');
  if(type==='wood')return getRailVisualProduct(values.spindleType==='black-round'?'sns-wood-round':'sns-wood-pickets');
  if(type.includes('vinyl')||type==='vinyl-composite')return getRailVisualProduct('tt-statement');
  const profile=values.railingTopProfile==='modern'?'tt-ire-modern':values.railingTopProfile==='drink'?'tt-ire-drink':'tt-ire-classic';
  return getRailVisualProduct(profile);
}
export function ManufacturerRailing3D({model,values,center,deckHeight,screenIntegrated=false}:{
  model:DeckModel;values:Values;center:P2;deckHeight:number;
  screenIntegrated?:boolean;
}){
  const style=resolveStyle(values);
  const finish=String(values.railingColor??style.colors[0]);
  const color=colors[style.colors.includes(finish)?finish:style.colors[0]]??'#292c30';
  const infill=style.infills.includes(String(values.railingInfill) as typeof style.infills[number])
    ?String(values.railingInfill):style.infills[0];
  const metallic=style.family==='metal', wooden=style.family==='wood';
  const topWidth=style.topWidthIn/12,topThick=Math.max(.12,style.topHeightIn/12);
  const height=Math.max(3,Math.min(3.5,Number(values.railingHeightIn??36)/12));
  const yTop=deckHeight+height,yBottom=deckHeight+.28;
  const postWidth=style.postWidthIn/12;
  const hideCap=['flush-top','flush-drink'].includes(String(values.railingPostTermination));
  const edgeMap=new Map(model.edgeSegments.map((edge)=>[edge.index,edge]));
  const gates=parseDeckGates(values.deckGateEntries);
  const gatePlacements=gates.flatMap(gate=>{
    const edge=edgeMap.get(gate.edgeIndex??-1);
    if(!edge)return [];
    const stair=gate.placement==='stairs'?model.stairPlacements.find(s=>s.edgeIndex===edge.index):undefined;
    const width=Math.min(edge.length,Math.max(.5,stair?.width??gate.widthFt));
    const start=Math.min(Math.max(0,edge.length-width),Math.max(0,stair?.offset??gate.offsetFt??0));
    return [{...gate,edgeIndex:edge.index,start,end:start+width}];
  });
  const stairOpenings=model.stairPlacements.filter(s=>s.edgeIndex!==null)
    .map(s=>({edgeIndex:s.edgeIndex!,startFt:s.offset,endFt:s.offset+s.width}));
  const gateOpenings=gatePlacements.map(g=>({edgeIndex:g.edgeIndex,startFt:g.start,endFt:g.end}));
  // A PCA screen entry does not authorize a gap in a required deck guardrail.
  // Only explicit stair openings or individually configured railing gates
  // can remove railing sections. The screen door remains independent.
  const visibleRails=screenIntegrated?[]:subtractRailingOpenings(model.railCoverage,
    [...stairOpenings,...gateOpenings],.08);
  const startCoords=(edge:typeof model.edgeSegments[number],position:number):P2=>{
    const t=Math.max(0,Math.min(1,position/Math.max(.001,edge.length)));
    return [edge.start.x+(edge.end.x-edge.start.x)*t-center[0],
      edge.start.y+(edge.end.y-edge.start.y)*t-center[1]];
  };
  return <group name={'railing-'+style.id}>
    {visibleRails.map((coverage,index)=>{
      const edge=edgeMap.get(coverage.edgeIndex);
      if(!edge)return null;
      const runLength=coverage.end-coverage.start;
      if(runLength<=.05)return null;
      const from=startCoords(edge,coverage.start),to=startCoords(edge,coverage.end);
      const bays=Math.max(1,Math.ceil(runLength/(metallic?7.1:6)));
      const at=(t:number):P2=>startCoords(edge,coverage.start+runLength*t);
      const isGlass=infill==='glass';
      return <group key={'railing-'+index}>
        <Beam start={from} end={to} height={yBottom} thickness={wooden ? .26 : .11} depth={wooden ? .28 : .13} color={color} metalness={metallic ? .64 : 0}/>
        <Beam start={from} end={to} height={yTop-.13} thickness={topThick} depth={topWidth} color={color} metalness={metallic ? .68 : 0}/>
        {style.geometry==='ire-classic'&&<>
          <Beam start={from} end={to} height={yTop+.025} thickness={.055} depth={topWidth+.045} color={color} metalness={.7}/>
          <Beam start={from} end={to} height={yTop-.26} thickness={.045} depth={topWidth*.72} color={color} metalness={.7}/>
        </>}
        {style.geometry==='ire-modern'&&<Beam start={from} end={to} height={yTop+.045} thickness={.055} depth={topWidth+.018} color={color} metalness={.7}/>}
        {style.geometry.includes('drink')&&<Beam start={from} end={to} height={yTop+.075} thickness={.093} depth={5.5/12} color="#a28767"/>}
        {(style.family==='pvc'||style.family==='composite'||style.family==='vinyl')&&<>
          <Beam start={from} end={to} height={yTop+.065} thickness={.055} depth={topWidth+.07} color={color}/>
          <Beam start={from} end={to} height={yTop-.25} thickness={.065} depth={topWidth*.65} color={color}/>
        </>}
        {wooden&&<Beam start={from} end={to} height={yTop-.33} thickness={.18} depth={3.5/12} color={color}/>}
        {infill==='midrail'&&<Beam start={from} end={to} height={deckHeight+height/2+.02} thickness={.11} depth={.13} color={color} metalness={.5}/>}
        {Array.from({length:bays+1},(_,i)=>{
          const p=at(i/bays);
          return <group key={'railing-post-'+i}>
            <Block position={[p[0],deckHeight+height/2,p[1]]}
              size={[postWidth,height+.08,postWidth]} color={color} metalness={metallic ? .65 : .025}/>
            {!hideCap&&<Block position={[p[0],yTop+.06,p[1]]}
              size={[postWidth+.045,.085,postWidth+.045]} color={color} metalness={metallic ? .66 : 0}/>}
            {!wooden&&<Block position={[p[0],deckHeight+.07,p[1]]}
              size={[postWidth+.06,.135,postWidth+.06]} color={color} metalness={metallic ? .6 : 0}/>}
          </group>;
        })}
        {isGlass&&<mesh position={[(from[0]+to[0])/2,deckHeight+height/2+.04,(from[1]+to[1])/2]}
          rotation={[0,-Math.atan2(to[1]-from[1],to[0]-from[0]),0]}>
          <boxGeometry args={[runLength-.22,height-.52,.028]}/>
          <meshPhysicalMaterial color="#b9dbe5" transparent opacity={.34} roughness={.08} metalness={.06}
            depthWrite={false} side={2}/>
        </mesh>}
        {infill==='horizontal-cable'&&Array.from({length:9},(_,i)=>
          <Rod key={'cable-'+i} from={[from[0],deckHeight+.46+i*(height-.85)/8,from[1]]}
            to={[to[0],deckHeight+.46+i*(height-.85)/8,to[1]]} radius={.008} color="#7e878b" metalness={.8}/>)}
        {['chippendale','square-web'].includes(infill)&&Array.from({length:bays},(_,i)=>{
          const a=at(i/bays),b=at((i+1)/bays);
          const left:P3=[a[0],deckHeight+.43,a[1]],right:P3=[b[0],yTop-.34,b[1]];
          const leftUp:P3=[a[0],yTop-.34,a[1]],rightDown:P3=[b[0],deckHeight+.43,b[1]];
          return <group key={'cross-'+i}>
            <Rod from={left} to={right} radius={.034} color={color}/>
            <Rod from={leftUp} to={rightDown} radius={.034} color={color}/>
            {infill==='square-web'&&<Rod from={[a[0],deckHeight+height/2,a[1]]}
              to={[b[0],deckHeight+height/2,b[1]]} radius={.025} color={color}/>}
          </group>;
        })}
        {!isGlass&&infill!=='horizontal-cable'&&!['chippendale','square-web'].includes(infill)&&
          Array.from({length:Math.max(2,Math.ceil(runLength/(wooden ? .4 : metallic ? .39 : .43)))},(_,i)=>{
            const n=Math.max(2,Math.ceil(runLength/(wooden ? .4 : metallic ? .39 : .43)));
            const p=at((i+.5)/n);
            const dark=['round-black','square-black','aluminum','vertical-cable'].includes(infill);
            const balusterColor=dark?metallic?color:'#25292d':color;
            const isRound=infill==='round-black'||infill==='vertical-cable';
            return isRound?
              <Rod key={'baluster-'+i} from={[p[0],yBottom+.13,p[1]]}
                to={[p[0],yTop-.28,p[1]]} radius={infill==='vertical-cable' ? .009 : .026}
                color={balusterColor} metalness={dark ? .7 : .05}/>
              : <Block key={'baluster-'+i} position={[p[0],(yBottom+yTop)/2,p[1]]}
                  size={[wooden ? .12 : metallic ? .048 : .12,yTop-yBottom-.32,wooden ? .12 : metallic ? .048 : .12]}
                  color={balusterColor} metalness={metallic ? .65 : .02}/>;
          })}
      </group>;
    })}
    {/* Gates replace a railing run only where explicitly placed.
        Stair entrances otherwise remain open and never have a rail
        running straight across the treads. */}
    {!screenIntegrated&&gatePlacements.map(gate=>{
      const edge=edgeMap.get(gate.edgeIndex);
      if(!edge)return null;
      const start=startCoords(edge,gate.start+.04);
      const end=startCoords(edge,gate.end-.04);
      const length=gate.end-gate.start-.08;
      if(length<=.2)return null;
      const top=Math.min(yTop,deckHeight+gate.heightFt);
      const bottom=deckHeight+.22;
      const hingeStart=start;
      return <group key={'rail-gate-'+gate.id} name="visible-selectable-railing-gate">
        <Beam start={start} end={end} height={bottom+.09}
          thickness={.14} depth={.13} color={color}/>
        <Beam start={start} end={end} height={top-.09}
          thickness={.14} depth={.13} color={color}/>
        {[start,end].map((p,i)=><Block key={'gate-upright-'+i}
          position={[p[0],(top+bottom)/2,p[1]]}
          size={[.13,top-bottom,.13]} color={color}/>)}
        {Array.from({length:Math.max(2,Math.ceil(length/.4)-1)},(_,i)=>{
          const t=(i+1)/(Math.ceil(length/.4)+1);
          return <Block key={'gate-picket-'+i}
            position={[start[0]+(end[0]-start[0])*t,(top+bottom)/2,
              start[1]+(end[1]-start[1])*t]}
            size={[.045,top-bottom-.2,.045]} color={color}/>;
        })}
        {[.24,.70].map((fraction,i)=><Block key={'gate-hinge-'+i}
          position={[hingeStart[0],bottom+(top-bottom)*fraction,hingeStart[1]]}
          size={[.17,.16,.17]} color="#58606a" metalness={.52}/>)}
      </group>;
    })}
  </group>;
}
export const namedRailingStyles=railVisualProducts.map((p)=>({id:p.id,label:p.label,family:p.family}));
