const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
 return mod.exports;
}
const {makeConsultationProject}=load('src/lib/consultationProject');
const {buildDeckModel,buildLowerTierDeckModel}=load('src/lib/deckModel');
const {planLightingAddons,getLightingOptions,getOverheadAddonAvailability,readLightingSettings,
 lightingCapPostKeys,lightingRailStations,planDeckLightStations}=load('src/lib/lightingAddons');
const {lightingProducts}=load('src/data/lightingCatalog');
const {surfaceStrips}=load('src/lib/visualGeometry');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const {stairFlightFrame}=load('src/lib/stairRailVisualGeometry');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const initial=makeConsultationProject('lighting-geometry-regression');
const rectangle=[{x:0,y:0},{x:20,y:0},{x:20,y:16},{x:0,y:16}];
const base={...initial,values:{...initial.values,attachment:'freestanding',deckShape:JSON.stringify(rectangle),deckHeight:4,
 manualRailingEdges:'[0,1,2,3]',stairCount:1,stairWidth:4,stairEdgeIndex:2,stairOffset:4,
 stairRailingLeft:true,stairRailingRight:true,railingPostSize:'3x3',stairRiserStyle:'fascia',
 lightingPostFixture:'tt-small-accent',lightingPostCapFixture:'tt-ire-post-cap',
 lightingStairFixture:'tt-recessed-riser',lightingStairPerRiser:2,lightingDeckFixture:'tt-in-deck'}};
const mutate=(p,values,rest={})=>({...p,...rest,values:{...p.values,...values}});
const enabled=(p,category,id)=>getLightingOptions(p,category).find(o=>o.id===id)?.enabled;
for(const product of lightingProducts){
 assert.ok(product.sourceUrl.startsWith('https://www.timbertech.com/product/'));
 assert.ok(product.guideUrl.startsWith('https://assets.timbertech.com/'));
 assert.equal(product.sku,undefined,'Application IDs must not masquerade as manufacturer order codes');
 if(product.dimensionsIn)assert.ok(product.dimensionsIn.every(n=>n>0&&Number.isFinite(n)));
}
assert.deepEqual(getOverheadAddonAvailability(base),{fans:false,canLights:false,
 reason:'Choose a solid Moderno, Contempo or Classico ceiling for patio fans and recessed can lights.'});
assert.equal(planLightingAddons(initial).fixtures.length,0,'Existing saved projects default to no fixtures');
assert.equal(readLightingSettings({patioFanCount:NaN,patioCanLightCount:Infinity}).patioFanCount,0);
assert.equal(readLightingSettings({patioFanCount:99,patioCanLightCount:-1}).patioFanCount,4);

const model=buildDeckModel(base.values),plan=planLightingAddons(base),stations=lightingRailStations(model,base.values,[0,0],4);
assert.ok(stations.length>4);
assert.equal(plan.placedCounts.post,stations.length,'One face light per unique actual rail post');
assert.equal(plan.placedCounts['post-cap'],stations.length,'Landing/corner posts are not double counted');
assert.equal(lightingCapPostKeys(model,base.values,[0,0],4).size,plan.placedCounts['post-cap'],'Exactly the replaced caps are suppressed');
assert.equal(plan.placedCounts.stair,model.stairTreadsPerRun*2,'Two lights on each actual modeled closed riser');
assert.ok(plan.placedCounts.deck>0);
assert.equal(plan.fixtures.length,Object.values(plan.placedCounts).reduce((a,b)=>a+b,0));
assert.equal(plan.materials.reduce((sum,m)=>sum+m.quantity,0),plan.fixtures.length,'Estimator quantities equal actual fixture meshes');
assert.equal(plan.issues.length,0);
for(const fixture of plan.fixtures){
 assert.ok([...fixture.position,...fixture.rotation,...fixture.sizeFt].every(Number.isFinite));
 if(fixture.category==='post'){
  const p=stations.find(p=>p.key===fixture.postKey);
  const offset=(fixture.position[0]-p.point[0])*p.normal[0]+(fixture.position[2]-p.point[2])*p.normal[1];
  assert.ok(Math.abs(offset-fixture.sizeFt[2]/2-p.postWidthFt/2)<1e-8,'Face light back is flush to actual post face');
 }
 if(fixture.category==='post-cap'){
  const p=stations.find(p=>p.key===fixture.postKey);
  assert.ok(Math.abs(fixture.position[1]-fixture.sizeFt[1]/2-p.point[1]-3-.0285)<1e-8,'Cap seats on its level or stair post');
 }
 if(fixture.category==='stair'){
  const frame=stairFlightFrame(model,model.stairPlacements[fixture.flightIndex],[0,0]);
  const station=(fixture.position[0]-frame.originX)*frame.outwardX+(fixture.position[2]-frame.originZ)*frame.outwardZ;
  const face=(fixture.riserIndex+1)*Math.max(.65,model.stairRunFt/model.stairTreadsPerRun)-.004+.035;
  assert.ok(Math.abs(station+fixture.sizeFt[2]/2-face-.1875/12)<1e-8,'Recessed riser face projects the published 3/16 inch');
  assert.ok(Math.abs(face-(station-fixture.sizeFt[2]/2)-.5/12)<1e-8,'Housing recesses the full published half-inch into the riser');
 }
}
const translated=planLightingAddons(base,[9,7]);
assert.equal(translated.fixtures.length,plan.fixtures.length);
plan.fixtures.forEach((f,i)=>{
 const t=translated.fixtures[i];
 assert.ok(Math.abs(f.position[0]-9-t.position[0])<1e-8&&Math.abs(f.position[2]-7-t.position[2])<1e-8,
  'Plan origin translation changes only world placement, not count or relative geometry');
});

const alternating=planLightingAddons(mutate(base,{lightingPostPattern:'alternating',lightingPostCapPattern:'alternating',lightingStairPattern:'alternating'}));
assert.equal(alternating.placedCounts.post,Math.ceil(stations.length/2));
assert.equal(alternating.placedCounts['post-cap'],Math.ceil(stations.length/2));
assert.equal(alternating.placedCounts.stair,Math.ceil(model.stairTreadsPerRun/2)*2);
const drink=mutate(base,{railingVisualId:'tt-ire-drink'});
assert.equal(enabled(drink,'post-cap','tt-ire-post-cap'),false);
assert.equal(enabled(drink,'post','tt-small-accent'),true);
assert.equal(planLightingAddons(drink).placedCounts['post-cap'],0,'No post cap through a drink board');
assert.equal(lightingCapPostKeys(model,drink.values,[0,0],4).size,0);
assert.equal(planLightingAddons(mutate(base,{railingPostTermination:'flush-top'})).placedCounts['post-cap'],0);
const smallPost=mutate(base,{railingPostSize:'2x2'});
assert.equal(enabled(smallPost,'post','tt-small-accent'),true);
assert.equal(enabled(smallPost,'post','tt-reversible-accent'),false);
assert.equal(enabled(smallPost,'post-cap','tt-ire-post-cap'),false);
assert.equal(enabled(mutate(base,{railingInfill:'horizontal-cable'}),'post-cap','tt-lantern'),false);
assert.equal(enabled(mutate(base,{railingColor:'dark-bronze'}),'post','tt-reversible-accent'),false);
const wood=mutate(base,{railingVisualId:'sns-wood-pickets'});
assert.equal(getLightingOptions(wood,'post').filter(o=>o.id!=='none').some(o=>o.enabled),false);
assert.equal(getLightingOptions(wood,'post-cap').filter(o=>o.id!=='none').some(o=>o.enabled),false);
assert.equal(enabled(wood,'deck','tt-in-deck'),true,'Deck-light compatibility is independent of wood rail choice');
const pvc=mutate(base,{railingVisualId:'tt-statement'});
assert.equal(enabled(pvc,'post','tt-accent'),true);
assert.equal(enabled(pvc,'post','tt-reversible-accent'),false);
assert.equal(enabled(pvc,'post-cap','tt-lantern'),false);
const composite=mutate(base,{railingVisualId:'tt-radiance',lightingPostCapFixture:'tt-lantern'});
assert.equal(enabled(composite,'post-cap','tt-lantern'),true);
assert.ok(planLightingAddons(composite).fixtures.filter(f=>f.category==='post-cap').every(f=>f.geometryFidelity==='mounting-symbol'));
for(const [railingColor,finish] of [['white','matte-white'],['black','matte-black'],['matte-espresso','matte-espresso']]){
 const p=planLightingAddons(mutate(composite,{railingColor}));
 assert.ok(p.fixtures.some(f=>f.category==='post-cap'));
 assert.ok(p.fixtures.filter(f=>f.category==='post-cap').every(f=>f.finish===finish),
  'Composite lanterns use their published Matte finish variant');
 assert.equal(p.materials.find(m=>m.name==='TimberTech LED Lantern Post Cap Light').color,finish,
  'The material order retains the correct mounting-family finish');
}
for(const railingColor of ['white','black','dark-bronze']){
 const p=planLightingAddons(mutate(base,{lightingPostCapFixture:'tt-lantern',railingColor}));
 assert.ok(p.fixtures.filter(f=>f.category==='post-cap').every(f=>f.finish===railingColor),
  'IRE lanterns retain their published White/Black/Dark Bronze variants');
}
const open=planLightingAddons(mutate(base,{stairRiserStyle:'open'}));
assert.equal(open.placedCounts.stair,0);assert.ok(open.issues.some(s=>s.includes('open risers')));
// Actual riser material, not the unrelated field decking, controls compatibility.
const compositeRiser=String(base.values.deckingMaterial);
const ptWithCompositeRisers=mutate(base,{deckingType:'pressure-treated',deckingMaterial:'5/4 x 6 pressure-treated',
 stairRiserStyle:compositeRiser});
assert.equal(enabled(ptWithCompositeRisers,'stair','tt-recessed-riser'),true);
assert.equal(planLightingAddons(ptWithCompositeRisers).placedCounts.stair,model.stairTreadsPerRun*2);
assert.equal(enabled(ptWithCompositeRisers,'deck','tt-in-deck'),false,'Independent risers do not permit drilling fixtures into unverified field boards');
const ptWithCompositeFascia=mutate(ptWithCompositeRisers,{stairRiserStyle:'fascia',fasciaMaterial:compositeRiser});
assert.equal(enabled(ptWithCompositeFascia,'stair','tt-recessed-riser'),true,'The selected composite fascia can also be used on a PT deck');
const compositeWithPtRisers=mutate(base,{stairRiserStyle:'5/4 x 6 pressure-treated'});
assert.equal(enabled(compositeWithPtRisers,'stair','tt-recessed-riser'),false);
assert.equal(planLightingAddons(compositeWithPtRisers).placedCounts.stair,0);
assert.ok(planLightingAddons(compositeWithPtRisers).issues.some(s=>s.includes('TimberTech riser finish')));
assert.equal(enabled(mutate(base,{deckingType:'pressure-treated',stairRiserStyle:'auto'}),'stair','tt-recessed-riser'),false,
 'A stale named composite field swatch cannot override an explicitly PT automatic riser');
assert.equal(enabled(mutate(base,{deckingType:'pressure-treated',stairRiserStyle:'fascia',fasciaMaterial:'match'}),'stair','tt-recessed-riser'),false);
const noStairs=planLightingAddons(mutate(base,{stairCount:0}));
assert.equal(noStairs.placedCounts.stair,0);assert.ok(noStairs.issues.some(s=>s.includes('add a stair flight')));
const screen=planLightingAddons(mutate(base,{}, {coverFamily:'Moderno',coverScreenStyle:'dolce-standard',coverScreenRailTreatment:'integrated-kick'}));
assert.ok(screen.placedCounts.post>0&&screen.placedCounts.post<plan.placedCounts.post,'Screen-integrated level rails disappear while stair posts remain');
const savedScreenWithoutCover=mutate(base,{}, {coverFamily:'none',coverScreenStyle:'dolce-standard',coverScreenRailTreatment:'integrated-kick'});
assert.equal(planLightingAddons(savedScreenWithoutCover).placedCounts.post,plan.placedCounts.post,
 'A saved screen selection cannot suppress real open-deck railing lights after removing its cover');
assert.equal(planLightingAddons(savedScreenWithoutCover).placedCounts['post-cap'],plan.placedCounts['post-cap']);
assert.equal(planLightingAddons({...savedScreenWithoutCover,coverFamily:'Moderno'}).placedCounts.post,screen.placedCounts.post,
 'Restoring the cover restores the retained integrated-screen treatment');

// Cover removal is a saved-state transition, including projects with no stairs
// (where an active integrated enclosure legitimately has zero railing lights).
// Compare complete fixture placements and material rows, not just quantities.
const enclosedTreatments=[
 ['elite-add-a-room','integrated-kick',true],
 ...['dolce-open-view','dolce-standard'].flatMap(style=>[
  [style,'integrated-kick',true],[style,'integrated-picket',true],[style,'screens-only',true],
  [style,'inside',false],[style,'outside',false],
 ]),
];
for(const stairCount of [0,1])for(const [coverScreenStyle,coverScreenRailTreatment,integrated] of enclosedTreatments){
 const enclosed=mutate(base,{stairCount},{coverFamily:'Moderno',coverScreenStyle,coverScreenRailTreatment});
 const before=JSON.stringify(enclosed),coveredPlan=planLightingAddons(enclosed);
 const uncovered={...enclosed,coverFamily:'none'};
 const removedPlan=planLightingAddons(uncovered);
 const openPlan=planLightingAddons({...uncovered,coverScreenStyle:'none'});
 assert.deepEqual(removedPlan.fixtures,openPlan.fixtures,
  'Removing '+coverScreenStyle+' restores every open-deck fixture at its actual mounting location');
 assert.deepEqual(removedPlan.materials,openPlan.materials,'Restored meshes and supplier quantities agree');
 assert.deepEqual(removedPlan.requestedCounts,openPlan.requestedCounts);
 assert.deepEqual(removedPlan.settings,coveredPlan.settings,'Cover removal never clears the saved lighting selections');
 assert.ok(removedPlan.placedCounts.post>0&&removedPlan.placedCounts['post-cap']>0);
 if(integrated){
  assert.ok(coveredPlan.placedCounts.post<removedPlan.placedCounts.post);
  if(stairCount===0)assert.equal(coveredPlan.placedCounts.post+coveredPlan.placedCounts['post-cap'],0);
 }else assert.deepEqual(coveredPlan.fixtures,removedPlan.fixtures,
  'Independent inside/outside screens retain the deck railing fixtures while the cover exists');
 assert.deepEqual(planLightingAddons({...uncovered,coverFamily:'Moderno'}).fixtures,coveredPlan.fixtures,
  'Restoring the cover reuses the exact retained enclosure and lighting configuration');
 assert.equal(JSON.stringify(enclosed),before,'Planning must not mutate a saved design');
}

// The board planner returns only real plank centerlines, not arbitrary
// points on a deck bounding box or points over a joint/joist.
for(const input of [base.values,{...base.values,boardRun:'projection'},{...base.values,pictureFrameCount:3},
 {...base.values,deckShape:JSON.stringify([{x:0,y:0},{x:20,y:0},{x:20,y:8},{x:12,y:8},{x:12,y:16},{x:0,y:16}])}]){
 const m=buildDeckModel(input),strips=surfaceStrips(m),points=planDeckLightStations(m,6),radius=Math.hypot(1.75,1.25)/24;
 assert.ok(points.length>0);
 for(const p of points){
  assert.ok(strips.some(s=>s.axis==='x'?Math.abs(s.z-p[1])<1e-8&&p[0]>s.startFt&&p[0]<s.endFt:
   Math.abs(s.x-p[0])<1e-8&&p[1]>s.startFt&&p[1]<s.endFt),'Light follows an installed board centerline');
  const station=m.joistDirection==='vertical'?p[0]:p[1];
  assert.ok(m.joistPositions.every(j=>Math.abs(j-station)>=radius+1.5/24+.03),'No drilled fixture through a modeled joist center');
 }
}
// Saved in-deck lighting must explain when every mounting station is excluded,
// while retaining the choice so a later layout change can place it again.
for(const pictureFrameCount of [2,3]){
 const compactDeck=mutate(initial,{deckShape:JSON.stringify([{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]),
  pictureFrameCount,stairCount:0,stairEdgeIndex:-1,lightingDeckFixture:'tt-in-deck'});
 const compactPlan=planLightingAddons(compactDeck);
 assert.equal(compactPlan.requestedCounts.deck,0);assert.equal(compactPlan.placedCounts.deck,0);
 const issue=compactPlan.issues.find(s=>s.includes('main deck; no board positions fit'));
 assert.ok(issue,'An unplaceable selected in-deck fixture needs an explicit placement issue');
 assert.equal(compactPlan.settings.lightingDeckFixture,'tt-in-deck','Keep the saved fixture choice');
 assert.ok(!compactPlan.materials.some(item=>item.name==='TimberTech In-Deck Light'),'Do not order unplaced lights');
 assert.ok(createEstimateHandoff(compactDeck).blockers.includes(issue),'The same issue accompanies the estimator handoff');
 const restored=planLightingAddons(mutate(compactDeck,{pictureFrameCount:1}));
 assert.ok(restored.placedCounts.deck>0,'Usable board positions restore the saved lights');
 assert.ok(!restored.issues.some(s=>s.includes('no board positions fit')));
 assert.ok(!planLightingAddons(mutate(compactDeck,{lightingDeckFixture:'none'})).issues.some(s=>s.includes('no board positions fit')));
}
const multilevel=mutate(base,{multiTierEnabled:true,lowerDeckHeight:2,lowerDeckWidth:12,lowerDeckProjection:8,
 lowerDeckShape:JSON.stringify([{x:20,y:4},{x:32,y:4},{x:32,y:12},{x:20,y:12}]),
 lowerManualRailingEdges:'[0,1,2]',lightingTier:'lower'});
assert.ok(buildLowerTierDeckModel(multilevel.values));
const lowerPlan=planLightingAddons(multilevel);
assert.ok(lowerPlan.fixtures.length>0&&lowerPlan.fixtures.every(f=>f.tier==='lower'));
assert.ok(lowerPlan.fixtures.filter(f=>f.category==='post-cap').every(f=>f.position[1]<6),'Lower fixtures use lower height');

for(const family of ['Moderno','Contempo','Classico'])for(const roofStyle of ['studio','gable']){
 const covered=mutate(base,{patioFanCount:2,patioCanLightCount:8},{coverFamily:family,coverHeightFt:10,coverRoofStyle:roofStyle});
 const p=planLightingAddons(covered),fans=p.fixtures.filter(f=>f.category==='fan'),cans=p.fixtures.filter(f=>f.category==='can-light');
 assert.equal(fans.length,2,family+' '+roofStyle+' places both requested fans');
 assert.equal(cans.length,8,family+' '+roofStyle+' places all requested lights');
 const cover=planRenaissanceCoverWalls(model,covered,[0,0],4);
 for(const f of fans){
  const radius=f.sizeFt[0]/2;
  assert.ok(f.position[0]-radius>=cover.frameLeft+1.5-1e-8&&f.position[0]+radius<=cover.frameRight-1.5+1e-8);
  assert.ok(f.position[2]-radius>=cover.back+1.5-1e-8&&f.position[2]+radius<=cover.frameFront-1.5+1e-8);
  assert.ok(f.position[1]-1-.04>=4.0625+7,'Generic fans retain the documented minimum blade height');
 }
 for(const c of cans){
  assert.ok(fans.every(f=>Math.hypot(f.position[0]-c.position[0],f.position[2]-c.position[2])>f.sizeFt[0]/2+.29),'Can lights avoid fan sweep');
  if(family==='Classico')assert.ok(cover.plan.projectionTrussStationsFt.every(x=>Math.abs(cover.xMid+x-c.position[0])>4/24+2/24+.039),
   'Recessed cans do not pass through actual Classico trusses');
  if(roofStyle==='studio'){
   const angle=Math.atan(cover.plan.pitchInPerFt/12);
   const expected=cover.plan.backTopFt-(c.position[2]-cover.theoreticalBack)*Math.tan(angle)-3/24/Math.cos(angle);
   assert.ok(Math.abs(c.position[1]-expected)<1e-8,'Fixture contacts actual sloped panel underside');
  }
 }
}
const lowRoof=planLightingAddons(mutate(base,{patioFanCount:1},{coverFamily:'Moderno',coverHeightFt:7}));
assert.equal(lowRoof.placedCounts.fan,0);assert.ok(lowRoof.issues.some(s=>s.includes('7-foot blade height')));
const tightCover=mutate(base,{patioFanCount:2},{coverFamily:'Classico',coverHeightFt:9});
const standardMount=planLightingAddons(tightCover),lowProfileMount=planLightingAddons(mutate(tightCover,{patioFanMount:'low-profile'}));
assert.equal(standardMount.placedCounts.fan,0,'12-inch generic drop cannot violate 7-foot clearance');
assert.equal(lowProfileMount.placedCounts.fan,2,'Saved low-profile generic mount fits a lower Classico ceiling');
assert.ok(lowProfileMount.fixtures.filter(f=>f.category==='fan').every(f=>f.sizeFt[1]===8/12&&f.mountStyle==='low-profile'));
assert.ok(lowProfileMount.materials.filter(m=>m.category==='Patio fans').every(m=>m.notes.includes('8-inch visualization drop')));
const missingCover=planLightingAddons(mutate(base,{patioFanCount:2,patioCanLightCount:4}));
assert.equal(missingCover.placedCounts.fan+missingCover.placedCounts['can-light'],0);
assert.equal(missingCover.requestedCounts.fan,2,'Changing cover preserves the saved request for later restoration');
assert.ok(missingCover.issues.some(s=>s.includes('solid Moderno')));
const savedOverhead=mutate(base,{patioFanCount:1,patioCanLightCount:4,patioFanLayout:'rear',
 patioFanFinish:'white',patioFanMount:'low-profile',patioCanLightLayout:'perimeter',patioCanLightFinish:'black'},
 {coverFamily:'Moderno',coverHeightFt:10});
const savedOverheadPlan=planLightingAddons(savedOverhead);
for(const coverFamily of ['none','Fresco','Aria','Solé']){
 const unavailable={...savedOverhead,coverFamily},inactive=planLightingAddons(unavailable);
 assert.equal(getOverheadAddonAvailability(unavailable).fans,false);
 assert.equal(getOverheadAddonAvailability(unavailable).canLights,false);
 assert.equal(inactive.placedCounts.fan+inactive.placedCounts['can-light'],0);
 assert.equal(inactive.requestedCounts.fan,1);assert.equal(inactive.requestedCounts['can-light'],4);
 assert.deepEqual(inactive.settings,savedOverheadPlan.settings,'Unsupported ceilings keep finish, layout, mount and count preferences');
 assert.deepEqual(inactive.fixtures,savedOverheadPlan.fixtures.filter(f=>f.mounting!=='ceiling'),
  'Unavailable overhead mounting never suppresses unrelated deck, post, cap or riser lights');
 assert.deepEqual(planLightingAddons({...unavailable,coverFamily:'Moderno'}).fixtures,savedOverheadPlan.fixtures,
  'Returning to the supported ceiling restores all saved overhead fixtures at their original positions');
 assert.equal(inactive.materials.reduce((sum,m)=>sum+m.quantity,0),inactive.fixtures.length,
  'Inactive overhead requests are not ordered as placed fixtures');
}
const overhead=mutate(base,{patioFanCount:1,patioCanLightCount:4},{coverFamily:'Moderno',coverHeightFt:10,coverScreenColor:'Bronze'});
const handoff=createEstimateHandoff(overhead),expected=planLightingAddons(overhead);
assert.deepEqual(handoff.addOns.placedCounts,expected.placedCounts);
assert.deepEqual(handoff.addOns.settings,readLightingSettings(overhead.values));
assert.equal(handoff.project.coverScreenColor,'Bronze');assert.equal(handoff.selections.coverScreenColor,'Bronze');
assert.equal(handoff.materials.filter(m=>m.category==='Outdoor lighting'||m.category==='Patio fans').reduce((sum,m)=>sum+m.quantity,0),expected.fixtures.length);
assert.ok(handoff.assumptions.some(s=>s.includes('electrical load')));
assert.equal(createEstimateHandoff({...overhead,coverScreenColor:'match',coverColor:'Black'}).project.coverScreenColor,'Black');
const legacyCap=mutate(overhead,{railingPostCap:'lantern-led'}),legacyCapHandoff=createEstimateHandoff(legacyCap);
assert.equal(legacyCapHandoff.selections.railingPostCap,'standard');
assert.equal(legacyCapHandoff.materials.some(m=>m.name.includes('cap/light accessories')),false,
 'Explicit new post-cap lighting must not add a duplicate legacy light accessory per post');
assert.equal(legacyCap.values.railingPostCap,'lantern-led','Handoff normalization does not mutate a saved project');
const capsOff=mutate(legacyCap,{lightingPostCapFixture:'none'});
assert.equal(planLightingAddons(capsOff).placedCounts['post-cap'],0);
assert.equal(lightingCapPostKeys(model,capsOff.values,[0,0],4).size,0,'Explicit None restores the ordinary caps, without a light skin');
assert.equal(createEstimateHandoff(capsOff).selections.railingPostCap,'standard');
console.log('Lighting add-on compatibility, real post/riser/board placement, ceiling fit, persistence and estimator parity passed.');
