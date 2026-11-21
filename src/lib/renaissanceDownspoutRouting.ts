/**
 * Downspout routing is a visualization layout, not a manufactured elbow BOM.
 * Above-deck pipe bends toward the closest actual cover post. On an elevated
 * deck it continues below the fascia and returns to the nearest DECK post,
 * ending in an outward kick at grade. Installers approve real outlet sites.
 */
export type RoutePoint=readonly [number,number,number]; // X/Y/Z, feet
export type PostXZ=readonly [number,number];
export interface DownspoutLayout {
  points:RoutePoint[];
  coverPost:PostXZ;
  deckPost:PostXZ|null;
  coverPostPipe:PostXZ;
  lowerPostPipe:PostXZ|null;
  straps:RoutePoint[];
  elevated:boolean;
}
const finite=(p:readonly number[])=>p.every(Number.isFinite);
const distance=(a:PostXZ,b:PostXZ)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function planRenaissanceDownspout(input:{
  outlet:RoutePoint;
  coverPosts:PostXZ[];deckPosts:PostXZ[];
  coverPostWidthFt:number;deckPostWidthFt:number;
  deckHeightFt:number;groundFt?:number;exitDirection?:PostXZ;
}):DownspoutLayout|null{
  const {outlet,coverPosts,deckPosts,deckHeightFt}=input;
  const ground=input.groundFt??0;
  if(!finite(outlet)||!Number.isFinite(deckHeightFt)||!Number.isFinite(ground)||
    !Number.isFinite(input.coverPostWidthFt)||input.coverPostWidthFt<=0||
    !Number.isFinite(input.deckPostWidthFt)||input.deckPostWidthFt<=0||
    coverPosts.length<1||outlet[1]<deckHeightFt+.8)return null;
  const validCover=coverPosts.filter(finite);
  if(!validCover.length)return null;
  const outletXZ:PostXZ=[outlet[0],outlet[2]];
  const coverPost=validCover.reduce((best,p)=>distance(p,outletXZ)<distance(best,outletXZ)?p:best);
  const elevated=deckHeightFt-ground>1.5;
  const validDeck=deckPosts.filter(finite);
  const deckPost=elevated&&validDeck.length?
    validDeck.reduce((best,p)=>distance(p,coverPost)<distance(best,coverPost)?p:best):null;
  const downspoutHalfFt=1.5/12;
  const faceOffset=(width:number)=>width/2+downspoutHalfFt+.025;
  const signX=outlet[0]>=coverPost[0]?1:-1;
  const signZ=outlet[2]>=coverPost[1]?1:-1;
  const coverPostPipe:PostXZ=[
    coverPost[0]+signX*faceOffset(input.coverPostWidthFt),
    coverPost[1]+signZ*faceOffset(input.coverPostWidthFt),
  ];
  const lowerPostPipe:PostXZ|null=deckPost?[
    deckPost[0]+signX*faceOffset(input.deckPostWidthFt),
    deckPost[1]+signZ*faceOffset(input.deckPostWidthFt),
  ]:null;
  const postY=Math.max(deckHeightFt+.20,outlet[1]-.72);
  const points:RoutePoint[]=[
    outlet,
    [outlet[0],outlet[1]-.16,outlet[2]],
    [(outlet[0]+coverPostPipe[0])/2,outlet[1]-.35,
      (outlet[2]+coverPostPipe[1])/2],
    [coverPostPipe[0],postY,coverPostPipe[1]],
    [coverPostPipe[0],deckHeightFt+.10,coverPostPipe[1]],
  ];
  let drop=coverPostPipe;
  if(elevated){
    // Keep the under-deck transition beneath the picture-frame/fascia level.
    points.push([coverPostPipe[0],deckHeightFt-.40,coverPostPipe[1]]);
    if(lowerPostPipe&&distance(lowerPostPipe,coverPostPipe)>.04){
      const y=Math.max(ground+.8,deckHeightFt-.70);
      points.push([lowerPostPipe[0],y,lowerPostPipe[1]]);
      drop=lowerPostPipe;
    }
  }
  const finishY=ground+.40;
  points.push([drop[0],finishY,drop[1]]);
  const direction=input.exitDirection??[0,1];
  const length=Math.max(.001,Math.hypot(...direction));
  const sx=direction[0]/length,sz=direction[1]/length;
  points.push([drop[0]+sx*.30,ground+.28,drop[1]+sz*.30]);
  points.push([drop[0]+sx*.80,ground+.14,drop[1]+sz*.80]);
  const strapUpperY=deckHeightFt+Math.max(.5,(outlet[1]-deckHeightFt)*.48);
  const straps:RoutePoint[]=[[coverPostPipe[0],strapUpperY,coverPostPipe[1]]];
  if(elevated)straps.push([drop[0],ground+Math.max(.8,(deckHeightFt-ground)*.42),drop[1]]);
  return {points,coverPost,deckPost,coverPostPipe,lowerPostPipe,straps,elevated};
}
