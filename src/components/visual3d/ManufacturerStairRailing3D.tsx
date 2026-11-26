import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {DeckModel} from '../../lib/deckModel';
import type {RailVisualProduct} from '../../data/visualCatalog';
import {planStairRailingRuns,stairDrinkPostVertices,type StairRailPoint3D,type StairRailVisualRun} from '../../lib/stairRailVisualGeometry';
import {Block,Rod,type P2,type P3} from './Primitives';
import {railPointKey} from '../../lib/railingLayout';

/** Rail section whose width remains horizontal across the flight. A generic
 * shortest-arc box rotation rolls its width on diagonal stair directions. */
function SlopedBeam({start,end,thickness,depth,color,bend}:{
 start:P3;end:P3;thickness:number;depth:number;color:string;bend?:P3;
}){
 const points=bend?[start,bend,end]:[start,end];
 return <>{points.slice(0,-1).map((from,i)=>{
  const to=points[i+1],dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2];
  const horizontal=Math.hypot(dx,dz),length=Math.hypot(dx,dy,dz);if(length<.001)return null;
  const x=new THREE.Vector3(dx,dy,dz).normalize();
  const z=new THREE.Vector3(-dz,0,dx).normalize();
  const y=new THREE.Vector3().crossVectors(z,x).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  return <mesh key={i} position={[(from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2]}
    quaternion={rotation} castShadow receiveShadow>
   <boxGeometry args={[length,thickness*horizontal/length,depth]}/>
   <meshStandardMaterial color={color} roughness={.65}/>
  </mesh>;
 })}</>;
}
function PitchCutStairPost({run,index,width,height,color,metalness}:{
 run:StairRailVisualRun;index:number;width:number;height:number;color:string;metalness:number;
}){
 const geometry=useMemo(()=>{
  const {top,bottom}=stairDrinkPostVertices(run,index,width,height);
  const vertices=[...top,...bottom],positions:number[]=[];
  for(const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])
   for(const corner of [0,1,2,0,2,3])positions.push(...vertices[face[corner]]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  return g;
 },[run,index,width,height]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh name="selected-stair-guard-post" geometry={geometry} castShadow receiveShadow>
  <meshStandardMaterial color={color} metalness={metalness} roughness={.65}/>
 </mesh>;
}
function StairGlassPanel({from,to,guardHeight}:{
 from:StairRailPoint3D;to:StairRailPoint3D;guardHeight:number;
}){
 const geometry=useMemo(()=>{
  const low=.43,high=guardHeight-.31;
  const g=new THREE.BufferGeometry();
  const vertices=new Float32Array([
   from[0],from[1]+low,from[2],
   to[0],to[1]+low,to[2],
   to[0],to[1]+high,to[2],
   from[0],from[1]+high,from[2],
  ]);
  g.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  g.setIndex([0,1,2,0,2,3]);
  g.computeVertexNormals();
  return g;
 },[from,to,guardHeight]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh name="selected-glass-stair-guard-panel" geometry={geometry}>
   <meshPhysicalMaterial color="#bddce4" transparent opacity={.34}
     side={THREE.DoubleSide} roughness={.09} metalness={.03}
     depthWrite={false}/>
 </mesh>;
}
export function ManufacturerStairRailing3D({model,center,deckHeight,style,color,infill,
 height,hideCap,runs:providedRuns,sharedTopPosts=new Set<string>(),lightCapPostKeys}:{
 model:DeckModel;center:P2;deckHeight:number;style:RailVisualProduct;
 color:string;infill:string;height:number;hideCap:boolean;
 runs?:StairRailVisualRun[];sharedTopPosts?:Set<string>;
 lightCapPostKeys?:ReadonlySet<string>;
}){
 const wooden=style.family==='wood',metallic=style.family==='metal';
 const drink=style.geometry.includes('drink');
 const postWidth=style.postWidthIn/12;
 const topWidth=style.topWidthIn/12;
 const topThick=Math.max(.12,style.topHeightIn/12);
 const runs=providedRuns??planStairRailingRuns(model,center,deckHeight,postWidth,metallic?7.1:6);
 const at=(a:StairRailPoint3D,upper:number):P3=>[a[0],a[1]+upper,a[2]];
 const metal=metallic?.64:.02;
 const glass=infill==='glass',cable=infill==='horizontal-cable';
 return <group name={'selected-'+style.id+'-stair-railing-independent-of-sunroom'}>
   {runs.map(run=><group key={'stair-rail-'+run.placementIndex+'-'+run.side}
      name={'selected-stair-guard-'+run.side+'-edge-'+run.edgeIndex}>
     {run.panels.map((panel,i)=>{
       const {from,to}=panel;
       const len=panel.endFt-panel.startFt;
       const upper=drink?height+.0285-topThick/2:height-.13;
       const topFrom=at(from,upper),topTo=at(to,upper);
       const bottomFrom=at(from,.38),bottomTo=at(to,.38);
       const first=run.posts[0],last=run.posts[run.posts.length-1];
       const horizontal=Math.hypot(last[0]-first[0],last[2]-first[2]);
       const landing:StairRailPoint3D=[first[0]+(last[0]-first[0])*run.insetFt/horizontal,
         first[1],first[2]+(last[2]-first[2])*run.insetFt/horizontal];
       const landingFraction=i===0?run.insetFt/Math.max(.001,len):0;
       const balusterCount=Math.max(2,Math.ceil(len/(wooden?.42:metallic?.39:.43)));
       const interpolate=(fraction:number):StairRailPoint3D=>[
        from[0]+(to[0]-from[0])*fraction,
        from[1]+(to[1]-from[1])*Math.max(0,(fraction-landingFraction)/(1-landingFraction)),
        from[2]+(to[2]-from[2])*fraction,
       ];
       return <group key={'selected-stair-rail-bay-'+i}>
         {/* Rails follow the pitch of the actual treads and stringers.
             The same manufacturer style and finish drives deck-level and
             stair railing; never draw a horizontal guard across the stair
             entry opening at the top of this run. */}
         <SlopedBeam start={topFrom} end={topTo} bend={i===0?at(landing,upper):undefined}
           thickness={topThick} depth={topWidth} color={color}/>
         <SlopedBeam start={bottomFrom} end={bottomTo} bend={i===0?at(landing,.38):undefined}
           thickness={wooden?.24:.10} depth={wooden?.24:.13} color={color}/>
         {style.geometry==='ire-classic'&&<SlopedBeam
           start={at(from,height+.01)} end={at(to,height+.01)}
           thickness={.055} depth={topWidth+.04} color={color}/>}
         {style.geometry==='ire-modern'&&<SlopedBeam
           start={at(from,height+.03)} end={at(to,height+.03)}
           thickness={.048} depth={topWidth+.02} color={color}/>}

         {wooden&&<SlopedBeam start={at(from,height-.32)}
           end={at(to,height-.32)} thickness={.17}
           depth={3.5/12} color={color}/>}
         {(style.family==='pvc'||style.family==='composite'||style.family==='vinyl')&&
           <SlopedBeam start={at(from,height-.27)} end={at(to,height-.27)}
             thickness={.065} depth={topWidth*.65} color={color}/>}
         {infill==='midrail'&&<SlopedBeam start={at(from,height/2)}
           end={at(to,height/2)} thickness={.11} depth={.13} color={color}/>}
         {glass&&<StairGlassPanel from={from} to={to} guardHeight={height}/>}
         {cable&&Array.from({length:9},(_,j)=>
           <Rod key={'stair-cable-'+j} from={at(from,.48+j*(height-.84)/8)}
             to={at(to,.48+j*(height-.84)/8)}
             radius={.008} color="#7e878b" metalness={.8}/>)}
         {['chippendale','square-web'].includes(infill)&&<group>
           <Rod from={at(from,.42)} to={at(to,height-.33)}
             radius={.03} color={color}/>
           <Rod from={at(from,height-.33)} to={at(to,.42)}
             radius={.03} color={color}/>
           {infill==='square-web'&&<Rod
             from={at(from,height/2)} to={at(to,height/2)}
             radius={.028} color={color}/>}
         </group>}
         {!glass&&!cable&&!['chippendale','square-web'].includes(infill)&&
           Array.from({length:balusterCount},(_,j)=>{
             const p=interpolate((j+.5)/balusterCount);
             const dark=['round-black','square-black','aluminum','vertical-cable'].includes(infill);
             const balusterColor=dark?(metallic?color:'#25292d'):color;
             const round=infill==='round-black'||infill==='vertical-cable';
             return round?
               <Rod key={'stair-round-baluster-'+j}
                 from={at(p,.51)} to={at(p,height-.32)}
                 radius={infill==='vertical-cable'?.009:.026}
                 color={balusterColor} metalness={dark?.7:.03}/>:
               <Block key={'stair-square-baluster-'+j}
                 name="selected-slope-stair-picket"
                 position={at(p,(height+.29)/2)}
                 size={[wooden?.12:metallic?.048:.12,
                   Math.max(.2,height-.79),wooden?.12:metallic?.048:.12]}
                 color={balusterColor} metalness={metal}/>;
           })}
       </group>;
     })}
     {run.posts.map((p,i)=>{
       if(i===0&&sharedTopPosts.has(railPointKey(p)))return null;
       const base=run.postBaseYs[i],postTop=p[1]+height+.0285;
       return <group key={'selected-stair-post-'+i}>
       {drink?<PitchCutStairPost run={run} index={i} width={postWidth} height={height}
         color={color} metalness={metal}/>:<Block name="selected-stair-guard-post"
         position={[p[0],(base+postTop)/2,p[2]]}
         size={[postWidth,Math.max(.1,postTop-base),postWidth]} color={color}
         metalness={metal}/>}
       {!hideCap&&!lightCapPostKeys?.has(railPointKey(p))&&<Block name="selected-stair-post-cap"
         position={at(p,height+.06)}
         size={[postWidth+.045,.085,postWidth+.045]} color={color}
         metalness={metal}/>}
       {!wooden&&<Block name="selected-stair-post-base-skirt"
         position={[p[0],base+.0675,p[2]]}
         size={[postWidth+.06,.135,postWidth+.06]} color={color}
         metalness={metal}/>}
     </group>;})}
   </group>)}
 </group>;
}
