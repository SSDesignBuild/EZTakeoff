/**
 * Single finish-selection source for Sales 3D and Admin material takeoff.
 * A selected manufacturer style stays independent for EACH of three border
 * and breaker courses. 'match' follows the CURRENT field decking choice.
 */
export interface TrimValues {
  deckingMaterial?:unknown;
  borderSameBoard?:unknown;
  pictureFrameMaterial?:unknown;pictureFrameMaterial2?:unknown;pictureFrameMaterial3?:unknown;
  breakerBoardMaterial?:unknown;breakerBoardMaterial2?:unknown;breakerBoardMaterial3?:unknown;
  fasciaMaterial?:unknown;stairFasciaMaterial?:unknown;
}
const text=(v:unknown):string=>String(v??'').trim();
export function resolveBoardFinish(raw:unknown,field:string):string{
  const value=text(raw);
  return value&&value!=='match'?value:field;
}
export function resolvePictureFrameMaterials(values:TrimValues):string[]{
  const field=text(values.deckingMaterial);
  const same=values.borderSameBoard===undefined||values.borderSameBoard===true||
    text(values.borderSameBoard)==='true';
  const selections=[values.pictureFrameMaterial,values.pictureFrameMaterial2,values.pictureFrameMaterial3];
  return selections.map(value=>same?field:resolveBoardFinish(value,field));
}
export function resolveBreakerBoardMaterials(values:TrimValues):string[]{
  const field=text(values.deckingMaterial);
  return [values.breakerBoardMaterial,values.breakerBoardMaterial2,values.breakerBoardMaterial3]
    .map(value=>resolveBoardFinish(value,field));
}
export function resolveFasciaMaterial(values:TrimValues):string{
  return resolveBoardFinish(values.fasciaMaterial,text(values.deckingMaterial));
}
export function resolveStairSideFasciaMaterial(values:TrimValues):string{
  const perimeter=resolveFasciaMaterial(values);
  return values.stairFasciaMaterial==='match-fascia'||!values.stairFasciaMaterial?
    perimeter:resolveBoardFinish(values.stairFasciaMaterial,text(values.deckingMaterial));
}
type FasciaChoices=TrimValues&{deckingType?:unknown;fasciaThicknessIn?:unknown;fasciaFaceIn?:unknown;
  stairFasciaThicknessIn?:unknown;stairFasciaFaceIn?:unknown;stairStringerFascia?:unknown};
/** Matching perimeter fascia includes its configured dimensions. Independent
 * stair choices inherit only their selected product's dimensions. */
export function stairFasciaDimensionOverrides(values:FasciaChoices):{faceIn:number;thicknessIn:number}{
  const match=!values.stairFasciaMaterial||values.stairFasciaMaterial==='match-fascia';
  const positive=(value:unknown)=>Number(value)>0?Number(value):0;
  return {faceIn:positive(values.stairFasciaFaceIn)||(match?positive(values.fasciaFaceIn):0),
    thicknessIn:positive(values.stairFasciaThicknessIn)||(match?positive(values.fasciaThicknessIn):0)};
}
/** Matching pressure-treated finish is exposed structural wood. A separately
 * selected finish or explicit custom fascia dimensions is a real skin. */
export function hasDecorativeDeckFascia(values:FasciaChoices):boolean{
  return !/pressure/i.test(String(values.deckingType))||resolveFasciaMaterial(values)!==text(values.deckingMaterial)||
    Number(values.fasciaThicknessIn)>0||Number(values.fasciaFaceIn)>0;
}
export function hasDecorativeStairFascia(values:FasciaChoices):boolean{
  if(values.stairStringerFascia===false||values.stairStringerFascia==='false')return false;
  return !/pressure/i.test(String(values.deckingType))||resolveStairSideFasciaMaterial(values)!==text(values.deckingMaterial)||
    Number(values.stairFasciaThicknessIn)>0||Number(values.stairFasciaFaceIn)>0||
    ((!values.stairFasciaMaterial||values.stairFasciaMaterial==='match-fascia')&&hasDecorativeDeckFascia(values));
}
