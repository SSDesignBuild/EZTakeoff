import visualAssets from './timbertechVisualAssets.json';
import { SERVICES } from './services';

/** One keyed inventory record supports the selector, 3D material and handoff. */
export interface DeckVisualProduct {
  id: string;
  label: string;
  collection: string;
  color: string;
  manufacturer: 'TimberTech';
  family: 'pvc' | 'composite';
  grain: 'wire-brushed' | 'crosscut' | 'cathedral' | 'hand-scraped' | 'reclaimed' | 'subtle' | 'straight';
  swatch: string;
  sourceUrl: string;
  sourcePage: string;
  stockFt: number[];
  isVerifiedVisual: boolean;
}
const fromManifest=visualAssets as DeckVisualProduct[];
const adminBoards=new Set(
  SERVICES.find((service)=>service.slug==='decks')?.fields
    .find((field)=>field.key==='deckingMaterial')?.options?.map((option)=>option.value) ?? [],
);
export const deckVisualProducts: readonly DeckVisualProduct[]=fromManifest.filter((product)=>
  adminBoards.has(product.label) || product.collection==='Vintage' && product.color==='Cypress'
);
export function getDeckVisualProduct(value: unknown): DeckVisualProduct | null {
  if(typeof value!=='string')return null;
  return deckVisualProducts.find((product)=>product.label===value)??null;
}
export const isOfficialSample=(value:unknown):boolean=>getDeckVisualProduct(value)!==null;
export const deckCollections=[...new Set(deckVisualProducts.map((product)=>product.collection))];

export type RailFamily = 'metal'|'pvc'|'composite'|'vinyl'|'wood';
export type RailGeometry = 'ire-classic'|'ire-modern'|'ire-drink'|'pvc-statement'|'pvc-pinnacle'|'vinyl-reliance'|
  'composite-premier'|'composite-radiance'|'composite-trademark'|'composite-drink'|'composite-radiance-express'|
  'wood-picket'|'wood-round-aluminum';
export type RailInfill = 'aluminum'|'midrail'|'glass'|'horizontal-cable'|'vertical-cable'|
  'square-white'|'square-black'|'round-black'|'chippendale'|'square-web'|'wood-picket';
export interface RailVisualProduct {
  id:string;label:string;manufacturer:string;family:RailFamily;
  geometry:RailGeometry;
  summary:string;
  sourcePage:string;
  colors:readonly string[];
  infills:readonly RailInfill[];
  topWidthIn:number;topHeightIn:number;postWidthIn:number;
  takeoffSystem:'timbertech-ire'|'standard-unverified';
}
const TT_IRX='https://www.timbertech.com/product/impressionrail-express/';
const TT_PVC='https://www.timbertech.com/products/railing/railing-overview/';
const TT_COMPOSITE='https://www.timbertech.com/ideas/composite-deck-railing-know-your-options/';
const withId=(v:RailVisualProduct)=>v;
export const railVisualProducts:readonly RailVisualProduct[]=[
  withId({id:'tt-ire-classic',label:'Impression Rail Express · Classic',manufacturer:'TimberTech',family:'metal',
    geometry:'ire-classic',summary:'Powder-coated aluminum, Classic milled top rail, rectangular balusters',
    sourcePage:TT_IRX,colors:['black','white','dark-bronze'],
    infills:['aluminum','midrail','glass','horizontal-cable','vertical-cable'],
    topWidthIn:2.5,topHeightIn:2.3,postWidthIn:3,takeoffSystem:'timbertech-ire'}),
  withId({id:'tt-ire-modern',label:'Impression Rail Express · Modern',manufacturer:'TimberTech',family:'metal',
    geometry:'ire-modern',summary:'Slim 2.25 in contemporary top profile; open views',
    sourcePage:TT_IRX,colors:['black','white','dark-bronze'],
    infills:['aluminum','midrail','glass','horizontal-cable','vertical-cable'],
    topWidthIn:2.25,topHeightIn:1.8,postWidthIn:3,takeoffSystem:'timbertech-ire'}),
  withId({id:'tt-ire-drink',label:'Impression Rail Express · Drink Rail',manufacturer:'TimberTech',family:'metal',
    geometry:'ire-drink',summary:'3 in posts and compatible full-profile square-shoulder deck-board top',
    sourcePage:TT_IRX,colors:['black','white','dark-bronze'],
    infills:['aluminum','horizontal-cable','vertical-cable'],
    topWidthIn:5.5,topHeightIn:2.7,postWidthIn:3,takeoffSystem:'timbertech-ire'}),
  withId({id:'tt-statement',label:'Statement Rail · PVC',manufacturer:'TimberTech',family:'pvc',
    geometry:'pvc-statement',summary:'White PVC, narrow 2.75 in graspable top, square or black round infill',
    sourcePage:'https://www.timbertech.com/product/statement-rail/',colors:['white'],
    infills:['square-white','round-black'],
    topWidthIn:2.75,topHeightIn:2.5,postWidthIn:5,takeoffSystem:'standard-unverified'}),
  withId({id:'tt-pinnacle',label:'Pinnacle Rail · PVC',manufacturer:'TimberTech',family:'pvc',
    geometry:'pvc-pinnacle',summary:'Wide flat 3.5 in milled top; square balusters or decorative panels',
    sourcePage:'https://www.timbertech.com/product/pinnacle-rail/',colors:['white'],
    infills:['square-white','chippendale','square-web'],
    topWidthIn:3.5,topHeightIn:2.6,postWidthIn:5,takeoffSystem:'standard-unverified'}),
  withId({id:'tt-reliance',label:'Reliance Rail · Vinyl',manufacturer:'TimberTech',family:'vinyl',
    geometry:'vinyl-reliance',summary:'Core / Contour vinyl railing with hollow square or black metal infill',
    sourcePage:TT_PVC,colors:['matte-white','khaki'],
    infills:['square-white','round-black'],
    topWidthIn:3,topHeightIn:2.2,postWidthIn:5,takeoffSystem:'standard-unverified'}),
  withId({id:'tt-premier',label:'Classic Composite · Premier Rail',manufacturer:'TimberTech',family:'composite',
    geometry:'composite-premier',summary:'Traditional detailed molded top rail with white or dark finishes',
    sourcePage:TT_COMPOSITE,colors:['white','black','matte-white','matte-black','matte-espresso'],
    infills:['square-white','square-black','round-black'],topWidthIn:4.5,topHeightIn:3,postWidthIn:5,
    takeoffSystem:'standard-unverified'}),
  withId({id:'tt-radiance',label:'Classic Composite · RadianceRail',manufacturer:'TimberTech',family:'composite',
    geometry:'composite-radiance',summary:'Curved molded composite top, rich traditional profile',
    sourcePage:TT_COMPOSITE,colors:['white','black','matte-white','matte-black','matte-espresso'],
    infills:['square-white','square-black','round-black'],topWidthIn:3.8,topHeightIn:2.9,postWidthIn:5,
    takeoffSystem:'standard-unverified'}),
  withId({id:'tt-trademark',label:'Classic Composite · Trademark Rail',manufacturer:'TimberTech',family:'composite',
    geometry:'composite-trademark',summary:'Milled rectangular profile in white finishes',
    sourcePage:TT_COMPOSITE,colors:['white','matte-white'],
    infills:['square-white','round-black'],topWidthIn:3.6,topHeightIn:2.8,postWidthIn:5,
    takeoffSystem:'standard-unverified'}),
  withId({id:'tt-composite-drink',label:'Classic Composite · Drink Rail',manufacturer:'TimberTech',family:'composite',
    geometry:'composite-drink',summary:'Deck-board-topped composite railing with 4x4 covered posts',
    sourcePage:TT_COMPOSITE,colors:['white','black','matte-white','matte-black','matte-espresso'],
    infills:['square-white','square-black','round-black'],topWidthIn:5.5,topHeightIn:2.6,postWidthIn:5,
    takeoffSystem:'standard-unverified'}),
  withId({id:'tt-radiance-express',label:'RadianceRail Express · Composite',manufacturer:'TimberTech',family:'composite',
    geometry:'composite-radiance-express',summary:'Simplified composite railing with squared cap detail',
    sourcePage:TT_PVC,colors:['white','black','kona'],infills:['square-white','square-black','round-black'],
    topWidthIn:3.3,topHeightIn:2.8,postWidthIn:5,takeoffSystem:'standard-unverified'}),
  withId({id:'sns-wood-pickets',label:'S&S · Pressure-treated wood pickets',manufacturer:'S&S Design Build',family:'wood',
    geometry:'wood-picket',summary:'PT 4x4 railing posts, wood pickets, 2x cap and rails',
    sourcePage:'',colors:['pressure-treated'],infills:['wood-picket'],topWidthIn:5.5,topHeightIn:1.5,postWidthIn:4,
    takeoffSystem:'standard-unverified'}),
  withId({id:'sns-wood-round',label:'S&S · Wood rail / black round balusters',manufacturer:'S&S Design Build',family:'wood',
    geometry:'wood-round-aluminum',summary:'PT frame with black round aluminum balusters and 2x wood top',
    sourcePage:'',colors:['pressure-treated'],infills:['round-black'],topWidthIn:5.5,topHeightIn:1.5,postWidthIn:4,
    takeoffSystem:'standard-unverified'}),
];
export const getRailVisualProduct=(id:unknown):RailVisualProduct=>
  railVisualProducts.find((product)=>product.id===id)??railVisualProducts[0];

export type CoverFamily='none'|'Moderno'|'Contempo'|'Classico'|'Fresco'|'Aria'|'Solé';
/** Physical aluminum post/beam/gutter/C-channel/downspout coating. */
export type CoverColor='White'|'Bronze'|'Sandstone'|'Black';
/** Only these exterior roof panel factory finishes are offered. */
export type CoverRoofColor='White'|'Silver'|'Sandstone';
/** Interior panel face is independently selectable; wood grains are illustrative until manufacturer swatches are loaded. */
export type CoverCeilingFinish=CoverColor|'Silver'|'Mahogany Wood Grain'|'Hickory Wood Grain';
export const coverFrameColors:readonly CoverColor[]=['White','Bronze','Black','Sandstone'];
export const coverRoofColors:readonly CoverRoofColor[]=['White','Silver','Sandstone'];
export const coverCeilingFinishes:readonly CoverCeilingFinish[]=[
  'White','Bronze','Sandstone','Black','Silver','Mahogany Wood Grain','Hickory Wood Grain',
];
export type CoverGeometry='solid-studio'|'solid-truss-ends'|'full-trusses'|'translucent'|'lattice'|'louvered';
export interface CoverVisualProduct {
  id:CoverFamily;name:string;family:CoverGeometry;description:string;
  colors:readonly CoverColor[];sourcePage:string;
  roofStyles:readonly ('studio'|'gable')[];
  modeledAs:'architectural-concept';
}
export const coverVisualProducts:readonly CoverVisualProduct[]=[
  {id:'none',name:'No patio cover',family:'solid-studio',description:'Uncovered deck',colors:['White'],
    sourcePage:'',roofStyles:['studio'],modeledAs:'architectural-concept'},
  {id:'Moderno',name:'Moderno',family:'solid-studio',
    description:'Sculpted posts/header, wrapped gutter and insulated solid roof',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/models/moderno/',roofStyles:['studio','gable'],modeledAs:'architectural-concept'},
  {id:'Contempo',name:'Contempo',family:'solid-truss-ends',
    description:'Moderno insulated roof with exposed decorative truss ends',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/models/contempo/',roofStyles:['studio','gable'],modeledAs:'architectural-concept'},
  {id:'Classico',name:'Classico',family:'full-trusses',
    description:'Traditional full architectural trusses beneath solid roof panels',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/models/classico/',roofStyles:['studio','gable'],modeledAs:'architectural-concept'},
  {id:'Fresco',name:'Fresco',family:'translucent',
    description:'Pergola-style exposed rafters with infrared-rejecting polycarbonate panels',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/models/fresco/',roofStyles:['studio'],modeledAs:'architectural-concept'},
  {id:'Aria',name:'Aria',family:'lattice',
    description:'Extruded aluminum pergola with adjustable-density shade lattice',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/models/aria/',roofStyles:['studio'],modeledAs:'architectural-concept'},
  {id:'Solé',name:'Solé',family:'louvered',
    description:'Motorized adjustable aluminum louvers',
    colors:['Bronze','Sandstone','White','Black'],
    sourcePage:'https://www.renaissancepatio.com/products/patio-covers/',roofStyles:['studio'],modeledAs:'architectural-concept'},
];
export const getCoverVisualProduct=(id:unknown):CoverVisualProduct=>
  coverVisualProducts.find((item)=>item.id===id)??coverVisualProducts[0];
export const getCoverFinish=(finish:unknown):string=>
  finish==='Bronze'?'#574639':finish==='Sandstone'?'#c7b99e':
  finish==='Black'?'#202225':'#deddd7';

// Appearance swatches are screen approximations; physical sample approval is required.
export const getCoverRoofFinish=(finish:CoverRoofColor|string|undefined):string=>
  finish==='Silver'?'#c6cbd0':finish==='Sandstone'?'#c7b99e':'#f0f1ef';
export const getCoverCeilingFinish=(finish:CoverCeilingFinish|string|undefined):string=>
  finish==='Silver'?'#c8ccd1':
  finish==='Bronze'?'#574639':finish==='Sandstone'?'#c7b99e':
  finish==='Black'?'#202225':
  finish==='Mahogany Wood Grain'?'#78513d':
  finish==='Hickory Wood Grain'?'#b89970':'#f1f1ef';
