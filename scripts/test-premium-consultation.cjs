/* Premium client consultation and drawing-backed visual assembly release tests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);
  if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const m={exports:{}};cache.set(full,m);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
  }).outputText;
  new Function('require','module','exports',code)((name)=>name.startsWith('.')?
    load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),m,m.exports);
  return m.exports;
}
const {makeConsultationProject,updateConsultation}=load('src/lib/consultationProject');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const {buildDeckModel}=load('src/lib/deckModel');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const {buildDeckStairSkirting}=load('src/lib/deckStairSkirting');
const p=makeConsultationProject('premium-smoke');
assert.equal(p.coverFraming,'standard');
assert.equal(p.coverMount,'wall-attached');
assert.equal(p.coverScreenStyle,'none');
assert.equal(p.coverHeightFt,9);
const changed=updateConsultation(p,{coverFraming:'wide',coverMount:'freestanding',coverScreenStyle:'dolce-open-view',
  coverWidthFt:18,coverProjectionFt:14,coverPostCount:2,coverSideOverhangFt:1,coverFrontOverhangFt:1,
  coverFamily:'Fresco',kind:'covered-deck'});
assert.equal(changed.revision,p.revision+1);
const req=createEstimateHandoff(changed);
assert.equal(req.project.coverFraming,'wide');
assert.equal(req.project.coverScreenStyle,'dolce-open-view');
assert.equal(req.selections.coverWidthFt,18);
assert.equal(req.selections.coverPostCount,2);
assert.ok(req.blockers.some(s=>s.includes('engineering-approved')));
assert.ok(req.blockers.some(s=>s.includes('Dolce')));
const m=buildDeckModel(p.values);
const sides=m.exposedSegments.map(s=>s.index);
assert.ok(sides.length);
const skirting={...p.values,skirtingEnabled:true,skirtingEdges:JSON.stringify(sides),
  skirtingMaterial:'kdat',skirtingOrientation:'vertical',skirtingStairsEnabled:true};
const plan=buildDeckSkirting(m.edgeSegments,m.exposedSegments,Number(p.values.deckHeight),7.25,skirting);
assert.equal(plan.sides.length,sides.length);
assert.ok(plan.frameStock.length>0);
assert.ok(plan.frameScrews>0);
assert.ok(plan.finishNails>0);
const horizontal={...skirting,skirtingOrientation:'horizontal'};
const hplan=buildDeckSkirting(m.edgeSegments,m.exposedSegments,Number(p.values.deckHeight),7.25,horizontal);
assert.ok(hplan.sides.some(s=>s.courses.length>0));
assert.ok(hplan.options.orientation==='horizontal');
const stairs=buildDeckStairSkirting(m,skirting);
assert.ok(Array.isArray(stairs.sides));
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const c=read('src/components/ConsultationVisualPickers.tsx');
assert.ok(c.includes('ProductPhoto'));
assert.ok(!c.includes('function RailStyleDiagram('));
assert.ok(!c.includes('function CoverSilhouette('));
assert.ok(c.includes('IntersectionObserver') && c.includes('rootMargin:') && c.includes('12000'));
assert.ok(c.includes("onLoad={()=>{loaded.current=true;cancelTimeout();}}"));
const photos=read('src/data/consultationPhotos.ts');
assert.ok(photos.includes('images.squarespace-cdn.com'));
assert.ok(photos.includes('sunsolutions1.com'));
assert.ok(!photos.includes('images.unsplash.com'));
const deck=read('src/components/visual3d/ManufacturerDeck3D.tsx');
for(const part of ['DeckStructure3D','DeckStairAssembly3D','DeckSkirting3D','meshBasicMaterial','material-2'])
  assert.ok(deck.includes(part),'3D deck should include '+part);
const framing=read('src/components/visual3d/DeckStructure3D.tsx');
assert.ok(framing.includes('model.beamLines')&&framing.includes('model.joistPositions'));
assert.ok(framing.includes('thickness={beamD}')&&framing.includes('beamTop'));
const stringers=read('src/components/visual3d/DeckStairAssembly3D.tsx');
assert.ok(stringers.includes('ExtrudeGeometry')&&stringers.includes('hasDecorativeStairFascia'));
assert.ok(!stringers.includes('radius={.10}'));
const skirt3d=read('src/components/visual3d/DeckSkirting3D.tsx');
assert.ok(skirt3d.includes('buildConstructionSkirting')&&skirt3d.includes('assembly.parts.map'));
assert.ok(read('src/lib/constructionSkirting.ts').includes('side.physicalMembers'));
const cover=read('src/components/visual3d/RenaissanceCover3D.tsx');
for(const part of ['wide-insert','DolceScreenRun','fresco-polycarbonate'])
  assert.ok(cover.includes(part),'Cover module missing '+part);
const coverLayout=read('src/lib/renaissanceCoverWallLayout.ts');
for(const part of ['coverFraming','coverWidthFt','coverProjectionFt','makeRenaissanceFramePlan',
 'seatCanopyPost','maxReferenceOverhangFt'])
  assert.ok(coverLayout.includes(part),'Shared cover structural layout missing '+part);
assert.ok(cover.includes('planRenaissanceCoverWalls')&&
  cover.includes('const coverWallRuns=wallAnchors.wallRuns'),
  'Covered-deck rendering must use the same seated columns as editable Elite/Dolce walls');
const studio=read('src/components/ConsultationStudio.tsx')+read('src/components/ConsultationDetailsPanel.tsx');
assert.ok(studio.includes('ConsultationTechnicalSettings')&&studio.includes('ConsultationSkirtingOptions'));
const css=read('src/styles/global.css');
assert.ok(css.includes('--bg: #0a1824;')&&!css.includes('--bg: #171412;'));
console.log('PASS premium consultation color, photo provenance, entire skirting model, true joists/stringers, drawing-backed Renaissance profiles and estimator compatibility');
