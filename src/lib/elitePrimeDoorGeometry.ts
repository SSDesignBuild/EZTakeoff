/** Photo-reference Prime sightlines in feet; these are not factory cut sizes.
 * The frame receives the closed leaf on a separate depth plane. Rails meet
 * the stiles at their inside edges instead of sharing coplanar front faces.
 */
export const ELITE_PRIME_DOOR_HEIGHT_FT=80/12;
export interface EliteDoorBlock {
 position:[number,number,number];
 size:[number,number,number];
}
function member(left:number,right:number,bottom:number,top:number,
 front:number,depth:number):EliteDoorBlock{
 return {position:[(left+right)/2,(bottom+top)/2,front-depth/2],
  size:[right-left,top-bottom,depth]};
}
export function planElitePrimeDoor(width:number,wallDepthFt:number){
 const height=ELITE_PRIME_DOOR_HEIGHT_FT;
 const jamb=.13,leafStile=.30,head=.34,bottomRail=.78;
 const frameDepth=.19,leafDepth=.115;
 const frameFront=wallDepthFt/2+.125/12;
 const leafBack=frameFront+1/16/12;
 const leafFront=leafBack+leafDepth,leafCenterZ=(leafBack+leafFront)/2;
 const leafLeft=jamb+.0125,leafRight=width-jamb-.0125;
 const leafBottom=.12,leafTop=height-.12;
 const glassLeft=leafLeft+leafStile,glassRight=leafRight-leafStile;
 const glassBottom=.12+bottomRail,glassTop=height-head-.12;
 const glassWidth=Math.max(.01,glassRight-glassLeft),glassHeight=glassTop-glassBottom;
 return {
  width,height,jamb,leafStile,leafDepth,leafCenterZ,leafFront,leafBack,
  leafLeft,leafRight,leafBottom,leafTop,frameFront,
  glassWidth,glassHeight,glassBottom,glassTop,glassCenterY:(glassTop+glassBottom)/2,
  leftJamb:member(0,jamb,0,height,frameFront,frameDepth),
  rightJamb:member(width-jamb,width,0,height,frameFront,frameDepth),
  head:member(jamb,width-jamb,height-head,height,frameFront,frameDepth),
  threshold:member(jamb,width-jamb,0,.094,frameFront+.04,.26),
  leftStile:member(leafLeft,glassLeft,leafBottom,leafTop,leafFront,leafDepth),
  rightStile:member(glassRight,leafRight,leafBottom,leafTop,leafFront,leafDepth),
  topRail:member(glassLeft,glassRight,glassTop,leafTop,leafFront,leafDepth),
  bottomRail:member(glassLeft,glassRight,leafBottom,glassBottom,leafFront,leafDepth),
  sillTrim:member(leafLeft,leafRight,.1225,.1975,leafFront+.047,.045),
 };
}
