/* Studio-only cover/enclosure selections must remain readable in the Admin
 * material export, alongside the exact shared material quantities. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);
  if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
  }}).outputText;
  new Function('require','module','exports',js)(name=>name.startsWith('.')?
    load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
  return mod.exports;
}
const {makeConsultationProject}=load('src/lib/consultationProject');
const bridge=load('src/lib/consultationTakeoffBridge');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const p=makeConsultationProject('takeoff-scope-fixture');
p.coverFamily='Moderno';p.kind='covered-deck';p.coverColor='Bronze';
p.coverRoofColor='Silver';p.coverCeilingFinish='Hickory Wood Grain';
p.coverRoofStyle='gable';p.coverMount='freestanding';p.coverFraming='wide-insert';
p.coverWidthFt=16;p.coverProjectionFt=12;p.coverHeightFt=10;
p.coverScreenStyle='dolce-standard';p.coverScreenColor='White';
p.coverScreenRailTreatment='integrated-kick';p.coverDoorEnabled=false;
p.values={...p.values,stairCount:0,additionalStairs:'[]'};
const data=new Map(),store={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const copy=bridge.readConsultationTakeoff(bridge.openConsultationInTakeoff(p,store).id,store);
const copied=bridge.consultationTakeoffEstimate(copy,copy.values);
assert.deepEqual(copied.materials,createEstimateHandoff(p).materials,
  'Adding readable selection scope must preserve the complete Studio material quantities');
const notes=copied.orderNotes.join('\n');
for(const text of ['Moderno','gable','freestanding','wide with insert framing','frame Bronze',
  'roof Silver','ceiling Hickory Wood Grain','width 16 ft','projection 12 ft','post height 10 ft',
  'Dolce standard','framing and kick panels White','integrated kick'])
  assert.ok(notes.includes(text),'Copied material export must include '+text);
assert.ok(notes.includes('not a manufacturer roof fabrication drawing'),
  'Readable selected scope must not turn deck sheets into a claimed cover fabrication plan');
assert.equal(copy.project.coverScreenColor,'White');
const matching=bridge.consultationTakeoffScopeNotes({...p,coverScreenColor:'match'}).join(' ');
assert.ok(matching.includes('framing and kick panels Bronze'),'Match cover resolves to its actual selected finish');
const room={...p,coverScreenStyle:'elite-add-a-room',eliteSunroom:{
  roomSystem:'3-thermal',framingColor:'white',panelColor:'clay',windowColor:'bronze',
  glassType:'clear-insulated',buildMode:'existing-structure',walls:{},
}};
const roomNotes=bridge.consultationTakeoffScopeNotes(room).join(' ');
for(const text of ['Elite Add-A-Room','3-inch thermal','framing white','panels clay','windows bronze'])
  assert.ok(roomNotes.includes(text),'Independent sunroom color survives the copied scope: '+text);
assert.ok(!roomNotes.includes('Screen room selection:'),'The retired screen choice does not appear as current scope');
assert.deepEqual(bridge.consultationTakeoffScopeNotes({...room,coverFamily:'none'}),[],
  'Saved dormant cover and enclosure selections are not represented as installed after cover removal');
// Removing a cover preserves choices for restoration, but neither the external
// estimator nor the editable Admin copy may order the dormant room, report
// its conflicts, or describe its door/privacy walls as installed. Enclosure
// choices never introduce a supplemental deck-board patch, covered or not.
const openDeck={...room,kind:'deck',coverFamily:'none',coverScreenStyle:'none',
  coverPrivacyWallGaps:{},coverDoorEnabled:false};
const openHandoff=createEstimateHandoff(openDeck);
for(const screenStyle of ['elite-add-a-room','lumino-sunroom','dolce-open-view','dolce-standard','none']){
  const covered={...room,coverScreenStyle:screenStyle,coverDoorEnabled:true,
    coverDoorSide:'front',coverPrivacyWallGaps:{front:2,left:0,right:0,rear:0}};
  const coveredHandoff=createEstimateHandoff(covered);
  assert.ok(!coveredHandoff.materials.some(item=>
    item.name==='Interior deck closure board at Elite sunroom wall'),
    'Enclosures use the same physical deck layout without a supplemental closure board');
  const uncovered={...covered,coverFamily:'none'};
  const saved=JSON.stringify(uncovered),handoff=createEstimateHandoff(uncovered);
  assert.deepEqual(handoff.materials,openHandoff.materials,
    screenStyle+': no enclosure or floor-closure material survives cover removal');
  assert.deepEqual(handoff.blockers,openHandoff.blockers,
    screenStyle+': dormant enclosure, privacy and door conflicts cannot block an open deck');
  assert.deepEqual(handoff.assumptions,openHandoff.assumptions,
    screenStyle+': inactive room and closure assumptions stay out of exported scope');
  assert.equal(handoff.project.coverScreenStyle,'none');
  assert.equal(handoff.selections.coverScreenStyle,'none');
  assert.equal(handoff.selections.coverDoorEnabled,false);
  for(const side of ['Front','Left','Right','Rear'])
    assert.equal(handoff.selections['coverPrivacy'+side+'GapIn'],0);
  assert.ok(!Object.keys(handoff.selections).some(key=>key.startsWith('elite')),
    'Inactive Elite window sections and room settings are not sent as estimator selections');
  const dormantCopy=bridge.readConsultationTakeoff(bridge.openConsultationInTakeoff(uncovered,store).id,store);
  const dormantEstimate=bridge.consultationTakeoffEstimate(dormantCopy,dormantCopy.values);
  const openEstimate=bridge.consultationTakeoffEstimate({...dormantCopy,project:openDeck},dormantCopy.values);
  assert.deepEqual(dormantEstimate.materials,handoff.materials,
    'The editable Takeoff copy excludes the same inactive materials as the external handoff');
  assert.deepEqual(dormantEstimate.orderNotes,openEstimate.orderNotes,
    'The copied material export has only open-deck scope and current caveats');
  assert.equal(dormantCopy.project.coverScreenStyle,screenStyle);
  assert.deepEqual(dormantCopy.project.coverPrivacyWallGaps,covered.coverPrivacyWallGaps);
  assert.equal(dormantCopy.project.coverDoorEnabled,true);
  assert.deepEqual(dormantCopy.project.eliteSunroom,covered.eliteSunroom);
  const restored=createEstimateHandoff({...dormantCopy.project,coverFamily:covered.coverFamily});
  for(const key of ['materials','selections','blockers','assumptions'])
    assert.deepEqual(restored[key],coveredHandoff[key],
      screenStyle+': restoring the cover reactivates its exact saved '+key);
  assert.equal(JSON.stringify(uncovered),saved,'Export and Takeoff copy must not rewrite saved Studio choices');
}
const pergolaNotes=bridge.consultationTakeoffScopeNotes({...p,coverFamily:'Fresco',coverRoofStyle:'studio',
  coverWidthFt:0,coverProjectionFt:undefined,coverScreenStyle:'none'}).join(' ');
assert.ok(pergolaNotes.includes('width follows deck footprint')&&pergolaNotes.includes('projection follows deck footprint'));
assert.ok(!pergolaNotes.includes('roof Silver')&&!pergolaNotes.includes('ceiling Hickory'),
  'Inactive solid-roof finishes are retained in the snapshot but excluded from open-cover scope');
console.log('PASS Studio→Takeoff exact material parity, readable cover/enclosure scope, cover-removal isolation and restoration, matched finishes and fabrication caveat');
