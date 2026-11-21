import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getCoverVisualProduct, getCoverFinish } from '../../data/visualCatalog';
import { maxReferenceOverhangFt } from '../../lib/renaissanceGuidance';
import { Beam, Block, SlopedBeam, type P2 } from './Primitives';
import * as THREE from 'three';
import { planDolceScreenProfile, roofLineAtX } from '../../lib/renaissanceDetailGeometry';
import { planInsulatedRoofPanels, planDolceGableInfill } from '../../lib/renaissanceRoofGeometry';
import { planWrapAroundGutter } from '../../lib/renaissanceGutterGeometry';
import { planRenaissanceDownspout } from '../../lib/renaissanceDownspoutRouting';
import { actualPostWidthFt } from '../../lib/visualStructure';
import { seatCanopyPost } from '../../lib/coverDeckPlacement';
import { planPcaDoorOnWall, type PcaDoorModel,type PcaPetDoor,type ScreenDoorWall } from '../../lib/pcaScreenDoorGeometry';
import { PcaScreenDoor3D } from './PcaScreenDoor3D';
import { RenaissancePanelMaterials } from './RenaissanceRoofMaterials3D';
import {
  getRenaissanceExtrusion,makeRenaissanceFramePlan,inchToFoot,
  RENAISSANCE_INSULATED_ROOF,RENAISSANCE_SHADE_TUBE,
} from '../../lib/renaissanceManufacturer';
import {
  RenaissancePost,RenaissanceHeader,RenaissanceGutter,RenaissanceTruss,RenaissanceShadeTube,
  RenaissanceCurvedTrussEnd,RenaissanceReceivingChannel,RenaissanceDownspout,
} from './RenaissanceExtrusions';

/** Roof-following Dolce screen wall with real triangular mesh at sloping eaves. */
function DolceScreenRun({from,to,bottom,topFrom,topTo,openView,finish,treatment='screens-only'}:{
  from:P2;to:P2;bottom:number;topFrom:number;topTo:number;
  openView:boolean;finish:string;
  treatment?:'integrated-kick'|'integrated-picket'|'inside'|'outside'|'screens-only';
}){
  const profile=planDolceScreenProfile({
    from,to,bottomFt:bottom,topFromFt:topFrom,topToFt:topTo,openView,
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
    {!openView&&<Beam start={from} end={to}
      height={bottom+2.3} thickness={.12} depth={.10} color={finish}/>}
    {profile.mullions.map((m,i)=>{
      const t=m.alongFt/profile.lengthFt,x=from[0]+dx*t,z=from[1]+dz*t;
      return <Block key={'Dolce-mullion-'+i}
        position={[x,bottom+m.heightFt/2,z]}
        size={[.092,m.heightFt,.092]} color={finish}/>;
    })}
    {treatment==='integrated-kick'&&<group name="integrated-Dolce-24in-aluminum-kick-panel">
      <mesh position={[from[0],bottom,from[1]]} rotation={[0,-Math.atan2(dz,dx),0]}>
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
  door,center}:{id:ScreenDoorWall;from:P2;to:P2;bottom:number;topFrom:number;topTo:number;
  openView:boolean;finish:string;treatment:DolceTreatment;
  door:ScreenDoorDetail;center:P2;
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
  if(!opening)return <DolceScreenRun from={f} to={t} topFrom={topFrom}
    topTo={topTo} {...common}/>;
  const a=opening.startFt/length,b=opening.endFt/length;
  const start=along(a),end=along(b);
  const doorHeight=80/12;
  // If headroom cannot physically accommodate a 6'8" door, do not render
  // a door punching through the roof; show a full wall pending redesign.
  if(Math.min(atTop(a),atTop(b))-bottom<doorHeight+.08)return <group
    name="PCA-door-height-blocked-by-cover-clearance">
    <DolceScreenRun from={f} to={t} topFrom={topFrom} topTo={topTo} {...common}/>
  </group>;
  return <group name={'screen-wall-'+id+'-with-PCA-3068-door-cutout'}>
    {opening.startFt>.10&&<DolceScreenRun from={f} to={start}
      topFrom={topFrom} topTo={atTop(a)} {...common}/>}
    {length-opening.endFt>.10&&<DolceScreenRun from={end} to={t}
      topFrom={atTop(b)} topTo={topTo} {...common}/>}
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
  const frameVariant=project.coverFraming??'standard';
  const profile=getRenaissanceExtrusion(frameVariant);
  const plan=makeRenaissanceFramePlan({
    family:project.coverFamily,variant:frameVariant,
    mount:project.coverMount??'wall-attached',
    roofStyle:project.coverRoofStyle??'studio',
    frameWidthFt:project.coverWidthFt&&project.coverWidthFt>0?project.coverWidthFt:model.width,
    frameProjectionFt:project.coverProjectionFt&&project.coverProjectionFt>0?
      project.coverProjectionFt:model.depth,
    deckHeightFt:deckHeight,postHeightFt:project.coverHeightFt??9,
    sideOverhangFt:Math.min(maxReferenceOverhangFt(project.coverFamily),project.coverSideOverhangFt??1),
    frontOverhangFt:Math.min(maxReferenceOverhangFt(project.coverFamily),project.coverFrontOverhangFt??1),
    requestedFrontPosts:project.coverPostCount??0,
  });
  const frameWidth=plan.frameWidthFt,frameDepth=plan.frameProjectionFt;
  const width=plan.roofWidthFt,depth=plan.roofProjectionFt;
  const xMid=(model.minX+model.maxX)/2-center[0],zMid=(model.minY+model.maxY)/2-center[1];
  const left=xMid-width/2,right=xMid+width/2;
  const theoreticalBack=zMid-frameDepth/2,theoreticalFront=theoreticalBack+frameDepth;
  const postFootprintFt=inchToFoot(profile.postOutsideIn+1.8);
  const seat=(x:number,z:number):P2|null=>{
    const fitted=seatCanopyPost([x+center[0],z+center[1]],model.points,postFootprintFt);
    return fitted?[fitted[0]-center[0],fitted[1]-center[1]]:null;
  };
  // Preserve the roof envelope while seating every COLUMN and its base plate
  // completely inside the deck footprint (including non-rectangular plans).
  const frontPosts=plan.frontPostXsFt.map(x=>seat(xMid+x,theoreticalFront))
    .filter((p):p is P2=>p!==null);
  const rearPosts=plan.rearPostXsFt.map(x=>seat(xMid+x,theoreticalBack))
    .filter((p):p is P2=>p!==null);
  const allPosts=[...frontPosts,...rearPosts];
  const frameLeft=frontPosts.length?Math.min(...frontPosts.map(p=>p[0])):xMid-frameWidth/2;
  const frameRight=frontPosts.length?Math.max(...frontPosts.map(p=>p[0])):xMid+frameWidth/2;
  const back=rearPosts.length?rearPosts.reduce((a,p)=>a+p[1],0)/rearPosts.length:theoreticalBack;
  const frameFront=frontPosts.length?frontPosts.reduce((a,p)=>a+p[1],0)/frontPosts.length:theoreticalFront;
  const roofBackEdge=theoreticalBack-plan.rearOverhangFt;
  const front=theoreticalFront+plan.frontOverhangFt;
  const roofMidZ=(roofBackEdge+front)/2;
  const powder=getCoverFinish(project.coverColor);
  const shadowColor=project.coverColor==='White'?'#c1c5c5':project.coverColor==='Sandstone'?'#938271':
    project.coverColor==='Black'?'#202327':'#3c352f';
  const shape=plan.gable?'gable':'studio';
  const attached=plan.attached;
  const headerHeight=inchToFoot(profile.headerHeightIn);
  const roofBack=plan.backTopFt,roofFront=plan.frontTopFt;
  const eaveY=roofFront;
  const roofRearY=shape==='gable'?eaveY:roofBack+plan.rearOverhangFt*plan.pitchInPerFt/12;
  const roofFrontY=shape==='gable'?eaveY:roofFront-plan.frontOverhangFt*plan.pitchInPerFt/12;
  const roofY=(roofRearY+roofFrontY)/2;
  const slopeRise=roofRearY-roofFrontY;
  const gableRise=plan.ridgeTopFt-plan.backTopFt;
  const isSolid=product.family==='solid-studio'||product.family==='solid-truss-ends'||product.family==='full-trusses';
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
  const downspout=frontPost?planRenaissanceDownspout({
    outlet:[frontPost[0],roofFrontY-inchToFoot(1.5),front],
    coverPosts:frontPosts,deckPosts:deckSupportPosts,
    coverPostWidthFt:inchToFoot(profile.postOutsideIn),
    deckPostWidthFt:actualPostWidthFt(model.postSize),
    deckHeightFt:deckHeight,groundFt:0,exitDirection:[0,1],
  }):null;
  return <group name={'Renaissance-'+product.id} position={[0,0,0]}>
    {/* Manufacturer outside dimensions: SD/HD 3.875-in hollow columns,
        WD 6-in columns; SD/HD 7x2.75 and WD 7x4.875 headers. */}
    {allPosts.map(([x,z],i)=>{
      const rear=i>=frontPosts.length;
      const topY=(rear?roofBack:roofFront)-headerHeight;
      const baseOutside=inchToFoot(profile.postOutsideIn+1.8);
      const postCap=inchToFoot(profile.postCapOutsideIn);
      return <group key={'renaissance-column-'+i}>
        <RenaissancePost x={x} z={z} bottom={deckHeight} top={topY}
          profile={profile} color={powder}/>
        <Block position={[x,deckHeight+.009,z]}
          size={[baseOutside,.018,baseOutside]} color={shadowColor} metalness={.42}/>
        <Block position={[x,topY-.008,z]}
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
    <RenaissanceHeader start={[frameLeft,frameFront]} end={[frameRight,frameFront]}
      midY={roofFront-headerHeight/2} profile={profile} color={powder}/>
    {!attached&&<RenaissanceHeader start={[frameLeft,back]} end={[frameRight,back]}
      midY={roofBack-headerHeight/2} profile={profile} color={powder}/>}
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
    {(isSolid||isTranslucent)&&<group name="renaissance-left-front-right-wrapped-architectural-gutter">
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
        return <RenaissanceCurvedTrussEnd key={'contempo-end-'+i}
          x={x} frontZ={frameFront}
          topY={roofAtFront+(shape==='studio'?(front-frameFront)*plan.pitchInPerFt/12:0)-
            roofPanelThicknessFt/2}
          pitchInPerFt={shape==='studio'?plan.pitchInPerFt:0}
          projectionFt={plan.frontOverhangFt} color={powder}/>;
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
          inchToFoot(6)/2;
        const lapEnd=Math.max(roofBackEdge+.2,frameFront-.27);
        const t=Math.min(1,Math.max(0,(lapEnd-roofBackEdge)/Math.max(.001,front-roofBackEdge)));
        const lapY=yBack+(yFront-yBack)*t;
        return <group key={'classico-projection-truss-'+i}>
          <RenaissanceTruss from={[x,yBack-drop,roofBackEdge]}
            to={[x,lapY-drop,lapEnd]} color={powder}/>
          <RenaissanceCurvedTrussEnd x={x} frontZ={frameFront}
            topY={yFront+(shape==='studio'?(front-frameFront)*plan.pitchInPerFt/12:0)-
              roofPanelThicknessFt/2}
            pitchInPerFt={shape==='studio'?plan.pitchInPerFt:0}
            projectionFt={plan.frontOverhangFt} color={powder}/>
        </group>;
      })}
    {/* Fresco: correctly oriented translucent polycarbonate sheets captured by
        aluminum projection trusses and snap-cover channels, not glass or rods. */}
    {isTranslucent&&<group name="fresco-polycarbonate-snap-channel-roof">
      {Array.from({length:Math.max(1,countRafters-1)},(_,i)=>{
        const x1=xMid+plan.projectionTrussStationsFt[i];
        const x2=xMid+plan.projectionTrussStationsFt[i+1];
        return <mesh key={'fresco-polycarbonate-'+i} castShadow receiveShadow
          position={[(x1+x2)/2,roofY+.075,roofMidZ]}
          rotation={[Math.atan2(slopeRise,depth),0,0]}>
          <boxGeometry args={[Math.max(.06,x2-x1-.055),.032,depth]}/>
          <meshPhysicalMaterial color="#dde5e3" metalness={0} roughness={.32}
            transparent opacity={.82} depthWrite={false} side={2}/>
        </mesh>;
      })}
      {plan.projectionTrussStationsFt.map((localX,i)=>{
        const x=xMid+localX;
        return <group key={'fresco-tube-and-snap-'+i}>
          <RenaissanceTruss from={[x,roofRearY-.24,roofBackEdge]}
            to={[x,roofFrontY-.24,front]} color={powder}/>
          <SlopedBeam start={[x,roofRearY+.115,roofBackEdge]}
            end={[x,roofFrontY+.115,front]}
            thickness={.07} depth={.09} color={powder}/>
          <SlopedBeam start={[x,roofRearY+.16,roofBackEdge]}
            end={[x,roofFrontY+.16,front]}
            thickness={.024} depth={.055} color={shadowColor}/>
        </group>;
      })}
    </group>}
    {/* Aria: 6x2-inch trusses at 2ft OC; 2x2-in shade tubes with
        4-inch default CLEAR spacing (the source uses actual 2-in tube height). */}
    {isLattice&&<group name="aria-projection-trusses-and-shade-tubes">
      {plan.projectionTrussStationsFt.map((localX,i)=>{
        const x=xMid+localX;
        return <RenaissanceTruss key={'aria-truss-'+i}
          from={[x,roofRearY-.25,roofBackEdge]}
          to={[x,roofFrontY-.25,front]} color={powder}/>;
      })}
      {Array.from({length:latticeCount},(_,i)=>{
        const station=roofBackEdge+depth*(i+.5)/latticeCount;
        return <RenaissanceShadeTube key={'aria-shade-tube-'+i}
          from={[left,roofY+.145,station]} to={[right,roofY+.145,station]}
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
    {(project.coverScreenStyle??'none')!=='none'&&<group name="Dolce-integrated-screen-room-with-actual-access">
      {([
        {id:'front' as const,from:[frameLeft,frameFront] as P2,to:[frameRight,frameFront] as P2,
          topFrom:roofFront-headerHeight,topTo:roofFront-headerHeight},
        {id:'left' as const,from:[frameLeft,back] as P2,to:[frameLeft,frameFront] as P2,
          topFrom:roofBack-headerHeight,topTo:roofFront-headerHeight},
        {id:'right' as const,from:[frameRight,back] as P2,to:[frameRight,frameFront] as P2,
          topFrom:roofBack-headerHeight,topTo:roofFront-headerHeight},
        ...(!attached?[{id:'rear' as const,
          from:[frameLeft,back] as P2,to:[frameRight,back] as P2,
          topFrom:roofBack-headerHeight,topTo:roofBack-headerHeight}]:[]),
      ]).map(wall=><DolceScreenWall key={'Dolce-wall-'+wall.id} {...wall}
        bottom={deckHeight+.12}
        openView={project.coverScreenStyle==='dolce-open-view'}
        finish={powder} center={[xMid,zMid]}
        treatment={project.coverScreenRailTreatment??'integrated-kick'}
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
          kickPlateIn:project.coverDoorKickPlateIn??8,
        }}/>
      )}
    </group>}
    {isSolid&&plan.gable&&(project.coverScreenStyle??'none')!=='none'&&
      <DolceGableInfill leftX={frameLeft} rightX={frameRight} z={frameFront}
        beamTopY={eaveY} roofWidthFt={width} ridgeRiseFt={gableRise}
        panelThicknessFt={roofPanelThicknessFt} finish={powder}/>}
    {/* Solid-roof gutter is included above; Fresco uses its own snap channels. */}
  </group>;
}
