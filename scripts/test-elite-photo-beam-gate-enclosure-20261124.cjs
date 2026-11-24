/* 2026-11-24 owner video + SD post drawing + built Elite sunroom photos.
 * Verify affected geometry/stock and remove regressions, not just UI strings. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const m={exports:{}};cache.set(full,m);
 const transpiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',transpiled)((n)=>
  n.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),n))):require(n),
  m,m.exports);
 return m.exports;
}
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const {makeDefaultEliteWallSections,eliteSunroomTakeoff}=load('src/lib/eliteSunroomStudio');
const {inchToFoot}=load('src/lib/renaissanceManufacturer');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const modelProject=makeConsultationProject('photo-extrusions-beam-stop');
const model=buildDeckModel(modelProject.values);
const center=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
for(const variant of ['standard','hd','wide','wide-insert']){
 const project={...modelProject,kind:'covered-deck',coverFamily:'Moderno',
  coverFraming:variant,coverMount:'freestanding',coverScreenStyle:'elite-add-a-room'};
 const result=planRenaissanceCoverWalls(model,project,center,5);
 const front=result.measuredRuns.find(w=>w.id==='front');
 const rear=result.measuredRuns.find(w=>w.id==='rear');
 assert.ok(front&&rear,'Front/rear freestanding sunroom walls must exist');
 const frontBottom=result.plan.frontTopFt-inchToFoot(result.profile.headerHeightIn);
 const rearBottom=result.plan.backTopFt-inchToFoot(result.profile.headerHeightIn);
 assert.ok(front.topFrom<=frontBottom+1e-5&&front.topTo<=frontBottom+1e-5,
  'Front insulated window assembly must stop at header UNDERside');
 assert.ok(rear.topFrom<=rearBottom+1e-5&&rear.topTo<=rearBottom+1e-5,
  'Rear glass wall must stop at actual header UNDERside');
 assert.ok(front.topFrom<result.wallRuns.find(w=>w.id==='front').topFrom,
  'Previously front glazing ran INTO structural header up to roof soffit');
 const config=makeDefaultEliteWallSections(front);
 assert.equal(config.length,1);
 assert.ok(config[0].height<=front.topFrom-front.bottomY+.01,
  'Same beam-limited measured height must drive default Admin Sunrooms section');
 const takeoff=eliteSunroomTakeoff(project,[front]);
 assert.ok(takeoff.estimate.materials.some(m=>m.name.includes('Receiving channel')),
  'Structural header-limited sunroom needs actual 24ft Admin stock');
 assert.ok(!takeoff.estimate.materials.some(m=>/corner post/i.test(m.name)),
  'No unnecessary Elite corner posts over Renaissance cover columns');
}
const gateEdge=model.exposedSegments.find(e=>e.length>5);
assert.ok(gateEdge);
const gateWidth=2.5,gateOffset=.5,gateHeight=2.06;
const skirting=buildDeckSkirting(model.edgeSegments,model.exposedSegments,5,7.25,{
 ...modelProject.values,skirtingEnabled:true,skirtingMaterial:'kdat',
 skirtingOrientation:'horizontal',skirtingEdges:JSON.stringify([gateEdge.index]),
 skirtingGradeConfirmed:true,
 skirtingOpenings:JSON.stringify([{
  edgeIndex:gateEdge.index,offset:gateOffset,width:gateWidth,
  kind:'hinged-gate',heightFt:gateHeight,
 }]),
});
assert.ok(skirting.sides.length>0);
const side=skirting.sides[0],step=(skirting.options.faceIn+skirting.options.gapIn)/12;
const upper=Math.max(.3,Math.min(side.startHeightFt,side.endHeightFt)-.18)-gateHeight;
const partialRow=Math.floor(upper/step),expectedDepth=upper-partialRow*step;
assert.ok(expectedDepth>.03&&expectedDepth<skirting.options.faceIn/12-.025,
 'Fixture must intersect a board course partly, reproducing the missing header strip');
const lastCourse=side.courses.find(c=>c.row===partialRow&&
 c.start<=gateOffset+.0001&&c.end>=gateOffset+gateWidth-.0001);
assert.ok(lastCourse,'Gate header needs one CONTINUOUS full-span skirting course');
assert.ok(Math.abs(lastCourse.depthFt-expectedDepth)<.015,
 'Board face must be correctly ripped to the leaf header; no visible stripe/hole');
assert.ok(!side.finishCuts.some(c=>c.location.includes('fixed upper infill above access gate')),
 'Do not order independent patch stock above horizontal access gate');
const gateRenderer=read('src/components/visual3d/DeckSkirting3D.tsx');
assert.ok(gateRenderer.includes("const gateBottom=top-leastGrade+.18-.012"));
assert.ok(gateRenderer.includes('side.courses.map'));
const select=read('src/components/ConsultationVisualPickers.tsx');
const cover3D=read('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(!select.includes('<option value="lumino-sunroom">'));
assert.ok(!select.includes('Lumino window &amp; insulated knee-wall concept'));
assert.ok(!cover3D.includes('RenaissanceLuminoWall3D'));
assert.ok(cover3D.includes('EliteAddARoomWall3D'));
const deckRenderer=read('src/components/visual3d/ManufacturerDeck3D.tsx');
assert.ok(deckRenderer.includes("project.coverScreenStyle==='elite-add-a-room'||"),
 'Sunroom always suppresses duplicate independent deck/stair-entry rails even if legacy Dolce setting is inside/outside');
assert.ok(deckRenderer.includes("!['inside','outside'].includes(project.coverScreenRailTreatment??'integrated-kick')"),
 'Preserve explicitly chosen independent Dolce guardrail where required by code');
const sunroom=read('src/components/visual3d/EliteAddARoomWall3D.tsx');
for(const part of ['RectangularSashLite','separate-sash-stile','sash-bottom-track',
 'clear-insulated-glass-lite','double-track-sill-rail',
 'sash-interior-weatherseal-lip','vertical-slider-meeting-rail',
 'casement-hinge-stile','prime-clear-full-view-glazed-lite',
 'full-view-door-leaf-bottom-rail','keyed-entry-hardware-handle','deadbolt',
 'tempered-glass-black-edge-seal']){
 assert.ok(sunroom.includes(part),'Field-photo sash/Prime door feature missing '+part);
}
assert.ok(!sunroom.includes('size={[glassWidth+.02,glassHeight+.02,.031]}'),
 'Full-view door gasket must NEVER be rendered as an opaque glass-covering slab');
const post=read('src/components/visual3d/RenaissanceExtrusions.tsx');
assert.ok(post.includes('corner=inchToFoot(.25),recess=inchToFoot(.115)'),
 'SD outside 3-7/8 and flat span 3-3/8 imply actual quarter-inch corner rib');
assert.ok(post.includes('const innerCorners:Array<[number,number]>=corners.map'),
 'Wall gauge must be preserved around recessed post silhouette');
assert.ok(cover3D.includes('renaissance-tapered-post-base-skirt'));
const workflow=read('docs/DEVELOPMENT_WORKFLOW.md');
assert.ok(workflow.includes('direct')||workflow.includes('IMPLEMENT'));
assert.ok(workflow.includes('Netlify as the sole automatic CI/build system'));
console.log('PASS photo-based sash/Prime/SD post; exact 4-frame beam-underside window+stock; continuous skirting gate header; no Lumino, no duplicate stair-entry rail and action-first workflow');
