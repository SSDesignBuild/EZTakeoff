/* Regression for long supplier finish runs and mirrored stair fascia.
 * Deck purchase rows are physical stock only; cut plans never request 25ft SKUs.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);
 if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
 }}).outputText;
 new Function('require','module','exports',compiled)((name)=>name.startsWith('.')?
  load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);
 return mod.exports;
}
const {stockBoardSegments,supportedFinishCoursePieces,MAX_FINISH_CUT_FT}=load('src/lib/finishStockGeometry');
const {buildDeckModel,boardStockSegments}=load('src/lib/deckModel');
const {buildDeckSkirting,packSkirtCuts}=load('src/lib/deckSkirting');
const {calculateEstimate}=load('src/lib/estimate');
const {deriveDeckingLabelPlan}=load('src/lib/deckingLabels');
const {planMiteredPictureFrames,splitMiteredPictureFrames}=load('src/lib/deckMiterGeometry');
const {planProfiledStairFascia,planStairSideFascia}=load('src/lib/stairFasciaGeometry');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find(item=>item.slug==='decks').defaults;
const rect=(w,d)=>JSON.stringify([{x:0,y:0},{x:w,y:0},{x:w,y:d},{x:0,y:d}]);
const close=(actual,expected,eps=.01)=>assert.ok(Math.abs(actual-expected)<eps,
 'expected '+expected+', got '+actual);
assert.deepEqual(stockBoardSegments(25),[13,12],'25ft must have 2 stock-size pieces');
assert.deepEqual(boardStockSegments(44),[15,14,15],'44ft must use three purchasable supported pieces');
assert.ok(stockBoardSegments(20).every(piece=>piece<MAX_FINISH_CUT_FT));
for(const length of [20,25,44,52.5,100]){
 const pieces=stockBoardSegments(length);
 assert.ok(pieces.length>=Math.ceil(length/20));
 assert.ok(pieces.every(x=>x>0&&x<=MAX_FINISH_CUT_FT),'no full-stock 20ft cut');
 close(pieces.reduce((sum,p)=>sum+p,0),length);
}
const supported=supportedFinishCoursePieces(0,25,
 Array.from({length:13},(_,i)=>2*i));
assert.equal(supported.issues.length,0);
assert.equal(supported.pieces.length,2);
assert.ok(supported.pieces.every(p=>p.end-p.start<=MAX_FINISH_CUT_FT));
assert.ok([12,14].includes(supported.pieces[0].jointAtFt));
close(supported.pieces[1].start-supported.pieces[0].end,.125/12,.002);
const noBacking=supportedFinishCoursePieces(0,25,[]);
assert.ok(noBacking.issues.some(x=>x.includes('No 2x4 backing station')),
 'Never invent an unsupported skirting splice');

const geometry=buildDeckModel({...defaults,deckShape:rect(25,12),
 quickWidth:25,quickProjection:12,pictureFrameCount:2,boardRun:'width'});
const longEdge=geometry.exposedSegments.find(x=>x.length>=24.99);
assert.ok(longEdge,'front 25ft edge exists');
const pict=deriveDeckingLabelPlan(geometry).groups.filter(g=>g.kind==='picture-frame');
assert.ok(pict.length>0&&pict.every(g=>g.cutLength<=MAX_FINISH_CUT_FT),
 'Picture frames must never require 25ft single cuts');
const strips=planMiteredPictureFrames(geometry.points,geometry.pictureFrameSegments,2);
const jointed=splitMiteredPictureFrames(strips);
assert.ok(jointed.length>strips.length,'3D picture frame needs visible stock-length seam');
for(const strip of jointed){
 const [a,b,c,d]=strip.corners;
 const length=Math.max(Math.hypot(b[0]-a[0],b[1]-a[1]),
  Math.hypot(c[0]-d[0],c[1]-d[1]));
 assert.ok(length<=MAX_FINISH_CUT_FT+.05,'No long unbroken mitered render board');
}
const config={...defaults,skirtingEnabled:true,skirtingOrientation:'horizontal',
 skirtingMaterial:'pvc',skirtingGradeConfirmed:true,
 skirtingEdges:JSON.stringify([longEdge.index])};
const skirt=buildDeckSkirting(geometry.edgeSegments,geometry.exposedSegments,5,7.25,config);
const side=skirt.sides.find(s=>s.edgeIndex===longEdge.index);
assert.ok(side);
assert.ok(side.courses.length>10);
const first=side.courses.filter(c=>c.row===0).sort((a,b)=>a.start-b.start);
assert.equal(first.length,2,'25ft horizontal course must be split at real stud');
assert.ok(first.every(c=>c.end-c.start<=MAX_FINISH_CUT_FT));
const jointAt=(first[0].end+first[1].start)/2;
assert.ok(side.verticals.some(v=>Math.abs(v.station-jointAt)<.03),
 'Skirting seam needs a real 2x4 backing upright');
assert.ok(skirt.finishStock.length>0&&
 skirt.finishStock.every(s=>[16,20].includes(s.stockLengthFt)),
 'Synthetic skirting purchases only 16/20ft stock');
assert.ok(!skirt.issues.some(v=>v.includes('No available continuous stock')),
 '25ft side must not block the finish order');
const installed=side.finishCuts.length;
assert.ok(installed>0);
assert.equal(skirt.finishStock.flatMap(p=>p.cuts).filter(c=>c.edgeIndex===longEdge.index).length,
 installed,'Every installed piece must be allocated to purchased stock exactly once');
const tiny={
 id:'ST-small',edgeIndex:999,material:'finish',lengthFt:2,location:'stair skirt leftover',
};
const cuts=[
 {id:'one',edgeIndex:1,material:'finish',lengthFt:13,location:'course'},
 {id:'two',edgeIndex:1,material:'finish',lengthFt:12,location:'course'},tiny,
];
const packed=packSkirtCuts(cuts,[16,20],.125,.25);
assert.equal(packed.stock.length,2,'Offcut from 16ft stock must supply 2ft stair section');
assert.ok(packed.stock.some(b=>b.cuts.some(c=>c.id==='one')&&
 b.cuts.some(c=>c.id==='ST-small')));
const estimate=calculateEstimate('decks',{...config,deckingMaterial:'Trex Enhance',
 deckingType:'composite',stairCount:1});
const purchased=estimate.materials.filter(m=>m.category==='Decking'&&m.unit==='boards');
assert.ok(purchased.length>0);
assert.ok(purchased.every(m=>/^(16|20) ft stock$/.test(m.stockRecommendation)),
 'Full deck supplier order must contain only available composite board sizes');
const sharedSkirt=estimate.materials.filter(m=>m.name.includes('deck and stair skirting finish'));
assert.ok(sharedSkirt.length>0,'Compatible perimeter/stair skirting needs a shared stock pool');
assert.ok(sharedSkirt.every(m=>[16,20].some(n=>m.stockRecommendation===n+' ft stock')));
assert.ok(!estimate.validationIssues.some(v=>/UNAVAILABLE|No available continuous stock/.test(v)),
 'No fictional 25ft board issue should block an otherwise supportable job');
const frame=estimate.materials.filter(m=>m.name==='Picture-frame deck board 1');
assert.ok(frame.length>=2,'Picture-frame cut schedule keeps each real piece');
assert.ok(frame.every(m=>m.unit==='cuts'&&m.category.includes('not order')),
 'Cut schedule entries must never masquerade as additional stock to purchase');

const profiled=planProfiledStairFascia({treadDepthFt:11/12,treads:7,
 riseFt:5/8,heightFt:5,nosingFt:1/12});
assert.ok(profiled.length>=16,'Seven-step fascia must trace each tread and riser');
assert.ok(profiled.some((v,i)=>i>0&&Math.abs(v.runFt-profiled[i-1].runFt)<1e-8&&
 v.riseFt<profiled[i-1].riseFt),'Stair fascia must have true riser plumb cuts');
assert.ok(profiled[0].riseFt>profiled[profiled.length-1].riseFt,
 'Fascia finish runs above its sloped underside');
assert.deepEqual(planStairSideFascia({treadDepthFt:11/12,treads:7,riseFt:5/8,
 heightFt:5,nosingFt:1/12,style:'profiled'}),profiled);
assert.equal(planStairSideFascia({treadDepthFt:11/12,treads:7,riseFt:5/8,
 heightFt:5,style:'straight'}).length,4);
const visual=fs.readFileSync(path.join(root,'src/components/visual3d/DeckStairAssembly3D.tsx'),'utf8');
assert.ok(visual.includes('planStairSideFascia')&&
 !visual.includes("straightFasciaGeo:geo")&&
 visual.includes('width/2+.75/24')&&
 visual.includes('lower-ripped-three-quarter-inch-fascia-strip')&&
 visual.includes('lowerStart=fasciaOutline[fasciaOutline.length-1]')&&
 visual.includes('map={fasciaTexture}')&&
 visual.includes('toneMapped={false}'),
 'Stair fascia must be symmetric, independently profiled and use selected manufacturer texture');
const render=fs.readFileSync(path.join(root,'src/components/visual3d/ManufacturerDeck3D.tsx'),'utf8');
assert.ok(render.includes('splitMiteredPictureFrames(planMiteredPictureFrames'),
 'Picture-frame 3D must show physically split miter boards');
const skirtingRender=fs.readFileSync(path.join(root,'src/components/visual3d/DeckSkirting3D.tsx'),'utf8');
assert.ok(skirtingRender.includes('side.courses.map'),
 'Skirting finish renderer must consume exact segment-level purchase course geometry');
const supplierUI=fs.readFileSync(path.join(root,'src/components/MaterialTable.tsx'),'utf8');
assert.ok(supplierUI.includes("displayItems.filter(item=>item.category!=='Deck finish cut schedule (not order)')")&&
 supplierUI.includes("delete out['Deck finish cut schedule (not order)']"),
 'Installer cuts must never be counted or printed as duplicate supplier stock orders');
console.log('PASS 25ft/44ft deck and skirting joins, stock/offcut reuse, supported seams, 3D miter cuts, symmetric selected-color fascia');
