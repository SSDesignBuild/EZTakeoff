import type { DeckModel } from '../../lib/deckModel';
import { railVisualProducts } from '../../data/visualCatalog';
import { Beam, Block, Rod, type P2, type P3 } from './Primitives';
import { parseDeckGates } from '../../lib/deckGates';
import { ManufacturerStairRailing3D } from './ManufacturerStairRailing3D';
import { planLevelRailingRuns,planDrinkRailPieces,railingEdgePoint,railingSurfaceInsetFt,railPointKey,resolveDrinkRailMaterial } from '../../lib/railingLayout';
import { planStairRailingRuns,type StairRailClearanceWall } from '../../lib/stairRailVisualGeometry';
import { resolveConstructionRailStyle,constructionLevelRailBays } from '../../lib/constructionRailing';
import { resolveBoardDimensions } from '../../lib/deckProductDimensions';
import { DrinkRailBoards3D } from './DrinkRailBoards3D';

type Values=Record<string,string|number|boolean>;
const colors:Record<string,string>={
  white:'#e5e6e2','matte-white':'#e5e3dc',black:'#222629','matte-black':'#242628',
  'dark-bronze':'#55463a','matte-espresso':'#372c25',kona:'#60462e',khaki:'#b6a68e',
  'pressure-treated':'#987c59',
};
export function ManufacturerRailing3D({model,values,center,deckHeight,screenIntegrated=false,lightCapPostKeys,enclosureWalls=[]}:{
  model:DeckModel;values:Values;center:P2;deckHeight:number;
  screenIntegrated?:boolean;
  lightCapPostKeys?:ReadonlySet<string>;
  enclosureWalls?:readonly StairRailClearanceWall[];
}){
  const style=resolveConstructionRailStyle(values);
  const finish=String(values.railingColor??style.colors[0]);
  const color=colors[style.colors.includes(finish)?finish:style.colors[0]]??'#292c30';
  const infill=style.infills.includes(String(values.railingInfill) as typeof style.infills[number])
    ?String(values.railingInfill):style.infills[0];
  const metallic=style.family==='metal', wooden=style.family==='wood';
  const topWidth=style.topWidthIn/12,topThick=Math.max(.12,style.topHeightIn/12);
  const height=Math.max(3,Math.min(3.5,Number(values.railingHeightIn??36)/12));
  const yTop=deckHeight+height,yBottom=deckHeight+.28;
  const postWidth=style.postWidthIn/12;
  const drink=style.geometry.includes('drink');
  const drinkDimensions=resolveBoardDimensions(resolveDrinkRailMaterial(values));
  const drinkWidth=drinkDimensions.faceIn/12,drinkThickness=drinkDimensions.thicknessIn/12;
  const hideCap=drink||['flush-top','flush-drink'].includes(String(values.railingPostTermination));
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
  const gateOpenings=gatePlacements.map(g=>({edgeIndex:g.edgeIndex,startFt:g.start,endFt:g.end}));
  // A PCA screen entry does not authorize a gap in a required deck guardrail.
  // Only explicit stair openings or individually configured railing gates
  // can remove railing sections. The screen door remains independent.
  const inset=railingSurfaceInsetFt(postWidth,drink?drinkWidth:topWidth);
  const stairs=planStairRailingRuns(model,center,deckHeight,postWidth,metallic?7.1:6,inset,enclosureWalls);
  const visibleRails=screenIntegrated?[]:planLevelRailingRuns(model,center,deckHeight,postWidth,
    drink?drinkWidth:topWidth,metallic?7.1:6,model.railCoverage,gateOpenings);
  const startCoords=(edge:typeof model.edgeSegments[number],position:number):P2=>
    railingEdgePoint(model,edge.index,position,center,inset)??[0,0];
  const drinkPieces=drink?planDrinkRailPieces(visibleRails,stairs,drinkWidth,height+.0285+drinkThickness):[];
  const railBays=constructionLevelRailBays(visibleRails,postWidth);
  const postKeys=new Set<string>();
  const sharedTopPosts=new Set(visibleRails.flatMap(run=>run.posts.map(railPointKey)));
  return <group name={'railing-'+style.id}>
    {railBays.map((run,index)=>{
      const runLength=run.clearLengthFt;
      const from:P2=[run.from[0],run.from[2]],to:P2=[run.to[0],run.to[2]];
      const railFrom:P2=[run.clearFrom[0],run.clearFrom[2]],railTo:P2=[run.clearTo[0],run.clearTo[2]];
      const clearAt=(t:number):P2=>[railFrom[0]+(railTo[0]-railFrom[0])*t,railFrom[1]+(railTo[1]-railFrom[1])*t];
      const bays=run.posts.length-1;
      const at=(t:number):P2=>[from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t];
      const isGlass=infill==='glass';
      return <group key={'railing-'+index}>
        <Beam start={railFrom} end={railTo} height={yBottom} thickness={wooden ? 1.5/12 : .11} depth={wooden ? 3.5/12 : .13} color={color} metalness={metallic ? .64 : 0}/>
        <Beam start={railFrom} end={railTo} height={drink?yTop+.0285-topThick/2:yTop-.13} thickness={topThick} depth={topWidth} color={color} metalness={metallic ? .68 : 0}/>
        {style.geometry==='ire-classic'&&<>
          <Beam start={railFrom} end={railTo} height={yTop+.025} thickness={.055} depth={topWidth+.045} color={color} metalness={.7}/>
          <Beam start={railFrom} end={railTo} height={yTop-.26} thickness={.045} depth={topWidth*.72} color={color} metalness={.7}/>
        </>}
        {style.geometry==='ire-modern'&&<Beam start={railFrom} end={railTo} height={yTop+.045} thickness={.055} depth={topWidth+.018} color={color} metalness={.7}/>}

        {!drink&&(style.family==='pvc'||style.family==='composite'||style.family==='vinyl')&&<>
          <Beam start={railFrom} end={railTo} height={yTop+.065} thickness={.055} depth={topWidth+.07} color={color}/>
          <Beam start={railFrom} end={railTo} height={yTop-.25} thickness={.065} depth={topWidth*.65} color={color}/>
        </>}
        {wooden&&<Beam start={railFrom} end={railTo} height={yTop-.33} thickness={1.5/12} depth={3.5/12} color={color}/>}
        {infill==='midrail'&&<Beam start={railFrom} end={railTo} height={deckHeight+height/2+.02} thickness={.11} depth={.13} color={color} metalness={.5}/>}
        {Array.from({length:bays+1},(_,i)=>{
          const p=at(i/bays),key=railPointKey([p[0],deckHeight,p[1]]);
          if(postKeys.has(key))return null;postKeys.add(key);
          return <group key={'railing-post-'+i}>
            <Block position={[p[0],deckHeight+(height+.0285)/2,p[1]]}
              size={[postWidth,height+.0285,postWidth]} color={color} metalness={metallic ? .65 : .025}/>
            {!hideCap&&!lightCapPostKeys?.has(key)&&<Block position={[p[0],yTop+.06,p[1]]}
              size={[postWidth+.045,.085,postWidth+.045]} color={color} metalness={metallic ? .66 : 0}/>}
            {!wooden&&<Block position={[p[0],deckHeight+.13,p[1]]}
              size={[postWidth+.06,.135,postWidth+.06]} color={color} metalness={metallic ? .6 : 0}/>}
          </group>;
        })}
        {isGlass&&<mesh position={[(railFrom[0]+railTo[0])/2,deckHeight+height/2+.04,(railFrom[1]+railTo[1])/2]}
          rotation={[0,-Math.atan2(to[1]-from[1],to[0]-from[0]),0]}>
          <boxGeometry args={[runLength,height-.52,.028]}/>
          <meshPhysicalMaterial color="#b9dbe5" transparent opacity={.34} roughness={.08} metalness={.06}
            depthWrite={false} side={2}/>
        </mesh>}
        {infill==='horizontal-cable'&&Array.from({length:9},(_,i)=>
          <Rod key={'cable-'+i} from={[railFrom[0],deckHeight+.46+i*(height-.85)/8,railFrom[1]]}
            to={[railTo[0],deckHeight+.46+i*(height-.85)/8,railTo[1]]} radius={.008} color="#7e878b" metalness={.8}/>)}
        {['chippendale','square-web'].includes(infill)&&Array.from({length:bays},(_,i)=>{
          const a=clearAt(i/bays),b=clearAt((i+1)/bays);
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
            const p=clearAt((i+.5)/n);
            const dark=['round-black','square-black','aluminum','vertical-cable'].includes(infill);
            const balusterColor=dark?metallic?color:'#25292d':color;
            const isRound=infill==='round-black'||infill==='vertical-cable';
            return isRound?
              <Rod key={'baluster-'+i} from={[p[0],yBottom+.13,p[1]]}
                to={[p[0],yTop-.28,p[1]]} radius={infill==='vertical-cable' ? .009 : .026}
                color={balusterColor} metalness={dark ? .7 : .05}/>
              : <Block key={'baluster-'+i} position={[p[0],(yBottom+yTop)/2,p[1]]}
                  size={[wooden ? 1.5/12 : metallic ? .048 : .12,yTop-yBottom-.32,wooden ? 1.5/12 : metallic ? .048 : .12]}
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
    {/* The top-landing room wall replaces only a LEVEL guard edge, not
        the real left/right stair guards chosen in the Deck inputs.
        Materials for these runs are already counted by buildDeckModel. */}
    <ManufacturerStairRailing3D model={model} center={center}
      deckHeight={deckHeight} style={style} color={color} infill={infill}
      height={height} hideCap={hideCap} runs={stairs} sharedTopPosts={sharedTopPosts} lightCapPostKeys={lightCapPostKeys}/>
    {drink&&<DrinkRailBoards3D pieces={drinkPieces} material={resolveDrinkRailMaterial(values)}/>}
  </group>;
}
export const namedRailingStyles=railVisualProducts.map((p)=>({id:p.id,label:p.label,family:p.family}));
