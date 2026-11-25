/* Real polygon area/volume, independent site coordinates, and duplicate scope checks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)((name)=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const concrete=load('src/lib/siteConcrete'),landing=load('src/lib/stairConcreteLanding');
const approx=(actual,expected,msg)=>assert.ok(Math.abs(actual-expected)<1e-7,msg||`${actual} != ${expected}`);
const rectangle=(x,y,w,d)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
const area=(id,points,thicknessIn=4,elevationFt=.055)=>({id,name:id,points,thicknessIn,elevationFt});
const values={deckShape:JSON.stringify(rectangle(0,0,16,12)),stairEdgeIndex:-1};
const withAreas=areas=>({...values,siteConcreteAreas:JSON.stringify(areas)});

// A remote rectangular patio and a concave L slab use exact footprints, not bounding boxes.
const patio=area('Patio',rectangle(-30,25,12,10));
const concave=area('Walk',[{x:20,y:0},{x:26,y:0},{x:26,y:2},{x:22,y:2},{x:22,y:6},{x:20,y:6}],6);
const plan=concrete.planSiteConcrete(withAreas([patio,concave]));
assert.equal(plan.canQuantify,true);assert.deepEqual(plan.validationIssues,[]);
approx(plan.areas[0].areaSqFt,120);approx(plan.areas[0].perimeterFt,44);
approx(plan.areas[0].volumeCuFt,40);approx(plan.areas[1].areaSqFt,20);
approx(plan.areas[1].volumeCuFt,10);approx(plan.totalVolumeCuFt,50);
approx(plan.orderVolumeCuYd,50/27*1.05);
const bounds=concrete.siteConcreteSceneBounds(withAreas([patio,concave]));
assert.ok(bounds.minX<=-30&&bounds.maxX>=26&&bounds.maxY>=35,'Camera bounds include remote concrete');
assert.deepEqual(concrete.readSiteConcreteAreas(JSON.stringify([patio]))[0],patio,'Save/reload preserves independent site coordinates');

// Concave notches are empty; adjacent slabs share a boundary without double counting.
const notch=area('Empty notch',rectangle(22,2,4,4));
approx(concrete.siteConcreteOverlapAreaSqFt(concave.points,notch.points),0);
assert.equal(concrete.planSiteConcrete(withAreas([concave,notch])).canQuantify,true);
const duplicate=concrete.planSiteConcrete(withAreas([patio,{...patio,id:'Duplicate',name:'Duplicate'}]));
assert.equal(duplicate.canQuantify,false);assert.equal(duplicate.orderVolumeCuYd,0);
assert.ok(duplicate.validationIssues.some(issue=>issue.includes('overlaps')));
const crossing=area('Crossing',rectangle(-25,22,1,20));
approx(concrete.siteConcreteOverlapAreaSqFt(patio.points,crossing.points),10);
assert.equal(concrete.planSiteConcrete(withAreas([patio,crossing])).canQuantify,false);
const inside=area('Inside',rectangle(-29,26,1,1));
assert.equal(concrete.planSiteConcrete(withAreas([patio,inside])).canQuantify,false);

// A saved invalid shape remains an explicit blocker; no partial silently valid order.
for(const invalid of [
 {...patio,points:[{x:0,y:0},{x:2,y:2},{x:0,y:2},{x:2,y:0}]},
 {...patio,points:rectangle(0,0,0,10)},
 {...patio,points:[{x:0,y:0},{x:2,y:0},{x:1,y:0},{x:1,y:2}]},
 {...patio,thicknessIn:0},{...patio,thicknessIn:'4'},
 {...patio,elevationFt:Infinity},{...patio,points:null},
]){
 const result=concrete.planSiteConcrete(withAreas([invalid]));
 assert.equal(result.canQuantify,false);assert.ok(result.validationIssues.length);
 assert.equal(result.orderVolumeCuYd,0);
}
assert.equal(concrete.planSiteConcrete({...values,siteConcreteAreas:'{bad'}).canQuantify,false);
assert.equal(concrete.readSiteConcreteAreas(JSON.stringify([{...patio,thicknessIn:0}])).length,1,
 'Invalid editable slab must remain available to repair instead of disappearing from the editor');
assert.equal(concrete.planSiteConcrete(withAreas([patio,{...concave,id:patio.id}])).canQuantify,false);
const reverse={...patio,points:[...patio.points].reverse()};
approx(concrete.planSiteConcrete(withAreas([reverse])).totalAreaSqFt,120);

// The new site-plan landing option uses actual stair direction/width and never buys a duplicate pad.
const stairValues={...values,stairCount:1,stairEdgeIndex:1,stairOffset:4,stairWidth:4,deckHeight:3,
 stairLandingSurface:'bare-ground',stairLandingDepthFt:4,stairLandingThicknessIn:5};
const pads=concrete.siteConcreteStairLandings(stairValues);
assert.equal(pads.length,1);
const pad=pads[0],drawnPad=area('Shared landing',pad.points,5,pad.elevationFt);
const conflict=concrete.planSiteConcrete({...stairValues,siteConcreteAreas:JSON.stringify([drawnPad])});
assert.equal(conflict.canQuantify,false);assert.ok(conflict.validationIssues.some(issue=>issue.includes('automatic Stair 1')));
assert.equal(landing.landingSurface('site-plan'),'site-plan');
assert.deepEqual(landing.planStairLandings([4],{stairLandingSurface:'site-plan'}),[]);
const supplied=concrete.planSiteConcrete({...stairValues,stairLandingSurface:'site-plan',siteConcreteAreas:JSON.stringify([drawnPad])});
assert.equal(supplied.canQuantify,true);approx(supplied.totalVolumeCuFt,pad.volumeCuFt);
const noLanding=concrete.planSiteConcrete({...stairValues,stairLandingSurface:'site-plan',siteConcreteAreas:JSON.stringify([patio])});
assert.equal(noLanding.canQuantify,false);assert.ok(noLanding.validationIssues.some(issue=>issue.includes('full')));
const misaligned=concrete.planSiteConcrete({...stairValues,stairLandingSurface:'site-plan',siteConcreteAreas:JSON.stringify([{...drawnPad,elevationFt:1}])});
assert.equal(misaligned.canQuantify,false);
const tiers={...stairValues,multiTierEnabled:true,lowerDeckShape:JSON.stringify(rectangle(35,2,8,8)),
 lowerDeckHeight:2,lowerStairEdgeIndex:1,lowerStairOffset:2};
assert.equal(concrete.siteConcreteStairLandings(tiers).length,2,'Both deck tiers contribute actual stair landing footprints');

// Handoff uses the very same measured polygon and quantity and withholds overlap orders.
const projects=load('src/lib/consultationProject'),bridge=load('src/lib/estimatingBridge');
const makeProject=projects.makeConsultationProject;
if(makeProject){
 const project=makeProject('site-concrete-qa');project.values={...project.values,...withAreas([patio,concave])};
 const exported=bridge.createEstimateHandoff(project);
 const material=exported.materials.find(item=>item.name==='Concrete — drawn site areas');
 assert.ok(material);approx(material.quantity,50/27*1.05);
 assert.deepEqual(exported.geometry.siteConcreteAreas[0].points,patio.points);
 project.values={...project.values,...withAreas([patio,{...patio,id:'dup'}])};
 const blocked=bridge.createEstimateHandoff(project);
 assert.equal(blocked.geometry.siteConcreteQuantitiesValid,false);
 assert.ok(!blocked.materials.some(item=>item.name==='Concrete — drawn site areas'));
 assert.ok(blocked.blockers.some(issue=>issue.includes('overlaps')));
 project.values={...project.values,...tiers,siteConcreteAreas:'[]'};
 const both=bridge.createEstimateHandoff(project);
 const bags=both.materials.find(item=>item.name==='80-lb bagged concrete — on-site stair landing pads');
 assert.ok(bags);assert.equal(bags.quantity,24,'Main and lower actual4x4x5 pads each require12bags');
 assert.equal(both.geometry.stairCount,2);
}else throw new Error('Project factory missing; handoff test must run, not silently skip.');
console.log('PASS arbitrary/concave concrete footprints, exact volume, duplicate blockers, shared stair landing coverage, scene bounds and estimator parity');
