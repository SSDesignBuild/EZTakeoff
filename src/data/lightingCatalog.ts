import lightingPhotos from './timbertechLightingAssets.json';

/** Manufacturer facts checked against TimberTech's current product pages and
 * linked installation guides on 2026-11-25. IDs below are application IDs,
 * not invented orderable SKUs. Unpublished dimensions/wattages stay absent. */
export type LightingCategory='post'|'post-cap'|'stair'|'deck';
export type AddonCategory=LightingCategory|'fan'|'can-light';
export interface LightingProduct {
  id:string;category:LightingCategory;label:string;manufacturer:'TimberTech';
  sourceUrl:string;guideUrl:string;compatibility:string;
  /** Overall published width, height, depth; inches. */
  dimensionsIn?:readonly [number,number,number];
  projectionIn?:number;
  recessDepthIn?:number;
  geometryFidelity:'published-envelope'|'mounting-symbol';
  finishes:readonly string[];
  imageUrl?:string;
}
export const TIMBERTECH_LIGHTING_GUIDES={
  composite:'https://assets.timbertech.com/content/dam/wp-content/TimberTech-Composite-Railing-Lighting-Installation-Guide.pdf',
  metal:'https://assets.timbertech.com/content/dam/wp-content/TimberTech-Metal-Railing-Lighting-Installation-Guide.pdf',
} as const;
export const GENERIC_FAN_PLACEMENT_REFERENCE='https://www.energystar.gov/products/ceiling_fans/ceiling_fan_basics';
const page=(slug:string)=>'https://www.timbertech.com/product/'+slug+'/';
const products:LightingProduct[]=[
  {id:'tt-small-accent',category:'post',label:'TimberTech Small Accent Light',manufacturer:'TimberTech',
    sourceUrl:page('small-accent-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.metal,
    compatibility:'Impression Rail Express posts',dimensionsIn:[1.625,4.25,.75],
    geometryFidelity:'published-envelope',finishes:['black','white','dark-bronze']},
  {id:'tt-reversible-accent',category:'post',label:'TimberTech Reversible LED Accent Light',manufacturer:'TimberTech',
    sourceUrl:page('reversible-led-accent-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    compatibility:'Classic Composite; Impression Rail Express in Matte White or Matte Black',
    dimensionsIn:[2.5,3.125,1.75],geometryFidelity:'published-envelope',
    finishes:['matte-white','matte-black','matte-espresso']},
  {id:'tt-accent',category:'post',label:'TimberTech Accent Light',manufacturer:'TimberTech',
    sourceUrl:page('accent-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    compatibility:'TimberTech composite and PVC posts; see the TimberTech lighting overview',
    dimensionsIn:[2.75,5,2.5],geometryFidelity:'published-envelope',
    finishes:['white','matte-white','architectural-bronze']},
  {id:'tt-ire-post-cap',category:'post-cap',label:'TimberTech 3″ IRE Post Cap Light',manufacturer:'TimberTech',
    sourceUrl:page('irx-post-cap-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.metal,
    compatibility:'3″ Impression Rail Express post and cap; exposed post tops only',
    dimensionsIn:[3.25,2.5,3.25],geometryFidelity:'published-envelope',finishes:['match-cap']},
  {id:'tt-lantern',category:'post-cap',label:'TimberTech LED Lantern Post Cap Light',manufacturer:'TimberTech',
    sourceUrl:page('led-lantern-post-cap-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    compatibility:'3″ Impression Rail Express except horizontal cable posts; Classic Composite 4″, 5″ or 5½″ sleeves',
    // The page publishes post FIT sizes, not the fixture housing height.
    // The renderer uses an explicit mounting symbol rather than asserting
    // a fabricated factory housing dimension.
    geometryFidelity:'mounting-symbol',
    finishes:['white','black','dark-bronze','matte-white','matte-black','matte-espresso']},
  {id:'tt-riser',category:'stair',label:'TimberTech Riser Light',manufacturer:'TimberTech',
    sourceUrl:page('riser-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    compatibility:'Closed composite/PVC stair risers',dimensionsIn:[6,3.125,1],
    projectionIn:.5,geometryFidelity:'published-envelope',finishes:['white','architectural-bronze']},
  {id:'tt-recessed-riser',category:'stair',label:'TimberTech Recessed LED Riser Light',manufacturer:'TimberTech',
    sourceUrl:page('recessed-led-riser-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    // The published 1/2-inch depth is INSIDE the riser; add the published
    // 3/16-inch face projection for the full physical housing envelope.
    compatibility:'Closed composite/PVC stair risers',dimensionsIn:[5.75,2.75,.5+.1875],
    recessDepthIn:.5,projectionIn:.1875,geometryFidelity:'published-envelope',
    finishes:['matte-white','matte-black','matte-espresso']},
  {id:'tt-in-deck',category:'deck',label:'TimberTech In-Deck Light',manufacturer:'TimberTech',
    sourceUrl:page('in-deck-light'),guideUrl:TIMBERTECH_LIGHTING_GUIDES.composite,
    compatibility:'TimberTech deck boards; low-traffic plank centerline with access beneath',
    dimensionsIn:[1.75,1.125,1.25],geometryFidelity:'published-envelope',finishes:['architectural-bronze']},
];
export const lightingProducts:readonly LightingProduct[]=products.map(product=>({
  ...product,imageUrl:lightingPhotos.find(photo=>photo.id===product.id)?.swatch,
}));
export function getLightingProduct(id:unknown):LightingProduct|null {
  return lightingProducts.find(product=>product.id===id)??null;
}
