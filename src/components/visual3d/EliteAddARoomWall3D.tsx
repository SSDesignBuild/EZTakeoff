import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type { SunroomSectionConfig } from '../../lib/types';
import type { RenaissanceWallMeasure } from '../../lib/renaissanceCoverWallLayout';
import type { EliteSunroomSettings,EliteSunroomFinish } from '../../lib/eliteSunroomStudio';
import { eliteWallBlockingIssues } from '../../lib/eliteSunroomStudio';
import { sunroomDoorRect,sunroomSpansExcludingDoor,sunroomGlazingBays,
  sunroomKickHeightFt,sunroomHasTransom,sunroomWindowOpenings,
  sunroomUprightOffsetsExcludingDoor,sunroomUprightVerticalExtent,
  sunroomMainTopFt,sunroomRoofTopFtAt,sunroomTransomBays,type EliteGlazingOpening } from '../../lib/sunroomSectionGeometry';
import { Block,SlopedBeam } from './Primitives';
import { EliteVerticalExtrusion,EliteHorizontalExtrusion } from './EliteAddARoomExtrusions';
import { ELITE_CATALOG_PROFILES,ELITE_ILLUSTRATIVE_SHEET_IN } from '../../lib/eliteAddARoomExtrusions';
import { ELITE_PRIME_DOOR_HEIGHT_FT,planElitePrimeDoor } from '../../lib/elitePrimeDoorGeometry';

const FINISH_COLORS:Record<EliteSunroomFinish,string>={
 white:'#e7e9e7',wheat:'#c6b59a',clay:'#aa998d',bronze:'#574b40',
};
const PICTURE_COLOR='#d9e8ef';
const DOOR_HEIGHT_FT=ELITE_PRIME_DOOR_HEIGHT_FT;
const ft=(inches:number)=>inches/12;

function SolidInfill({left,right,bottom,topLeft,topRight,depth,color,name}:{
 left:number;right:number;bottom:number;topLeft:number;topRight:number;
 depth:number;color:string;name:string;
}){
 const geometry=useMemo(()=>{
  if(right-left<.04||Math.max(topLeft,topRight)-bottom<.04)return null;
  const shape=new THREE.Shape();
  shape.moveTo(0,0);shape.lineTo(right-left,0);
  shape.lineTo(right-left,topRight-bottom);
  shape.lineTo(0,topLeft-bottom);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false});
  g.translate(0,0,-depth/2);
  g.computeVertexNormals();
  return g;
 },[left,right,bottom,topLeft,topRight,depth]);
 useEffect(()=>()=>geometry?.dispose(),[geometry]);
 if(!geometry)return null;
 return <mesh geometry={geometry} position={[left,bottom,0]} name={name}
   castShadow receiveShadow>
   <meshStandardMaterial color={color} metalness={.18}
     roughness={.53} side={THREE.DoubleSide}/>
 </mesh>;
}
/**
 * A recognizable insulated glazed window set: two clear lites with perimeter
 * spacer and separate sash leaves. Glass depth and sash shape are illustrative.
 * Do not convert gross openings into glass shop cut sizes without vendor CAD.
 */
/**
 * Photo-referenced Elite sash family. Distinguish the H/DRC frame (which is
 * part of the measured Admin takeoff) from the actual sliding/casement/fixed
 * window sash, two parallel track planes and rubber glazing gaskets.
 * Sash sightlines and hardware are visual references, NOT shop-cut dims.
 */
function RectangularSashLite({left,width,bottom,height,depth,color,kind}:{
 left:number;width:number;bottom:number;height:number;depth:number;
 color:string;kind:string;
}){
 if(width<.14||height<.15)return null;
 const rail=Math.min(.105,Math.max(.048,Math.min(width,height)*.085));
 const edge=Math.max(.025,rail*.35);
 const glassW=Math.max(.03,width-rail*2),glassH=Math.max(.04,height-rail*2);
 return <group name={'elite-factory-assembled-'+kind+'-sash'}
   position={[left,bottom,depth]}>
   {/* Weather-sealed separate sash with extruded track lips. A real slider
       shows one sash in front of the other, never a flat split outline. */}
   {[-1,1].map((side,i)=><Block key={'sash-side-'+i}
     name="separate-sash-stile" position={[side<0?rail/2:width-rail/2,height/2,0]}
     size={[rail,height,.082]} color={color} metalness={.32}/>)}
   {[0,height].map((y,i)=><Block key={'sash-rail-'+i}
     name={i===0?'sash-bottom-track':'sash-top-track'}
     position={[width/2,y,.002]} size={[width,rail,.087]}
     color={color} metalness={.32}/>)}
   {/* Weatherseal is four narrow perimeter strips, NOT an opaque
       panel behind otherwise clear insulated glass. */}
   {[-1,1].map((side,i)=><Block key={'sash-gasket-side-'+i}
     name="sash-interior-weatherseal-lip"
     position={[side<0?rail+edge/2:width-rail-edge/2,height/2,-.035]}
     size={[edge,glassH+edge,.026]} color="#777e80" metalness={.22}/>)}
   {[0,height].map((y,i)=><Block key={'sash-gasket-head-'+i}
     name="sash-interior-weatherseal-lip"
     position={[width/2,y===0?rail+edge/2:height-rail-edge/2,-.035]}
     size={[glassW+edge,edge,.026]} color="#777e80" metalness={.22}/>)}
   {[-1,1].map((face,i)=><mesh key={'insulated-lite-'+i}
     name="clear-insulated-glass-lite"
     position={[width/2,height/2,face*.019]}>
     <planeGeometry args={[glassW,glassH]}/>
     <meshPhysicalMaterial color="#dce9ec" transparent opacity={.20}
       roughness={.035} metalness={.06} depthWrite={false}
       side={THREE.DoubleSide}/>
   </mesh>)}
 </group>;
}
function GlazedBay({opening,frameColor}:{
 opening:EliteGlazingOpening;frameColor:string;
}){
 const width=opening.end-opening.start;
 const hl=opening.topLeftFt-opening.bottomFt;
 const hr=opening.topRightFt-opening.bottomFt;
 const taller=Math.max(hl,hr),shorter=Math.min(hl,hr);
 if(width<.20||taller<.12)return null;
 const picture=opening.style==='picture-window'||opening.zone==='transom'||
   opening.zone==='above-door';
 const tapered=Math.abs(hl-hr)>.025;
 const outer=Math.min(.095,Math.max(.055,width*.028));
 // topLeft/topRight are the opening boundary, not the centerline of a
 // finite sash member. Keep its complete upper face inside that boundary.
 const topRailDrop=outer/2*Math.hypot(1,(hr-hl)/Math.max(.01,width));
 const gasket=.017;
 const inset=Math.min(outer+.025,width/6);
 const grade=(hr-hl)/Math.max(.01,width);
 const heightAt=(x:number)=>hl+grade*x;
 const spanAbove=(requiredHeight:number,left:number,right:number)=>{
  if(Math.abs(grade)<1e-8)return hl>=requiredHeight?{left,right}:null;
  const crossing=(requiredHeight-hl)/grade;
  if(grade>0)left=Math.max(left,crossing);else right=Math.min(right,crossing);
  return right-left>.005?{left,right}:null;
 };
 const glassTopInset=inset*Math.hypot(1,grade);
 const glassSpan=spanAbove(.025+glassTopInset,inset,width-inset);
 const baseSpan=spanAbove(outer,0,width);
 const shape=glassSpan?new THREE.Shape():null;
 if(shape&&glassSpan){
  shape.moveTo(glassSpan.left,.025);shape.lineTo(glassSpan.right,.025);
  shape.lineTo(glassSpan.right,heightAt(glassSpan.right)-glassTopInset);
  shape.lineTo(glassSpan.left,heightAt(glassSpan.left)-glassTopInset);shape.closePath();
 }
 const trackH=Math.max(.12,shorter-outer*2);
 const panes=opening.style==='double-horizontal-sliders'?4:
   opening.style==='horizontal-sliders'?2:1;
 return <group name={'elite-clear-insulated-'+opening.zone+'-'+opening.style}
   position={[opening.start,opening.bottomFt,0]}>
   {/* Real window assembly: a visible exterior frame, contrasting thin
       weatherseal and recessed glass surface, not bare transparent rectangles. */}
   {shape&&[-1,1].map((face,i)=><mesh key={'factory-glass-'+i}
     name="clear-insulated-glass-lite"
     position={[0,0,face*.023]}>
     <shapeGeometry args={[shape]}/>
     <meshPhysicalMaterial color="#d8e7ed" transparent opacity={.19}
       roughness={.045} metalness={0} depthWrite={false}
       side={THREE.DoubleSide}/>
   </mesh>)}
   {baseSpan&&<Block name="elite-mill-finish-base-sash"
     position={[(baseSpan.left+baseSpan.right)/2,outer/2,.043]}
     size={[baseSpan.right-baseSpan.left,outer,.10]} color={frameColor} metalness={.31}/>}
   <SlopedBeam start={[0,hl-topRailDrop,.043]} end={[width,hr-topRailDrop,.043]}
     thickness={outer} depth={.10} color={frameColor}/>
   {([hl,hr] as const).map((height,i)=>height>.02&&<Block
     key={'perimeter-stile-'+i} name="sunroom-sash-perimeter"
     position={[i===0?outer/2:width-outer/2,height/2,.043]}
     size={[outer,height,.10]} color={frameColor} metalness={.31}/>)}
   {/* Thin dark EPDM seal creates the actual gasket/readable sightline
       around the glass and behind its aluminum members. */}
   {glassSpan&&<SlopedBeam
     start={[glassSpan.left,heightAt(glassSpan.left)-glassTopInset,.074]}
     end={[glassSpan.right,heightAt(glassSpan.right)-glassTopInset,.074]}
     thickness={gasket} depth={.018} color="#66737b"/>}
   {picture||tapered?null:opening.style==='vertical-sliders'?<>
     <RectangularSashLite left={outer} width={Math.max(.15,width-outer*2)}
       bottom={outer} height={Math.max(.18,trackH/2)}
       depth={-.032} color={frameColor} kind="vertical-slider-lower"/>
     <RectangularSashLite left={outer} width={Math.max(.15,width-outer*2)}
       bottom={outer+trackH/2} height={Math.max(.18,trackH/2)}
       depth={.035} color={frameColor} kind="vertical-slider-upper"/>
     <Block name="vertical-slider-meeting-rail"
       position={[width/2,outer+trackH/2,.098]}
       size={[width-outer*2,.09,.065]} color={frameColor}/>
   </>:opening.style==='casement'?<>
     <RectangularSashLite left={outer} width={Math.max(.15,width-outer*2)}
       bottom={outer} height={trackH} depth={.035}
       color={frameColor} kind="casement"/>
     <Block name="casement-hinge-stile" position={[outer,shorter/2,.12]}
       size={[.046,Math.max(.1,trackH-.1),.04]} color={frameColor}/>
     <Block name="casement-latch" position={[width-outer*2,shorter/2,.137]}
       size={[.045,.22,.06]} color="#63666a" metalness={.65}/>
   </>:<>
     {/* Two-track aluminum horizontal sliders; the leaves cross at the
         mullion, with inner and outer tracks and realistic interlocks. */}
     {Array.from({length:panes},(_,i)=>{
       const paneW=Math.max(.18,(width-outer*2)/panes+.035);
       const left=outer+i*(width-outer*2)/panes;
       return <RectangularSashLite key={'elite-sash-leaf-'+i} left={left}
         width={paneW} bottom={outer} height={trackH}
         depth={i%2===0?-.046:.047} color={frameColor}
         kind={panes===4?'double-horizontal-slider':'horizontal-slider'}/>;
     })}
     <Block name="double-track-sill-rail" position={[width/2,outer/2,.10]}
       size={[width-outer*2,.037,.11]} color={frameColor}/>
     <Block name="slider-latch"
       position={[width/2+.05,Math.min(3.2,trackH/2),.135]}
       size={[.056,.18,.066]} color="#565b60" metalness={.62}/>
   </>}
 </group>;
}
function ElitePrimeDoor({section,frameColor,glazing,wallDepthFt}:{
 section:SunroomSectionConfig;frameColor:string;glazing:string;wallDepthFt:number;
}){
 const rect=sunroomDoorRect(section);
 if(!rect)return null;
 const width=rect.end-rect.start;
 const isSlider=section.doorType==='slider';
 const hinge=section.doorHinge==='right'?'right':'left';
 // Photo-reference: real 32/36-inch Prime has a substantial aluminum
 // leaf, wider 3.5-inch stiles, a visible top rail and a roughly 9-inch
 // lower kick rail, not a sheet of glass almost touching the threshold.
 // These are concept-view sightlines, not Elite shop fabrication cuts.
 const door=planElitePrimeDoor(width,wallDepthFt);
 const {glassWidth,glassHeight,glassCenterY,leafCenterZ,leafDepth}=door;
 const handleX=hinge==='left'?door.leafRight-door.leafStile/2:
   door.leafLeft+door.leafStile/2;
 return <group name={isSlider?'elite-legacy-sliding-door':'elite-prime-full-view-outswing-door'}
   position={[rect.start,0,0]}>
   {/* Prime full-view commercial aluminum entry: Z-bar perimeter,
       distinct leaf rails, nearly full-height glazing and simple flush
       threshold. Visual sightlines are calibrated to supplied field photos. */}
   {[door.leftJamb,door.rightJamb].map((part,i)=><Block key={'jamb-'+i}
     name={i===0?'door-left-zbar-or-jamb':'door-right-zbar-or-jamb'}
     {...part} color={frameColor} metalness={.35}/>)}
   <Block name="door-head" {...door.head} color={frameColor} metalness={.35}/>
   <Block name="door-threshold" {...door.threshold} color={frameColor} metalness={.35}/>
   <Block name="full-view-door-leaf-left-stile" {...door.leftStile}
     color={frameColor} metalness={.35}/>
   <Block name="full-view-door-leaf-right-stile" {...door.rightStile}
     color={frameColor} metalness={.35}/>
   <Block name="full-view-door-leaf-top-rail" {...door.topRail} color={frameColor}/>
   <Block name="full-view-door-leaf-bottom-rail" {...door.bottomRail} color={frameColor}/>
   <Block name="prime-lower-raised-sill-trim" {...door.sillTrim}
     color={frameColor} metalness={.34}/>
   {/* Prime glazing gasket is perimeter-only: keep full-view pane CLEAR. */}
   {[-1,1].map((sign,i)=><Block key={'prime-glazing-gasket-side-'+i}
     name="tempered-glass-black-edge-seal"
     position={[width/2+sign*glassWidth/2,glassCenterY,leafCenterZ-.015]}
     size={[.029,glassHeight+.025,.031]} color="#78858b"/>)}
   {[-1,1].map((sign,i)=><Block key={'prime-glazing-gasket-head-'+i}
     name="tempered-glass-black-edge-seal"
     position={[width/2,glassCenterY+sign*glassHeight/2,leafCenterZ-.015]}
     size={[glassWidth+.02,.028,.031]} color="#78858b"/>)}
   {[-1,1].map((face,i)=><mesh key={'prime-glass-'+i}
     name="prime-clear-full-view-glazed-lite"
     position={[width/2,glassCenterY,leafCenterZ+face*.021]}>
     <planeGeometry args={[glassWidth,glassHeight]}/>
     <meshPhysicalMaterial color={glazing} transparent opacity={.19}
       roughness={.045} metalness={.03} depthWrite={false}
       side={THREE.DoubleSide}/>
   </mesh>)}
   {isSlider&&<Block name="sliding-door-center-interlock"
     position={[width/2,DOOR_HEIGHT_FT/2,door.leafFront+.055]}
     size={[.075,DOOR_HEIGHT_FT-.18,.11]} color={frameColor}/>}
   {!isSlider&&[.65,DOOR_HEIGHT_FT/2,DOOR_HEIGHT_FT-.72].map((y,i)=>
     <Block key={'prime-outswing-hinge-'+i} name="three-outswing-hinges"
       position={[hinge==='left'?door.leafLeft:door.leafRight,y,door.leafFront+.0425]}
       size={[.06,.24,.085]} color="#70777d" metalness={.74}/>)}
   {!isSlider&&<group name="elite-prime-entry-lockset-visible-both-sides">
     {/* The supplied real door has a ROUND metal knob and a separate
         deadbolt. Model both outward and inward faces so camera orientation
         cannot hide hardware behind the glazing leaf. */}
     {[-1,1].map((face,i)=><group key={'prime-lock-face-'+i}>
       <mesh name="prime-door-brushed-nickel-knob-escutcheon"
         position={[handleX,3.18,leafCenterZ+face*(leafDepth/2+.024)]}
         rotation={[Math.PI/2,0,0]}>
         <cylinderGeometry args={[.105,.105,.048,28]}/>
         <meshStandardMaterial color="#a9adb3" metalness={.86} roughness={.25}/>
       </mesh>
       <mesh name="keyed-entry-hardware-handle"
         position={[handleX,3.18,leafCenterZ+face*(leafDepth/2+.098)]}>
         <sphereGeometry args={[.104,24,16]}/>
         <meshStandardMaterial color="#c2c6cc" metalness={.82} roughness={.18}/>
       </mesh>
       <mesh name="prime-deadbolt-round-backplate"
         position={[handleX,3.79,leafCenterZ+face*(leafDepth/2+.0225)]}
         rotation={[Math.PI/2,0,0]}>
         <cylinderGeometry args={[.084,.084,.045,28]}/>
         <meshStandardMaterial color="#a3a8ae" metalness={.82} roughness={.24}/>
       </mesh>
       <mesh name="deadbolt" position={[handleX,3.79,leafCenterZ+face*(leafDepth/2+.0635)]}
         rotation={[Math.PI/2,0,0]}>
         <cylinderGeometry args={[.047,.047,.031,20]}/>
         <meshStandardMaterial color="#d0d3d7" metalness={.75} roughness={.21}/>
       </mesh>
     </group>)}
   </group>}
   <group name={'prime-door-glazing-'+section.doorType}/>
 </group>;
}
function EliteSection({section,xStart,settings,index,total}:{
 section:SunroomSectionConfig;xStart:number;settings:EliteSunroomSettings;
 index:number;total:number;
}){
 const framing=FINISH_COLORS[settings.framingColor];
 const windowColor=FINISH_COLORS[settings.windowColor];
 const panel=FINISH_COLORS[settings.panelColor];
 const systemDepth=settings.roomSystem==='3-thermal'?ft(3):ft(2);
 const kick=sunroomKickHeightFt(section);
 const transom=sunroomHasTransom(section);
 const transomL=transom?Math.max(0,section.leftTransomHeight):0;
 const transomR=transom?Math.max(0,section.rightTransomHeight):0;
 const mainTop=sunroomMainTopFt(section);
 const topLeft=mainTop+transomL,topRight=mainTop+transomR;
 const roofSlope=(topRight-topLeft)/Math.max(.01,section.width);
 const capWebFt=ft(ELITE_ILLUSTRATIVE_SHEET_IN);
 const roofCutAt=(x:number)=>sunroomRoofTopFtAt(section,x)-capWebFt;
 const uprightsReachRoof=section.uprightMode!=='main-only'&&section.uprightMode!=='main-kick';
 const widths=sunroomSpansExcludingDoor(section);
 const bays=sunroomGlazingBays(section);
 const glass=sunroomWindowOpenings(section);
 const uprights=sunroomUprightOffsetsExcludingDoor(section);
 const extentAt=(station:number)=>sunroomUprightVerticalExtent(section,station);
 const renderPanel=(zone:'main'|'kick'|'transom'|'above-door',kind:string)=>{
  if(kind!=='panel'&&kind!=='insulated'&&kind!=='auto')return null;
  const areas=zone==='above-door'?
     [sunroomDoorRect(section)].filter((v):v is NonNullable<typeof v>=>v!==null)
     :zone==='transom'?sunroomTransomBays(section):bays;
  return areas.map((area,i)=>{
   const a=area.start/Math.max(.01,section.width),b=area.end/Math.max(.01,section.width);
   const y1=zone==='kick'?0:zone==='main'?kick:
     zone==='transom'?mainTop:DOOR_HEIGHT_FT;
   const topA=zone==='kick'?kick:zone==='main'?mainTop:
     zone==='transom'?topLeft+(topRight-topLeft)*a:mainTop;
   const topB=zone==='kick'?kick:zone==='main'?mainTop:
     zone==='transom'?topLeft+(topRight-topLeft)*b:mainTop;
   return <SolidInfill key={'panel-'+zone+'-'+i}
     name={'elite-'+zone+'-solid-insulated-panel'}
     left={area.start} right={area.end} bottom={y1}
     topLeft={topA} topRight={topB}
     depth={systemDepth-.035} color={panel}/>;
  });
 };
 return <group name={'elite-add-a-room-section-'+section.label} position={[xStart,0,0]}>
   {/* Only the two OUTSIDE wall boundaries touch Renaissance columns.
        Internal section joins share one vertical H extrusion (not two
        overlapping receivers or invented Elite structural corner posts). */}
   {index===0&&<group name="elite-exterior-left-receiver-and-drc">
      <EliteVerticalExtrusion system={settings.roomSystem} kind="receiver"
        x={0} bottom={0} height={roofCutAt(0)} topSlope={roofSlope}
        color={framing} name="receiving-channel-back"/>
      <EliteVerticalExtrusion system={settings.roomSystem} kind="drc"
        x={ft(ELITE_CATALOG_PROFILES[settings.roomSystem].receiverLipIn)}
        bottom={0} height={roofCutAt(ft(ELITE_CATALOG_PROFILES[settings.roomSystem].receiverLipIn))}
        topSlope={roofSlope}
        color={windowColor} name="DRC-window-edge"/>
   </group>}
   {index===total-1&&<group name="elite-exterior-right-receiver-and-drc">
      <EliteVerticalExtrusion system={settings.roomSystem} kind="receiver"
        x={section.width} bottom={0} height={roofCutAt(section.width)} topSlope={roofSlope}
        flip color={framing} name="receiving-channel-back"/>
      <EliteVerticalExtrusion system={settings.roomSystem} kind="drc"
        x={section.width-ft(ELITE_CATALOG_PROFILES[settings.roomSystem].receiverLipIn)}
        bottom={0} height={roofCutAt(section.width-ft(ELITE_CATALOG_PROFILES[settings.roomSystem].receiverLipIn))}
        topSlope={roofSlope}
        flip color={windowColor} name="DRC-window-edge"/>
   </group>}
   {index>0&&<group name="elite-shared-internal-section-H">
      <EliteVerticalExtrusion system={settings.roomSystem} kind="h-vertical"
        x={0} bottom={0} height={roofCutAt(0)} topSlope={roofSlope}
        color={framing} name="elite-h-beam-vertical-between-sections"/>
      {[-1,1].map((sign,j)=>
        <EliteVerticalExtrusion key={'shared-h-face-'+j}
          system={settings.roomSystem} kind="drc"
          x={sign*ft(ELITE_CATALOG_PROFILES[settings.roomSystem].hFaceIn/2)}
          bottom={0} height={roofCutAt(0)+sign*ft(ELITE_CATALOG_PROFILES[settings.roomSystem].hFaceIn/2)*roofSlope}
          topSlope={roofSlope} flip={j===1}
          color={windowColor} name="elite-shared-H-DRC-window-face"/>)}
   </group>}
   {widths.map((span,i)=><EliteHorizontalExtrusion key={'base-channel-'+i}
      system={settings.roomSystem} kind="bottom"
      name="elite-bottom-base-channel-weep" start={span.start} end={span.end}
      yLeft={0} yRight={0} color={framing}/>)}
   <EliteHorizontalExtrusion system={settings.roomSystem} kind="top"
      name="elite-top-cap-under-renaissance-roof"
      start={0} end={section.width} yLeft={topLeft} yRight={topRight}
      color={framing}/>
   {uprights.map((x,i)=>{
      const extent=extentAt(x);
      if(extent.lengthFt<.06)return null;
      return <group key={'elite-hbeam-upright-'+i}>
        <EliteVerticalExtrusion system={settings.roomSystem} kind="h-vertical"
          x={x} bottom={extent.bottomFt} height={extent.lengthFt-(uprightsReachRoof?capWebFt:0)}
          topSlope={uprightsReachRoof?roofSlope:0}
          color={framing} name="elite-h-beam-vertical-between-glazing"/>
        {[-1,1].map((sign,index)=>
          <EliteVerticalExtrusion key={'hbeam-drc-'+index} kind="drc"
            system={settings.roomSystem} name="elite-drc-h-beam-window-face"
            x={x+sign*(settings.roomSystem==='3-thermal'?.088:.046)}
            bottom={extent.bottomFt}
            height={extent.lengthFt+(uprightsReachRoof?
              sign*(settings.roomSystem==='3-thermal'?.088:.046)*roofSlope-capWebFt:0)}
            topSlope={uprightsReachRoof?roofSlope:0}
            flip={index===1} color={windowColor}/>)}
      </group>;
   })}
   {section.kickSection!=='none'&&widths.map((span,i)=>
      <EliteHorizontalExtrusion key={'kick-hbeam-'+i}
        system={settings.roomSystem} kind="h-horizontal"
        name="elite-H-beam-and-DRC-kick-break"
        start={span.start} end={span.end} yLeft={kick} yRight={kick}
        color={framing}/>)}
   {transom&&<EliteHorizontalExtrusion
        system={settings.roomSystem} kind="h-horizontal"
        name="elite-H-beam-and-DRC-transom-break-continuous"
        start={0} end={section.width}
        yLeft={mainTop-ft(ELITE_CATALOG_PROFILES[settings.roomSystem].hFaceIn/2)}
        yRight={mainTop-ft(ELITE_CATALOG_PROFILES[settings.roomSystem].hFaceIn/2)}
        color={framing}/>}
   {section.electricChase&&uprights.map((x,i)=>{
     const extent=extentAt(x);
     return <Block key={'electric-chase-'+i} name="elite-optional-electrical-chase"
       position={[x,(extent.bottomFt+extent.topFt)/2,.015]}
       size={[.095,Math.max(.1,extent.lengthFt),.065]}
       color={framing} metalness={.34}/>;
   })}
   {renderPanel('main',section.mainSection)}
   {section.kickSection!=='none'&&renderPanel('kick',section.kickSection)}
   {transom&&renderPanel('transom',section.transomType==='auto'?'panel':section.transomType)}
   {section.doorType!=='none'&&section.doorAboveSection==='panel'&&
     renderPanel('above-door','panel')}
   {glass.map((opening,i)=><GlazedBay key={'elite-glazing-'+i}
     opening={opening} frameColor={windowColor}/>)}
   {section.doorType!=='none'&&(()=>{
     const door=sunroomDoorRect(section);
     if(!door)return null;
     // The factory-entry jamb H runs reach the pitched upper edge at each
     // side of the opening. They are not additional structural corner posts.
     return [door.start,door.end].filter(x=>x>.01&&x<section.width-.01)
       .map((x,i)=>{
         const top=roofCutAt(x);
         return <EliteVerticalExtrusion key={'elite-door-jamb-'+i}
           system={settings.roomSystem} kind="h-vertical"
           name="elite-prime-full-view-door-roof-reaching-jamb"
           x={x} bottom={0} height={top} topSlope={roofSlope} color={framing}/>;
       });
   })()}
   {section.doorType!=='none'&&<ElitePrimeDoor section={section}
     frameColor={windowColor} glazing={PICTURE_COLOR} wallDepthFt={systemDepth}/>}
 </group>;
}
/**
 * Actual per-side 3D assembly, no geometry rescaling. Incompatible saved
 * sizes are withheld instead of publishing believable-but-wrong 3D.
 */
export function EliteAddARoomWall3D({run,sections,settings}:{
 run:RenaissanceWallMeasure;sections:SunroomSectionConfig[];
 settings:EliteSunroomSettings;
}){
 const issues=eliteWallBlockingIssues(run,sections);
 if(issues.length)return <group name={'elite-wall-requires-measured-dimension-review-'+run.id}/>;
 const dx=run.to[0]-run.from[0],dz=run.to[1]-run.from[1];
 const yaw=-Math.atan2(dz,dx);
 let cursor=0;
 return <group name={'elite-add-a-room-'+settings.roomSystem+'-renaissance-wall-'+run.id}
   position={[run.from[0],run.bottomY,run.from[1]]} rotation={[0,yaw,0]}>
   {sections.map((section,i)=>{
     const x=cursor;cursor+=section.width;
     return <EliteSection key={section.id||i} section={section}
       xStart={x} index={i} total={sections.length} settings={settings}/>;
   })}
 </group>;
}
