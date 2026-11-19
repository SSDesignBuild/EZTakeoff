const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const load=(name)=>{
  const m={exports:{}};
  const js=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  new Function('module','exports',js)(m,m.exports);
  return m.exports;
};
const {planInsulatedRoofPanels,planDolceGableInfill}=load('src/lib/renaissanceRoofGeometry.ts');
for(const widthFt of [1,4,7,14,20,23,50,102]){
  const p=planInsulatedRoofPanels(widthFt);
  assert.ok(p.modules.length>=1&&p.modules.length<=30);
  assert.ok(p.modules.every(item=>item.widthFt>0&&item.widthFt<=4.000001));
  assert.ok(Math.abs(p.modules.reduce((sum,item)=>sum+item.widthFt,0)-widthFt)<1e-8,
    '3D panels cannot misrepresent the physical roof span');
  assert.equal(p.seamsFt.length,p.modules.length-1);
  assert.ok(p.seamsFt.every(x=>x>0&&x<widthFt));
}
const fourteen=planInsulatedRoofPanels(14);
assert.deepEqual(fourteen.modules.map(item=>item.widthFt),[4,4,4,2],
  'The 14-ft sample must render three full modules and a 2-ft cut module');
assert.equal(planInsulatedRoofPanels(20).modules.length,5);
assert.equal(planInsulatedRoofPanels(0).modules.length,0);
assert.equal(planInsulatedRoofPanels(-5).modules.length,0);
assert.equal(planInsulatedRoofPanels(NaN).modules.length,0);
assert.equal(planInsulatedRoofPanels(Infinity).modules.length,0);
assert.equal(planInsulatedRoofPanels(14,0).modules.length,0);
const g=planDolceGableInfill({
  frameWidthFt:14,roofWidthFt:16,ridgeRiseFt:2,roofPanelThicknessFt:.25,
});
assert.ok(g,'Moderno 14ft HD sample should have a meaningful gable screen infill');
assert.ok(Math.abs(g.sideRiseFt-.125)<1e-8,'Gable panel underside at frame edge');
assert.ok(Math.abs(g.peakRiseFt-1.875)<1e-8,'Gable infill ridge below panel underside');
assert.equal(g.contour.length,5);
assert.equal(g.contour[3].alongFt,7);
assert.ok(g.peakRiseFt>g.sideRiseFt);
assert.equal(planDolceGableInfill({
  frameWidthFt:16,roofWidthFt:14,ridgeRiseFt:2,roofPanelThicknessFt:.25,
}),null);
assert.equal(planDolceGableInfill({
  frameWidthFt:14,roofWidthFt:16,ridgeRiseFt:0,roofPanelThicknessFt:.25,
}),null);
const cover=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
assert.ok(cover.includes('planInsulatedRoofPanels('));
assert.ok(cover.includes('studioPanels.modules.map')&&cover.includes('gablePanels.modules.map'),
  'Studio and gable need individually drawn panel modules');
assert.ok(cover.includes('studioPanels.seamsFt.map')&&cover.includes('gablePanels.seamsFt.map'),
  'Both roof types must have panel-to-panel closure details');
assert.ok(cover.includes('dolce-gable-upper-screen-infill-concept'),
  'Gable Dolce screens must not leave a triangular unmodeled void');
assert.ok(cover.includes('panelThicknessFt={roofPanelThicknessFt}'));
assert.ok(!cover.includes('<boxGeometry args={[width,inchToFoot(RENAISSANCE_INSULATED_ROOF.defaultThicknessIn),roofDepth]}/>'),
  'No single generic insulated slab should remain');
console.log('PASS modular 48in studio + gable roof panels, trimmed last module, closure stations and pitched Dolce gable infill');
