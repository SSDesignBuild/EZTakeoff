import {
  inchToFoot,RENAISSANCE_ARCHITECTURAL_GUTTER,
} from './renaissanceManufacturer';

export type Point2D=readonly [number,number];
export interface GutterRun {
  id:'left'|'front'|'right';
  start:Point2D;end:Point2D;
  startTopFt:number;endTopFt:number;
  miterStart:boolean;miterEnd:boolean;
}
const valid=(n:number)=>Number.isFinite(n);
/**
 * L → front → R connected drainage route along the THREE exposed roof edges.
 * For attached canopies the rear is a C-channel / house junction, not a gutter.
 * At studios, left/right returns follow the real front-to-back roof grade.
 */
export function planWrapAroundGutter(input:{
  leftFt:number;rightFt:number;rearFt:number;frontFt:number;
  rearTopFt:number;frontTopFt:number;
}):GutterRun[]{
  const {leftFt,rightFt,rearFt,frontFt,rearTopFt,frontTopFt}=input;
  if(![leftFt,rightFt,rearFt,frontFt,rearTopFt,frontTopFt].every(valid)||
    leftFt>=rightFt||rearFt>=frontFt)return [];
  return [
    {id:'left',start:[leftFt,rearFt],end:[leftFt,frontFt],
      startTopFt:rearTopFt,endTopFt:frontTopFt,miterStart:false,miterEnd:true},
    {id:'front',start:[leftFt,frontFt],end:[rightFt,frontFt],
      startTopFt:frontTopFt,endTopFt:frontTopFt,miterStart:true,miterEnd:true},
    {id:'right',start:[rightFt,frontFt],end:[rightFt,rearFt],
      startTopFt:frontTopFt,endTopFt:rearTopFt,miterStart:true,miterEnd:false},
  ];
}
/**
 * 6.5 x 3-9/16 x .065in visible architectural gutter profile.
 * Exterior (roof-outward) is NEGATIVE local X; inner wall is at X=0.
 * Polygon reproduces the angled/sloped outward fascia in the actual drawing.
 */
export function architecturalGutterOutlineFt():Array<[number,number]>{
  const w=inchToFoot(RENAISSANCE_ARCHITECTURAL_GUTTER.outsideWidthIn);
  const h=inchToFoot(RENAISSANCE_ARCHITECTURAL_GUTTER.outsideHeightIn);
  const t=inchToFoot(RENAISSANCE_ARCHITECTURAL_GUTTER.wallIn);
  return [[0,0],[0,-h],[-w*.56,-h],[-w,0],[-w+t,0],
    [-w*.56+t,-h+t],[-t,-h+t],[-t,0]];
}
/** 45-degree corner join shift, based on a point's roof-outward offset. */
export function miterAlongFt(outwardXFt:number,atStart:boolean,atEnd:boolean,run:GutterRun):number{
  return (atStart&&run.miterStart)?outwardXFt:
    (atEnd&&run.miterEnd)?-outwardXFt:0;
}
