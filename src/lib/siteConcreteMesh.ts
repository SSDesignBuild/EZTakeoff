import * as THREE from 'three';
import type { SiteConcreteArea } from './siteConcrete';

/** Slab sides and underside only. The separately partitioned finishes own the top. */
export function siteConcreteBodyGeometry(area:SiteConcreteArea,center:readonly [number,number]){
  const shape=new THREE.Shape();
  area.points.forEach((point,index)=>{
    const x=point.x-center[0],y=-(point.y-center[1]);
    if(index===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  });
  shape.closePath();
  const extrusion=new THREE.ExtrudeGeometry(shape,{
    depth:area.thicknessIn/12,steps:1,bevelEnabled:false,curveSegments:1,
  });
  extrusion.rotateX(-Math.PI/2);
  const position=extrusion.getAttribute('position'),normal=extrusion.getAttribute('normal');
  const uv=extrusion.getAttribute('uv');
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(let start=0;start<position.count;start+=3){
    // ExtrudeGeometry is non-indexed; discard the upward cap instead of placing
    // another nearly coplanar surface over it. This is stable at every zoom.
    if(normal.getY(start)>.99&&normal.getY(start+1)>.99&&normal.getY(start+2)>.99)continue;
    for(let i=start;i<start+3;i++){
      positions.push(position.getX(i),position.getY(i),position.getZ(i));
      normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));
      uvs.push(uv.getX(i),uv.getY(i));
    }
  }
  extrusion.dispose();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return geometry;
}
