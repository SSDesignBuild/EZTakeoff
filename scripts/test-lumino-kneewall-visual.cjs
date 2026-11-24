/* Deprecation contract: historical Lumino concept exists only as a source
 * artifact for old private designs. It is NOT an available Sales product and
 * is NOT rendered, ordered, or silently changed into an Elite enclosure. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const reference=read('src/components/visual3d/RenaissanceLuminoWall3D.tsx');
assert.ok(reference.includes('continuous-insulated-solid-kneewall'));
const cover=read('src/components/visual3d/RenaissanceCover3D.tsx');
assert.ok(!cover.includes('RenaissanceLuminoWall3D'),
  'The discontinued Lumino assembly must not be mounted in the active 3D scene');
assert.ok(!cover.includes("project.coverScreenStyle==='lumino-sunroom'"),
  'No active Lumino render branch');
assert.ok(cover.includes('EliteAddARoomWall3D'));
assert.ok(cover.includes("['dolce-open-view','dolce-standard'].includes(project.coverScreenStyle??'none')"),
  'Only Dolce styles may construct mesh and PCA screen doors');
const ui=read('src/components/ConsultationVisualPickers.tsx');
assert.ok(!ui.includes('<option value="lumino-sunroom">'),
  'Lumino cannot be chosen from the sunroom options');
assert.ok(!ui.includes('Lumino window &amp; insulated knee-wall concept'),
  'Lumino conceptual marketing card must also be removed');
assert.ok(ui.includes('<option value="elite-add-a-room">'));
const project=read('src/lib/consultationProject.ts');
assert.ok(project.includes("p.coverScreenStyle==='lumino-sunroom'?'none'"),
  'Archived Lumino selection is neutralized, never silently rebranded as Elite');
const bridge=read('src/lib/estimatingBridge.ts');
assert.ok(bridge.includes('Lumino glazing'),
  'Existing archived third-party estimate requests retain supplier blockers');
console.log('PASS Lumino absent from selectable UI and 3D, archived selection safe, Elite remains available');
