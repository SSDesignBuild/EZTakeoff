import {buildDeckModel,buildLowerTierDeckModel,type DeckModel} from './deckModel';
import type {ConsultationProject} from './consultationProject';
import type {MaterialItem} from './types';
import {getRailVisualProduct,getDeckVisualProduct,getCoverVisualProduct,type RailVisualProduct} from '../data/visualCatalog';
import {lightingProducts,getLightingProduct,GENERIC_FAN_PLACEMENT_REFERENCE,type LightingCategory,type AddonCategory,type LightingProduct} from '../data/lightingCatalog';
import {planLevelRailingRuns,railingSurfaceInsetFt,railPointKey} from './railingLayout';
import {planStairRailingRuns,stairFlightFrame,type StairRailClearanceWall} from './stairRailVisualGeometry';
import {stairEnclosureClearanceWalls} from './stairEnclosureClearance';
import {parseDeckGates} from './deckGates';
import {resolveFasciaMaterial} from './deckTrimSelection';
import {surfaceStrips} from './visualGeometry';
import {planRenaissanceCoverWalls} from './renaissanceCoverWallLayout';
import {RENAISSANCE_INSULATED_ROOF,RENAISSANCE_TRUSS} from './renaissanceManufacturer';

type Values=ConsultationProject['values'];
type V2=readonly [number,number];
export type LightingPoint=[number,number,number];
export type LightingTier='main'|'lower';
export interface LightingSettings {
  lightingPostFixture:string;lightingPostCapFixture:string;
  lightingPostPattern:'all'|'alternating';lightingPostCapPattern:'all'|'alternating';
  lightingStairFixture:string;lightingStairPattern:'all'|'alternating';lightingStairPerRiser:1|2;
  lightingDeckFixture:string;lightingDeckSpacingFt:number;lightingTier:'all'|LightingTier;
  patioFanCount:number;patioFanLayout:'centered'|'front'|'rear';patioFanFinish:'black'|'white';patioFanMount:'standard'|'low-profile';patioFanLight:boolean;
  patioCanLightCount:number;patioCanLightLayout:'grid'|'perimeter';patioCanLightFinish:'black'|'white';
}
export interface LightingOption {id:string;label:string;enabled:boolean;reason?:string}
export interface LightingFixture {
  id:string;category:AddonCategory;productId:string;label:string;tier:LightingTier;
  position:LightingPoint;rotation:LightingPoint;sizeFt:LightingPoint;finish:string;
  mounting:'post-face'|'post-top'|'riser-face'|'board-centerline'|'ceiling';
  geometryFidelity:'published-envelope'|'mounting-symbol'|'generic-concept';
  sourceUrl?:string;postKey?:string;flightIndex?:number;riserIndex?:number;
  mountStyle?:'standard'|'low-profile';
  /** The saved integrated-light option belongs to this fan, not a second fixture. */
  hasLight?:boolean;
}
export interface LightingAddonPlan {
  settings:LightingSettings;fixtures:LightingFixture[];materials:MaterialItem[];
  requestedCounts:Record<AddonCategory,number>;placedCounts:Record<AddonCategory,number>;
  issues:string[];notes:string[];
}
export interface LightingPreviewSource {
  fixtureIds:string[];category:AddonCategory;position:LightingPoint;intensity:number;distance:number;
}
export const fixtureHasLight=(fixture:LightingFixture)=>fixture.category!=='fan'||fixture.hasLight===true;
/** Every selected lamp contributes to the evening preview. Nearby sources
 * merge only when the shader light budget is reached; no fixture is sampled
 * away. Ceiling sources reach the deck instead of using the short riser range.
 * These are display intensities, not a photometric/electrical calculation. */
export function planLightingPreviewSources(fixtures:readonly LightingFixture[],maxSources=20):LightingPreviewSource[]{
  const sources=fixtures.filter(fixtureHasLight).map(f=>{
    const overhead=f.category==='can-light'||f.category==='fan';
    const position:LightingPoint=[...f.position];
    if(f.category==='fan')position[1]-=f.sizeFt[1]+.18;
    else if(f.category==='can-light'){
      position[0]+=.09*Math.sin(f.rotation[2]);position[1]-=.09*Math.cos(f.rotation[0])*Math.cos(f.rotation[2]);
      position[2]-=.09*Math.sin(f.rotation[0]);
    }else if(f.category==='deck')position[1]+=.15;
    else if(f.category==='post-cap')position[1]+=.02;
    else {
      // Recessed riser housings sit inside the board. The light source must
      // sit beyond the visible lens, on the same outward normal as its mesh.
      const projection=f.sizeFt[2]/2+.06;
      position[0]+=Math.sin(f.rotation[1])*projection;position[2]+=Math.cos(f.rotation[1])*projection;
      position[1]-=.04;
    }
    return {fixtureIds:[f.id],category:f.category,position,
      intensity:overhead?(f.category==='fan'?70:85):f.category==='stair'?2.8:3.5,
      distance:overhead?Math.max(16,f.position[1]+4):f.category==='stair'?3.8:6};
  });
  const budget=Math.max(1,Math.floor(maxSources));
  while(sources.length>budget){
    let ai=0,bi=1,best=Infinity;
    for(let a=0;a<sources.length;a++)for(let b=a+1;b<sources.length;b++){
      const first=sources[a],second=sources[b];
      const distance=Math.hypot(...first.position.map((n,i)=>n-second.position[i]));
      const cost=distance+(first.category===second.category?0:1000);
      if(cost<best){best=cost;ai=a;bi=b;}
    }
    const a=sources[ai],b=sources[bi],intensity=a.intensity+b.intensity;
    const position=a.position.map((n,i)=>(n*a.intensity+b.position[i]*b.intensity)/intensity) as LightingPoint;
    sources[ai]={fixtureIds:[...a.fixtureIds,...b.fixtureIds],category:a.category,position,intensity,
      distance:Math.max(a.distance+Math.hypot(...a.position.map((n,i)=>n-position[i])),
        b.distance+Math.hypot(...b.position.map((n,i)=>n-position[i])))};
    sources.splice(bi,1);
  }
  return sources;
}
const finite=(value:unknown,fallback:number)=>Number.isFinite(Number(value))?Number(value):fallback;
const limit=(value:unknown,fallback:number,min:number,max:number)=>Math.min(max,Math.max(min,finite(value,fallback)));
const fixtureId=(v:unknown)=>typeof v==='string'?v:'none';
const pattern=(v:unknown):'all'|'alternating'=>v==='alternating'?'alternating':'all';
const height=(values:Values,lower=false)=>limit(values[lower?'lowerDeckHeight':'deckHeight'],lower?3:5,.35,26);
export function readLightingSettings(values:Values):LightingSettings {
  return {
    lightingPostFixture:fixtureId(values.lightingPostFixture),
    lightingPostCapFixture:fixtureId(values.lightingPostCapFixture),
    lightingPostPattern:pattern(values.lightingPostPattern),lightingPostCapPattern:pattern(values.lightingPostCapPattern),
    lightingStairFixture:fixtureId(values.lightingStairFixture),lightingStairPattern:pattern(values.lightingStairPattern),
    lightingStairPerRiser:Number(values.lightingStairPerRiser)===2?2:1,
    lightingDeckFixture:fixtureId(values.lightingDeckFixture),lightingDeckSpacingFt:limit(values.lightingDeckSpacingFt,6,2,12),
    lightingTier:values.lightingTier==='main'||values.lightingTier==='lower'?values.lightingTier:'all',
    patioFanCount:Math.round(limit(values.patioFanCount,0,0,4)),
    patioFanLayout:values.patioFanLayout==='front'||values.patioFanLayout==='rear'?values.patioFanLayout:'centered',
    patioFanFinish:values.patioFanFinish==='white'?'white':'black',
    patioFanMount:values.patioFanMount==='low-profile'?'low-profile':'standard',
    patioFanLight:values.patioFanLight===true||values.patioFanLight==='true',
    patioCanLightCount:Math.round(limit(values.patioCanLightCount,0,0,24)),
    patioCanLightLayout:values.patioCanLightLayout==='perimeter'?'perimeter':'grid',
    patioCanLightFinish:values.patioCanLightFinish==='black'?'black':'white',
  };
}
function railStyle(values:Values):RailVisualProduct {
  let id=typeof values.railingVisualId==='string'?values.railingVisualId:'';
  if(!id){
    const type=String(values.railingType??'aluminum');
    id=type==='wood'?(values.spindleType==='black-round'?'sns-wood-round':'sns-wood-pickets'):
      type.includes('vinyl')?'tt-statement':values.railingTopProfile==='drink'?'tt-ire-drink':
        values.railingTopProfile==='modern'?'tt-ire-modern':'tt-ire-classic';
  }
  const style=getRailVisualProduct(id),post=Number(String(values.railingPostSize??'3x3').split('x')[0]);
  return style.takeoffSystem==='timbertech-ire'&&[2,3,4].includes(post)?{...style,postWidthIn:post}:style;
}
/** An explicit new cap-light selection replaces the older global cap/light
 * accessory input. A post kit's included cap remains, but a second complete
 * lantern/perimeter-light allowance must not be ordered for the same posts. */
export function lightingEstimateValues(values:Values):Values {
  if(typeof values.lightingPostCapFixture!=='string')return values;
  const hidden=railStyle(values).geometry.includes('drink')||['flush-top','flush-drink'].includes(String(values.railingPostTermination));
  return {...values,railingPostCap:hidden?'none':'standard'};
}
function compatibility(values:Values,product:LightingProduct):string|undefined {
  const style=railStyle(values),ire=style.takeoffSystem==='timbertech-ire';
  const composite=style.family==='composite'&&style.id!=='tt-radiance-express';
  if(product.category==='post-cap'){
    if(style.geometry.includes('drink')||['flush-top','flush-drink'].includes(String(values.railingPostTermination)))
      return 'Post-cap lights need exposed post tops. Choose post-face lights for this flush or drink rail.';
    if(product.id==='tt-ire-post-cap'&&(!ire||style.postWidthIn!==3))return 'Requires a 3-inch Impression Rail Express post and cap.';
    if(product.id==='tt-lantern'){
      if(ire&&(style.postWidthIn!==3||values.railingInfill==='horizontal-cable'))
        return 'The IRE lantern fits 3-inch posts; TimberTech excludes horizontal-cable posts.';
      if(!ire&&!(composite&&[4,5,5.5].includes(style.postWidthIn)))
        return 'Verified for IRE 3-inch or Classic Composite 4, 5 and 5½-inch posts.';
    }
  }
  if(product.category==='post'){
    if(product.id==='tt-small-accent'&&!ire)return 'Small Accent is verified for Impression Rail Express posts.';
    if(product.id==='tt-reversible-accent'){
      if(!ire&&!composite)return 'Reversible Accent is verified for IRE and Classic Composite posts.';
      if(ire&&!['black','white','matte-black','matte-white'].includes(String(values.railingColor??'black')))
        return 'IRE compatibility is published for Matte White and Matte Black; select Small Accent for Dark Bronze.';
      if(style.postWidthIn<2.5)return 'This 2½-inch-wide fixture needs a wider post; Small Accent fits the selected IRE post.';
    }
    if(product.id==='tt-accent'&&!['composite','pvc'].includes(style.family))
      return 'Accent Light is verified for TimberTech composite and PVC posts.';
  }
  if(product.category==='deck'){
    if(values.deckingType==='pressure-treated'||!getDeckVisualProduct(values.deckingMaterial))
      return 'Select a verified TimberTech deck finish for this TimberTech lighting installation.';
  }
  if(product.category==='stair'){
    const riserStyle=String(values.stairRiserStyle??'auto');
    if(riserStyle==='open')
      return 'Riser lights need closed riser boards. The selected stairs have open risers.';
    // Riser finishes are independent of the field deck. Follow the exact
    // finish routing used by the stair renderer rather than allowing a PT
    // riser solely because the main deck happens to be composite (or
    // blocking a TimberTech riser on an otherwise PT deck).
    const usesFascia=riserStyle==='fascia'||(riserStyle==='auto'&&values.deckingType!=='pressure-treated');
    const usesField=riserStyle==='match'||(riserStyle==='auto'&&values.deckingType==='pressure-treated');
    const material=usesFascia?resolveFasciaMaterial(values):usesField?values.deckingMaterial:riserStyle;
    const inheritsField=usesField||(usesFascia&&(!values.fasciaMaterial||values.fasciaMaterial==='match'));
    if((inheritsField&&values.deckingType==='pressure-treated')||!getDeckVisualProduct(material))
      return 'Select a verified TimberTech riser finish for this TimberTech lighting installation.';
  }
  return undefined;
}
export function getLightingOptions(project:ConsultationProject,category:LightingCategory):LightingOption[] {
  return [{id:'none',label:'None',enabled:true},...lightingProducts.filter(p=>p.category===category)
    .map(p=>{const reason=compatibility(project.values,p);return {id:p.id,label:p.label,enabled:!reason,...(reason?{reason}:{})};})];
}
export function getOverheadAddonAvailability(project:ConsultationProject){
  const available=project.coverFamily!=='none'&&['solid-studio','solid-truss-ends','full-trusses'].includes(getCoverVisualProduct(project.coverFamily).family);
  return {fans:available,canLights:available,...(available?{}:{reason:'Choose a solid Moderno, Contempo or Classico ceiling for patio fans and recessed can lights.'})};
}
export function lightingScreenIntegrated(project:ConsultationProject):boolean {
  // Cover removal retains the saved room choices for later restoration, but
  // no room is rendered while the cover is absent. Keep the open deck's
  // actual guardrail posts and their selected fixtures visible and ordered.
  if(project.coverFamily==='none')return false;
  return project.coverScreenStyle==='elite-add-a-room'||
    (['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')&&
      !['inside','outside'].includes(project.coverScreenRailTreatment??'integrated-kick'));
}
interface RailStation {point:LightingPoint;key:string;normal:V2;baseY:number;postWidthFt:number}
/** Exact same run, opening, inset and post station authorities as the rail meshes. */
export function lightingRailStations(model:DeckModel,values:Values,center:V2,deckHeight:number,screenIntegrated=false,
 enclosureWalls:readonly StairRailClearanceWall[]=[]):RailStation[]{
  const style=railStyle(values),postWidth=style.postWidthIn/12,metal=style.family==='metal';
  const topWidth=style.geometry.includes('drink')?5.5/12:style.topWidthIn/12;
  const inset=railingSurfaceInsetFt(postWidth,topWidth);
  const openings=parseDeckGates(values.deckGateEntries).flatMap(gate=>{
    const edge=model.edgeSegments.find(e=>e.index===gate.edgeIndex);if(!edge)return [];
    const stair=gate.placement==='stairs'?model.stairPlacements.find(p=>p.edgeIndex===edge.index):undefined;
    const width=Math.min(edge.length,Math.max(.5,stair?.width??gate.widthFt));
    const start=Math.min(Math.max(0,edge.length-width),Math.max(0,stair?.offset??gate.offsetFt??0));
    return [{edgeIndex:edge.index,startFt:start,endFt:start+width}];
  });
  const levels=screenIntegrated?[]:planLevelRailingRuns(model,center,deckHeight,postWidth,topWidth,metal?7.1:6,model.railCoverage,openings);
  const stairs=planStairRailingRuns(model,center,deckHeight,postWidth,metal?7.1:6,inset,enclosureWalls);
  const winding=model.points.reduce((s,p,i)=>{const n=model.points[(i+1)%model.points.length];return s+p.x*n.y-n.x*p.y;},0)>=0?1:-1;
  const stations=new Map<string,RailStation>();
  const add=(point:LightingPoint,normal:V2,baseY:number)=>{
    const key=railPointKey(point);if(stations.has(key))return;
    // Rendered posts are axis-aligned squares even on a diagonal flight.
    // Attach the fixture to an actual flat face, never a floating diagonal.
    const face:V2=Math.abs(normal[0])>Math.abs(normal[1])?[Math.sign(normal[0]),0]:[0,Math.sign(normal[1])];
    stations.set(key,{point,key,normal:face,baseY,postWidthFt:postWidth});
  };
  levels.forEach(run=>{
    const dx=run.to[0]-run.from[0],dz=run.to[2]-run.from[2],len=Math.hypot(dx,dz);
    run.posts.forEach(p=>add(p,[-dz/len*winding,dx/len*winding],deckHeight+.0625));
  });
  stairs.forEach(run=>{
    const frame=stairFlightFrame(model,model.stairPlacements[run.placementIndex],center);if(!frame)return;
    const sign=run.side==='left'?1:-1,normal:V2=[Math.cos(frame.yaw)*sign,-Math.sin(frame.yaw)*sign];
    run.posts.forEach((p,i)=>add(p,normal,run.postBaseYs[i]));
  });
  return [...stations.values()];
}
const tierSelected=(settings:LightingSettings,tier:LightingTier)=>settings.lightingTier==='all'||settings.lightingTier===tier;
const patterned=<T,>(items:T[],choice:'all'|'alternating')=>choice==='alternating'?items.filter((_,i)=>i%2===0):items;
export function lightingCapPostKeys(model:DeckModel,values:Values,center:V2,deckHeight:number,
  screenIntegrated=false,tier:LightingTier='main',enclosureWalls:readonly StairRailClearanceWall[]=[]):Set<string>{
  const settings=readLightingSettings(values),product=getLightingProduct(settings.lightingPostCapFixture);
  if(!tierSelected(settings,tier)||!product||product.category!=='post-cap'||compatibility(values,product))return new Set();
  return new Set(patterned(lightingRailStations(model,values,center,deckHeight,screenIntegrated,enclosureWalls),settings.lightingPostCapPattern).map(p=>p.key));
}
const finishes:Record<string,string>={black:'#25282b','matte-black':'#25282b',white:'#e6e4de',
  'matte-white':'#e6e4de','dark-bronze':'#514133','architectural-bronze':'#514133','matte-espresso':'#3e2e24'};
export function lightingFinishColor(finish:string){return finishes[finish]??'#514133';}
function fixtureFinish(product:LightingProduct,values:Values):string {
  const selected=String(values.railingColor??'black');
  // The lantern has different published finish names for its two mounting
  // families. Do not order an IRE White/Black housing for a Composite sleeve,
  // whose matching products are Matte White/Matte Black/Matte Espresso.
  const available=product.id==='tt-lantern'
    ?railStyle(values).takeoffSystem==='timbertech-ire'
      ?['white','black','dark-bronze']:['matte-white','matte-black','matte-espresso']
    :product.finishes;
  if(available.includes(selected)||available.includes('match-cap'))return selected;
  const equivalents=selected.includes('white')?['white','matte-white']:
    selected.includes('black')?['black','matte-black']:['dark-bronze','architectural-bronze','matte-espresso'];
  const matching=available.find(finish=>equivalents.includes(finish));
  return matching??(available.includes('architectural-bronze')?'architectural-bronze':available[0]);
}
function inPolygon(point:V2,polygon:readonly V2[]):boolean {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function containsDisc(point:V2,radius:number,polygon:readonly V2[]):boolean {
  return Array.from({length:12},(_,i)=>[point[0]+Math.cos(i*Math.PI/6)*radius,point[1]+Math.sin(i*Math.PI/6)*radius] as V2)
    .every(p=>inPolygon(p,polygon));
}
export interface CeilingLightBounds {left:number;right:number;rear:number;front:number}
/** Plan complete, centred rows before testing obstructions. Moving a mirrored
 * pair together keeps a fan or truss from leaving a ragged partial grid.
 * Three cans begin as a centred row; four begin as a two-by-two rectangle.
 * Alternate balanced rows can surround a central fan without placing a can
 * inside its blade sweep. No random/dense-grid fallback changes the symmetry. */
export function planCanLightStations(count:number,layout:'grid'|'perimeter',bounds:CeilingLightBounds,
 canPlace:(point:V2)=>boolean=()=>true):V2[]{
  const {left,right,rear,front}=bounds,w=right-left,d=front-rear;
  if(w<=.5||d<=.5||count<1)return [];
  const requested=Math.min(24,Math.floor(count)),wide=w>=d;
  const rowPlans=(n:number):number[][]=>{
    const preferred:Record<number,number[]>={1:[1],2:[2],3:[3],4:[2,2],5:[2,1,2],6:[3,3],7:[2,3,2],8:Math.max(w,d)/Math.min(w,d)>1.65?[4,4]:[3,2,3]};
    const choices:number[][]=[];
    if(preferred[n])choices.push(preferred[n]);
    const rows=Array.from({length:Math.min(n,6)},(_,i)=>i+1)
      .sort((a,b)=>Math.abs(n/a/a-Math.max(w,d)/Math.min(w,d))-Math.abs(n/b/b-Math.max(w,d)/Math.min(w,d)));
    for(const total of rows){
      const base=Math.floor(n/total),row=Array(total).fill(base) as number[];
      let remaining=n-base*total;
      if(total%2&&remaining%2){row[Math.floor(total/2)]++;remaining--;}
      for(let pair=0;remaining>=2&&pair<Math.floor(total/2);pair++,remaining-=2){row[pair]++;row[total-1-pair]++;}
      // An odd count in two rows is a centred triangle/paired row, never
      // a partly filled row whose last light sits to one side.
      if(remaining)row[Math.floor((total-1)/2)]++;
      if(!choices.some(existing=>existing.join(',')===row.join(',')))choices.push(row);
    }
    return choices;
  };
  for(let target=requested;target>0;target--){
    for(const rows of rowPlans(target))for(const longAcross of [wide,!wide]){
      const normalized=rows.flatMap((inRow,row)=>Array.from({length:inRow},(_,col)=>{
        const x=layout==='perimeter'&&inRow>1?(col/(inRow-1)-.5)*.84:(col+.5)/inRow-.5;
        const z=layout==='perimeter'&&rows.length>1?(row/(rows.length-1)-.5)*.84:(row+.5)/rows.length-.5;
        return [x,z] as V2;
      }));
      for(const sx of [1,1.15,1.3,.85,1.45,.7])for(const sz of [1,1.15,1.3,.85,1.45,.7]){
        // A single row may sit on either side of a central fan; complete
        // multi-row layouts always remain centred on the room.
        for(const shift of rows.length===1?[0,-.24,.24,-.36,.36]:[0]){
          const points=normalized.map(([x,z])=>longAcross
            ?[(left+right)/2+x*sx*w,(rear+front)/2+(z*sz+shift)*d] as V2
            :[(left+right)/2+(z*sz+shift)*w,(rear+front)/2+x*sx*d] as V2);
          if(points.every((p,i)=>p[0]>=left+.17&&p[0]<=right-.17&&p[1]>=rear+.17&&p[1]<=front-.17&&
            canPlace(p)&&points.slice(0,i).every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>=.6)))return points;
        }
      }
    }
  }
  return [];
}
/** The saved deck-light spacing is snapped onto actual visible plank
 * centerlines. Cut seams, picture-frame voids and joist centers are avoided. */
export function planDeckLightStations(model:DeckModel,spacingFt:number):V2[]{
  const strips=surfaceStrips(model),points:V2[]=[],radius=Math.hypot(1.75,1.25)/24;
  const winding=model.points.reduce((s,p,i)=>{const n=model.points[(i+1)%model.points.length];return s+p.x*n.y-n.x*p.y;},0)>=0?1:-1;
  const inset=.7+model.pictureFrameCount*(5.5+.125)/12;
  const footprint=model.points.map(p=>[p.x,p.y] as V2);
  for(const edge of model.exposedSegments){
    const dx=edge.end.x-edge.start.x,dz=edge.end.y-edge.start.y,len=Math.hypot(dx,dz);
    if(len<.5)continue;
    const count=Math.max(1,Math.ceil(len/spacingFt));
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,target:V2=[edge.start.x+dx*t-dz/len*winding*inset,edge.start.y+dz*t+dx/len*winding*inset];
      const candidates:Array<{p:V2;distance:number}>=[];
      for(const strip of strips){
        if(strip.widthFt<radius*2+.01||strip.lengthFt<radius*2+.1)continue;
        const run=strip.axis==='x'?target[0]:target[1];
        for(const shift of [0,.22,-.22,.38,-.38]){
          const station=Math.max(strip.startFt+radius+.05,Math.min(strip.endFt-radius-.05,run+shift));
          const p:V2=strip.axis==='x'?[station,strip.z]:[strip.x,station];
          const distance=Math.hypot(p[0]-target[0],p[1]-target[1]);if(distance>1.1)continue;
          const poly=strip.outline??(strip.axis==='x'
            ?[[strip.startFt,strip.z-strip.widthFt/2],[strip.endFt,strip.z-strip.widthFt/2],[strip.endFt,strip.z+strip.widthFt/2],[strip.startFt,strip.z+strip.widthFt/2]]
            :[[strip.x-strip.widthFt/2,strip.startFt],[strip.x+strip.widthFt/2,strip.startFt],[strip.x+strip.widthFt/2,strip.endFt],[strip.x-strip.widthFt/2,strip.endFt]]) as V2[];
          if(!containsDisc(p,radius,poly)||!containsDisc(p,radius,footprint))continue;
          const joistStation=model.joistDirection==='vertical'?p[0]:p[1];
          if(model.joistPositions.some(v=>Math.abs(v-joistStation)<radius+1.5/24+.03))continue;
          candidates.push({p,distance});
        }
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      const nearest=candidates.find(c=>points.every(p=>Math.hypot(p[0]-c.p[0],p[1]-c.p[1])>=Math.min(1,spacingFt/2)));
      if(nearest)points.push(nearest.p);
    }
  }
  return points;
}
function blankCounts():Record<AddonCategory,number>{return {post:0,'post-cap':0,stair:0,deck:0,fan:0,'can-light':0};}
export function planLightingAddons(project:ConsultationProject,center:V2=[0,0]):LightingAddonPlan {
  const values=project.values,settings=readLightingSettings(values),fixtures:LightingFixture[]=[],issues:string[]=[],notes:string[]=[];
  const requestedCounts=blankCounts(),placedCounts=blankCounts();
  const main=buildDeckModel(values),lower=buildLowerTierDeckModel(values);
  const tiers:Array<{model:DeckModel;tier:LightingTier;height:number;integrated:boolean}>=[
    {model:main,tier:'main',height:height(values),integrated:lightingScreenIntegrated(project)},
    ...(lower?[{model:lower,tier:'lower' as const,height:height(values,true),integrated:false}]:[]),
  ];
  const selected=(id:string,category:LightingCategory):LightingProduct|null=>{
    if(id==='none')return null;
    const product=getLightingProduct(id);
    if(!product||product.category!==category){issues.push('Unrecognized '+category+' lighting choice is retained for review.');return null;}
    const reason=compatibility(values,product);if(reason){issues.push(product.label+': '+reason);return null;}
    return product;
  };
  const post=selected(settings.lightingPostFixture,'post'),cap=selected(settings.lightingPostCapFixture,'post-cap');
  const riser=selected(settings.lightingStairFixture,'stair'),deck=selected(settings.lightingDeckFixture,'deck');
  const add=(product:LightingProduct,tier:LightingTier,extra:Omit<LightingFixture,'category'|'productId'|'label'|'tier'|'finish'|'sourceUrl'|'geometryFidelity'>)=>{
    fixtures.push({...extra,category:product.category,productId:product.id,label:product.label,tier,
      finish:fixtureFinish(product,values),sourceUrl:product.sourceUrl,geometryFidelity:product.geometryFidelity});
  };
  for(const entry of tiers){
    if(!tierSelected(settings,entry.tier))continue;
    const {model,tier,height:deckY,integrated}=entry;
    const enclosureWalls=tier==='main'?stairEnclosureClearanceWalls(model,project,center,deckY):[];
    const stations=lightingRailStations(model,values,center,deckY,integrated,enclosureWalls);
    const guardHeight=limit(values.railingHeightIn,36,36,42)/12;
    const faceStations=patterned(stations,settings.lightingPostPattern),capStations=patterned(stations,settings.lightingPostCapPattern);
    if(settings.lightingPostFixture!=='none')requestedCounts.post+=faceStations.length;
    if(settings.lightingPostCapFixture!=='none')requestedCounts['post-cap']+=capStations.length;
    if(post)faceStations.forEach(station=>{
      const size=post.dimensionsIn!.map(n=>n/12) as LightingPoint;
      const projection=station.postWidthFt/2+size[2]/2;
      add(post,tier,{id:tier+'-post-light-'+station.key,postKey:station.key,mounting:'post-face',sizeFt:size,
        position:[station.point[0]+station.normal[0]*projection,
          Math.max(station.baseY+size[1]/2+.2,station.point[1]+guardHeight-.65),station.point[2]+station.normal[1]*projection],
        rotation:[0,Math.atan2(station.normal[0],station.normal[1]),0]});
    });
    if(cap)capStations.forEach(station=>{
      const size=cap.dimensionsIn?.map(n=>n/12) as LightingPoint|undefined;
      // Undimensioned lanterns use the existing post-cap envelope as a
      // placement symbol, expressly not an invented factory housing size.
      const envelope:LightingPoint=size??[station.postWidthFt+.045,.085,station.postWidthFt+.045];
      add(cap,tier,{id:tier+'-cap-light-'+station.key,postKey:station.key,mounting:'post-top',sizeFt:envelope,
        position:[station.point[0],station.point[1]+guardHeight+.0285+envelope[1]/2,station.point[2]],rotation:[0,0,0]});
    });
    if(settings.lightingStairFixture!=='none')requestedCounts.stair+=model.stairPlacements.length*
      (settings.lightingStairPattern==='all'?model.stairTreadsPerRun:Math.ceil(model.stairTreadsPerRun/2))*settings.lightingStairPerRiser;
    if(riser&&model.stairCount>0&&values.stairRiserStyle!=='open'){
      model.stairPlacements.forEach((placement,flightIndex)=>{
        const frame=stairFlightFrame(model,placement,center);if(!frame)return;
        const treads=Math.max(1,model.stairTreadsPerRun),rise=deckY/Math.max(1,model.stairRisers),treadDepth=Math.max(.65,model.stairRunFt/treads);
        const dims=riser.dimensionsIn!.map(n=>n/12) as LightingPoint;
        if(dims[1]>rise-.08||dims[0]*settings.lightingStairPerRiser>frame.widthFt-.2){
          issues.push(tier+' stair '+(flightIndex+1)+': the selected riser fixture does not fit the actual riser face.');return;
        }
        for(let i=0;i<treads;i++){
          if(settings.lightingStairPattern==='alternating'&&i%2)continue;
          for(let n=0;n<settings.lightingStairPerRiser;n++){
            const cross=frame.widthFt*((n+.5)/settings.lightingStairPerRiser-.5);
            // This is the same closed-riser plane and vertical center used
            // by DeckStairAssembly3D, including the final visible riser.
            const projection=(riser.projectionIn??riser.dimensionsIn![2])/12;
            const along=(i+1)*treadDepth-.004+.035+projection-dims[2]/2;
            add(riser,tier,{id:tier+'-riser-'+flightIndex+'-'+i+'-'+n,flightIndex,riserIndex:i,mounting:'riser-face',sizeFt:dims,
              position:[frame.originX+Math.cos(frame.yaw)*cross+frame.outwardX*along,
                Math.max(.09,deckY-(i+1)*rise)-rise/2+.04,
                frame.originZ-Math.sin(frame.yaw)*cross+frame.outwardZ*along],rotation:[0,frame.yaw,0]});
          }
        }
      });
    }
    if(settings.lightingDeckFixture!=='none'){
      const boardStations=planDeckLightStations(model,settings.lightingDeckSpacingFt);
      requestedCounts.deck+=boardStations.length;
      if(deck&&boardStations.length===0)
        issues.push('In-deck lighting is saved for the '+tier+' deck; no board positions fit the fixture clear of modeled edges, seams and joists. Adjust the deck or picture-frame layout.');
      if(deck)boardStations.forEach((p,i)=>{
        const dims=deck.dimensionsIn!.map(n=>n/12) as LightingPoint;
        add(deck,tier,{id:tier+'-deck-light-'+i,mounting:'board-centerline',sizeFt:dims,
          position:[p[0]-center[0],deckY+.0625-dims[1]/2+.006,p[1]-center[1]],rotation:[0,0,0]});
      });
    }
  }
  if(settings.lightingTier==='lower'&&!lower&&[post,cap,riser,deck].some(Boolean))
    issues.push('Lighting is assigned to the lower deck, which is not enabled.');
  if(settings.lightingStairFixture!=='none'&&requestedCounts.stair===0)
    issues.push('Riser lighting is saved; add a stair flight to place the fixtures.');
  if((settings.lightingPostFixture!=='none'||settings.lightingPostCapFixture!=='none')&&requestedCounts.post+requestedCounts['post-cap']===0)
    issues.push('Post lighting is saved; no selected railing posts exist on the selected deck tiers.');

  requestedCounts.fan=settings.patioFanCount;requestedCounts['can-light']=settings.patioCanLightCount;
  if(settings.patioFanCount||settings.patioCanLightCount){
    const availability=getOverheadAddonAvailability(project);
    if(!availability.fans)issues.push(availability.reason!);
    else {
      const cover=planRenaissanceCoverWalls(main,project,[center[0],center[1]],height(values));
      const {plan,xMid,theoreticalBack,theoreticalFront,frameLeft,frameRight,back,frameFront}=cover;
      const isClassico=getCoverVisualProduct(project.coverFamily).family==='full-trusses';
      const left=frameLeft+.5,right=frameRight-.5,rear=back+.5,front=frameFront-.5;
      const usableW=Math.max(0,right-left),usableD=Math.max(0,front-rear);
      const roofBack=theoreticalBack-plan.rearOverhangFt,roofFront=theoreticalFront+plan.frontOverhangFt;
      const rearY=plan.gable?plan.frontTopFt:plan.backTopFt+plan.rearOverhangFt*plan.pitchInPerFt/12;
      const frontY=plan.gable?plan.frontTopFt:plan.frontTopFt-plan.frontOverhangFt*plan.pitchInPerFt/12;
      const studioSlope=Math.atan2(rearY-frontY,plan.roofProjectionFt);
      const gableSlope=Math.atan2(plan.ridgeTopFt-plan.backTopFt,plan.roofWidthFt/2);
      const soffit=(x:number,z:number)=>{
        const slope=plan.gable?gableSlope:studioSlope;
        const roof=plan.gable?plan.frontTopFt+(plan.ridgeTopFt-plan.backTopFt)*(1-Math.abs(x-xMid)/(plan.roofWidthFt/2)):
          (rearY+frontY)/2-Math.tan(studioSlope)*(z-(roofBack+roofFront)/2);
        return roof-RENAISSANCE_INSULATED_ROOF.defaultThicknessIn/24/Math.cos(slope);
      };
      const rotationAt=(x:number):LightingPoint=>plan.gable?[0,0,-Math.sign(x-xMid)*gableSlope]:[studioSlope,0,0];
      const footprint=main.points.map(p=>[p.x-center[0],p.y-center[1]] as V2);
      const trusses=plan.projectionTrussStationsFt.map(x=>x+xMid);
      const fanDiameter=52/12,fanRadius=fanDiameter/2,fanSites:V2[]=[];
      const fanDrop=settings.patioFanMount==='low-profile'?8/12:1;
      // ENERGY STAR's general placement guidance supplies the 18-inch
      // wall and 7-foot floor minimums. Final fixture instructions govern.
      // The usable rectangle is already 6 inches inside the cover walls.
      const fanMargin=fanRadius+1;
      const maxCols=Math.floor((usableW-2+.25)/(fanDiameter+.25));
      const maxRows=Math.floor((usableD-2+.25)/(fanDiameter+.25));
      if(settings.patioFanCount&&maxCols>0&&maxRows>0){
        let cols=Math.min(maxCols,Math.max(1,Math.ceil(Math.sqrt(settings.patioFanCount*usableW/Math.max(1,usableD)))));
        if(Math.ceil(settings.patioFanCount/cols)>maxRows)cols=Math.min(maxCols,Math.ceil(settings.patioFanCount/maxRows));
        const rows=Math.min(maxRows,Math.ceil(settings.patioFanCount/cols));
        for(let row=0;row<rows;row++){
          const inRow=Math.min(cols,settings.patioFanCount-row*cols);
          const bias=settings.patioFanLayout==='front'?.75:settings.patioFanLayout==='rear'?.25:.5;
          const z=rows===1?rear+fanMargin+(usableD-fanMargin*2)*bias:
            rear+fanMargin+(usableD-fanMargin*2)*row/(rows-1);
          for(let col=0;col<inRow;col++){
            const desired=inRow===1?(left+right)/2:left+fanMargin+(usableW-fanMargin*2)*col/(inRow-1);
            const choices=isClassico?[...trusses].sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired)):[desired];
            const x=choices.find(x=>x-fanRadius>=left+1-1e-8&&x+fanRadius<=right-1+1e-8&&containsDisc([x,z],fanRadius,footprint)&&
              soffit(x,z)-(isClassico?RENAISSANCE_TRUSS.outsideHeightIn/12:0)-fanDrop-.04>=height(values)+.0625+7&&
              fanSites.every(p=>Math.hypot(p[0]-x,p[1]-z)>fanDiameter+.1));
            if(x!==undefined)fanSites.push([x,z]);
          }
        }
      }
      fanSites.forEach(([x,z],i)=>{
        const y=soffit(x,z)-(isClassico?RENAISSANCE_TRUSS.outsideHeightIn/12:0);
        fixtures.push({id:'main-patio-fan-'+i,category:'fan',productId:settings.patioFanLight?'generic-patio-fan-52-with-light':'generic-patio-fan-52',
          label:'Generic 52-inch outdoor patio fan'+(settings.patioFanLight?' with integrated light':''),tier:'main',position:[x,y,z],rotation:rotationAt(x),
          sizeFt:[fanDiameter,fanDrop,fanDiameter],finish:settings.patioFanFinish,mounting:'ceiling',
          mountStyle:settings.patioFanMount,hasLight:settings.patioFanLight,geometryFidelity:'generic-concept'});
      });
      const count=settings.patioCanLightCount,canRadius=4/24;
      const lightSites=planCanLightStations(count,settings.patioCanLightLayout,{left,right,rear,front},p=>
        containsDisc(p,canRadius,footprint)&&fanSites.every(f=>Math.hypot(f[0]-p[0],f[1]-p[1])>=fanRadius+.3)&&
        (!isClassico||trusses.every(x=>Math.abs(x-p[0])>=canRadius+RENAISSANCE_TRUSS.outsideWidthIn/24+.04)));
      lightSites.forEach(([x,z],i)=>fixtures.push({id:'main-can-light-'+i,category:'can-light',productId:'generic-recessed-can-4',
        label:'Generic 4-inch recessed patio can light',tier:'main',position:[x,soffit(x,z),z],rotation:rotationAt(x),
        sizeFt:[4/12,.08,4/12],finish:settings.patioCanLightFinish,mounting:'ceiling',geometryFidelity:'generic-concept'}));
      if(fanSites.length<settings.patioFanCount)issues.push('The current cover fits '+fanSites.length+' of '+settings.patioFanCount+' selected 52-inch fan(s) with 7-foot blade height and 18-inch wall clearance; adjust count, cover height or layout.');
      if(lightSites.length<count)issues.push('The current ceiling layout fits '+lightSites.length+' of '+count+' selected recessed light(s) clear of fans and trusses.');
    }
  }
  fixtures.forEach(f=>placedCounts[f.category]++);
  const groups=new Map<string,{fixture:LightingFixture;count:number}>();
  fixtures.forEach(f=>{const key=f.productId+'|'+f.finish;const group=groups.get(key);if(group)group.count++;else groups.set(key,{fixture:f,count:1});});
  const materials:MaterialItem[]=[...groups.values()].map(({fixture,count})=>({
    name:fixture.label,category:fixture.category==='fan'?'Patio fans':'Outdoor lighting',quantity:count,unit:'ea',color:fixture.finish,
    stockRecommendation:fixture.sourceUrl?'Confirm current manufacturer order code and installation accessories':'Generic fixture allowance — final manufacturer/model to be selected',
    notes:(fixture.sourceUrl?'Manufacturer reference: '+fixture.sourceUrl+'. ':'')+
      (fixture.category==='fan'?'Generic '+fixture.mountStyle+' mount shown with '+Math.round(fixture.sizeFt[1]*12)+'-inch visualization drop; '+(fixture.hasLight?'integrated light included in each fan allowance; ':'fan without integrated light; ')+'final model dimensions must be confirmed. ':'')+
      (fixture.geometryFidelity==='mounting-symbol'?'3D shows the verified mounting location; the published source does not dimension the housing. ':'')+
      'Quantity equals the saved, placed fixtures in the 3D plan. Electrical supply, wiring, approved mounting and controls are separate scope.',
  }));
  if(fixtures.some(f=>f.sourceUrl))notes.push('TimberTech fixtures use published compatibility and dimensions where available. Confirm exact current finish/order codes, wiring routes, accessible connections, transformer/circuit design and local installation requirements from the linked manufacturer guides; no wiring length, transformer capacity or electrical price is inferred.');
  if(settings.patioFanCount||settings.patioCanLightCount)notes.push('Patio fans and recessed can lights are generic selection allowances. Count and placement are saved; final outdoor rating, model, electrical load, fan-rated support, blade clearance and approved roof penetration/mounting details remain to be selected. General fan placement reference: '+GENERIC_FAN_PLACEMENT_REFERENCE);
  if(deck)notes.push('In-deck lights are placed on visible board centerlines clear of modeled joist centers. Confirm actual blocking, under-deck access and low-foot-traffic locations before drilling.');
  return {settings,fixtures,materials,requestedCounts,placedCounts,issues:[...new Set(issues)],notes};
}
