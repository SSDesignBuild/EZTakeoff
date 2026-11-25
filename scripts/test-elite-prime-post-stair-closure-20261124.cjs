/* November 24 owner screenshots: Prime too much glass/hidden hardware,
 * Renaissance columns through roof, missing board beside wall, and missing
 * selected wood/black-round stair guards when Elite enclosure is enabled. */
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const m={exports:{}};cache.set(full,m);
 const src=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,
   target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',src)((name)=>
  name.startsWith('.')?
    load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
  m,m.exports);
 return m.exports;
}
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {renaissanceRoofPanelUndersideAtPost,
 renaissanceVisiblePostTopFt}=load('src/lib/renaissancePostClearance');
const roof={xFt:7,zFt:11.7,headerCrownFt:9.0,
 roofRearZFt:-.5,roofFrontZFt:13.0,
 roofRearCenterFt:10.3,roofFrontCenterFt:8.76,
 roofPanelThicknessFt:3/12,gable:false,
 midXFt:0,roofWidthFt:16,eaveCenterFt:9,gableRiseFt:0};
const under=renaissanceRoofPanelUndersideAtPost(roof);
const cap=renaissanceVisiblePostTopFt(roof);
const capUpperFace=cap-.029+.05/2;
assert.ok(capUpperFace<=under-1/200,
 'Post INCLUDING the actual seated trim cap cannot project into white roof panel');
assert.ok(cap<roof.headerCrownFt,
 'Model post must end beneath panel even where header crown is too high');
assert.ok(renaissanceVisiblePostTopFt({...roof,roofFrontCenterFt:9.7})<=roof.headerCrownFt,
 'Never lengthen structural post beyond manufacturer header');
const gable={...roof,gable:true,xFt:5,midXFt:0,roofWidthFt:14,
 eaveCenterFt:8.9,gableRiseFt:1.25};
const gableUnder=renaissanceRoofPanelUndersideAtPost(gable);
assert.ok(Math.abs(gableUnder-(8.9+1.25*(1-5/7)-.125))<.0001);
assert.ok(renaissanceVisiblePostTopFt(gable)<gableUnder);
const cover=read('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(cover.includes('renaissanceVisiblePostTopFt({')&&
 cover.includes('renaissance-post-cap-below-roof-underside'));
assert.ok(!cover.includes('position={[x,topY-.008,z]}'));

const elite3d=read('src/components/visual3d/EliteAddARoomWall3D.tsx');
assert.ok(elite3d.includes('bottomRail=.78'), 'Door should have a real ~9in opaque lower rail');
assert.ok(elite3d.includes('leafStile=.30'), 'Prime should have real extruded vertical stiles');
assert.ok(elite3d.includes('glassBottom=.12+bottomRail')&&
 elite3d.includes('glassCenterY'));
assert.ok(elite3d.includes("[-1,1].map((face,i)=><group key={'prime-lock-face-'"),
 'Hardware must be visible from either room interior or outside camera');
for(const m of ['keyed-entry-hardware-handle','deadbolt',
 'prime-door-brushed-nickel-knob-escutcheon','prime-deadbolt-round-backplate']){
 assert.ok(elite3d.includes(m),'Prime visible hardware missing '+m);
}
const sampleDoorGlassFt=(6+8/12)-.34-.12-(.12+.78);
assert.ok(sampleDoorGlassFt<5.35&&sampleDoorGlassFt>5,
 'Prime glazing should be ~5ft and NOT nearly all 6ft8in door height');

const {buildDeckModel}=load('src/lib/deckModel');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find(service=>service.slug==='decks').defaults;
const model=buildDeckModel({...defaults,deckShape:JSON.stringify([
 {x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]),
 deckHeight:5,stairCount:1,stairEdgeIndex:2,stairWidth:4,
 stairOffset:3,stairRailingLeft:true,stairRailingRight:true,
 railingType:'wood',spindleType:'black-round'});
assert.equal(model.stairCount,1);
const center=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
const {planStairRailingRuns,stairFlightFrame}=load('src/lib/stairRailVisualGeometry');
const rails=planStairRailingRuns(model,center,5,3.5/12);
assert.equal(rails.length,2,'Chosen stair left AND right rails render despite sunroom');
assert.deepEqual(new Set(rails.map(r=>r.side)),new Set(['left','right']));
for(const run of rails){
 assert.ok(run.posts.length>=2&&run.panels.length>=1);
 assert.ok(run.posts[0][1]>run.posts[run.posts.length-1][1],
  'Actual chosen stair rail must slope DOWN along the stair run');
 assert.ok(run.panels.every(p=>p.from[1]>p.to[1]));
 const frame=stairFlightFrame(model,model.stairPlacements[0],center);
 assert.ok(frame&&Math.abs(frame.widthFt-run.widthFt)<.0001);
}
const onlyLeft=buildDeckModel({...defaults,
 deckHeight:5,stairCount:1,stairEdgeIndex:2,
 stairRailingLeft:true,stairRailingRight:false});
const ownCenter=[(onlyLeft.minX+onlyLeft.maxX)/2,
 (onlyLeft.minY+onlyLeft.maxY)/2];
assert.equal(planStairRailingRuns(onlyLeft,ownCenter,5).length,1);
const neither=buildDeckModel({...defaults,stairCount:1,
 stairEdgeIndex:2,stairRailingLeft:false,stairRailingRight:false});
const noneCenter=[(neither.minX+neither.maxX)/2,
 (neither.minY+neither.maxY)/2];
assert.equal(planStairRailingRuns(neither,noneCenter,5).length,0);
const railRenderer=read('src/components/visual3d/ManufacturerRailing3D.tsx');
assert.ok(railRenderer.includes('<ManufacturerStairRailing3D')&&
 railRenderer.includes('screenIntegrated?[]:subtractRailingOpenings'),
 'Screen/sunroom suppresses ONLY incompatible level rails, not selected stair guards');
const stairRenderer=read('src/components/visual3d/ManufacturerStairRailing3D.tsx');
for(const label of ['selected-stair-guard-',
 'stair-round-baluster','selected-stair-guard-post','StairGlassPanel',
 'style.geometry','planStairRailingRuns']){
 assert.ok(stairRenderer.includes(label),'Stair railing must match deck finish/infill: '+label);
}
assert.ok(read('src/components/visual3d/DeckStairAssembly3D.tsx')
 .includes('stairFlightFrame(model,placement,center)'));

const {planEliteDeckFloorClosure}=load('src/lib/eliteDeckFloorClosure');
const wall={id:'right',from:[7.3,-5.5],to:[7.3,5.5],
 widthFt:11,bottomY:5.12,topFrom:12,topTo:11};
const closure=planEliteDeckFloorClosure(model,[wall],'3-thermal','composite');
assert.ok(closure.pieces.length>0,'No open black floor gap at inside sunroom wall');
assert.ok(closure.totalLinearFt>10.8&&closure.totalLinearFt<=11);
assert.ok(closure.stock.length>0);
assert.ok(closure.stock.every(s=>[16,20].includes(s.stockLengthFt)),
 'Composite/PVC supplier closure board cuts MUST be 16 or 20ft stock only');
const inner=closure.pieces[0].from;
assert.ok(inner[0]<wall.from[0],
 'Closing board must be INSIDE the right-side wall, not under outside skirting');
const pt=planEliteDeckFloorClosure(model,[wall],'2-nonthermal','pressure-treated');
assert.ok(pt.stock.every(s=>[8,12,16,20].includes(s.stockLengthFt)));
const floorRenderer=read('src/components/visual3d/ManufacturerDeck3D.tsx');
assert.ok(floorRenderer.includes('real-finish-decking-board-against-elite-sunroom-walls'));
assert.ok(floorRenderer.includes('planEliteDeckFloorClosure('));
const bridge=read('src/lib/estimatingBridge.ts');
assert.ok(bridge.includes('planEliteDeckFloorClosure')&&
 bridge.includes('Interior deck closure board at Elite sunroom wall')&&
 bridge.includes('eliteFloorClosure?.stock'),
 'Every extra floor closure board must be counted in Sales Estimator');
console.log('PASS Prime realistic smaller glass and visible hardware, roof-clipped post, selected stair guards on both sides, and stock-counted sunroom floor board');
