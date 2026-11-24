/** 2026-11-17 deck production regression: gates, movable supports, stairs, skirting, excluded materials. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){
 const full=path.resolve(__dirname,'..',file.endsWith('.ts')?file:file+'.ts');
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','module','exports',code)((name)=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
 return mod.exports;
}
const {SERVICES}=load('src/data/services');
const {buildDeckModel}=load('src/lib/deckModel');
const {calculateEstimate}=load('src/lib/estimate');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const {buildDeckStairSkirting}=load('src/lib/deckStairSkirting');
const {planDeckGateHardware}=load('src/lib/deckGates');
const {buildTimberTechIRE}=load('src/lib/deckRailing');
const defaults=SERVICES.find((s)=>s.slug==='decks').defaults;
const rect=JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]);
const basic={...defaults,attachment:'freestanding',deckShape:rect,quickWidth:16,quickProjection:12,
 stairCount:1,stairEdgeIndex:2,stairWidth:4,stairRise:3,deckHeight:5};
const gates=planDeckGateHardware(JSON.stringify([
 {id:'small',label:'Pool gate',heightFt:4,widthFt:3},
 {id:'tall',label:'Privacy gate',heightFt:5.25,widthFt:4},
]));
assert.equal(gates.gates.length,2);
assert.equal(gates.hinges,5);assert.equal(gates.slideBolts,2);assert.equal(gates.caneBolts,1);
assert.equal(gates.materials.find((m)=>m.name.includes('self-closing'))?.quantity,5);
assert.equal(gates.materials.find((m)=>m.name.includes('cane bolt'))?.quantity,1);
assert.ok(planDeckGateHardware(JSON.stringify([{id:'bad',heightFt:-1,widthFt:4}])).issues.length>0);
const withGates=calculateEstimate('decks',{...basic,deckGateEntries:JSON.stringify(gates.gates)});
assert.ok(withGates.materials.some((m)=>m.name.includes('self-closing')&&m.quantity===5));
const railInputs={...basic,manualRailingEdges:JSON.stringify([1,2,3]),railingType:'aluminum',
 railingSystem:'timbertech-ire',railingTopProfile:'modern',railingInfill:'aluminum',
 railingManufacturerConfirmed:true,railingPostSize:'3x3',railingPostCap:'standard',railingPostTermination:'flush-top'};
const railDeck=buildDeckModel(railInputs);
const flush=buildTimberTechIRE(railDeck,railInputs);
assert.equal(flush.postCap,'none');
assert.ok(!flush.materials.some((m)=>m.name.includes('cap/light accessories')));
const drink=buildTimberTechIRE(railDeck,{...railInputs,railingTopProfile:'drink',railingPostTermination:'flush-drink',
 drinkRailMaterial:'TimberTech Vintage - Coastline'});
assert.equal(drink.postCap,'none');
assert.ok(!drink.materials.some((m)=>m.name.includes('cap/light accessories')));
assert.ok(!drink.issues.some((issue)=>issue.includes('requires the Drink')));
const unsafeNoCap=buildTimberTechIRE(railDeck,{...railInputs,railingPostTermination:'above-top',railingPostCap:'none'});
assert.ok(unsafeNoCap.issues.some((issue)=>issue.includes('No post cap')));
const chooseStyles={...basic,stairTreadStyle:'Pressure treated 5/4x6',stairRiserStyle:'TimberTech Vintage - Coastline'};
const stairEstimate=calculateEstimate('decks',chooseStyles);
const treads=stairEstimate.materials.filter((m)=>m.name==='Main stair tread board');
const risers=stairEstimate.materials.filter((m)=>m.name==='Main stair riser board');
assert.ok(treads.length>0&&risers.length>0,'both independent stair finish items required');
assert.ok(treads.every((m)=>/^(8|12|16|20) ft stock$/.test(m.stockRecommendation)));
assert.ok(risers.every((m)=>/^(16|20) ft stock$/.test(m.stockRecommendation)));
assert.ok(treads.some((m)=>m.notes?.includes('Pressure treated 5/4x6')));
assert.ok(risers.some((m)=>m.notes?.includes('TimberTech Vintage')));
const automaticRiser=calculateEstimate('decks',{...basic,stairRiserStyle:'auto'});
const fasciaQty=(estimate)=>estimate.materials.filter((m)=>m.name==='Fascia board').reduce((sum,m)=>sum+m.quantity,0);
assert.ok(fasciaQty(stairEstimate)<=fasciaQty(automaticRiser),
 'Replacing default fascia risers with separate boards must not increase fascia purchase count');
const deck=buildDeckModel(basic);
assert.ok(deck.stairCount===1&&deck.stairRunFt>0);
const side=deck.exposedSegments[0].index;
const skirtSettings={...basic,skirtingEnabled:true,skirtingStairsEnabled:true,
 skirtingEdges:JSON.stringify([side]),skirtingGradeConfirmed:true};
const wallSkirt=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,5,7.25,skirtSettings);
const stairSkirt=buildDeckStairSkirting(deck,skirtSettings);
assert.equal(stairSkirt.sides.length,2);
assert.ok(stairSkirt.sides.every((s)=>s.kind==='stair'&&s.startHeightFt>s.endHeightFt));
assert.ok(stairSkirt.frameScrews>0&&stairSkirt.finishNails>0&&stairSkirt.cuts.length>0);
assert.ok(stairSkirt.frameStock.every((bin)=>[8,10,12,16,20].includes(bin.stockLengthFt)));
const skirtingEstimate=calculateEstimate('decks',skirtSettings);
const framingScrews=skirtingEstimate.materials.find((m)=>m.name==='3 in exterior framing screws');
assert.ok(framingScrews && framingScrews.quantity>0);
assert.ok(skirtingEstimate.materials.some((m)=>m.name.includes('2 in exterior finish nails')&&m.quantity>=stairSkirt.finishNails+wallSkirt.finishNails));
assert.ok(skirtingEstimate.materials.some((m)=>m.category==='Skirting'&&m.unit==='boards'&&
 m.name.includes('deck and stair skirting finish')),
 'Actual main and stair skirting cuts must be packed into one order for the same stock');
assert.ok(skirtingEstimate.materials.some((m)=>m.name==='3 in exterior framing screws'));
assert.ok(!skirtingEstimate.materials.some((m)=>m.name.includes('3-1/2 in exterior framing screws')));
const noStairSkirt=calculateEstimate('decks',{...skirtSettings,skirtingStairsEnabled:false});
assert.ok(!noStairSkirt.materials.some((m)=>m.category==='Stair skirting'));
const ptScrews=calculateEstimate('decks',{...basic,deckingType:'pressure-treated',deckingMaterial:'Pressure treated 5/4x6'});
assert.ok(ptScrews.materials.some((m)=>m.name==='2 in exterior pressure-treated deck board screws'));
const designer=fs.readFileSync(path.resolve(__dirname,'../src/components/DeckDesigner.tsx'),'utf8');
assert.ok(designer.includes('draggingBeamRef.current')&&designer.includes('draggingPostRef.current'));
assert.ok(designer.includes('movePostToStation') && designer.includes("mode === 'posts'"),'post clicking fallback required');
const editor=fs.readFileSync(path.resolve(__dirname,'../src/components/DeckSkirtingEditor.tsx'),'utf8');
const materialUI=fs.readFileSync(path.resolve(__dirname,'../src/components/MaterialTable.tsx'),'utf8');
assert.ok(editor.includes('data-export-skirt-card')&&editor.includes('SkirtingElevation side={side}'));
assert.ok(materialUI.includes('renderCombinedSkirtingSheet')&&materialUI.includes('svg:not([data-export-skirting])'));
assert.ok(materialUI.includes('RemovedMaterialRecord')&&materialUI.includes('REMOVED / DO NOT ORDER'));
console.log('PASS per-gate hardware, cap-free railing, independent stair finish, stair-side skirting and fasteners, movement fallback and one-page export markers');
