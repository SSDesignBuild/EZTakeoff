import type { MaterialItem } from './types';
import type { buildDeckModel } from './deckModel';
import { packSkirtCuts, type SkirtPlan, type SkirtSide } from './deckSkirting';
import { physicalStairSkirtSide } from './stairSkirtingPhysical';
import { skirtFastenerSummary } from './skirtingPhysicalLayout';

type Deck=ReturnType<typeof buildDeckModel>;
type Inputs=Record<string,string|number|boolean>;
const key=(lower:boolean,name:string)=>lower?'lower'+name.charAt(0).toUpperCase()+name.slice(1):name;
const bool=(v:unknown)=>v===true||v==='true';
/** Geometrically sloped under-stair side infill; not a code-approved stair stringer detail. */
export function buildDeckStairSkirting(deck:Deck,inputs:Inputs,lower=false):SkirtPlan {
  const pref=(name:string)=>key(lower,name);
  const enabled=bool(inputs[pref('skirtingEnabled')])&&bool(inputs[pref('skirtingStairsEnabled')])&&deck.stairCount>0;
  const material=String(inputs[pref('skirtingMaterial')]??'kdat');
  const orientation: 'horizontal'|'vertical'=inputs[pref('skirtingOrientation')]==='horizontal'?'horizontal':'vertical';
  const finishColor=String(inputs[pref('skirtingColor')]??'Natural / stain-ready');
  const faceIn=Number(inputs[pref('skirtingFaceIn')]??(material==='kdat'?4.5:5.5));
  const gapIn=Number(inputs[pref('skirtingGapIn')]??.25);
  const kerfIn=Number(inputs[pref('skirtingKerfIn')]??.125);
  const trimIn=Number(inputs[pref('skirtingTrimIn')]??.25);
  const revealIn=Number(inputs[pref('skirtingRevealIn')]??1);
  const opts={material,orientation,finishColor,faceIn,gapIn,kerfIn,trimIn,revealIn};
  const empty:SkirtPlan={enabled,sides:[],materials:[],cuts:[],finishStock:[],frameStock:[],issues:[],notes:[],frameScrews:0,finishNails:0,finishScrews:0,options:opts};
  if(!enabled)return empty;
  const issues:string[]=[],notes:string[]=[];
  if(!Number.isFinite(faceIn)||faceIn<=0||!Number.isFinite(gapIn)||gapIn<0||gapIn>2||!Number.isFinite(kerfIn)||kerfIn<0||!Number.isFinite(trimIn)||trimIn<0){
    return {...empty,issues:['Invalid stair skirting finish board dimensions, gap, kerf or trim.']};
  }
  const deckHeight=Number(inputs[lower?'lowerDeckHeight':'deckHeight']??0);
  const placements=deck.stairPlacements;
  const sides:SkirtSide[]=[];
  for(let stair=0;stair<placements.length;stair++)for(let side=0;side<2;side++){
    const physical=physicalStairSkirtSide(deck,placements[stair],deckHeight,inputs,opts,stair,side,lower);
    if(!physical)continue;
    sides.push(physical.side);issues.push(...physical.issues);
  }
  const finishCuts=sides.flatMap((s)=>s.finishCuts);
  const frameCuts=sides.flatMap((s)=>s.framingCuts);
  const finishStockPack=packSkirtCuts(finishCuts,material==='kdat'?[8,12,16,20]:[16,20],kerfIn,trimIn);
  const frameStockPack=packSkirtCuts(frameCuts,[8,10,12,16,20],kerfIn,trimIn);
  issues.push(...finishStockPack.issues,...frameStockPack.issues);
  if(!bool(inputs[pref('skirtingGradeConfirmed')]))
    issues.push('Verify toe grade, stair slope, finished clearance and bottom rail treatment before supplier export.');
  const {frameScrews,finishFasteners}=skirtFastenerSummary(sides,orientation);
  const category=lower?'Lower stair skirting':'Stair skirting';
  const materials:MaterialItem[]=[];
  for(const group of [
    {name:material==='kdat'?'1x5 KDAT pressure-treated stair skirting':material==='pvc'?'PVC stair skirting board':'Composite stair skirting board',color:finishColor,stock:finishStockPack.stock},
    {name:'2x4 ground-contact-treated stair skirting supports',color:'Ground-contact treatment',stock:frameStockPack.stock},
  ]) for(const length of [...new Set(group.stock.map((stock)=>stock.stockLengthFt))]){
    const list=group.stock.filter((stock)=>stock.stockLengthFt===length);
    materials.push({name:group.name,category,quantity:list.length,unit:'boards',stockRecommendation:length+' ft stock',color:group.color,
      layoutLabel:list.flatMap((s)=>s.cuts.map((cut)=>cut.id)).slice(0,10).join(', '),
      notes:'Both stair-side infills: selected fascia underside, actual dressed 2x4 supports at 24 in O.C.; verify field grade and clearance.'});
  }
  notes.push('Stair skirting adds two fascia-bounded side infills per placed flight. Dressed 1.5 x 3.5-in supports use the same physical cut polygons in 3D, CAD and stock packing; studs are at 24 in O.C. with supported stock splices.');
  notes.push('Every stair-side cut follows the selected fascia underside and lower rip, with the configured ground reveal. The previous independent six-inch toe assumption is retired. Verify field grade and fastening detail before fabrication.');
  return {enabled,sides,materials,cuts:[...finishCuts,...frameCuts],
    finishStock:finishStockPack.stock,frameStock:frameStockPack.stock,issues,notes,frameScrews,
    finishNails:material==='kdat'?finishFasteners:0,finishScrews:material==='kdat'?0:finishFasteners,options:opts};
}
