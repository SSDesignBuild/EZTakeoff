/** Checks against the stepped brick custom deck shown in the 2026-11-17 field video. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){
  const full=path.resolve(__dirname,'..',file.endsWith('.ts')||file.endsWith('.json')?file:file+'.ts');
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const record={exports:{}};cache.set(full,record);
  const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText;
  new Function('require','module','exports',compiled)((name)=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),record,record.exports);
  return record.exports;
}
const {buildDeckModel,buildLowerTierDeckModel}=load('src/lib/deckModel');
const {calculateEstimate}=load('src/lib/estimate');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find((item)=>item.slug==='decks').defaults;
const shape=JSON.stringify([
  {x:2,y:0},{x:18,y:0},{x:18,y:8},{x:20,y:8},
  {x:20,y:24},{x:0,y:24},{x:0,y:8},{x:2,y:8},
]);
const example={...defaults,deckShape:shape,quickWidth:20,quickProjection:24,attachment:'brick',boardRun:'width',
  customBeamYs:JSON.stringify([])};
const auto=buildDeckModel(example);
assert.ok(auto.beamLines.length>1,'Stepped brick deck should have auto support beams');
assert.ok(auto.beamLines.every((beam)=>beam.segments.every((run)=>run.length>3)),
  '1-2ft notch return edges must never create phantom tiny interior beams');
assert.ok(!auto.beamLines.some((beam)=>Math.abs(beam.offsetFromHouse-8)<0.05),
  'Notch y=8 should not force a new beam at the step');
const manualStations=[0,7,16,22];
const manual=buildDeckModel({...example,customBeamYs:JSON.stringify(manualStations)});
assert.deepEqual(manual.beamLines.map((beam)=>beam.offsetFromHouse),manualStations,
  'Manual stations replace all auto beam stations (no forced inset beam)');
assert.ok(manual.beamLines.every((beam)=>beam.segments.length>0));
const moved=buildDeckModel({...example,customBeamYs:JSON.stringify([0,9,16,22])});
assert.deepEqual(moved.beamLines.map((beam)=>beam.offsetFromHouse),[0,9,16,22]);
assert.notDeepEqual(manual.beamLines[1].segments,moved.beamLines[1].segments,
  'Moving across the step must recalculate continuous beam segment lengths');
const horizontal=buildDeckModel({...defaults,attachment:'freestanding',boardRun:'projection',
  deckShape:JSON.stringify([{x:0,y:0},{x:28,y:0},{x:28,y:10},{x:0,y:10}]),
  customBeamYs:JSON.stringify([0,8,25])});
assert.equal(horizontal.joistDirection,'horizontal');
assert.deepEqual(horizontal.beamLines.map((beam)=>beam.offsetFromHouse),[0,8,25],
  'Horizontal joists use 28ft width, not 10ft depth, to locate manual beams');
assert.ok(horizontal.beamLines.every((beam)=>beam.segments.length===1));
const structural={...example,customBeamYs:JSON.stringify([0,10,22]),
  joistSizeChoice:'2x12',beamSizeChoice:'2x12',postSizeChoice:'8x8',footingDiameterIn:18,footingDepthIn:36,
  connectorFastenerChoice:'approved-screws'};
const deck=buildDeckModel(structural);
assert.equal(deck.joistSize,'2x12');
assert.equal(deck.beamMemberSize,'2x12');
assert.equal(deck.postSize,'8x8');
assert.equal(deck.footingDiameterIn,18);
assert.equal(deck.footingDepthIn,36);
assert.ok(deck.postCount>0);
assert.equal(deck.footingBagsPerPost,Math.ceil((Math.PI*Math.pow(18/24,2)*3)/0.6));
assert.equal(deck.concreteBags,deck.footingBagsPerPost*deck.postCount);
assert.equal(deck.footingTubeCount,deck.postCount,'36 in pier requires a separate 48 in tube');
const estimation=calculateEstimate('decks',structural);
assert.ok(estimation.materials.some((m)=>m.name==='8x8 wood posts'));
assert.ok(estimation.materials.some((m)=>m.name==='18 in x 48 in Sonotubes'&&m.quantity===deck.footingTubeCount));
assert.ok(estimation.materials.some((m)=>m.name==='Concrete mix'&&m.quantity===deck.concreteBags));
assert.ok(estimation.materials.some((m)=>m.name==='Connector-rated structural fastener screws'));
assert.ok(!estimation.materials.some((m)=>m.name==='Structural joist-hanger connector nails'));
assert.ok(estimation.materials.some((m)=>m.name==='2x12 joist'));
const lower=buildLowerTierDeckModel({...structural,multiTierEnabled:true,lowerDeckHeight:3,
  lowerDeckShape:JSON.stringify([{x:0,y:0},{x:8,y:0},{x:8,y:6},{x:0,y:6}]),lowerCustomBeamYs:JSON.stringify([0,4])});
assert.ok(lower && lower.postSize==='8x8'&&lower.footingDiameterIn===18);
const designer=fs.readFileSync(path.resolve(__dirname,'../src/components/DeckDesigner.tsx'),'utf8');
assert.ok(designer.includes('beam-drag-hit')&&designer.includes('setPointerCapture'),'Beam editor must have generous drag target with pointer capture');
assert.ok(designer.includes('moveBeamStation')&&designer.includes('Beam placement'),'Beam inspector needs an exact station control');
assert.ok(designer.includes("mode === 'posts' &&")&&designer.includes("mode === 'beams' &&"),'Inspector should show only relevant tools');
const workflow=fs.readFileSync(path.resolve(__dirname,'../src/components/DeckWorkspaceFlow.tsx'),'utf8');
for(const step of ['Structure & site','Draw & position','Deck boards & trim','Stairs & railing','Customer & takeoff'])
  assert.ok(workflow.includes(step), 'Missing guided deck step '+step);
assert.ok(workflow.includes('footingDiameterIn')&&workflow.includes('connectorFastenerChoice'));
assert.ok(workflow.includes('<DeckDesigner'));
assert.ok(workflow.includes('<MaterialTable'));
console.log('PASS stepped-notch phantom beam elimination, movable exact stations, horizontal axis, size/footing takeoff and guided five-step UI');
