/* 2026 Renaissance privacy-wall dimensional regression. No cover BOM authority. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true},
 }).outputText;
 new Function('require','module','exports',js)((n)=>n.startsWith('.')?
   load(path.relative(root,path.resolve(path.dirname(full),n))):require(n),mod,mod.exports);
 return mod.exports;
}
const source=(pathName)=>fs.readFileSync(path.join(root,pathName),'utf8');
const p=load('src/lib/renaissancePrivacyWallGeometry');
assert.equal(p.PRIVACY_TUBE_OUTSIDE_IN,2);
assert.equal(p.PRIVACY_TUBE_WALL_IN,.040);
assert.equal(p.PRIVACY_RECEIVER_OUTSIDE_IN,2.1);
assert.equal(p.PRIVACY_RECEIVER_DEPTH_IN,1.5);
assert.equal(p.PRIVACY_RECEIVER_WALL_IN,.045);
assert.equal(p.PRIVACY_SPACER_HEIGHT_IN,4);
assert.equal(p.PRIVACY_SPACER_DEPTH_IN,5/16);
for(const gap of [2,4,6]){
 const courses=p.planPrivacyTubeCourses(8,gap);
 assert.ok(courses.length>5,'8-ft privacy wall renders several full 2-in tubes');
 for(let i=0;i<courses.length;i++){
  const c=courses[i];
  assert.ok(Math.abs(c.upperAboveBaseFt-c.lowerAboveBaseFt-2/12)<1e-9,'tube measured 2in');
  assert.ok(c.lowerAboveBaseFt>=1/12-1e-9,'bottom receiver clearance');
  assert.ok(c.upperAboveBaseFt<=8-1/12+1e-9,'tube remains below roof');
  if(i)assert.ok(Math.abs((c.lowerAboveBaseFt-courses[i-1].upperAboveBaseFt)*12-gap)<1e-8,
    'actual clear gap in inches, not center-on-center');
 }
}
assert.equal(p.planPrivacyTubeCourses(8,0).length,0);
assert.equal(p.planPrivacyTubeCourses(-1,4).length,0);
assert.equal(p.planPrivacyTubeCourses(NaN,2).length,0);
assert.ok(!p.privacyWallHasDesign({front:0,right:0}));
assert.ok(p.privacyWallHasDesign({left:4}));
const model=source('src/lib/consultationProject.ts');
assert.ok(model.includes('coverPrivacyWallGaps')&&model.includes('...p.coverPrivacyWallGaps'),
 'Saved legacy projects gain default side-by-side privacy options');
const render=source('src/components/visual3d/RenaissancePrivacyWall3D.tsx');
assert.ok(render.includes('RenaissanceShadeTube')&&render.includes('vertical-U-channel-with-two-lips')&&
 render.includes('PRIVACY_SPACER_HEIGHT_IN'),'Measured receiver, actual 2in hollow tube and spacer are independent 3D geometry');
const cover=source('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(cover.includes('coverWallRuns.filter(wall=>!privacyGap(wall.id))')&&
 cover.includes('coverWallRuns.filter(wall=>privacyGap(wall.id)>0)'),
 'Privacy walls must replace Dolce screens, never overlap screens');
const ui=source('src/components/ConsultationVisualPickers.tsx');
for(const gap of [2,4,6])assert.ok(ui.includes('value={'+gap+'}'));
assert.ok(ui.includes('PCA door shares a privacy-wall side'),'UI exposes incompatible opening');
const bridge=source('src/lib/estimatingBridge.ts');
for(const side of ['Front','Left','Right','Rear'])
 assert.ok(bridge.includes('coverPrivacy'+side+'GapIn:'));
assert.ok(bridge.includes('not an independently certified code-required deck guardrail'));
assert.ok(bridge.includes('PCA screen entry side conflicts'));
console.log('PASS Renaissance privacy-wall tube sizes, three exact clear gaps, 4-side persistence, nonoverlap and estimator safety blockers');
