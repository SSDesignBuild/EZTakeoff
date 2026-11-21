/**
 * Concept routing for A/B-elbow rectangular aluminum downspouts. Both ends
 * of the gutter-to-post offset are supported: an A elbow at the outlet and
 * a B elbow against the face of the closest real cover post. The vertical
 * run uses genuine post coordinates and physical hold-down straps.
 *
 * For an elevated deck, follow the nearest real deck post beneath the
 * elevated fascia; if no deck post exists, do not invent a floating pipe.
 * Final field routing and purchased elbows must be installer-approved.
 */
export type RoutePoint=readonly [number,number,number]; // X/Y/Z feet
export type PostXZ=readonly [number,number];
export interface DownspoutElbow {
  type:'A'|'B';atIndex:number;location:'gutter'|'post'|'deck'|'kickout';
}
export interface DownspoutStrap {
  at:RoutePoint;post:PostXZ;kind:'cover'|'deck';
}
export interface DownspoutLayout {
  points:RoutePoint[];
  elbows:DownspoutElbow[];
  straps:DownspoutStrap[];
  coverPost:PostXZ;
  deckPost:PostXZ|null;
  coverPostPipe:PostXZ;
  lowerPostPipe:PostXZ|null;
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
    !coverPosts.length||outlet[1]<deckHeightFt+1)return null;
  const validCover=coverPosts.filter(finite);
  if(!validCover.length)return null;
  const outletXZ:PostXZ=[outlet[0],outlet[2]];
  const coverPost=validCover.reduce((best,p)=>distance(p,outletXZ)<distance(best,outletXZ)?p:best);
  const elevated=deckHeightFt-ground>1.5;
  const validDeck=deckPosts.filter(finite);
  if(elevated&&!validDeck.length)return null;
  const deckPost=elevated?validDeck.reduce((best,p)=>
    distance(p,coverPost)<distance(best,coverPost)?p:best):null;
  // 2x3 in rectangular pipe is secured directly to the FRONT face of the
  // cover/deck post, not floating diagonally beside both faces.
  const face=(post:PostXZ,width:number):PostXZ=>
    [post[0],post[1]+width/2+1.5/12+.015];
  const coverPostPipe=face(coverPost,input.coverPostWidthFt);
  const lowerPostPipe=deckPost?face(deckPost,input.deckPostWidthFt):null;
  const points:RoutePoint[]=[];
  const elbows:DownspoutElbow[]=[];
  const straps:DownspoutStrap[]=[];
  const push=(p:RoutePoint)=>{points.push(p);return points.length-1;};
  push(outlet);
  // The A elbow turns the short outlet drop to the inclined offset.
  const a=push([outlet[0],outlet[1]-.18,outlet[2]]);
  elbows.push({type:'A',atIndex:a,location:'gutter'});
  const upperPostY=Math.max(deckHeightFt+.75,outlet[1]-.85);
  // B elbow completes the offset; downstream straight is ON the post face.
  const b=push([coverPostPipe[0],upperPostY,coverPostPipe[1]]);
  elbows.push({type:'B',atIndex:b,location:'post'});
  const coverBottomY=elevated?deckHeightFt-.38:ground+.53;
  push([coverPostPipe[0],coverBottomY,coverPostPipe[1]]);
  straps.push({at:[coverPostPipe[0],Math.max(deckHeightFt+.4,(upperPostY+deckHeightFt)/2),
    coverPostPipe[1]],post:coverPost,kind:'cover'});
  // A second cover-post strap for tall patio-cover columns.
  if(upperPostY-deckHeightFt>4)straps.push({at:[coverPostPipe[0],
    deckHeightFt+.7,coverPostPipe[1]],post:coverPost,kind:'cover'});
  let exit=coverPostPipe;
  if(elevated){
    const next=lowerPostPipe!;
    // Under-deck transition is hidden below the rim, supported by post
    // brackets at both ends; never drop vertically in empty space.
    if(distance(coverPostPipe,next)>.025){
      const jogStart=push([coverPostPipe[0],deckHeightFt-.54,coverPostPipe[1]]);
      elbows.push({type:'A',atIndex:jogStart,location:'deck'});
      const jogEnd=push([next[0],deckHeightFt-.76,next[1]]);
      elbows.push({type:'B',atIndex:jogEnd,location:'deck'});
    }
    exit=next;
    push([exit[0],ground+.53,exit[1]]);
    straps.push({at:[exit[0],ground+Math.max(.8,(deckHeightFt-ground)*.65),exit[1]],
      post:deckPost!,kind:'deck'});
    if(deckHeightFt-ground>6)straps.push({at:[exit[0],ground+1,exit[1]],
      post:deckPost!,kind:'deck'});
  }
  // Outward A/B kick at the ground; the pipe does not disappear into decking.
  const kickDirection=input.exitDirection??[0,1];
  if(!finite(kickDirection))return null;
  const d=Math.hypot(kickDirection[0],kickDirection[1]);
  if(d<.001)return null;
  const dir:PostXZ=[kickDirection[0]/d,kickDirection[1]/d];
  const kickIndex=push([exit[0]+dir[0]*.21,ground+.28,exit[1]+dir[1]*.21]);
  elbows.push({type:'B',atIndex:kickIndex,location:'kickout'});
  push([exit[0]+dir[0]*.8,ground+.14,exit[1]+dir[1]*.8]);
  if(points.some(p=>!finite(p)))return null;
  return {points,elbows,straps,coverPost,deckPost,coverPostPipe,lowerPostPipe,elevated};
}
