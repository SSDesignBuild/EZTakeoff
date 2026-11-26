import type { ConsultationProject } from './consultationProject';
import { buildDeckModel, buildLowerTierDeckModel } from './deckModel';
import {
  deckVisualProducts, getDeckVisualProduct, railVisualProducts, getRailVisualProduct,
  coverVisualProducts, type RailInfill, type CoverFamily,
} from '../data/visualCatalog';
import {
  resolvePictureFrameMaterials, resolveBreakerBoardMaterials,
  resolveFasciaMaterial, resolveStairSideFasciaMaterial,
} from './deckTrimSelection';
import { currentEliteSunroomSettings, type EliteSunroomFinish } from './eliteSunroomStudio';
import { readSiteConcreteAreas } from './siteConcrete';

export type FinishDockValues = ConsultationProject['values'];
export type FinishDockCategory = 'deck'|'picture-frame'|'breaker'|'stairs'|'fascia'|
  'risers'|'drink-rail'|'railing'|'cover'|'screen'|'sunroom'|'concrete'|'add-ons';
export interface FinishDockTab {
  id:string;
  label:string;
  category:FinishDockCategory;
  /** Zero-based course; never inferred from display order. */
  course?:number;
  /** Direct style/color tabs enter their corresponding carousel immediately. */
  mode?:string;
}
export type BoardFinishTarget = 'deck'|'picture-frame'|'breaker'|'stairs'|
  'stair-fascia'|'fascia'|'risers'|'drink-rail';
/** Missing enclosures start in the cover selector; their detail editor only
 * exists once the compatible room has actually been added to the design. */
export function finishDockDetailSection(project:ConsultationProject,section:string):
  'deck'|'railing'|'stairs'|'skirting'|'cover'|'sunroom'|'gates' {
  if(section==='sunroom')return project.coverScreenStyle==='elite-add-a-room'?'sunroom':'cover';
  if(['stairs','risers','stair-fascia'].includes(section))return 'stairs';
  if(['railing','drink-rail'].includes(section))return 'railing';
  if(['cover','screen'].includes(section))return 'cover';
  if(section==='skirting'||section==='gates')return section;
  return 'deck';
}
export interface BoardFinishState {
  value:string;
  resolved:string;
  label:string;
  matchOptions:{value:string;label:string;resolved:string}[];
  /** Preserve saved scope when the current railing has no editable drink-board geometry. */
  unavailableReason?:string;
}
export const FINISH_DOCK_LABELS:Record<FinishDockCategory,string> = {
  deck:'Main deck', 'picture-frame':'Picture frame', breaker:'Breaker boards',
  stairs:'Stairs', fascia:'Fascia', risers:'Risers', 'drink-rail':'Drink rail',
  railing:'Railing', cover:'Patio cover',
  screen:'Screen room color', sunroom:'Sunroom color',
  concrete:'Concrete', 'add-ons':'Add-ons',
};
const flag=(value:unknown,fallback=false)=>value===undefined?fallback:
  value===true||String(value)==='true';
const text=(value:unknown,fallback='')=>String(value??fallback);
/** Mirror the renderer's legacy fallback when a saved project has no visual ID. */
export function finishDockRailProduct(values:FinishDockValues){
  if(typeof values.railingVisualId==='string')return getRailVisualProduct(values.railingVisualId);
  const type=text(values.railingType,'aluminum');
  if(type==='wood')return getRailVisualProduct(values.spindleType==='black-round'?'sns-wood-round':'sns-wood-pickets');
  if(type.includes('vinyl')||type==='vinyl-composite')return getRailVisualProduct('tt-statement');
  return getRailVisualProduct(values.railingTopProfile==='modern'?'tt-ire-modern':
    values.railingTopProfile==='drink'?'tt-ire-drink':'tt-ire-classic');
}
const tab=(category:FinishDockCategory):FinishDockTab=>({
  id:category,label:FINISH_DOCK_LABELS[category],category,
});
export function finishDockCategoryTabs(category:FinishDockCategory):FinishDockTab[] {
  if(category==='railing')return [
    {id:'railing-style',label:'Railing style',category,mode:'style'},
    {id:'railing-color',label:'Railing color',category,mode:'color'},
  ];
  if(category==='cover')return [
    {id:'cover-style',label:'Patio cover style',category,mode:'style'},
    {id:'cover-color',label:'Patio cover color',category,mode:'color'},
  ];
  if(category==='concrete')return [
    {id:'concrete-style',label:'Concrete style',category,mode:'style'},
    {id:'concrete-color',label:'Concrete color',category,mode:'color'},
    {id:'concrete-border',label:'Concrete borders',category,mode:'border'},
  ];
  return [tab(category)];
}

/** Tabs follow installed model features. Main/lower tiers currently share
 * finish selections; no unused lower material values are introduced here. */
export function getFinishDockTabs(project:ConsultationProject):FinishDockTab[] {
  const main=buildDeckModel(project.values),lower=buildLowerTierDeckModel(project.values);
  const tiers=lower?[main,lower]:[main];
  const result:FinishDockTab[]=[tab('deck')];
  const picture=Math.min(3,Math.max(...tiers.map(model=>model.pictureFrameCount)));
  const breaker=Math.min(3,Math.max(...tiers.map(model=>model.breakerBoardCount)));
  for(let course=0;course<picture;course++)result.push({
    id:'picture-frame-'+(course+1),label:picture===1?'Picture frame':'Picture frame '+(course+1),category:'picture-frame',course,
  });
  for(let course=0;course<breaker;course++)result.push({
    id:'breaker-'+(course+1),label:breaker===1?'Breaker board':'Breaker board '+(course+1),category:'breaker',course,
  });
  const stairs=tiers.some(model=>model.stairPlacements.length>0);
  const railing=tiers.some(model=>model.railingRun>0||model.stairRailSideCount>0);
  if(stairs)result.push(tab('stairs'));
  if(tiers.some(model=>model.fasciaLf>0))result.push(tab('fascia'));
  if(stairs)result.push(tab('risers'));
  const rail=finishDockRailProduct(project.values);
  if(railing&&(rail.geometry.includes('drink')||flag(project.values.drinkRail)))
    result.push(tab('drink-rail'));
  if(railing)result.push(...finishDockCategoryTabs('railing'));
  if(project.coverFamily!=='none'){
    result.push(...finishDockCategoryTabs('cover'));
    if(['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??''))result.push(tab('screen'));
    if(project.coverScreenStyle==='elite-add-a-room')result.push(tab('sunroom'));
  }
  if(readSiteConcreteAreas(project.values.siteConcreteAreas).length)result.push(...finishDockCategoryTabs('concrete'));
  const fixtureFields=['lightingPostFixture','lightingPostCapFixture','lightingStairFixture','lightingDeckFixture'];
  if(fixtureFields.some(key=>!['','none'].includes(text(project.values[key])))||
    Number(project.values.patioFanCount)>0||Number(project.values.patioCanLightCount)>0)
    result.push(tab('add-ons'));
  return result;
}

export function getBoardFinishState(values:FinishDockValues,target:BoardFinishTarget,course=0):BoardFinishState {
  const field=text(values.deckingMaterial),fascia=resolveFasciaMaterial(values);
  const matching=[{value:'match',label:'Match main deck',resolved:field}];
  if(target==='deck')return {value:field,resolved:field,label:'Main deck',matchOptions:[]};
  if(target==='picture-frame')return {
    value:flag(values.borderSameBoard,true)?'match':text(values[course===0?'pictureFrameMaterial':'pictureFrameMaterial'+(course+1)],'match'),
    resolved:resolvePictureFrameMaterials(values)[course]??field,
    label:'Picture frame '+(course+1),matchOptions:matching,
  };
  if(target==='breaker')return {
    value:text(values[course===0?'breakerBoardMaterial':'breakerBoardMaterial'+(course+1)],'match'),
    resolved:resolveBreakerBoardMaterials(values)[course]??field,
    label:'Breaker board '+(course+1),matchOptions:matching,
  };
  if(target==='fascia')return {value:text(values.fasciaMaterial,'match'),resolved:fascia,
    label:'Perimeter fascia',matchOptions:matching};
  if(target==='stair-fascia')return {value:text(values.stairFasciaMaterial,'match-fascia'),
    resolved:resolveStairSideFasciaMaterial(values),label:'Stair side fascia',matchOptions:[
      {value:'match-fascia',label:'Match perimeter fascia',resolved:fascia},...matching,
    ]};
  if(target==='risers'){
    const value=text(values.stairRiserStyle,'auto');
    const coordinated=values.deckingType==='pressure-treated'?field:fascia;
    return {value,resolved:value==='auto'?coordinated:value==='fascia'?fascia:value==='match'?field:value,
      label:'Stair risers',matchOptions:[
        {value:'auto',label:'Coordinated riser',resolved:coordinated},...matching,
        {value:'fascia',label:'Match fascia trim',resolved:fascia},
        {value:'open',label:'Open risers',resolved:''},
      ]};
  }
  const key=target==='drink-rail'?'drinkRailMaterial':'stairTreadStyle';
  const value=text(values[key],'match');
  return {value,resolved:value==='match'?field:value,
    label:target==='drink-rail'?'Drink rail board':'Stair treads',matchOptions:matching,
    ...(target==='drink-rail'&&!finishDockRailProduct(values).geometry.includes('drink')?{
      unavailableReason:'Drink-board preview is unavailable for this railing style. Your saved drink rail is kept. Choose a Drink Rail style under Railing style to edit its board finish.',
    }:{}),
  };
}

export const drinkRailBoardProducts=deckVisualProducts.filter(board=>
  !/^(Terrain|Prime|Reliaboard)/i.test(board.collection));

/** Same catalog values feed the existing renderer and material order.
 * Unedited courses, including temporarily inactive courses, stay intact. */
export function changeBoardFinish(values:FinishDockValues,target:BoardFinishTarget,next:string,course=0):FinishDockValues {
  const state=getBoardFinishState(values,target,course);
  if(state.unavailableReason||next===state.value)return values;
  const knownBoard=!!getDeckVisualProduct(next);
  if(!knownBoard&&!state.matchOptions.some(option=>option.value===next))return values;
  if(target==='drink-rail'&&knownBoard&&!drinkRailBoardProducts.some(board=>board.label===next))return values;
  if(target==='deck')return {...values,deckingMaterial:next,deckingType:'composite'};
  if(target==='picture-frame'){
    if(!Number.isInteger(course)||course<0||course>2)return values;
    const keys=['pictureFrameMaterial','pictureFrameMaterial2','pictureFrameMaterial3'];
    const updated={...values};
    // Legacy "same board" suppresses every stored course override. Normalize
    // that effective state once, then keep courses independently selectable.
    if(flag(values.borderSameBoard,true))keys.forEach(key=>{updated[key]='match';});
    updated[keys[course]]=next;
    updated.borderSameBoard=keys.every(key=>text(updated[key],'match')==='match');
    return updated;
  }
  if(target==='breaker'){
    if(!Number.isInteger(course)||course<0||course>2)return values;
    return {...values,[course===0?'breakerBoardMaterial':'breakerBoardMaterial'+(course+1)]:next};
  }
  const key=target==='stairs'?'stairTreadStyle':target==='stair-fascia'?'stairFasciaMaterial':
    target==='fascia'?'fasciaMaterial':target==='risers'?'stairRiserStyle':'drinkRailMaterial';
  return {...values,[key]:next,...(target==='drink-rail'?{
    drinkRail:true,railingPostTermination:'flush-drink',railingPostCap:'none',
  }:{})};
}

export function changeFinishCourseCount(values:FinishDockValues,kind:'picture-frame'|'breaker',count:number):FinishDockValues {
  if(!Number.isInteger(count)||count<0||count>3)return values;
  const key=kind==='picture-frame'?'pictureFrameCount':'breakerBoardCount';
  if(Number(values[key]??0)===count)return values;
  return {...values,[key]:count};
}

export function changeRailingFinishStyle(values:FinishDockValues,id:string):FinishDockValues {
  if(values.railingVisualId===id)return values;
  const style=railVisualProducts.find(item=>item.id===id);
  if(!style)return values;
  const selectedColor=text(values.railingColor,'black');
  const selectedInfill=text(values.railingInfill,style.infills[0]) as RailInfill;
  const drink=style.geometry.includes('drink');
  return {...values,railingVisualId:style.id,
    railingType:style.family==='metal'?'aluminum':style.family==='wood'?'wood':'vinyl-composite',
    railingSystem:style.takeoffSystem==='timbertech-ire'?'timbertech-ire':'standard',
    railingTopProfile:style.geometry==='ire-modern'?'modern':style.geometry==='ire-drink'?'drink':'classic',
    railingColor:style.colors.includes(selectedColor)?selectedColor:style.colors[0],
    railingInfill:style.infills.includes(selectedInfill)?selectedInfill:style.infills[0],
    drinkRail:drink,
    ...(drink?{railingPostTermination:'flush-drink',railingPostCap:'none'}:
      values.railingPostTermination==='flush-drink'?{railingPostTermination:'at-top',railingPostCap:'standard'}:{}),
    spindleType:style.geometry==='wood-round-aluminum'?'black-round':
      style.geometry==='wood-picket'?'wood-pickets':values.spindleType,
  };
}

/** A new fixture replaces the legacy cap accessory; never order both. */
export function changePostCapLighting(values:FinishDockValues,fixtureId:string):FinishDockValues {
  if(String(values.lightingPostCapFixture??'none')===fixtureId)return values;
  const rail=finishDockRailProduct(values);
  const flush=rail.geometry.includes('drink')||['flush-top','flush-drink'].includes(String(values.railingPostTermination));
  return {...values,lightingPostCapFixture:fixtureId,railingPostCap:flush?'none':'standard'};
}

/** A saved/default color is only selected while the fixture is present.
 * Otherwise the carousel would suppress the first click on that color. */
export function getOverheadAddonFinish(values:FinishDockValues,kind:'fan'|'can-light'):string {
  const fan=kind==='fan';
  if(!(Number(values[fan?'patioFanCount':'patioCanLightCount'])>0))return '';
  return text(values[fan?'patioFanFinish':'patioCanLightFinish'],fan?'black':'white');
}

export function coverFinishStyleIssue(project:ConsultationProject,id:CoverFamily):string|undefined {
  if(project.coverScreenStyle==='elite-add-a-room'&&!['Moderno','Contempo','Classico'].includes(id))
    return 'The selected Elite sunroom needs a solid patio cover. Change the room type in details first.';
  return undefined;
}

export function changeCoverFinishStyle(project:ConsultationProject,id:CoverFamily):Partial<ConsultationProject> {
  if(project.coverFamily===id)return {};
  const item=coverVisualProducts.find(style=>style.id===id);
  if(!item||coverFinishStyleIssue(project,id))return {};
  return {coverFamily:item.id,kind:item.id==='none'?'deck':'covered-deck',
    coverColor:item.colors.includes(project.coverColor)?project.coverColor:item.colors[0],
    coverRoofStyle:item.roofStyles.includes(project.coverRoofStyle??'studio')?project.coverRoofStyle:'studio',
    coverAccentEnd:['Contempo','Classico'].includes(item.id)?'curved':'straight',
  };
}

export const sunroomFinishChoices:readonly {id:EliteSunroomFinish;label:string;color:string}[]=[
  {id:'white',label:'White',color:'#e7e9e7'}, {id:'wheat',label:'Wheat',color:'#c6b59a'},
  {id:'clay',label:'Clay',color:'#aa998d'}, {id:'bronze',label:'Bronze',color:'#574b40'},
];
export function changeSunroomFinish(project:ConsultationProject,color:EliteSunroomFinish):Partial<ConsultationProject> {
  if(!sunroomFinishChoices.some(option=>option.id===color))return {};
  const current=currentEliteSunroomSettings(project);
  if(current.framingColor===color&&current.panelColor===color&&current.windowColor===color)return {};
  return {eliteSunroom:{...current,
    framingColor:color,panelColor:color,windowColor:color}};
}

/** These screen swatches match the current material palette. */
export function railingFinishSwatch(value:string):string {
  return ({white:'#f1f0ea','matte-white':'#e4e3dc',black:'#202328','matte-black':'#171a1d',
    'dark-bronze':'#55463a','matte-espresso':'#372c25',kona:'#60462e',khaki:'#b6a68e',
    'pressure-treated':'#b7996b'} as Record<string,string>)[value]??'#939a9a';
}
