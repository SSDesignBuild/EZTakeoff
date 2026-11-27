const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-project-ts.cjs');
const { makeConsultationProject } = load('src/lib/consultationProject');
const { createEstimateHandoff } = load('src/lib/estimatingBridge');
const { buildProjectConstructionDrawingSet } = load('src/lib/constructionProjectCad');
const { buildConstructionAssembly } = load('src/lib/constructionAssembly');
const { constructionVectorPdf, constructionDxf } = load('src/lib/constructionCadExport');
const { planRenaissanceCoverWalls } = load('src/lib/renaissanceCoverWallLayout');
const { buildDeckModel } = load('src/lib/deckModel');
const { materialDrawingLabel } = load('src/lib/materialCutPlan');
const initial = makeConsultationProject('cad-private-synthetic-fixture');
const values = { ...initial.values, deckShape: JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]),
  deckHeight: 5, pictureFrameCount: 1, stairCount: 1, stairEdgeIndex: 2, stairOffset: 6, stairWidth: 4,
  stairRailingLeft: true, stairRailingRight: true,
  deckingMaterial: 'TimberTech Legacy - Ashwood', poJobName: 'S&S CAD verification example', jobAddress: 'Synthetic demonstration',
  patioCanLightCount: 4, patioFanCount: 1, patioFanLight: true };
const project = { ...initial, kind: 'covered-deck', values, coverFamily: 'Moderno', coverScreenStyle: 'elite-add-a-room',
  coverWidthFt: 16, coverProjectionFt: 12, coverHeightFt: 9 };
const items = createEstimateHandoff(project).materials;
const set = buildProjectConstructionDrawingSet(values, items, { project, computedItems: items, revision: 'R3-QA' });
assert.deepEqual(set.issues, [], 'Default measured enclosure exports without mismatched saved sections');
const wall = planRenaissanceCoverWalls(buildDeckModel(values), project, [0,0], 5);
for (const run of wall.measuredRuns) {
  const sheet = set.sheets.find(s => s.title.startsWith('ELITE ' + run.id.toUpperCase() + ' WALL'));
  assert.ok(sheet, 'Every configured Elite wall has its own dimensioned elevation');
  assert.ok(sheet.entities.some(e => e.type === 'dimension' && Math.abs(e.measuredIn - run.widthFt * 12) < 1e-7), 'Clear opening width comes from actual post faces');
}
const assembly = buildConstructionAssembly(values, {project});
assert.ok(!assembly.parts.some(p => p.kind === 'rail' && /^M-RL/.test(p.assemblyId)), 'Integrated sunroom has no ghost deck rails');
assert.ok(assembly.parts.some(p => p.kind === 'rail-post'), 'Selected stair rail posts are retained');
const overview = set.sheets.find(s => s.id === 'E101');
assert.equal(overview.entities.filter(e => e.type === 'circle' && String(e.sourcePartId).startsWith('E-L')).length, 5, 'All four cans and the fan are set out');
assert.ok(set.sheets.some(s => s.id.startsWith('E3')), 'Enclosure/fixture setout register is included');
const dxf = constructionDxf(set), pdf = constructionVectorPdf(set);
assert.equal((dxf.match(/\nLAYOUT\n/g) || []).length, set.sheets.length + 1, 'Named print layouts plus Model');
assert.ok(dxf.includes('PART=E-CP01') && dxf.includes('PART=E-FRONT'), 'Native CAD keeps enclosure source references');
assert.ok(!/NaN|Infinity/.test(dxf));
if (process.env.CAD_QA_DIR) {
  const dir = path.resolve(process.env.CAD_QA_DIR); fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'construction-enclosure.pdf'), pdf);
  fs.writeFileSync(path.join(dir, 'construction-enclosure.dxf'), dxf);
  fs.writeFileSync(path.join(dir, 'construction-enclosure-manifest.json'), JSON.stringify({sheets:set.sheets.map(s=>({id:s.id,title:s.title,scale:s.scale})),
    walls:wall.measuredRuns, partCount:assembly.parts.length, connectionCount:assembly.connections.length,
    materials:items.map(i=>({name:i.name,quantity:i.quantity,label:materialDrawingLabel(i)}))},null,2));
  fs.writeFileSync(path.join(dir, 'construction-enclosure-assembly.json'), JSON.stringify(assembly));
}
console.log('PASS Studio CAD: saved project context, clear wall widths, no ghost rails, all ceiling fixtures, native print layouts and enclosure dimensions');
