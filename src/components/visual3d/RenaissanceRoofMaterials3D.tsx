import * as THREE from 'three';
import {
  getCoverRoofFinish,getCoverCeilingFinish,
  type CoverRoofColor,type CoverCeilingFinish,
} from '../../data/visualCatalog';

const grains=new Map<string,THREE.CanvasTexture>();
/**
 * A deterministic, tileable wood-grain concept texture. NOT a vendor swatch.
 * Only the underside receives it; roof exterior and panel side skins stay
 * independent. Replace with a rights-cleared manufacturer sample when available.
 */
function illustrativeWoodTexture(finish:CoverCeilingFinish):THREE.CanvasTexture|null{
  if(finish!=='Mahogany Wood Grain'&&finish!=='Hickory Wood Grain')return null;
  if(typeof document==='undefined')return null;
  const existing=grains.get(finish);
  if(existing)return existing;
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=512;
  const context=canvas.getContext('2d');
  if(!context)return null;
  const img=context.createImageData(canvas.width,canvas.height);
  const dark=finish==='Mahogany Wood Grain';
  const base=dark?[115,67,47]:[189,153,105];
  for(let y=0;y<512;y++){
    const bend=11*Math.sin(y*.016)+3*Math.sin(y*.07);
    for(let x=0;x<256;x++){
      const ring=Math.sin((x+bend)*.107)+.42*Math.sin((x+bend)*.29+y*.013);
      const fine=Math.sin(x*.61+y*.047);
      const streak=Math.sin((x+bend)*.042+y*.006);
      const variation=ring*10+fine*2.3+streak*6;
      const index=(y*256+x)*4;
      img.data[index]=Math.min(255,Math.max(0,base[0]+variation*1.25));
      img.data[index+1]=Math.min(255,Math.max(0,base[1]+variation*.92));
      img.data[index+2]=Math.min(255,Math.max(0,base[2]+variation*.64));
      img.data[index+3]=255;
    }
  }
  context.putImageData(img,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1,2);texture.anisotropy=8;texture.needsUpdate=true;
  grains.set(finish,texture);
  return texture;
}
/** BoxGeometry order: +X, -X, +Y, -Y, +Z, -Z. */
export function RenaissancePanelMaterials({roof,ceiling}:{
  roof:CoverRoofColor;ceiling:CoverCeilingFinish;
}){
  const ceilingMap=illustrativeWoodTexture(ceiling);
  const roofColor=getCoverRoofFinish(roof),ceilingColor=getCoverCeilingFinish(ceiling);
  return <>
    <meshStandardMaterial attach="material-0" color="#eef0ef" metalness={.23} roughness={.4}/>
    <meshStandardMaterial attach="material-1" color="#eef0ef" metalness={.23} roughness={.4}/>
    <meshStandardMaterial attach="material-2" color={roofColor} metalness={.22} roughness={.44}/>
    <meshStandardMaterial attach="material-3" color={ceilingMap?'#ffffff':ceilingColor}
      map={ceilingMap} metalness={ceilingMap?0:.16} roughness={ceilingMap? .72 : .43}/>
    <meshStandardMaterial attach="material-4" color="#eef0ef" metalness={.23} roughness={.4}/>
    <meshStandardMaterial attach="material-5" color="#eef0ef" metalness={.23} roughness={.4}/>
  </>;
}
