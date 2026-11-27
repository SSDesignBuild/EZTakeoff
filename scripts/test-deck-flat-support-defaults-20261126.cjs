const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const module={exports:{}};cache.set(full,module);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',js)(name=>name.startsWith('.')?
    load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),module,module.exports);
  return module.exports;
}
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-6,message+': '+actual+' vs '+expected);
const {buildDeckModel,buildLowerTierDeckModel,scanlineIntersections}=load('src/lib/deckModel');
const {SERVICES}=load('src/data/services');
const {surfaceStrips}=load('src/lib/deckSurfaceLayout');
const {deriveDeckingLabelPlan}=load('src/lib/deckingLabels');
const {clipDeckFace,deckFaceArea}=load('src/lib/deckSurfaceClipping');
const {calculateEstimate}=load('src/lib/estimate');
const landing=load('src/lib/stairConcreteLanding');
const defaults=SERVICES.find(service=>service.slug==='decks').defaults;
const rect=(w=16,d=12,x=0,y=0)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
const values=(patch={})=>({...defaults,deckShape:JSON.stringify(rect()),stairCount:0,pictureFrameCount:0,breakerBoardCount:0,...patch});

// Owner defaults stay separate from approval of site conditions. Dimensions
// and concrete yield remain ordinary editable persisted values.
const standard=buildDeckModel(values());
assert.equal(standard.footingDiameterIn,18);assert.equal(standard.footingDepthIn,12);
near(standard.footingVolumeCuFt,Math.PI*.75*.75,'18-in diameter x 12-in round volume');
assert.equal(standard.footingBagsPerPost,3);
assert.equal(standard.concreteBags,standard.postCount*3);
const custom=buildDeckModel(values({footingDiameterIn:24,footingDepthIn:36}));
near(custom.footingVolumeCuFt,Math.PI*3,'Custom 24x36 volume');
assert.equal(custom.footingBagsPerPost,16);
assert.equal(buildDeckModel(values({footingDiameterIn:18,footingDepthIn:36})).footingBagsPerPost,9);
assert.equal(buildDeckModel(values({concreteBag80lbYieldCuFt:.5})).footingBagsPerPost,4);
const lower=buildLowerTierDeckModel(values({multiTierEnabled:true,lowerDeckShape:JSON.stringify(rect(8,6,0,12)),footingDiameterIn:20,footingDepthIn:30}));
assert.equal(lower.footingDiameterIn,20);assert.equal(lower.footingDepthIn,30);
const pad=landing.planStairLandingForValues(4,{});
assert.deepEqual([pad.widthFt,pad.depthFt,pad.thicknessIn,pad.orderAllowancePercent,pad.bags80lb],[4,4,4,25,12]);
near(pad.volumeCuFt,16/3,'4x4x4 actual volume');near(pad.wasteAdjustedCuFt,20/3,'Explicit S&S allowance');
assert.equal(landing.planStairLandingForValues(4,{stairLandingAllowancePercent:0}).bags80lb,9);
assert.equal(landing.planStairLandingForValues(4,{stairLandingWidthFt:7}).widthFt,7,'Independent editable pad width');
assert.equal(landing.planStairLandingForValues(6,{stairLandingWidthFt:4}).widthFt,6,'Existing wider stairs retain actual landing width');
const customPad=landing.planStairLandingForValues(6,{stairLandingDepthFt:5,stairLandingThicknessIn:6,stairLandingAllowancePercent:10});
assert.deepEqual([customPad.widthFt,customPad.depthFt,customPad.thicknessIn,customPad.bags80lb],[6,5,6,28]);

// A small last perimeter rip used to render but disappear from center-line
// takeoff scans. All actual pieces now share the same cut authority.
for(const boardRun of ['width','projection']){
  const dims=boardRun==='width'?[16,12.21]:[12.21,16];
  const deck=buildDeckModel(values({boardRun,deckShape:JSON.stringify(rect(...dims))}));
  const strips=surfaceStrips(deck);
  assert.equal(strips.length,27,'Full board courses plus real final 0.27-in rip');
  const far=Math.max(...strips.map(s=>(boardRun==='width'?s.z:s.x)+s.widthFt/2));
  near(far,12.21,'Ordinary board layout reaches final deck edge');
  const order=deriveDeckingLabelPlan(deck).groups.filter(g=>g.kind==='field');
  assert.equal(order.reduce((n,g)=>n+g.count,0),strips.length);
  const visibleArea=strips.reduce((n,s)=>n+s.widthFt*s.lengthFt,0);
  near(visibleArea,(12.21-26*.125/12)*(16-.02),'Deck area less physical board/end gaps');
}

function intersectionArea(subject,clip){
  const signed=clip.reduce((n,p,i)=>n+p[0]*clip[(i+1)%clip.length][1]-clip[(i+1)%clip.length][0]*p[1],0);
  if(signed<0)clip=[...clip].reverse();
  let result=subject;
  for(let i=0;i<clip.length;i++)result=clipDeckFace(result,clip[i],clip[(i+1)%clip.length],true);
  return deckFaceArea(result);
}
function verifySupport(deck,rectangular=true){
  const plan=deck.finishSupport;
  assert.equal(plan.issues.length,0,plan.issues.join('; '));
  const ids=plan.stock.flatMap(stock=>stock.cutIds).sort();
  assert.deepEqual(ids,plan.pieces.map(p=>p.id).sort(),'Every installed nailer is purchased exactly once');
  assert.ok(plan.stock.every(stock=>[8,12,16,20].includes(stock.stockLengthFt)));
  near(plan.totalLinearFt,plan.pieces.reduce((n,p)=>n+p.lengthFt,0),'Actual nailer cut footage');
  const polygons=plan.pieces.map(p=>p.corners.map(c=>[c.x,c.y]));
  plan.pieces.forEach((piece,index)=>{
    near(piece.thicknessFt,1.5/12,'Wide face lies flat');
    assert.ok(piece.widthFt<=piece.stockWidthFt+1e-7);
    assert.ok(piece.lengthFt<20-.125/12-.25/12,'Cut plus kerf/trim fits purchasable stock');
    if(rectangular)assert.ok(piece.corners.every(p=>p.x>=deck.minX+3/12-1e-6&&p.x<=deck.maxX-3/12+1e-6&&
      p.y>=deck.minY+3/12-1e-6&&p.y<=deck.maxY-3/12+1e-6),'Nailers clear all double-rim faces');
    for(let other=0;other<index;other++)near(intersectionArea(polygons[index],polygons[other]),0,'No duplicate nailer area');
    const vertical=deck.joistDirection==='vertical';
    for(const station of deck.joistPositions){
      for(const span of scanlineIntersections(deck.points,vertical?'vertical':'horizontal',station)){
        const box=vertical?[[station-.75/12,span.start],[station+.75/12,span.start],[station+.75/12,span.end],[station-.75/12,span.end]]:
          [[span.start,station-.75/12],[span.end,station-.75/12],[span.end,station+.75/12],[span.start,station+.75/12]];
        near(intersectionArea(polygons[index],box),0,'Flat nailer clears existing upright joist');
      }
    }
  });
  return plan;
}
for(const boardRun of ['width','projection']){
  const single=verifySupport(buildDeckModel(values({boardRun,pictureFrameCount:1})));
  const double=verifySupport(buildDeckModel(values({boardRun,pictureFrameCount:2})));
  const triple=verifySupport(buildDeckModel(values({boardRun,pictureFrameCount:3})));
  assert.ok(single.pieces.length>0&&single.pieces.every(p=>p.nominalSize==='2x6'));
  near(Math.max(...single.pieces.map(p=>p.widthFt))*12,2.794,'Single-frame clear rip width');
  near(Math.max(...double.pieces.map(p=>p.widthFt))*12,8.25,'Double-frame clear width before first joist');
  assert.ok(double.pieces.some(p=>p.nominalSize==='2x10'),'Double picture frame orders wider flat lumber');
  assert.ok(triple.coveredAreaSqFt>double.coveredAreaSqFt&&double.coveredAreaSqFt>single.coveredAreaSqFt);
  for(const [count,width,size] of [[1,3.5,'2x6'],[2,6.3125,'2x8'],[3,9.125,'2x10']]){
    const breaker=verifySupport(buildDeckModel(values({boardRun,breakerBoardCount:count})));
    near(Math.max(...breaker.pieces.map(p=>p.widthFt))*12,width,'Breaker flat-rip width');
    assert.ok(breaker.pieces.some(p=>p.nominalSize===size));
  }
  verifySupport(buildDeckModel(values({boardRun,pictureFrameCount:3,breakerBoardCount:3,
    deckShape:JSON.stringify(rect(26,24,5,7).reverse())})));
}
const inside=(point,polygon)=>{
  let result=false;
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
  });return result;
};
const slanted=[{x:0,y:0},{x:16,y:0},{x:20,y:12},{x:4,y:12}];
for(const count of [1,2,3]){
  const angled=buildDeckModel(values({deckShape:JSON.stringify(slanted),pictureFrameCount:count,breakerBoardCount:2}));
  const plan=verifySupport(angled,false);
  assert.ok(plan.pieces.some(p=>p.kind==='picture-frame'&&Math.abs(p.to.x-p.from.x)>.05),
    'Angled perimeter nailer cuts follow the perimeter, not a world-axis box');
  assert.ok(plan.notes.some(note=>note.includes('Angled picture-frame')));
  for(const t of [.22,.37,.51,.67,.79])for(const inset of [.27,.35,.45]){
    const p={x:4*t+12/Math.sqrt(160)*inset,y:12*t-4/Math.sqrt(160)*inset};
    if(angled.joistPositions.some(x=>Math.abs(x-p.x)<.75/12+1e-6))continue;
    assert.ok(plan.pieces.some(piece=>inside(p,piece.corners)),'Every sampled clear angled backing point has a counted physical nailer');
  }
  assert.ok(plan.pieces.every(piece=>piece.corners.every(p=>inside(p,slanted))),
    'All cut support footprints stay inside the angled deck: '+JSON.stringify(plan.pieces.filter(piece=>piece.corners.some(p=>!inside(p,slanted))).slice(0,2)));
}
const stepped=[{x:0,y:0},{x:16,y:0},{x:16,y:8},{x:10,y:8},{x:10,y:12},{x:0,y:12}];
verifySupport(buildDeckModel(values({deckShape:JSON.stringify(stepped),pictureFrameCount:3,breakerBoardCount:3})),false);
const unrotated=buildDeckModel(values({attachment:'freestanding',pictureFrameCount:2,breakerBoardCount:3}));
const rotated=buildDeckModel(values({attachment:'freestanding',pictureFrameCount:2,breakerBoardCount:3,boardRun:'projection',
  deckShape:JSON.stringify(rect(12,16))}));
near(unrotated.finishSupport.coveredAreaSqFt,rotated.finishSupport.coveredAreaSqFt,'Rotating the same physical deck preserves nailer area');
near(unrotated.finishSupport.totalLinearFt,rotated.finishSupport.totalLinearFt,'Rotating the same deck preserves cut footage');
assert.deepEqual(unrotated.finishSupport.stock.map(s=>[s.nominalSize,s.stockLengthFt,s.quantity]),
  rotated.finishSupport.stock.map(s=>[s.nominalSize,s.stockLengthFt,s.quantity]),'Rotation preserves actual lumber purchase');
const combinedValues=values({pictureFrameCount:2,breakerBoardCount:2});
const combined=buildDeckModel(combinedValues),estimate=calculateEstimate('decks',combinedValues);
const purchase=estimate.materials.filter(item=>item.name.includes('flat finish support nailers'));
assert.equal(purchase.reduce((n,item)=>n+item.quantity,0),combined.finishSupport.stock.reduce((n,item)=>n+item.quantity,0));
assert.ok(purchase.every(item=>item.notes.includes('Wide face horizontal')&&item.notes.includes('M-FS-')));
assert.ok(!estimate.materials.some(item=>/closure board|sunroom floor transition/i.test(item.name)));
console.log('PASS editable 18x12 footings / 4x4x4 pads, actual floor rips, rotated continuous flat nailers, no joist overlap, wider multi-course backing and optimized stock parity');
