import { calculateEstimate } from './estimate';
import { buildDeckModel, buildLowerTierDeckModel } from './deckModel';
import type { ConsultationProject, EstimateResponse, EstimateTier } from './consultationProject';
import type { MaterialItem } from './types';
import { renaissanceReferenceIssues } from './renaissanceGuidance';
import { effectivePcaKickPlateIn } from './pcaScreenDoorGeometry';
import { planStairLanding, landingSurface } from './stairConcreteLanding';
import { planRenaissanceCoverWalls } from './renaissanceCoverWallLayout';
import { eliteSunroomTakeoff,currentEliteSunroomSettings,
 eliteWallSections } from './eliteSunroomStudio';
import { planEliteDeckFloorClosure } from './eliteDeckFloorClosure';
import { planSiteConcrete, type SiteConcreteAreaPlan } from './siteConcrete';

export interface EstimateHandoffV1 {
  schemaVersion:1;
  messageType:'sns.eztakeoff.estimate-request';
  projectId:string;
  revision:number;
  exportedAt:string;
  customer:{name:string;address:string;phone:string;email:string};
  project:{kind:string;coverFamily:string;coverColor:string;coverRoofColor:string;coverCeilingFinish:string;coverRoofStyle:string;coverFraming:string;coverMount:string;coverTrussMount:string;coverScreenStyle:string;photoAttachedToThisPayload:false};
  geometry:{footprint:{x:number;y:number}[];areaSqFt:number;deckHeightFt:number;stairCount:number;
    siteConcreteAreas:SiteConcreteAreaPlan[];siteConcreteQuantitiesValid:boolean};
  selections:Record<string,string|number|boolean>;
  materials:MaterialItem[];
  blockers:string[];
  assumptions:string[];
}
export function createEstimateHandoff(project:ConsultationProject):EstimateHandoffV1{
  const deck=buildDeckModel(project.values);
  const lowerDeck=buildLowerTierDeckModel(project.values);
  const stairCount=deck.stairCount+(lowerDeck?.stairCount??0);
  const siteConcrete=planSiteConcrete(project.values);
  const estimate=calculateEstimate('decks',project.values);
  const center:[number,number]=[(deck.minX+deck.maxX)/2,(deck.minY+deck.maxY)/2];
  const deckY=Math.max(.35,Math.min(26,Number(project.values.deckHeight??5)));
  const actualCoverWalls=project.coverScreenStyle==='elite-add-a-room'
    ?planRenaissanceCoverWalls(deck,project,center,deckY).measuredRuns:[];
  const eliteWalls=actualCoverWalls.filter(wall=>
    ![2,4,6].includes(Number(project.coverPrivacyWallGaps?.[wall.id]??0)));
  const elite=project.coverScreenStyle==='elite-add-a-room'
    ?eliteSunroomTakeoff(project,eliteWalls):null;
  const eliteSettings=currentEliteSunroomSettings(project);
  const eliteFloorClosure=project.coverScreenStyle==='elite-add-a-room'
    ?planEliteDeckFloorClosure(deck,eliteWalls,eliteSettings.roomSystem,
      project.values.deckingType):null;
  const eliteWindowSelections=Object.fromEntries(actualCoverWalls.map(wall=>[
    'elite'+wall.id.charAt(0).toUpperCase()+wall.id.slice(1)+'SectionsJson',
    JSON.stringify(eliteWallSections(project,wall)),
  ])) as Record<string,string>;

  const stairLandings=landingSurface(project.values.stairLandingSurface)==='bare-ground'
    ?[...deck.stairPlacements,...(lowerDeck?.stairPlacements??[])].filter(placement=>placement.start&&placement.end).map(placement=>
      planStairLanding(Math.hypot(placement.end!.x-placement.start!.x,
        placement.end!.y-placement.start!.y),
        Number(project.values.stairLandingDepthFt??4),
        Number(project.values.stairLandingThicknessIn??5))):[];
  const validLandings=stairLandings.filter((p):p is NonNullable<typeof p>=>p!==null);
  const landingBags=validLandings.reduce((sum,p)=>sum+p.bags80lb,0);
  const blockers=[...(estimate.validationIssues??[]),...siteConcrete.validationIssues];
  if(landingSurface(project.values.stairLandingSurface)==='unknown'&&stairCount>0)
    blockers.push('Confirm existing grade-level landing for each stair flight before closing the project scope.');
  if(landingSurface(project.values.stairLandingSurface)==='bare-ground'&&stairCount>0){
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
  if(project.coverScreenStyle==='elite-add-a-room'){
    blockers.push('Elite Add-A-Room wall panels reuse Admin Sunrooms 24-foot extrusion cut takeoff, but factory sash daylight dimensions, final glass spec, corner-to-Renaissance-post attachments, wind load and the Elite Prime Full View jamb/door require supplier and licensed design review.');
    if(!['Moderno','Contempo','Classico'].includes(project.coverFamily))
      blockers.push('Elite Add-A-Room is selected without an approved insulated solid Renaissance roof. Select an appropriate solid cover or obtain engineering approval.');
    if(!eliteWalls.length)
      blockers.push('No usable Renaissance wall bays were found for the selected Elite Add-A-Room enclosure.');
    if(actualCoverWalls.length!==eliteWalls.length)
      blockers.push('A Renaissance privacy shade-tube wall conflicts with the Elite glass sunroom. The conflicting wall is excluded from glass quantity and 3D; select one complete enclosure system.');
    blockers.push(...(elite?.dimensionWarnings??[]));
    blockers.push('The Elite Add-A-Room glass and panels are not independently certified as a code-required deck guard. Review enclosure/egress guard and entry-stair landing design.');
    if(eliteSettings.roomSystem==='2-nonthermal')
      blockers.push('2-inch non-thermal Add-A-Room paired with clear insulated glazing does not create a thermally broken system; confirm clip/glass compatibility and use classification.');
    if(elite?.sections.some(section=>section.doorType==='slider'))
      blockers.push('Legacy sliding-glass door selected; it is NOT the specified Elite Prime Full View single outswing door. Verify the actual door unit and adapter.');
    if(eliteFloorClosure?.notes.some(s=>s.includes('exceed purchasable')))
      blockers.push(...eliteFloorClosure.notes);
  }
  if(project.coverScreenStyle==='lumino-sunroom'){
    blockers.push('Lumino glazing, insulated knee-wall profiles, window glass specifications, framing, flashing, thermal ratings and exact supplier takeoff are NOT verified by the design visual. Obtain a vendor-approved sunroom BOM and project engineering.');
    if(!['Moderno','Contempo','Classico'].includes(project.coverFamily))
      blockers.push('Lumino window-wall concept is not offered with this non-insulated roof family; select an approved solid roof assembly.');
    blockers.push('PCA screen doors are not certified Lumino sunroom entry doors. Specify and approve a separate sunroom door, safe egress and deck guard details.');
  }
  if(['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')){
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
    geometry:{footprint:deck.points,areaSqFt:deck.area,deckHeightFt:Number(project.values.deckHeight??0),stairCount,
      siteConcreteAreas:siteConcrete.areas,siteConcreteQuantitiesValid:siteConcrete.canQuantify},
    selections:{...project.values,coverRoofStyle:project.coverRoofStyle??'studio',
      coverShadePercent:project.coverShadePercent??65,coverLouverAngle:project.coverLouverAngle??12,
      coverFamily:project.coverFamily,coverColor:project.coverColor,
      coverRoofColor:project.coverRoofColor??'White',coverCeilingFinish:project.coverCeilingFinish??'White',
      coverFraming:project.coverFraming??'standard',coverMount:project.coverMount??'wall-attached',
      coverTrussMount:project.coverTrussMount??'flush',
      coverScreenStyle:project.coverScreenStyle??'none',
      ...(elite?{
        eliteSunroomSystem:eliteSettings.roomSystem,
        eliteSunroomFramingColor:eliteSettings.framingColor,
        eliteSunroomPanelColor:eliteSettings.panelColor,
        eliteSunroomWindowColor:eliteSettings.windowColor,
        eliteSunroomGlass:eliteSettings.glassType,
        eliteSunroomBuildMode:'existing-structure',
        eliteUsesRenaissanceCoverPosts:true,
        ...eliteWindowSelections,
      }:{}),
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
    materials:[...estimate.materials,...(elite?.estimate.materials??[]),
      ...(siteConcrete.canQuantify&&siteConcrete.orderVolumeCuYd>0?[{
        name:'Concrete — drawn site areas',category:'Site concrete',
        quantity:siteConcrete.orderVolumeCuYd,unit:'cu yd',
        stockRecommendation:'Concrete volume from drawn polygons; 5% allowance included',
        notes:siteConcrete.areas.map(area=>area.name+': '+area.areaSqFt.toFixed(2)+
          ' sq ft × '+area.thicknessIn+' in = '+area.volumeCuYd.toFixed(3)+
          ' cu yd before allowance; top elevation '+area.elevationFt+' ft').join(' | '),
      }]:[]),
      ...(eliteFloorClosure?.stock??[]).map(board=>({
        name:'Interior deck closure board at Elite sunroom wall',
        category:'Sales sunroom floor transition — additional decking stock',
        quantity:board.quantity,unit:'boards',
        stockRecommendation:board.stockLengthFt+' ft '+String(project.values.deckingType??'composite')+
          ' boards; matching '+String(project.values.deckingMaterial??'selected field decking'),
        notes:'Additional physical 5.5-in deck-finish scribe course immediately inside the Elite base receiving channel, with 1/8-in expansion. '+
          'Optimized cuts total '+(eliteFloorClosure?.totalLinearFt??0).toFixed(2)+
          ' lf across the selected sunroom walls; reuse compatible field/picture-frame offcuts when supported. '+
          'Verify door threshold clearances, moisture movement, exact stock and backed seams.',
      })),
      ...(landingBags>0?[{
      name:'80-lb bagged concrete — on-site stair landing pads',
      category:'Sales stair landing — supplemental concrete',quantity:landingBags,
      unit:'bags',stockRecommendation:'80-lb concrete mix; nominal 0.60 cu ft yield per bag',
      notes:validLandings.map((p,i)=>
        'Pad '+(i+1)+': '+p.widthFt.toFixed(2)+' ft × '+p.depthFt.toFixed(2)+
        ' ft × '+p.thicknessIn+' in; '+p.bags80lb+' bags incl. 5% allowance').join(' | ')+
        '. Review subbase, reinforcement, disposal, forms and local specifications separately.',
    }]:[])],blockers,
    assumptions:[...estimate.orderNotes,...(elite?.estimate.orderNotes??[]),
      ...(siteConcrete.areas.length?['Site concrete quantities use the saved polygon boundaries and selected slab thicknesses. The volume includes a 5% allowance; reinforcement, subbase, excavation and drainage are separate scope.']:[]),
      ...(eliteFloorClosure?.notes??[])],
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
