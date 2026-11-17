/** Exact regression checks for pressure-treated drink rail, house picture frame and stair layers. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function loadTs(file){
  const full=path.resolve(__dirname,'..',file.endsWith('.ts')?file:file+'.ts');
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports',code)((name)=>name.startsWith('.')?loadTs(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
  return mod.exports;
}
const {buildDeckModel,buildLowerTierDeckModel}=loadTs('src/lib/deckModel');
const {deriveDeckingLabelPlan}=loadTs('src/lib/deckingLabels');
const {calculateEstimate}=loadTs('src/lib/estimate');
const {SERVICES}=loadTs('src/data/services');
const defaults=SERVICES.find((s)=>s.slug==='decks').defaults;
const rect=(w,d)=>JSON.stringify([{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]);
const settings={...defaults,deckShape:rect(12,10),attachment:'siding',quickWidth:12,quickProjection:10,pictureFrameCount:2,pictureFrameHouseSide:false};
const exposed=buildDeckModel(settings);
assert.ok(exposed.houseEdgeIndices.length>0);
assert.ok(exposed.pictureFrameSegments.length<exposed.edgeSegments.length);
const full=buildDeckModel({...settings,pictureFrameHouseSide:true});
assert.equal(full.pictureFrameSegments.length,full.edgeSegments.length);
assert.equal(full.pictureFrameCount,2);
const noHouseLabels=deriveDeckingLabelPlan(exposed).groups.filter((g)=>g.kind==='picture-frame');
const allSideLabels=deriveDeckingLabelPlan(full).groups.filter((g)=>g.kind==='picture-frame');
const count=(list)=>list.reduce((sum,row)=>sum+Number(row.count ?? row.quantity ?? 0),0);
assert.equal(count(allSideLabels)-count(noHouseLabels),2*exposed.houseEdgeIndices.length);
assert.ok(full.blockingLf>=exposed.blockingLf);
const frameOff=calculateEstimate('decks',settings);
const frameOn=calculateEstimate('decks',{...settings,pictureFrameHouseSide:true});
const frameMaterials=(r)=>r.materials.filter((m)=>m.name.startsWith('Picture-frame deck board'));
assert.ok(frameMaterials(frameOn).length>0);
assert.ok(count(frameMaterials(frameOn))>count(frameMaterials(frameOff)));
assert.ok(frameMaterials(frameOn).some((m)=>m.notes.includes('including house-facing')));
const lowerValues={...settings,multiTierEnabled:true,lowerDeckShape:rect(8,6),lowerDeckHeight:4,lowerPictureFrameHouseSide:true};
const lower=buildLowerTierDeckModel(lowerValues);
assert.ok(lower);
assert.equal(lower.pictureFrameSegments.length,lower.edgeSegments.length);
const lowerBOM=calculateEstimate('decks',lowerValues);
assert.ok(lowerBOM.materials.some((m)=>m.name.startsWith('Lower-tier picture-frame deck board')));
const woodBase={...settings,deckingType:'pressure-treated',deckingMaterial:'Pressure treated 5/4x6',
  manualRailingEdges:JSON.stringify([1,2,3]),railingType:'wood',railingSystem:'standard',
  drinkRail:true,woodDrinkRailSize:'2x6'};
const sizes=['5/4x6','2x6','2x8','2x10','2x12'];
for(const size of sizes){
  const estimate=calculateEstimate('decks',{...woodBase,woodDrinkRailSize:size});
  const rows=estimate.materials.filter((m)=>m.name===size+' pressure-treated wood drink rail');
  assert.ok(rows.length>0,'Missing wood rail size '+size);
  assert.ok(rows.every((m)=>/^(8|12|16|20) ft stock$/.test(m.stockRecommendation)));
  assert.ok(rows.every((m)=>m.notes.includes('WR-LEVEL-')));
  assert.ok(!estimate.validationIssues.some((issue)=>issue.includes('drink rail')),'valid stock should not be blocked for '+size);
}
const hidden=calculateEstimate('decks',{...woodBase,drinkRail:false});
assert.equal(hidden.materials.filter((m)=>m.name.includes('pressure-treated wood drink rail')).length,0);
const longRun=calculateEstimate('decks',{...woodBase,deckShape:rect(28,10),quickWidth:28,manualRailingEdges:JSON.stringify([0])});
assert.ok(longRun.validationIssues.some((v)=>v.includes('drink rail')));
const frameView=fs.readFileSync(path.resolve(__dirname,'../src/components/LayoutPreview.tsx'),'utf8');
assert.ok(frameView.includes('const showStairFraming = showFraming || showStairs;'));
assert.equal((frameView.match(/showStairFraming && \(/g)||[]).length,2,'main and lower stair stringers visible in framing');
assert.ok(frameView.includes('showStairs && Array.from({ length: treadCount }'),'tread visuals stay in stairs/overview view');
assert.ok(frameView.includes('deck.pictureFrameHouseSide ? [] : deck.houseEdgeIndices'));
console.log('PASS five PT drink rail profiles, selected house border all tiers, material reconciliation and stair-framing display');
