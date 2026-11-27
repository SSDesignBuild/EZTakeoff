import type { DeckModel } from './deckModel';
import { resolveFasciaDimensions } from './deckProductDimensions';
import { resolveFasciaMaterial,resolveStairSideFasciaMaterial,hasDecorativeStairFascia,stairFasciaDimensionOverrides } from './deckTrimSelection';
import { planDeckFasciaCuts } from './constructionFinish';
import { planConstructionStair } from './constructionStairs';
import { planStairFasciaCoverage } from './stairFasciaGeometry';
import { planStairFasciaStockPieces } from './stairFasciaCuts';
import { packSkirtCuts,type SkirtCut,type CutStock } from './deckSkirting';

interface Tier{id:string;model:DeckModel;height:number;values:Record<string,string|number|boolean>;}
export interface FasciaPurchaseGroup{
  role:'fascia'|'riser';
  material:string;name:string;category:string;faceIn:number;thicknessIn:number;sourceUrl?:string;
  cuts:SkirtCut[];stock:CutStock[];
}
/** A purchasable board contains actual installed polygon/profile cuts. Group
 * compatible main/lower stock once, keeping fascia and riser widths separate. */
export function planConstructionFasciaPurchase(tiers:readonly Tier[]){
  const groups=new Map<string,FasciaPurchaseGroup>(),issues:string[]=[];
  const add=(material:string,dimensions:ReturnType<typeof resolveFasciaDimensions>,name:string,category:string,cut:SkirtCut,role:'fascia'|'riser'='fascia')=>{
    const key=[material,dimensions.faceIn,dimensions.thicknessIn,role].join('|');
    if(!groups.has(key))groups.set(key,{role,material,name,category,faceIn:dimensions.faceIn,thicknessIn:dimensions.thicknessIn,sourceUrl:dimensions.sourceUrl,cuts:[],stock:[]});
    groups.get(key)!.cuts.push(cut);
  };
  for(const tier of tiers){
    const {model,values,id,height}=tier,fasciaMaterial=resolveFasciaMaterial(values);
    const dimensions=resolveFasciaDimensions(fasciaMaterial,{faceIn:Number(values.fasciaFaceIn),thicknessIn:Number(values.fasciaThicknessIn)});
    for(const cut of planDeckFasciaCuts(model))add(fasciaMaterial,dimensions,'Fascia board','Trim',{
      id:`${id}-${cut.id}`,edgeIndex:cut.edgeIndex,material:'finish',lengthFt:cut.lengthFt,location:`${id} perimeter fascia edge${cut.edgeIndex+1}`});
    for(const [index,placement]of model.stairPlacements.entries()){
      const stair=planConstructionStair(model,placement,height,values);if(!stair)continue;
      const flight=`ST${(placement.sourceIndex??index)+1}`;
      if(hasDecorativeStairFascia(values)){
        const material=resolveStairSideFasciaMaterial(values),d=resolveFasciaDimensions(material,stairFasciaDimensionOverrides(values));
        const coverage=planStairFasciaCoverage({treadDepthFt:stair.treadDepthFt,treads:stair.treads,riseFt:stair.riseFt,heightFt:height,
          style:values.stairFasciaStyle==='straight'?'straight':'profiled',nosingFt:stair.nosingFt,treadThicknessFt:stair.treadThicknessFt,boardFaceFt:d.faceIn/12,boardThicknessIn:d.thicknessIn});
        for(const side of ['L','R'])for(const piece of planStairFasciaStockPieces(coverage,stair.riseFt,stair.treadDepthFt))add(material,d,'Stair side fascia board','Stairs',{
          id:`${id}-${flight}-SF${side}-${piece.index+1}`,edgeIndex:placement.edgeIndex??-1,material:'finish',lengthFt:piece.cutLengthFt,
          location:`${id} ${flight} ${side} ${piece.kind} fascia; exact selected ${d.thicknessIn}-in thickness`});
      }
      if(stair.riserIsFascia){const d=resolveFasciaDimensions(stair.riserMaterial,{thicknessIn:Number(values.stairRiserThicknessIn)},'riser');
        for(const riser of stair.risers)add(stair.riserMaterial,d,'Stair fascia riser board','Stairs',{
          id:`${id}-${flight}-RS${riser.step+1}-${riser.board+1}`,edgeIndex:placement.edgeIndex??-1,material:'finish',lengthFt:stair.widthFt,
          location:`${id} ${flight} riser${riser.step+1} piece${riser.board+1}; rip face to ${(riser.topFt-riser.bottomFt)*12}in`},'riser');
      }
    }
  }
  for(const group of groups.values()){const plan=packSkirtCuts(group.cuts,[12],.125,.25);group.stock=plan.stock;issues.push(...plan.issues);}
  const list=[...groups.values()];return {groups:list,issues,totalLinearFt:list.reduce((sum,g)=>sum+g.cuts.reduce((s,c)=>s+c.lengthFt,0),0)};
}
