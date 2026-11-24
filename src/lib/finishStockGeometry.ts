/**
 * Shared stock-aware finish-run segmentation for decking, picture frames,
 * breaker strips and supported horizontal skirting.
 *
 * A physical seam is NOT a purchasable 25-ft board. Stock cutting must reserve
 * kerf and end trim, and visible seams must coincide with a supported station.
 */
export const FINISH_KERF_IN=0.125;
export const FINISH_TRIM_IN=0.25;
export const FINISH_SEAM_GAP_FT=0.125/12;
/** Keep 0.12 in beyond the normal trim/kerf to avoid borderline rounded cuts. */
export const MAX_FINISH_CUT_FT=20-(FINISH_KERF_IN+FINISH_TRIM_IN+.12)/12;
const r3=(n:number)=>Math.round(n*1000)/1000;
const eps=1e-6;

/**
 * For deck board rows, split at deliberately planned seams, never ask a
 * supplier for a non-existent stock length. Prefer whole-foot stations,
 * corresponding to S&S 12-in O.C. joists, where physical supports permit.
 * For nonstandard geometry any seam still needs field-confirmed backing.
 */
export function stockBoardSegments(totalLength:number,breaks:number[]=[],maxCutFt=MAX_FINISH_CUT_FT):number[]{
 if(!Number.isFinite(totalLength)||totalLength<=0||
   !Number.isFinite(maxCutFt)||maxCutFt<=.5)return [];
 const stations=[0,...[...new Set(breaks)].filter(s=>Number.isFinite(s)&&s>.05&&s<totalLength-.05)
   .sort((a,b)=>a-b),totalLength];
 const pieces:number[]=[];
 for(let interval=1;interval<stations.length;interval++){
  const start=stations[interval-1],end=stations[interval],run=end-start;
  if(run<=.05)continue;
  if(run<=maxCutFt+eps){pieces.push(run);continue;}
  const quantity=Math.ceil(run/maxCutFt);
  let previous=0;
  for(let index=1;index<quantity;index++){
   const target=run*index/quantity;
   const fullFoot=Math.round(target);
   const candidate=fullFoot>previous+.25&&fullFoot-previous<=maxCutFt+eps &&
     run-fullFoot<=(quantity-index)*maxCutFt+eps ?fullFoot:target;
   pieces.push(candidate-previous);
   previous=candidate;
  }
  pieces.push(run-previous);
 }
 return pieces.filter(p=>p>.05);
}

export interface SupportedFinishPiece {
 start:number;end:number;
 /** Where this piece ends at a backing support for the next joined piece. */
 jointAtFt?:number;
}
export interface SupportedFinishPlan {pieces:SupportedFinishPiece[];issues:string[];}
/**
 * Horizontal skirting finish joints MUST land on an actual 2x4 upright.
 * Candidate joint count increases when the evenly-spaced minimum cannot fit
 * within stock after trim and kerf; do not invent an unsupported floating seam.
 */
export function supportedFinishCoursePieces(
 startFt:number,endFt:number,supports:number[],
 maxCutFt=MAX_FINISH_CUT_FT,seamGapFt=FINISH_SEAM_GAP_FT,
):SupportedFinishPlan{
 if(![startFt,endFt,maxCutFt,seamGapFt].every(Number.isFinite)||
   endFt<=startFt||maxCutFt<=.5||seamGapFt<0)
  return {pieces:[],issues:['Invalid horizontal finish run geometry']};
 const length=endFt-startFt;
 if(length<=maxCutFt+eps)return {pieces:[{start:r3(startFt),end:r3(endFt)}],issues:[]};
 const backing=[...new Set(supports.map(r3))]
  .filter(n=>n>startFt+.3&&n<endFt-.3).sort((a,b)=>a-b);
 // A run can need additional board sections if supports are too far apart
 // to place a seam where the minimum cut-count would otherwise want it.
 const minCount=Math.ceil(length/maxCutFt);
 for(let count=minCount;count<=Math.min(50,minCount+backing.length);count++){
  const joints:number[]=[];
  let cursor=startFt,valid=true;
  for(let k=1;k<count;k++){
   const ideal=startFt+length*k/count;
   const remaining=count-k;
   const options=backing.filter(p=>p>cursor+.3&&
     p-cursor<=maxCutFt+eps&&endFt-p<=remaining*maxCutFt+eps&&
     !joints.some(prev=>Math.abs(prev-p)<.1))
     .sort((a,b)=>Math.abs(a-ideal)-Math.abs(b-ideal)||a-b);
   const chosen=options[0];
   if(chosen===undefined){valid=false;break;}
   joints.push(chosen);cursor=chosen;
  }
  if(!valid||endFt-cursor>maxCutFt+eps)continue;
  const points=[startFt,...joints,endFt];
  const pieces=points.slice(1).map((boundary,i)=>{
   const begin=points[i]+(i>0?seamGapFt/2:0);
   const finish=boundary-(i<points.length-2?seamGapFt/2:0);
   return {start:r3(begin),end:r3(finish),
     ...(i<points.length-2?{jointAtFt:r3(boundary)}:{})};
  });
  if(pieces.every(p=>p.end-p.start>.2&&p.end-p.start<=maxCutFt+eps))
   return {pieces,issues:[]};
 }
 return {pieces:[],issues:[
  'No 2x4 backing station can support a finish-board joint for '+r3(length)+
  ' ft run. Add a framing support or revise the joint layout before ordering.',
 ]};
}
