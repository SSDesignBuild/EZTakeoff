import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getCoverVisualProduct, getCoverFinish } from '../../data/visualCatalog';
import { Beam, Block, Rod, type P2 } from './Primitives';

export function RenaissanceCover3D({model,project,center,deckHeight}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;
}){
  const product=getCoverVisualProduct(project.coverFamily);
  if(project.coverFamily==='none')return null;
  const width=model.width+.8,depth=model.depth+.8;
  const xMid=(model.minX+model.maxX)/2-center[0],zMid=(model.minY+model.maxY)/2-center[1];
  const left=xMid-width/2,right=xMid+width/2,back=zMid-depth/2,front=zMid+depth/2;
  const roofY=deckHeight+8.3;
  const powder=getCoverFinish(project.coverColor);
  const shadowColor=project.coverColor==='White'?'#c1c5c5':project.coverColor==='Sandstone'?'#938271':project.coverColor==='Black'?'#202327':'#3c352f';
  const shape=project.coverRoofStyle??'studio';
  const slopeRise=.75;
  const gableRise=Math.min(3,width*.13);
  const postCount=Math.max(2,Math.ceil(width/11)+1);
  const attached=project.values.attachment!=='freestanding'&&project.values.attachment!=='brick';
  const frontPosts=Array.from({length:postCount},(_,i):P2=>[left+.4+(width-.8)*i/(postCount-1),front-.5]);
  const rearPosts=attached?[]:Array.from({length:postCount},(_,i):P2=>[left+.4+(width-.8)*i/(postCount-1),back+.5]);
  const allPosts=[...frontPosts,...rearPosts];
  const isSolid=product.family==='solid-studio'||product.family==='solid-truss-ends'||product.family==='full-trusses';
  const isTranslucent=product.family==='translucent';
  const isLattice=product.family==='lattice';
  const isLouvered=product.family==='louvered';
  const countRafters=Math.max(4,Math.ceil(width/2)+1);
  const latticeCount=Math.min(100,Math.max(5,
    Math.round(depth/Math.max(.22,1-(project.coverShadePercent??65)/100))));
  const louverCount=Math.max(4,Math.ceil(depth/.7));
  const roofDepth=depth;
  const roofFront=roofY-slopeRise/2,roofBack=roofY+slopeRise/2;
  return <group name={'Renaissance-'+product.id} position={[0,0,0]}>
    {/* Real physical framing: column sleeves, base collars, sculpted caps and wrap fascia */}
    {allPosts.map(([x,z],i)=><group key={'column-'+i}>
      <Block position={[x,(deckHeight+roofFront-.38)/2,z]}
        size={[.33,Math.max(2,roofFront-deckHeight-.38),.33]} color={powder} metalness={.32} roughness={.32}/>
      <Block position={[x,deckHeight+.12,z]} size={[.47,.26,.47]} color={powder} metalness={.25}/>
      <Block position={[x,roofFront-.43,z]} size={[.47,.46,.47]} color={powder} metalness={.25}/>
      <Block position={[x,deckHeight+.28,z]} size={[.38,.34,.38]} color={shadowColor} metalness={.22}/>
    </group>)}
    <Beam start={[left,front-.42]} end={[right,front-.42]} height={roofFront-.37}
      thickness={.54} depth={.35} color={powder} metalness={.4}/>
    {!attached&&<Beam start={[left,back+.42]} end={[right,back+.42]} height={roofBack-.44}
      thickness={.4} depth={.3} color={powder} metalness={.38}/>}
    {/* Rectangular canopy is anchored to the deck's footprint bounding box.
        A custom L-shaped roof and its supporting load paths still require
        a separately approved engineered Renaissance layout. */}
    {isSolid&&shape==='studio'&&<>
      <mesh position={[xMid,roofY,zMid]} rotation={[Math.atan2(slopeRise,depth),0,0]} castShadow receiveShadow>
        <boxGeometry args={[width,.3,roofDepth]}/>
        <meshStandardMaterial color={powder} metalness={.34} roughness={.31}/>
      </mesh>
      {/* Insulated-panel seams, narrow wrapped fascia caps. */}
      {Array.from({length:Math.max(2,Math.ceil(width/3))},(_,i)=>{
        const x=left+width*i/Math.max(1,Math.ceil(width/3));
        return <Rod key={'seam-'+i} from={[x,roofBack+.17,back]} to={[x,roofFront+.17,front]}
          radius={.018} color={shadowColor} metalness={.55}/>;
      })}
      <Beam start={[left,front]} end={[right,front]} height={roofFront-.16}
        thickness={.4} depth={.36} color={powder} metalness={.38}/>
    </>}
    {isSolid&&shape==='gable'&&<>
      {[-1,1].map((sign)=>{
        const slope=Math.atan2(gableRise,width/2);
        return <mesh key={'gable-panel-'+sign} castShadow receiveShadow
          position={[xMid+sign*width/4,roofY+gableRise/2,zMid]} rotation={[0,0,-sign*slope]}>
          <boxGeometry args={[Math.hypot(width/2,gableRise),.28,depth]}/>
          <meshStandardMaterial color={powder} metalness={.34} roughness={.34}/>
        </mesh>;
      })}
      <Beam start={[xMid,back]} end={[xMid,front]} height={roofY+gableRise+.1}
        thickness={.18} depth={.13} color={shadowColor} metalness={.28}/>
      {[-1,1].map((sign)=><Beam key={sign}
        start={[xMid+sign*width/2,back]} end={[xMid+sign*width/2,front]}
        height={roofY+.08} thickness={.35} depth={.2} color={powder} metalness={.4}/>)}
    </>}
    {product.family==='solid-truss-ends'&&
      Array.from({length:countRafters},(_,i)=>{
        const x=left+(width*i)/(countRafters-1);
        const y=shape==='gable'?roofY+gableRise*(1-Math.abs(x-xMid)/(width/2)):roofY;
        return <group key={'truss-tail-'+i}>
          <Block position={[x,y-.1,front+.25]} size={[.13,.28,.9]} color={powder} metalness={.31}/>
          <Rod from={[x,y-.35,front-.5]} to={[x,y-.65,front+.25]} radius={.05} color={powder}/>
        </group>;
      })}
    {product.family==='full-trusses'&&
      Array.from({length:Math.max(2,Math.ceil(depth/7)+1)},(_,i)=>{
        const z=back+depth*i/Math.max(1,Math.ceil(depth/7));
        const bottom=roofY-1.25;
        const ridge=shape==='gable'?roofY+gableRise-.28:roofY-.26;
        return <group key={'full-truss-'+i}>
          <Rod from={[left,bottom,z]} to={[right,bottom,z]} radius={.075} color={powder}/>
          <Rod from={[left,bottom,z]} to={[xMid,ridge,z]} radius={.072} color={powder}/>
          <Rod from={[right,bottom,z]} to={[xMid,ridge,z]} radius={.072} color={powder}/>
          <Rod from={[xMid,bottom,z]} to={[xMid,ridge,z]} radius={.055} color={powder}/>
          <Rod from={[left+width*.24,bottom,z]} to={[xMid,ridge,z]} radius={.052} color={powder}/>
          <Rod from={[right-width*.24,bottom,z]} to={[xMid,ridge,z]} radius={.052} color={powder}/>
        </group>;
      })}
    {/* Fresco: translucent polycarbonate standing-seam roofing over exposed pergola framing. */}
    {isTranslucent&&<>
      <mesh position={[xMid,roofY,zMid]} rotation={[Math.atan2(slopeRise,depth),0,0]} castShadow>
        <boxGeometry args={[width,.105,depth]}/>
        <meshPhysicalMaterial color="#cce0e5" transparent opacity={.63}
          metalness={0} roughness={.17} transmission={.05} depthWrite={false}/>
      </mesh>
      {Array.from({length:countRafters},(_,i)=>{
        const x=left+width*i/(countRafters-1);
        return <group key={'fresco-rafters-'+i}>
          <Rod from={[x,roofBack+.065,back-.35]} to={[x,roofFront+.065,front+.38]}
            radius={.056} color={powder} metalness={.37}/>
          <Rod from={[x,roofBack-.24,back]} to={[x,roofFront-.24,front]}
            radius={.049} color={shadowColor} metalness={.26}/>
        </group>;
      })}
    </>}
    {/* Aria: independent rectangular beams with variable-density adjustable shade lattice. */}
    {isLattice&&<>
      <Beam start={[left,back]} end={[right,back]} height={roofY} thickness={.35} depth={.31} color={powder} metalness={.35}/>
      <Beam start={[left,front]} end={[right,front]} height={roofY} thickness={.35} depth={.31} color={powder} metalness={.35}/>
      {Array.from({length:countRafters},(_,i)=>
        <Block key={'aria-rafter-'+i} position={[left+width*i/(countRafters-1),roofY+.13,zMid]}
          size={[.13,.27,depth+.5]} color={powder} metalness={.32}/>)}
      {Array.from({length:latticeCount},(_,i)=>{
        const z=back+depth*(i+.5)/latticeCount;
        return <Block key={'shade-slat-'+i} position={[xMid,roofY+.37,z]}
          size={[width+.18,.075,.17]} color={powder} metalness={.27}/>;
      })}
    </>}
    {/* Solé: separated full-width pivoting louvers. Angle is user-controlled. */}
    {isLouvered&&<>
      {[[left,back],[right,back],[left,front],[right,front]].map(([x,z],i)=>
        <Block key={'sole-corner-'+i} position={[x,roofY-.12,z]}
          size={[.3,.32,.3]} color={powder} metalness={.4}/>)}
      <Beam start={[left,back]} end={[right,back]} height={roofY-.15} thickness={.33} depth={.34} color={powder} metalness={.47}/>
      <Beam start={[left,front]} end={[right,front]} height={roofY-.15} thickness={.33} depth={.34} color={powder} metalness={.47}/>
      <Beam start={[left,back]} end={[left,front]} height={roofY-.15} thickness={.33} depth={.34} color={powder} metalness={.47}/>
      <Beam start={[right,back]} end={[right,front]} height={roofY-.15} thickness={.33} depth={.34} color={powder} metalness={.47}/>
      {Array.from({length:louverCount},(_,i)=>
        <mesh key={'motorized-louver-'+i} castShadow
          position={[xMid,roofY+.03,back+depth*(i+.5)/louverCount]}
          rotation={[(project.coverLouverAngle??12)*Math.PI/180,0,0]}>
          <boxGeometry args={[width-.5,.085,Math.min(.62,depth/louverCount-.025)]}/>
          <meshStandardMaterial color={powder} metalness={.43} roughness={.3}/>
        </mesh>)}
    </>}
    {/* Architectural wrap-around rain gutter is a separate U section. */}
    {(isSolid||isTranslucent)&&<>
      <Beam start={[left-.14,front+.19]} end={[right+.14,front+.19]}
        height={roofFront-.31} thickness={.25} depth={.34} color={powder} metalness={.31}/>
      <Beam start={[left-.14,front+.35]} end={[right+.14,front+.35]}
        height={roofFront-.21} thickness={.16} depth={.055} color={powder} metalness={.34}/>
      <Beam start={[left-.14,front+.04]} end={[right+.14,front+.04]}
        height={roofFront-.21} thickness={.16} depth={.055} color={powder} metalness={.34}/>
    </>}
  </group>;
}
