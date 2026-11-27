import type { DeckPoint } from './types';
import { getCoverVisualProduct, getRailVisualProduct, getDeckVisualProduct } from '../data/visualCatalog';
export { surfaceStrips, breakerVisualStrips, VISIBLE_BOARD_WIDTH_FT, VISIBLE_BOARD_GAP_FT } from './deckSurfaceLayout';
export type { SurfaceStrip, BreakerVisualStrip } from './deckSurfaceLayout';

export interface VisualPartSummary {
  roof:'none'|'opaque'|'transparent'|'lattice'|'louvers';
  exposedTrusses:boolean;decorativeEnds:boolean;gutters:boolean;
  rails:'manufacturer-family'|'unverified'|'none';
  texture:'verified-photo'|'unavailable';
}
export function visualPartSummary(values:Record<string,string|number|boolean>,coverFamily:string):VisualPartSummary{
  const cover=getCoverVisualProduct(coverFamily);
  const selectedRail=getRailVisualProduct(values.railingVisualId);
  const roof=coverFamily==='none'?'none':cover.family==='translucent'?'transparent':
    cover.family==='lattice'?'lattice':cover.family==='louvered'?'louvers':'opaque';
  return {roof,
    exposedTrusses:cover.family==='full-trusses',
    decorativeEnds:cover.family==='solid-truss-ends'||cover.family==='full-trusses',
    gutters:coverFamily!=='none'&&['solid-studio','solid-truss-ends','full-trusses'].includes(cover.family),
    rails:selectedRail.takeoffSystem==='timbertech-ire'?'manufacturer-family':'unverified',
    texture:getDeckVisualProduct(values.deckingMaterial)?'verified-photo':'unavailable'};
}
export function offsetPoint(points:DeckPoint[],dx:number,dy:number):DeckPoint[]{
  return points.map((point)=>({x:point.x+dx,y:point.y+dy}));
}
