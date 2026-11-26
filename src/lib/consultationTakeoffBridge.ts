import type { ConsultationProject } from './consultationProject';
import { createEstimateHandoff } from './estimatingBridge';
import { calculateEstimate } from './estimate';
import { planSiteConcrete } from './siteConcrete';
import { planLightingAddons } from './lightingAddons';
import { currentEliteSunroomSettings } from './eliteSunroomStudio';
import { getCoverVisualProduct } from '../data/visualCatalog';
import type { EstimateResult } from './types';

type Values=Record<string,string|number|boolean>;
type Store=Pick<Storage,'getItem'|'setItem'>;
const PREFIX='sns-studio-takeoff-v1:';
export interface ConsultationTakeoffSnapshot {
  schemaVersion:1;id:string;createdAt:string;updatedAt:string;copyRevision:number;
  sourceProjectId:string;sourceRevision:number;title:string;
  /** Context only; original Studio project and photo storage remain untouched. */
  project:ConsultationProject;
  values:Values;
}
const browserStore=():Store=>{
  if(typeof window==='undefined')throw new Error('Open this takeoff from the browser workspace.');
  return window.localStorage;
};
export const consultationTakeoffStorageKey=(id:string)=>PREFIX+id;
export const consultationTakeoffReturnHref=(snapshot:Pick<ConsultationTakeoffSnapshot,'sourceProjectId'>)=>
  '/consultation/'+encodeURIComponent(snapshot.sourceProjectId)+'?stage=render';

/** Creates a fresh, editable copy for every handoff. It never overwrites the
 * user's separate sns-takeoff:decks draft or any Studio record/photo. */
export function openConsultationInTakeoff(project:ConsultationProject,store:Store=browserStore()){
  const id=globalThis.crypto?.randomUUID?.()??'copy-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const now=new Date().toISOString();
  const copy=JSON.parse(JSON.stringify(project)) as ConsultationProject;
  const snapshot:ConsultationTakeoffSnapshot={schemaVersion:1,id,createdAt:now,updatedAt:now,copyRevision:1,
    sourceProjectId:project.id,sourceRevision:project.revision,title:project.title,
    project:{...copy,estimatingResponse:null},
    values:{...copy.values,
      poJobName:project.client.name.trim()?project.client.name+' — '+project.title:project.title,
      customerName:project.client.name,jobAddress:project.client.address,
      customerPhone:project.client.phone,customerEmail:project.client.email},
  };
  // A failed write throws before the caller navigates; no existing key is touched.
  store.setItem(consultationTakeoffStorageKey(id),JSON.stringify(snapshot));
  return {id,href:'/service/decks?studioTakeoff='+encodeURIComponent(id),
    returnHref:consultationTakeoffReturnHref(snapshot),sourceRevision:project.revision};
}
export function readConsultationTakeoff(id:string,store:Store=browserStore()):ConsultationTakeoffSnapshot|null{
  if(!id||id.length>160||!/^[a-zA-Z0-9_-]+$/.test(id))return null;
  try{
    const parsed=JSON.parse(store.getItem(consultationTakeoffStorageKey(id))??'null') as ConsultationTakeoffSnapshot|null;
    if(!parsed||parsed.schemaVersion!==1||parsed.id!==id||!parsed.sourceProjectId||
      !parsed.values||typeof parsed.values!=='object'||!parsed.project?.values||!parsed.project.client)return null;
    return parsed;
  }catch{return null;}
}
export function saveConsultationTakeoffValues(snapshot:ConsultationTakeoffSnapshot,values:Values,store:Store=browserStore()){
  const latest=readConsultationTakeoff(snapshot.id,store)??snapshot;
  if(JSON.stringify(latest.values)===JSON.stringify(values))return latest;
  const updated={...latest,values:{...values},copyRevision:latest.copyRevision+1,updatedAt:new Date().toISOString()};
  store.setItem(consultationTakeoffStorageKey(snapshot.id),JSON.stringify(updated));
  return updated;
}

/** The Admin copy keeps the full Studio model. These readable selection notes
 * also accompany its material PDF, where the Studio-only controls are absent. */
export function consultationTakeoffScopeNotes(project:ConsultationProject):string[]{
  if(project.coverFamily==='none')return [];
  const cover=getCoverVisualProduct(project.coverFamily);
  const solid=['solid-studio','solid-truss-ends','full-trusses'].includes(cover.family);
  const framing=({standard:'standard',hd:'heavy duty',wide:'wide','wide-insert':'wide with insert'} as const)[project.coverFraming??'standard'];
  const notes=[
    'Patio cover selection: '+cover.name+'; '+(project.coverRoofStyle==='gable'?'gable':'studio / lean-to')+
    '; '+(project.coverMount==='freestanding'?'freestanding':'wall-attached')+'; '+framing+' framing; frame '+project.coverColor+
    (solid?'; roof '+(project.coverRoofColor??'White')+'; ceiling '+(project.coverCeilingFinish??'White'):'')+'.',
  ];
  const size=(value:number|undefined,fallback:string)=>Number.isFinite(value)&&Number(value)>0?value+' ft':fallback;
  notes.push('Patio cover dimensions: width '+size(project.coverWidthFt,'follows deck footprint')+
    '; projection '+size(project.coverProjectionFt,'follows deck footprint')+
    '; post height '+size(project.coverHeightFt, '9 ft')+'.');
  if(project.coverScreenStyle==='elite-add-a-room'){
    const room=currentEliteSunroomSettings(project);
    notes.push('Sunroom selection: Elite Add-A-Room; '+(room.roomSystem==='3-thermal'?'3-inch thermal':'2-inch nonthermal')+
      '; framing '+room.framingColor+'; panels '+room.panelColor+'; windows '+room.windowColor+
      '; clear insulated glass. Exact wall sections and materials follow the saved Studio enclosure.');
  }else if(['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'')){
    const screenColor=project.coverScreenColor&&project.coverScreenColor!=='match'?project.coverScreenColor:project.coverColor;
    notes.push('Screen room selection: Dolce '+(project.coverScreenStyle==='dolce-open-view'?'open-view':'standard')+
      '; framing and kick panels '+screenColor+'; railing treatment '+(project.coverScreenRailTreatment??'integrated-kick').replace(/-/g,' ')+'.');
  }
  return notes;
}

export function consultationTakeoffEstimate(snapshot:ConsultationTakeoffSnapshot,values:Values):EstimateResult{
  const project:ConsultationProject={...snapshot.project,id:snapshot.id,revision:snapshot.copyRevision,
    values,estimatingResponse:null,client:{
      name:String(values.customerName??snapshot.project.client.name),
      address:String(values.jobAddress??snapshot.project.client.address),
      phone:String(values.customerPhone??snapshot.project.client.phone),
      email:String(values.customerEmail??snapshot.project.client.email)}};
  const base=calculateEstimate('decks',values),handoff=createEstimateHandoff(project);
  const concrete=planSiteConcrete(values),lighting=planLightingAddons(project);
  return {...base,materials:handoff.materials,
    summary:[...base.summary,...(concrete.areas.length?[{label:'Site concrete',value:concrete.totalAreaSqFt.toFixed(1)+' sq ft'}]:[])],
    // Drawing errors block exports. Manufacturer/scope caveats accompany the
    // review copy as notes; exporting a review is not an order approval.
    validationIssues:Array.from(new Set([...(base.validationIssues??[]),...concrete.validationIssues,
      ...concrete.finishWarnings,...lighting.issues])),
    orderNotes:Array.from(new Set([...handoff.assumptions,...consultationTakeoffScopeNotes(project),...handoff.blockers,
      'Studio source revision '+snapshot.sourceRevision+'. This editable Admin copy does not update the original Studio design.',
      ...(snapshot.project.coverFamily!=='none'?[
        'The deck sheets show the measured deck, stairs and railing. The '+snapshot.project.coverFamily+
        ' cover and enclosure selections remain in the source Studio context; these sheets are not a manufacturer roof fabrication drawing.']:[])])),
  };
}
