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
 * In Admin Sunrooms a SECTION is the entire physical opening between posts
 * (e.g. a single 11'6" side). Uprights partition that ONE opening into
 * multiple manufactured windows. Never auto-split one wall into "sections"
 * for each glazing bay: that duplicates DRC/receivers/fasteners and destroys
 * the one-piece triangular transom slope.
 *
 * The total height is measured at the TALLER end. A sloped wall's left/right
 * transom rises are the amount above the common horizontal main-window head:
 * 9-ft rear -> 8-ft front means a 1-ft-to-0-ft transom, not three
 * independently sloping main-window sections.
 */
export function makeDefaultEliteWallSections(run:RenaissanceWallMeasure):SunroomSectionConfig[]{
 const available=run.widthFt;
 if(!Number.isFinite(available)||available<2)return [];
 const leftHeight=Math.max(0,run.topFrom-run.bottomY);
 const rightHeight=Math.max(0,run.topTo-run.bottomY);
 const lower=Math.min(leftHeight,rightHeight);
 const upper=Math.max(leftHeight,rightHeight);
 const slope=upper-lower;
 const includeDoor=run.id==='front'&&available>=7;
 // Around 4-ft glazing bays: 11'6" side => two internal uprights => 3 lites.
 // For a front entry the door jambs already create two additional boundaries.
 const usable=available-(includeDoor?3:0);
 const glazingBays=Math.max(1,Math.ceil(usable/4));
 const uprights=Math.max(0,glazingBays-(includeDoor?2:1));
 return [createSunroomSection(0,{
   id:'elite-'+run.id+'-opening-1',
   label:run.id+' opening',width:roundFt(available),height:roundFt(upper),
   uprights,mainSection:'horizontal-sliders',
   kickSection:'insulated',kickHeight:Math.min(2,Math.max(0,lower-5)),
   transomType:slope>.05?'picture-window':'none',
   leftTransomHeight:slope>.05?roundFt(leftHeight-lower):0,
   rightTransomHeight:slope>.05?roundFt(rightHeight-lower):0,
   doorType:includeDoor?'single':'none',
   doorWidthIn:36,doorHinge:'left',doorPlacement:'center',
   doorAboveSection:'window',uprightMode:'all',electricChase:false,
   bottomAttach:'wood',topAttach:'metal',leftAttach:'metal',rightAttach:'metal',
 })];
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
 if(sections.length!==1)
   warnings.push(run.id+' wall has '+sections.length+
     ' saved window-sized sections from the earlier Studio layout. The physical '+
     'opening must be ONE section with internal uprights. Use "Rebuild as one '+
     'measured opening" to correct it; existing saved settings are preserved '+
     'until you explicitly rebuild this wall.');
 const measured=sections.reduce((sum,section)=>sum+section.width,0);
 if(Math.abs(measured-run.widthFt)>.065)
  warnings.push(run.id+' Elite sections total '+measured.toFixed(2)+
   ' ft but Renaissance wall between seated posts measures '+run.widthFt.toFixed(2)+
   ' ft. Match widths before rendering/quoting; sections are never stretched.');
 let offset=0;
 for(const section of sections){
  const begin=offset/Math.max(.1,run.widthFt);
  const finish=(offset+section.width)/Math.max(.1,run.widthFt);
  const expectedLeft=lerp(run.topFrom,run.topTo,begin)-run.bottomY;
  const expectedRight=lerp(run.topFrom,run.topTo,finish)-run.bottomY;
  const hasTransom=section.transomType!=='none'&&
    (section.transomType!=='auto'||(section.height>10&&section.mainSection!=='picture-window'));
  const transomLeft=hasTransom?Math.max(0,section.leftTransomHeight):0;
  const transomRight=hasTransom?Math.max(0,section.rightTransomHeight):0;
  const mainTop=section.height-Math.max(transomLeft,transomRight);
  const actualLeft=mainTop+transomLeft,actualRight=mainTop+transomRight;
  if(!Number.isFinite(actualLeft)||!Number.isFinite(actualRight)||
     Math.abs(expectedLeft-actualLeft)>.20||Math.abs(expectedRight-actualRight)>.20)
   warnings.push(run.id+' / '+section.label+
    ': transom/roof mismatch. Left '+actualLeft.toFixed(2)+' vs measured '+
    expectedLeft.toFixed(2)+' ft, right '+actualRight.toFixed(2)+
    ' vs measured '+expectedRight.toFixed(2)+
    ' ft. Set one section to the measured high opening height and independently '+
    'set the left/right transom rise above the common horizontal window head.');
  if(!Number.isFinite(section.width)||section.width<.5||section.height<6)
   warnings.push(run.id+' / '+section.label+': incomplete or invalid width/height.');
  offset+=section.width;
 }
 return warnings;
}
/** A visibly mismatched roof is a warning (sales may adjust it interactively),
 * but a wrong wall WIDTH or legacy window-as-section layout cannot render. */
export function eliteWallBlockingIssues(run:RenaissanceWallMeasure,
 sections:readonly SunroomSectionConfig[]):string[]{
 return eliteWallDimensionWarnings(run,sections).filter(issue=>
   issue.includes('sections total')||
   issue.includes('saved window-sized sections')||
   issue.includes('incomplete or invalid')||
   issue.includes('No valid Elite sections'));
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
