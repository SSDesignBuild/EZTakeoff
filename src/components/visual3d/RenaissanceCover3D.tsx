import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getCoverVisualProduct, getCoverFinish } from '../../data/visualCatalog';
import { Beam, Block, Rod, type P2 } from './Primitives';

function DolceScreenRun({from,to,bottom,top,openView,finish}:{
  from:P2;to:P2;bottom:number;top:number;openView:boolean;finish:string;
}){
  const dx=to[0]-from[0],dz=to[1]-from[1],len=Math.hypot(dx,dz);
  if(len<.3||top-bottom<1)return null;
  const angle=-Math.atan2(dz,dx),mid:[number,number,number]=[(from[0]+to[0])/2,(top+bottom)/2,(from[1]+to[1])/2];
  const mullions=openView?Math.max(1,Math.ceil(len/12)):Math.max(1,Math.ceil(len/5));
  return <group name={openView?'Dolce-open-view-wall':'Dolce-screened-wall'}>
    <mesh position={mid} rotation={[0,angle,0]}>
      <boxGeometry args={[len,top-bottom,.024]}/>
      <meshPhysicalMaterial color="#b5bec2" transparent opacity={.25} metalness={.0} roughness={.25} depthWrite={false}/>
    </mesh>
    {[bottom,top].map(y=><Beam key={y} start={from} end={to} height={y} thickness={.105} depth={.095} color={finish}/>)}
    {!openView&&<Beam start={from} end={to} height={bottom+2.3} thickness={.12} depth={.10} color={finish}/>}
    {Array.from({length:mullions+1},(_,i)=>{
      const t=i/mullions,x=from[0]+dx*t,z=from[1]+dz*t;
      return <Block key={'Dolce-mullion-'+i} position={[x,mid[1],z]}
        size={[.092,top-bottom,.092]} color={finish}/>;
    })}
  </group>;
}

export function RenaissanceCover3D({model,project,center,deckHeight}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;
}){
  const product=getCoverVisualProduct(project.coverFamily);
  if(project.coverFamily==='none')return null;
  const frameWidth=project.coverWidthFt&&project.coverWidthFt>0?project.coverWidthFt:model.width;
  const frameDepth=project.coverProjectionFt&&project.coverProjectionFt>0?project.coverProjectionFt:model.depth;
  const overhangSide=Math.max(0,Math.min(5,project.coverSideOverhangFt??1));
  const overhangFront=Math.max(0,Math.min(5,project.coverFrontOverhangFt??1));
  const width=frameWidth+2*overhangSide,depth=frameDepth+overhangFront;
  const xMid=(model.minX+model.maxX)/2-center[0],zMid=(model.minY+model.maxY)/2-center[1];
  const left=xMid-width/2,right=xMid+width/2;
  const frameLeft=xMid-frameWidth/2,frameRight=xMid+frameWidth/2;
  const back=zMid-frameDepth/2,frameFront=back+frameDepth,front=frameFront+overhangFront;
  const roofMidZ=(back+front)/2;
  const roofY=deckHeight+Math.max(7,Math.min(16,project.coverHeightFt??9));
  const powder=getCoverFinish(project.coverColor);
  const shadowColor=project.coverColor==='White'?'#c1c5c5':project.coverColor==='Sandstone'?'#938271':project.coverColor==='Black'?'#202327':'#3c352f';
  const shape=project.coverRoofStyle??'studio';
  const slopeRise=frameDepth*.5/12;
  const gableRise=Math.min(3,width*.13);
  const frameVariant=project.coverFraming??'standard';
  // Illustrative extrusion envelopes vary with the supplied SD/HD/WD frame
  // family. Exact profile dimensions and allowable spans require manufacturer review.
  const profile=frameVariant==='hd'?{post:.4,beamH:.73,beamW:.38}:
    frameVariant==='wide'?{post:.46,beamH:.83,beamW:.45}:
    frameVariant==='wide-insert'?{post:.5,beamH:.95,beamW:.50}:
    {post:.33,beamH:.55,beamW:.32};
  const configured=Number(project.coverPostCount??0);
  const postCount=configured>=2?Math.min(18,Math.floor(configured)):Math.max(2,Math.ceil(frameWidth/9)+1);
  const attached=(project.coverMount??'wall-attached')==='wall-attached';
  const frontPosts=Array.from({length:postCount},(_,i):P2=>[frameLeft+frameWidth*i/(postCount-1),frameFront]);
  const rearPosts=attached?[]:Array.from({length:postCount},(_,i):P2=>[frameLeft+frameWidth*i/(postCount-1),back]);
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
    {allPosts.map(([x,z],i)=>{
      const topY=z<zMid?roofBack:roofFront;
      return <group key={'column-'+i}>
        <Block position={[x,(deckHeight+topY-profile.beamH)/2,z]}
          size={[profile.post,Math.max(2,topY-deckHeight-profile.beamH),profile.post]}
          color={powder} metalness={.32} roughness={.32}/>
        <Block position={[x,deckHeight+.12,z]}
          size={[profile.post+.12,.24,profile.post+.12]} color={powder} metalness={.25}/>
        <Block position={[x,topY-profile.beamH*.48,z]}
          size={[profile.post+.09,.32,profile.post+.09]} color={shadowColor} metalness={.25}/>
        <Block position={[x,deckHeight+.30,z]}
          size={[profile.post+.06,.19,profile.post+.06]} color={shadowColor} metalness={.22}/>
      </group>;
    })}
    <Beam start={[frameLeft,frameFront]} end={[frameRight,frameFront]}
      height={roofFront-profile.beamH/2} thickness={profile.beamH} depth={profile.beamW}
      color={powder} metalness={.4}/>
    <Beam start={[frameLeft,frameFront+profile.beamW*.44]} end={[frameRight,frameFront+profile.beamW*.44]}
      height={roofFront-profile.beamH*.18} thickness={.055} depth={.04}
      color={shadowColor} metalness={.38}/>
    {frameVariant==='wide-insert'&&<Beam start={[frameLeft,frameFront]} end={[frameRight,frameFront]}
      height={roofFront-profile.beamH*.65} thickness={.14} depth={profile.beamW+.06}
      color={shadowColor} metalness={.43}/>}
    {!attached&&<Beam start={[frameLeft,back]} end={[frameRight,back]}
      height={roofBack-profile.beamH/2} thickness={profile.beamH} depth={profile.beamW}
      color={powder} metalness={.38}/>}
    {/* Rectangular canopy is anchored to the deck's footprint bounding box.
        A custom L-shaped roof and its supporting load paths still require
        a separately approved engineered Renaissance layout. */}
    {isSolid&&shape==='studio'&&<>
      <mesh position={[xMid,roofY,roofMidZ]} rotation={[Math.atan2(slopeRise,depth),0,0]} castShadow receiveShadow>
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
          position={[xMid+sign*width/4,roofY+gableRise/2,roofMidZ]} rotation={[0,0,-sign*slope]}>
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
      {Array.from({length:Math.ceil(width/4)},(_,i,all)=>{
        const panelWidth=width/Math.ceil(width/4);
        const x=left+(i+.5)*panelWidth;
        return <mesh key={'fresco-polycarbonate-'+i}
          position={[x,roofY,roofMidZ]} rotation={[Math.atan2(slopeRise,depth),0,0]} castShadow>
          <boxGeometry args={[panelWidth-.014,.085,depth]}/>
          <meshPhysicalMaterial color="#cce0e5" transparent opacity={.63}
            metalness={0} roughness={.15} depthWrite={false}/>
        </mesh>;
      })}
      {Array.from({length:Math.max(2,Math.ceil(width/4)+1)},(_,i)=>{
        const x=left+i*(width/Math.ceil(width/4));
        return <Rod key={'standing-seam-'+i} from={[x,roofBack+.085,back]}
          to={[x,roofFront+.085,front]} radius={.031} color={powder} metalness={.25}/>;
      })}
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
        <Block key={'aria-rafter-'+i} position={[left+width*i/(countRafters-1),roofY+.13,roofMidZ]}
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
    {(project.coverScreenStyle??'none')!=='none'&&<>
      <DolceScreenRun from={[frameLeft,frameFront]} to={[frameRight,frameFront]}
        bottom={deckHeight+.12} top={roofFront-profile.beamH}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      <DolceScreenRun from={[frameLeft,back]} to={[frameLeft,frameFront]}
        bottom={deckHeight+.12} top={roofFront-profile.beamH}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      <DolceScreenRun from={[frameRight,back]} to={[frameRight,frameFront]}
        bottom={deckHeight+.12} top={roofFront-profile.beamH}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      {!attached&&<DolceScreenRun from={[frameLeft,back]} to={[frameRight,back]}
        bottom={deckHeight+.12} top={roofBack-profile.beamH}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>}
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
