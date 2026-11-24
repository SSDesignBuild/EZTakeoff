import type { SunroomSectionConfig } from './types';

/**
 * Shared SUNROOM section geometry. This is the common physical layout for
 * Admin 2D, Admin 24-ft cut takeoff and Sales 3D. Dimensions are in feet.
 * Openings are gross measured wall bays, NOT vendor daylight order sizes.
 */
export const ELITE_WINDOW_STYLES=[
 'horizontal-sliders','double-horizontal-sliders','vertical-sliders',
 'casement','picture-window',
] as const;
export type EliteWindowStyle=typeof ELITE_WINDOW_STYLES[number];
export type EliteWindowZone='main'|'kick'|'transom'|'above-door';
export type SunroomSpan={start:number;end:number};
export interface EliteGlazingOpening extends SunroomSpan{
 zone:EliteWindowZone;
 style:EliteWindowStyle;
 bottomFt:number;
 topLeftFt:number;
 topRightFt:number;
}
export const isSunroomWindowKind=(value:string):boolean=>
 ELITE_WINDOW_STYLES.includes(value as EliteWindowStyle)||value==='window';
export function normalizeEliteWindowStyle(style:string):EliteWindowStyle{
 return (ELITE_WINDOW_STYLES.includes(style as EliteWindowStyle)
   ?style:'picture-window') as EliteWindowStyle;
}
export function sunroomHasTransom(section:SunroomSectionConfig):boolean{
 return section.transomType!=='none'&&
  (section.transomType!=='auto'||(section.height>10&&section.mainSection!=='picture-window'));
}
/** Height is measured at the taller roof edge. Both transom rise values
 * are above ONE level head for the entire physical wall opening. */
export function sunroomMainTopFt(section:SunroomSectionConfig):number{
 const has=sunroomHasTransom(section);
 const rise=has?Math.max(0,section.leftTransomHeight,section.rightTransomHeight):0;
 return Math.max(0,section.height-rise);
}
export function sunroomRoofTopFtAt(section:SunroomSectionConfig,offsetFt:number):number{
 const mainTop=sunroomMainTopFt(section);
 if(!sunroomHasTransom(section))return mainTop;
 const portion=Math.max(0,Math.min(1,offsetFt/Math.max(.01,section.width)));
 return mainTop+Math.max(0,section.leftTransomHeight)*(1-portion)+
   Math.max(0,section.rightTransomHeight)*portion;
}
export function sunroomUprightVerticalExtent(section:SunroomSectionConfig,offsetFt:number):{
 bottomFt:number;topFt:number;lengthFt:number;
}{
 const kick=sunroomKickHeightFt(section);
 const bottomFt=section.uprightMode==='main-only'||section.uprightMode==='main-transom'?kick:0;
 const topFt=section.uprightMode==='main-only'||section.uprightMode==='main-kick'?
   sunroomMainTopFt(section):sunroomRoofTopFtAt(section,offsetFt);
 return {bottomFt,topFt,lengthFt:Math.max(0,topFt-bottomFt)};
}
export function sunroomRoofCapLengthFt(section:SunroomSectionConfig):number{
 return Math.hypot(section.width,
   sunroomRoofTopFtAt(section,section.width)-sunroomRoofTopFtAt(section,0));
}
export function sunroomTransomPanelAreaFt2(section:SunroomSectionConfig):number{
 if(!sunroomHasTransom(section))return 0;
 return section.width*Math.max(0,section.leftTransomHeight+section.rightTransomHeight)/2;
}
export function sunroomKickHeightFt(section:SunroomSectionConfig):number{
 return section.kickSection==='none'?0:
  Math.max(0,Math.min(Number(section.kickHeight)||0,4));
}
export function sunroomDoorWidthFeet(section:SunroomSectionConfig):number{
 if(section.doorType==='slider')return Math.min(6,Math.max(0,section.width));
 if(section.doorType==='single'){
  const width=section.doorWidthIn===32?32:36;
  return Math.min(width/12,Math.max(0,section.width));
 }
 return 0;
}
export function sunroomDoorLeftFeet(section:SunroomSectionConfig):number{
 const width=sunroomDoorWidthFeet(section);
 const max=Math.max(0,section.width-width);
 if(section.doorType==='none')return 0;
 if(section.doorPlacement==='left')return 0;
 if(section.doorPlacement==='right')return max;
 if(section.doorPlacement==='custom')
  return Math.max(0,Math.min(max,Number(section.doorOffsetInches||0)/12));
 return max/2;
}
export function sunroomSpansExcludingDoor(section:SunroomSectionConfig):SunroomSpan[]{
 const width=Math.max(0,section.width);
 const doorWidth=sunroomDoorWidthFeet(section),left=sunroomDoorLeftFeet(section);
 if(section.doorType==='none'||doorWidth<=0)return width>0?[{start:0,end:width}]:[];
 const right=left+doorWidth;
 return [...(left>.01?[{start:0,end:left}]:[]),
  ...(right<width-.01?[{start:right,end:width}]:[])];
}
/** The same largest-remainder upright allocation used by the legacy 2D takeoff. */
export function sunroomUprightOffsetsExcludingDoor(section:SunroomSectionConfig):number[]{
 const spans=sunroomSpansExcludingDoor(section).filter(span=>span.end-span.start>.05);
 const total=Math.max(0,Math.min(60,Math.floor(Number(section.uprights)||0)));
 if(total===0||!spans.length)return [];
 const totalWidth=spans.reduce((sum,span)=>sum+span.end-span.start,0);
 const allocations=spans.map(span=>{
  const exact=totalWidth>0?total*(span.end-span.start)/totalWidth:0;
  return {span,count:Math.floor(exact),remainder:exact-Math.floor(exact)};
 });
 let remaining=total-allocations.reduce((sum,item)=>sum+item.count,0);
 allocations.sort((a,b)=>b.remainder-a.remainder||
  (b.span.end-b.span.start)-(a.span.end-a.span.start));
 for(const item of allocations){if(remaining<=0)break;item.count++;remaining--;}
 allocations.sort((a,b)=>a.span.start-b.span.start);
 return allocations.flatMap(({span,count})=>Array.from({length:count},(_,i)=>
  span.start+(i+1)*(span.end-span.start)/(count+1)));
}
export function sunroomGlazingBays(section:SunroomSectionConfig):SunroomSpan[]{
 const uprights=sunroomUprightOffsetsExcludingDoor(section);
 return sunroomSpansExcludingDoor(section).flatMap(span=>{
  const edges=[span.start,...uprights.filter(x=>x>span.start+.01&&x<span.end-.01),span.end];
  return edges.slice(1).map((right,i)=>({start:edges[i],end:right}))
   .filter(b=>b.end-b.start>.12);
 });
}
/** Include upper glazing over a door: the lower wall opening excludes the
 * door, but the pitched transom and head span above the door continue. */
export function sunroomTransomBays(section:SunroomSectionConfig):SunroomSpan[]{
 const door=sunroomDoorRect(section);
 const breaks=[0,section.width,...sunroomUprightOffsetsExcludingDoor(section),
  ...(door?[door.start,door.end]:[])];
 const stations=[...new Set(breaks.filter(Number.isFinite))]
  .sort((a,b)=>a-b);
 return stations.slice(1).map((end,i)=>({start:stations[i],end}))
  .filter(span=>span.end-span.start>.12);
}
export function sunroomWindowOpenings(section:SunroomSectionConfig):EliteGlazingOpening[]{
 const kick=sunroomKickHeightFt(section),hasTransom=sunroomHasTransom(section);
 const leftTransom=hasTransom?Math.max(0,Number(section.leftTransomHeight)||0):0;
 const rightTransom=hasTransom?Math.max(0,Number(section.rightTransomHeight)||0):0;
 const mainTop=Math.max(kick,sunroomMainTopFt(section));
 const openings:EliteGlazingOpening[]=[];
 const add=(zone:EliteWindowZone,kind:string,bottomFt:number,topL:number,topR:number,
   bays:SunroomSpan[]=sunroomGlazingBays(section))=>{
  if(!isSunroomWindowKind(kind))return;
  for(const bay of bays){
   const xL=bay.start/Math.max(section.width,.01),xR=bay.end/Math.max(section.width,.01);
   const interpolate=(x:number)=>topL+(topR-topL)*x;
   const hL=interpolate(xL),hR=interpolate(xR);
   // A real triangular transom terminates at ZERO rise on the low eave.
   // Do not silently drop that final bay just because one edge is flat.
   if(Math.max(hL,hR)-bottomFt<.12)continue;
   openings.push({...bay,zone,style:normalizeEliteWindowStyle(kind),
    bottomFt,topLeftFt:hL,topRightFt:hR});
  }
 };
 add('main',section.mainSection,kick,mainTop,mainTop);
 if(kick>.01)add('kick',section.kickSection,0,kick,kick);
 if(hasTransom)add('transom',section.transomType,mainTop,
  mainTop+leftTransom,mainTop+rightTransom,sunroomTransomBays(section));
 // Over-door fixed glass ends at the LEVEL transom break, not the high roof.
 // The sloping transom above the door is a separate manufactured opening.
 if(section.doorType!=='none'&&section.doorAboveSection==='window'&&
   mainTop>6+8/12+.1){
  openings.push({zone:'above-door',style:'picture-window',
   start:sunroomDoorLeftFeet(section),
   end:sunroomDoorLeftFeet(section)+sunroomDoorWidthFeet(section),
   bottomFt:6+8/12,topLeftFt:mainTop,topRightFt:mainTop});
 }
 return openings;
}
export function sunroomDoorRect(section:SunroomSectionConfig):SunroomSpan|null{
 return section.doorType==='none'?null:{
  start:sunroomDoorLeftFeet(section),
  end:sunroomDoorLeftFeet(section)+sunroomDoorWidthFeet(section),
 };
}
export function totalSunroomSectionWidth(sections:readonly SunroomSectionConfig[]):number{
 return sections.reduce((n,s)=>n+(Number.isFinite(s.width)?s.width:0),0);
}
