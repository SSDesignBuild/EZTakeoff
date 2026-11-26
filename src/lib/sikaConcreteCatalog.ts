import catalog from '../data/sikaConcreteCatalog.json';

/** These are real Sika/Butterfield product references. The renderer is a
 * measured layout illustration, not a factory stamp mesh or color guarantee. */
export type ConcreteStampStyle='plain'|'ashlar'|'grid'|'running-bond'|
  'herringbone'|'basket-weave'|'wood'|'irregular-stone'|'seamless'|
  'soldier'|'sailor'|'granite-border'|'rope';
export interface SikaConcreteStamp {
  id:string;name:string;family:string;description:string;sourceUrl:string;
  guideUrl?:string;sourceCode?:string|null;imageUrl?:string;imageSourceUrl?:string;
  referencePhotoUrl?:string;style:ConcreteStampStyle;
  /** Preview repeat only; see scaleBasis before interpreting as a tool size. */
  previewLengthIn:number;previewWidthIn:number;
  /** Published unit size, when explicitly given by the manufacturer. */
  unitLengthIn?:number;unitWidthIn?:number;
  scaleBasis:string;defaultWidthIn?:number|null;
}
export interface SikaConcreteColor {
  id:string;name:string;code?:string;swatch:string;description:string;
  sourceUrl:string;productUrl?:string;
}
export interface ConcreteAppearanceSelection {
  stampId?:string;colorId?:string;borderStampId?:string;
  borderColorId?:string;borderWidthIn?:number;
}
export const DEFAULT_CONCRETE_BORDER_WIDTH_IN=12;
export const SIKA_CONCRETE_REFERENCE_NOTE=
  'Official Sika / Butterfield sample photos. 3D patterns and screen colors are approximate; approve a physical sample for final color and texture.';
const source='https://usa.sika.com/en/construction/concrete/decorative-concrete/patterns-textures.html';
const plain:SikaConcreteStamp={id:'plain',name:'Plain concrete',family:'Plain',
  description:'Concrete without a decorative stamp.',sourceUrl:source,style:'plain',
  previewLengthIn:36,previewWidthIn:36,scaleBasis:'Unstamped surface; no decorative joint pattern.'};
const none:SikaConcreteStamp={...plain,id:'none',name:'No decorative border',
  description:'Use the field finish to the edge.',defaultWidthIn:0};
const patterns=catalog.patterns as SikaConcreteStamp[];
export const SIKA_CONCRETE_STAMPS:readonly SikaConcreteStamp[]=[plain,
  ...patterns.filter(item=>item.family!=='Borders')];
export const SIKA_CONCRETE_BORDERS:readonly SikaConcreteStamp[]=[none,
  ...patterns.filter(item=>item.family==='Borders')];
export const SIKA_CONCRETE_COLORS:readonly SikaConcreteColor[]=[{
  id:'natural',name:'Natural concrete',swatch:'#aaa9a5',sourceUrl:source,
  description:'Uncolored concrete; appearance varies with mix and finishing.'},
  ...catalog.colors];

export function resolveConcreteAppearance(selection:ConcreteAppearanceSelection){
  const stamp=SIKA_CONCRETE_STAMPS.find(item=>item.id===selection.stampId)??plain;
  const color=SIKA_CONCRETE_COLORS.find(item=>item.id===selection.colorId)??SIKA_CONCRETE_COLORS[0];
  const border=SIKA_CONCRETE_BORDERS.find(item=>item.id===selection.borderStampId)??none;
  const borderColor=!selection.borderColorId||selection.borderColorId==='match'?color:
    SIKA_CONCRETE_COLORS.find(item=>item.id===selection.borderColorId)??color;
  const selectedWidth=selection.borderWidthIn===undefined
    ?border.defaultWidthIn??DEFAULT_CONCRETE_BORDER_WIDTH_IN:selection.borderWidthIn;
  const borderWidthIn=border.id==='none'||!Number.isFinite(selectedWidth)
    ?0:Math.max(0,Math.min(72,selectedWidth));
  const issues:string[]=[];
  if(selection.stampId&&selection.stampId!==stamp.id)
    issues.push('Saved concrete stamp is not in the verified Sika catalog; select a current pattern.');
  if(selection.colorId&&selection.colorId!==color.id)
    issues.push('Saved concrete color is not in the verified Sika catalog; select a current color.');
  if(selection.borderStampId&&selection.borderStampId!==border.id)
    issues.push('Saved border stamp is not in the verified Sika catalog; select a current border.');
  if(selection.borderColorId&&selection.borderColorId!=='match'&&selection.borderColorId!==borderColor.id)
    issues.push('Saved border color is not in the verified Sika catalog; select a current color.');
  if(selection.borderWidthIn!==undefined&&(!Number.isFinite(selection.borderWidthIn)||
    selection.borderWidthIn<0||selection.borderWidthIn>72))
    issues.push('Decorative border width must be between 0 and 72 inches.');
  return {stamp,color,border,borderColor,borderWidthIn,issues};
}
