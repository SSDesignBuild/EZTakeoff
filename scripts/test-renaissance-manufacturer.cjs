const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const m={exports:{}};
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/renaissanceManufacturer.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
new Function('module','exports',js)(m,m.exports);
const g=m.exports;
const profiles={
  standard:[3.875,.09,7,2.75,.08],
  hd:[3.875,.188,7,2.75,.125],
  wide:[6,.125,7,4.875,.125],
  'wide-insert':[6,.125,7,4.875,.125],
};
for(const [id,dim] of Object.entries(profiles)){
  const p=g.getRenaissanceExtrusion(id);
  assert.deepEqual(
    [p.postOutsideIn,p.postWallIn,p.headerHeightIn,p.headerDepthIn,p.headerWallIn],dim,
    'exact manufacturer outside profile/gauge for '+id);
}
assert.equal(g.getRenaissanceExtrusion('hd').headerDepthIn,g.getRenaissanceExtrusion('standard').headerDepthIn,
  'HD should not be a visually enlarged box; its gauge changes inside');
assert.equal(g.getRenaissanceExtrusion('wide').headerDepthIn,g.getRenaissanceExtrusion('wide-insert').headerDepthIn,
  'Wide + inserts must share Wide OUTSIDE geometry');
assert.equal(g.RENAISSANCE_TRUSS.outsideHeightIn,6);
assert.equal(g.RENAISSANCE_TRUSS.spacingFt,2);
assert.equal(g.RENAISSANCE_SHADE_TUBE.outsideWidthIn,2);
assert.equal(g.RENAISSANCE_SHADE_TUBE.clearGapIn,4);
assert.equal(g.RENAISSANCE_INSULATED_ROOF.defaultThicknessIn,3);
assert.equal(g.RENAISSANCE_STRUCTURAL_GUTTER.outsideWidthIn,5);
assert.equal(g.RENAISSANCE_STRUCTURAL_GUTTER.outsideHeightIn,5);
for(const fixture of g.RENAISSANCE_ANONYMIZED_REFERENCE_CASES){
  const plan=g.makeRenaissanceFramePlan({
    ...fixture,deckHeightFt:0,sideOverhangFt:1,frontOverhangFt:1,
    requestedFrontPosts:0,
  });
  assert.equal(plan.roofWidthFt,fixture.roofWidthFt,fixture.id+' roof width vs frame');
  assert.equal(plan.roofProjectionFt,fixture.roofProjectionFt,fixture.id+' front and rear roof overhang');
  assert.equal(plan.postCountPerRow,fixture.frontPosts,fixture.id+' posts on each row');
  assert.equal(plan.attached,fixture.mount==='wall-attached',fixture.id+' mount');
  assert.equal(plan.frontPostXsFt.length,fixture.frontPosts);
  assert.equal(plan.rearPostXsFt.length,plan.attached?0:fixture.frontPosts);
  if(fixture.family==='Fresco'||fixture.family==='Moderno'){
    assert.equal(plan.pitchInPerFt,fixture.roofStyle==='gable'?3.43:.5);
  }
  if(fixture.family==='Aria')assert.equal(plan.pitchInPerFt,0);
  assert.equal(plan.roofWidthFt,plan.frameWidthFt+2*plan.sideOverhangFt);
  assert.equal(plan.roofProjectionFt,plan.frameProjectionFt+plan.rearOverhangFt+plan.frontOverhangFt);
}
const gable=g.makeRenaissanceFramePlan({
  family:'Moderno',variant:'hd',mount:'wall-attached',roofStyle:'gable',
  frameWidthFt:14,frameProjectionFt:9,deckHeightFt:0,postHeightFt:9,
  requestedFrontPosts:0,sideOverhangFt:1,frontOverhangFt:1,
});
assert.ok(Math.abs((gable.ridgeTopFt-gable.backTopFt)-2)<.003,'14-ft HD gable ridge about 2ft above eaves');
const wide=g.makeRenaissanceFramePlan({
  family:'Fresco',variant:'wide',mount:'freestanding',roofStyle:'studio',
  frameWidthFt:12,frameProjectionFt:10,deckHeightFt:0,postHeightFt:9,
  requestedFrontPosts:0,sideOverhangFt:1,frontOverhangFt:1,
});
assert.equal(wide.rearOverhangFt,1,'Freestanding Fresco roofing extends 1ft at rear');
assert.equal(wide.frontTopFt,9-10*.5/12,'Roof slope maintains source 8ft7in front height from 9ft rear');
const safety=g.makeRenaissanceFramePlan({
  family:'Moderno',variant:'standard',mount:'wall-attached',roofStyle:'studio',
  frameWidthFt:18,frameProjectionFt:10,deckHeightFt:0,postHeightFt:9,
  requestedFrontPosts:2,sideOverhangFt:3,frontOverhangFt:5,
});
assert.equal(safety.sideOverhangFt,1);
assert.equal(safety.frontOverhangFt,1);
assert.equal(safety.postCountPerRow,2,'user overrides visible but require engineer review');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const render=read('src/components/visual3d/RenaissanceCover3D.tsx');
const extrusions=read('src/components/visual3d/RenaissanceExtrusions.tsx');
for(const term of ['RenaissancePost','RenaissanceHeader','RenaissanceGutter','RenaissanceTruss',
  'RenaissanceExtrusion','fresco-polycarbonate','DolceScreenRun'])
  assert.ok(render.includes(term),term+' must participate in rendered assembly');
const layout=read('src/lib/renaissanceCoverWallLayout.ts');
assert.ok(render.includes('planRenaissanceCoverWalls')&&
  layout.includes('makeRenaissanceFramePlan')&&
  layout.includes('seatCanopyPost('),
  'Cover and Sunroom must share the actual manufacturer's frame plan and deck-seated posts');
assert.ok(!render.includes("frameVariant==='hd'?{post:"),'remove generic hard-coded dimension ladder');
assert.ok(extrusions.includes('new THREE.ExtrudeGeometry'),'member contours must be actual parametric meshes');
assert.ok(extrusions.includes('outer.holes.push(inner)'),'posts must be hollow tubes, not solid cube approximations');
assert.ok(extrusions.includes('architecturalGutterOutlineFt'),'gutter must use the measured slope-faced architectural extrusion');
for(const p of ['src/lib/renaissanceManufacturer.ts','src/components/visual3d/RenaissanceCover3D.tsx',
  'src/components/visual3d/RenaissanceExtrusions.tsx']){
  const c=read(p);
  assert.ok(!c.includes('20 Cinnamon Ct')&&!c.includes('McKinney')&&!c.includes('Old Stone'),
    'never commit identifiable client data from supplied vendor drawings');
}
console.log('PASS 3 extrusion families + reinforcement envelopes, 7 anonymized reference plans, 2ft trusses, roof seams, pitch, gutters, screen visualization and privacy');
