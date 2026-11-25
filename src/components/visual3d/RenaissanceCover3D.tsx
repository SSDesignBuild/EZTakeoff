import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getCoverVisualProduct, getCoverFinish } from '../../data/visualCatalog';
import { planSideConnectedHeader,trussMountLiftFt } from '../../lib/renaissanceTrussConnections';
import { Beam, Block, SlopedBeam, type P2 } from './Primitives';
import * as THREE from 'three';
import { planDolceScreenProfile, roofLineAtX, showDolceStandardIntermediateRail } from '../../lib/renaissanceDetailGeometry';
import { planInsulatedRoofPanels, planDolceGableInfill } from '../../lib/renaissanceRoofGeometry';
import { planWrapAroundGutter } from '../../lib/renaissanceGutterGeometry';
import { planRenaissanceDownspout } from '../../lib/renaissanceDownspoutRouting';
import { actualPostWidthFt } from '../../lib/visualStructure';
import { planRenaissanceCoverWalls } from '../../lib/renaissanceCoverWallLayout';
import { renaissanceVisiblePostTopFt } from '../../lib/renaissancePostClearance';
import { planPcaDoorOnWall,effectivePcaKickPlateIn, type PcaDoorModel,type PcaPetDoor,type ScreenDoorWall } from '../../lib/pcaScreenDoorGeometry';
import { PcaScreenDoor3D } from './PcaScreenDoor3D';
import { RenaissancePrivacyWall3D } from './RenaissancePrivacyWall3D';

import { EliteAddARoomWall3D } from './EliteAddARoomWall3D';
import { currentEliteSunroomSettings,eliteWallSections } from '../../lib/eliteSunroomStudio';
import { RenaissancePanelMaterials } from './RenaissanceRoofMaterials3D';
import {
  inchToFoot,
  RENAISSANCE_INSULATED_ROOF,RENAISSANCE_SHADE_TUBE,RENAISSANCE_TRUSS,
} from '../../lib/renaissanceManufacturer';
import {
  RenaissancePost,RenaissanceHeader,RenaissanceGutter,RenaissanceTruss,RenaissanceShadeTube,
  RenaissanceCurvedTrussEnd,RenaissanceContinuousProjectionTruss,RenaissanceReceivingChannel,RenaissanceDownspout,
} from './RenaissanceExtrusions';

/** Roof-following Dolce screen wall with real triangular mesh at sloping eaves. */
function DolceScreenRun({from,to,bottom,topFrom,topTo,openView,finish,treatment='screens-only',uprights}:{
  from:P2;to:P2;bottom:number;topFrom:number;topTo:number;
  openView:boolean;finish:string;uprights?:number;
  treatment?:'integrated-kick'|'integrated-picket'|'inside'|'outside'|'screens-only';
}){
  const profile=planDolceScreenProfile({
    from,to,bottomFt:bottom,topFromFt:topFrom,topToFt:topTo,openView,
    interiorUprights:uprights,
  });
  if(!profile)return null;
  const dx=to[0]-from[0],dz=to[1]-from[1];
  const shape=new THREE.Shape();
  profile.contour.forEach((point,i)=>{
    if(i===0)shape.moveTo(point.alongFt,point.riseFt);
    else shape.lineTo(point.alongFt,point.riseFt);
  });
  shape.closePath();
  return <group name={openView?'Dolce-open-view-wall':'Dolce-screened-wall'}>
    <mesh position={[from[0],bottom,from[1]]}
      rotation={[0,-Math.atan2(dz,dx),0]} receiveShadow>
      <shapeGeometry args={[shape]}/>
      <meshPhysicalMaterial color="#819399" side={THREE.DoubleSide}
        transparent opacity={.19} roughness={.88} metalness={0}
        depthWrite={false}/>
    </mesh>
    <Beam start={from} end={to} height={bottom+.065}
      thickness={.13} depth={.09} color={finish}/>
    <SlopedBeam start={[from[0],topFrom-.06,from[1]]}
      end={[to[0],topTo-.06,to[1]]}
      thickness={.12} depth={.10} color={finish}/>
    {/* Integrated Dolce pickets already have their own guardrail top; do not
        draw the extra Standard mid-rail across the upper picket field. */}
    {showDolceStandardIntermediateRail(openView,treatment)&&<Beam start={from} end={to}
      height={bottom+2.3} thickness={.12} depth={.10} color={finish}/>}
    {profile.mullions.slice(1,-1).map((m,i)=>{
      const t=m.alongFt/profile.lengthFt,x=from[0]+dx*t,z=from[1]+dz*t;
      return <Block key={'Dolce-mullion-'+i}
        position={[x,bottom+m.heightFt/2,z]}
        size={[.092,m.heightFt,.092]} color={finish}/>;
    })}
    {treatment==='integrated-kick'&&<group name="integrated-Dolce-24in-aluminum-kick-panel">
      <mesh position={[(from[0]+to[0])/2,bottom+1,(from[1]+to[1])/2]}
        rotation={[0,-Math.atan2(dz,dx),0]}>
        <planeGeometry args={[profile.lengthFt,2]}/>
        <meshStandardMaterial color={finish} metalness={.38} roughness={.34}
          side={THREE.DoubleSide}/>
      </mesh>
      <Beam start={from} end={to} height={bottom+2}
        thickness={.12} depth={.10} color={finish}/>
    </group>}
    {treatment==='integrated-picket'&&<group name="integrated-Dolce-guard-picket-panel">
      <Beam start={from} end={to} height={bottom+3.0}
        thickness={.12} depth={.12} color={finish}/>
      {Array.from({length:Math.max(2,Math.ceil(profile.lengthFt/.43)-1)},(_,i)=>{
        const t=(i+1)/Math.max(2,Math.ceil(profile.lengthFt/.43));
        return <Block key={'Dolce-integrated-picket-'+i}
          position={[from[0]+dx*t,bottom+1.55,from[1]+dz*t]}
          size={[.055,2.88,.055]} color={finish}/>;
      })}
    </group>}
  </group>;
}

type DolceTreatment='integrated-kick'|'integrated-picket'|'inside'|'outside'|'screens-only';
type ScreenDoorDetail={
  enabled:boolean;wall:ScreenDoorWall;positionPercent:number;
  model:PcaDoorModel;pet:PcaPetDoor;finish:string;hinge:'left'|'right';
  swing:'in'|'out';kickPlateIn:number;
};
function DolceScreenWall({id,from,to,bottom,topFrom,topTo,openView,finish,treatment,
  door,center,uprights=0}:{id:ScreenDoorWall;from:P2;to:P2;bottom:number;topFrom:number;topTo:number;
  openView:boolean;finish:string;treatment:DolceTreatment;
  door:ScreenDoorDetail;center:P2;uprights?:number;
}){
  const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz);
  if(length<.05)return null;
  // For distinct railing/screen assemblies, do not put both systems in the
  // same plane. Inside/outside offset is relative to the cover center.
  const midpoint:P2=[(from[0]+to[0])/2,(from[1]+to[1])/2];
  const inside:P2=[center[0]-midpoint[0],center[1]-midpoint[1]];
  const vlen=Math.hypot(...inside);
  const offset=(treatment==='inside'?.28:treatment==='outside'?-.28:0);
  const displacement:P2=vlen>.01?[inside[0]/vlen*offset,inside[1]/vlen*offset]:[0,0];
  const f:P2=[from[0]+displacement[0],from[1]+displacement[1]];
  const t:P2=[to[0]+displacement[0],to[1]+displacement[1]];
  const along=(v:number):P2=>[f[0]+(t[0]-f[0])*v,f[1]+(t[1]-f[1])*v];
  const atTop=(v:number)=>topFrom+(topTo-topFrom)*v;
  const opening=door.enabled&&door.wall===id?
    planPcaDoorOnWall(length,door.positionPercent):null;
  const common={bottom,openView,finish,treatment};
  const count=openView?0:Math.max(0,Math.min(24,Math.round(uprights)));
  if(!opening)return <DolceScreenRun from={f} to={t} topFrom={topFrom}
    topTo={topTo} uprights={count} {...common}/>;
  const a=opening.startFt/length,b=opening.endFt/length;
  const start=along(a),end=along(b);
  const doorHeight=80/12;
  // If headroom cannot physically accommodate a 6'8" door, do not render
  // a door punching through the roof; show a full wall pending redesign.
  if(Math.min(atTop(a),atTop(b))-bottom<doorHeight+.08)return <group
    name="PCA-door-height-blocked-by-cover-clearance">
    <DolceScreenRun from={f} to={t} topFrom={topFrom} topTo={topTo}
      uprights={count} {...common}/>
  </group>;
  const remaining=length-opening.widthFt;
  const beforeUprights=remaining>.05?Math.round(count*opening.startFt/remaining):0;
  const afterUprights=count-beforeUprights;
  return <group name={'screen-wall-'+id+'-with-PCA-3068-door-cutout'}>
    {opening.startFt>.10&&<DolceScreenRun from={f} to={start}
      topFrom={topFrom} topTo={atTop(a)} uprights={beforeUprights} {...common}/>}
    {length-opening.endFt>.10&&<DolceScreenRun from={end} to={t}
      topFrom={atTop(b)} topTo={topTo} uprights={afterUprights} {...common}/>}
    {/* Independent screen support: a full-height upright on EACH door jamb.
        The selected PCA door frame is not a structural screen-wall post. */}
    {[start,end].map((point,i)=>{
      const upper=atTop(i===0?a:b);
      return <Block key={'PCA-door-side-upright-'+i}
        position={[point[0],bottom+(upper-bottom)/2,point[1]]}
        size={[.167,upper-bottom,.25]} color={finish} metalness={.35}/>;
    })}
    <PcaScreenDoor3D from={start} to={end} bottom={bottom}
      finish={door.finish} model={door.model} pet={door.pet}
      kickPlateIn={door.kickPlateIn} hinge={door.hinge} swing={door.swing}/>
    {(Math.min(atTop(a),atTop(b))-bottom-doorHeight)>.14&&
      <DolceScreenRun from={start} to={end}
        bottom={bottom+doorHeight} topFrom={atTop(a)} topTo={atTop(b)}
        openView={true} finish={finish} treatment="screens-only"/>}
  </group>;
}

/**
 * Gable front-screen infill above the horizontal header. Includes the
 * open gable geometry instead of leaving a triangular hole in the render.
 * Field-cut screen triangulation / structural extrusions are provisional.
 */
function DolceGableInfill({leftX,rightX,z,beamTopY,roofWidthFt,
  ridgeRiseFt,panelThicknessFt,finish}:{
  leftX:number;rightX:number;z:number;beamTopY:number;
  roofWidthFt:number;ridgeRiseFt:number;panelThicknessFt:number;finish:string;
}){
  const plan=planDolceGableInfill({
    frameWidthFt:rightX-leftX,roofWidthFt,ridgeRiseFt,
    roofPanelThicknessFt:panelThicknessFt,
  });
  if(!plan)return null;
  const shape=new THREE.Shape();
  plan.contour.forEach((p,i)=>{
    if(i===0)shape.moveTo(p.alongFt,p.riseFt);
    else shape.lineTo(p.alongFt,p.riseFt);
  });
  shape.closePath();
  const midX=(leftX+rightX)/2;
  const sideY=beamTopY+plan.sideRiseFt,peakY=beamTopY+plan.peakRiseFt;
  return <group name="dolce-gable-upper-screen-infill-concept">
    <mesh position={[leftX,beamTopY,z]} receiveShadow>
      <shapeGeometry args={[shape]}/>
      <meshPhysicalMaterial color="#7c959e" side={THREE.DoubleSide}
        transparent opacity={.18} depthWrite={false} roughness={.88}/>
    </mesh>
    <SlopedBeam start={[leftX,sideY,z]} end={[midX,peakY,z]}
      thickness={.095} depth={.095} color={finish}/>
    <SlopedBeam start={[midX,peakY,z]} end={[rightX,sideY,z]}
      thickness={.095} depth={.095} color={finish}/>
    <Block position={[midX,(beamTopY+peakY)/2,z]}
      size={[.092,plan.peakRiseFt,.092]} color={finish}/>
  </group>;
}

export function RenaissanceCover3D({model,project,center,deckHeight}:{
  model:DeckModel;project:ConsultationProject;center:P2;deckHeight:number;
}){
  const product=getCoverVisualProduct(project.coverFamily);
  if(project.coverFamily==='none')return null;
  const wallAnchors=planRenaissanceCoverWalls(model,project,center,deckHeight);
  const {plan,profile,xMid,zMid,theoreticalBack,theoreticalFront,
    frontPosts,rearPosts,frameLeft,frameRight,back,frameFront}=wallAnchors;
  const width=plan.roofWidthFt,depth=plan.roofProjectionFt;
  const left=xMid-width/2,right=xMid+width/2;
  const allPosts=[...frontPosts,...rearPosts];
  // The same seated column stations now drive ALL screen, privacy and Elite
  // wall dimensions, as well as the consultant's wall section editor.
  const headerLeft=Math.min(left,frameLeft),headerRight=Math.max(right,frameRight);
  const roofBackEdge=theoreticalBack-plan.rearOverhangFt;
  const front=theoreticalFront+plan.frontOverhangFt;
  const roofMidZ=(roofBackEdge+front)/2;
  const powder=getCoverFinish(project.coverColor);
  const shadowColor=project.coverColor==='White'?'#c1c5c5':project.coverColor==='Sandstone'?'#b4a78c':
    project.coverColor==='Black'?'#202327':'#3c352f';
  const shape=plan.gable?'gable':'studio';
  const attached=plan.attached;
  const headerHeight=inchToFoot(profile.headerHeightIn);
  // Raised vs flush is a manufacturer connection at the truss/header, not
  // the wall-versus-freestanding cover mounting selection.
  const trussLift=trussMountLiftFt(project.coverFamily,project.coverTrussMount??'flush');
  const frontHeaderSpans=planSideConnectedHeader(headerLeft,headerRight,
    frontPosts.map(post=>post[0]),inchToFoot(profile.postOutsideIn));
  const rearHeaderSpans=planSideConnectedHeader(headerLeft,headerRight,
    rearPosts.map(post=>post[0]),inchToFoot(profile.postOutsideIn));
  const roofBack=plan.backTopFt,roofFront=plan.frontTopFt;
  const eaveY=roofFront;
  const roofRearY=shape==='gable'?eaveY:roofBack+plan.rearOverhangFt*plan.pitchInPerFt/12;
  const roofFrontY=shape==='gable'?eaveY:roofFront-plan.frontOverhangFt*plan.pitchInPerFt/12;
  const roofY=(roofRearY+roofFrontY)/2;
  const slopeRise=roofRearY-roofFrontY;
  const gableRise=plan.ridgeTopFt-plan.backTopFt;
  const isSolid=product.family==='solid-studio'||product.family==='solid-truss-ends'||product.family==='full-trusses';
  const accentEnd=project.coverAccentEnd??(['Contempo','Classico'].includes(project.coverFamily)?'curved':'straight');
  const isTranslucent=product.family==='translucent';
  const isLattice=product.family==='lattice';
  const isLouvered=product.family==='louvered';
  const countRafters=plan.projectionTrussStationsFt.length;
  // A 2-inch square Aria tube with a 4-inch CLEAR gap yields a 6-inch pitch.
  // The coverage control varies only this aesthetic gap within a 2-6-in envelope.
  const shadeGapIn=Math.max(2,Math.min(6,4+(65-(project.coverShadePercent??65))*.08));
  const latticeCount=Math.max(2,Math.ceil((depth*12)/(RENAISSANCE_SHADE_TUBE.outsideWidthIn+shadeGapIn)));
  const louverCount=Math.max(4,Math.ceil(depth/.7));
  const roofPanelThicknessFt=inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn);
  // Screens rise into the canopy soffit behind the structural header.
  // For translucent Fresco, leave space below the snap profile.
  const studioPanels=planInsulatedRoofPanels(
    width,RENAISSANCE_INSULATED_ROOF.standardPanelWidthIn);
  const gablePanels=planInsulatedRoofPanels(
    depth,RENAISSANCE_INSULATED_ROOF.standardPanelWidthIn);
  const gutterRuns=planWrapAroundGutter({
    leftFt:left,rightFt:right,rearFt:roofBackEdge,frontFt:front,
    rearTopFt:shape==='gable'?eaveY:roofRearY,
    frontTopFt:shape==='gable'?eaveY:roofFrontY,
  });
  const deckSupportPosts=model.postLocations.map(post=>
    [post.x-center[0],post.y-center[1]] as P2);
  // Prefer the rightmost actual cover post which is also near a real deck
  // support. Outlet location is at the front gutter, not an arbitrary drop.
  const compatible=frontPosts.filter(post=>
    deckSupportPosts.some(under=>Math.hypot(under[0]-post[0],under[1]-post[1])<2.2));
  const frontPost=(compatible[compatible.length-1]??frontPosts[frontPosts.length-1]) as P2|undefined;
  const downspout=isSolid&&frontPost?planRenaissanceDownspout({
    outlet:[frontPost[0],roofFrontY-inchToFoot(1.5),front],
    coverPosts:frontPosts,deckPosts:deckSupportPosts,
    coverPostWidthFt:inchToFoot(profile.postOutsideIn),
    deckPostWidthFt:actualPostWidthFt(model.postSize),
    deckHeightFt:deckHeight,groundFt:0,exitDirection:[0,1],
  }):null;
  // One wall layout is shared by screen and privacy renderers so the two
  // incompatible assemblies can NEVER occupy the same selected side.
  const coverWallRuns=wallAnchors.wallRuns;
  const privacyGap=(side:ScreenDoorWall)=>project.coverPrivacyWallGaps?.[side]??0;
  return <group name={'Renaissance-'+product.id} position={[0,0,0]}>
    {/* Manufacturer outside dimensions: SD/HD 3.875-in hollow columns,
        WD 6-in columns; SD/HD 7x2.75 and WD 7x4.875 headers. */}
    {allPosts.map(([x,z],i)=>{
      const rear=i>=frontPosts.length;
      // Columns extend to the header CROWN. In the manufacturer post/beam
      // drawing the main header is side-clipped INTO each continuous post,
      // never perched above a truncated post.
      const structuralHeaderCrownY=rear?roofBack:roofFront;
      const topY=isSolid?renaissanceVisiblePostTopFt({
        xFt:x,zFt:z,headerCrownFt:structuralHeaderCrownY,
        roofRearZFt:roofBackEdge,roofFrontZFt:front,
        roofRearCenterFt:roofRearY,roofFrontCenterFt:roofFrontY,
        roofPanelThicknessFt, gable:shape==='gable',
        midXFt:xMid,roofWidthFt:width,
        eaveCenterFt:eaveY,gableRiseFt:gableRise,
      }):structuralHeaderCrownY;
      const baseOutside=inchToFoot(profile.postOutsideIn+1.8);
      const postCap=inchToFoot(profile.postCapOutsideIn);
      return <group key={'renaissance-column-'+i}>
        <RenaissancePost x={x} z={z} bottom={deckHeight} top={topY}
          profile={profile} color={powder}/>
        <Block position={[x,deckHeight+.009,z]}
          size={[baseOutside,.018,baseOutside]} color={shadowColor} metalness={.42}/>
        {/* The supplied Renaissance sample has an exterior stepped post
            base boot; the earlier 1/4in flat plate looked unfinished.
            This is a visual trim skirt over the existing structural base,
            NOT a replacement anchorage or new material-order item. */}
        <Block name="renaissance-four-sided-post-base-skirt"
          position={[x,deckHeight+.10,z]}
          size={[baseOutside,.19,baseOutside]} color={powder} metalness={.36}/>
        <mesh name="renaissance-tapered-post-base-skirt"
          position={[x,deckHeight+.27,z]} rotation={[0,Math.PI/4,0]}
          castShadow receiveShadow>
          <cylinderGeometry args={[baseOutside*.43,baseOutside*.68,.17,4]}/>
          <meshStandardMaterial color={powder} metalness={.38} roughness={.34}/>
        </mesh>
        <Block name="renaissance-upper-base-boot-collar"
          position={[x,deckHeight+.375,z]}
          size={[inchToFoot(profile.postOutsideIn+.45),.045,
            inchToFoot(profile.postOutsideIn+.45)]}
          color={powder} metalness={.36}/>
        {/* The structural cap is nested UNDER the roof skin. Earlier the
            visible cap sat on the roof mid-plane and showed as gray blocks
            sticking through the white roof panel in client presentations. */}
        <Block name="renaissance-post-cap-below-roof-underside"
          position={[x,topY-.029,z]}
          size={[postCap,.05,postCap]} color={powder} metalness={.38}/>
        {/* Physical header clips and fastener head placements, not fake oversized collars. */}
        {[-1,1].map(side=>[-1,1].map(level=>
          <mesh key={'clip-screw-'+side+'-'+level}
            position={[x+(inchToFoot(profile.postOutsideIn)/2+.002)*side,
              topY-.12+level*.065,z]} rotation={[0,Math.PI/2,0]} castShadow>
            <circleGeometry args={[.018,10]}/>
            <meshStandardMaterial color={shadowColor} metalness={.68} roughness={.26}/>
          </mesh>))}
      </group>;
    })}
    {frontHeaderSpans.map((span,i)=><RenaissanceHeader key={'front-side-clipped-header-'+i}
      start={[span.startFt,frameFront]} end={[span.endFt,frameFront]}
      midY={roofFront-headerHeight/2} profile={profile} color={powder}
      capStart={i===0&&span.startFt<headerLeft+.01}
      capEnd={i===frontHeaderSpans.length-1&&span.endFt>headerRight-.01}/>) }
    {!attached&&rearHeaderSpans.map((span,i)=><RenaissanceHeader
      key={'rear-side-clipped-header-'+i}
      start={[span.startFt,back]} end={[span.endFt,back]}
      midY={roofBack-headerHeight/2} profile={profile} color={powder}
      capStart={i===0&&span.startFt<headerLeft+.01}
      capEnd={i===rearHeaderSpans.length-1&&span.endFt>headerRight-.01}/> )}
    {/* 'wide-insert' keeps the SAME outside extrusion dimensions as Wide.
        Reinforcement resides inside the profiles and is not an exterior bar. */}
    {/* Rectangular canopy is anchored to the deck's footprint bounding box.
        A custom L-shaped roof and its supporting load paths still require
        a separately approved engineered Renaissance layout. */}
    {/* Studio/lean-to: individual 48-inch insulated panel modules with a
        trimmed last module and visible seam-cover lines. No continuous slab. */}
    {isSolid&&shape==='studio'&&<group name="renaissance-modular-studio-roof">
      {studioPanels.modules.map((panel,i)=><mesh key={'studio-insulated-panel-'+i}
        position={[left+panel.centerFt,roofY,roofMidZ]}
        rotation={[Math.atan2(slopeRise,depth),0,0]} castShadow receiveShadow>
        <boxGeometry args={[panel.widthFt,roofPanelThicknessFt,depth]}/>
        <RenaissancePanelMaterials roof={project.coverRoofColor??'White'}
          ceiling={project.coverCeilingFinish??'White'}/>
      </mesh>)}
      {studioPanels.seamsFt.map((station,i)=>{
        const x=left+station;
        return <SlopedBeam key={'studio-panel-closure-'+i}
          start={[x,roofRearY+roofPanelThicknessFt/2+.015,roofBackEdge]}
          end={[x,roofFrontY+roofPanelThicknessFt/2+.015,front]}
          thickness={.025} depth={.065} color={shadowColor}/>;
      })}

    </group>}
    {/* Gable: insulated panel courses run from ridge to each side eave.
        Each 48-inch roof module is measured along the FRONT/BACK projection;
        the last is visibly cut. Main roof width and ridge rise are unchanged. */}
    {isSolid&&shape==='gable'&&<group name="renaissance-modular-gable-roof">
      {[-1,1].map(sign=>{
        const slope=Math.atan2(gableRise,width/2);
        const slopedWidthFt=Math.hypot(width/2,gableRise);
        return <group key={'gable-half-'+sign}>
          {gablePanels.modules.map((panel,i)=><mesh key={'gable-insulated-panel-'+sign+'-'+i}
            position={[xMid+sign*width/4,eaveY+gableRise/2,roofBackEdge+panel.centerFt]}
            rotation={[0,0,-sign*slope]} castShadow receiveShadow>
            <boxGeometry args={[slopedWidthFt,roofPanelThicknessFt,panel.widthFt]}/>
            <RenaissancePanelMaterials roof={project.coverRoofColor??'White'}
              ceiling={project.coverCeilingFinish??'White'}/>
          </mesh>)}
          {gablePanels.seamsFt.map((station,i)=>{
            const z=roofBackEdge+station;
            return <SlopedBeam key={'gable-panel-closure-'+sign+'-'+i}
              start={[xMid,eaveY+gableRise+roofPanelThicknessFt/2+.02,z]}
              end={[xMid+sign*width/2,eaveY+roofPanelThicknessFt/2+.02,z]}
              thickness={.027} depth={.07} color={shadowColor}/>;
          })}
        </group>;
      })}
      <Beam start={[xMid,roofBackEdge]} end={[xMid,front]}
        height={eaveY+gableRise+roofPanelThicknessFt/2+.04}
        thickness={.07} depth={.11} color={shadowColor} metalness={.34}/>

    </group>}
    {/* A connected 3-sided visible Renaissance gutter follows the left,
        front and right eaves, with true 45-degree outside miters. No rear
        gutter on wall-attached studio roofs: the C channel is at the wall. */}
    {isSolid&&<group name="renaissance-left-front-right-wrapped-architectural-gutter">
      {gutterRuns.map(run=><RenaissanceGutter key={'gutter-'+run.id}
        run={run} color={powder}/>)}
      {downspout&&<RenaissanceDownspout layout={downspout} color={powder}/>}
      {attached&&shape==='studio'&&isSolid&&<RenaissanceReceivingChannel
        fromX={left} toX={right} z={roofBackEdge}
        y={roofRearY} color={powder}/>}
    </group>}
    {isSolid&&shape==='gable'&&
      // The 14-ft Moderno HD reference includes a central ridge support,
      // front tie beam, and two 7-ft sloping eaves.
      <group name="gable-ridge-and-front-tie">
        <RenaissanceTruss from={[left,eaveY-.42,frameFront]}
          to={[right,eaveY-.42,frameFront]} color={powder}/>
        <RenaissanceTruss from={[xMid,eaveY-.42,frameFront]}
          to={[xMid,eaveY+gableRise,frameFront]} color={powder}/>
        {[-1,1].map(sign=><RenaissanceTruss key={'gable-web-'+sign}
          from={[xMid,eaveY+gableRise-.04,frameFront]}
          to={[xMid+sign*width/2,eaveY,frameFront]} color={powder}/>)}
      </group>}
    {/* Contempo: the source system is a solid roof with sculpted decorative
        truss ends at 2-ft visual stations; it is NOT a full truss pergola. */}
    {product.family==='solid-truss-ends'&&
      plan.projectionTrussStationsFt.map((station,i)=>{
        const x=xMid+station;
        const roofAtFront=roofLineAtX({
          xFt:x,midXFt:xMid,roofWidthFt:width,eaveFt:eaveY,
          gableRiseFt:gableRise,gable:shape==='gable',
          studioRearFt:roofRearY,studioFrontFt:roofFrontY,rear:false,
        });
        // Start the decorative tail at the OUTSIDE face of the front header.
        // Its silhouette must never protrude into the screened room.
        const outsideFaceZ=frameFront+inchToFoot(profile.headerDepthIn)/2+.025;
        const visibleOverhang=Math.max(.06,front-outsideFaceZ);
        return <RenaissanceCurvedTrussEnd key={'contempo-end-'+i}
          x={x} frontZ={outsideFaceZ}
          topY={roofAtFront-(shape==='studio'?(outsideFaceZ-frameFront)*plan.pitchInPerFt/12:0)-
            roofPanelThicknessFt/2}
          pitchInPerFt={shape==='studio'?plan.pitchInPerFt:0}
          projectionFt={visibleOverhang} color={powder} endStyle={accentEnd}/>;
      })}
    {/* Classico: full-length projection trusses BELOW the insulated panels,
        with sculpted tails. They must run front-to-back at width stations,
        not left-to-right at arbitrary projection stations. */}
    {product.family==='full-trusses'&&
      plan.projectionTrussStationsFt.map((station,i)=>{
        const x=xMid+station;
        const yBack=roofLineAtX({
          xFt:x,midXFt:xMid,roofWidthFt:width,eaveFt:eaveY,
          gableRiseFt:gableRise,gable:shape==='gable',
          studioRearFt:roofRearY,studioFrontFt:roofFrontY,rear:true,
        });
        const yFront=roofLineAtX({
          xFt:x,midXFt:xMid,roofWidthFt:width,eaveFt:eaveY,
          gableRiseFt:gableRise,gable:shape==='gable',
          studioRearFt:roofRearY,studioFrontFt:roofFrontY,rear:false,
        });
        const drop=inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn)/2+
          inchToFoot(RENAISSANCE_TRUSS.outsideHeightIn)/2;
        // Classico has a FULL, continuous factory 2x6 truss beneath the
        // insulated panel. The former straight section stopped 3.24in
        // SHORT of the header and a second free-floating S tip started on
        // the opposite side. One sweep must pass through the real header
        // bearing station, not stop before the beam.
        return <RenaissanceContinuousProjectionTruss
          key={'classico-continuous-projection-truss-'+i}
          rear={[x,yBack-drop,roofBackEdge]}
          nose={[x,yFront-drop,front]}
          color={powder} endStyle={accentEnd==='curved'?'classico-s':'straight'}/>;
      })}
    {/* Fresco: correctly oriented translucent polycarbonate sheets captured by
        aluminum projection trusses and snap-cover channels, not glass or rods. */}
    {isTranslucent&&<group name="fresco-polycarbonate-snap-channel-roof">
      {Array.from({length:Math.max(1,countRafters-1)},(_,i)=>{
        const x1=xMid+plan.projectionTrussStationsFt[i];
        const x2=xMid+plan.projectionTrussStationsFt[i+1];
        return <mesh key={'fresco-polycarbonate-'+i} castShadow receiveShadow
          position={[(x1+x2)/2,roofY+.075+trussLift,roofMidZ]}
          rotation={[Math.atan2(slopeRise,depth),0,0]}>
          <boxGeometry args={[Math.max(.06,x2-x1-.055),.032,depth]}/>
          <meshPhysicalMaterial color="#dde5e3" metalness={0} roughness={.32}
            transparent opacity={.82} depthWrite={false} side={2}/>
        </mesh>;
      })}
      {/* Each translucent Fresco bay needs a separate exposed front closure
          at the eave. Exact manufacturer snap cap cross section unverified. */}
      {Array.from({length:Math.max(0,countRafters-1)},(_,i)=>{
        const x1=xMid+plan.projectionTrussStationsFt[i];
        const x2=xMid+plan.projectionTrussStationsFt[i+1];
        return <Block key={'fresco-front-polycarbonate-end-cap-'+i}
          position={[(x1+x2)/2,roofFrontY+.068+trussLift,front-.05]}
          size={[Math.max(.06,x2-x1-.035),.115,.15]}
          color={powder} metalness={.35}/>;
      })}
      {plan.projectionTrussStationsFt.map((localX,i)=>{
        const x=xMid+localX;
        return <group key={'fresco-tube-and-snap-'+i}>
          <RenaissanceContinuousProjectionTruss
            rear={[x,roofRearY-.24+trussLift,roofBackEdge]}
            nose={[x,roofFrontY-.24+trussLift,front]}
            color={powder} endStyle={accentEnd==='curved'?'fresco-s':'straight'}/>
          <SlopedBeam start={[x,roofRearY+.115+trussLift,roofBackEdge]}
            end={[x,roofFrontY+.115+trussLift,front]}
            thickness={.07} depth={.09} color={powder}/>
          <SlopedBeam start={[x,roofRearY+.16+trussLift,roofBackEdge]}
            end={[x,roofFrontY+.16+trussLift,front]}
            thickness={.024} depth={.055} color={shadowColor}/>
        </group>;
      })}
    </group>}
    {/* Aria: 6x2-inch trusses at 2ft OC; 2x2-in shade tubes with
        4-inch default CLEAR spacing (the source uses actual 2-in tube height). */}
    {isLattice&&<group name="aria-projection-trusses-and-shade-tubes">
      {plan.projectionTrussStationsFt.map((localX,i)=>{
        const x=xMid+localX;
        return <group key={'aria-truss-'+i}>
          <RenaissanceContinuousProjectionTruss
            rear={[x,roofRearY-.25+trussLift,roofBackEdge]}
            nose={[x,roofFrontY-.25+trussLift,front]}
            color={powder} endStyle={accentEnd==='curved'?'aria-scallop':'straight'}/>
        </group>;
      })}
      {Array.from({length:latticeCount},(_,i)=>{
        const station=roofBackEdge+depth*(i+.5)/latticeCount;
        return <RenaissanceShadeTube key={'aria-shade-tube-'+i}
          from={[left,roofY+1/12+trussLift,station]} to={[right,roofY+1/12+trussLift,station]}
          color={powder}/>;
      })}
    </group>}
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
    {['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')&&<group name="Dolce-integrated-screen-room-with-actual-access">
      {coverWallRuns.filter(wall=>!privacyGap(wall.id)).map(wall=><DolceScreenWall key={'Dolce-wall-'+wall.id} {...wall}
        bottom={deckHeight+.12}
        openView={project.coverScreenStyle==='dolce-open-view'}
        finish={powder} center={[xMid,zMid]}
        treatment={project.coverScreenRailTreatment??'integrated-kick'}
        uprights={project.coverScreenUprights?.[wall.id]??(wall.id==='front'||wall.id==='rear'?2:1)}
        door={{
          enabled:project.coverDoorEnabled!==false,
          wall:project.coverDoorSide??'front',
          positionPercent:project.coverDoorPositionPercent??50,
          model:project.coverDoorModel??'A-100',
          pet:project.coverDoorPet??'none',
          finish:project.coverDoorFinish&&project.coverDoorFinish!=='match'
            ?getCoverFinish(project.coverDoorFinish==='Clay'?'Sandstone':project.coverDoorFinish)
            :powder,
          hinge:project.coverDoorHinge??'left',
          swing:project.coverDoorSwing??'out',
          kickPlateIn:effectivePcaKickPlateIn(project.coverDoorPet??'none',project.coverDoorKickPlateIn??8),
        }}/>
      )}
    </group>}

    {/* Real Elite Add-A-Room 2/3-inch wall system. Unlike the older Lumino
        concept, these units share the Admin Sunroom section geometry/BOM.
        No extra Elite corner posts are fabricated on Renaissance columns. */}
    {project.coverScreenStyle==='elite-add-a-room'&&isSolid&&
      wallAnchors.measuredRuns.filter(wall=>!privacyGap(wall.id)).map(wall=>
        <EliteAddARoomWall3D key={'elite-sunroom-'+wall.id}
          run={wall} sections={eliteWallSections(project,wall)}
          settings={currentEliteSunroomSettings(project)}/>)}
    {/* Privacy wall physically REPLACES screen mesh on the same edge. */}
    {coverWallRuns.filter(wall=>privacyGap(wall.id)>0).map(wall=>
      <RenaissancePrivacyWall3D key={'privacy-wall-'+wall.id}
        {...wall} gapIn={privacyGap(wall.id)}
        bottom={deckHeight+.12} color={powder}/>)}
    {isSolid&&plan.gable&&['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')&&
      !privacyGap('front')&&
      <DolceGableInfill leftX={frameLeft} rightX={frameRight} z={frameFront}
        beamTopY={eaveY} roofWidthFt={width} ridgeRiseFt={gableRise}
        panelThicknessFt={roofPanelThicknessFt} finish={powder}/>}
    {/* Solid-roof gutter is included above; Fresco uses its own snap channels. */}
  </group>;
}
