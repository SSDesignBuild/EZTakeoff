import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {ConsultationProject} from '../../lib/consultationProject';
import {lightingFinishColor,planLightingAddons,planLightingPreviewSources,type LightingFixture,type LightingPoint} from '../../lib/lightingAddons';

function Housing({size,color,position=[0,0,0]}:{size:LightingPoint;color:string;position?:LightingPoint}){
  return <mesh position={position} castShadow receiveShadow>
    <boxGeometry args={size}/><meshStandardMaterial color={color} metalness={.25} roughness={.65}/>
  </mesh>;
}
function Lens({size,position,on}:{size:LightingPoint;position:LightingPoint;on:boolean}){
  return <mesh position={position}>
    <boxGeometry args={size}/>
    <meshStandardMaterial color={on?'#fff0cd':'#e8e0c9'} emissive={on?'#ffd78a':'#000000'}
      emissiveIntensity={on?3.2:0} roughness={.4} toneMapped={false}/>
  </mesh>;
}
/** The official product photographs show oval hoods, not rectangular boxes.
 * The silhouette stays inside the manufacturer's published overall envelope;
 * the lens follows that surface instead of floating ahead of the hood. */
function OvalFixture({size,color,on}:{size:LightingPoint;color:string;on:boolean}){
  const [w,h,d]=size;
  const lens=useMemo(()=>{
    const positions:number[]=[],indices:number[]=[];
    for(let row=0;row<2;row++)for(let col=0;col<=12;col++){
      const x=w*.36*(col/6-1),y=h*(-.17+row*.12);
      const z=-d/2+d*Math.sqrt(Math.max(0,1-(2*x/w)**2-(2*y/h)**2))+.001;
      positions.push(x,y,z);
    }
    for(let col=0;col<12;col++)indices.push(col,col+1,col+14,col,col+14,col+13);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    return geometry;
  },[w,h,d]);
  useEffect(()=>()=>lens.dispose(),[lens]);
  return <>
    <mesh position={[0,0,-d/2]} scale={[w/2,h/2,d]} castShadow receiveShadow>
      <sphereGeometry args={[1,24,14,0,Math.PI,0,Math.PI]}/>
      <meshStandardMaterial color={color} roughness={.55} metalness={.3} side={2}/>
    </mesh>
    <mesh geometry={lens}>
      <meshStandardMaterial color={on?'#fff0cd':'#e8e0c9'} emissive={on?'#ffd78a':'#000000'}
        emissiveIntensity={on?3.2:0} roughness={.4} toneMapped={false} side={2}/>
    </mesh>
  </>;
}
function PatioFan({fixture,on}:{fixture:LightingFixture;on:boolean}){
  const [diameter,drop]=fixture.sizeFt,color=lightingFinishColor(fixture.finish),radius=diameter/2;
  const bladeTip=Math.sqrt(radius*radius-.16*.16);
  // This is the explicitly labeled generic 52-inch design allowance, not
  // a manufacturer fixture or an engineered mounting/clearance claim.
  return <group name="generic-52-inch-patio-fan" position={fixture.position}>
    <mesh rotation={fixture.rotation} position={[0,-.055,0]} castShadow>
      <cylinderGeometry args={[.19,.14,.11,16]}/><meshStandardMaterial color={color} metalness={.45} roughness={.5}/>
    </mesh>
    <mesh position={[0,-drop/2,0]} castShadow>
      <cylinderGeometry args={[.035,.035,Math.max(.1,drop-.1),12]}/><meshStandardMaterial color={color} metalness={.6} roughness={.4}/>
    </mesh>
    <mesh position={[0,-drop,0]} castShadow>
      <cylinderGeometry args={[.18,.27,.22,24]}/><meshStandardMaterial color={color} metalness={.45} roughness={.5}/>
    </mesh>
    {[0,1,2].map(i=><group key={i} rotation={[0,i*Math.PI*2/3,0]}>
      <mesh position={[(bladeTip+.22)/2,-drop-.02,0]} rotation={[0,0,.035]} castShadow>
        <boxGeometry args={[bladeTip-.22,.035,.32]}/><meshStandardMaterial color={color} metalness={.2} roughness={.7}/>
      </mesh>
    </group>)}
    {fixture.hasLight&&<mesh name="optional-integrated-fan-light" position={[0,-drop-.145,0]}>
      <sphereGeometry args={[.21,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2]}/>
      <meshStandardMaterial color={on?'#fff4d5':'#ece8df'} emissive={on?'#ffdc9b':'#000000'}
        emissiveIntensity={on?3.2:0} toneMapped={false} roughness={.4}/>
    </mesh>}
  </group>;
}
function CeilingLight({fixture,on}:{fixture:LightingFixture;on:boolean}){
  const radius=fixture.sizeFt[0]/2,color=lightingFinishColor(fixture.finish);
  return <group name="generic-4-inch-recessed-can-light" position={fixture.position} rotation={fixture.rotation}>
    <mesh position={[0,.025,0]} castShadow>
      <cylinderGeometry args={[radius,radius,.06,20]}/><meshStandardMaterial color={color} roughness={.6}/>
    </mesh>
    <mesh position={[0,-.009,0]} rotation={[-Math.PI/2,0,0]}>
      <circleGeometry args={[radius*.78,20]}/>
      <meshStandardMaterial side={2} color={on?'#fff4d5':'#ece8df'} emissive={on?'#ffdc9b':'#000000'}
        emissiveIntensity={on?3.2:0} toneMapped={false}/>
    </mesh>
  </group>;
}
function DeckLight({fixture,on}:{fixture:LightingFixture;on:boolean}){
  const [w,h,d]=fixture.sizeFt,color=lightingFinishColor(fixture.finish);
  return <group name="timbertech-in-deck-light-on-plank-centerline" position={fixture.position}>
    <mesh scale={[w/2,1,d/2]} castShadow receiveShadow>
      <cylinderGeometry args={[1,.8,h,24]}/><meshStandardMaterial color={color} roughness={.5} metalness={.3}/>
    </mesh>
    <mesh position={[0,h/2+.003,0]} rotation={[-Math.PI/2,0,0]} scale={[w*.32,d*.32,1]}>
      <circleGeometry args={[1,24]}/><meshStandardMaterial color={on?'#fff0cd':'#e8e0c9'}
        emissive={on?'#ffd78a':'#000000'} emissiveIntensity={on?1.8:0} toneMapped={false}/>
    </mesh>
  </group>;
}
function RailOrRiserLight({fixture,on}:{fixture:LightingFixture;on:boolean}){
  const [w,h,d]=fixture.sizeFt,color=lightingFinishColor(fixture.finish);
  const cap=fixture.category==='post-cap';
  const oval=['tt-small-accent','tt-accent','tt-riser'].includes(fixture.productId);
  return <group name={fixture.productId+(fixture.geometryFidelity==='mounting-symbol'?'-mounting-symbol':'')}
    position={fixture.position} rotation={fixture.rotation}>
    {cap?<>
      <Housing size={[w,h*.42,d]} color={color} position={[0,-h*.29,0]}/>
      {/* All four cap faces glow under the photographed peaked cap. */}
      <Lens size={[w,h*.17,d]} position={[0,h*.005,0]} on={on}/>
      <Housing size={[w,h*.16,d]} position={[0,h*.17,0]} color={color}/>
      <mesh position={[0,h*.375,0]} rotation={[0,Math.PI/4,0]} castShadow>
        <coneGeometry args={[w/Math.SQRT2,h*.25,4]}/><meshStandardMaterial color={color} metalness={.3} roughness={.6}/>
      </mesh>
    </>:oval?<OvalFixture size={fixture.sizeFt} color={color} on={on}/>:<>
      <Housing size={[w,h,d]} color={color}/>
      <Lens size={[w*.72,h*.23,.006]} position={[0,-h*.25,d/2+.004]} on={on}/>
      <Housing size={[w,h*.18,d*.1]} position={[0,-h*.07,d*.48]} color={color}/>
    </>}
  </group>;
}
export function LightingAddons3D({project,center,lightingPreview=false}:{
  project:ConsultationProject;center:readonly [number,number];lightingPreview?:boolean;
}){
  const plan=useMemo(()=>planLightingAddons(project,center),[project,center]);
  const glowSites=useMemo(()=>planLightingPreviewSources(plan.fixtures),[plan.fixtures]);
  return <group name="saved-outdoor-lighting-and-patio-addons">
    {plan.fixtures.map(f=>f.category==='fan'?<PatioFan key={f.id} fixture={f} on={lightingPreview}/>:
      f.category==='can-light'?<CeilingLight key={f.id} fixture={f} on={lightingPreview}/>:
      f.category==='deck'?<DeckLight key={f.id} fixture={f} on={lightingPreview}/>:
      <RailOrRiserLight key={f.id} fixture={f} on={lightingPreview}/>)}
    {lightingPreview&&glowSites.map(f=><pointLight key={'preview-glow-'+f.fixtureIds.join('-')}
      name={'evening-illumination-'+f.category} position={f.position}
      color="#ffe0a3" intensity={f.intensity} distance={f.distance} decay={2} castShadow={false}/>)}
  </group>;
}
