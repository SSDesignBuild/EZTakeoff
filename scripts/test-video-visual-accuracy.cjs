/* Video-reported EZTakeoff visual regressions: geometry + renderer contracts. */
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
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {planMiteredPictureFrames}=load('src/lib/deckMiterGeometry');
const {seatCanopyPost,postInsideDeck}=load('src/lib/coverDeckPlacement');
const {subtractRailingOpenings}=load('src/lib/salesRailOpenings');
const {planStraightStairFascia}=load('src/lib/stairFasciaGeometry');
const {planPcaDoorOnWall,pcaPetCompatibility,PCA_3068,PCA_PET_OPENINGS}=
  load('src/lib/pcaScreenDoorGeometry');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const poly=[[0,0],[16,0],[16,12],[0,12]].map(([x,y])=>({x,y}));
const edges=poly.map((start,i)=>{
  const end=poly[(i+1)%poly.length];
  return {index:i,start,end,length:Math.hypot(end.x-start.x,end.y-start.y),
    orientation:start.y===end.y?'horizontal':'vertical'};
});
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const miters=planMiteredPictureFrames(poly,edges,3);
assert.equal(miters.length,12,'All 4 perimeter edges require 3 independent courses');
for(let course=0;course<3;course++)for(let i=0;i<4;i++){
  const thisEdge=miters.find(m=>m.edgeIndex===i&&m.course===course);
  const next=miters.find(m=>m.edgeIndex===(i+1)%4&&m.course===course);
  assert.ok(distance(thisEdge.corners[1],next.corners[0])<.00001,
    'Picture frame outside miter tips must meet at same corner');
  assert.ok(distance(thisEdge.corners[2],next.corners[3])<.00001,
    'Picture frame inside miter tips must meet at same corner');
}
const anti=[...poly].reverse();
const antiEdges=anti.map((start,i)=>{
  const end=anti[(i+1)%anti.length];
  return {index:i,start,end,length:Math.hypot(end.x-start.x,end.y-start.y),
    orientation:start.y===end.y?'horizontal':'vertical'};
});
assert.equal(planMiteredPictureFrames(anti,antiEdges,2).length,8,
  'Clockwise decks must still have proper miters');
const house=planMiteredPictureFrames(poly,edges.filter(e=>e.index!==0),1);
assert.equal(house.length,3,'House-side omission preserves square termination');
const fitted=seatCanopyPost([16.4,12.1],poly,3.875/12+.15);
assert.ok(fitted&&postInsideDeck(fitted,poly,(3.875/12+.15)/2+.1),
  'Support base plate may NEVER hang off deck edge');
assert.ok(distance(fitted,[16.4,12.1])>.1);
assert.deepEqual(seatCanopyPost([3,3],poly,3.875/12),[3,3]);
assert.equal(seatCanopyPost([0,0],[],3.875/12),null);
const runs=[{edgeIndex:2,start:0,end:16,kind:'level'}];
const split=subtractRailingOpenings(runs,[{edgeIndex:2,startFt:6,endFt:10}],.1);
assert.equal(split.length,2,'Stairs and gates must physically divide railing');
assert.ok(split[0].end<=5.95&&split[1].start>=10.05);
assert.ok(split.every(r=>r.kind==='level'));
assert.deepEqual(subtractRailingOpenings(runs,[],0),runs);
const fascia=planStraightStairFascia({
  treadDepthFt:11/12,treads:7,riseFt:5/8,heightFt:5,
});
assert.equal(fascia.length,4);
for(let i=1;i<=7;i++){
  const t=i/7;
  const top=fascia[0].riseFt+(fascia[1].riseFt-fascia[0].riseFt)*t;
  const nosing=5-i*(5/8)+.102;
  assert.ok(top>nosing+.02,
    'Straight stair side fascia MUST be above every tread front corner');
}
assert.equal(PCA_3068.widthFt,3);
assert.equal(PCA_3068.heightFt,80/12);
assert.deepEqual(PCA_PET_OPENINGS.small,{widthIn:6,heightIn:8});
assert.deepEqual(PCA_PET_OPENINGS.medium,{widthIn:11,heightIn:13});
assert.deepEqual(PCA_PET_OPENINGS.large,{widthIn:13,heightIn:20});
assert.ok(pcaPetCompatibility('A-100','large'));
assert.ok(!pcaPetCompatibility('A-500','medium'));
const opening=planPcaDoorOnWall(14,50);
assert.ok(opening&&Math.abs(opening.startFt-5.5)<.001);
assert.ok(!planPcaDoorOnWall(2,50),'Too-short wall cannot receive a 3068 door');
const project=makeConsultationProject('recorded-video');
assert.equal(project.coverDoorModel,'A-100');
assert.equal(project.coverScreenRailTreatment,'integrated-kick');
const handoff=createEstimateHandoff({...project,kind:'covered-deck',
  coverFamily:'Fresco',coverScreenStyle:'dolce-open-view',
  coverDoorEnabled:true,coverDoorSide:'right',coverDoorPet:'large'});
assert.equal(handoff.selections.coverDoorSide,'right');
assert.equal(handoff.selections.coverDoorPet,'large');
assert.ok(handoff.blockers.some(issue=>issue.includes('PCA 3068')));
const deck=buildDeckModel(project.values);
const edge=deck.exposedSegments[0];
assert.ok(edge,'Need an exposed perimeter for skirting gate geometry QA');
const skirt=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,5,7.25,{
  ...project.values,skirtingEnabled:true,skirtingMaterial:'kdat',
  skirtingEdges:JSON.stringify([edge.index]),skirtingGradeConfirmed:true,
  skirtingOpenings:JSON.stringify([{edgeIndex:edge.index,offset:.5,width:2.5,kind:'hinged-gate'}]),
});
assert.ok(skirt.sides.length>=1);
assert.ok(skirt.sides[0].openings.some(o=>o.kind==='hinged-gate'));
assert.ok(skirt.materials.some(m=>m.name.includes('Skirting access gate exterior hinges')));
assert.ok(skirt.materials.some(m=>m.name.includes('Skirting access gate latch')));
assert.ok(skirt.cuts.some(c=>c.location.includes('hinged access leaf')));
const read=(p)=>fs.readFileSync(path.resolve(root,p),'utf8');
const render=read('src/components/visual3d/RenaissanceCover3D.tsx');
const door=read('src/components/visual3d/PcaScreenDoor3D.tsx');
const board=read('src/components/visual3d/ManufacturerDeck3D.tsx');
const stair=read('src/components/visual3d/DeckStairAssembly3D.tsx');
const skirt3d=read('src/components/visual3d/DeckSkirting3D.tsx');
const rails=read('src/components/visual3d/ManufacturerRailing3D.tsx');
const picks=read('src/components/ConsultationVisualPickers.tsx');
const studio=read('src/components/ConsultationStudio.tsx');
const designer=read('src/components/DeckDesigner.tsx');
const downspout=read('src/components/visual3d/RenaissanceExtrusions.tsx');
assert.ok(render.includes('DolceScreenWall')&&render.includes('PcaScreenDoor3D'));
assert.ok(render.includes('integrated-Dolce-24in-aluminum-kick-panel'));
assert.ok(render.includes('integrated-Dolce-guard-picket-panel'));
assert.ok(door.includes('PCA-Magnador-'));
assert.ok(rails.includes('screenIntegrated?[]'));
assert.ok(rails.includes('subtractRailingOpenings')&&rails.includes('screenDoorOpenings'));
assert.ok(board.includes('planMiteredPictureFrames'));
assert.ok(stair.includes('underFasciaAt')&&stair.includes('riserTexture'));
assert.ok(skirt3d.includes("layer==='finish'")&&skirt3d.includes("layer==='jamb'"));
assert.ok(skirt3d.includes('placed-hinged-skirting-access-gate'));
assert.ok(skirt3d.includes('rotation={[0,yaw,0]}'),
  'Perimeter skirting must follow angled deck edge vectors, not arbitrary X/Z axes');
assert.ok(downspout.includes('routedDownspoutSections')&&
  downspout.includes('QuadraticBezierCurve3')&&
  downspout.includes('layout.elbows.flatMap')&&
  !downspout.includes('CatmullRomCurve3'),
  'Authentic A/B elbows must be hollow swept transitions between cut straight pipe');
assert.ok(studio.includes('viewportHeight={viewportHeight}'));
assert.ok(studio.includes('Stair fascia edge'));
assert.ok(picks.includes('PCA Products 3068'));
assert.ok(designer.includes('railingFeedback')&&designer.includes('NO RAIL'));
console.log('PASS video-report geometry miters, post inset, stair fascia and skirting, PCA 3068 and pet openings, rail and access gate gaps, responsive viewer controls');
