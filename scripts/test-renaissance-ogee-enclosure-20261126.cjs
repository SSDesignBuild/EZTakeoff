const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const m={exports:{}};cache.set(full,m);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,
   target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',js)((name)=>
  name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
  m,m.exports);
 return m.exports;
}
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const cut=load('src/lib/renaissanceTrussCutGeometry');
const end=load('src/lib/renaissanceTrussSilhouette');
for(const style of ['fresco-s','aria-scallop','classico-s','contempo-s']){
 const tail=end.RENAISSANCE_END_REFERENCE[style].tailIn/12;
 let previous=1;
 for(let i=0;i<=200;i++){
  const z=12-tail+tail*i/200;
  assert.equal(end.renaissanceTrussTailTopDropFt(z,12,.5,style),0);
  const bottom=end.renaissanceTrussTailLowerDropFt(z,12,.5,style)/.5;
  assert.ok(bottom<=previous+1e-9&&bottom>=.035,'Ogee underside must rise continuously toward nose');
  previous=bottom;
  assert.ok(Math.abs(end.renaissanceTrussEndStationFt(bottom,12,style)-z)<1e-7);
 }
 assert.ok(end.referenceTrussTailDepthRatio(.5,style)<.43,'Broad central shoulder from reference photo');
 const mesh=cut.buildRenaissanceTrussCutMesh({length:12,width:2/12,height:6/12,rise:-.75,wall:.060/12,style,availableTailFt:.65});
 assert.ok(mesh.positions.length>1000&&mesh.positions.every(Number.isFinite));
 const edges=new Map(),key=p=>p.map(n=>n.toFixed(7)).join(',');
 for(let i=0;i<mesh.positions.length;i+=9){
  const points=[0,3,6].map(offset=>mesh.positions.slice(i+offset,i+offset+3));
  for(let j=0;j<3;j++){
   const a=key(points[j]),b=key(points[(j+1)%3]);if(a===b)continue;
   const k=[a,b].sort().join('|');edges.set(k,(edges.get(k)||0)+1);
  }
 }
 assert.ok([...edges.values()].every(n=>n===2),'Ogee cut mesh, rear annulus and cast cap form a closed manifold');
 const xs=mesh.positions.filter((_,i)=>i%3===0),zs=mesh.positions.filter((_,i)=>i%3===2);
 assert.ok(Math.abs(Math.max(...xs)-1/12)<1e-9&&Math.min(...zs)===0&&Math.max(...zs)===12);
 // The rebates terminate at their original section heights, not at a
 // narrowed/scaled ring as in the rejected rendering.
 for(const y of [.25-.95/12,.25-2.15/12,.25-3.85/12,.25-5.05/12]){
  const hits=[];for(let i=0;i<mesh.positions.length;i+=3){
   const [x,yy,z]=mesh.positions.slice(i,i+3);
   if(Math.abs(yy-(-.75*z/12)-y)<1e-8&&z>11)hits.push([x,z]);
  }
  assert.ok(hits.length>0,'Fixed groove height survives into cast cut');
 }
}
const {enclosureQuickAction}=load('src/lib/consultationEnclosureAction');
const project={coverFamily:'Aria',coverScreenStyle:'none',values:{deckHeight:3,pictureFrameCount:2},client:{name:'QA'}};
const original=JSON.stringify(project),room=enclosureQuickAction(project,'sunroom');
assert.equal(room.patch.coverFamily,'Moderno');assert.equal(room.patch.coverScreenStyle,'elite-add-a-room');
assert.equal(room.section,'sunroom');assert.equal(JSON.stringify(project),original);
assert.ok(!Object.hasOwn(room.patch,'values'),'Enclosure action preserves saved deck/finish data');
assert.equal(enclosureQuickAction({...project,coverFamily:'Classico'},'screen').patch.coverFamily,undefined);
// Inspecting an existing room must not invalidate an accepted estimator
// response. updateConsultation intentionally invalidates actual design edits.
const {makeConsultationProject,updateConsultation}=load('src/lib/consultationProject');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
const base=makeConsultationProject('enclosure-action-qa');
const savedValues={...base.values,deckHeight:3.25,pictureFrameCount:2,
  stairLandingDepthFt:5,siteConcreteAreas:'[]'};
for(const [style,section]of [['dolce-open-view','screen'],['dolce-standard','screen'],['elite-add-a-room','sunroom']]){
 const quote={projectId:base.id,requestRevision:9,tiers:[{id:'retained-quote',label:'Saved tier'}]};
 const current={...base,kind:'covered-deck',coverFamily:'Classico',coverScreenStyle:style,
  revision:9,estimatingResponse:quote,values:savedValues,coverWidthFt:18.5,coverProjectionFt:11.75,
  coverDoorPositionPercent:31,coverScreenUprights:{front:4,left:2,right:3},
  eliteSunroom:{savedWallOptions:'retain verbatim'}};
 const before=JSON.stringify(current),action=enclosureQuickAction(current,section);
 assert.deepEqual(action.patch,{},'Opening configured '+style+' must produce no design patch');
 assert.equal(action.section,section==='screen'?'cover':'sunroom');
 const reopened=updateConsultation(current,action.patch);
 assert.equal(reopened.revision,9,'Opening options must preserve quoted revision');
 assert.equal(reopened.estimatingResponse,quote,'Opening options must retain imported pricing');
 assert.equal(reopened.values,savedValues);assert.deepEqual(reopened.eliteSunroom,current.eliteSunroom);
 assert.equal(reopened.coverWidthFt,18.5);assert.equal(reopened.coverProjectionFt,11.75);
 assert.equal(JSON.stringify(current),before,'Quick action must not mutate its source project');
}
const fresh={...base,values:savedValues,coverWidthFt:18.5,coverProjectionFt:11.75};
const added=updateConsultation(fresh,enclosureQuickAction(fresh,'screen').patch);
assert.equal(added.kind,'covered-deck');assert.equal(added.coverFamily,'Moderno');
assert.equal(added.values,savedValues);assert.equal(added.coverWidthFt,18.5);assert.equal(added.coverProjectionFt,11.75);
const handoff=createEstimateHandoff(added);
assert.equal(handoff.project.kind,'covered-deck');
assert.ok(handoff.blockers.some(note=>note.includes('patio cover takeoff not included')),
 'Quick-added roof must retain the same incomplete takeoff warning as ordinary cover selection');
assert.equal(enclosureQuickAction({...base,kind:'patio'},'screen').patch.kind,undefined,
 'Preserve an unfamiliar legacy patio kind and its saved site data');
assert.ok(read('src/components/ConsultationStudio.tsx').includes('scrollIntoView'));
for(const path of ['public/assets/ss-railing/ss-wood-picket-railing.webp','public/assets/ss-railing/ss-wood-round-baluster-railing.webp']){
 const bytes=fs.readFileSync(require('path').join(root,path));assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 assert.ok(!bytes.includes(Buffer.from('EXIF')),'Published thumbnail strips private EXIF');
}
console.log('PASS reference-oriented ogee cuts, manifold geometry, fixed rebates, enclosure action preservation and real railing thumbnails');
