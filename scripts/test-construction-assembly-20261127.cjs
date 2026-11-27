/* Numerical regressions for installed parts, not a screenshot/string snapshot. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;const module={exports:{}};cache.set(full,module);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),module,module.exports);return module.exports;}
const {buildConstructionAssembly}=load('src/lib/constructionAssembly');
const {buildDeckModel}=load('src/lib/deckModel'),{planConstructionStair}=load('src/lib/constructionStairs');
const {planRimPlies,planJoistCuts,planPostSaddleCheeks,memberFootprint}=load('src/lib/constructionFraming');
const {deriveDeckingLabelPlan}=load('src/lib/deckingLabels');
const {resolveBoardDimensions,resolveFasciaDimensions}=load('src/lib/deckProductDimensions');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {calculateEstimate}=load('src/lib/estimate');
const {planConstructionFasciaPurchase}=load('src/lib/constructionFasciaPurchase');
const defaults=load('src/data/services').SERVICES.find(s=>s.slug==='decks').defaults;
const near=(a,b,label,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}`);
const rect=(w=16,d=12,x=0,y=0)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
const values=(patch={})=>({...defaults,deckShape:JSON.stringify(rect()),deckHeight:5,stairCount:0,pictureFrameCount:0,breakerBoardCount:0,manualRailingEdges:'[]',deckingMaterial:'TimberTech Legacy - Ashwood',...patch});
const area=p=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.y-b.x*a.y;},0)/2);
function inside(point,polygon){let on=false,result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
  const t=l2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l2)):0;
  if(Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t)<2e-7)on=true;
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
}return on||result;}
// Independent convex clipping for rectangular-case physical overlap checks.
function intersection(subject,clip){let result=subject;const signed=clip.reduce((n,p,i)=>{const q=clip[(i+1)%clip.length];return n+p.x*q.y-q.x*p.y;},0);if(signed<0)clip=[...clip].reverse();
  for(let i=0;i<clip.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],distance=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x),next=[];
    for(let j=0;j<result.length;j++){const p=result[j],q=result[(j+1)%result.length],d=distance(p),e=distance(q);if(d>=-1e-10)next.push(p);if((d>0&&e<0)||(d<0&&e>0)){const f=d/(d-e);next.push({x:p.x+f*(q.x-p.x),y:p.y+f*(q.y-p.y)});}}
    result=next;if(!result.length)break;
  }return result.length>=3?area(result):0;
}
function verifyAssembly(a){
  const ids=new Set(a.parts.map(p=>p.id));assert.equal(ids.size,a.parts.length,'Unique physical part IDs');
  assert.equal(new Set(a.connections.map(c=>c.id)).size,a.connections.length,'Unique connection IDs');
  for(const p of a.parts){assert.equal(p.quantity,1);assert.ok(p.footprint.length>=3&&area(p.footprint)>1e-9,`${p.id} positive footprint`);
    for(const n of [p.cutLengthFt,p.zBottom,p.zTop,p.dressed.widthIn,p.dressed.depthIn,...p.footprint.flatMap(v=>[v.x,v.y])])assert.ok(Number.isFinite(n),`${p.id} finite`);
    assert.ok(p.zTop>p.zBottom&&p.cutLengthFt>0,`${p.id} positive dimensions`);
  }
  const byId=new Map(a.parts.map(p=>[p.id,p]));
  for(const c of a.connections){assert.equal(c.holePattern,null,'No fabricated manufacturer holes');assert.ok(c.partIds.length>0);for(const id of c.partIds)assert.ok(ids.has(id),`${c.id} real participating part`);
    if(c.kind==='deck-board-bearing')for(const id of c.partIds){const p=byId.get(id);assert.ok(inside(c.point,p.footprint),`${c.id} anchor inside ${id}`);
      assert.ok(c.point.z>=p.zBottom-1e-7&&c.point.z<=p.zTop+1e-7,`${c.id} actual vertical bearing ${id}`);}
  }
}

// Actual section catalog changes row count, finish cuts and structural seats.
const legacy=buildDeckModel(values()),vintage=buildDeckModel(values({deckingMaterial:'TimberTech Vintage - Coastline'}));
near(legacy.deckBoardFaceFt*12,5.36,'Legacy face');near(legacy.deckBoardThicknessFt*12,.94,'Legacy thickness');
near(vintage.deckBoardFaceFt*12,5.5,'Vintage face');near(vintage.deckBoardThicknessFt*12,1,'Vintage thickness');
assert.equal(deriveDeckingLabelPlan(legacy).groups.filter(g=>g.kind==='field').reduce((s,g)=>s+g.count,0),27);
assert.equal(deriveDeckingLabelPlan(vintage).groups.filter(g=>g.kind==='field').reduce((s,g)=>s+g.count,0),26);
const overridden=buildDeckModel(values({deckBoardFaceIn:6,deckBoardThicknessIn:1.25}));near(overridden.deckBoardFaceFt,.5,'Custom face');near(overridden.deckBoardThicknessFt,1.25/12,'Custom thickness');

let cases=0;
for(const boardRun of ['width','projection'])for(const count of [0,1,2,3]){
  const v=values({boardRun,pictureFrameCount:count,breakerBoardCount:count,pictureFrameHouseSide:true});
  const a=buildConstructionAssembly(v);verifyAssembly(a);cases++;
  const d=a.tiers[0].deck,joists=a.parts.filter(p=>p.kind==='joist'),rims=a.parts.filter(p=>p.kind==='rim');
  assert.equal(joists.length,d.joistCount);assert.equal(rims.length,8);
  for(const joist of joists){near(joist.cutLengthFt,(boardRun==='width'?12:16)-.5,'Joist clear between3-in double rims');near(joist.zTop,5-d.deckBoardThicknessFt,'Joist touches board underside');
    for(const rim of rims)near(intersection(joist.footprint,rim.footprint),0,'No joist/rim overlap');}
  const finish=a.parts.filter(p=>['field-board','picture-frame','breaker'].includes(p.kind));
  for(const [i,p]of finish.entries())for(const q of finish.slice(i+1))near(intersection(p.footprint,q.footprint),0,`${p.id}/${q.id} finish nonoverlap`,1e-6);
  const hardware=d.hardware;assert.equal(d.deckFastenerCount,hardware.boardContacts.length*2);assert.equal(d.fieldBoardFastenerCount+d.trimBoardFastenerCount,d.deckFastenerCount);
  assert.equal(d.rafterTies,hardware.beamContacts.length);assert.equal(d.joistHangers+d.angledJoistHangers,joists.length*2);
  const schedule=deriveDeckingLabelPlan(d);
  for(const [kind,scheduleKind]of [['field-board','field'],['picture-frame','picture-frame'],['breaker','breaker']])
    assert.equal(schedule.groups.filter(g=>g.kind===scheduleKind).reduce((n,g)=>n+g.count,0),finish.filter(p=>p.kind===kind).length,'Every physical finish piece counted exactly once');
}
const lShape=[{x:0,y:0},{x:16,y:0},{x:16,y:6},{x:8,y:6},{x:8,y:12},{x:0,y:12}];
const concave=buildDeckModel(values({deckShape:JSON.stringify(lShape),customBeamYs:'[3,9]'}));
assert.equal(concave.joistCount,15);assert.equal(concave.rafterTies,22,'Only15+7 actual joist/beam contacts, not15×2');
assert.ok(concave.rafterTies<concave.joistCount*concave.beamLines.length);
for(const points of [lShape,[...lShape].reverse(),[{x:2,y:3},{x:18,y:3},{x:18,y:10},{x:11,y:15},{x:2,y:15}]]){
  const a=buildConstructionAssembly(values({deckShape:JSON.stringify(points),pictureFrameCount:2,breakerBoardCount:2}));verifyAssembly(a);cases++;
  const d=a.tiers[0].deck;assert.equal(planJoistCuts(d.points,d.edgeSegments,d.joistDirection,d.joistPositions,planRimPlies(d.points,d.edgeSegments)).length,d.joistCount);
}
for(const material of ['TimberTech Legacy - Ashwood','TimberTech Vintage - Coastline','TimberTech Premier+ - Dark Cocoa','Trex Select - Pebble Grey','Trex Enhance - Foggy Wharf','Pressure treated5/4x6'])for(const riserStyle of ['fascia','match','open']){
  const v=values({deckingMaterial:material,deckingType:material.startsWith('Pressure')?'pressure-treated':'composite',stairCount:1,stairEdgeIndex:2,stairWidth:4.5,stairRiserStyle:riserStyle});
  const d=buildDeckModel(v),s=planConstructionStair(d,d.stairPlacements[0],5,v);assert.ok(s);cases++;
  assert.equal(s.stringerStations.length,6);assert.equal(d.stairStringers,6,'Fractional width counts real stringers');
  near(s.stringerCutLengthFt,d.stairStringerCutLength,'Shared stringer raw-cut length');
  const dimension=resolveBoardDimensions(material);near(s.treadThicknessFt,dimension.thicknessIn/12,'Actual tread thickness');
  for(let step=0;step<d.stairTreadsPerRun;step++){
    const boards=s.treadBoards.filter(b=>b.step===step).sort((a,b)=>a.startFt-b.startFt);assert.ok(boards.length>=2);
    for(const b of boards){near(b.topFt,5-(step+1)*s.riseFt,'Measured finished stair top');assert.ok(b.endFt-b.startFt<=s.treadFaceFt+1e-8,'Rear board rips fit selected stock');}
    for(let i=1;i<boards.length;i++)near(boards[i].startFt-boards[i-1].endFt,.125/12,'Only actual selected tread gap');
    if(riserStyle!=='open'){const riser=s.risers.find(r=>r.step===step);near(boards[0].startFt,step*s.treadDepthFt+riser.thicknessFt,'Closed tread meets actual riser face without filler');}
    const seat=s.stringerProfile.find(p=>Math.abs(p.stationFt-(step+1)*s.treadDepthFt)<1e-7&&Math.abs(p.elevationFt-boards[0].bottomFt)<1e-7);assert.ok(seat,'Stringer seat touches actual board underside');
  }
  if(material.startsWith('TimberTech Legacy')&&riserStyle==='fascia')near(s.nosingFt*12,.425,'Legacy natural two-board closed tread nosing');
  const a=buildConstructionAssembly(v);verifyAssembly(a);assert.equal(a.parts.filter(p=>p.kind==='tread').length,s.treadBoards.length);
  assert.equal(a.parts.filter(p=>p.kind==='riser').length,s.risers.length);
  for(const p of a.parts.filter(p=>p.kind==='post'||p.kind==='rail-post'))near(p.dressed.widthIn,p.dressed.depthIn,'Square post section is not overall height');
}
const subfloor=buildConstructionAssembly(values({deckingSurface:'subfloor',pictureFrameCount:3,breakerBoardCount:3}));verifyAssembly(subfloor);
assert.equal(subfloor.parts.filter(p=>['field-board','picture-frame','breaker'].includes(p.kind)).length,0);
near(subfloor.parts.filter(p=>p.kind==='subfloor').reduce((n,p)=>n+area(p.footprint),0),192,'Real subfloor sheets exactly cover configured area');
assert.ok(subfloor.parts.filter(p=>p.kind==='subfloor').every(p=>p.cutLengthFt<=8+1e-7&&p.dressed.widthIn<=48+1e-7));

const project=makeConsultationProject('synthetic');project.values=values({manualRailingEdges:'[1,2,3]',stairCount:1,stairEdgeIndex:2,stairRailingLeft:true,stairRailingRight:true});project.kind='covered-deck';project.coverFamily='classico';project.coverScreenStyle='elite-add-a-room';
const enclosed=buildConstructionAssembly(project.values,{project});verifyAssembly(enclosed);
assert.equal(enclosed.parts.filter(p=>/^M-RL/.test(p.assemblyId)).length,0,'Enclosure occupied level runs do not leak into CAD');
assert.ok(enclosed.parts.some(p=>p.kind==='rail-post'&&p.assemblyId.startsWith('M-ST')),'Chosen stair rails remain');
const open=buildConstructionAssembly({...project.values});assert.ok(open.parts.some(p=>p.assemblyId.startsWith('M-RL')));
const mixed=buildConstructionAssembly(values({pictureFrameCount:1,borderSameBoard:false,pictureFrameMaterial:'TimberTech Vintage - Coastline'}));
assert.ok(mixed.notes.some(n=>n.includes('leveling/rebate')));assert.ok(mixed.connections.some(c=>c.kind==='board-fastener-allowance'));
assert.ok(mixed.connections.filter(c=>c.kind==='board-fastener-allowance').every(c=>c.partIds.length===1),'Unresolved thickness does not claim a false support contact');
for(const postSizeChoice of ['6x6','8x8']){
  const d=buildDeckModel(values({postSizeChoice})),width=postSizeChoice==='6x6'?5.5/12:7.5/12,p=d.postLocations[0];
  const cheeks=planPostSaddleCheeks(d,p,width);near(cheeks.reduce((n,f)=>n+area(f),0),width*(width-3/12),'Real saddle leaves a3-in beam slot');
  const beam=memberFootprint({x:p.x-width,y:p.y},{x:p.x+width,y:p.y},3/12);for(const cheek of cheeks)near(intersection(cheek,beam),0,'No impossible beam/cheek collision');
}
// Quantities from both tiers use actual contact counts; frame allowance stays independent.
const multi=values({multiTierEnabled:true,lowerDeckShape:JSON.stringify(rect(8,6,0,12)),lowerDeckHeight:3,lowerManualRailingEdges:'[]'});
const a=buildConstructionAssembly(multi),estimate=calculateEstimate('decks',multi);verifyAssembly(a);
const field=a.tiers.reduce((n,t)=>n+t.deck.fieldBoardFastenerCount,0),camo=estimate.materials.find(m=>m.name==='2-3/8 in CAMO screws');
assert.equal(camo.quantity,Math.ceil(field/1750));assert.ok(camo.notes.includes(String(field)));
const pt=values({deckingType:'pressure-treated',deckingMaterial:'Pressure treated5/4x6'}),ptD=buildDeckModel(pt),ptE=calculateEstimate('decks',pt);
assert.equal(ptE.materials.find(m=>m.name==='2 in exterior pressure-treated deck board screws').quantity,Math.ceil(ptD.deckFastenerCount/365));
assert.ok(resolveFasciaDimensions('TimberTech Legacy - Ashwood').thicknessIn<.75,'Manufacturer fascia envelope applied');
for(const style of ['profiled','straight'])for(const height of [5,10]){
  const v=values({deckHeight:height,stairCount:1,stairEdgeIndex:2,stairWidth:4,stairRiserStyle:'fascia',stairFasciaStyle:style}),assembly=buildConstructionAssembly(v);
  const purchase=planConstructionFasciaPurchase(assembly.tiers.map(t=>({id:t.id,model:t.deck,height:t.heightFt,values:t.values})));
  assert.deepEqual(purchase.issues,[]);const cuts=purchase.groups.flatMap(g=>g.cuts),stocks=purchase.groups.flatMap(g=>g.stock.flatMap(b=>b.cuts));
  assert.deepEqual(stocks.map(c=>c.id).sort(),cuts.map(c=>c.id).sort(),'Each actual fascia/riser cut purchased once');
  const physical=assembly.parts.filter(p=>['fascia','stair-fascia','riser'].includes(p.kind));
  assert.deepEqual(cuts.map(c=>c.id).sort(),physical.map(p=>p.id).sort(),'Every physical fascia polygon/profile maps to stock');
  for(const cut of cuts)assert.ok(cut.lengthFt<=12-(.125+.25)/12+1e-7,'Real12-ft stock including trim/kerf');
  for(const p of physical)near(p.cutLengthFt,cuts.find(c=>c.id===p.id).lengthFt,'Stock and geometry cut length identical');
  cases++;
}
const ptMatch=values({deckingType:'pressure-treated',deckingMaterial:'Pressure treated5/4x6',stairCount:1,stairEdgeIndex:2,stairRiserStyle:'match'});
const noSkin=buildConstructionAssembly(ptMatch);assert.equal(noSkin.tiers[0].deck.fasciaThicknessFt,0);
assert.equal(noSkin.parts.filter(p=>p.kind==='fascia'||p.kind==='stair-fascia').length,0,'MatchingPT is exposed structure, no unpurchased decorative skin');
const ptSkin=buildConstructionAssembly({...ptMatch,fasciaMaterial:'TimberTech Legacy - Ashwood',stairFasciaMaterial:'match-fascia'});
assert.ok(ptSkin.parts.some(p=>p.kind==='fascia')&&ptSkin.parts.some(p=>p.kind==='stair-fascia'),'ExplicitPT+synthetic fascia survives');
const ptSkinPurchase=planConstructionFasciaPurchase(ptSkin.tiers.map(t=>({id:t.id,model:t.deck,height:t.heightFt,values:t.values})));
assert.deepEqual(ptSkinPurchase.groups.flatMap(g=>g.cuts.map(c=>c.id)).sort(),ptSkin.parts.filter(p=>p.kind==='fascia'||p.kind==='stair-fascia').map(p=>p.id).sort());
const ptSkinEstimate=calculateEstimate('decks',{...ptMatch,fasciaMaterial:'TimberTech Legacy - Ashwood',stairFasciaMaterial:'match-fascia'});
assert.ok(ptSkinEstimate.materials.some(p=>p.name==='Fascia board'&&p.quantity>0),'ExplicitPT+synthetic fascia is purchased');
const customSkin=buildConstructionAssembly({...ptMatch,fasciaFaceIn:10,fasciaThicknessIn:.875,stairFasciaMaterial:'match-fascia'});
assert.ok(customSkin.parts.some(p=>p.kind==='fascia')&&customSkin.parts.some(p=>p.kind==='stair-fascia'));
for(const p of customSkin.parts.filter(p=>p.kind==='stair-fascia')){
  near(p.dressed.widthIn,10,'Match-fascia inherits configured stock face');
  near(p.dressed.depthIn,.875,'Match-fascia inherits configured stock thickness');
}
const customPurchase=planConstructionFasciaPurchase(customSkin.tiers.map(t=>({id:t.id,model:t.deck,height:t.heightFt,values:t.values})));
assert.deepEqual(customPurchase.groups.flatMap(g=>g.cuts.map(c=>c.id)).sort(),customSkin.parts.filter(p=>p.kind==='fascia'||p.kind==='stair-fascia').map(p=>p.id).sort());
const independentlySized=buildConstructionAssembly({...ptMatch,fasciaFaceIn:10,fasciaThicknessIn:.875,stairFasciaMaterial:'match-fascia',stairFasciaFaceIn:9,stairFasciaThicknessIn:.625});
assert.ok(independentlySized.parts.filter(p=>p.kind==='stair-fascia').every(p=>p.dressed.widthIn===9&&p.dressed.depthIn===.625),'Independent stair dimensions override matching defaults');
cases+=2;
for(const [mainRail,lowerRail,custom] of [['wood','wood',true],['aluminum','wood',true],['wood','vinyl-composite',true],['wood','aluminum',false]]){
 const v=values({multiTierEnabled:true,lowerDeckShape:JSON.stringify(rect(8,6,0,12)),lowerDeckHeight:3,
  stairCount:1,stairEdgeIndex:2,stairWidth:4.5,lowerStairEdgeIndex:2,lowerStairOffset:1,
  manualRailingEdges:'[1,2,3]',lowerManualRailingEdges:'[1,2,3]',railingType:mainRail,
  lowerUseCustomSettings:custom,lowerRailingType:lowerRail});
 const assembly=buildConstructionAssembly(v),order=calculateEstimate('decks',v);
 const expectedBolts=assembly.tiers.reduce((total,tier)=>{
  const eligible=['wood','vinyl-composite'].includes(String(tier.values.railingType));
  return total+2*assembly.parts.filter(p=>p.tierId===tier.id&&(p.kind==='post'||eligible&&p.kind==='rail-post')).length;
 },0);
 const actualBolts=assembly.connections.flatMap(c=>c.hardware).filter(h=>h.name==='Carriage bolt sets').reduce((total,h)=>total+h.quantity,0);
 assert.equal(actualBolts,expectedBolts,'Two-set allowance at each actual eligible post connection on both tiers');
 assert.equal(order.materials.find(m=>m.name==='Carriage bolt sets').quantity,actualBolts,'Carriage bolt order matches main/lower modeled mount allowances');
 const topConnections=assembly.connections.filter(c=>c.kind==='stringer-to-rim');
 assert.ok(topConnections.some(c=>c.tierId==='M')&&topConnections.some(c=>c.tierId==='L'),'Fixture exercises actual stair tops on both tiers');
 assert.equal(topConnections.length,assembly.parts.filter(p=>p.kind==='stair-stringer').length);
 assert.ok(topConnections.every(c=>c.hardware.length===1&&c.hardware[0].name==='Stringer top connection allowance'&&c.hardware[0].quantity===1&&c.holePattern===null));
 assert.equal(order.materials.find(m=>m.name==='Stringer top connection allowance').quantity,topConnections.length,'One purchased connection allowance per installed stringer');
 assert.ok(assembly.notes.some(n=>n.includes('Order-only hardware allowances without individual coordinates')));
 cases++;
}
const mixedFastenerValues={...ptMatch,pictureFrameCount:1,breakerBoardCount:1,borderSameBoard:false,
 pictureFrameMaterial:'TimberTech Legacy - Ashwood',breakerBoardMaterial:'TimberTech Legacy - Whitewash Cedar',
 stairTreadStyle:'TimberTech Legacy - Ashwood',trimFastenerChoice:'plug-system'};
const mixedFastenerAssembly=buildConstructionAssembly(mixedFastenerValues),mixedFastenerEstimate=calculateEstimate('decks',mixedFastenerValues);
const boardConnectionKinds=new Set(['deck-board-bearing','board-fastener-allowance','tread-to-stringer','riser-to-support']);
const connectionFasteners=mixedFastenerAssembly.connections.filter(c=>boardConnectionKinds.has(c.kind)).flatMap(c=>c.hardware);
const screwCount=name=>connectionFasteners.filter(h=>h.name===name).reduce((sum,h)=>sum+h.quantity,0);
assert.equal(mixedFastenerEstimate.materials.find(m=>m.name==='2 in exterior pressure-treated deck board screws').quantity,
 Math.ceil(screwCount('2 in exterior pressure-treated deck board screws')/365),'Wood screws follow only actual wood-piece contacts');
for(const name of ['Color match screws for plugs','Color match plugs'])assert.equal(mixedFastenerEstimate.materials.find(m=>m.name===name).quantity,screwCount(name),'Selected synthetic trim system matches CAD contact schedule');
assert.ok(!mixedFastenerEstimate.materials.some(m=>m.name==='2-3/8 in CAMO screws'),'PT field does not order synthetic field screws');
for(const part of mixedFastenerAssembly.parts.filter(p=>p.material.startsWith('TimberTech')&&['picture-frame','breaker','tread'].includes(p.kind))){
 const attachments=mixedFastenerAssembly.connections.filter(c=>boardConnectionKinds.has(c.kind)&&c.partIds.includes(part.id));
 assert.ok(attachments.length>0&&attachments.every(c=>c.hardware.some(h=>h.name==='Color match screws for plugs')),
  'Ashwood and Whitewash Cedar are synthetic color names, not wood product families');
}
const syntheticStairs=calculateEstimate('decks',values({stairCount:1,stairEdgeIndex:2,stairTreadStyle:'TimberTech Legacy - Ashwood',stairRiserStyle:'match'}));
assert.ok(!syntheticStairs.materials.some(m=>m.name==='2 in exterior pressure-treated deck board screws'),'Synthetic Ashwood risers retain synthetic fasteners');
cases+=2;
console.log(`Construction assembly: ${cases} geometry/product cases, exact contact/stock/datum/subfloor/enclosure regressions passed.`);
