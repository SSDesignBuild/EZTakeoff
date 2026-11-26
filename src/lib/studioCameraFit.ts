type V3=readonly [number,number,number];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:V3,fallback:V3):V3=>{
  const length=Math.hypot(...v);
  return Number.isFinite(length)&&length>1e-8?[v[0]/length,v[1]/length,v[2]/length]:fallback;
};

/** Fit every corner in both horizontal and vertical perspective, retaining
 * the user's orbit direction. Ground planes and scene lights are excluded by
 * the caller's content bounds. This is view state, never a design revision. */
export function fitStudioCamera(min:V3,max:V3,fromTarget:V3,aspect:number,fovDeg=45,padding=1.12){
  const target:V3=[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2];
  const direction=unit(fromTarget,[.526,.444,.725]);
  const right=unit(cross([0,1,0],direction),[1,0,0]);
  const up=unit(cross(direction,right),[0,0,-1]);
  const vertical=Math.tan(Math.max(10,Math.min(100,fovDeg))*Math.PI/360);
  const horizontal=vertical*Math.max(.1,Number.isFinite(aspect)?aspect:1);
  let distance=1;
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
    const offset:V3=[x-target[0],y-target[1],z-target[2]],depth=dot(offset,direction);
    distance=Math.max(distance,depth+Math.abs(dot(offset,right))/horizontal,
      depth+Math.abs(dot(offset,up))/vertical);
  }
  distance*=Math.max(1,padding);
  const position:V3=[target[0]+direction[0]*distance,target[1]+direction[1]*distance,target[2]+direction[2]*distance];
  return {target,position,distance,direction};
}
