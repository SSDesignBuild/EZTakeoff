/* Stair landing is a controlled Sales add-on, never an assumed Admin takeoff. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)((name)=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const planner=load('src/lib/stairConcreteLanding');
assert.equal(planner.landingSurface(undefined),'unknown');
assert.equal(planner.landingSurface('existing'),'existing');
assert.equal(planner.landingSurface('bare-ground'),'bare-ground');
const normal=planner.planStairLanding(4);
assert.ok(normal);assert.equal(normal.thicknessIn,4);assert.equal(normal.volumeCuFt,16/3);
assert.equal(normal.bags80lb,12,'S&S 4x4x4 default has an explicit 25% order allowance and .6 cu ft bag yield');
assert.equal(planner.planStairLanding(4,4,4,5).bags80lb,10,
 'A custom 5% allowance still follows actual volume');
assert.equal(planner.planStairLanding(4,4,5,5).bags80lb,12,
 'Explicit legacy 5-inch thickness and 5% allowance remain valid');
assert.equal(planner.planStairLanding(6,4,4).bags80lb,17,
 'A 6-foot stair width expands actual landing volume; bag count is never fixed');
for(const invalid of [[0,4,5],[4,-1,5],[4,4,3],[4,4,NaN],[4,4,13]]){
 assert.equal(planner.planStairLanding(...invalid),null);
}
assert.deepEqual(planner.planStairLandings([4,6],{stairLandingSurface:'existing'}),[]);
assert.deepEqual(planner.planStairLandings([4,6],{}),[]);
assert.deepEqual(planner.planStairLandings([4,6],{stairLandingSurface:'bare-ground'}).map(x=>x.bags80lb),[12,17]);
const render=read('src/components/visual3d/DeckStairAssembly3D.tsx');
assert.ok(render.includes('planStairLandingForValues(width')&&render.includes('stairLandingSurface')&&render.includes('run+landing.depthFt/2')&&render.includes('automatic-dimensioned-concrete-stair-landing'));
const ui=read('src/components/ConsultationStudio.tsx')+read('src/components/ConsultationDetailsPanel.tsx');
assert.ok(ui.includes('stairLandingSurface')&&ui.includes('stairLandingDepthFt')&&ui.includes('stairLandingThicknessIn'));
const bridge=read('src/lib/estimatingBridge.ts');
assert.ok(bridge.includes('80-lb bagged concrete')&&bridge.includes('validLandings.reduce')&&bridge.includes('landingSurface(project.values.stairLandingSurface)'));
assert.ok(bridge.includes('Confirm existing grade-level landing')&&bridge.includes('field-verify stair clear width'));
console.log('PASS exact concrete pad volume/bags, varying stair widths, safe site confirmation, Sales only BOM and visible geometry');
