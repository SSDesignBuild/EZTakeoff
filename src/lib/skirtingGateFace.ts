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
  // A short final piece is ripped rather than protruding beyond the leaf.
  for(let n=0;n<250;n++){
    const station=n*pitch;
    if(station>=span-1e-7)break;
    const visibleFace=Math.min(face,span-station);
    if(visibleFace<1e-6)break;
    boards.push({stationFt:station,faceFt:visibleFace,cutLengthFt:cutLength});
  }
  return boards;
}
