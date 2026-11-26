import type { MaterialItem } from './types';
import type { SiteConcretePlan } from './siteConcrete';

/** Decorative work uses the same disjoint field/border face areas as 3D.
 * These are scope quantities, not guessed mat purchases, color dosages or prices. */
export function siteConcreteFinishMaterials(plan:SiteConcretePlan):MaterialItem[]{
  if(!plan.canQuantify)return [];
  const materials:MaterialItem[]=[];
  for(const area of plan.areas){
    const f=area.finish;
    // Editable material rows use drawing labels as part of their identity.
    // Keep each saved area independent even when names/finishes match or the
    // schedule is reordered. Supplier aggregation still combines like stock.
    const layoutLabel='Concrete area '+area.id;
    if(f.stampId!=='plain'&&area.fieldFinishAreaSqFt>1e-7)materials.push({
      name:'SikaStamp field finish — '+f.stampName,category:'Site concrete decorative finish',
      quantity:area.fieldFinishAreaSqFt,unit:'sq ft',layoutLabel,
      stockRecommendation:'Stamping work area; confirm tool set/rental with installer',
      notes:area.name+': field only; decorative border excluded. '+f.sourceUrls[0],
    });
    if(area.borderFinishAreaSqFt>1e-7)materials.push({
      name:'SikaStamp border finish — '+f.borderStampName,category:'Site concrete decorative finish',
      quantity:area.borderFinishAreaSqFt,unit:'sq ft',layoutLabel,
      stockRecommendation:f.borderWidthIn+' in perimeter course; confirm stamp tools and corner detailing',
      notes:area.name+': '+area.borderLengthFt.toFixed(2)+' lf of slab perimeter, '+
        area.borderFinishAreaSqFt.toFixed(2)+' sq ft of the existing slab. No added concrete volume.',
    });
    const colors=new Map<string,{name:string;quantity:number}>();
    const add=(id:string,name:string,quantity:number)=>{
      if(id==='natural'||quantity<1e-7)return;
      const found=colors.get(id);colors.set(id,{name,quantity:quantity+(found?.quantity??0)});
    };
    add(f.colorId,f.colorName,area.fieldFinishAreaSqFt);
    add(f.borderColorId,f.borderColorName,area.borderFinishAreaSqFt);
    for(const color of colors.values())materials.push({
      name:'SikaColor-200 surface color — '+color.name,category:'Site concrete decorative finish',
      quantity:color.quantity,unit:'sq ft',layoutLabel,
      stockRecommendation:'Surface coverage area; supplier to confirm 50-lb pail count and broadcast rate',
      notes:area.name+': color hardener surface treatment, not an integral-color concrete dose. '+
        'Sika PDS lists 50 lb/100 sq ft, or 50 lb/80 sq ft for lighter colors; final rate and pail count require installer confirmation. '+
        'https://usa.sika.com/dam/dms/us01/9/sikacolor-200-colorhardener.pdf',
    });
  }
  return materials;
}
