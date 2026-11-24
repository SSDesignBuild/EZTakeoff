const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),m={exports:{}};
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/renaissanceGuidance.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
new Function('module','exports',js)(m,m.exports);
const g=m.exports;
for(const family of ['Moderno','Contempo','Classico','Fresco','Aria']){
  assert.equal(g.hasRenaissanceReferenceChart(family),true);
  assert.equal(g.maxReferenceOverhangFt(family),1);
  assert.equal(g.renaissanceReferenceIssues({family,sideOverhangFt:1,frontOverhangFt:1,postHeightFt:9}).length,0);
  assert.equal(g.renaissanceReferenceIssues({family,sideOverhangFt:1.25,frontOverhangFt:0,postHeightFt:16}).length,2);
}
assert.equal(g.hasRenaissanceReferenceChart('Solé'),false);
assert.equal(g.maxReferenceOverhangFt('Solé'),5);
assert.equal(g.RENAISSANCE_REFERENCE_MIN_ROOF_SLOPE_IN_PER_FT,.25);
const picker=fs.readFileSync(path.join(root,'src/components/ConsultationVisualPickers.tsx'),'utf8');
assert.ok(picker.includes('max={maxOverhang}'));
const roof=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
const wallGeometry=fs.readFileSync(path.join(root,'src/lib/renaissanceCoverWallLayout.ts'),'utf8');
assert.ok(roof.includes('planRenaissanceCoverWalls')&&
  wallGeometry.includes('maxReferenceOverhangFt(project.coverFamily)'),
  'Manufacturer overhang restriction must remain in the shared renderer/section wall plan');
const bridge=fs.readFileSync(path.join(root,'src/lib/estimatingBridge.ts'),'utf8');
assert.ok(bridge.includes('renaissanceReferenceIssues'));
console.log('PASS Renaissance estimating-only envelope and proprietary chart exclusion');
