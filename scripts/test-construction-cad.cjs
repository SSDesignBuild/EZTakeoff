/** Geometry/export regression. Optional CAD_QA_DIR writes review fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function loadTs(file) {
  const full = path.resolve(__dirname, '..', file.endsWith('.ts') ? file : file + '.ts');
  if (cache.has(full)) return cache.get(full).exports;
  const entry = { exports: {} }; cache.set(full, entry);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', js)(request => request.startsWith('.') ? loadTs(path.resolve(path.dirname(full), request)) : require(request), entry, entry.exports);
  return entry.exports;
}
const { buildConstructionDrawingSet } = loadTs('src/lib/constructionCad');
const { constructionDxf, constructionVectorPdf } = loadTs('src/lib/constructionCadExport');
const { constructionSheetSvg, sheetPrimitives } = loadTs('src/lib/constructionCadScene');
const { buildDeckModel } = loadTs('src/lib/deckModel');
const { calculateEstimate } = loadTs('src/lib/estimate');
const { SERVICES } = loadTs('src/data/services');
const defaults = SERVICES.find(s => s.slug === 'decks').defaults;
const rectangle = (w, d) => JSON.stringify([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]);
const values = { ...defaults, deckShape: rectangle(16, 12), deckHeight: 5, boardRun: 'width',
  stairCount: 1, stairEdgeIndex: 2, stairOffset: 6, stairWidth: 4, stairLandingSurface: 'bare-ground',
  footingDiameterIn: 18, footingDepthIn: 12, stairLandingDepthFt: 4, stairLandingThicknessIn: 4,
  pictureFrameCount: 2, breakerBoardCount: 1, poJobName: 'Construction QA Sample', jobAddress: 'Sample address', customerPhone: '' };
const estimate = calculateEstimate('decks', values);
const model = buildDeckModel(values);
const drawing = buildConstructionDrawingSet(values, estimate.materials, { computedItems: estimate.materials, revision: 'QA' });
assert.equal(drawing.issues.length, 0);
assert.equal(drawing.modelFacts[0].postCount, model.postCount);
assert.equal(drawing.modelFacts[0].footingDiameterIn, 18);
assert.equal(drawing.modelFacts[0].footingDepthIn, 12);
assert.deepEqual(drawing.modelFacts[0].landings.map(p => [p.widthFt, p.depthFt, p.thicknessIn, p.bags80lb]), [[4, 4, 4, 12]]);
const dimensions = drawing.sheets.flatMap(s => s.entities.filter(e => e.type === 'dimension'));
for (const inches of [192, 144, 18, 12, 48, 4]) assert.ok(dimensions.some(d => Math.abs(d.measuredIn - inches) < 1e-7), 'Required native model dimension ' + inches);
const pdf = constructionVectorPdf(drawing), dxf = constructionDxf(drawing);
assert.ok(Buffer.from(pdf).toString('latin1').startsWith('%PDF-1.4'));
assert.ok(!Buffer.from(pdf).toString('latin1').includes('/Subtype /Image'), 'Construction PDF must remain vector');
assert.equal((dxf.match(/\nDIMENSION\n/g) || []).length, dimensions.length);
assert.ok(dxf.includes('9\n$INSUNITS\n70\n1\n'), 'DXF model units are inches');
assert.ok(dxf.includes('SNS_POST_6X6_F18') || dxf.includes('SNS_POST_8X8_F18'));
assert.ok(!/NaN|Infinity/.test(dxf));
for (const sheet of drawing.sheets) {
  assert.equal(sheet.width, 1224); assert.equal(sheet.height, 792);
  const primitives = sheetPrimitives(sheet, drawing.blocks);
  const points = primitives.flatMap(e => e.type === 'line' ? [e.a, e.b] : e.type === 'polyline' ? e.points : e.type === 'circle' ? [e.center] : [e.at]);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'Finite page geometry');
}
const edited = estimate.materials.map(row => row.name === 'Post brackets' ? { ...row, quantity: 77, notes: 'Saved order edit retained.' } : row);
const modified = buildConstructionDrawingSet(values, edited, { computedItems: estimate.materials });
assert.equal(modified.modelFacts[0].postCount, model.postCount, 'Order edits cannot move or multiply structural posts');
assert.ok(modified.warnings.some(w => w.includes('saved edits')));
assert.ok(modified.sheets.filter(s => s.id.startsWith('H')).some(s => s.entities.some(e => e.type === 'text' && e.text === '77')));
const noLanding = buildConstructionDrawingSet({ ...values, stairLandingSurface: 'existing' }, estimate.materials);
assert.equal(noLanding.modelFacts[0].landings.length, 0, 'Existing landing is not duplicated');
assert.ok(!noLanding.sheets.some(s => s.title.includes('LANDING DETAIL')));
const shifted = { ...values, deckShape: JSON.stringify([{x:4,y:3},{x:4,y:15},{x:12,y:15},{x:12,y:11},{x:20,y:11},{x:20,y:3}]),
  stairEdgeIndex: 1, stairOffset: 2, additionalStairs: JSON.stringify([{edgeIndex: 4, offset: 2, width: 4, left: false, right: true}]),
  multiTierEnabled: true, lowerDeckShape: rectangle(10, 8), lowerDeckHeight: 2, lowerStairEdgeIndex: -1, lowerAdditionalStairs: '[]' };
const complex = buildConstructionDrawingSet(shifted, calculateEstimate('decks', shifted).materials);
assert.equal(complex.modelFacts.length, 2, 'Lower tier retained');
assert.ok(!/NaN|Infinity/.test(constructionDxf(complex)), 'Concave/reversed/shifted and multiple flights retain valid coordinates');
if (process.env.CAD_QA_DIR) {
  const dir = path.resolve(process.env.CAD_QA_DIR); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'construction-sample.dxf'), dxf);
  fs.writeFileSync(path.join(dir, 'construction-sample.pdf'), pdf);
  fs.writeFileSync(path.join(dir, 'construction-complex.pdf'), constructionVectorPdf(complex));
  fs.writeFileSync(path.join(dir, 'construction-complex.dxf'), constructionDxf(complex));
  fs.writeFileSync(path.join(dir, 'construction-manifest.json'), JSON.stringify({ sheets: drawing.sheets.map(s => ({ id: s.id, title: s.title, scale: s.scale })),
    facts: drawing.modelFacts, dimensions: dimensions.map(d => d.measuredIn), complexSheets: complex.sheets.length }, null, 2));
  drawing.sheets.forEach((sheet, i) => fs.writeFileSync(path.join(dir, `sheet-${String(i + 1).padStart(2, '0')}.svg`), constructionSheetSvg(sheet, drawing.blocks)));
}
console.log('PASS construction CAD: shared geometry, 18x12 footings, 4x4x4 landing, edits, multi-tier/stairs, native dimensions and vector PDF');
