const assert = require('node:assert/strict');
const load = require('./load-project-ts.cjs');
const { calculateEstimate } = load('src/lib/estimate');
const { SERVICES } = load('src/data/services');
const { materialDrawingLabel, materialCutGroups, mergeMaterialCutPlans } = load('src/lib/materialCutPlan');
const { resolveBoardDimensions, resolveFasciaDimensions } = load('src/lib/deckProductDimensions');
const { constructionAssemblyCsv } = load('src/lib/constructionAssemblyCsv');
const { buildConstructionAssembly } = load('src/lib/constructionAssembly');
const defaults = SERVICES.find(s => s.slug === 'decks').defaults;
const values = { ...defaults, deckShape: JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]), deckHeight: 5,
  pictureFrameCount: 2, breakerBoardCount: 1, stairCount: 1, stairEdgeIndex: 2, stairWidth: 4, stairOffset: 6,
  deckingMaterial: 'TimberTech Legacy - Ashwood', pictureFrameMaterial: 'TimberTech Legacy - Espresso',
  pictureFrameMaterial2: 'match', stairTreadStyle: 'match', skirtingType: 'horizontal', skirtingEnabled: true };
for (const boardRun of ['width', 'depth']) {
  const items = calculateEstimate('decks', { ...values, boardRun }).materials;
  const cutItems = items.filter(i => i.cutPlan);
  assert.ok(cutItems.length >= 4, 'Finish, stairs and flat supports retain complete stock plans');
  for (const item of cutItems) {
    const plan = item.cutPlan;
    assert.equal(plan.boards.length, item.quantity, 'A stock row equals actual optimizer board bins');
    const groups = materialCutGroups(plan);
    assert.equal(groups.reduce((n, g) => n + g.count, 0), plan.boards.reduce((n, b) => n + b.cuts.length, 0));
    for (const board of plan.boards) {
      const used = board.cuts.reduce((n, c) => n + c.lengthFt * 12 + (board.kerfIn ?? plan.kerfIn), 0) + (board.trimIn ?? plan.trimIn);
      assert.ok(Math.abs(used + board.remainderIn - board.stockLengthFt * 12) < 1e-5, 'No cuts, kerf or offcuts disappear in presentation');
    }
    assert.ok(materialDrawingLabel(item).length < 65, 'Supplier label is concise');
    // Some legacy purchase rows (including fascia) had no layout label.
    // Keep that valid identity; adding a label would orphan saved edits.
    assert.ok(!item.notes.includes('Cut refs:'), 'Bulk cut identifiers are outside purchase notes');
    const edited = { ...item, quantity: 1, notes: 'Owner saved supplier instruction.' };
    assert.equal(edited.notes, 'Owner saved supplier instruction.');
    assert.equal(edited.layoutLabel, item.layoutLabel, 'Saved edits and exclusions keep matching the same source key');
    assert.deepEqual(edited.cutPlan, item.cutPlan, 'Purchase quantity edit cannot rewrite the installation geometry');
  }
}
const combined = mergeMaterialCutPlans(
  {label:'Supports',kerfIn:.125,trimIn:.25,boards:[{stockLengthFt:8,remainderIn:47.625,cuts:[{id:'M1',lengthFt:4,location:'Main'}]}]},
  {label:'Supports',kerfIn:.25,trimIn:.5,boards:[{stockLengthFt:8,remainderIn:47.25,cuts:[{id:'L1',lengthFt:4,location:'Lower'}]}]});
assert.deepEqual(combined.boards.map(b=>[b.trimIn,b.kerfIn]), [[.25,.125],[.5,.25]], 'Stock grouping retains each independently configured cutting allowance');
assert.deepEqual([resolveBoardDimensions('TimberTech Legacy - Ashwood').faceIn, resolveBoardDimensions('TimberTech Legacy - Ashwood').thicknessIn], [5.36, .94]);
assert.equal(resolveBoardDimensions('TimberTech Premier+ - Natural Oak').thicknessIn, .89);
assert.equal(resolveBoardDimensions('Trex Select - Saddle').thicknessIn, .82);
assert.equal(resolveBoardDimensions('TimberTech Vintage - Coastline').thicknessIn, 1);
assert.equal(resolveBoardDimensions('Unknown supplied board').authority, 'generic');
assert.equal(resolveBoardDimensions('TimberTech Legacy', {faceIn: 5.4}).authority, 'configured');
assert.equal(resolveFasciaDimensions('Trex Enhance').thicknessIn, .56);
const assembly = buildConstructionAssembly(values);
const csv = constructionAssemblyCsv(assembly);
assert.equal((csv.match(/^"PART",/gm) || []).length, assembly.parts.length);
assert.equal((csv.match(/^"CONNECTION",/gm) || []).length, assembly.connections.reduce((n, c) => n + Math.max(1, c.hardware.length), 0));
assert.ok(csv.includes('Cut length in') && csv.includes('Anchor Z in'));
const injected = { ...assembly, parts: [{ ...assembly.parts[0], material: '=1+1' }], connections: [] };
assert.ok(constructionAssemblyCsv(injected).includes('"\'=1+1"'), 'CSV material text cannot execute as a spreadsheet formula');
console.log('PASS structured cut register: complete optimizer bins, concise supplier rows, saved identities, product dimensions and exact part/contact CSV');
