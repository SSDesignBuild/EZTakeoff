const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const m={exports:{}};cache.set(full,m);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),m,m.exports);
 return m.exports;
}
const near=(a,b,reason)=>assert.ok(Math.abs(a-b)<1e-7,reason+': '+a+' vs '+b);
const {makeConsultationProject}=load('src/lib/consultationProject');
const {buildDeckModel}=load('src/lib/deckModel');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const {planRenaissanceTrussEndFit,renaissancePostRoofFootprintFt}=load('src/lib/renaissanceCoverFit');
const {renaissanceTrussTailLengthFt}=load('src/lib/renaissanceTrussSilhouette');
const {buildRenaissanceTrussCutMesh}=load('src/lib/renaissanceTrussCutGeometry');
const {renaissanceVisiblePostTopFt,renaissanceRoofPanelUndersideAtPost}=load('src/lib/renaissancePostClearance');
const {getRenaissanceExtrusion}=load('src/lib/renaissanceManufacturer');
let fits=0;
for(const family of ['Classico','Fresco','Aria','Contempo'])for(const variant of ['standard','wide'])
for(const inset of [false,true])for(const overhang of [0,.21,.25,1]){
 const project=makeConsultationProject('cover-fit-qa');
 Object.assign(project,{coverFamily:family,coverFraming:variant,coverAccentEnd:'curved',
  coverFrontOverhangFt:overhang,coverWidthFt:inset?12:16,coverProjectionFt:inset?8:12,
  coverMount:'wall-attached',coverRoofStyle:'studio'});
 project.values={...project.values,deckShape:JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]),deckHeight:3,stairCount:0};
 const model=buildDeckModel(project.values);
 const a=planRenaissanceCoverWalls(model,project,[8,6],3);
 const front=a.theoreticalFront+a.plan.frontOverhangFt;
 const rear=a.theoreticalBack-a.plan.rearOverhangFt,length=front-rear;
 const fit=planRenaissanceTrussEndFit({roofFrontZFt:front,headerCenterZFt:a.frameFront,headerDepthFt:a.profile.headerDepthIn/12});
 const originalStyle=family==='Aria'?'aria-scallop':family==='Fresco'?'fresco-s':family==='Contempo'?'contempo-s':'classico-s';
 const style=fit.hasExposedTail?originalStyle:'straight';
 if(inset&&overhang===0){
  assert.equal(fit.hasExposedTail,false,'Inset zero-overhang cover has no exposed decorative end: '+family+'/'+variant);
  assert.equal(fit.availableTailFt,0);assert.equal(fit.decorativeLengthFt,0);
  assert.equal(style,'straight','Continuous truss cannot squeeze a fake ogee inside header');
 }else{
  assert.ok(fit.hasExposedTail, family+'/'+variant+' should have a physical outside tail');
  const tail=renaissanceTrussTailLengthFt(length,style,fit.availableTailFt);
  assert.ok(front-tail>=fit.outsideHeaderZFt-1e-7,'Full-depth body reaches the real header outside face');
  if(overhang===1)near(tail,9/12,'Normal one-foot overhang keeps full reference-shaped nine-inch tail');
  near(fit.decorativeStartZFt+fit.decorativeLengthFt,front,'Contempo tip ends at exact configured roof front');
  assert.ok(fit.decorativeStartZFt<fit.outsideHeaderZFt,'Decorative end contacts header instead of floating');
  if(family==='Contempo'){
   const decoration=buildRenaissanceTrussCutMesh({length:fit.decorativeLengthFt,width:2/12,height:6/12,rise:0,wall:.060/12,style,availableTailFt:fit.decorativeLengthFt});
   const maxZ=Math.max(...decoration.positions.filter((_,i)=>i%3===2));
   near(fit.decorativeStartZFt+maxZ,front,'Actual Contempo mesh does not extend beyond roof');
  }
 }
 if(family!=='Contempo'){
  const mesh=buildRenaissanceTrussCutMesh({length,width:2/12,height:6/12,rise:0,wall:.060/12,style,availableTailFt:fit.availableTailFt});
  const z=mesh.positions.filter((_,i)=>i%3===2);
  near(Math.min(...z),0,'Continuous truss reaches rear');near(Math.max(...z),length,'Continuous truss reaches roof front');
  if(!fit.hasExposedTail)assert.ok(mesh.positions.some((y,i)=>i%3===1&&Math.abs(y+.25)<1e-8&&Math.abs(mesh.positions[i+1]-length)<1e-8),
    'Zero-overhang end retains full six-inch body depth');
 }
 fits++;
}
// A tiny valid positive overhang must not be inflated to the old 0.06-ft
// decorative minimum. Its header overlap plus projection is still physical.
const tiny=planRenaissanceTrussEndFit({roofFrontZFt:5.0005,headerCenterZFt:4.875,headerDepthFt:.25});
assert.ok(tiny.hasExposedTail&&tiny.decorativeLengthFt<.06);
near(tiny.decorativeStartZFt+tiny.decorativeLengthFt,5.0005,'Tiny positive projection preserves exact roof bound');

for(const variant of ['standard','hd','wide'])for(const gable of [false,true]){
 const profile=getRenaissanceExtrusion(variant);
 const width=renaissancePostRoofFootprintFt(profile.postOutsideIn,profile.postCapOutsideIn);
 assert.ok(width>=profile.postOutsideIn/12&&width>=profile.postCapOutsideIn/12);
 const input={xFt:6.9,zFt:11.8,headerCrownFt:20,roofRearZFt:0,roofFrontZFt:13,
  roofRearCenterFt:9,roofFrontCenterFt:8.45,roofPanelThicknessFt:.25,postWidthFt:width,
  gable,midXFt:0,roofWidthFt:16,eaveCenterFt:8.45,gableRiseFt:2.2866666667};
 const top=renaissanceVisiblePostTopFt(input);
 for(const actualWidthIn of [profile.postOutsideIn,profile.postCapOutsideIn])for(const dx of [-actualWidthIn/24,actualWidthIn/24])
 for(const dz of [-actualWidthIn/24,actualWidthIn/24]){
  const underside=renaissanceRoofPanelUndersideAtPost({...input,xFt:input.xFt+dx,zFt:input.zFt+dz});
  assert.ok(underside-top>=.125/12-1e-8,'Complete '+variant+' post/cap corner keeps one-eighth-inch roof clearance');
 }
}
near(renaissancePostRoofFootprintFt(3.875,6),.5,'A wider actual cap controls clearance too');
const render=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
assert.ok(render.includes("const accentEnd=trussEndFit.hasExposedTail?requestedAccentEnd:'straight'"));
assert.ok(render.includes("product.family==='solid-truss-ends'&&trussEndFit.hasExposedTail"));
assert.ok(render.includes('renaissancePostRoofFootprintFt(profile.postOutsideIn,profile.postCapOutsideIn)'));
assert.ok(!fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceExtrusions.tsx'),'utf8').includes('const front=Math.max(.06,projectionFt)'));
console.log('PASS '+fits+' real cover/header fits across Classico/Fresco/Aria/Contempo, zero/tiny overhang, wide posts, continuous-body contact and full post/cap roof clearance');
