const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
 return mod.exports;
}
const {makeConsultationProject,saveConsultations,loadConsultations}=load('src/lib/consultationProject');
const {buildDeckModel}=load('src/lib/deckModel');
const {planLightingAddons,planCanLightStations,planLightingPreviewSources,fixtureHasLight,readLightingSettings,lightingRailStations}=load('src/lib/lightingAddons');
const {planStairRailingRuns,stairFlightFrame,stairRailDatumAt}=load('src/lib/stairRailVisualGeometry');
const {stairEnclosureClearanceWalls}=load('src/lib/stairEnclosureClearance');
const {railingSurfaceInsetFt,planDrinkRailPieces,railPointKey}=load('src/lib/railingLayout');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const initial=makeConsultationProject('evening-and-stair-clearance-regression');
const base={...initial,coverFamily:'Moderno',coverHeightFt:10,coverMount:'freestanding',values:{...initial.values,
 attachment:'freestanding',deckShape:JSON.stringify([{x:0,y:0},{x:20,y:0},{x:20,y:16},{x:0,y:16}]),deckHeight:4,
 stairCount:1,stairEdgeIndex:2,stairOffset:4,stairWidth:4,stairRailingLeft:true,stairRailingRight:true,
 manualRailingEdges:'[0,1,2,3]',railingPostSize:'3x3',stairRiserStyle:'fascia',lightingPostFixture:'tt-small-accent',
 lightingPostCapFixture:'tt-ire-post-cap',lightingStairFixture:'tt-recessed-riser',lightingStairPerRiser:2,
 patioFanCount:1,patioFanLight:true,patioCanLightCount:4}};
const mutate=(p,values,rest={})=>({...p,...rest,values:{...p.values,...values}});
const near=(a,b)=>Math.abs(a-b)<1e-7;
const reflected=(points,axis,center)=>points.every(p=>points.some(q=>near(q[axis],center*2-p[axis])&&near(q[1-axis],p[1-axis])));
for(const layout of ['grid','perimeter'])for(const bounds of [
 {left:-9,right:9,rear:-7,front:7},{left:2,right:10,rear:8,front:28},
])for(let count=1;count<=24;count++){
 const points=planCanLightStations(count,layout,bounds);
 assert.equal(points.length,count,`${layout} retains the complete count ${count}`);
 assert.ok(reflected(points,0,(bounds.left+bounds.right)/2)||reflected(points,1,(bounds.rear+bounds.front)/2),
  'Every row layout has a mirror axis through the room centre');
 assert.equal(new Set(points.map(p=>p.join(','))).size,count);
 if(count===3)assert.ok(points.every(p=>near(p[0],points[0][0]))||points.every(p=>near(p[1],points[0][1])),
  'Three unobstructed lights form an equally spaced centred row');
 if(count===4){
  assert.equal(new Set(points.map(p=>p[0])).size,2);assert.equal(new Set(points.map(p=>p[1])).size,2);
  assert.ok(reflected(points,0,(bounds.left+bounds.right)/2)&&reflected(points,1,(bounds.rear+bounds.front)/2),
   'Four cans place two on each side, mirrored across both room axes');
 }
}
for(const coverFamily of ['Moderno','Contempo','Classico'])for(const coverRoofStyle of ['studio','gable'])for(const count of [3,4,7,8]){
 const project=mutate(base,{patioCanLightCount:count},{coverFamily,coverRoofStyle});
 const plan=planLightingAddons(project),fans=plan.fixtures.filter(f=>f.category==='fan'),cans=plan.fixtures.filter(f=>f.category==='can-light');
 assert.equal(cans.length,count,`${coverFamily}/${coverRoofStyle} keeps all ${count} cans around a fan`);
 const cover=planRenaissanceCoverWalls(buildDeckModel(project.values),project,[0,0],4);
 const points=cans.map(f=>[f.position[0],f.position[2]]);
 assert.ok(reflected(points,0,(cover.frameLeft+cover.frameRight)/2)||reflected(points,1,(cover.back+cover.frameFront)/2));
 assert.ok(cans.every(c=>fans.every(f=>Math.hypot(c.position[0]-f.position[0],c.position[2]-f.position[2])>=52/24+.3-1e-7)));
}
assert.equal(readLightingSettings({}).patioFanLight,false,'Older projects retain unlit fan selection');
assert.equal(readLightingSettings({patioFanLight:'true'}).patioFanLight,true);
const withLight=planLightingAddons(base),withoutLight=planLightingAddons(mutate(base,{patioFanLight:false}));
assert.equal(withLight.placedCounts.fan,1);
assert.equal(withLight.fixtures.filter(f=>f.category==='fan'&&f.hasLight).length,1);
assert.ok(withLight.materials.find(m=>m.category==='Patio fans').name.includes('with integrated light'));
assert.equal(withLight.materials.reduce((n,m)=>n+m.quantity,0),withLight.fixtures.length,'Integrated fan light does not duplicate fixture quantities');
assert.ok(!withoutLight.fixtures.find(f=>f.category==='fan').hasLight);
let saved='';global.window={localStorage:{setItem:(_key,value)=>saved=value,getItem:()=>saved}};
saveConsultations([base]);const restored=loadConsultations()[0];
assert.equal(restored.values.patioFanLight,true);assert.equal(restored.values.patioCanLightCount,4);
assert.deepEqual(planLightingAddons(restored).fixtures,withLight.fixtures,'Stored fan light and symmetric layout restore exactly');
delete global.window;
const luminous=withLight.fixtures.filter(fixtureHasLight);
for(const budget of [1,6,20,100]){
 const sources=planLightingPreviewSources(withLight.fixtures,budget);
 assert.ok(sources.length<=budget);
 assert.deepEqual(sources.flatMap(s=>s.fixtureIds).sort(),luminous.map(f=>f.id).sort(),
  'Every lamp contributes once even when nearby preview sources combine');
 assert.ok(sources.every(s=>s.intensity>0&&s.distance>0&&s.position.every(Number.isFinite)));
}
const individual=planLightingPreviewSources(withLight.fixtures,100);
for(const fixture of luminous){
 const source=individual.find(s=>s.fixtureIds.includes(fixture.id));
 if(fixture.category==='can-light'||fixture.category==='fan')assert.ok(source.distance>source.position[1]-4,
  'Every ceiling light reaches the deck, including the integrated fan light');
 if(fixture.category==='stair'){
  const outward=(source.position[0]-fixture.position[0])*Math.sin(fixture.rotation[1])+
   (source.position[2]-fixture.position[2])*Math.cos(fixture.rotation[1]);
  assert.ok(outward>fixture.sizeFt[2]/2,'Riser light emits beyond its recessed housing');
 }
}
// Render the actual lamp components: every visible lens changes with evening,
// independent of the bounded point-light budget. No source-text approximation.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {LightingAddons3D}=load('src/components/visual3d/LightingAddons3D.tsx');
const error=console.error;let evening,day;
try{console.error=()=>{};
 evening=renderToStaticMarkup(React.createElement(LightingAddons3D,{project:base,center:[0,0],lightingPreview:true}));
 day=renderToStaticMarkup(React.createElement(LightingAddons3D,{project:base,center:[0,0],lightingPreview:false}));
}finally{console.error=error;}
assert.equal((evening.match(/emissive="#(?:ffd78a|ffdc9b)"/g)||[]).length,luminous.length,
 'All selected can, riser, post, cap and fan lenses illuminate in evening');
assert.equal((day.match(/emissive="#000000"/g)||[]).length,luminous.length);
assert.ok(!day.includes('<pointLight'),'Day mode turns off the preview light sources');
const intersectsWall=(point,half,wall)=>{
 const dx=wall.to[0]-wall.from[0],dz=wall.to[1]-wall.from[1],length=Math.hypot(dx,dz),normal=[-dz/length,dx/length];
 const wallCorners=[wall.from,wall.to].flatMap(p=>[-1,1].map(s=>[p[0]+normal[0]*wall.halfDepthFt*s,p[1]+normal[1]*wall.halfDepthFt*s]));
 const postCorners=[-1,1].flatMap(x=>[-1,1].map(z=>[point[0]+x*half,point[2]+z*half]));
 return [[1,0],[0,1],normal,[dx/length,dz/length]].every(axis=>{
  const a=postCorners.map(p=>p[0]*axis[0]+p[1]*axis[1]),b=wallCorners.map(p=>p[0]*axis[0]+p[1]*axis[1]);
  return Math.max(...a)>Math.min(...b)+1e-8&&Math.max(...b)>Math.min(...a)+1e-8;
 });
};
for(const coverScreenStyle of ['none','elite-add-a-room','dolce-standard','dolce-open-view'])for(const coverFraming of ['standard','wide'])for(const center of [[0,0],[10,8]]){
 const project=mutate(base,{additionalStairs:JSON.stringify([
  {edgeIndex:1,offset:4,width:4,left:true,right:false},{edgeIndex:3,offset:3,width:3,left:false,right:true},
  {edgeIndex:0,offset:7,width:4,left:true,right:true},
 ])},{coverScreenStyle,coverFraming});
 const model=buildDeckModel(project.values),walls=stairEnclosureClearanceWalls(model,project,center,4);
 const postWidth=3/12,inset=railingSurfaceInsetFt(postWidth,5.5/12);
 const open=planStairRailingRuns(model,center,4,postWidth,7.1,inset);
 const runs=planStairRailingRuns(model,center,4,postWidth,7.1,inset,walls);
 assert.equal(runs.length,6,'Clearance never changes explicitly selected stair sides');
 if(coverScreenStyle==='none'){assert.equal(walls.length,0);assert.deepEqual(runs,open);continue;}
 for(const run of runs){
  const frame=stairFlightFrame(model,model.stairPlacements[run.placementIndex],center),first=run.posts[0];
  assert.ok(walls.every(wall=>!intersectsWall(first,(postWidth+.06)/2,wall)),
   'The complete top post and base clear every room frame');
  assert.deepEqual(run.panels[0].from,first,'Rail begins on its actual supported top post');
  assert.ok(near(run.panels.reduce((n,p)=>n+p.lengthFt,0),run.slopedLengthFt));
  const station=(first[0]-frame.originX)*frame.outwardX+(first[2]-frame.originZ)*frame.outwardZ;
  const half=(postWidth+.06)/2*(Math.abs(frame.outwardX)+Math.abs(frame.outwardZ));
  const treadDepth=model.stairRunFt/model.stairTreadsPerRun;
  if(station>0){
   const tread=Math.ceil(station/treadDepth);
   assert.ok(station-half>=(tread-1)*treadDepth&&station+half<=tread*treadDepth,'Moved post base stays wholly on one tread');
   assert.ok(near(run.postBaseYs[0],4-4/model.stairRisers*tread));
   assert.equal(run.landingReturnFt,0);
  }else{assert.ok(station+half<0);assert.equal(run.postBaseYs[0],4);}
  assert.ok(near(stairRailDatumAt(run,first[0],first[2]),first[1]));
 }
 const capPieces=planDrinkRailPieces([],runs);
 assert.ok(capPieces.every(p=>p.lengthFt>.01&&p.corners.every(c=>c.every(Number.isFinite))),
  'Drink boards use supported pitched runs without a zero-length landing patch');
 const lightStations=lightingRailStations(model,project.values,center,4,true,walls);
 const actualRails=planStairRailingRuns(model,center,4,postWidth,7.1,railingSurfaceInsetFt(postWidth,2.25/12),walls);
 assert.deepEqual(new Set(lightStations.map(s=>s.key)),new Set(actualRails.flatMap(r=>r.posts.map(railPointKey))),
  'Post lights follow the same shifted railing stations');
 assert.deepEqual(stairEnclosureClearanceWalls(model,{...project,coverFamily:'none'},center,4),[],
  'Removing the cover restores original open-deck post geometry');
}
console.log('PASS balanced can layouts, fan-light persistence/quantity, every evening lens/source, enclosure post clearance and supported stair rails');
