import type { DeckModel } from '../../lib/deckModel';
import type { ConsultationProject } from '../../lib/consultationProject';
import { getCoverVisualProduct, getCoverFinish } from '../../data/visualCatalog';
import { maxReferenceOverhangFt } from '../../lib/renaissanceGuidance';
import { Beam, Block, SlopedBeam, type P2 } from './Primitives';
import * as THREE from 'three';
import { planDolceScreenProfile, roofLineAtX } from '../../lib/renaissanceDetailGeometry';
import { planInsulatedRoofPanels, planDolceGableInfill } from '../../lib/renaissanceRoofGeometry';
import { planWrapAroundGutter } from '../../lib/renaissanceGutterGeometry';
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
function DolceScreenRun({from,to,bottom,topFrom,topTo,openView,finish}:{
  from:P2;to:P2;bottom:number;topFrom:number;topTo:number;
  openView:boolean;finish:string;
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
  const frameLeft=xMid-frameWidth/2,frameRight=xMid+frameWidth/2;
  const back=zMid-frameDepth/2,frameFront=back+frameDepth;
  const roofBackEdge=back-plan.rearOverhangFt;
  const front=frameFront+plan.frontOverhangFt;
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
  const frontPosts=plan.frontPostXsFt.map((x):P2=>[xMid+x,frameFront]);
  const rearPosts=plan.rearPostXsFt.map((x):P2=>[xMid+x,back]);
  const allPosts=[...frontPosts,...rearPosts];
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
        {attached&&<Block position={[x,deckHeight+.009,z]}
          size={[baseOutside,.018,baseOutside]} color={shadowColor} metalness={.42}/>}
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
      <RenaissanceDownspout x={right+inchToFoot(2)} z={front+inchToFoot(2)}
        top={roofFrontY-inchToFoot(1.5)} bottom={deckHeight+inchToFoot(4)}
        color={powder}/>
      {attached&&shape==='studio'&&<RenaissanceReceivingChannel
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
          x={x} frontZ={frameFront} topY={roofAtFront-inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn)/2}
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
        return <group key={'classico-projection-truss-'+i}>
          <RenaissanceTruss from={[x,yBack-drop,roofBackEdge]}
            to={[x,yFront-drop,front]} color={powder}/>
          <RenaissanceCurvedTrussEnd x={x} frontZ={frameFront}
            topY={yFront-inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn)/2}
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
    {(project.coverScreenStyle??'none')!=='none'&&<>
      <DolceScreenRun from={[frameLeft,frameFront]} to={[frameRight,frameFront]}
        bottom={deckHeight+.12} topFrom={roofFront-headerHeight}
        topTo={roofFront-headerHeight}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      <DolceScreenRun from={[frameLeft,back]} to={[frameLeft,frameFront]}
        bottom={deckHeight+.12} topFrom={roofBack-headerHeight}
        topTo={roofFront-headerHeight}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      <DolceScreenRun from={[frameRight,back]} to={[frameRight,frameFront]}
        bottom={deckHeight+.12} topFrom={roofBack-headerHeight}
        topTo={roofFront-headerHeight}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>
      {!attached&&<DolceScreenRun from={[frameLeft,back]} to={[frameRight,back]}
        bottom={deckHeight+.12} topFrom={roofBack-headerHeight}
        topTo={roofBack-headerHeight}
        openView={project.coverScreenStyle==='dolce-open-view'} finish={powder}/>}
    </>}
    {isSolid&&plan.gable&&(project.coverScreenStyle??'none')!=='none'&&
      <DolceGableInfill leftX={frameLeft} rightX={frameRight} z={frameFront}
        beamTopY={eaveY} roofWidthFt={width} ridgeRiseFt={gableRise}
        panelThicknessFt={roofPanelThicknessFt} finish={powder}/>}
    {/* Solid-roof gutter is included above; Fresco uses its own snap channels. */}
  </group>;
}
