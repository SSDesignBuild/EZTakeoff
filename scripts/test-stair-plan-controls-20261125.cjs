const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)((name)=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const {buildDeckModel,buildLowerTierDeckModel}=load('src/lib/deckModel');
const {planStairFootprints}=load('src/lib/stairPlanGeometry');
const {stairFlightFrame}=load('src/lib/stairRailVisualGeometry');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const shape=[{x:8,y:3},{x:24,y:3},{x:24,y:19},{x:8,y:19}];
const values={deckShape:JSON.stringify(shape),attachment:'freestanding',deckHeight:3,stairCount:1,stairEdgeIndex:1,stairOffset:4,stairWidth:4,stairRailingLeft:true,stairRailingRight:false,additionalStairs:JSON.stringify([{edgeIndex:2,offset:5,width:5,left:false,right:true}])};
const model=buildDeckModel(values),plans=planStairFootprints(model);
assert.equal(plans.length,2);assert.deepEqual(plans.map(p=>p.sourceIndex),[0,1]);
for(let i=0;i<plans.length;i++){
 const p=plans[i],placement=model.stairPlacements[i],frame=stairFlightFrame(model,placement,[0,0]);
 near(Math.hypot(p.corners[1].x-p.corners[0].x,p.corners[1].y-p.corners[0].y),frame.widthFt);
 near(Math.hypot(p.corners[2].x-p.corners[1].x,p.corners[2].y-p.corners[1].y),model.stairRunFt);
 near(p.center.x,frame.originX+frame.outwardX*model.stairRunFt/2);
 near(p.center.y,frame.originZ+frame.outwardZ*model.stairRunFt/2);
 assert.equal(p.treads.length,model.stairTreadsPerRun);
}
assert.deepEqual(plans.map(p=>p.sides.map(s=>s.enabled)),[[true,false],[false,true]]);
assert.ok(plans[0].corners[2].x>model.maxX,'Right edge stair must project outward, not be reduced to entry marker');
const reverse=buildDeckModel({...values,deckShape:JSON.stringify([...shape].reverse()),stairEdgeIndex:1,additionalStairs:'[]'});
assert.ok(planStairFootprints(reverse)[0].center.x>reverse.maxX,'Reversed winding keeps stair outward');
const extraOnly=buildDeckModel({...values,stairEdgeIndex:-1});
assert.equal(planStairFootprints(extraOnly)[0].sourceIndex,1,'Visible first extra stair must still update extra index rather than main flags');
const lower=buildLowerTierDeckModel({...values,multiTierEnabled:true,lowerDeckShape:JSON.stringify(shape),lowerUseCustomSettings:false,lowerStairEdgeIndex:1,lowerStairRailingLeft:false,lowerStairRailingRight:true,lowerAdditionalStairs:'[]'});
assert.deepEqual(planStairFootprints(lower)[0].sides.map(s=>s.enabled),[false,true]);
const changed=buildDeckModel({...values,stairRailingLeft:false,stairRailingRight:false});
assert.deepEqual(planStairFootprints(changed).map(p=>p.sides.map(s=>s.enabled)),[[false,false],[false,true]]);
assert.equal(changed.stairRailSideCount,1,'Switching first flight leaves independently selected extra flight quantity intact');
console.log('PASS measured outward stair footprints, per-flight side states, stable source indices, lower-tier controls and takeoff parity');
