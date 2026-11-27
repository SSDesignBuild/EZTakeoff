const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const mod={exports:{}};
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/renaissanceDetailGeometry.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
new Function('module','exports',js)(mod,mod.exports);
const {planDolceScreenProfile,roofLineAtX,showDolceStandardIntermediateRail}=mod.exports;
// Explicit matrix regression for the user-reported Dolce Standard + pickets.
assert.equal(showDolceStandardIntermediateRail(false,'integrated-picket'),false,
  'Standard integrated pickets must not receive a second upper/intermediate rail');
assert.equal(showDolceStandardIntermediateRail(false,'screens-only'),true,
  'Standard screens-only retains its normal horizontal mid-rail');
assert.equal(showDolceStandardIntermediateRail(false,'inside'),true);
assert.equal(showDolceStandardIntermediateRail(false,'outside'),true);
assert.equal(showDolceStandardIntermediateRail(false,'integrated-kick'),false,
  'Physical 24in kick chair rail REPLACES redundant standard intermediate rail');
for(const variant of ['integrated-picket','integrated-kick','screens-only','inside','outside'])
  assert.equal(showDolceStandardIntermediateRail(true,variant),false,
    'Open-view stays free of all standard intermediate rails: '+variant);
const from=[0,0],to=[0,10];
const rear=9+5/12,front=9;
const p=planDolceScreenProfile({
  from,to,bottomFt:.12,topFromFt:rear,topToFt:front,openView:true,
});
assert.ok(p,'10ft roof-aligned Dolce open view screen should exist');
assert.equal(p.lengthFt,10);
assert.equal(p.bayCount,1,'open view side should have no extra intermediate mullions');
assert.equal(p.mullions.length,2);
assert.ok(Math.abs(p.mullions[0].topFt-p.mullions[1].topFt-5/12)<1e-8,
  'side screen top must follow 5-in roof elevation difference');
assert.ok(Math.abs(p.contour[3].riseFt-p.contour[2].riseFt-5/12)<1e-8,
  'screen mesh geometry must be a trapezoid, not a generic rectangular plate');
const standard=planDolceScreenProfile({
  from:[0,0],to:[18,0],bottomFt:.12,topFromFt:9,topToFt:9,openView:false,
});
assert.equal(standard.bayCount,4,'standard screens should have mullions at ~5ft');
assert.equal(standard.mullions.length,5);
assert.equal(planDolceScreenProfile({from,to,bottomFt:9,topFromFt:8,topToFt:8,openView:true}),null);
assert.equal(planDolceScreenProfile({from:[NaN,0],to,bottomFt:0,topFromFt:9,topToFt:9,openView:true}),null);
assert.equal(planDolceScreenProfile({from:[0,0],to:[0,0],bottomFt:0,topFromFt:9,topToFt:9,openView:true}),null);
const gable={midXFt:0,roofWidthFt:16,eaveFt:9,gableRiseFt:2,gable:true,
  studioFrontFt:9,studioRearFt:10,rear:false};
assert.equal(roofLineAtX({...gable,xFt:0}),11);
assert.equal(roofLineAtX({...gable,xFt:-8}),9);
assert.equal(roofLineAtX({...gable,xFt:8}),9);
assert.equal(roofLineAtX({...gable,xFt:4}),10);
assert.equal(roofLineAtX({...gable,xFt:200}),9);
assert.equal(roofLineAtX({...gable,xFt:0,gable:false,rear:true}),10);
assert.equal(roofLineAtX({...gable,xFt:0,gable:false,rear:false}),9);
const render=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
const extrude=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceExtrusions.tsx'),'utf8');
assert.ok(render.includes('planDolceScreenProfile'));
assert.ok(render.includes('showDolceStandardIntermediateRail(openView,treatment)'));
assert.ok(render.includes('integrated-Dolce-guard-picket-panel'));
assert.ok(render.includes('height={bottom+3.0}'));
assert.ok(render.includes('height={bottom+.065}'), 'Common bottom rail must remain');
assert.ok(render.includes('shapeGeometry args={[shape]}'));
assert.ok(render.includes('planRenaissanceCoverWalls') &&
  render.includes('const coverWallRuns=wallAnchors.wallRuns'),
  'Dolce renderer must consume the shared wall runs');
// Test the physical result, not the old inline variable names. An oversized
// cover forces the columns inward, so the roof edge is not a wall endpoint.
// Elite receivers stop at column faces; Dolce keeps its column stations.
const {load}=require('./lib/three-mesh-test.cjs');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {postInsideDeck}=load('src/lib/coverDeckPlacement');
const {RENAISSANCE_INSULATED_ROOF}=load('src/lib/renaissanceManufacturer');
const {ELITE_CATALOG_PROFILES}=load('src/lib/eliteAddARoomExtrusions');
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-7,
  `${message}: ${actual} vs ${expected}`);
const base=makeConsultationProject('anonymous-pitched-wall-regression');
base.values={...base.values,deckHeight:5,stairCount:0,
  deckShape:JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}])};
const deck=buildDeckModel(base.values),center=[8,6];
let wallCases=0;
for(const roofStyle of ['studio','gable'])for(const mount of ['wall-attached','freestanding'])
for(const variant of ['standard','wide'])for(const screen of ['dolce-open-view','elite-add-a-room']){
  const elite=screen==='elite-add-a-room';
  const project={...base,kind:'covered-deck',coverFamily:'Classico',coverFraming:variant,
    coverRoofStyle:roofStyle,coverMount:mount,coverScreenStyle:screen,
    coverWidthFt:16,coverProjectionFt:16,coverSideOverhangFt:1,coverFrontOverhangFt:1,
    eliteSunroom:{...base.eliteSunroom,roomSystem:'3-thermal'}};
  const a=planRenaissanceCoverWalls(deck,project,center,5),plan=a.plan;
  const halfPost=a.profile.postOutsideIn/24;
  const panelHalf=RENAISSANCE_INSULATED_ROOF.defaultThicknessIn/24;
  // Analytic plane of the actual rotated roof: catalog thickness is normal
  // to that plane, so its vertical half-thickness includes the pitch factor.
  const soffit=(x,z)=>{
    const slope=plan.gable?(plan.ridgeTopFt-plan.backTopFt)/(plan.roofWidthFt/2):plan.pitchInPerFt/12;
    const mid=plan.gable?plan.ridgeTopFt-Math.abs(x-a.xMid)*slope:
      plan.backTopFt-(z-a.theoreticalBack)*slope;
    return mid-panelHalf*Math.hypot(1,slope);
  };
  const capHalf=elite?ELITE_CATALOG_PROFILES['3-thermal'].topOutsideIn/24:0;
  const sideTop=([x,z])=>Math.min(soffit(x-capHalf,z),soffit(x+capHalf,z))-(elite?.125/12:0);
  assert.ok(a.frameFront<a.theoreticalFront-.01,'Oversized cover columns must actually be reseated');
  for(const post of [...a.frontPosts,...a.rearPosts])assert.ok(postInsideDeck(
    [post[0]+center[0],post[1]+center[1]],deck.points,(a.profile.postOutsideIn+1.8)/24+.10-.0001),
    'Complete seated column/base footprint stays on the deck');
  for(const raw of a.wallRuns){
    const run=a.measuredRuns.find(w=>w.id===raw.id);
    near(run.bottomY,5,'Enclosure starts at finished deck top');
    const side=raw.id==='left'||raw.id==='right';
    if(side){
      near(raw.topFrom,sideTop(raw.from),'Side rear top follows actual seated soffit and cap extent');
      near(raw.topTo,sideTop(raw.to),'Side front top follows actual seated soffit and cap extent');
      if(!plan.gable)near(raw.topFrom-raw.topTo,
        (raw.to[1]-raw.from[1])*plan.pitchInPerFt/12,'Side pitch follows its actual seated run');
    }
    const trimFrom=side&&plan.attached?0:halfPost;
    near(Math.hypot(run.from[0]-raw.from[0],run.from[1]-raw.from[1]),trimFrom,'Receiver starts at support inside face');
    near(Math.hypot(raw.to[0]-run.to[0],raw.to[1]-run.to[1]),halfPost,'Receiver ends at support inside face');
    near(run.widthFt,Math.hypot(raw.to[0]-raw.from[0],raw.to[1]-raw.from[1])-trimFrom-halfPost,
      'Clear width excludes exactly the physical post faces');
    if(side){
      near(run.topFrom,sideTop(run.from),'Measured side starts below the roof at its actual endpoint');
      near(run.topTo,sideTop(run.to),'Measured side ends below the roof at its actual endpoint');
    }else{
      const headerBottom=(raw.id==='front'?plan.frontTopFt:plan.backTopFt)-a.profile.headerHeightIn/12;
      assert.ok(run.topFrom<=headerBottom+1e-8&&run.topTo<=headerBottom+1e-8,
        'Front/rear glazing stops below the actual structural header');
    }
  }
  wallCases++;
}
assert.ok(render.includes("product.family==='full-trusses'")&&
  render.includes('plan.projectionTrussStationsFt.map'),'full Classico trusses run in projection');
assert.ok(render.includes('RenaissanceCurvedTrussEnd'),'Contempo and Classico need sculpted tail contour');
assert.ok(!render.includes("Math.ceil(depth/7)+1"),'remove sideways generic full-truss array');
assert.ok(!render.includes("radius={.075}"),'remove cylinder proxy truss geometry');
assert.ok(extrude.includes('buildRenaissanceTrussCutMesh'),'Decorative tail must follow the same bounded manufacturer cap trace as one-piece trusses');
assert.ok(extrude.includes('ExtrudeGeometry'),'contour must be a 3D mesh');
assert.ok(!render.includes('roofWidthFt:width,eaveFt,'),
  '3D roofline inputs must refer to the actual eaveY variable');
assert.ok(!render.includes('x={x}frontZ=')&&!render.includes('}color={powder}'),
  'Contempo JSX attributes must have explicit separators in strict TypeScript');
console.log(`PASS ${wallCases} pitched/seated Dolce + Elite wall configurations, trapezoid screens, open-view panels, Classico projection trusses and Contempo curved 3D ends`);
