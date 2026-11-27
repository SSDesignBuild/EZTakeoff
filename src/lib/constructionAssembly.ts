import {planStairFasciaStockPieces} from './stairFasciaCuts';
import {buildConstructionSkirting} from './constructionSkirting';
import { buildDeckModel,buildLowerTierDeckModel,type DeckModel } from './deckModel';
import type { DeckPoint } from './types';
import type { ConsultationProject } from './consultationProject';
import { planRimPlies,planJoistCuts,planPostSaddleCheeks,framingDepthFt,memberFootprint,FRAMING_PLY_FT,type FramingCut } from './constructionFraming';
import { actualPostWidthFt } from './visualStructure';
import { resolvePictureFrameMaterials,resolveBreakerBoardMaterials,resolveFasciaMaterial,resolveStairSideFasciaMaterial,hasDecorativeStairFascia,stairFasciaDimensionOverrides } from './deckTrimSelection';
import { resolveBoardDimensions,resolveFasciaDimensions } from './deckProductDimensions';
import { planDeckFasciaCuts,planSubfloorCuts } from './constructionFinish';
import { planPhysicalDeckBoards } from './deckPhysicalFinish';
import { finishFastenerItems } from './deckFinishFasteners';
import { planConstructionStair } from './constructionStairs';
import { planStairFasciaCoverage } from './stairFasciaGeometry';
import { planStairLandingForValues,landingSurface } from './stairConcreteLanding';
import { planConstructionRailing,constructionStairRailBay,carriageBoltSetsPerRailPost } from './constructionRailing';
import { railPointKey,resolveDrinkRailMaterial,railingEdgePoint } from './railingLayout';
import { stairDrinkPostVertices } from './stairRailVisualGeometry';

export type ConstructionValues=Record<string,string|number|boolean>;
export interface ConstructionPoint3 { x:number;y:number;z:number; }
export type ConstructionPartKind='post'|'footing'|'beam'|'joist'|'rim'|'flat-nailer'|'field-board'|'picture-frame'|'breaker'|'fascia'|'stair-stringer'|'tread'|'riser'|'stair-fascia'|'landing'|'rail-post'|'rail'|'picket'|'glass'|'cable'|'drink-rail'|'skirt-board'|'skirt-support'|'gate'|'subfloor';
export interface ConstructionSource {module:string;authority:string;notes:string[];url?:string;}
export interface ConstructionPart {
  id:string;tierId:'M'|'L';kind:ConstructionPartKind;assemblyId:string;label:string;
  material:string;nominalSize?:string;dressed:{widthIn:number;depthIn:number};
  footprint:DeckPoint[];axis:{from:ConstructionPoint3;to:ConstructionPoint3};
  zBottom:number;zTop:number;cutLengthFt:number;quantity:1;
  /** Source member/cut reference; purchasing stock is never another installed part. */
  stockReference?:string;source:ConstructionSource;
  geometryStatus:'derived'|'representative';purchaseRole:'cut-part'|'kit-component'|'assembly';
  profile?:{stationFt:number;elevationFt:number}[];
  /** End cuts and pitched rails can have varying heights at their footprint vertices. */
  vertices?:ConstructionPoint3[];
}
export interface ConstructionConnection {
  id:string;tierId:'M'|'L';kind:string;partIds:string[];point:ConstructionPoint3;
  hardware:{name:string;quantity:number;unit:string;spec?:string}[];
  /** A placement anchor is NEVER an unevidenced fabrication/drill-hole pattern. */
  holePattern:null;geometryStatus:'placement-only';source:ConstructionSource;
}
export interface ConstructionTier {id:'M'|'L';label:string;deck:DeckModel;heightFt:number;values:ConstructionValues;}
export interface ConstructionAssembly {
  units:'ft';coordinateSystem:'x/y plan, z elevation';tiers:ConstructionTier[];
  parts:ConstructionPart[];connections:ConstructionConnection[];issues:string[];notes:string[];
}
export interface ConstructionAssemblyOptions {project?:ConsultationProject;}

const point3=(p:DeckPoint,z:number):ConstructionPoint3=>({...p,z});
const source=(module:string,authority:string,notes:string[]=[],url?:string):ConstructionSource=>({module,authority,notes,...(url?{url}:{})});
const rect=(center:DeckPoint,w:number,d=w):DeckPoint[]=>[
  {x:center.x-w/2,y:center.y-d/2},{x:center.x+w/2,y:center.y-d/2},
  {x:center.x+w/2,y:center.y+d/2},{x:center.x-w/2,y:center.y+d/2}];
const mid=(a:DeckPoint,b:DeckPoint):DeckPoint=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const length=(a:DeckPoint,b:DeckPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const pad=(n:number)=>String(n).padStart(3,'0');
function partFor(tier:ConstructionTier,id:string,kind:ConstructionPartKind,assemblyId:string,material:string,
 footprint:DeckPoint[],from:DeckPoint,to:DeckPoint,zBottom:number,zTop:number,widthFt:number,cutLengthFt:number,
 provenance:ConstructionSource,extra:Partial<ConstructionPart>={}):ConstructionPart{
  return {id:`${tier.id}-${id}`,tierId:tier.id,kind,assemblyId:`${tier.id}-${assemblyId}`,label:`${tier.id}-${id}`,
    material,dressed:{widthIn:widthFt*12,depthIn:(zTop-zBottom)*12},footprint,
    axis:{from:point3(from,(zBottom+zTop)/2),to:point3(to,(zBottom+zTop)/2)},zBottom,zTop,cutLengthFt,quantity:1,
    source:provenance,geometryStatus:'derived',purchaseRole:'cut-part',...extra};
}
function addConnection(a:ConstructionAssembly,tier:ConstructionTier,id:string,kind:string,parts:ConstructionPart[],point:ConstructionPoint3,
 hardware:ConstructionConnection['hardware'],module:string,notes:string[]=[]){
  a.connections.push({id:`${tier.id}-C-${id}`,tierId:tier.id,kind,partIds:[...new Set(parts.map(p=>p.id))],point,hardware,
    holePattern:null,geometryStatus:'placement-only',source:source(module,'Shared part intersection / selected takeoff hardware',[
      'Anchor indicates the assembly location; manufacturer hole centers, fastener embedment and connection capacity are not inferred.',...notes])});
}
function addFraming(a:ConstructionAssembly,tier:ConstructionTier){
  const {deck,heightFt}=tier,joistDepth=framingDepthFt(deck.joistSize),beamDepth=framingDepthFt(deck.beamMemberSize);
  const top=heightFt-deck.deckBoardThicknessFt,joistBottom=top-joistDepth,beamBottom=joistBottom-beamDepth;
  const rims=planRimPlies(deck.points,deck.edgeSegments),joists=planJoistCuts(deck.points,deck.edgeSegments,deck.joistDirection,deck.joistPositions,rims);
  const addCut=(cut:FramingCut,kind:'rim'|'joist')=>{
    const part=partFor(tier,cut.id,kind,'FR',`Pressure-treated ${deck.joistSize}`,cut.footprint,cut.from,cut.to,
      joistBottom,top,cut.widthFt,cut.lengthFt,source('constructionFraming.ts','Dressed 1.5-in framing; shared polygon cut geometry',
        kind==='rim'?['Horizontal perimeter members pass square corners; adjoining members butt or are scribed to their exact footprints.']:['End faces terminate at actual double-rim faces.']),
      {nominalSize:deck.joistSize,stockReference:kind==='joist'?`${deck.joistStockLength}-ft joist stock`:'Double-band cut schedule'});
    a.parts.push(part);return part;
  };
  const rimParts=rims.map(c=>addCut(c,'rim')),joistParts=joists.map(c=>addCut(c,'joist'));
  const beamParts:ConstructionPart[]=[];
  const addBeam=(id:string,from:DeckPoint,to:DeckPoint)=>{
    const l=length(from,to),normal={x:-(to.y-from.y)/l,y:(to.x-from.x)/l};
    for(let ply=0;ply<2;ply++){
      const offset=(ply===0?-1:1)*FRAMING_PLY_FT/2;
      const p={x:from.x+normal.x*offset,y:from.y+normal.y*offset},q={x:to.x+normal.x*offset,y:to.y+normal.y*offset};
      const part=partFor(tier,`${id}-P${ply+1}`,'beam','FR',deck.beamMemberSize==='PSL'?'Supplier-specified PSL':`Pressure-treated ${deck.beamMemberSize}`,
        memberFootprint(p,q,FRAMING_PLY_FT),p,q,beamBottom,joistBottom,FRAMING_PLY_FT,l,
        source('deckModel.ts / constructionFraming.ts','Selected beam stations and dressed independent plies',
          deck.beamMemberSize==='PSL'?['PSL section is a representative envelope; supply approved width, depth, grade and ply detail before fabrication.']:[]),
        {nominalSize:deck.beamMemberSize,stockReference:'Beam member cut schedule',geometryStatus:deck.beamMemberSize==='PSL'?'representative':'derived'});
      if(l>20)a.notes.push(`${part.id}: continuous ${l.toFixed(3)}-ft beam exceeds ordinary 20-ft lumber; provide a supported splice or engineered member detail.`);
      a.parts.push(part);beamParts.push(part);
    }
  };
  deck.beamLines.forEach((line,index)=>line.segments.forEach((segment,i)=>addBeam(`B${index+1}-S${i+1}`,
    deck.joistDirection==='vertical'?{x:segment.startX,y:line.y}:{x:line.y,y:segment.startX},
    deck.joistDirection==='vertical'?{x:segment.endX,y:line.y}:{x:line.y,y:segment.endX})));
  deck.angledBeamLines.forEach(line=>addBeam(`BA${line.edgeIndex+1}`,line.start,line.end));
  for(const post of deck.postLocations){
    const p={x:post.x,y:post.y},w=actualPostWidthFt(deck.postSize),baseZ=0;
    const cheekRiseFt=.36,topZ=Math.max(baseZ,beamBottom+cheekRiseFt);
    const part=partFor(tier,`P-${post.reference}`,'post','FR',`Pressure-treated ${deck.postSize}`,rect(p,w),p,p,baseZ,topZ,w,topZ-baseZ,
      source('deckModel.ts / visualStructure.ts','Shared support-post setout; representative legacy saddle-notch envelope',[
        'Post-to-beam connection detail is unresolved; final post end/notch cuts and drilling require the approved job detail.',
        'Visual saddle slot is corrected to the actual3-in beam pack. The retained4.32-in cheek rise is not a verified cut dimension.']),
      {nominalSize:deck.postSize,dressed:{widthIn:w*12,depthIn:w*12},stockReference:`${deck.postLength}-ft post stock`,axis:{from:point3(p,baseZ),to:point3(p,topZ)},geometryStatus:'representative',
        vertices:[...rect(p,w).flatMap(q=>[point3(q,baseZ),point3(q,beamBottom)]),...planPostSaddleCheeks(deck,post,w).flatMap(poly=>poly.flatMap(q=>[point3(q,beamBottom),point3(q,topZ)]))]});
    a.parts.push(part);
    const radius=deck.footingDiameterIn/24,footprint=Array.from({length:48},(_,i)=>({x:p.x+radius*Math.cos(i*Math.PI/24),y:p.y+radius*Math.sin(i*Math.PI/24)}));
    const footer=partFor(tier,`F-${post.reference}`,'footing','FOUNDATION','Concrete',footprint,p,p,-deck.footingDepthIn/12,0,deck.footingDiameterIn/12,deck.footingDepthIn/12,
      source('deckModel.ts','Editable configured footing dimensions',[
        'Owner dimensions are not a universal frost depth or structural specification.','Circular footprint is tessellated for CAD; exact diameter is in dressed.widthIn.']),
      {purchaseRole:'assembly',dressed:{widthIn:deck.footingDiameterIn,depthIn:deck.footingDepthIn},axis:{from:point3(p,-deck.footingDepthIn/12),to:point3(p,0)}});
    a.parts.push(footer);
    addConnection(a,tier,`BASE-${post.reference}`,'post-base',[part,footer],point3(p,0),[
      {name:`${deck.postSize} post base`,quantity:1,unit:'ea'},{name:'Concrete anchor',quantity:1,unit:'ea'}],'deckModel.ts');
    const supporting=beamParts.filter(b=>{
      const dx=b.axis.to.x-b.axis.from.x,dy=b.axis.to.y-b.axis.from.y,l2=dx*dx+dy*dy;
      const t=l2?Math.max(0,Math.min(1,((p.x-b.axis.from.x)*dx+(p.y-b.axis.from.y)*dy)/l2)):0;
      return Math.hypot(p.x-b.axis.from.x-t*dx,p.y-b.axis.from.y-t*dy)<=FRAMING_PLY_FT/2+1e-6;
    });
    addConnection(a,tier,`BEARING-${post.reference}`,'post-to-beam',[part,...supporting],point3(p,beamBottom+cheekRiseFt/2),
      [{name:'Carriage bolt sets',quantity:2,unit:'sets'}],'deckModel.ts',['Two sets are the existing post-to-beam connection allowance; approved post detail determines hardware and drilling. No individual bolt hole centers are shown.']);
    if(beamBottom<=0)a.issues.push(`${tier.label}: selected deck elevation leaves no positive support-post length beneath the dropped beam.`);
  }
  if(deck.postLocations.length)a.notes.push('Post-to-beam connection detail is unresolved; final post end/notch cuts and drilling require the approved job detail.');
  const framingById=new Map([...joistParts,...rimParts,...beamParts].map(p=>[p.id,p]));
  for(const end of deck.hardware.joistEnds){
    const parts=[end.joistId,...end.rimIds].flatMap(id=>{const p=framingById.get(`${tier.id}-${id}`);return p?[p]:[];});
    addConnection(a,tier,end.id,'joist-end',parts,point3(end.point,(joistBottom+top)/2),
      [{name:`${deck.joistSize} ${end.angled?'angled ':''}joist hanger`,quantity:1,unit:'ea'}],'deckHardwareGeometry.ts');
  }
  for(const contact of deck.hardware.beamContacts){
    const parts=[contact.joistId,`${contact.beamId}-P1`,`${contact.beamId}-P2`].flatMap(id=>{const p=framingById.get(`${tier.id}-${id}`);return p?[p]:[];});
    addConnection(a,tier,contact.id,'joist-to-beam',parts,point3(contact.point,joistBottom),
      [{name:'Rafter/hurricane tie',quantity:1,unit:'ea'}],'deckHardwareGeometry.ts');
  }
  for(const piece of deck.finishSupport.pieces){
    a.parts.push(partFor(tier,piece.id,'flat-nailer',piece.kind==='breaker'?'BR-SUPPORT':'PF-SUPPORT',`Pressure-treated ${piece.nominalSize}`,
      piece.corners,piece.from,piece.to,top-piece.thicknessFt,top,piece.widthFt,piece.lengthFt,
      source('deckFinishSupport.ts','Shared continuous flat backing and optimized stock cuts',[
        `Stock wide face ${piece.stockWidthFt*12}in; rip to ${piece.widthFt*12}in where shown.`,
        'Connection hardware and allowable flat-member spans require the selected approved design; no fastener pattern inferred.']),
      {nominalSize:piece.nominalSize,stockReference:deck.finishSupport.stock.filter(s=>s.cutIds.includes(piece.id)).map(s=>`${s.nominalSize}×${s.stockLengthFt}ft [${piece.id}]`).join('; ')}));
  }
}
function addFinish(a:ConstructionAssembly,tier:ConstructionTier){
  const {deck,values,heightFt}=tier;
  const fieldName=String(values.deckingMaterial??'Selected decking'),frameNames=resolvePictureFrameMaterials(values),breakerNames=resolveBreakerBoardMaterials(values);
  const boardSource=(name:string,notes:string[]=[])=>{const d=resolveBoardDimensions(name,{faceIn:name===fieldName?Number(values.deckBoardFaceIn):undefined,thicknessIn:name===fieldName?Number(values.deckBoardThicknessIn):undefined});
    return source('deckSurfaceLayout.ts / deckProductDimensions.ts',`${d.authority} dressed dimensions`,notes,d.sourceUrl);};
  for(const board of planPhysicalDeckBoards(deck)){
    const name=board.kind==='field-board'?fieldName:board.kind==='picture-frame'?frameNames[board.course]:breakerNames[board.course];
    const assemblyId=board.kind==='field-board'?'DECKING':board.kind==='picture-frame'?`PF-C${board.course+1}`:`BR-C${board.course+1}`;
    a.parts.push(partFor(tier,board.id,board.kind,assemblyId,name,board.footprint,board.from,board.to,
      heightFt-board.thicknessFt,heightFt,board.widthFt,board.lengthFt,boardSource(name),
      {nominalSize:'Deck board',stockReference:`${board.kind} course${board.course+1} cut plan`}));
  }
  if(deck.deckingSurface==='subfloor'){
    for(const sheet of planSubfloorCuts(deck))a.parts.push(partFor(tier,sheet.id,'subfloor','SUBFLOOR','Exterior-rated3/4-in subfloor',
      sheet.footprint,sheet.from,sheet.to,heightFt-.75/12,heightFt,sheet.widthFt,sheet.lengthFt,
      source('constructionFinish.ts','Configured4×8×3/4-in staggered sheet layout',[
        'Physical cut outlines exclude waste allowance. Verify panel edge support and selected sheet fastening schedule.']),
      {nominalSize:'4x8x3/4 sheet',stockReference:`4×8 sheet ${sheet.sheetId}`}));
    a.notes.push(`${tier.label}: subfloor uses actual4×8×3/4-in sheet cuts. Panel edge support and supplier fastener spacing require the selected subfloor installation detail.`);
  }
  for(const cut of planDeckFasciaCuts(deck)){
    const depth=deck.fasciaThicknessFt,face=Math.min(deck.fasciaFaceFt,framingDepthFt(deck.joistSize)),from=cut.from,to=cut.to;
    const dimensions=resolveFasciaDimensions(resolveFasciaMaterial(values),{faceIn:Number(values.fasciaFaceIn),thicknessIn:Number(values.fasciaThicknessIn)});
    const part=partFor(tier,cut.id,'fascia','FASCIA',resolveFasciaMaterial(values),cut.footprint,from,to,
      heightFt-deck.deckBoardThicknessFt-face,heightFt-deck.deckBoardThicknessFt,depth,cut.lengthFt,
      source('constructionFinish.ts / deckProductDimensions.ts',`${dimensions.authority} fascia dimensions`,['Fascia ripped to rim height; physical outside corner cuts and12-ft stock seams.'],dimensions.sourceUrl),
      {nominalSize:'12-in nominal fascia',dressed:{widthIn:face*12,depthIn:depth*12},stockReference:'12-ft fascia cut plan'});
    a.parts.push(part);
  }
  const byId=new Map(a.parts.filter(p=>p.tierId===tier.id).map(p=>[p.id,p]));
  for(const contact of deck.hardware.boardContacts){
    const board=byId.get(`${tier.id}-${contact.boardId}`);if(!board)continue;
    const supports=contact.supportIds.flatMap(id=>{const part=byId.get(`${tier.id}-${id}`);return part?[part]:[];});
    const unresolved=Math.abs(contact.verticalOffsetFt)>1e-7;
    if(unresolved)a.notes.push(`${tier.label}: ${board.material} ${board.kind} thickness differs from field decking by ${Math.abs(contact.verticalOffsetFt*12).toFixed(3)}in. An approved leveling/rebate detail is required for flush finish tops. No leveling material or structural notch is invented.`);
    addConnection(a,tier,contact.id,unresolved?'board-fastener-allowance':'deck-board-bearing',unresolved?[board]:[board,...supports],point3(contact.point,board.zBottom),
      finishFastenerItems(values,board.material,contact.boardKind==='field-board'?'field':'trim',contact.fasteners),
      'deckHardwareGeometry.ts',['Two-fastener contact allowance; exact edge distances/clip system follow selected manufacturer detail.',
        ...(unresolved?[`Unresolved vertical difference ${contact.verticalOffsetFt*12}in above/below ${supports.map(p=>p.id).join(', ')}. This is a fastener allowance, not a verified bearing connection.`]:[])]);
  }
  if(resolveBoardDimensions(fieldName,{faceIn:Number(values.deckBoardFaceIn),thicknessIn:Number(values.deckBoardThicknessIn)}).authority==='generic')
    a.notes.push(`${tier.label}: decking uses explicitly defined generic 5.5×1-in dimensions; supply selected product dimensions before fabrication.`);
}
function addStairs(a:ConstructionAssembly,tier:ConstructionTier){
  const {deck,values,heightFt}=tier;
  for(const [flight,placement]of deck.stairPlacements.entries()){
    const stair=planConstructionStair(deck,placement,heightFt,values);if(!stair)continue;
    const id=`ST${(placement.sourceIndex??flight)+1}`,half=stair.widthFt/2;
    a.notes.push(...stair.coverageNotes.map(note=>`${tier.label} ${id}: ${note}`));
    const treadName=String(!values.stairTreadStyle||values.stairTreadStyle==='match'?values.deckingMaterial:values.stairTreadStyle);
    const stringers:ConstructionPart[]=[];
    for(const [index,cross]of stair.stringerStations.entries()){
      // planStairStringerFaceStations gives the left extrusion FACE, not center.
      const center=cross-stair.stringerThicknessFt/2,from=stair.at(center,0),to=stair.at(center,stair.runFt);
      const profile=stair.stringerProfile;
      const part=partFor(tier,`${id}-SG${index+1}`,'stair-stringer',id,'Pressure-treated2x12',memberFootprint(from,to,stair.stringerThicknessFt),from,to,
        Math.min(...profile.map(p=>p.elevationFt)),Math.max(...profile.map(p=>p.elevationFt)),stair.stringerThicknessFt,
        stair.stringerCutLengthFt,source('constructionStairs.ts','Shared cut stringer profile from actual riser/tread/stock dimensions',[
          '2x12 lower edge follows the dressed stock; bearing and stringer connection detail require project approval.']),
        {nominalSize:'2x12',dressed:{widthIn:1.5,depthIn:11.25},profile,stockReference:`${deck.stairStringerLength}-ft2x12 stringer stock`,
          axis:{from:point3(from,(profile[0].elevationFt+profile[profile.length-1].elevationFt)/2),
            to:point3(to,(heightFt-stair.treads*stair.riseFt-stair.treadThicknessFt)/2)},
          vertices:profile.flatMap(p=>[-.5,.5].map(side=>point3(stair.at(center+side*stair.stringerThicknessFt,p.stationFt),p.elevationFt)))});
      a.parts.push(part);stringers.push(part);
      addConnection(a,tier,`${id}-SG${index+1}-TOP`,'stringer-to-rim',[part],point3(stair.at(center,0),profile[0].elevationFt),
        [{name:'Stringer top connection allowance',quantity:1,unit:'connections'}],'constructionStairs.ts',
        ['One top connection per actual stringer. Select an approved connector and its required fasteners for the job; no manufacturer SKU, capacity or hole pattern is inferred.']);
    }
    for(const board of stair.treadBoards){
      const from=stair.at(-half,(board.startFt+board.endFt)/2),to=stair.at(half,(board.startFt+board.endFt)/2);
      const footprint=[stair.at(-half,board.startFt),stair.at(half,board.startFt),stair.at(half,board.endFt),stair.at(-half,board.endFt)];
      const part=partFor(tier,`${id}-T${board.step+1}-${board.board+1}`,'tread',id,treadName,footprint,from,to,board.bottomFt,board.topFt,board.endFt-board.startFt,stair.widthFt,
        source('constructionStairs.ts / deckProductDimensions.ts','Shared individual tread board dimensions'),{stockReference:'Stair tread cut plan'});
      a.parts.push(part);
      for(const [i,stringer]of stringers.entries())addConnection(a,tier,`${part.id}-SG${i+1}`,'tread-to-stringer',[part,stringer],
        point3(stair.at(stair.stringerStations[i]-stair.stringerThicknessFt/2,(board.startFt+board.endFt)/2),board.bottomFt),
        finishFastenerItems(values,part.material,'trim',2),'constructionStairs.ts');
    }
    for(const riser of stair.risers){
      const station=riser.stationFt+riser.thicknessFt/2,from=stair.at(-half,station),to=stair.at(half,station);
      const part=partFor(tier,`${id}-RS${riser.step+1}-${riser.board+1}`,'riser',id,stair.riserMaterial,
        memberFootprint(from,to,riser.thicknessFt),from,to,riser.bottomFt,riser.topFt,riser.thicknessFt,stair.widthFt,
        source('constructionStairs.ts','All individual riser faces between measured finished step levels'),{stockReference:'Stair riser cut plan'});
      a.parts.push(part);
      for(const [index,stringer]of stringers.entries()){
        const at=stair.at(stair.stringerStations[index]-stair.stringerThicknessFt/2,riser.stationFt);
        const supports=riser.step>0?[stringer]:a.parts.filter(p=>p.tierId===tier.id&&p.kind==='rim'&&p.id.includes(`R-E${(placement.edgeIndex??-1)+1}-`));
        addConnection(a,tier,`${part.id}-SUP${index+1}`,'riser-to-support',[part,...supports],point3(at,(riser.bottomFt+riser.topFt)/2),
          finishFastenerItems(values,part.material,'trim',2),'constructionStairs.ts',
          ['Pairs are connection allowances at actual support stations, not manufacturer drilling locations.']);
      }
    }
    if(hasDecorativeStairFascia(values)){
      const fasciaDimensions=resolveFasciaDimensions(resolveStairSideFasciaMaterial(values),stairFasciaDimensionOverrides(values));
      const thickness=fasciaDimensions.thicknessIn/12;
      const coverage=planStairFasciaCoverage({treadDepthFt:stair.treadDepthFt,treads:stair.treads,riseFt:stair.riseFt,heightFt,
        style:values.stairFasciaStyle==='straight'?'straight':'profiled',nosingFt:stair.nosingFt,treadThicknessFt:stair.treadThicknessFt,
        boardFaceFt:fasciaDimensions.faceIn/12,boardThicknessIn:fasciaDimensions.thicknessIn});
      const fasciaCuts=planStairFasciaStockPieces(coverage,stair.riseFt,stair.treadDepthFt);
      for(const side of [-1,1])for(const cut of fasciaCuts){
        const i=cut.index,profile=cut.outline;
        if(profile.length<3)continue;const cross=side*(half+thickness/2),start=Math.min(...profile.map(p=>p.runFt)),end=Math.max(...profile.map(p=>p.runFt));
        const from=stair.at(cross,start),to=stair.at(cross,end);
        a.parts.push(partFor(tier,`${id}-SF${side<0?'L':'R'}-${i+1}`,'stair-fascia',id,resolveStairSideFasciaMaterial(values),memberFootprint(from,to,thickness),from,to,
          Math.min(...profile.map(p=>p.riseFt)),Math.max(...profile.map(p=>p.riseFt)),thickness,cut.cutLengthFt,
          source('stairFasciaGeometry.ts','Shared selected fascia silhouette',[],fasciaDimensions.sourceUrl),{nominalSize:'12-in nominal fascia',dressed:{widthIn:fasciaDimensions.faceIn,depthIn:fasciaDimensions.thicknessIn},
            profile:profile.map(p=>({stationFt:p.runFt,elevationFt:p.riseFt})),stockReference:'12-ft fascia stock'}));
      }
    }
    const landing=landingSurface(values.stairLandingSurface)==='bare-ground'?planStairLandingForValues(stair.widthFt,values):null;
    if(landing){
      const from=stair.at(0,stair.runFt),to=stair.at(0,stair.runFt+landing.depthFt);
      a.parts.push(partFor(tier,`${id}-PAD`,'landing',id,'Concrete',memberFootprint(from,to,landing.widthFt),from,to,-landing.thicknessIn/12,0,landing.widthFt,landing.depthFt,
        source('stairConcreteLanding.ts','Shared configured actual pad dimensions',[
          `${landing.volumeCuFt}cu ft actual volume;${landing.orderAllowancePercent}% ordering allowance;${landing.bags80lb}80-lb bags.`]),{purchaseRole:'assembly'}));
    }
  }
}
function addRailing(a:ConstructionAssembly,tier:ConstructionTier,options:ConstructionAssemblyOptions){
  const plan=planConstructionRailing(tier.deck,tier.values,tier.heightFt,{project:options.project,lowerTier:tier.id==='L'});
  const {style,postWidthFt,guardHeightFt:height,topWidthFt,topThicknessFt,wooden,metallic,drink,infill}=plan;
  const sourceRail=source('constructionRailing.ts / railingLayout.ts / stairRailVisualGeometry.ts',
    'Shared selected-system post stations, bay cuts and visual section envelopes',[
      'Rail profiles/infill sections are representative until confirmed against selected manufacturer fabrication drawings.',
      'Rail lengths are measured between actual post faces. Posts and kit subcomponents are not extra purchasable panel kits.'],style.sourcePage);
  const postMap=new Map<string,ConstructionPart>();
  const p3=(p:readonly number[]):ConstructionPoint3=>({x:p[0],y:p[2],z:p[1]});
  const addPost=(id:string,assemblyId:string,point:readonly number[],bottom:number,top:number,vertices?:ConstructionPoint3[])=>{
    const key=railPointKey(point);let existing=postMap.get(key);if(existing)return existing;
    const p={x:point[0],y:point[2]};
    existing=partFor(tier,id,'rail-post',assemblyId,style.label,rect(p,postWidthFt),p,p,bottom,top,postWidthFt,top-bottom,sourceRail,
      {nominalSize:`${style.postWidthIn}×${style.postWidthIn}-in selected post`,purchaseRole:'kit-component',
        dressed:{widthIn:postWidthFt*12,depthIn:postWidthFt*12},
        axis:{from:point3(p,bottom),to:point3(p,top)},...(vertices?{vertices}:{}),stockReference:'Selected railing post kit'});
    a.parts.push(existing);postMap.set(key,existing);
    const bolts=carriageBoltSetsPerRailPost(tier.values);
    addConnection(a,tier,`${id}-BASE`,'rail-post-mount',[existing],point3(p,bottom),
      bolts?[{name:'Carriage bolt sets',quantity:bolts,unit:'sets'}]:[{name:'Selected railing post mounting hardware',quantity:1,unit:'set'}],
      'constructionRailing.ts',['Mounting holes are not provided by the local catalog.',
        ...(bolts?['Two-bolt purchasing allowance retained for selected wood/composite posts; approved mounting detail governs bolt specification and placement.']:[])]);
    return existing;
  };
  const addRail=(id:string,assemblyId:string,kind:ConstructionPartKind,from:ConstructionPoint3,to:ConstructionPoint3,width:number,depth:number,
    posts:ConstructionPart[]=[])=>{
    const l=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
    const part=partFor(tier,id,kind,assemblyId,style.label,memberFootprint(from,to,width),from,to,Math.min(from.z,to.z)-depth/2,Math.max(from.z,to.z)+depth/2,width,l,sourceRail,
      {axis:{from,to},dressed:{widthIn:width*12,depthIn:depth*12},purchaseRole:'kit-component',geometryStatus:'representative',stockReference:'Selected railing panel kit'});
    a.parts.push(part);
    if(kind==='rail'&&posts.length)for(const [i,post]of posts.entries())addConnection(a,tier,`${id}-END${i+1}`,'rail-to-post',[part,post],i===0?from:to,
      [{name:'Selected rail bracket',quantity:1,unit:'ea'}],'constructionRailing.ts');
    return part;
  };
  const addInfill=(id:string,assemblyId:string,from:ConstructionPoint3,to:ConstructionPoint3,isStair:boolean,
    interpolate?:(t:number)=>ConstructionPoint3)=>{
    const span=Math.hypot(to.x-from.x,to.y-from.y),at=interpolate??((t:number)=>({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t}));
    const offset=(p:ConstructionPoint3,z:number)=>({...p,z:p.z+z});
    if(infill==='glass'){
      const bottom=isStair?.43:.04+height/2-(height-.52)/2,top=isStair?height-.31:.04+height/2+(height-.52)/2;
      const f=at(0),t=at(1),part=addRail(`${id}-GLASS`,assemblyId,'glass',offset(f,(bottom+top)/2),offset(t,(bottom+top)/2),.028,top-bottom);
      part.vertices=[offset(f,bottom),offset(t,bottom),offset(t,top),offset(f,top)];return;
    }
    if(infill==='horizontal-cable'){
      for(let i=0;i<9;i++){const z=isStair?.48+i*(height-.84)/8:.46+i*(height-.85)/8;
        addRail(`${id}-CB${i+1}`,assemblyId,'cable',offset(at(0),z),offset(at(1),z),.016,.016);}
      return;
    }
    if(['chippendale','square-web'].includes(infill)){
      addRail(`${id}-X1`,assemblyId,'picket',offset(at(0),.43),offset(at(1),height-.33),.068,.068);
      addRail(`${id}-X2`,assemblyId,'picket',offset(at(0),height-.33),offset(at(1),.43),.068,.068);
      if(infill==='square-web')addRail(`${id}-MID`,assemblyId,'picket',offset(at(0),height/2),offset(at(1),height/2),.05,.05);
      return;
    }
    const count=Math.max(2,Math.ceil(span/(wooden?(isStair?.42:.4):metallic?.39:.43)));
    for(let i=0;i<count;i++){
      const p=at((i+.5)/count),round=infill==='round-black'||infill==='vertical-cable';
      const width=round?(infill==='vertical-cable'?.018:.052):wooden?.125:metallic?.048:.12;
      const bottom=isStair?round?.51:.54:round?.41:.44,top=isStair?round?height-.32:height-.25:round?height-.28:height-.16;
      const part=partFor(tier,`${id}-PK${pad(i+1)}`,'picket',assemblyId,style.label,rect(p,width),p,p,p.z+bottom,p.z+top,width,top-bottom,sourceRail,
        {dressed:{widthIn:width*12,depthIn:width*12},axis:{from:{...p,z:p.z+bottom},to:{...p,z:p.z+top}},purchaseRole:'kit-component',
          geometryStatus:'representative',stockReference:'Included in selected panel kit'});
      a.parts.push(part);
    }
  };
  for(const [index,bay]of plan.levelBays.entries()){
    const id=`RL${index+1}`,from=p3(bay.clearFrom),to=p3(bay.clearTo);
    const posts=bay.posts.map((p,i)=>addPost(`${id}-P${i+1}`,id,p,tier.heightFt,tier.heightFt+height+.0285));
    const upper=drink?height+.0285-topThicknessFt/2:height-.13;
    addRail(`${id}-TOP`,id,'rail',{...from,z:from.z+upper},{...to,z:to.z+upper},topWidthFt,topThicknessFt,posts);
    addRail(`${id}-BOT`,id,'rail',{...from,z:from.z+.28},{...to,z:to.z+.28},wooden?3.5/12:.13,wooden?1.5/12:.11,posts);
    if(wooden)addRail(`${id}-CAPSUP`,id,'rail',{...from,z:from.z+height-.33},{...to,z:to.z+height-.33},3.5/12,1.5/12);
    if(infill==='midrail')addRail(`${id}-MID`,id,'rail',{...from,z:from.z+height/2+.02},{...to,z:to.z+height/2+.02},.13,.11);
    addInfill(id,id,from,to,false);
  }
  for(const run of plan.stairs){
    const id=`ST${(tier.deck.stairPlacements[run.placementIndex]?.sourceIndex??run.placementIndex)+1}-R${run.side==='left'?'L':'R'}`;
    const posts=run.posts.map((p,i)=>{
      const pitched=drink?stairDrinkPostVertices(run,i,postWidthFt,height):undefined;
      const vertices=pitched?[...pitched.top,...pitched.bottom].map(p3):undefined;
      const bottom=run.postBaseYs[i],top=p[1]+height+.0285;
      return addPost(`${id}-P${i+1}`,id,p,bottom,top,vertices);
    });
    run.panels.forEach((panel,i)=>{
      const bayId=`${id}-B${i+1}`,bay=constructionStairRailBay(run,panel,postWidthFt),clearFrom=p3(bay.from),clearTo=p3(bay.to);
      const upper=drink?height+.0285-topThicknessFt/2:height-.13;
      const addPitchedRail=(suffix:string,offset:number,width:number,depth:number)=>{
        const part=addRail(`${bayId}-${suffix}`,bayId,'rail',{...clearFrom,z:clearFrom.z+offset},{...clearTo,z:clearTo.z+offset},width,depth,[posts[i],posts[i+1]]);
        if(bay.bend){
          const bend=p3(bay.bend),station=length(clearFrom,bend);
          part.profile=[{stationFt:0,elevationFt:clearFrom.z+offset},{stationFt:station,elevationFt:bend.z+offset},{stationFt:bay.clearSpanFt,elevationFt:clearTo.z+offset}];
          part.cutLengthFt=bay.lengthFt;
          part.source={...sourceRail,notes:[...sourceRail.notes,'Level-to-pitch transition is a representative path; verify approved rail splice/transition kit and individual cuts.']};
        }
      };
      addPitchedRail('TOP',upper,topWidthFt,topThicknessFt);
      addPitchedRail('BOT',.38,wooden?3.5/12:.13,wooden?1.5/12:.10);
      addInfill(bayId,bayId,clearFrom,clearTo,true,t=>p3(bay.at(t)));
    });
  }
  for(const [i,piece]of plan.drinkPieces.entries()){
    const points=piece.corners.map(p3),from=mid(points[0],points[3]),to=mid(points[1],points[2]),thickness=plan.drinkThicknessFt;
    const bottom=Math.min(...points.map(p=>p.z))-thickness,top=Math.max(...points.map(p=>p.z));
    a.parts.push(partFor(tier,`DR${i+1}`,'drink-rail',piece.kind==='level'?'DR-LEVEL':'DR-STAIR',resolveDrinkRailMaterial(tier.values),
      points.map(p=>({x:p.x,y:p.y})),from,to,bottom,top,plan.drinkWidthFt,piece.lengthFt,
      source('railingLayout.ts / deckProductDimensions.ts','Shared physical drink-rail miter/stock pieces'),
      {vertices:[...points,...points.map(p=>({...p,z:p.z-thickness}))],dressed:{widthIn:plan.drinkWidthFt*12,depthIn:thickness*12},stockReference:'Drink rail cut plan'}));
  }
  for(const gate of plan.gates){
    const inset=postWidthFt/2,from=railingEdgePoint(tier.deck,gate.edgeIndex,gate.start,[0,0],inset),to=railingEdgePoint(tier.deck,gate.edgeIndex,gate.end,[0,0],inset);
    if(!from||!to)continue;
    const p={x:from[0],y:from[1]},q={x:to[0],y:to[1]};
    a.parts.push(partFor(tier,`GATE-${gate.id}`,'gate',`GATE-${gate.id}`,gate.label||'Selected railing gate',memberFootprint(p,q,2/12),p,q,tier.heightFt+.22,tier.heightFt+gate.heightFt,2/12,length(p,q),
      source('deckGates.ts','Selected gate envelope; hardware internals require product drawing'),{purchaseRole:'assembly',geometryStatus:'representative'}));
  }
  if(a.parts.some(p=>p.tierId===tier.id&&p.purchaseRole==='kit-component'))a.notes.push(`${tier.label}: railing kit subcomponents are individually located; they do not add duplicate purchased panel kits. Exact rail profile/cap/base holes require selected manufacturer detail.`);
}

/** Implementations below share installed geometry with the model and renderers. */
export function buildConstructionAssembly(values:ConstructionValues,options:ConstructionAssemblyOptions={}):ConstructionAssembly{
  const main=buildDeckModel(values),lower=buildLowerTierDeckModel(values);
  const tiers:ConstructionTier[]=[{id:'M',label:'Main deck',deck:main,heightFt:Number(values.deckHeight??0),values}];
  if(lower){const custom=values.lowerUseCustomSettings===true||String(values.lowerUseCustomSettings)==='true';
    const lowerValues={...values,deckHeight:values.lowerDeckHeight||values.deckHeight,
      deckingType:custom?(values.lowerDeckingType||values.deckingType):values.deckingType,
      railingType:custom?(values.lowerRailingType||values.railingType):values.railingType};
    tiers.push({id:'L',label:'Lower deck',deck:lower,heightFt:Number(lowerValues.deckHeight??0),values:lowerValues});}
  const assembly:ConstructionAssembly={units:'ft',coordinateSystem:'x/y plan, z elevation',tiers,parts:[],connections:[],issues:[],notes:[]};
  for(const tier of tiers){
    addFraming(assembly,tier);addFinish(assembly,tier);addStairs(assembly,tier);addRailing(assembly,tier,options);
    const skirting=buildConstructionSkirting(tier);
    assembly.parts.push(...skirting.parts);assembly.connections.push(...skirting.connections);
    assembly.issues.push(...skirting.issues);assembly.notes.push(...skirting.notes);
  }
  assembly.notes.push('Dimensions and part axes are in feet at full model precision. Drawings may display feet/inches without rounding the shared coordinates.',
    'Connection markers indicate actual member/assembly anchors. Manufacturer-specific holes, screw edge distances and structural capacities are not inferred.',
    'Order-only hardware allowances without individual coordinates: ledger lateral-load brackets, ledger lag screws/shields, rim-corner LedgerLOK screws, deck frame assembly screws/nails, and connector fastening nails/screws. The approved job detail governs their exact placement and quantity.',
    'Perimeter and stair-side fascia fasteners retain the existing 2-per-linear-foot ordering allowance. Board/support contact markers for field, picture-frame, breaker, tread and riser boards are connection allowances, not individual screw or clip holes.',
    'Railing kit internals, spindle adapters, deck-gate hardware and drink-rail attachments require selected product details. Skirting fasteners and access-gate hardware are member/assembly allowance groups, not individual factory hole patterns.');
  assembly.issues=[...new Set(assembly.issues)];assembly.notes=[...new Set(assembly.notes)];
  return assembly;
}
