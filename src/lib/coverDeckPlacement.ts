import type { DeckPoint } from './types';
export type P2=readonly [number,number];
const distanceToSegment=(p:P2,a:P2,b:P2)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
 const t=len2<1e-10?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
export function postInsideDeck(p:P2,polygon:DeckPoint[],clearanceFt:number):boolean{
 if(polygon.length<3||!p.every(Number.isFinite)||!Number.isFinite(clearanceFt))return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];
  if(distanceToSegment(p,[a.x,a.y],[b.x,b.y])<clearanceFt-1e-6)return false;
  if(((a.y>p[1])!==(b.y>p[1]))&&
    p[0]<(b.x-a.x)*(p[1]-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
/**
 * Safely seat a canopy column footprint INSIDE the actual deck polygon:
 * no hanging post caps or plates off the picture-frame band. Find nearest
 * admissible point along the ideal-to-footprint-center segment (and search
 * the polygon interior if a concave centroid is invalid).
 */
export function seatCanopyPost(desired:P2,polygon:DeckPoint[],postWidthFt:number):P2|null{
 const clearance=postWidthFt/2+.10;
 if(postInsideDeck(desired,polygon,clearance))return desired;
 if(polygon.length<3)return null;
 const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x));
 const minY=Math.min(...polygon.map(p=>p.y)),maxY=Math.max(...polygon.map(p=>p.y));
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const candidates:P2[]=[[cx,cy],...Array.from({length:9*9},(_,i)=>
 [minX+(maxX-minX)*((i%9)+.5)/9,minY+(maxY-minY)*(Math.floor(i/9)+.5)/9] as P2)];
 const anchor=candidates.filter(p=>postInsideDeck(p,polygon,clearance))
  .sort((a,b)=>Math.hypot(a[0]-desired[0],a[1]-desired[1])-
                     Math.hypot(b[0]-desired[0],b[1]-desired[1]))[0];
 if(!anchor)return null;
 let lo=0,hi=1;
 // Binary-search the first safe point on the desired -> anchor ray.
 for(let i=0;i<32;i++){
  const mid=(lo+hi)/2;
  const sample:P2=[desired[0]+(anchor[0]-desired[0])*mid,
                   desired[1]+(anchor[1]-desired[1])*mid];
  if(postInsideDeck(sample,polygon,clearance))hi=mid;else lo=mid;
 }
 const p:P2=[desired[0]+(anchor[0]-desired[0])*hi,
             desired[1]+(anchor[1]-desired[1])*hi];
 return postInsideDeck(p,polygon,clearance-.0001)?p:anchor;
}
