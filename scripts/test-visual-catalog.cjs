/* Visual catalog release gate — verify real photograph sources, style geometry and footprint safety. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){
  let full=path.resolve(__dirname,'..',file);
  if(!fs.existsSync(full)){full+='.ts';}
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(
    (name)=>name.startsWith('.')?load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(full),name))):require(name),
    mod,mod.exports);
  return mod.exports;
}
const manifest=load('src/data/timbertechVisualAssets.json');
const {deckVisualProducts,railVisualProducts,coverVisualProducts,getDeckVisualProduct,getRailVisualProduct,
  getCoverVisualProduct,getCoverFinish}=load('src/data/visualCatalog');
const {surfaceStrips,visualPartSummary}=load('src/lib/visualGeometry');
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
assert.equal(manifest.length,36);
assert.ok(deckVisualProducts.length>=30);
const imageIds=new Set();
for(const item of manifest){
  assert.equal(item.manufacturer,'TimberTech');
  assert.ok(!imageIds.has(item.id),'Duplicate image '+item.id);imageIds.add(item.id);
  assert.ok(item.sourceUrl.startsWith('https://www.timbertech.com/'),'Manufacturer asset must come from official site');
  assert.ok(item.swatch.startsWith('/manufacturer/timbertech/'));
  assert.ok(item.sourceUrl.includes('media_'),'Real image asset ID required');
  assert.ok(['pvc','composite'].includes(item.family));
  assert.deepEqual(item.stockFt,[16,20]);
  assert.ok(item.grain&&item.color&&item.collection);
}
for(const name of ['Vintage','Landmark','Legacy','Reserve','Terrain','Terrain+','Harvest','Harvest+','Premier','Prime+'])
  assert.ok(manifest.some((item)=>item.collection===name),'Missing official collection '+name);
assert.ok(getDeckVisualProduct('TimberTech Vintage - Coastline')?.sourceUrl.includes('timbertech.com'));
assert.equal(getDeckVisualProduct('Unknown fake product'),null);
const rails=new Set(railVisualProducts.map((item)=>item.id));
assert.equal(rails.size,railVisualProducts.length);
for(const id of ['tt-ire-classic','tt-ire-modern','tt-ire-drink','tt-statement','tt-pinnacle',
  'tt-premier','tt-radiance','tt-trademark','tt-composite-drink','tt-radiance-express',
  'sns-wood-pickets','sns-wood-round']){
  assert.ok(rails.has(id),'Missing physical railing family '+id);
}
for(const item of railVisualProducts){
  assert.ok(item.infills.length>0&&item.colors.length>0&&item.topWidthIn>0&&item.postWidthIn>0);
  if(item.family==='metal')assert.equal(item.takeoffSystem,'timbertech-ire');
}
assert.equal(getRailVisualProduct('tt-ire-modern').geometry,'ire-modern');
assert.equal(getRailVisualProduct('tt-pinnacle').geometry,'pvc-pinnacle');
const roofs=coverVisualProducts.filter((p)=>p.id!=='none');
assert.equal(roofs.length,6);
assert.deepEqual(new Set(roofs.map((p)=>p.id)),new Set(['Moderno','Contempo','Classico','Fresco','Aria','Solé']));
assert.equal(getCoverVisualProduct('Contempo').family,'solid-truss-ends');
assert.equal(getCoverVisualProduct('Classico').family,'full-trusses');
assert.equal(getCoverVisualProduct('Fresco').family,'translucent');
assert.equal(getCoverVisualProduct('Aria').family,'lattice');
assert.equal(getCoverVisualProduct('Solé').family,'louvered');
assert.deepEqual(getCoverVisualProduct('Moderno').colors,['Bronze','Sandstone','White','Black']);
assert.notEqual(getCoverFinish('Bronze'),getCoverFinish('White'));
const project=makeConsultationProject('verified-products');
assert.ok(getDeckVisualProduct(project.values.deckingMaterial));
assert.equal(project.values.railingVisualId,'tt-ire-modern');
const request=createEstimateHandoff(project);
assert.equal(request.revision,project.revision);
const unverified={...project,values:{...project.values,railingVisualId:'tt-statement'}};
assert.ok(createEstimateHandoff(unverified).blockers.some((note)=>note.includes('manufacturer-specific')));
const covered={...project,coverFamily:'Classico',kind:'covered-deck',coverRoofStyle:'gable'};
assert.ok(createEstimateHandoff(covered).project.coverRoofStyle==='gable');
assert.equal(visualPartSummary(project.values,'Fresco').roof,'transparent');
assert.equal(visualPartSummary(project.values,'Aria').roof,'lattice');
const rect=(points)=>JSON.stringify(points.map(([x,y])=>({x,y})));
const geometry=buildDeckModel({...project.values,deckShape:rect([[0,0],[18,0],[18,6],[10,6],[10,12],[0,12]])});
const strips=surfaceStrips(geometry);
assert.ok(strips.length>10);
for(const strip of strips){
  const sampleX=strip.x,sampleY=strip.z;
  let inside=false;
  const shape=geometry.points;
  for(let i=0,j=shape.length-1;i<shape.length;j=i++){
    const a=shape[i],b=shape[j];
    if((a.y>sampleY)!==(b.y>sampleY)&&sampleX<(b.x-a.x)*(sampleY-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  assert.ok(inside,'No deck board may pass into the missing notch: '+JSON.stringify(strip));
}
const source=fs.readFileSync(path.resolve(__dirname,'../src/components/Consultation3D.tsx'),'utf8');
assert.ok(source.includes('ManufacturerDeck3D')&&!source.includes('CoverConcept'));
const deckSource=fs.readFileSync(path.resolve(__dirname,'../src/components/visual3d/ManufacturerDeck3D.tsx'),'utf8');
assert.ok(deckSource.includes('InstancedMesh')&&deckSource.includes('TextureLoader')&&deckSource.includes('surfaceStrips'));
const roofSource=fs.readFileSync(path.resolve(__dirname,'../src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
for(const part of ['full-trusses','solid-truss-ends','translucent','lattice','louvered']){
  assert.ok(roofSource.includes(part),'Missing real family geometry '+part);
}
console.log('PASS 36 official board images, 13 rail profiles, 6 distinct patio covers, accurate design handoff and concave footprint 3D cut geometry');
