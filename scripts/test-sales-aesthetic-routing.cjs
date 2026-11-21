/* Sales material/geometry visual QA, no GitHub Actions required. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(rel){
  let full=path.resolve(root,rel);
  if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const m={exports:{}};cache.set(full,m);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports',js)(
    name=>name.startsWith('.')?
      load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
    m,m.exports,
  );
  return m.exports;
}
const {makeConsultationProject}=load('src/lib/consultationProject');
const {buildDeckModel}=load('src/lib/deckModel');
const {surfaceStrips,breakerVisualStrips,VISIBLE_BOARD_WIDTH_FT,VISIBLE_BOARD_GAP_FT}
  =load('src/lib/visualGeometry');
const trim=load('src/lib/deckTrimSelection');
const {calculateEstimate}=load('src/lib/estimate');
const {deckVisualProducts}=load('src/data/visualCatalog');
const {planStraightStairFascia}=load('src/lib/stairFasciaGeometry');
const {planRenaissanceDownspout}=load('src/lib/renaissanceDownspoutRouting');
const values=makeConsultationProject('swatch-geometry').values;
assert.equal(values.stairFasciaStyle,'profiled');
assert.equal(values.stairFasciaMaterial,'match-fascia');
const styles=deckVisualProducts.slice(0,6).map(x=>x.label);
assert.ok(styles.length>=6,'Need six independent manufacturer swatches');
const swatch={
  ...values,deckingMaterial:styles[0],
  pictureFrameCount:3,borderSameBoard:false,
  pictureFrameMaterial:styles[1],pictureFrameMaterial2:styles[2],
  pictureFrameMaterial3:'match',
  breakerBoardCount:3,breakerBoardMaterial:styles[3],
  breakerBoardMaterial2:styles[4],breakerBoardMaterial3:'match',
  fasciaMaterial:styles[5],stairFasciaMaterial:styles[1],
  stairFasciaStyle:'straight',
  deckShape:JSON.stringify([[0,0],[18,0],[18,12],[0,12]].map(([x,y])=>({x,y}))),
  deckHeight:5,stairRise:5,stairCount:1,stairWidth:4,
  deckingType:'composite',
};
assert.deepEqual(trim.resolvePictureFrameMaterials(swatch),
  [styles[1],styles[2],styles[0]]);
assert.deepEqual(trim.resolveBreakerBoardMaterials(swatch),
  [styles[3],styles[4],styles[0]]);
assert.equal(trim.resolveFasciaMaterial(swatch),styles[5]);
assert.equal(trim.resolveStairSideFasciaMaterial(swatch),styles[1]);
assert.deepEqual(trim.resolvePictureFrameMaterials({...swatch,borderSameBoard:true}),
  [styles[0],styles[0],styles[0]],
  'legacy same-board toggle must override dormant old picture frame labels');
const model=buildDeckModel(swatch);
assert.equal(model.breakerBoardCount,3);
const field=surfaceStrips(model);
const breaker=breakerVisualStrips(model);
assert.ok(breaker.length>=3,'Each chosen breaker course must be a visible 3D board');
assert.deepEqual([...new Set(breaker.map(b=>b.course))],[0,1,2],
  'Both first and third course need actual geometry');
const stations=model.breakerBoardPositions;
assert.equal(stations.length,1);
const band=3*(VISIBLE_BOARD_WIDTH_FT+VISIBLE_BOARD_GAP_FT)+VISIBLE_BOARD_GAP_FT;
for(const piece of field){
  for(const pos of stations)
    assert.ok(piece.endFt<pos-band/2+.000001||piece.startFt>pos+band/2-.000001,
      'Field boards must not clip through selected perpendicular breaker board');
}
const positions=[...new Set(breaker.map(b=>b.axis==='z'?b.x:b.z))];
assert.equal(positions.length,3,'Three courses must have 3 different offsets');
const e=calculateEstimate('decks',swatch);
for(let i=0;i<3;i++){
  const frame=e.materials.filter(x=>x.name==='Picture-frame deck board '+(i+1));
  assert.ok(frame.length>0,'Missing independent picture-frame quantity '+(i+1));
  assert.ok(frame.every(x=>x.notes.includes([styles[1],styles[2],styles[0]][i])),
    'Picture-frame material list must agree with chosen 3D swatch');
  const breakRows=e.materials.filter(x=>x.name==='Breaker deck board '+(i+1));
  assert.ok(breakRows.length>0,'Missing independent breaker quantity '+(i+1));
  assert.ok(breakRows.every(x=>x.notes.includes([styles[3],styles[4],styles[0]][i])),
    'Breaker material list must agree with chosen 3D swatch');
}
const stairFascia=e.materials.find(x=>x.name==='Stair side fascia board');
assert.ok(stairFascia,'Contrasting side fascia needs separate material quantity');
assert.ok(stairFascia.notes.includes(styles[1]));
assert.ok(stairFascia.notes.includes('straight continuous diagonal'));
const stairs=e.materials.find(x=>x.name==='2x12 stringers');
assert.ok(stairs&&stairs.quantity>=2,'Structural notched stringers remain independently ordered');
const contour=planStraightStairFascia({treadDepthFt:11/12,treads:7,riseFt:5/8,heightFt:5});
assert.equal(contour.length,4,'Straight fascia requires four corners and no stair-step notch');
assert.ok(contour[0].riseFt>contour[1].riseFt);
assert.ok(contour[3].riseFt<contour[0].riseFt);
const outlet=[6,15,7],coverPosts=[[6,6],[0,6]];
const deckPosts=[[6.2,5.8],[0,5.7]];
const ground=planRenaissanceDownspout({
  outlet:[6,9,7],coverPosts,deckPosts:[],
  coverPostWidthFt:3.875/12,deckPostWidthFt:5.5/12,
  deckHeightFt:.6,
});
assert.ok(ground&&!ground.elevated);
assert.ok(ground.straps.some(s=>s.kind==='cover'));
assert.ok(ground.elbows.some(e=>e.type==='A'&&e.location==='gutter'));
assert.ok(ground.elbows.some(e=>e.type==='B'&&e.location==='post'));
const elevated=planRenaissanceDownspout({
  outlet,coverPosts,deckPosts,coverPostWidthFt:3.875/12,
  deckPostWidthFt:5.5/12,deckHeightFt:6,
});
assert.ok(elevated&&elevated.elevated);
assert.deepEqual(elevated.deckPost,deckPosts[0]);
assert.ok(elevated.straps.some(s=>s.kind==='deck'));
assert.ok(elevated.points.some(p=>p[1]<6-1),'Elevated pipe must run below deck level');
assert.ok(elevated.points.at(-1)[1]<.3,'Pipe must visibly kick out near ground');
assert.ok(elevated.elbows.some(e=>e.type==='A'&&e.location==='deck'));
assert.ok(elevated.elbows.some(e=>e.type==='B'&&e.location==='deck'));
for(const strap of elevated.straps){
  const horizontal=Math.hypot(strap.at[0]-strap.post[0],strap.at[2]-strap.post[1]);
  assert.ok(horizontal<1,'Every attachment must be physically against a post');
}
assert.equal(planRenaissanceDownspout({
  outlet,coverPosts,deckPosts:[],coverPostWidthFt:3.875/12,
  deckPostWidthFt:5.5/12,deckHeightFt:6,
}),null,'Never draw unsupported floating elevated downspouts');
assert.equal(planRenaissanceDownspout({
  outlet:[NaN,15,7],coverPosts,deckPosts,
  coverPostWidthFt:3.875/12,deckPostWidthFt:5.5/12,
  deckHeightFt:6,
}),null);
const read=path=>fs.readFileSync(require('node:path').resolve(root,path),'utf8');
const manuf=read('src/components/visual3d/ManufacturerDeck3D.tsx');
const stair=read('src/components/visual3d/DeckStairAssembly3D.tsx');
const cover=read('src/components/visual3d/RenaissanceCover3D.tsx');
const ext=read('src/components/visual3d/RenaissanceExtrusions.tsx');
const pick=read('src/components/ConsultationDeckFinishes.tsx');
const css=read('src/styles/global.css');
const admin=read('src/data/services.ts');
assert.ok(manuf.includes('breakerVisualStrips')&&manuf.includes('<BreakerBoards'));
assert.ok(manuf.includes('resolvePictureFrameMaterials')&&manuf.includes('resolveFasciaMaterial'));
assert.ok(manuf.includes('fasciaTexture={stairFasciaMap}'));
assert.ok(stair.includes("fasciaStyle==='straight'?straightFasciaGeo:geo"));
assert.ok(stair.includes('map={fasciaTexture}'));
assert.ok(cover.includes('planRenaissanceDownspout')&&cover.includes('deckSupportPosts'));
assert.ok(ext.includes('ExtrudeGeometry(outer')&&ext.includes('layout.elbows.map'));
assert.ok(ext.includes('layout.straps.map')&&ext.includes('downspout-attached-'));
assert.ok(pick.includes('pictureFrameMaterial')&&pick.includes('breakerBoardMaterial'));
assert.ok(pick.includes('fasciaMaterial')&&pick.includes('stairFasciaMaterial'));
assert.ok(css.includes('.manufacturer-rail-card .manufacturer-photo img'));
assert.ok(css.includes('object-fit:contain'));
assert.ok(admin.includes("key: 'stairFasciaStyle'")&&admin.includes("key: 'stairFasciaMaterial'"));
console.log('PASS 3-course swatch/color/mat-list parity, cut-out field decking, routed A/B elbow post downspouts and elevated return, 4-corner straight fascia and centered rail photographs');
