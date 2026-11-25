import type { buildDeckModel } from './deckModel';
import type { MaterialItem } from './types';
import { packSkirtCuts, type SkirtCut } from './deckSkirting';
import {planLevelRailingRuns,planDrinkRailPieces,railingSurfaceInsetFt,railPointKey,resolveDrinkRailMaterial} from './railingLayout';
import {planStairRailingRuns} from './stairRailVisualGeometry';
import {parseDeckGates} from './deckGates';

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
const materialRow=(name:string,category:string,quantity:number,unit:string,stockRecommendation:string,color:string,notes:string,layoutLabel?:string):MaterialItem=>({name,category,quantity,unit,stockRecommendation,color,notes,layoutLabel});
export function buildTimberTechIRE(deck:Deck,inputs:Inputs,tierName='Main deck'):IREPlan{
  const enabled=inputs.railingSystem==='timbertech-ire';
  const color=norm(inputs.railingColor,'black');
  const profile=norm(inputs.railingTopProfile,'classic');
  const infill=norm(inputs.railingInfill,'aluminum');
  const heightIn=Number(inputs.railingHeightIn??36);
  const postSize=norm(inputs.railingPostSize,'3x3');
  const requestedCap=norm(inputs.railingPostCap,'standard');
  const postTermination=profile==='drink'?'flush-drink':norm(inputs.railingPostTermination,'at-top');
  const hiddenPosts=postTermination==='flush-top'||postTermination==='flush-drink';
  // Rails/boards cover a truly flush post end. No separate cap is required
  // and it must not accidentally appear on the supplier order.
  const postCap=hiddenPosts?'none':requestedCap;
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
  if(!['at-top','flush-top','flush-drink','above-top','above-drink'].includes(postTermination))
    issues.push('Select a supported railing post termination detail.');
  if(requestedCap==='none'&&!hiddenPosts)
    issues.push('No post cap is only appropriate for an approved concealed flush termination.');
  if(hiddenPosts && requestedCap!=='none')
    notes.push('Post caps and post-top lights are omitted automatically: flush post ends are concealed by the continuous top/drink rail.');
  if(['above-top','above-drink'].includes(postTermination))
    notes.push('Posts extending above the top rail require approved manufacturer hardware/cut detail; not assumed structurally compatible.');
  if(!['none','standard'].includes(postCap)&&postSize!=='3x3')issues.push('Selected cap/lighting option requires verification with a compatible 3x3 post kit.');
  const map=new Map<string,RailPost>();
  const panels:RailPanel[]=[];
  const requestedPost=Number(postSize.split('x')[0]);
  const postWidth=([2,3,4].includes(requestedPost)?requestedPost:3)/12;
  const topWidth=profile==='drink'?5.5/12:profile==='modern'?2.25/12:2.5/12;
  const deckHeight=Number(inputs.deckHeight??0);
  const gates=parseDeckGates(inputs.deckGateEntries).flatMap(gate=>{
    const edge=deck.edgeSegments.find(e=>e.index===gate.edgeIndex);if(!edge)return [];
    const stair=gate.placement==='stairs'?deck.stairPlacements.find(s=>s.edgeIndex===edge.index):undefined;
    const width=Math.min(edge.length,Math.max(.5,stair?.width??gate.widthFt));
    const start=Math.min(Math.max(0,edge.length-width),Math.max(0,stair?.offset??gate.offsetFt??0));
    return [{edgeIndex:edge.index,startFt:start,endFt:start+width}];
  });
  const levelRuns=planLevelRailingRuns(deck,[0,0],deckHeight,postWidth,topWidth,7.1,deck.railCoverage,gates);
  const stairRuns=planStairRailingRuns(deck,[0,0],deckHeight,postWidth,7.1,railingSurfaceInsetFt(postWidth,topWidth));
  const addPost=(point:readonly number[],edgeIndex:number,reference:string)=>{
    const key=railPointKey(point);
    if(!map.has(key))map.set(key,{x:point[0],y:point[2],reference,edgeIndex});
  };
  for(const run of levelRuns){
    run.posts.forEach((point,i)=>{
      addPost(point,run.edgeIndex,'IR-P'+(map.size+1));
      if(i===run.posts.length-1)return;
      const next=run.posts[i+1];
      const length=Math.hypot(next[0]-point[0],next[2]-point[2]);
      const start=run.posts.slice(0,i).reduce((sum,p,j)=>sum+Math.hypot(run.posts[j+1][0]-p[0],run.posts[j+1][2]-p[2]),0);
      panels.push({kind:'level',edgeIndex:run.edgeIndex,startFt:p3(start),endFt:p3(start+length),stockFt:length<=6+.0001?6:8,label:'E'+(run.edgeIndex+1)+'-B'+(i+1)});
    });
  }
  for(const run of stairRuns){
    let start=0;
    run.posts.forEach((point,i)=>{
      addPost(point,run.edgeIndex,'IR-STAIR-'+(run.placementIndex+1)+'-'+run.side+'-P'+(i+1));
      if(i===run.posts.length-1)return;
      const length=run.panels[i].lengthFt;
      panels.push({kind:'stair',edgeIndex:run.edgeIndex,startFt:p3(start),endFt:p3(start+length),stockFt:length<=6+.0001?6:8,label:'STAIR-'+(run.placementIndex+1)+'-'+run.side+'-'+(i+1)});
      start+=length;
    });
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
  const postQty=posts.length;
  if(postQty>0){
    materials.push(materialRow(nameBase+postSize+' aluminum posts/kits',category,postQty,'kits','Compatible '+heightIn+' in rail height',colorText,
      posts.map((p)=>p.reference).join(', ')+'; shared landing and corner posts counted once from the rendered layout. Confirm mounting/structural blocking. 3x3 kits can include a cap; omit separate caps for concealed flush posts.'));
    if(!['standard','none'].includes(postCap)){
      materials.push(materialRow(nameBase+postCap+' cap/light accessories',category,postQty,'ea','Verify exact accessory compatibility',colorText,
        'One accessory per estimated post. Check rail cap/skirt kit inclusion and low-voltage wiring.'));
    }
  }
  if(profile==='drink'){
    const board=resolveDrinkRailMaterial(inputs);
    if(/(?:Terrain\+?|Prime\+?|ReliaBoard|Trex Enhance)/i.test(board))
      issues.push('Selected drink-rail board ('+board+') may be scalloped and is not an approved full-profile square-shouldered board.');
    notes.push('TimberTech Drink Rail requires full-profile square-shouldered boards; verify exact board SKU and the compatible insert/fastening kit.');
    const drinkPieces=planDrinkRailPieces(levelRuns,stairRuns,5.5/12,heightIn/12+.075+.093/2);
    const drinkCuts:SkirtCut[]=drinkPieces.map((piece,i)=>({
      id:'IR-DRINK-'+(i+1),edgeIndex:piece.edgeIndex,material:'finish',
      lengthFt:piece.lengthFt,location:piece.id+' mitered/pitched drink-rail board'
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
