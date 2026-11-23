/** Deterministic leaf/infill board layout shared by skirting stock cuts and 3D.
 * Face size and reveal are physical dimensions. This is a finish-only layout;
 * framing and hinge clearances remain in buildDeckSkirting.
 */
export type GateFaceOrientation='vertical'|'horizontal';
export type GateFaceBoard={stationFt:number;faceFt:number;cutLengthFt:number};
export function planSkirtingGateFace(
  widthFt:number,heightFt:number,orientation:GateFaceOrientation,faceIn:number,gapIn:number
):GateFaceBoard[]{
  if(![widthFt,heightFt,faceIn,gapIn].every(Number.isFinite)||
     widthFt<=0||heightFt<=0||faceIn<=0||gapIn<0)return [];
  const face=faceIn/12,gap=gapIn/12,pitch=face+gap;
  const span=orientation==='vertical'?widthFt:heightFt;
  const cutLength=orientation==='vertical'?heightFt:widthFt;
  const boards:GateFaceBoard[]=[];
  const count=Math.min(250,Math.max(1,Math.ceil((span+gap)/pitch)));
  // Distribute trim evenly: don't put an ugly <1-in sliver at one edge.
  // When a partial course is needed, split its rip across BOTH end boards.
  const endFace=count===1?span:
    Math.max(0,(span-(count-1)*gap-(count-2)*face)/2);
  let station=0;
  for(let i=0;i<count;i++){
    const visibleFace=count===1?span:
      i===0||i===count-1?endFace:face;
    if(visibleFace<1e-6)continue;
    boards.push({stationFt:station,faceFt:visibleFace,cutLengthFt:cutLength});
    station+=visibleFace+gap;
  }
  return boards;
}
