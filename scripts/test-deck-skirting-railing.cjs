/** Regression tests for S&S skirting and manufacturer-aware railing takeoffs. */
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
const {buildDeckModel,buildLowerTierDeckModel}=load('src/lib/deckModel');
const {buildDeckSkirting,packSkirtCuts}=load('src/lib/deckSkirting');
const {buildTimberTechIRE}=load('src/lib/deckRailing');
const {calculateEstimate}=load('src/lib/estimate');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find((service)=>service.slug==='decks').defaults;
const shape=(width,depth)=>JSON.stringify([{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth}]);
const inputs={...defaults,attachment:'freestanding',deckShape:shape(19.5,8),quickWidth:19.5,quickProjection:8,deckHeight:7};
const deck=buildDeckModel(inputs);
assert.ok(deck.exposedSegments.length>=1);
const edge=deck.exposedSegments[0];
const config={...inputs,skirtingEnabled:true,skirtingEdges:JSON.stringify([edge.index]),
  skirtingGradeConfirmed:true,skirtingMaterial:'kdat',skirtingOrientation:'vertical'};
const skirt=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,config);
assert.equal(skirt.enabled,true);
assert.equal(skirt.sides.length,1);
assert.ok(skirt.sides[0].verticals.length>=Math.ceil(edge.length/2));
assert.ok(skirt.sides[0].verticals.every((x)=>x.heightFt>0));
assert.ok(skirt.cuts.some((x)=>x.material==='finish'));
assert.ok(skirt.frameStock.length>0 && skirt.finishStock.length>0);
assert.ok(skirt.finishStock.every((s)=>[8,12,16,20].includes(s.stockLengthFt)));
assert.equal(skirt.issues.length,0,skirt.issues.join(';'));
for(const group of [skirt.finishStock,skirt.frameStock]){
  for(const item of group){
    const expected=item.stockLengthFt*12-0.25-item.cuts.reduce((sum,cut)=>sum+cut.lengthFt*12+0.125,0);
    assert.ok(Math.abs(item.remainderIn-expected)<0.07);
  }
}
const materialEstimate=calculateEstimate('decks',config);
assert.ok(materialEstimate.materials.some((x)=>x.category==='Deck skirting'&&x.unit==='boards'));
assert.equal(materialEstimate.validationIssues.length,0,materialEstimate.validationIssues.join(';'));
const compos=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,{...config,skirtingMaterial:'pvc',skirtingColor:'White PVC',skirtingFaceIn:5.5});
assert.ok(compos.finishStock.length>0&&compos.finishStock.every((x)=>[16,20].includes(x.stockLengthFt)));
const horiz=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,{...config,skirtingOrientation:'horizontal'});
assert.ok(horiz.sides[0].courses.length>0);
const cut={edgeIndex:edge.index,offset:0.5,width:2,kind:'opening'};
const withOpening=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,{...config,skirtingOpenings:JSON.stringify([cut])});
assert.equal(withOpening.sides[0].bottomRails.length,2);
assert.ok(withOpening.sides[0].verticals.some((p)=>p.role==='jamb'));
assert.ok(withOpening.sides[0].finishCuts.length<skirt.sides[0].finishCuts.length);
const invalid=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,{...config,skirtingOpenings:JSON.stringify([{...cut,offset:edge.length-0.2}])});
assert.ok(invalid.issues.length>0);
const unconfirmed=calculateEstimate('decks',{...config,skirtingGradeConfirmed:false});
assert.ok(unconfirmed.validationIssues.some((x)=>x.toLowerCase().includes('grade')));
assert.equal(buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,7,7.25,inputs).enabled,false);
const packed=packSkirtCuts([{id:'A',edgeIndex:0,material:'2x4',lengthFt:3,location:'A'},{id:'B',edgeIndex:0,material:'2x4',lengthFt:3,location:'B'},{id:'C',edgeIndex:0,material:'2x4',lengthFt:3,location:'C'}],[8,10,12],0.125,0.25);
assert.equal(packed.issues.length,0);assert.equal(packed.stock.length,1);assert.equal(packed.stock[0].stockLengthFt,10);
const railInputs={...inputs,railingSystem:'timbertech-ire',railingType:'aluminum',railingTopProfile:'modern',railingColor:'dark-bronze',railingInfill:'aluminum',railingHeightIn:'36',railingPostSize:'3x3',railingManufacturerConfirmed:true};
const rail=buildTimberTechIRE(deck,railInputs);
assert.equal(rail.issues.length,0,rail.issues.join(';'));
assert.ok(rail.panels.length>0);
assert.ok(rail.posts.length>0);
assert.ok(rail.materials.some((x)=>x.name.includes('Universal')&&x.name.includes('panel')));
assert.ok(rail.materials.some((x)=>x.name.includes('modern top rail')));
assert.ok(rail.materials.filter((x)=>x.name.includes('Universal')).every((x)=>/69\.43|91\.31/.test(x.stockRecommendation)));
const railEstimate=calculateEstimate('decks',railInputs);
assert.equal(railEstimate.validationIssues.length,0,railEstimate.validationIssues.join(';'));
const drink=buildTimberTechIRE(deck,{...railInputs,railingTopProfile:'drink',drinkRailMaterial:'TimberTech Vintage - Coastline'});
assert.ok(drink.materials.some((x)=>x.stockRecommendation==='16 ft stock'||x.stockRecommendation==='20 ft stock'));
assert.ok(drink.materials.filter((x)=>x.name.includes('drink-rail full-profile')).every((x)=>/^(16|20) ft stock$/.test(x.stockRecommendation)));
const scalloped=buildTimberTechIRE(deck,{...railInputs,railingTopProfile:'drink',drinkRailMaterial:'TimberTech Terrain - Sandy Birch'});
assert.ok(scalloped.issues.some((x)=>x.includes('scalloped')));
const incompatible=buildTimberTechIRE(deck,{...railInputs,railingTopProfile:'drink',railingInfill:'glass',railingPostSize:'2x2'});
assert.ok(incompatible.issues.some((x)=>x.includes('glass')));
assert.ok(incompatible.issues.some((x)=>x.includes('3x3')));
const lowerModel=buildLowerTierDeckModel({...config,multiTierEnabled:true,lowerDeckShape:shape(9,5)});
assert.ok(lowerModel);
const lowerConfig={...config,multiTierEnabled:true,lowerDeckShape:shape(9,5),lowerDeckHeight:3,lowerSkirtingEnabled:true,lowerSkirtingEdges:JSON.stringify([lowerModel.exposedSegments[0].index]),lowerSkirtingGradeConfirmed:true};
const lowerPlan=buildDeckSkirting(lowerModel.edgeSegments,lowerModel.exposedSegments,3,7.25,lowerConfig,'lower');
assert.ok(lowerPlan.enabled && lowerPlan.sides.length===1 && lowerPlan.cuts.length>0);
console.log('PASS skirting sides/grades/24in framing/openings/stock cuts/PVC lengths/validation, TimberTech profiles/compatibility/lower tier');
