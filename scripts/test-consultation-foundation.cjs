/** Consultation data contracts and cross-app pricing boundaries; no browser, AI or network required. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){
 const full=path.resolve(__dirname,'..',file.endsWith('.ts')?file:file+'.ts');
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
 }}).outputText;
 new Function('require','module','exports',js)((name)=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
 return mod.exports;
}
const {makeConsultationProject,updateConsultation,boardProducts}=load('src/lib/consultationProject');
const {createEstimateHandoff,parseEstimateResponse,selectedPricedTier,makeAcceptedScope}=load('src/lib/estimatingBridge');
const project=makeConsultationProject('test-project-001');
assert.equal(project.schemaVersion,1);
assert.equal(project.kind,'deck');
assert.ok(Array.isArray(boardProducts)&&boardProducts.length>30,'Consultation must reuse actual S&S product choices');
const request=createEstimateHandoff(project);
assert.equal(request.messageType,'sns.eztakeoff.estimate-request');
assert.equal(request.schemaVersion,1);
assert.equal(request.projectId,project.id);
assert.equal(request.revision,project.revision);
assert.ok(request.geometry.areaSqFt>0&&request.geometry.footprint.length>=4);
assert.ok(request.materials.length>0);
assert.equal('price' in request,false,'Prices are not calculated inside consultation app');
assert.equal(request.project.photoAttachedToThisPayload,false,'Client photo may not leak in JSON handoff');
const fakeResult=(p)=>JSON.stringify({
 schemaVersion:1,projectId:p.id,requestRevision:p.revision,externalEstimateId:'external-quote-44',
 tiers:[
  {id:'good',name:'Good',price:16500,currency:'USD',scope:'16x12 open deck; PT railing.',includedOptions:['Open deck']},
  {id:'better',name:'Better',price:25500,currency:'USD',scope:'16x12 composite deck with black railing.',includedOptions:['Composite boards','Black railing']},
 ],
});
const parsed=parseEstimateResponse(fakeResult(project),project);
assert.equal(parsed.tiers.length,2);
assert.equal(parsed.selectedTierId,null);
assert.throws(()=>parseEstimateResponse(fakeResult({...project,id:'different'}),project),/different customer/);
assert.throws(()=>parseEstimateResponse(fakeResult({...project,revision:2}),project),/older design revision/);
assert.throws(()=>parseEstimateResponse(JSON.stringify({schemaVersion:1,projectId:project.id,
 requestRevision:project.revision,externalEstimateId:'x',tiers:[{id:'bad',name:'A',price:-10,currency:'USD',scope:'Scope'}]}),project),/USD price/);
const priced={...project,estimatingResponse:{...parsed,selectedTierId:'better'}};
assert.equal(selectedPricedTier(priced).price,25500);
const scope=makeAcceptedScope(priced);
assert.equal(scope.tierId,'better');
assert.equal(scope.status,'draft-awaiting-client-approval');
assert.equal(scope.scope,'16x12 composite deck with black railing.');
const changed=updateConsultation(priced,{values:{...priced.values,stairWidth:5}});
assert.equal(changed.revision,priced.revision+1);
assert.equal(changed.estimatingResponse,null,'Design revision must invalidate stale prices');
const contact=updateConsultation(priced,{client:{...priced.client,name:'Prospect'}});
assert.equal(contact.revision,priced.revision,'Contact typo should not create new design revision');
assert.ok(contact.estimatingResponse,'Contact change should keep valid pricing');
const photo=updateConsultation(priced,{photoPresent:true});
assert.equal(photo.revision,priced.revision);
const covered=updateConsultation(project,{coverFamily:'Moderno',kind:'covered-deck'});
assert.ok(createEstimateHandoff(covered).blockers.some((line)=>line.toLowerCase().includes('cover')));
const app=fs.readFileSync(path.resolve(__dirname,'../src/App.tsx'),'utf8');
assert.ok(app.includes('Admin Takeoff')&&app.includes('Sales Consultation'));
assert.ok(app.includes('/consultation/:projectId'));
const scene=fs.readFileSync(path.resolve(__dirname,'../src/components/Consultation3D.tsx'),'utf8');
assert.ok(scene.includes('@react-three/fiber')&&scene.includes('@react-three/drei'));
assert.ok(scene.includes('buildDeckModel')&&scene.includes('Canvas'));
const media=fs.readFileSync(path.resolve(__dirname,'../src/lib/consultationPhoto.ts'),'utf8');
assert.ok(media.includes('indexedDB')&&!media.includes('localStorage'));
console.log('PASS consultation schema, approved catalog reuse, no price leakage, secure revision/tier handoff, role routes, 3D source and photo storage');
