import type { ConsultationProject } from './consultationProject';
import type { SunroomSectionConfig } from './types';
import type { RenaissanceWallMeasure,CoverWallSide } from './renaissanceCoverWallLayout';
import { createSunroomSection,parseSunroomSections } from './sectioning';
import { SERVICES } from '../data/services';
import { calculateEstimate } from './estimate';

export type EliteSunroomFinish='white'|'wheat'|'clay'|'bronze';
export type EliteSystem='3-thermal'|'2-nonthermal';
export interface EliteSunroomSettings{
 roomSystem:EliteSystem;
 framingColor:EliteSunroomFinish;
 panelColor:EliteSunroomFinish;
 windowColor:EliteSunroomFinish;
 glassType:'clear-insulated';
 // With a Renaissance cover we are enclosing EXISTING structural posts.
 // No independent Elite corner posts; the Admin service retains its own
 // optional full-new-structure workflow.
 buildMode:'existing-structure';
 walls:Partial<Record<CoverWallSide,string>>;
}
const adminSunroom=SERVICES.find(service=>service.slug==='sunrooms');
export function defaultEliteSunroomSettings():EliteSunroomSettings{
 const d=adminSunroom?.defaults;
 return {
  roomSystem:d?.roomSystem==='2-nonthermal'?'2-nonthermal':'3-thermal',
  framingColor:(d?.framingColor??'white') as EliteSunroomFinish,
  panelColor:(d?.panelColor??'white') as EliteSunroomFinish,
  windowColor:(d?.windowColor??'white') as EliteSunroomFinish,
  glassType:'clear-insulated',buildMode:'existing-structure',walls:{},
 };
}
export function currentEliteSunroomSettings(project:ConsultationProject):EliteSunroomSettings{
 const defaults=defaultEliteSunroomSettings(),saved=project.eliteSunroom;
 return {...defaults,...saved,buildMode:'existing-structure',
  glassType:'clear-insulated',walls:{...saved?.walls}};
}
const roundFt=(ft:number)=>Math.round(ft*1000)/1000;
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
/**
 * An unsaved side starts as editable sections using the measured actual
 * Renaissance post positions; no default 8+8+3 ft layout is stretched.
 * The user can retain fully custom lengths/heights, and mismatches become
 * explicit blockers, never silent scaling.
 */
export function makeDefaultEliteWallSections(run:RenaissanceWallMeasure):SunroomSectionConfig[]{
 const available=run.widthFt;
 if(!Number.isFinite(available)||available<2)return [];
 const includeDoor=run.id==='front'&&available>=7;
 const doorWidth=includeDoor?3:0;
 const leftover=available-doorWidth;
 const eachSide=leftover/2;
 const segmentWidths:number[]=[];
 if(includeDoor){
  const leftCount=Math.max(1,Math.ceil(eachSide/5));
  for(let i=0;i<leftCount;i++)segmentWidths.push(eachSide/leftCount);
  segmentWidths.push(doorWidth);
  for(let i=0;i<leftCount;i++)segmentWidths.push(eachSide/leftCount);
 }else{
  const count=Math.max(1,Math.ceil(available/5));
  for(let i=0;i<count;i++)segmentWidths.push(available/count);
 }
 const result:SunroomSectionConfig[]=[];
 let offset=0;
 for(let i=0;i<segmentWidths.length;i++){
  const width=i===segmentWidths.length-1?available-offset:roundFt(segmentWidths[i]);
  const first=offset/available,last=(offset+width)/available;
  const hLeft=run.topFrom-run.bottomY-.035;
  const hRight=run.topTo-run.bottomY-.035;
  const hA=lerp(hLeft,hRight,first),hB=lerp(hLeft,hRight,last);
  const minH=Math.min(hA,hB),maxH=Math.max(hA,hB);
  const slope=Math.abs(hA-hB);
  const isDoor=includeDoor&&i===Math.floor(segmentWidths.length/2);
  const transom=slope>.08?'picture-window':'none';
  result.push(createSunroomSection(i,{
   id:'elite-'+run.id+'-default-'+i,
   label:'Section '+(i+1),width,height:roundFt(maxH),
   uprights:0,mainSection:isDoor?'panel':'horizontal-sliders',
   kickSection:isDoor?'none':'insulated',
   kickHeight:isDoor?0:Math.min(2,Math.max(0,minH-5)),
   transomType:transom,
   leftTransomHeight:transom==='none'?0:roundFt(Math.max(0,hA-minH)),
   rightTransomHeight:transom==='none'?0:roundFt(Math.max(0,hB-minH)),
   doorType:isDoor?'single':'none',
   doorWidthIn:36,doorHinge:'left',doorPlacement:'center',
   doorAboveSection:'window',uprightMode:'all',electricChase:false,
   bottomAttach:'wood',topAttach:'metal',leftAttach:'metal',rightAttach:'metal',
  }));
  offset+=width;
 }
 return result;
}
export function eliteWallSections(project:ConsultationProject,run:RenaissanceWallMeasure):SunroomSectionConfig[]{
 const raw=project.eliteSunroom?.walls?.[run.id];
 return typeof raw==='string'&&raw.trim()?parseSunroomSections(raw,0):
  makeDefaultEliteWallSections(run);
}
export function eliteWallDimensionWarnings(run:RenaissanceWallMeasure,
 sections:readonly SunroomSectionConfig[]):string[]{
 const warnings:string[]=[];
 if(!sections.length)return ['No valid Elite sections for '+run.id+' wall'];
 const measured=sections.reduce((sum,section)=>sum+section.width,0);
 if(Math.abs(measured-run.widthFt)>.065)
  warnings.push(run.id+' Elite sections total '+measured.toFixed(2)+
   ' ft but Renaissance wall between seated posts measures '+run.widthFt.toFixed(2)+
   ' ft. Match widths before rendering/quoting; sections are never stretched.');
 let offset=0;
 for(const section of sections){
  const begin=offset/Math.max(.1,run.widthFt);
  const finish=(offset+section.width)/Math.max(.1,run.widthFt);
  const localHeight=Math.max(
   lerp(run.topFrom,run.topTo,begin)-run.bottomY-.035,
   lerp(run.topFrom,run.topTo,finish)-run.bottomY-.035);
  if(!Number.isFinite(section.height)||Math.abs(localHeight-section.height)>.20)
   warnings.push(run.id+' / '+section.label+': entered '+section.height+
    ' ft height differs from roof soffit '+localHeight.toFixed(2)+
    ' ft. Verify actual site heights and transom slopes.');
  if(!Number.isFinite(section.width)||section.width<.5||section.height<6)
   warnings.push(run.id+' / '+section.label+': incomplete or invalid width/height.');
  offset+=section.width;
 }
 return warnings;
}
export function eliteSunroomTakeoff(project:ConsultationProject,runs:readonly RenaissanceWallMeasure[]){
 const settings=currentEliteSunroomSettings(project);
 const list=runs.flatMap(run=>eliteWallSections(project,run).map((section,i)=>({
  ...section,id:run.id+'-'+section.id,label:run.id+' / '+(i+1),
 })));
 // Reuse EXACT Admin calculations: receiving/DRC/H, base, top cap, every
 // custom window, 24ft stock packing, fasteners, panels and Elite Prime door.
 const values:Record<string,string|number|boolean>={
  roomSystem:settings.roomSystem,
  framingColor:settings.framingColor,
  panelColor:settings.panelColor,
  windowColor:settings.windowColor,
  glassType:settings.glassType,
  buildMode:'existing-structure',
  sunroomSections:JSON.stringify(list),
 };
 return {values,sections:list,estimate:calculateEstimate('sunrooms',values),
  dimensionWarnings:runs.flatMap(run=>eliteWallDimensionWarnings(
   run,eliteWallSections(project,run)))};
}
