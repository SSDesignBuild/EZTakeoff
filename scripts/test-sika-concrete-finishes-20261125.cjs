const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const concrete=load('src/lib/siteConcrete'),catalog=load('src/lib/sikaConcreteCatalog');
const finish=load('src/lib/siteConcreteFinishMaterials'),patterns=load('src/lib/concreteStampTexture');
const approx=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,message||`${a} != ${b}`);
const polyArea=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.y-q.x*p.y;},0))/2;
const rectangle=(x,y,w,d)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
const slab={id:'patio',name:'Patio',points:rectangle(-25,30,12,10),thicknessIn:4,elevationFt:.055,
 stampId:'sikastamp-new-brick-herringbone',colorId:'sikacolor-200-a53',
 borderStampId:'sikastamp-4-x-4-granite-border-3-row',borderWidthIn:12,borderColorId:'sikacolor-200-p13'};
const second={id:'walk',name:'Walk',points:rectangle(10,0,3,8),thicknessIn:5,elevationFt:.055};
const values={deckShape:JSON.stringify(rectangle(0,0,16,12)),stairCount:0,stairEdgeIndex:-1,siteConcreteAreas:JSON.stringify([slab])};
const plan=concrete.planSiteConcrete(values),area=plan.areas[0];
approx(area.areaSqFt,120);approx(area.fieldFinishAreaSqFt,80);approx(area.borderFinishAreaSqFt,40);
approx(area.borderLengthFt,44);approx(area.volumeCuFt,40);
assert.equal(plan.canQuantify,true);assert.deepEqual(plan.finishWarnings,[]);
assert.equal(area.finish.colorName,'A53 · Arizona Tan');assert.equal(area.finish.borderColorName,'P13 · Deep Charcoal');
const saved=concrete.updateSiteConcreteArea(JSON.stringify([slab,second]),slab.id,{borderColorId:'match',name:'New patio'});
const read=concrete.readSiteConcreteAreas(saved);assert.deepEqual(read[1],second);
assert.deepEqual(read[0].points,slab.points);assert.equal(read[0].stampId,slab.stampId);assert.equal(read[0].borderColorId,'match');
assert.equal(catalog.resolveConcreteAppearance(read[0]).borderColor.id,slab.colorId);
assert.deepEqual(concrete.readSiteConcreteAreas(concrete.serializeSiteConcreteAreas(read)),read);
assert.equal(catalog.resolveConcreteAppearance({stampId:'unavailable-old-pattern'}).stamp.id,'plain');
assert.ok(catalog.resolveConcreteAppearance({stampId:'unavailable-old-pattern'}).issues.length);
assert.equal(concrete.readSiteConcreteAreas(concrete.updateSiteConcreteArea(saved,'patio',{thicknessIn:0}))[0].stampId,slab.stampId);

// Borders are clipped and partitioned; real concave recesses remain empty.
const lShape=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:2,y:2},{x:2,y:6},{x:0,y:6}];
const cases=[slab,{...slab,points:[...slab.points].reverse()},
 {...slab,points:lShape,borderWidthIn:6},
 {...slab,points:[{x:-5,y:-2},{x:4,y:1},{x:3,y:8},{x:-7,y:6}],borderWidthIn:8}];
for(const sample of cases){
 const geometry=concrete.concreteDecorativeGeometry(sample);
 approx(geometry.fieldAreaSqFt+geometry.borderAreaSqFt,polyArea(sample.points));
 const faces=[...geometry.fieldPolygons,...geometry.borderPieces.map(p=>p.points)];
 for(let i=0;i<faces.length;i++){
  approx(concrete.siteConcreteOverlapAreaSqFt(faces[i],sample.points),polyArea(faces[i]),'Every finish face is inside its slab');
  for(let j=i+1;j<faces.length;j++)approx(concrete.siteConcreteOverlapAreaSqFt(faces[i],faces[j]),0,'No duplicated border corners or field overlap');
 }
}
const concave=concrete.concreteDecorativeGeometry(cases[2]);approx(concave.fieldAreaSqFt,9);approx(concave.borderAreaSqFt,11);
// A solid body's duplicate top cap caused visible depth fighting at distant
// cameras. Only finish geometry may face upward; sides and underside remain.
const meshes=load('src/lib/siteConcreteMesh');
for(const sample of cases){
 const body=meshes.siteConcreteBodyGeometry(sample,[0,0]);
 const normal=body.getAttribute('normal'),position=body.getAttribute('position');
 let undersideArea=0,wallArea=0;
 for(let i=0;i<position.count;i+=3){
  assert.ok(normal.getY(i)<.01,'Slab body must not compete with the finish top');
  const a=[position.getX(i),position.getY(i),position.getZ(i)];
  const b=[position.getX(i+1),position.getY(i+1),position.getZ(i+1)].map((v,j)=>v-a[j]);
  const c=[position.getX(i+2),position.getY(i+2),position.getZ(i+2)].map((v,j)=>v-a[j]);
  const surface=Math.hypot(b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0])/2;
  if(normal.getY(i)<-.99)undersideArea+=surface;else wallArea+=surface;
 }
 approx(undersideArea,polyArea(sample.points));
 const perimeter=sample.points.reduce((sum,p,i)=>{const q=sample.points[(i+1)%sample.points.length];return sum+Math.hypot(q.x-p.x,q.y-p.y)},0);
 assert.ok(Math.abs(wallArea-perimeter*sample.thicknessIn/12)<1e-5);
 body.dispose();
}
const materials=finish.siteConcreteFinishMaterials(plan);
approx(materials.find(item=>item.name.startsWith('SikaStamp field')).quantity,80);
approx(materials.find(item=>item.name.startsWith('SikaStamp border')).quantity,40);
approx(materials.filter(item=>item.name.startsWith('SikaColor')).reduce((sum,item)=>sum+item.quantity,0),120);
assert.ok(materials.every(item=>item.unit==='sq ft'),'Finishes do not add slab volume or fabricate tool/pail purchases');
const bad=concrete.planSiteConcrete({...values,siteConcreteAreas:JSON.stringify([slab,{...slab,id:'duplicate'}])});
assert.deepEqual(finish.siteConcreteFinishMaterials(bad),[]);

// Equal names and finishes still describe independently editable concrete
// areas. Removing/reordering another slab must not reassign saved row edits.
const matchingSlab={...slab,id:'patio-east',name:slab.name,points:rectangle(25,30,8,8)};
const multiPlan=concrete.planSiteConcrete({...values,siteConcreteAreas:JSON.stringify([slab,matchingSlab])});
const multiMaterials=finish.siteConcreteFinishMaterials(multiPlan);
for(const name of new Set(multiMaterials.map(item=>item.name))){
 const rows=multiMaterials.filter(item=>item.name===name);
 assert.equal(rows.length,2);
 assert.equal(new Set(rows.map(item=>item.layoutLabel)).size,2,'Same-product rows retain distinct area references for independent edit/remove selection');
 assert.ok(rows.every(item=>item.layoutLabel));
}
const firstReference=materials[0].layoutLabel;
const eastRows=multiMaterials.filter(item=>item.layoutLabel!==firstReference);
const eastOnly=concrete.planSiteConcrete({...values,siteConcreteAreas:JSON.stringify([matchingSlab])});
assert.deepEqual(finish.siteConcreteFinishMaterials(eastOnly),eastRows,'Removing the first area preserves every remaining row and quantity');
const reordered=concrete.planSiteConcrete({...values,siteConcreteAreas:JSON.stringify([matchingSlab,{...slab,name:'Renamed patio'}])});
assert.deepEqual(finish.siteConcreteFinishMaterials(reordered).filter(item=>item.layoutLabel!==firstReference),eastRows,'Reordering or renaming another area does not reassign row identity');
assert.deepEqual(new Set(finish.siteConcreteFinishMaterials(reordered).map(item=>item.layoutLabel)),new Set(multiMaterials.map(item=>item.layoutLabel)),'Renaming areas preserves their stable material references');
approx(multiMaterials.filter(item=>item.name.startsWith('SikaStamp field')).reduce((sum,item)=>sum+item.quantity,0),116);
approx(multiMaterials.filter(item=>item.name.startsWith('SikaStamp border')).reduce((sum,item)=>sum+item.quantity,0),68);
approx(multiMaterials.filter(item=>item.name.startsWith('SikaColor')).reduce((sum,item)=>sum+item.quantity,0),184,'Independent color rows cover both slabs exactly once');

// Published nominal unit sizes survive independent slab size/location/width changes.
for(const [id,l,w] of [['sikastamp-12-x-12-slate',1,1],['sikastamp-18-x-36-bluestone',3,1.5],
 ['sikastamp-new-brick-running-bond',7.625/12,3.75/12]]){
 const scale=patterns.concretePatternScale(catalog.SIKA_CONCRETE_STAMPS.find(item=>item.id===id));
 approx(scale.unitLengthFt,l);approx(scale.unitWidthFt,w);
}
const assetManifest=JSON.parse(fs.readFileSync(path.join(root,'src/data/sikaConcreteAssets.json'),'utf8'));
const assetBundle=JSON.parse(fs.readFileSync(path.join(root,'src/data/sikaConcreteAssetBundle.json'),'utf8'));
assert.equal(catalog.SIKA_CONCRETE_STAMPS.length,22);assert.equal(catalog.SIKA_CONCRETE_BORDERS.length,9);assert.equal(catalog.SIKA_CONCRETE_COLORS.length,23);
for(const item of [...catalog.SIKA_CONCRETE_STAMPS.slice(1),...catalog.SIKA_CONCRETE_BORDERS.slice(1)]){
 assert.ok(item.sourceUrl.startsWith('https://www.butterfieldcolor.com/tool/'));
 assert.ok(item.guideUrl.startsWith('https://usa.sika.com/'));
 const asset=assetManifest.find(entry=>entry.id===item.id);assert.ok(asset);
 const bytes=Buffer.from(assetBundle[item.id],'base64');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256,'Reviewed official photo bytes remain intact');
}
const project=load('src/lib/consultationProject').makeConsultationProject('decorative-concrete-qa');project.values={...project.values,...values};
const exported=load('src/lib/estimatingBridge').createEstimateHandoff(project);
assert.equal(exported.geometry.siteConcreteAreas[0].finish.stampId,slab.stampId);
approx(exported.materials.find(item=>item.name==='Concrete — drawn site areas').quantity,40/27*1.05);
approx(exported.materials.find(item=>item.name.startsWith('SikaStamp border')).quantity,40);
console.log('PASS official Sika source assets, per-area style/color persistence, physical units, clipped mitered borders, and finish/slab takeoff parity');
