type Values=Record<string,string|number|boolean>;
/** Classify the product, never a color word such as Ashwood or Cedar. */
export function isWoodDeckFinish(material:string,values:Values):boolean{
  if(material===String(values.deckingMaterial??''))return /pressure/i.test(String(values.deckingType));
  return /^(?:pressure[\s-]*treated|treated\b|cedar\b|wood\b|kdat\b|redwood\b)/i.test(material.trim());
}
/** Purchasing and CAD use identical selected fastener names. Quantities are
 * two-fastener connection allowances; this does not specify drill holes. */
export function finishFastenerItems(values:Values,material:string,role:'field'|'trim',quantity:number):{
  name:string;quantity:number;unit:string;
}[]{
  if(isWoodDeckFinish(material,values))return [{name:'2 in exterior pressure-treated deck board screws',quantity,unit:'ea'}];
  if(role==='field')return [{name:'2-3/8 in CAMO screws',quantity,unit:'ea'}];
  return String(values.trimFastenerChoice??'cortex-fascia')==='plug-system'?
    [{name:'Color match screws for plugs',quantity,unit:'ea'},{name:'Color match plugs',quantity,unit:'ea'}]:
    [{name:'Cortex color match fascia screws',quantity,unit:'ea'}];
}
