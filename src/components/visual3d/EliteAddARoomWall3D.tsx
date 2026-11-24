import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type { SunroomSectionConfig } from '../../lib/types';
import type { RenaissanceWallMeasure } from '../../lib/renaissanceCoverWallLayout';
import type { EliteSunroomSettings,EliteSunroomFinish } from '../../lib/eliteSunroomStudio';
import { eliteWallDimensionWarnings } from '../../lib/eliteSunroomStudio';
import { sunroomDoorRect,sunroomSpansExcludingDoor,sunroomGlazingBays,
  sunroomKickHeightFt,sunroomHasTransom,sunroomWindowOpenings,
  sunroomUprightOffsetsExcludingDoor,type EliteGlazingOpening } from '../../lib/sunroomSectionGeometry';
import { Block,SlopedBeam } from './Primitives';

const FINISH_COLORS:Record<EliteSunroomFinish,string>={
 white:'#e7e9e7',wheat:'#c6b59a',clay:'#aa998d',bronze:'#574b40',
};
const PICTURE_COLOR='#d9e8ef';
const GLASS_COLOR='#bdd7e4';
const EDGE_COLOR='#52565b';
const DOOR_HEIGHT_FT=6+8/12;
const ft=(inches:number)=>inches/12;

function SolidInfill({left,right,bottom,topLeft,topRight,depth,color,name}:{
 left:number;right:number;bottom:number;topLeft:number;topRight:number;
 depth:number;color:string;name:string;
}){
 const geometry=useMemo(()=>{
  if(right-left<.04||Math.min(topLeft,topRight)-bottom<.04)return null;
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
function GlazedBay({opening,frameColor}:{
 opening:EliteGlazingOpening;frameColor:string;
}){
 const width=opening.end-opening.start;
 const hl=opening.topLeftFt-opening.bottomFt;
 const hr=opening.topRightFt-opening.bottomFt;
 const minHeight=Math.min(hl,hr);
 if(width<.20||minHeight<.2)return null;
 const shape=new THREE.Shape();
 shape.moveTo(.05,.06);shape.lineTo(width-.05,.06);
 shape.lineTo(width-.05,Math.max(.08,hr-.05));
 shape.lineTo(.05,Math.max(.08,hl-.05));shape.closePath();
 const sash=.05;
 const cols=opening.style==='double-horizontal-sliders'?4:
   opening.style==='horizontal-sliders'?2:1;
 return <group name={'elite-clear-insulated-'+opening.zone+'-'+opening.style}
   position={[opening.start,opening.bottomFt,0]}>
   {[-1,1].map(sign=><mesh key={'insulated-glass-leaf-'+sign}
     name="clear-insulated-glass-lite"
     position={[0,0,sign*.017]}>
     <shapeGeometry args={[shape]}/>
     <meshPhysicalMaterial color={GLASS_COLOR} transparent opacity={.28}
       roughness={.06} metalness={0} depthWrite={false}
       side={THREE.DoubleSide}/>
   </mesh>)}
   <Block position={[width/2,sash/2,.018]} size={[width,sash,.075]}
     color={frameColor} metalness={.42}/>
   <SlopedBeam start={[0,hl,0]} end={[width,hr,0]} thickness={sash}
     depth={.09} color={frameColor}/>
   {[0,width].map((x,i)=><Block key={'sash-edge-'+i}
     position={[x,minHeight/2,0]} size={[sash,minHeight,.09]}
     color={frameColor} metalness={.4}/>)}
   {Array.from({length:cols-1},(_,i)=><Block key={'slider-stile-'+i}
     position={[width*(i+1)/cols,minHeight/2,0]}
     size={[sash,minHeight-.1,.085]} color={frameColor} metalness={.4}/>)}
   {opening.style==='vertical-sliders'&&<Block name="vertical-slider-meeting-rail"
     position={[width/2,minHeight/2,0]} size={[width-.06,sash,.09]}
     color={frameColor} metalness={.38}/>}
   {opening.style==='casement'&&<>
     <Block name="casement-hinge-stile" position={[.10,minHeight/2,.052]}
       size={[.035,minHeight-.13,.09]} color={frameColor}/>
     <Block name="casement-latch" position={[width-.13,minHeight/2,.07]}
       size={[.035,.20,.07]} color={EDGE_COLOR} metalness={.6}/>
   </>}
   {(opening.style==='horizontal-sliders'||opening.style==='double-horizontal-sliders')&&
     <Block name="slider-latch" position={[width/cols+.06,minHeight/2,.08]}
       size={[.032,.18,.055]} color={EDGE_COLOR} metalness={.5}/>}
 </group>;
}
function ElitePrimeDoor({section,frameColor,glazing}:{
 section:SunroomSectionConfig;frameColor:string;glazing:string;
}){
 const rect=sunroomDoorRect(section);
 if(!rect)return null;
 const width=rect.end-rect.start;
 const isSlider=section.doorType==='slider';
 const hinge=section.doorHinge==='right'?'right':'left';
 const depth=.17;
 const frame=.105;
 const handleX=hinge==='left'?width-.16:.16;
 return <group name={isSlider?'elite-legacy-sliding-door':'elite-prime-full-view-outswing-door'}
   position={[rect.start,0,.022]}>
   <Block name="door-left-zbar-or-jamb" position={[0,DOOR_HEIGHT_FT/2,0]}
     size={[frame,DOOR_HEIGHT_FT,depth]} color={frameColor} metalness={.45}/>
   <Block name="door-right-zbar-or-jamb" position={[width,DOOR_HEIGHT_FT/2,0]}
     size={[frame,DOOR_HEIGHT_FT,depth]} color={frameColor} metalness={.45}/>
   <Block name="door-head" position={[width/2,DOOR_HEIGHT_FT,0]}
     size={[width,frame,depth]} color={frameColor} metalness={.45}/>
   <Block name="door-threshold" position={[width/2,.05,0]}
     size={[width,.10,depth+.04]} color={frameColor} metalness={.43}/>
   {[-1,1].map(side=><mesh key={'full-view-glass-'+side}
     name="prime-clear-full-view-glazed-lite"
     position={[width/2,DOOR_HEIGHT_FT/2,side*.021]}>
     <planeGeometry args={[Math.max(.12,width-.22),DOOR_HEIGHT_FT-.24]}/>
     <meshPhysicalMaterial color={glazing} transparent opacity={.29}
       roughness={.06} metalness={0} side={THREE.DoubleSide}
       depthWrite={false}/>
   </mesh>)}
   {isSlider&&<Block name="sliding-door-center-interlock"
     position={[width/2,DOOR_HEIGHT_FT/2,.04]}
     size={[.075,DOOR_HEIGHT_FT-.16,.10]} color={frameColor}/>}
   {!isSlider&&[.6,DOOR_HEIGHT_FT/2,DOOR_HEIGHT_FT-.7].map((y,i)=>
     <Block key={'outswing-hinge-'+i} name="three-outswing-hinges"
       position={[hinge==='left'?0:width,y,.115]}
       size={[.055,.22,.07]} color={EDGE_COLOR} metalness={.65}/>)}
   <Block name="keyed-entry-hardware-handle"
     position={[handleX,3.2,.13]}
     size={[.07,.30,.075]} color={EDGE_COLOR} metalness={.73}/>
   <Block name="deadbolt" position={[handleX,3.75,.13]}
     size={[.075,.075,.075]} color={EDGE_COLOR} metalness={.75}/>
   <group name={'prime-door-glazing-'+section.doorType}/>
 </group>;
}
function FrameRail({start,end,yLeft,yRight,color,depth,name}:{
 start:number;end:number;yLeft:number;yRight:number;
 color:string;depth:number;name:string;
}){
 const len=end-start;if(len<.04)return null;
 return <group name={name}>
   <SlopedBeam start={[start,yLeft,0]} end={[end,yRight,0]}
     thickness={.075} depth={depth} color={color}/>
   <SlopedBeam start={[start,yLeft+.037,depth/2-.014]}
     end={[end,yRight+.037,depth/2-.014]}
     thickness={.028} depth={.030} color={color}/>
   <SlopedBeam start={[start,yLeft+.037,-depth/2+.014]}
     end={[end,yRight+.037,-depth/2+.014]}
     thickness={.028} depth={.030} color={color}/>
 </group>;
}
function EliteSection({section,xStart,settings}:{
 section:SunroomSectionConfig;xStart:number;settings:EliteSunroomSettings;
}){
 const framing=FINISH_COLORS[settings.framingColor];
 const windowColor=FINISH_COLORS[settings.windowColor];
 const panel=FINISH_COLORS[settings.panelColor];
 const systemDepth=settings.roomSystem==='3-thermal'?ft(3):ft(2);
 const kick=sunroomKickHeightFt(section);
 const transom=sunroomHasTransom(section);
 const transomL=transom?Math.max(0,section.leftTransomHeight):0;
 const transomR=transom?Math.max(0,section.rightTransomHeight):0;
 const transomMax=Math.max(transomL,transomR);
 const mainTop=section.height-transomMax;
 const topLeft=mainTop+transomL,topRight=mainTop+transomR;
 const widths=sunroomSpansExcludingDoor(section);
 const bays=sunroomGlazingBays(section);
 const glass=sunroomWindowOpenings(section);
 const uprights=sunroomUprightOffsetsExcludingDoor(section);
 const uprightFrom=section.uprightMode==='main-only'||section.uprightMode==='main-transom'?kick:0;
 const uprightTop=section.uprightMode==='main-only'||section.uprightMode==='main-kick'?
  mainTop:Math.min(topLeft,topRight);
 const renderPanel=(zone:'main'|'kick'|'transom'|'above-door',kind:string)=>{
  if(kind!=='panel'&&kind!=='insulated'&&kind!=='auto')return null;
  const areas=zone==='above-door'?
    [sunroomDoorRect(section)].filter((v):v is NonNullable<typeof v>=>v!==null):bays;
  return areas.map((area,i)=>{
   const a=area.start/Math.max(.01,section.width),b=area.end/Math.max(.01,section.width);
   const y1=zone==='kick'?0:zone==='main'?kick:
     zone==='transom'?mainTop:DOOR_HEIGHT_FT;
   const topA=zone==='kick'?kick:zone==='main'?mainTop:
     zone==='transom'?topLeft+(topRight-topLeft)*a:section.height;
   const topB=zone==='kick'?kick:zone==='main'?mainTop:
     zone==='transom'?topLeft+(topRight-topLeft)*b:section.height;
   return <SolidInfill key={'panel-'+zone+'-'+i}
     name={'elite-'+zone+'-solid-insulated-panel'}
     left={area.start} right={area.end} bottom={y1}
     topLeft={topA} topRight={topB}
     depth={systemDepth-.035} color={panel}/>;
  });
 };
 return <group name={'elite-add-a-room-section-'+section.label} position={[xStart,0,0]}>
   {/* Receiver and DRC at the structural-wall boundaries, but NO extra
       Elite corner post: the Renaissance posts already support the cover. */}
   {[0,section.width].map((x,i)=><group key={'receiver-and-drc-'+i}
     name={i===0?'left-receiver-drc':'right-receiver-drc'}>
     <Block name="receiving-channel-back"
       position={[x,section.height/2,-systemDepth/2+.018]}
       size={[.072,section.height,.038]} color={framing} metalness={.52}/>
     <Block name="DRC-window-edge"
       position={[x,section.height/2,0]}
       size={[.085,section.height,systemDepth-.035]}
       color={windowColor} metalness={.44}/>
   </group>)}
   {widths.map((span,i)=><FrameRail key={'base-channel-'+i}
     name="elite-bottom-base-channel-weep" start={span.start} end={span.end}
     yLeft={.035} yRight={.035} depth={systemDepth}
     color={framing}/>)}
   <FrameRail name="elite-top-cap-under-renaissance-roof"
     start={0} end={section.width} yLeft={topLeft} yRight={topRight}
     depth={systemDepth} color={framing}/>
   {uprights.map((x,i)=><group key={'elite-hbeam-upright-'+i}>
     <Block name="elite-h-beam-vertical-between-glazing"
       position={[x,(uprightFrom+uprightTop)/2,0]}
       size={[.125,Math.max(.05,uprightTop-uprightFrom),systemDepth]}
       color={framing} metalness={.49}/>
     {[systemDepth/2-.035,-systemDepth/2+.035].map((z,index)=>
       <Block key={'Drc-face-'+index} name="elite-drc-h-beam-window-face"
         position={[x,(uprightFrom+uprightTop)/2,z]}
         size={[.06,Math.max(.05,uprightTop-uprightFrom),.035]}
         color={windowColor} metalness={.43}/>)}
   </group>)}
   {section.kickSection!=='none'&&widths.map((span,i)=>
     <FrameRail key={'kick-hbeam-'+i} name="elite-H-beam-and-DRC-kick-break"
       start={span.start} end={span.end} yLeft={kick} yRight={kick}
       depth={systemDepth} color={framing}/>)}
   {transom&&widths.map((span,i)=>
     <FrameRail key={'transom-hbeam-'+i} name="elite-H-beam-and-DRC-transom-break"
       start={span.start} end={span.end} yLeft={mainTop} yRight={mainTop}
       depth={systemDepth} color={framing}/>)}
   {section.electricChase&&uprights.map((x,i)=><Block
     key={'electric-chase-'+i} name="elite-optional-electrical-chase"
     position={[x,(uprightFrom+uprightTop)/2,.015]}
     size={[.095,Math.max(.1,uprightTop-uprightFrom),.065]}
     color={framing} metalness={.34}/>)}
   {renderPanel('main',section.mainSection)}
   {section.kickSection!=='none'&&renderPanel('kick',section.kickSection)}
   {transom&&renderPanel('transom',section.transomType==='auto'?'panel':section.transomType)}
   {section.doorType!=='none'&&section.doorAboveSection==='panel'&&
     renderPanel('above-door','panel')}
   {glass.map((opening,i)=><GlazedBay key={'elite-glazing-'+i}
     opening={opening} frameColor={windowColor}/>)}
   {section.doorType!=='none'&&<ElitePrimeDoor section={section}
     frameColor={windowColor} glazing={PICTURE_COLOR}/>}
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
 const issues=eliteWallDimensionWarnings(run,sections);
 if(issues.length)return <group name={'elite-wall-requires-measured-dimension-review-'+run.id}/>;
 const dx=run.to[0]-run.from[0],dz=run.to[1]-run.from[1];
 const yaw=-Math.atan2(dz,dx);
 let cursor=0;
 return <group name={'elite-add-a-room-'+settings.roomSystem+'-renaissance-wall-'+run.id}
   position={[run.from[0],run.bottomY,run.from[1]]} rotation={[0,yaw,0]}>
   {sections.map((section,i)=>{
     const x=cursor;cursor+=section.width;
     return <EliteSection key={section.id||i} section={section}
       xStart={x} settings={settings}/>;
   })}
 </group>;
}
