import type { buildDeckModel } from './deckModel';
import type { MaterialItem, DeckEdgeSegment } from './types';
import { packSkirtCuts, type SkirtCut } from './deckSkirting';

type Deck = ReturnType<typeof buildDeckModel>;
type Inputs = Record<string, string | number | boolean>;
export type RailPanel = { kind: 'level' | 'stair'; edgeIndex: number | null; startFt: number; endFt: number; stockFt: 6 | 8; label: string };
export type RailPost = { x: number; y: number; reference: string; edgeIndex: number | null };
export type IREPlan = {
  enabled: boolean; panels: RailPanel[]; posts: RailPost[]; materials: MaterialItem[];
  issues: string[]; notes: string[]; profile: string; color: string; infill: string;
  postTermination: string; postCap: string; heightIn: number;
};
const p3=(v:number)=>Math.round(v*1000)/1000;
const norm=(v:unknown,defaultValue:string)=>String(v===undefined?defaultValue:v);
const keyPoint=(x:number,y:number)=>Math.round(x*1000)+'/'+Math.round(y*1000);
const materialRow=(name:string,category:string,quantity:number,unit:string,stockRecommendation:string,color:string,notes:string,layoutLabel?:string):MaterialItem=>({name,category,quantity,unit,stockRecommendation,color,notes,layoutLabel});
function onEdge(edge:DeckEdgeSegment,offset:number){
  const fraction=Math.max(0,Math.min(1,offset/edge.length));
  return {x:edge.start.x+(edge.end.x-edge.start.x)*fraction,y:edge.start.y+(edge.end.y-edge.start.y)*fraction};
}
function panelRuns(deck:Deck){
  const stairCuts=(deck.stairPlacements?.length?deck.stairPlacements:[deck.stairPlacement])
    .filter((p)=>p.edgeIndex!==null&&p.width>0);
  const runs:{edgeIndex:number;start:number;end:number}[]=[];
  for(const coverage of deck.railCoverage){
    const edge=deck.edgeSegments.find((x)=>x.index===coverage.edgeIndex);
    if(!edge)continue;
    let spans=[{start:Math.max(0,coverage.start),end:Math.min(edge.length,coverage.end)}];
    for(const cut of stairCuts.filter((x)=>x.edgeIndex===coverage.edgeIndex)){
      const left=cut.offset,right=cut.offset+cut.width;
      spans=spans.flatMap((span)=>{
        const lo=Math.max(span.start,left),hi=Math.min(span.end,right);
        return hi<=lo?[span]:[{start:span.start,end:lo},{start:hi,end:span.end}].filter((part)=>part.end-part.start>0.01);
      });
    }
    runs.push(...spans.filter((span)=>span.end-span.start>0.01).map((span)=>({...span,edgeIndex:edge.index})));
  }
  return runs;
}
export function buildTimberTechIRE(deck:Deck,inputs:Inputs,tierName='Main deck'):IREPlan{
  const enabled=inputs.railingSystem==='timbertech-ire';
  const color=norm(inputs.railingColor,'black');
  const profile=norm(inputs.railingTopProfile,'classic');
  const infill=norm(inputs.railingInfill,'aluminum');
  const heightIn=Number(inputs.railingHeightIn??36);
  const postSize=norm(inputs.railingPostSize,'3x3');
  const postCap=norm(inputs.railingPostCap,'standard');
  const postTermination=norm(inputs.railingPostTermination,'at-top');
  const empty:IREPlan={enabled,panels:[],posts:[],materials:[],issues:[],notes:[],profile,color,infill,postTermination,postCap,heightIn};
  if(!enabled)return empty;
  const issues:string[]=[],notes:string[]=[];
  if(norm(inputs.railingType,'aluminum')!=='aluminum')
    issues.push('TimberTech Impression Rail Express requires the Aluminum top-mounted railing type.');
  if(!['classic','modern','drink'].includes(profile))issues.push('Select Classic, Modern or Drink top rail.');
  if(!['white','black','dark-bronze'].includes(color))issues.push('Select a published Impression Rail Express finish (White, Black, Dark Bronze).');
  if(!['aluminum','glass','midrail','horizontal-cable'].includes(infill))issues.push('Infill choice needs manufacturer verification.');
  if(infill!=='aluminum')issues.push('Special infill '+infill+' needs a confirmed manufacturer-specific panel/channel/cable kit BOM; universal baluster panel cannot be substituted.');
  if(![36,42].includes(heightIn))issues.push('TimberTech Impression Rail Express is configured for 36 or 42 in railing height.');
  if(!['3x3','4x4','2x2'].includes(postSize))issues.push('Choose a supported post size.');
  if(profile==='drink'&&infill==='glass')issues.push('TimberTech Drink Rail cannot use glass infill.');
  if(profile==='drink'&&infill==='midrail')issues.push('TimberTech Drink Rail cannot use open mid-rail infill.');
  if(profile==='drink'&&postSize!=='3x3')issues.push('TimberTech Drink Rail must use 3x3 posts.');
  if(postSize==='2x2'&&(['above-top','above-drink'].includes(postTermination)||postCap!=='standard'))
    issues.push('2x2 over-the-post applications do not support caps or independent post extensions.');
  if(postSize==='2x2'&&profile==='drink')issues.push('Drink Rail uses 3x3 posts, not 2x2.');
  if(postSize==='2x2'&&!['classic','modern'].includes(profile))issues.push('2x2 posts require a supported over-the-post Classic or Modern rail.');
  if(['above-drink','flush-drink'].includes(postTermination)&&profile!=='drink')
    issues.push('This post termination requires the Drink Rail top profile.');
  if(['above-top','above-drink'].includes(postTermination))
    notes.push('Posts extending above the top rail require approved manufacturer hardware/cut detail; not assumed structurally compatible.');
  if(postCap!=='standard'&&postSize!=='3x3')issues.push('Selected cap/lighting option requires verification with a compatible 3x3 post kit.');
  const map=new Map<string,RailPost>();
  const panels:RailPanel[]=[];
  for(const run of panelRuns(deck)){
    const edge=deck.edgeSegments.find((item)=>item.index===run.edgeIndex);
    if(!edge)continue;
    const len=run.end-run.start;
    const n=Math.max(1,Math.ceil(len/8));
    for(let i=0;i<=n;i++){
      const station=run.start+(len*i)/n;
      const point=onEdge(edge,station);
      const key=keyPoint(point.x,point.y);
      if(!map.has(key))map.set(key,{...point,reference:'IR-P'+(map.size+1),edgeIndex:run.edgeIndex});
      if(i<n){
        const next=run.start+(len*(i+1))/n;
        panels.push({kind:'level',edgeIndex:run.edgeIndex,startFt:p3(station),endFt:p3(next),stockFt:(next-station<=6+0.0001?6:8),label:'E'+(run.edgeIndex+1)+'-B'+(panels.length+1)});
      }
    }
  }
  const countStairSides=deck.stairCount>0?deck.stairRailSideCount*deck.stairCount:0;
  if(countStairSides>0){
    const n=Math.max(1,Math.ceil(deck.stairRunFt/8));
    for(let stairSide=0;stairSide<countStairSides;stairSide++){
      for(let i=0;i<n;i++){
        const start=(i*deck.stairRunFt)/n,end=((i+1)*deck.stairRunFt)/n;
        panels.push({kind:'stair',edgeIndex:null,startFt:p3(start),endFt:p3(end),stockFt:end-start<=6+0.0001?6:8,label:'STAIR-'+(stairSide+1)+'-'+(i+1)});
      }
    }
    notes.push('Stair posts and attachment are not resolved into unique geometric post coordinates. Verify stair-side post kits and slopes before final ordering.');
  }
  const posts=[...map.values()];
  const materials:MaterialItem[]=[];
  const colorText=color==='dark-bronze'?'Dark Bronze':color[0].toUpperCase()+color.slice(1);
  const nameBase='TimberTech Impression Rail Express ';
  const level6=panels.filter((item)=>item.kind==='level'&&item.stockFt===6);
  const level8=panels.filter((item)=>item.kind==='level'&&item.stockFt===8);
  const stair6=panels.filter((item)=>item.kind==='stair'&&item.stockFt===6);
  const stair8=panels.filter((item)=>item.kind==='stair'&&item.stockFt===8);
  const category=tierName+' TimberTech railing';
  for(const group of [{panels:level6,kind:'Level',length:6},{panels:level8,kind:'Level',length:8},{panels:stair6,kind:'Stair',length:6},{panels:stair8,kind:'Stair',length:8}]){
    if(!group.panels.length)continue;
    materials.push(materialRow(nameBase+group.kind+' Universal '+group.length+' ft panel - '+infill,category,group.panels.length,'kits',
      group.length+' ft nominal; actual '+(group.length===6?'69.43':'91.31')+' in panel',colorText,
      'Universal panel includes balusters/bottom rail/bracket hardware; TOP RAIL ORDERED SEPARATELY. Locations: '+group.panels.map((p)=>p.label).join(', ')));
    materials.push(materialRow(nameBase+profile+' top rail ('+group.kind+')',category,group.panels.length,'rails',
      group.length+' ft nominal top rail ('+(group.length===6?'69.43':'91.31')+' in)',colorText,
      'Separate top rails for '+group.panels.map((p)=>p.label).join(', ')));
  }
  const postQty=posts.length + countStairSides*2 + panels.filter((p)=>p.kind==='stair').length-countStairSides;
  if(postQty>0){
    materials.push(materialRow(nameBase+postSize+' aluminum posts/kits',category,postQty,'kits','Compatible '+heightIn+' in rail height',colorText,
      posts.map((p)=>p.reference).join(', ')+'; stair support count provisional, confirm post style/attachment. 3x3 post kits commonly include cap and skirt.'));
    if(postCap!=='standard'){
      materials.push(materialRow(nameBase+postCap+' cap/light accessories',category,postQty,'ea','Verify exact accessory compatibility',colorText,
        'One accessory per estimated post. Check rail cap/skirt kit inclusion and low-voltage wiring.'));
    }
  }
  if(profile==='drink'){
    const board=norm(inputs.drinkRailMaterial,'match')==='match'?norm(inputs.deckingMaterial,'Composite / PVC'):norm(inputs.drinkRailMaterial,'');
    if(/(?:Terrain\+?|Prime\+?|ReliaBoard|Trex Enhance)/i.test(board))
      issues.push('Selected drink-rail board ('+board+') may be scalloped and is not an approved full-profile square-shouldered board.');
    notes.push('TimberTech Drink Rail requires full-profile square-shouldered boards; verify exact board SKU and the compatible insert/fastening kit.');
    const drinkCuts:SkirtCut[]=panels.map((panel,i)=>({
      id:'IR-DRINK-'+(i+1),edgeIndex:panel.edgeIndex??-1,material:'finish',
      lengthFt:Math.max(0,panel.endFt-panel.startFt),location:panel.label+' drink-rail board'
    }));
    const packed=packSkirtCuts(drinkCuts,[16,20],0.125,0.25);
    issues.push(...packed.issues);
    for(const length of [...new Set(packed.stock.map((item)=>item.stockLengthFt))]){
      const stock=packed.stock.filter((item)=>item.stockLengthFt===length);
      materials.push(materialRow(nameBase+'drink-rail full-profile square-shouldered board ('+board+')',category,stock.length,'boards',length+' ft stock',board,
        '16/20 ft stock only; cut references '+stock.flatMap((p)=>p.cuts.map((c)=>c.id)).join(', ')));
    }
  }
  if(!(['true',true].includes(inputs.railingManufacturerConfirmed as boolean | string))){
    issues.push('Verify TimberTech panel opening spans, post mounting, compatible profile/infill, SKU availability and lighting with supplier before exporting.');
  }
  notes.push('Impression Rail Express published 6/8 ft panel lengths: 69.43/91.31 inches. Panelized kits include bottom rail and brackets; matching top rails are separate.');
  notes.push('TimberTech compatibility and current stock: https://www.timbertech.com/product/impressionrail-express/');
  return {enabled,panels,posts,materials,issues,notes,profile,color,infill,postTermination,postCap,heightIn};
}
