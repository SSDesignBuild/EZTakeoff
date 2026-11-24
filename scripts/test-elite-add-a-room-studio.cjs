/* Shared Elite Add-A-Room Admin/Sales contract, November 24 2026.
   No browser or internet, source PDFs remain private. */
const assert=require('node:assert/strict'),fs=require('node:fs'),
  path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);
 if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',js)((n)=>
  n.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),n))):require(n),mod,mod.exports);
 return mod.exports;
}
const source=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const geom=load('src/lib/sunroomSectionGeometry');
const {createSunroomSection}=load('src/lib/sectioning');
const {calculateEstimate}=load('src/lib/estimate');
const {makeConsultationProject,updateConsultation}=load('src/lib/consultationProject');
const studio=load('src/lib/eliteSunroomStudio');
const {createEstimateHandoff}=load('src/lib/estimatingBridge');
assert.equal(geom.sunroomDoorWidthFeet(createSunroomSection(0,{doorType:'single',doorWidthIn:32})),32/12);
assert.equal(geom.sunroomDoorWidthFeet(createSunroomSection(0,{doorType:'single',doorWidthIn:36})),3);
assert.equal(geom.sunroomDoorWidthFeet(createSunroomSection(0,{doorType:'slider'})),6);
const door=createSunroomSection(0,{width:12,height:9,doorType:'single',doorWidthIn:32,
 doorPlacement:'center',uprights:2,kickSection:'insulated'});
const left=geom.sunroomDoorLeftFeet(door);
assert.ok(Math.abs(left-(12-32/12)/2)<1e-8);
const spans=geom.sunroomSpansExcludingDoor(door);
assert.equal(spans.length,2);
assert.ok(Math.abs(spans.reduce((sum,s)=>sum+s.end-s.start,0)-(12-32/12))<1e-8);
const offsets=geom.sunroomUprightOffsetsExcludingDoor(door);
assert.equal(offsets.length,2);
assert.ok(offsets.every(x=>spans.some(s=>x>s.start&&x<s.end)),
 'Door opening must never contain glass uprights');
const opts=['horizontal-sliders','double-horizontal-sliders','vertical-sliders',
 'casement','picture-window'];
for(const style of opts){
 const section=createSunroomSection(0,{doorType:'none',mainSection:style});
 assert.ok(geom.sunroomWindowOpenings(section).some(x=>x.style===style&&x.zone==='main'));
 assert.equal(geom.isSunroomWindowKind(style),true);
}
const allWindows=createSunroomSection(0,{width:8,height:10,doorType:'none',
 mainSection:'double-horizontal-sliders',kickSection:'picture-window',
 kickHeight:2,transomType:'picture-window',leftTransomHeight:1,rightTransomHeight:1});
const openings=geom.sunroomWindowOpenings(allWindows);
assert.ok(openings.some(o=>o.zone==='main'&&o.style==='double-horizontal-sliders'));
assert.ok(openings.some(o=>o.zone==='kick'&&o.style==='picture-window'));
assert.ok(openings.some(o=>o.zone==='transom'&&o.style==='picture-window'));
assert.ok(openings.every(o=>o.end>o.start&&o.bottomFt<Math.min(o.topLeftFt,o.topRightFt)));
const admin=calculateEstimate('sunrooms',{roomSystem:'3-thermal',
 buildMode:'existing-structure',framingColor:'bronze',windowColor:'wheat',
 sunroomSections:JSON.stringify([allWindows,door])});
assert.ok(admin.materials.some(m=>m.name.includes('H-beam')&&m.stockRecommendation.includes('24 ft')));
assert.ok(admin.materials.some(m=>m.name.includes('DRC')&&m.stockRecommendation.includes('24 ft')));
assert.ok(admin.materials.some(m=>m.name.includes('Receiving channel')&&m.stockRecommendation.includes('24 ft')));
assert.ok(admin.materials.some(m=>m.name.includes('Top cap')&&m.stockRecommendation.includes('24 ft')));
assert.ok(admin.materials.some(m=>m.name.includes('Base channel')&&m.stockRecommendation.includes('24 ft')));
assert.equal(admin.materials.some(m=>/corner post/i.test(m.name)),false,
 'Existing Renaissance posts must suppress Elite corner-post order');
assert.ok(admin.materials.some(m=>m.name.includes('Elite Prime Full View')&&m.name.includes('32 in')));
assert.ok(admin.materials.some(m=>m.name.includes('Clear insulated glass')&&m.name.includes('Double horizontal')));
assert.ok(admin.materials.some(m=>m.name.includes('Clear insulated glass')&&m.name.includes('Fixed picture')));
const measured={
 id:'front',from:[-10,6],to:[10,6],
 topFrom:9.3,topTo:9.3,bottomY:0.12,widthFt:20,
};
const def=studio.makeDefaultEliteWallSections(measured);
assert.ok(def.length>=3);
assert.ok(Math.abs(def.reduce((n,s)=>n+s.width,0)-20)<.005);
assert.equal(def.filter(s=>s.doorType==='single').length,1);
assert.ok(!studio.eliteWallDimensionWarnings(measured,def).length);
assert.ok(studio.eliteWallDimensionWarnings(measured,
 def.map((s,i)=>i===0?{...s,width:s.width+1}:s)).some(s=>s.includes('sections total')));
const settings=studio.defaultEliteSunroomSettings();
assert.equal(settings.buildMode,'existing-structure');
assert.equal(settings.glassType,'clear-insulated');
const project=makeConsultationProject('elite-contract-test');
const selected=updateConsultation(project,{coverScreenStyle:'elite-add-a-room',
 coverFamily:'Moderno',kind:'covered-deck',eliteSunroom:{
 ...settings,roomSystem:'3-thermal',framingColor:'bronze',windowColor:'wheat',
 panelColor:'clay',walls:{front:JSON.stringify([allWindows,door])},
}});
const wall={...measured,widthFt:20};
const estimate=studio.eliteSunroomTakeoff(selected,[wall]);
const input={...estimate.values};
const again=calculateEstimate('sunrooms',input);
assert.deepEqual(estimate.estimate.materials,again.materials,
 'Sales must invoke identical Admin material engine');
assert.ok(estimate.dimensionWarnings.length,
 'Edited wall section sum differs from actual posts and must be blocked');
const handoff=createEstimateHandoff(selected);
assert.ok(handoff.materials.some(m=>m.category==='Sunroom windows - verify shop dimensions'));
assert.ok(handoff.materials.some(m=>m.name.includes('Elite Prime Full View')));
assert.ok(handoff.selections.eliteSunroomSystem==='3-thermal');
assert.equal(handoff.selections.eliteSunroomBuildMode,'existing-structure');
assert.equal(handoff.selections.eliteSunroomWindowColor,'wheat');
assert.equal(handoff.selections.eliteUsesRenaissanceCoverPosts,true);
assert.ok(handoff.blockers.some(s=>s.includes('factory sash daylight dimensions')));
assert.ok(handoff.blockers.some(s=>s.includes('sections total')));
assert.ok(!('price' in handoff));
assert.equal(handoff.project.photoAttachedToThisPayload,false);
const render=source('src/components/visual3d/EliteAddARoomWall3D.tsx');
for(const marker of ['elite-prime-full-view-outswing-door','clear-insulated-glass-lite',
 'elite-bottom-base-channel-weep','elite-top-cap-under-renaissance-roof',
 'elite-h-beam-vertical-between-glazing','DRC-window-edge','vertical-slider-meeting-rail',
 'casement-hinge-stile','slider-latch','EliteAddARoomWall3D']){
 assert.ok(render.includes(marker),'3D feature missing '+marker);
}
const ui=source('src/components/EliteSunroomStudioOptions.tsx');
const adminEditor=source('src/components/SunroomSectionEditor.tsx');
assert.ok(ui.includes('<SunroomSectionEditor')&&ui.includes('onValuesChange={editWall}'));
for(const marker of ['double-horizontal-sliders','vertical-sliders','casement',
 '<option value="picture-window">','doorWidthIn','doorHinge'])assert.ok(adminEditor.includes(marker));
const cover=source('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(cover.includes("project.coverScreenStyle==='elite-add-a-room'&&isSolid"));
assert.ok(cover.includes('planRenaissanceCoverWalls'));
assert.ok(cover.includes('EliteAddARoomWall3D'));
assert.ok(source('src/lib/estimatingBridge.ts').includes("eliteSunroomTakeoff(project,eliteWalls)"));
console.log('PASS existing Elite Admin 24ft stock reuse, 2/3-in system, 5 window styles, picture kick/transom, 32/36 Prime door, seated post dimensions and Sales 3D/Estimator parity');
