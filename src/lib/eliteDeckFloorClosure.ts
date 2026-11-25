import type {DeckModel} from './deckModel';
import type {RenaissanceWallMeasure} from './renaissanceCoverWallLayout';
import {stockBoardSegments,FINISH_KERF_IN,FINISH_TRIM_IN} from './finishStockGeometry';
import {DECK_BOARD_FACE_FT,DECK_GAP_FT} from './deckModel';

export interface EliteDeckClosurePiece{
 wallId:RenaissanceWallMeasure['id'];
 from:[number,number];to:[number,number];
 lengthFt:number;widthFt:number;stockRunIndex:number;
}
export interface EliteDeckClosureStock{
 stockLengthFt:number;quantity:number;
}
export interface EliteDeckClosurePlan{
 pieces:EliteDeckClosurePiece[];
 totalLinearFt:number;stock:EliteDeckClosureStock[];
 notes:string[];
}
/**
 * A real full-size matching deck scribe/transition board terminates the
 * plank field CLEANLY at the inside face of each glass/sunroom wall.
 * The previous renderer exposed bare dark substrate between the last
 * visible deck row and Elite's base channel on a user-supplied scene.
 *
 * This additional finish course is counted in the Sales estimating handoff,
 * not silently painted onto existing cut stock. It runs along the wall,
 * inside the 2/3in Elite base channel with a 1/8in expansion joint, and
 * is split into obtainable decking stock (PVC/composite ONLY 16/20ft).
 * For rows that share an existing field/picture frame, the supplier may
 * reuse field offcuts after field confirmation; we conservatively count
 * a physical scribe board and flag support/fit validation.
 */
export function planEliteDeckFloorClosure(
 model:Pick<DeckModel,'points'|'minX'|'maxX'|'minY'|'maxY'>,
 walls:readonly RenaissanceWallMeasure[],
 system:'3-thermal'|'2-nonthermal',
 deckingType:unknown,
):EliteDeckClosurePlan{
 const material=String(deckingType??'composite');
 const stocks=material==='pressure-treated'?[8,12,16,20]:[16,20];
 const center:[number,number]=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
 const wallHalfDepthFt=(system==='3-thermal'?3:2)/24;
 const nearOffset=wallHalfDepthFt+DECK_GAP_FT+DECK_BOARD_FACE_FT/2;
 const pieces:EliteDeckClosurePiece[]=[];
 for(const wall of walls){
  const dx=wall.to[0]-wall.from[0],dz=wall.to[1]-wall.from[1];
  const lengthFt=Math.hypot(dx,dz);
  if(lengthFt<.25)continue;
  const midpoint:[number,number]=[(wall.to[0]+wall.from[0])/2,
    (wall.to[1]+wall.from[1])/2];
  // Into the deck footprint, never outside the fascia.
  const toward:[number,number]=[center[0]-midpoint[0],center[1]-midpoint[1]];
  const dotLen=Math.hypot(toward[0],toward[1]);
  if(dotLen<.02)continue;
  const nx=toward[0]/dotLen,nz=toward[1]/dotLen;
  const cuts=stockBoardSegments(lengthFt);
  let distance=0;
  cuts.forEach((cut,i)=>{
   const seam=i<cuts.length-1?DECK_GAP_FT/2:0;
   const front=i>0?DECK_GAP_FT/2:0;
   const begin=Math.max(0,distance+front),end=Math.min(lengthFt,distance+cut-seam);
   distance+=cut;
   if(end-begin<=.05)return;
   const p=(station:number):[number,number]=>[
     wall.from[0]+dx*station/lengthFt+nx*nearOffset,
     wall.from[1]+dz*station/lengthFt+nz*nearOffset,
   ];
   pieces.push({wallId:wall.id,from:p(begin),to:p(end),
     lengthFt:end-begin,widthFt:DECK_BOARD_FACE_FT,stockRunIndex:i});
  });
 }
 // Calculate physical stock from one genuine cut list, allowing offcuts to
 // be shared between wall sides (not one new 16ft board per 3ft section).
 const cuts=pieces.map(p=>p.lengthFt).sort((a,b)=>b-a);
 const bins:{length:number;remaining:number}[]=[];
 for(const cut of cuts){
  const required=cut+(FINISH_KERF_IN+FINISH_TRIM_IN)/12;
  const match=bins.filter(b=>b.remaining>=required-.0001)
    .sort((a,b)=>a.remaining-b.remaining)[0];
  if(match){match.remaining-=required;continue;}
  const stock=stocks.find(len=>len>=required-.0001);
  if(stock){bins.push({length:stock,remaining:stock-required});continue;}
  // The approved stock cutter guards this invariant; keep a visible
  // review warning rather than invent a 24/25ft composite board.
  return {pieces,totalLinearFt:pieces.reduce((n,p)=>n+p.lengthFt,0),
   stock:[],notes:['One or more sunroom floor closure cuts exceed purchasable board lengths; revise and support the joint before ordering.']};
 }
 const quantities=new Map<number,number>();
 for(const bin of bins)quantities.set(bin.length,(quantities.get(bin.length)??0)+1);
 return {pieces,totalLinearFt:pieces.reduce((n,p)=>n+p.lengthFt,0),
  stock:[...quantities].sort((a,b)=>a[0]-b[0])
   .map(([stockLengthFt,quantity])=>({stockLengthFt,quantity})),
  notes:pieces.length?[
   'Interior Elite glass-wall deck closure uses a continuous matching 5.5-in finish board beside the wall base with 1/8-in expansion spacing.',
   'Field-verify finished-wall position, threshold/door clearance and blocking beneath the cut ends. Reuse suitable picture-frame or field offcuts where supported.',
  ]:[]};
}
