/* Lumino is a DISTINCT visual assembly, not a rebadged Dolce screen. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const render=read('src/components/visual3d/RenaissanceLuminoWall3D.tsx');
assert.ok(render.includes('transparent-glazed-window-lite'));
assert.ok(render.includes('continuous-insulated-solid-kneewall'));
assert.ok(render.includes('RenaissanceLuminoWall3D'));
assert.ok(render.includes('window-frame-jamb'));
assert.ok(render.includes('Beam start={from} end={to} height={bottom+kneeHeight}'));
const cover=read('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(cover.includes("project.coverScreenStyle==='lumino-sunroom'&&isSolid"));
assert.ok(cover.includes("['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')"),
 'Only Dolce styles may construct mesh and associated PCA screen doors');
assert.ok(cover.includes('coverWallRuns.filter(wall=>!privacyGap(wall.id)).map(wall=>'));
const ui=read('src/components/ConsultationVisualPickers.tsx');
assert.ok(ui.includes('<option value="lumino-sunroom">'));
assert.ok(ui.includes("['Moderno','Contempo','Classico'].includes(project.coverFamily)"));
assert.ok(ui.includes("!['lumino-sunroom','elite-add-a-room'].includes(project.coverScreenStyle??'none')&&<div"),
 'PCA screen door setup must not be misrepresented as a Lumino sunroom door');
const project=read('src/lib/consultationProject.ts');
assert.ok(project.includes("'dolce-standard'|'lumino-sunroom'"));
const bridge=read('src/lib/estimatingBridge.ts');
for(const msg of ['Lumino glazing','PCA screen doors are not certified Lumino sunroom entry doors',
 'non-insulated roof family'])assert.ok(bridge.includes(msg));
console.log('PASS Lumino window over continuous solid knee wall, Dolce/Lumino/privacy nonoverlap, compatible roofs and supplier/door blockers');
