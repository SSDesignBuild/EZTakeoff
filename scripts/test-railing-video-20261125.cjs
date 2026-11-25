const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
 return mod.exports;
}
const {buildDeckModel,buildLowerTierDeckModel}=load('src/lib/deckModel');
const {calculateEstimate}=load('src/lib/estimate');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find(s=>s.slug==='decks').defaults;
const {planLevelRailingRuns,planDrinkRailPieces,railingSurfaceInsetFt,railPointKey,resolveDrinkRailMaterial}=load('src/lib/railingLayout');
const {planStairRailingRuns,stairFlightFrame,stairRailDatumAt,stairDrinkPostVertices}=load('src/lib/stairRailVisualGeometry');
const {buildTimberTechIRE}=load('src/lib/deckRailing');
const rect=[{x:0,y:0},{x:20,y:0},{x:20,y:12},{x:0,y:12}];
const base={...defaults,attachment:'freestanding',deckShape:JSON.stringify(rect),deckHeight:4,stairCount:0,
 manualRailingEdges:'[0,1,2,3]',railingSystem:'timbertech-ire',railingType:'aluminum',railingTopProfile:'drink',
 railingPostSize:'3x3',railingColor:'black',railingInfill:'aluminum',railingManufacturerConfirmed:true,
 drinkRailMaterial:'TimberTech Vintage - Coastline'};
const postWidth=.25,boardWidth=5.5/12,inset=railingSurfaceInsetFt(postWidth,boardWidth);
for(const points of [rect,[...rect].reverse()]){
 const m=buildDeckModel({...base,deckShape:JSON.stringify(points)});
 const level=planLevelRailingRuns(m,[0,0],4,postWidth,boardWidth);
 assert.equal(level.length,4);
 const half=(postWidth+.06)/2;
 for(const run of level)for(const p of run.posts){
  assert.ok(p[0]-half>=0&&p[0]+half<=20,'Entire post base stays on deck X');
  assert.ok(p[2]-half>=0&&p[2]+half<=12,'Entire post base stays on deck Z');
 }
 const corners=level.flatMap(r=>[railPointKey(r.from),railPointKey(r.to)]);
 assert.equal(new Set(corners).size,4,'One shared corner post per polygon corner');
 const pieces=planDrinkRailPieces(level,[],boardWidth,3.1215);
 const edges=new Map();
 for(const p of pieces){
  assert.ok(p.lengthFt<=20,'Visible board can be cut from actual 20ft stock');
  assert.ok(p.corners.every(c=>c.every(Number.isFinite)));
  for(const [a,b] of [[p.corners[0],p.corners[3]],[p.corners[1],p.corners[2]]]){
   const key=[railPointKey(a),railPointKey(b)].sort().join('|');edges.set(key,(edges.get(key)||0)+1);
  }
 }
 assert.ok([...edges.values()].every(n=>n===2),'Adjacent boards share exact miter or butt faces, never overlap/gap');
 assert.ok(pieces.some(p=>Math.abs(p.corners[0][0]-p.corners[3][0])>.1&&Math.abs(p.corners[0][2]-p.corners[3][2])>.1),'Actual diagonal corner cuts');
}
const stairsInput={...base,stairCount:1,stairEdgeIndex:2,stairOffset:4,stairWidth:4,stairRailingLeft:true,stairRailingRight:true,
 additionalStairs:JSON.stringify([{edgeIndex:1,offset:2,width:4,left:true,right:false}])};
const m=buildDeckModel(stairsInput);
const level=planLevelRailingRuns(m,[0,0],4,postWidth,boardWidth);
const stair=planStairRailingRuns(m,[0,0],4,postWidth,7.1,inset);
assert.equal(stair.length,3,'Exactly selected sides, not multiplied by number of flights');
const levelPosts=new Set(level.flatMap(r=>r.posts.map(railPointKey)));
for(const run of stair){
 assert.ok(levelPosts.has(railPointKey(run.posts[0])),'Stair and deck railing share the top landing post');
 const f=stairFlightFrame(m,m.stairPlacements[run.placementIndex],[0,0]);
 const across=[Math.cos(f.yaw),-Math.sin(f.yaw)];
 for(const [j,p]of run.posts.entries()){
  const cross=(p[0]-f.originX)*across[0]+(p[2]-f.originZ)*across[1];
  assert.ok(Math.abs(cross)+(postWidth+.06)/2<=f.widthFt/2+.000001,'Stair base fully within actual tread width');
  assert.ok(Number.isFinite(run.postBaseYs[j]));
  if(j===0)assert.equal(run.postBaseYs[j],4.0625,'Top post seats on deck board, not empty space');
 }
 assert.ok(run.slopedLengthFt>run.runFt,'Sloped rail stock uses true length');
 assert.ok(Math.abs(run.panels.reduce((sum,p)=>sum+p.lengthFt,0)-run.slopedLengthFt)<1e-8,
  'Panel cut lengths include the landing return and full sloped path');
}
const pieces=planDrinkRailPieces(level,stair,boardWidth,3.1215);
const joins=new Map();
for(const p of pieces)for(const [a,b]of [[p.corners[0],p.corners[3]],[p.corners[1],p.corners[2]]]){
 const key=[railPointKey(a),railPointKey(b)].sort().join('|');joins.set(key,(joins.get(key)||0)+1);
}
assert.ok(pieces.filter(p=>p.kind==='landing').every(p=>{
 const key=[railPointKey(p.corners[0]),railPointKey(p.corners[3])].sort().join('|');return joins.get(key)===2;
}),'Every selected landing cap has a continuous miter to the level drink board');
assert.ok(pieces.filter(p=>p.kind==='stair').every(p=>{
 const key=[railPointKey(p.corners[0]),railPointKey(p.corners[3])].sort().join('|');return joins.get(key)===2;
}),'Every pitched board butts exactly to its landing return over the post');
const plan=buildTimberTechIRE(m,stairsInput);
assert.equal(plan.panels.filter(p=>p.kind==='stair').length,stair.reduce((n,r)=>n+r.panels.length,0));
const uniquePosts=new Set([...level.flatMap(r=>r.posts),...stair.flatMap(r=>r.posts)].map(railPointKey));
assert.equal(plan.posts.length,uniquePosts.size,'BOM and render share post count including landing/corner joins');
assert.ok(plan.materials.filter(i=>i.name.includes('drink-rail full-profile')).every(i=>i.color===stairsInput.drinkRailMaterial));
assert.equal(resolveDrinkRailMaterial({...stairsInput,drinkRailMaterial:'match'}),String(stairsInput.deckingMaterial));
assert.equal(resolveDrinkRailMaterial(stairsInput),stairsInput.drinkRailMaterial);
const long=buildDeckModel({...base,deckShape:JSON.stringify([{x:0,y:0},{x:43,y:0},{x:43,y:12},{x:0,y:12}])});
const longPieces=planDrinkRailPieces(planLevelRailingRuns(long,[0,0],4,postWidth,boardWidth),[],boardWidth,3.1215);
assert.ok(longPieces.every(p=>p.lengthFt<=20.000001),'Long runs use supported board joins within purchasable stock');
const tall=buildDeckModel({...base,deckHeight:26,stairCount:1,stairEdgeIndex:2,stairOffset:4,
 stairWidth:4,stairRailingLeft:true,stairRailingRight:true});
const tallRuns=planStairRailingRuns(tall,[0,0],26,postWidth,7.1,inset);
const tallPieces=planDrinkRailPieces(planLevelRailingRuns(tall,[0,0],26,postWidth,boardWidth),tallRuns,boardWidth,3.1215);
const tallStair=tallPieces.filter(p=>p.kind==='stair');
assert.ok(tallStair.length>tallRuns.length,'Tall stairs require multiple physical stock boards');
assert.ok(tallStair.every(p=>p.lengthFt<=20.000001),'No pitched drink board exceeds purchasable 20ft stock');
const tallCuts=new Map();
for(const p of tallPieces)for(const [a,b]of [[p.corners[0],p.corners[3]],[p.corners[1],p.corners[2]]]){
 const key=[railPointKey(a),railPointKey(b)].sort().join('|');tallCuts.set(key,(tallCuts.get(key)||0)+1);
}
for(const p of tallStair){
 const fromKey=[railPointKey(p.corners[0]),railPointKey(p.corners[3])].sort().join('|');
 assert.equal(tallCuts.get(fromKey),2,'Every sloped stock-board start shares an exact pitched butt face');
 const endKey=[railPointKey(p.corners[1]),railPointKey(p.corners[2])].sort().join('|');
 if(tallCuts.get(endKey)===2){
  const centre=p.corners[1].map((n,i)=>(n+p.corners[2][i])/2);
  assert.ok(tallRuns.some(run=>run.posts.some(post=>Math.hypot(post[0]-centre[0],post[2]-centre[2])<1e-6)),
   'Pitched stock-board butt joints sit on actual stair posts');
 }
}
// A diagonal flight exposes the old flat-post defect: its downhill corner
// could project through the entire sloping cap thickness. Verify the actual
// eight post mesh vertices against the cap plane, not a centre-only check.
const rotation=Math.PI/4;
const diagonal=rect.map(p=>({x:p.x*Math.cos(rotation)-p.y*Math.sin(rotation),y:p.x*Math.sin(rotation)+p.y*Math.cos(rotation)}));
const diagonalModel=buildDeckModel({...base,deckShape:JSON.stringify(diagonal),deckHeight:3,stairCount:1,
 stairEdgeIndex:2,stairOffset:4,stairWidth:4,stairRailingLeft:true,stairRailingRight:true});
const diagonalRuns=planStairRailingRuns(diagonalModel,[0,0],3,postWidth,7.1,inset);
for(const run of diagonalRuns)for(const [index,p]of run.posts.entries()){
 const vertices=stairDrinkPostVertices(run,index,postWidth,3);
 assert.equal(vertices.top.length,4);assert.equal(vertices.bottom.length,4);
 for(const corner of vertices.top){
  const underside=stairRailDatumAt(run,corner[0],corner[2])+3+.0285;
  assert.ok(Math.abs(corner[1]-underside)<1e-9,'Every concealed post corner meets the exact cap underside');
  assert.ok(corner[1]>=run.postBaseYs[index],'Pitch-cut post has positive height');
 }
 assert.ok(vertices.bottom.every(v=>v[1]===run.postBaseYs[index]),'Base stays flat on its actual tread');
 if(index>0)assert.ok(Math.max(...vertices.top.map(v=>v[1]))-Math.min(...vertices.top.map(v=>v[1]))>.1,
  'Stair top is truly pitch-cut, not a flat block below a sloping cap');
}
const lowerInputs={...base,deckHeight:9,lowerDeckHeight:3,multiTierEnabled:true,
 lowerDeckShape:JSON.stringify(rect),lowerManualRailingEdges:'[0,1,2,3]',lowerStairEdgeIndex:2,
 lowerStairOffset:3,lowerStairRailingLeft:true,lowerStairRailingRight:true};
const lowerModel=buildLowerTierDeckModel(lowerInputs);
const lowerPlan=buildTimberTechIRE(lowerModel,{...lowerInputs,deckHeight:3},'Lower deck');
const estimate=calculateEstimate('decks',lowerInputs);
for(const material of lowerPlan.materials){
 const estimated=estimate.materials.find(m=>m.name===material.name&&m.category===material.category&&m.stockRecommendation===material.stockRecommendation);
 assert.ok(estimated,'Lower tier material preserved: '+material.name);
 assert.equal(estimated.quantity,material.quantity,'Lower stair takeoff uses lower elevation, not main height');
}
console.log('PASS video railing: inset bases, true miters, shared landing posts, continuous cap joins, chosen board finish and exact sloped/unique-post takeoff');
