/**
 * Manufacturer-source coordinated Renaissance connection geometry.
 *
 * 2025 Aria/Fresco sheets (pp 1-2): Raised and Flush Truss are different
 * attachment details. The same 6-in-high truss sits ON TOP of the main
 * header in raised mode; flush mode aligns the truss crown with header crown.
 *
 * Post/beam sheets show SD & HD 3.875in posts and 7 x 2.75in beams; the
 * beam clips attach to the post SIDES, rather than stacking the beam on
 * top of a cut-short post.
 * This is a visual connection model, NOT a connection/fastener schedule.
 */
export type RenaissanceTrussMount='raised'|'flush';
export const RENAISSANCE_TRUSS_VERTICAL_ENVELOPE_FT=6/12;
export function trussMountLiftFt(family:string,mount:RenaissanceTrussMount|undefined):number{
 return ['Aria','Fresco'].includes(family)&&mount==='raised'
   ?RENAISSANCE_TRUSS_VERTICAL_ENVELOPE_FT:0;
}
export interface HeaderInterval {startFt:number;endFt:number;}
/**
 * Split the decorative beam into true end-to-post-face and between-post
 * lengths. At no point does it pass through a hollow vertical column.
 */
export function planSideConnectedHeader(
 fromFt:number,toFt:number,postXs:readonly number[],postOutsideFt:number,
):HeaderInterval[]{
 if(!Number.isFinite(fromFt)||!Number.isFinite(toFt)||
   !Number.isFinite(postOutsideFt)||postOutsideFt<=0||fromFt>=toFt)return [];
 const radius=postOutsideFt/2;
 let cursor=fromFt;
 const spans:HeaderInterval[]=[];
 for(const x of [...new Set(postXs)].filter(x=>Number.isFinite(x)).sort((a,b)=>a-b)){
  if(x+radius<=fromFt||x-radius>=toFt)continue;
  const endpoint=Math.min(toFt,Math.max(fromFt,x-radius));
  if(endpoint-cursor>.005)spans.push({startFt:cursor,endFt:endpoint});
  cursor=Math.max(cursor,Math.min(toFt,x+radius));
 }
 if(toFt-cursor>.005)spans.push({startFt:cursor,endFt:toFt});
 return spans;
}
