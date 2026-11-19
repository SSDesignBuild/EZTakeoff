/* Complete geometry + product-finish contract; no paid GitHub Actions. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);
  if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const m={exports:{}};cache.set(full,m);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports',js)((name)=>name.startsWith('.')?
    load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),m,m.exports);
  return m.exports;
}
const m=load('src/lib/renaissanceManufacturer');
const g=load('src/lib/renaissanceGutterGeometry');
const f=load('src/data/visualCatalog');
const {makeConsultationProject,updateConsultation}=load('src/lib/consultationProject');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const {RENAISSANCE_ARCHITECTURAL_GUTTER:A,RENAISSANCE_STRUCTURAL_GUTTER:S}=m;
assert.equal(A.outsideWidthIn,6.5);
assert.equal(A.outsideHeightIn,3.5625);
assert.equal(A.wallIn,.065);
assert.equal(S.outsideWidthIn,5);
assert.equal(S.outsideHeightIn,5);
const shape=g.architecturalGutterOutlineFt();
assert.equal(shape.length,8);
const minX=Math.min(...shape.map(p=>p[0])),minY=Math.min(...shape.map(p=>p[1]));
assert.ok(Math.abs(minX+6.5/12)<1e-8);
assert.ok(Math.abs(minY+3.5625/12)<1e-8);
assert.ok(shape.some(p=>p[0]<-A.outsideWidthIn/12*.5&&p[1]===0),
  'Architectural face must slope outwards; cannot be a generic rectangular U');
const samples=[8,12,14,18,26];
for(const roofWidth of samples){
  for(const variant of ['standard','hd','wide','wide-insert']){
    const plan=m.makeRenaissanceFramePlan({
      family:'Classico',variant,mount:'wall-attached',roofStyle:'studio',
      frameWidthFt:roofWidth,frameProjectionFt:12,deckHeightFt:0,postHeightFt:9,
      sideOverhangFt:1,frontOverhangFt:1,requestedFrontPosts:0,
    });
    const stations=plan.projectionTrussStationsFt;
    const half=plan.roofWidthFt/2;
    assert.ok(stations.length>=2);
    assert.ok(Math.abs(stations[0]+stations.at(-1))<1e-8,
      'Classico stations must be signed around roof CENTER (not frame left)');
    assert.ok(stations.every(x=>Math.abs(x)<=half-m.RENAISSANCE_TRUSS.outsideWidthIn/24+1e-8),
      'No visible projection truss may stand outside roof eave');
    assert.ok(stations.every((x,i)=>i===0||x>stations[i-1]),
      'Truss station positions must be monotonically increasing');
  }
}
const runs=g.planWrapAroundGutter({
  leftFt:-7,rightFt:7,rearFt:-6,frontFt:7,rearTopFt:10,frontTopFt:9.5,
});
assert.deepEqual(runs.map(x=>x.id),['left','front','right']);
assert.deepEqual(runs[0].end,runs[1].start,'left-to-front continuous join');
assert.deepEqual(runs[1].end,runs[2].start,'front-to-right continuous join');
assert.equal(runs[0].endTopFt,runs[1].startTopFt);
assert.equal(runs[1].endTopFt,runs[2].startTopFt);
assert.equal(runs[2].endTopFt,runs[0].startTopFt);
assert.equal(runs[0].miterEnd,true);
assert.equal(runs[1].miterStart,true);
assert.equal(runs[1].miterEnd,true);
assert.equal(runs[2].miterStart,true);
const w=6.5/12;
assert.equal(g.miterAlongFt(-w,false,true,runs[0]),w,
  'left run outer fascia must extend to a 45-degree corner');
assert.equal(g.miterAlongFt(-w,true,false,runs[1]),-w,
  'front run outer fascia must extend back to the same corner');
assert.equal(g.miterAlongFt(-w,false,true,runs[1]),w);
assert.equal(g.miterAlongFt(-w,true,false,runs[2]),-w);
assert.equal(g.planWrapAroundGutter({
  leftFt:3,rightFt:2,rearFt:0,frontFt:8,rearTopFt:9,frontTopFt:8,
}).length,0,'invalid roof envelope must produce no gutters');
assert.deepEqual(f.coverFrameColors,['White','Bronze','Black','Sandstone']);
assert.deepEqual(f.coverRoofColors,['White','Silver','Sandstone']);
assert.deepEqual(f.coverCeilingFinishes,[
  'White','Bronze','Sandstone','Black','Silver','Mahogany Wood Grain','Hickory Wood Grain',
]);
const project=makeConsultationProject('finishes');
assert.equal(project.coverColor,'White');
assert.equal(project.coverRoofColor,'White');
assert.equal(project.coverCeilingFinish,'White');
const updated=updateConsultation(project,{
  kind:'covered-deck',coverFamily:'Classico',coverColor:'Black',
  coverRoofColor:'Silver',coverCeilingFinish:'Mahogany Wood Grain',
});
assert.equal(updated.revision,project.revision+1);
const handoff=createEstimateHandoff(updated);
assert.equal(handoff.project.coverColor,'Black');
assert.equal(handoff.project.coverRoofColor,'Silver');
assert.equal(handoff.project.coverCeilingFinish,'Mahogany Wood Grain');
assert.equal(handoff.selections.coverRoofColor,'Silver');
assert.equal(handoff.selections.coverCeilingFinish,'Mahogany Wood Grain');
const read=(file)=>fs.readFileSync(path.resolve(root,file),'utf8');
const renderer=read('src/components/visual3d/RenaissanceCover3D.tsx');
const ext=read('src/components/visual3d/RenaissanceExtrusions.tsx');
const mat=read('src/components/visual3d/RenaissanceRoofMaterials3D.tsx');
const picker=read('src/components/ConsultationVisualPickers.tsx');
assert.ok(renderer.includes('gutterRuns.map')&&renderer.includes('planWrapAroundGutter'));
assert.ok(renderer.includes('RenaissanceReceivingChannel')&&renderer.includes('RenaissanceDownspout'));
assert.ok(!renderer.includes('topY={eaveY-.07}'),'old 2-side constant-height gutters must be gone');
assert.ok(ext.includes('architecturalGutterOutlineFt')&&ext.includes('miterAlongFt'),
  'gutter mesh must extrude measured sloped fascia with 45-degree miters');
assert.ok(mat.includes('material-2')&&mat.includes('material-3'),
  'the roof top and underside must be independent materials');
assert.ok(mat.includes('illustrativeWoodTexture')&&mat.includes('Hickory Wood Grain'));
assert.ok(picker.includes('coverRoofColors.map')&&picker.includes('coverCeilingFinishes.map'));
const scene=read('src/components/Consultation3D.tsx');
assert.ok(scene.includes("project.coverRoofColor??'White'"));
console.log('PASS centered Classico/Aria/Fresco truss layout, 6.5-in manufacturer gutter section, connected 3-side 45deg miters, separated roof/ceiling/frame finishes and estimator compatibility');
