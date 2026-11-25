import {useEffect,useMemo,useState} from 'react';
import * as THREE from 'three';
import {getDeckVisualProduct} from '../../data/visualCatalog';
import type {DrinkRailPiece} from '../../lib/railingLayout';

function useDrinkBoardTexture(material:string){
 const sample=getDeckVisualProduct(material);
 const [texture,setTexture]=useState<THREE.Texture|null>(null);
 useEffect(()=>{
  setTexture(null);if(!sample)return;
  let alive=true,map:THREE.Texture|null=null;
  const image=new Image();
  const deadline=setTimeout(()=>{image.onload=null;image.onerror=null;image.removeAttribute('src');},8500);
  image.onload=()=>{
   if(!alive)return;clearTimeout(deadline);
   map=new THREE.Texture(image);map.colorSpace=THREE.SRGBColorSpace;
   map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;map.needsUpdate=true;
   setTexture(map);
  };
  image.onerror=()=>{clearTimeout(deadline);};image.src=sample.swatch;
  return ()=>{alive=false;clearTimeout(deadline);image.onload=image.onerror=null;image.removeAttribute('src');map?.dispose();};
 },[sample?.swatch]);
 return texture;
}
/** Six physical cut faces, including corner miters and plumb pitch joints. */
function Board({piece,texture}:{piece:DrinkRailPiece;texture:THREE.Texture|null}){
 const geometry=useMemo(()=>{
  const top=piece.corners,bottom=top.map(p=>[p[0],p[1]-.093,p[2]]);
  const vertices=[...top,...bottom];
  const faces=[[0,1,2,3],[7,6,5,4],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
  const positions:number[]=[],uv:number[]=[];
  const start=top[0],end=top[1],length=Math.hypot(end[0]-start[0],end[2]-start[2]);
  const ux=(end[0]-start[0])/Math.max(.001,length),uz=(end[2]-start[2])/Math.max(.001,length);
  const g=new THREE.BufferGeometry();
  faces.forEach((face,index)=>{
   const offset=positions.length/3;
   for(const local of [0,1,2,0,2,3]){
    const p=vertices[face[local]];positions.push(...p);
    const u=((p[0]-start[0])*ux+(p[2]-start[2])*uz)/8;
    const v=index<2?((p[0]-start[0])*-uz+(p[2]-start[2])*ux)/(5.5/12):(local<2?0:1);
    uv.push(u,v);
   }
   g.addGroup(offset,6,index===0?0:1);
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  return g;
 },[piece]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh name={'mitered-continuous-drink-board-'+piece.id} geometry={geometry} castShadow receiveShadow>
  {texture?<meshBasicMaterial attach="material-0" map={texture} color="#ffffff" toneMapped={false} side={THREE.DoubleSide}/>
   :<meshStandardMaterial attach="material-0" color="#b3aaa0" roughness={.8} side={THREE.DoubleSide}/>}
  <meshStandardMaterial key={texture?.uuid??'untextured-edge'} attach="material-1" color={texture?'#ffffff':'#9b8f80'} map={texture} roughness={.8} side={THREE.DoubleSide}/>
 </mesh>;
}
export function DrinkRailBoards3D({pieces,material}:{pieces:DrinkRailPiece[];material:string}){
 const texture=useDrinkBoardTexture(material);
 return <group name="selected-manufacturer-drink-boards-over-posts">
  {pieces.map(piece=><Board key={piece.id} piece={piece} texture={texture}/>)}
 </group>;
}
