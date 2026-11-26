import { useLayoutEffect,type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitStudioCamera } from '../../lib/studioCameraFit';

type OrbitControl={target:THREE.Vector3;minDistance:number;maxDistance:number;update:()=>void};
export function StudioCameraFit({content,geometryKey,request}:{
  content:RefObject<THREE.Group>;geometryKey:string;request:number;
}){
  const {camera,size,invalidate}=useThree();
  const controls=useThree(state=>state.controls) as unknown as OrbitControl|undefined;
  useLayoutEffect(()=>{
    if(!content.current||!controls||!size.width||!size.height||!(camera instanceof THREE.PerspectiveCamera))return;
    content.current.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(content.current);
    if(bounds.isEmpty())return;
    const offset=camera.position.clone().sub(controls.target);
    const fit=fitStudioCamera(bounds.min.toArray(),bounds.max.toArray(),offset.toArray(),size.width/size.height,camera.fov);
    controls.target.set(...fit.target);
    camera.position.set(...fit.position);
    controls.maxDistance=Math.max(controls.maxDistance,fit.distance*4);
    controls.minDistance=Math.min(controls.minDistance,Math.max(1,fit.distance*.12));
    camera.far=Math.max(900,fit.distance*6);camera.updateProjectionMatrix();
    controls.update();invalidate();
  },[camera,controls,content,geometryKey,request,size.width,size.height,invalidate]);
  return null;
}
