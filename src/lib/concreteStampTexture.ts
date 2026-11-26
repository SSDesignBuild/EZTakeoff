import * as THREE from 'three';
import type { SikaConcreteStamp } from './sikaConcreteCatalog';

export interface ConcretePatternScale {widthFt:number;depthFt:number;unitLengthFt:number;unitWidthFt:number}
/** Keep named brick/tile/plank widths in physical feet. A reference texture
 * repeat is not exported as a manufacturer's stamp-mat or control-joint plan. */
export function concretePatternScale(stamp:SikaConcreteStamp):ConcretePatternScale{
  const length=(stamp.unitLengthIn??stamp.previewLengthIn)/12;
  const width=(stamp.unitWidthIn??stamp.previewWidthIn)/12;
  if(['grid','running-bond','soldier','sailor','granite-border'].includes(stamp.style))
    return {widthFt:length*4,depthFt:width*4,unitLengthFt:length,unitWidthFt:width};
  if(['herringbone','basket-weave'].includes(stamp.style))
    return {widthFt:length*4,depthFt:length*4,unitLengthFt:length,unitWidthFt:width};
  if(stamp.style==='wood')return {widthFt:length,depthFt:width*4,unitLengthFt:length,unitWidthFt:width};
  return {widthFt:stamp.previewLengthIn/12,depthFt:stamp.previewWidthIn/12,
    unitLengthFt:length,unitWidthFt:width};
}
/** Deliberately generated drawing material. Official product photographs are
 * only shown as reference cards, never recolored or sold as a real installation.
 * The mat relief, mottling, antiquing and joint details below are approximations. */
export function createConcreteStampTexture(stamp:SikaConcreteStamp,swatch:string){
  const scale=concretePatternScale(stamp);
  if(typeof document==='undefined')return {texture:null,scale};
  const size=768,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return {texture:null,scale};
  const rgb=[1,3,5].map(start=>parseInt(swatch.slice(start,start+2),16));
  let seed=stamp.id.split('').reduce((sum,c)=>sum*31+c.charCodeAt(0),7)>>>0;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const noise=(cells:number)=>{
    const grid=Array.from({length:cells*cells},()=>rand()-.5);
    return (x:number,y:number)=>{
      const a=x/size*cells,b=y/size*cells,ix=Math.floor(a),iy=Math.floor(b);
      const sx=a-ix,sy=b-iy,tx=sx*sx*(3-2*sx),ty=sy*sy*(3-2*sy);
      const at=(u:number,v:number)=>grid[((v+cells)%cells)*cells+(u+cells)%cells];
      return (at(ix,iy)*(1-tx)+at(ix+1,iy)*tx)*(1-ty)+
        (at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx)*ty;
    };
  };
  const broad=noise(12),medium=noise(38),fine=noise(96);
  const pixels=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const t=y*size+x;
    const relief=broad(x,y)*16+medium(x,y)*9+fine(x,y)*3;
    const texture=stamp.style==='wood'?Math.sin(y*.9+Math.sin(x*.02)*.7)*4:
      stamp.style==='plain'?broad(x,y)*2:
        stamp.id.includes('travertine')?medium(x,y)*5+(fine(x,y)<-.32?-8:0):
          stamp.id.includes('heavy-stone')?relief*1.35:relief;
    const shade=(rand()-.5)*9+texture;
    for(let c=0;c<3;c++)pixels.data[t*4+c]=Math.max(0,Math.min(255,rgb[c]+shade));
    pixels.data[t*4+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const px=(x:number)=>x/scale.widthFt*size,py=(y:number)=>y/scale.depthFt*size;
  ctx.lineJoin='round';ctx.lineCap='round';
  const groove=(points:readonly (readonly [number,number])[],closed=false,widthFt=.022)=>{
    if(points.length<2)return;
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y)));
    if(closed)ctx.closePath();
    ctx.lineWidth=Math.max(1.2,widthFt/scale.widthFt*size);
    ctx.strokeStyle='rgba(34,30,25,.58)';ctx.stroke();
    ctx.lineWidth=Math.max(.6,ctx.lineWidth*.22);ctx.strokeStyle='rgba(255,252,239,.22)';ctx.stroke();
  };
  const rect=(x:number,y:number,w:number,h:number,width=.022)=>groove([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true,width);
  const l=scale.unitLengthFt,w=scale.unitWidthFt,W=scale.widthFt,H=scale.depthFt;
  if(['grid','running-bond','soldier','sailor','granite-border'].includes(stamp.style)){
    for(let row=-1;row<6;row++)for(let col=-1;col<6;col++){
      const offset=stamp.style==='running-bond'&&Math.abs(row%2)===1?l/2:0;
      rect(col*l+offset,row*w,l,w,stamp.family==='Brick'||stamp.family==='Borders'?.025:.03);
    }
  }else if(stamp.style==='basket-weave'){
    // Paired rectangular bricks alternate direction in adjacent square blocks.
    for(let row=-1;row<5;row++)for(let col=-1;col<5;col++){
      const x=col*l,y=row*l;
      if((row+col)%2===0){rect(x,y,l,l/2);rect(x,y+l/2,l,l/2);}
      else{rect(x,y,l/2,l);rect(x+l/2,y,l/2,l);}
    }
  }else if(stamp.style==='herringbone'){
    // A horizontal domino covers residues 0/1 of (column-row) mod 4;
    // a vertical domino starting at residue 3 covers 3/2. No overlaps or
    // invented diagonal cuts through the rectangular brick units.
    const cell=l/2;
    for(let row=-8;row<18;row++)for(let col=-8;col<18;col++){
      if(((col-row)%4+4)%4!==0)continue;
      rect(col*cell,row*cell,cell*2,cell);
      rect((col+3)*cell,row*cell,cell,cell*2);
    }
  }else if(stamp.style==='wood'){
    for(let row=0;row<4;row++){
      groove([[0,row*w],[W,row*w]],false,.009);
      const end=[.16,.65,.37,.84][row]*W;groove([[end,row*w],[end,(row+1)*w]],false,.009);
      for(let grain=0;grain<15;grain++){
        const baseline=(row+(grain+.5)/15)*w,points:[number,number][]=[];
        for(let i=0;i<=50;i++)points.push([W*i/50,baseline+Math.sin(i*.3+grain)*w*.018]);
        ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y)));
        ctx.strokeStyle='rgba(48,35,24,.12)';ctx.lineWidth=.7;ctx.stroke();
      }
    }
  }else if(stamp.style==='ashlar'){
    // Varied rectangular courses reflect the official reference photos; their
    // arrangement is explicitly approximate where no mat CAD is supplied.
    const variant=stamp.id.includes('cottage')?1:stamp.id.includes('majestic')?2:0;
    const layouts=[
      [[0,0,.5,.5],[.5,0,.5,.25],[.5,.25,.25,.25],[.75,.25,.25,.5],[0,.5,.25,.5],[.25,.5,.5,.5],[.75,.75,.25,.25]],
      [[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.25,.5],[.25,.5,.5,.5],[.75,.5,.25,.5]],
      [[0,0,.5,.33],[.5,0,.5,.66],[0,.33,.5,.33],[0,.66,.72,.34],[.72,.66,.28,.34]],
    ];
    for(const [x,y,a,b] of layouts[variant])rect(x*W,y*H,a*W,b*H,.025);
  }else if(stamp.style==='irregular-stone'){
    const edges=[[[0,.27],[.23,.18],[.44,.28],[.46,0]],[[.23,.18],[.17,.51],[0,.64]],
      [[.17,.51],[.43,.62],[.62,.48],[.44,.28]],[[.62,.48],[.8,.22],[1,.27]],
      [[.8,.22],[.81,0]],[[.43,.62],[.3,.84],[.34,1]],[[.3,.84],[0,.81]],
      [[.62,.48],[.83,.7],[1,.64]],[[.83,.7],[.8,1]]];
    for(const line of edges)groove(line.map(([x,y])=>[x*W,y*H] as const),false,.037);
    if(stamp.id.includes('orchard'))groove([[.83*W,.7*H],[.58*W,.91*H],[.34*W,H]],false,.03);
  }else if(stamp.style==='rope'){
    // Relative chain/loop contour follows the official Roman Rope sample;
    // it is a surface illustration rather than a claim about mold dimensions.
    const cubic=(p:number[][])=>{
      const points:[number,number][]=[];
      for(let k=0;k<=40;k++){
        const t=k/40,u=1-t;
        points.push([(u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0])*W,
          (u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1])*H]);
      }
      groove(points,false,.014);
    };
    cubic([[0,.1],[.3,-.025],[.73,-.025],[1,.1]]);
    cubic([[0,.1],[.18,.22],[.2,.34],[.21,.43]]);
    cubic([[.61,.55],[.62,.76],[.75,.85],[1,.9]]);
    cubic([[0,.9],[.34,1.025],[.7,1.025],[1,.9]]);
    groove(Array.from({length:49},(_,k)=>{const a=k/48*Math.PI*2;
      return [(.41+Math.cos(a)*.205)*W,(.49+Math.sin(a)*.13)*H] as [number,number];}),true,.014);
  }
  // Seamless skins intentionally have texture without a fabricated tile grid.
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return {texture,scale};
}
