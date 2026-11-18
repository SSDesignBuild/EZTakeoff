import { calculateEstimate } from './estimate';
import { buildDeckModel } from './deckModel';
import type { ConsultationProject, EstimateResponse, EstimateTier } from './consultationProject';
import type { MaterialItem } from './types';

export interface EstimateHandoffV1 {
  schemaVersion:1;
  messageType:'sns.eztakeoff.estimate-request';
  projectId:string;
  revision:number;
  exportedAt:string;
  customer:{name:string;address:string;phone:string;email:string};
  project:{kind:string;coverFamily:string;coverColor:string;coverRoofStyle:string;coverFraming:string;coverMount:string;coverScreenStyle:string;photoAttachedToThisPayload:false};
  geometry:{footprint:{x:number;y:number}[];areaSqFt:number;deckHeightFt:number;stairCount:number};
  selections:Record<string,string|number|boolean>;
  materials:MaterialItem[];
  blockers:string[];
  assumptions:string[];
}
export function createEstimateHandoff(project:ConsultationProject):EstimateHandoffV1{
  const deck=buildDeckModel(project.values);
  const estimate=calculateEstimate('decks',project.values);
  const blockers=[...(estimate.validationIssues??[])];
  if(project.kind!=='deck')blockers.push('Covered-deck patio cover is visual-only; patio cover takeoff not included.');
  if(project.coverFamily!=='none')blockers.push('Renaissance frame/profile options are sales visualization based on example drawings only. An engineering-approved manufacturer configuration is required before roof/footing material ordering.');
  if(project.coverScreenStyle&&project.coverScreenStyle!=='none')
    blockers.push('Dolce screen style is a visual selection, not a supplier-verified screen room extrusion/cut BOM; approve separate screen-room takeoff.');
  if(typeof project.values.railingVisualId==='string' && !String(project.values.railingVisualId).startsWith('tt-ire-'))
    blockers.push('Selected railing style needs manufacturer-specific panel/kit takeoff verification; the standard railing BOM is not a verified match.');
  return {
    schemaVersion:1,messageType:'sns.eztakeoff.estimate-request',
    projectId:project.id,revision:project.revision,exportedAt:new Date().toISOString(),
    customer:{...project.client},
    project:{kind:project.kind,coverFamily:project.coverFamily,coverColor:project.coverColor,
      coverRoofStyle:project.coverRoofStyle??'studio',
      coverFraming:project.coverFraming??'standard',coverMount:project.coverMount??'wall-attached',
      coverScreenStyle:project.coverScreenStyle??'none',photoAttachedToThisPayload:false},
    geometry:{footprint:deck.points,areaSqFt:deck.area,deckHeightFt:Number(project.values.deckHeight??0),stairCount:deck.stairCount},
    selections:{...project.values,coverRoofStyle:project.coverRoofStyle??'studio',
      coverShadePercent:project.coverShadePercent??65,coverLouverAngle:project.coverLouverAngle??12,
      coverFamily:project.coverFamily,coverColor:project.coverColor,
      coverFraming:project.coverFraming??'standard',coverMount:project.coverMount??'wall-attached',
      coverScreenStyle:project.coverScreenStyle??'none',coverPostCount:project.coverPostCount??0,
      coverWidthFt:project.coverWidthFt??0,coverProjectionFt:project.coverProjectionFt??0,
      coverHeightFt:project.coverHeightFt??9,coverSideOverhangFt:project.coverSideOverhangFt??1,
      coverFrontOverhangFt:project.coverFrontOverhangFt??1},
    materials:estimate.materials,blockers,
    assumptions:estimate.orderNotes,
  };
}
const isRecord=(p:unknown):p is Record<string,unknown>=>!!p&&typeof p==='object'&&!Array.isArray(p);
export function parseEstimateResponse(raw:string,project:ConsultationProject):EstimateResponse{
  let data:unknown;
  try{data=JSON.parse(raw);}catch{throw new Error('Estimating response is not valid JSON.');}
  if(!isRecord(data)||data.schemaVersion!==1)
    throw new Error('Estimating response must be schemaVersion 1.');
  if(data.projectId!==project.id)throw new Error('This price belongs to a different customer project.');
  if(data.requestRevision!==project.revision)
    throw new Error('This pricing response is for an older design revision. Export the updated design first.');
  if(!Array.isArray(data.tiers)||!data.tiers.length||data.tiers.length>20)
    throw new Error('Return at least one valid pricing tier.');
  const tiers:EstimateTier[]=data.tiers.map((value:unknown,index:number)=>{
    if(!isRecord(value))throw new Error('Pricing tier '+(index+1)+' is invalid.');
    const id=String(value.id??'').trim(),name=String(value.name??'').trim(),scope=String(value.scope??'').trim();
    const price=Number(value.price);
    if(!id||!name||!scope||!Number.isFinite(price)||price<0||value.currency!=='USD')
      throw new Error('Tier '+(index+1)+' needs id, name, USD price, and final scope.');
    if(id.length>128||name.length>200||scope.length>50000)throw new Error('Pricing response exceeds safe field limits.');
    const includedOptions=Array.isArray(value.includedOptions)
      ?value.includedOptions.filter((v):v is string=>typeof v==='string').slice(0,100):[];
    return {id,name,scope,price,currency:'USD',includedOptions};
  });
  if(new Set(tiers.map((tier)=>tier.id)).size!==tiers.length)throw new Error('Pricing tier identifiers must be unique.');
  const externalEstimateId=String(data.externalEstimateId??'').trim();
  if(!externalEstimateId||externalEstimateId.length>128)throw new Error('Missing external estimating-app reference.');
  return {schemaVersion:1,projectId:project.id,requestRevision:project.revision,
    externalEstimateId,quotedAt:String(data.quotedAt??new Date().toISOString()).slice(0,40),
    tiers,selectedTierId:null};
}
export function selectedPricedTier(project:ConsultationProject):EstimateTier|null{
  const response=project.estimatingResponse;
  if(!response||response.requestRevision!==project.revision)return null;
  return response.tiers.find((tier)=>tier.id===response.selectedTierId)??null;
}
export function makeAcceptedScope(project:ConsultationProject){
  const tier=selectedPricedTier(project);
  if(!tier)throw new Error('Choose a current pricing tier before generating the scope.');
  return {
    schemaVersion:1 as const,messageType:'sns.eztakeoff.accepted-scope' as const,
    projectId:project.id,revision:project.revision,
    externalEstimateId:project.estimatingResponse!.externalEstimateId,
    tierId:tier.id,tierName:tier.name,priceUSD:tier.price,
    client:{...project.client},
    scope:tier.scope,includedOptions:tier.includedOptions,
    generatedAt:new Date().toISOString(),
    status:'draft-awaiting-client-approval' as const,
  };
}
export function downloadJson(filename:string,data:unknown){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=filename;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(href),1000);
}
