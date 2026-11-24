import { calculateEstimate } from './estimate';
import { buildDeckModel } from './deckModel';
import type { ConsultationProject, EstimateResponse, EstimateTier } from './consultationProject';
import type { MaterialItem } from './types';
import { renaissanceReferenceIssues } from './renaissanceGuidance';
import { effectivePcaKickPlateIn } from './pcaScreenDoorGeometry';
import { planStairLanding, landingSurface } from './stairConcreteLanding';

export interface EstimateHandoffV1 {
  schemaVersion:1;
  messageType:'sns.eztakeoff.estimate-request';
  projectId:string;
  revision:number;
  exportedAt:string;
  customer:{name:string;address:string;phone:string;email:string};
  project:{kind:string;coverFamily:string;coverColor:string;coverRoofColor:string;coverCeilingFinish:string;coverRoofStyle:string;coverFraming:string;coverMount:string;coverTrussMount:string;coverScreenStyle:string;photoAttachedToThisPayload:false};
  geometry:{footprint:{x:number;y:number}[];areaSqFt:number;deckHeightFt:number;stairCount:number};
  selections:Record<string,string|number|boolean>;
  materials:MaterialItem[];
  blockers:string[];
  assumptions:string[];
}
export function createEstimateHandoff(project:ConsultationProject):EstimateHandoffV1{
  const deck=buildDeckModel(project.values);
  const estimate=calculateEstimate('decks',project.values);
  const stairLandings=landingSurface(project.values.stairLandingSurface)==='bare-ground'
    ?deck.stairPlacements.filter(placement=>placement.start&&placement.end).map(placement=>
      planStairLanding(Math.hypot(placement.end!.x-placement.start!.x,
        placement.end!.y-placement.start!.y),
        Number(project.values.stairLandingDepthFt??4),
        Number(project.values.stairLandingThicknessIn??5))):[];
  const validLandings=stairLandings.filter((p):p is NonNullable<typeof p>=>p!==null);
  const landingBags=validLandings.reduce((sum,p)=>sum+p.bags80lb,0);
  const blockers=[...(estimate.validationIssues??[])];
  if(landingSurface(project.values.stairLandingSurface)==='unknown'&&deck.stairCount>0)
    blockers.push('Confirm existing grade-level landing for each stair flight before closing the project scope.');
  if(landingSurface(project.values.stairLandingSurface)==='bare-ground'&&deck.stairCount>0){
    blockers.push('Automatic concrete landing quantities are planning values only: field-verify stair clear width, accessible egress, footing/base, frost, drainage, concrete specifications, site grade and local code before ordering.');
    if(validLandings.length!==stairLandings.length)
      blockers.push('One or more selected stair landing dimensions are invalid. Correct the dimensions before using concrete quantities.');
  }
  if(project.kind!=='deck')blockers.push('Covered-deck patio cover is visual-only; patio cover takeoff not included.');
  if(project.coverFamily!=='none')blockers.push('Renaissance framing and the supplied span charts are for estimating only. Obtain an engineering-approved, project-specific configuration before structural material ordering.');
  blockers.push(...renaissanceReferenceIssues({
    family:project.coverFamily,
    sideOverhangFt:Number(project.coverSideOverhangFt??1),
    frontOverhangFt:Number(project.coverFrontOverhangFt??1),
    postHeightFt:Number(project.coverHeightFt??9),
  }));
  const privacyWalls=Object.entries(project.coverPrivacyWallGaps??{})
    .filter(([,gap])=>[2,4,6].includes(Number(gap)));
  if(privacyWalls.length){
    blockers.push('Renaissance 2026 shade-tube privacy walls are dimensional design concepts only. Obtain manufacturer-approved stock lengths, receiver/channel fastening, tube span/wind checks and a separate privacy wall BOM before ordering.');
    if(project.coverDoorEnabled!==false&&
       privacyWalls.some(([side])=>side===(project.coverDoorSide??'front')))
      blockers.push('PCA screen entry side conflicts with selected privacy shade-tube wall. Do not cut the privacy tubes or quote an access opening without an engineered manufacturer design.');
    blockers.push('Privacy shade-tube wall is not an independently certified code-required deck guardrail; review open deck edges and guard details.');
  }
  if(project.coverScreenStyle&&project.coverScreenStyle!=='none'){
    blockers.push('Dolce screen style is a visual selection, not a supplier-verified screen room extrusion/cut BOM; approve separate screen-room takeoff.');
    if(project.coverDoorEnabled!==false){
      blockers.push('PCA 3068 entry door, hinges, pet door and site-specific rough opening are visualization choices only; supplier ordering and egress/landing requirements must be verified.');
      if(['inside','outside'].includes(project.coverScreenRailTreatment??'integrated-kick'))
        blockers.push('Independent PCA screen entry does not create a deck guardrail opening. Align the door with an approved stair opening or a separately configured railing gate; verify safe egress, landing and guard details.');
    }
  }
  if(typeof project.values.railingVisualId==='string' && !String(project.values.railingVisualId).startsWith('tt-ire-'))
    blockers.push('Selected railing style needs manufacturer-specific panel/kit takeoff verification; the standard railing BOM is not a verified match.');
  return {
    schemaVersion:1,messageType:'sns.eztakeoff.estimate-request',
    projectId:project.id,revision:project.revision,exportedAt:new Date().toISOString(),
    customer:{...project.client},
    project:{kind:project.kind,coverFamily:project.coverFamily,coverColor:project.coverColor,
      coverRoofColor:project.coverRoofColor??'White',coverCeilingFinish:project.coverCeilingFinish??'White',
      coverRoofStyle:project.coverRoofStyle??'studio',
      coverFraming:project.coverFraming??'standard',coverMount:project.coverMount??'wall-attached',
      coverTrussMount:project.coverTrussMount??'flush',
      coverScreenStyle:project.coverScreenStyle??'none',photoAttachedToThisPayload:false},
    geometry:{footprint:deck.points,areaSqFt:deck.area,deckHeightFt:Number(project.values.deckHeight??0),stairCount:deck.stairCount},
    selections:{...project.values,coverRoofStyle:project.coverRoofStyle??'studio',
      coverShadePercent:project.coverShadePercent??65,coverLouverAngle:project.coverLouverAngle??12,
      coverFamily:project.coverFamily,coverColor:project.coverColor,
      coverRoofColor:project.coverRoofColor??'White',coverCeilingFinish:project.coverCeilingFinish??'White',
      coverFraming:project.coverFraming??'standard',coverMount:project.coverMount??'wall-attached',
      coverTrussMount:project.coverTrussMount??'flush',
      coverScreenStyle:project.coverScreenStyle??'none',
      coverPrivacyFrontGapIn:project.coverPrivacyWallGaps?.front??0,
      coverPrivacyLeftGapIn:project.coverPrivacyWallGaps?.left??0,
      coverPrivacyRightGapIn:project.coverPrivacyWallGaps?.right??0,
      coverPrivacyRearGapIn:project.coverPrivacyWallGaps?.rear??0,
      coverAccentEnd:project.coverAccentEnd??(['Contempo','Classico'].includes(project.coverFamily)?'curved':'straight'),
      coverScreenUprightsFront:project.coverScreenUprights?.front??2,
      coverScreenUprightsLeft:project.coverScreenUprights?.left??1,
      coverScreenUprightsRight:project.coverScreenUprights?.right??1,
      coverScreenUprightsRear:project.coverScreenUprights?.rear??2,
      coverScreenRailTreatment:project.coverScreenRailTreatment??'integrated-kick',
      coverDoorEnabled:project.coverDoorEnabled!==false,
      coverDoorSide:project.coverDoorSide??'front',
      coverDoorPositionPercent:project.coverDoorPositionPercent??50,
      coverDoorModel:project.coverDoorModel??'A-100',
      coverDoorFinish:project.coverDoorFinish??'match',
      coverDoorHinge:project.coverDoorHinge??'left',
      coverDoorSwing:project.coverDoorSwing??'out',
      coverDoorPet:project.coverDoorPet??'none',
      coverDoorKickPlateIn:effectivePcaKickPlateIn(project.coverDoorPet??'none',project.coverDoorKickPlateIn??8),
      coverPostCount:project.coverPostCount??0,
      coverWidthFt:project.coverWidthFt??0,coverProjectionFt:project.coverProjectionFt??0,
      coverHeightFt:project.coverHeightFt??9,coverSideOverhangFt:project.coverSideOverhangFt??1,
      coverFrontOverhangFt:project.coverFrontOverhangFt??1},
    materials:[...estimate.materials,...(landingBags>0?[{
      name:'80-lb bagged concrete — on-site stair landing pads',
      category:'Sales stair landing — supplemental concrete',quantity:landingBags,
      unit:'bags',stockRecommendation:'80-lb concrete mix; nominal 0.60 cu ft yield per bag',
      notes:validLandings.map((p,i)=>
        'Pad '+(i+1)+': '+p.widthFt.toFixed(2)+' ft × '+p.depthFt.toFixed(2)+
        ' ft × '+p.thicknessIn+' in; '+p.bags80lb+' bags incl. 5% allowance').join(' | ')+
        '. Review subbase, reinforcement, disposal, forms and local specifications separately.',
    }]:[])],blockers,
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
