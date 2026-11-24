/** Guard purchasing against unavailable deck stock lengths and invented joints. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function loadTs(filename) {
  const full = path.resolve(__dirname, '..', filename.endsWith('.ts') ? filename : filename + '.ts');
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} };
  cache.set(full, mod);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', js)((request) => request.startsWith('.') ? loadTs(path.resolve(path.dirname(full), request)) : require(request), mod, mod.exports);
  return mod.exports;
}
const { calculateEstimate } = loadTs('src/lib/estimate');
const { SERVICES } = loadTs('src/data/services');
const defaults = SERVICES.find((svc) => svc.slug === 'decks').defaults;
const rect = (width, projection) => JSON.stringify([{x:0,y:0},{x:width,y:0},{x:width,y:projection},{x:0,y:projection}]);
const deckMaterials = (overrides) => calculateEstimate('decks', { ...defaults, ...overrides }).materials.filter((row) => row.category === 'Decking' && row.unit === 'boards');
const composite = deckMaterials({ deckingType: 'composite', deckingMaterial: 'Trex Enhance', deckShape: rect(8,8), quickWidth:8, quickProjection:8 });
assert.ok(composite.length > 0);
assert.ok(composite.every((row) => /^(16|20) ft stock$/.test(String(row.stockRecommendation))), 'Composite boards can only be purchased as 16 or 20 ft stock');
const pt = deckMaterials({ deckingType: 'pressure-treated', deckingMaterial: 'Pressure treated 5/4x6', deckShape: rect(8,8), quickWidth:8, quickProjection:8 });
assert.ok(pt.every((row) => /^(8|12|16|20) ft stock$/.test(String(row.stockRecommendation))), 'Pressure-treated decking stock catalog must remain distinct');
const oversize = deckMaterials({ deckingType: 'composite', deckingMaterial: 'Trex Enhance', deckShape: rect(23,12), quickWidth:23, quickProjection:12, breakerBoardCount:0 });
assert.ok(oversize.length>0&&oversize.every((row)=>/^(16|20) ft stock$/.test(String(row.stockRecommendation))),
  '23ft deck must purchase actual 16/20ft boards, not non-existent 23ft stock');
const allLong=calculateEstimate('decks',{...defaults,deckingType:'composite',deckingMaterial:'Trex Enhance',
  deckShape:rect(25,12),quickWidth:25,quickProjection:12,pictureFrameCount:1,breakerBoardCount:0});
assert.ok(!allLong.materials.some(row=>/UNAVAILABLE|25 ft stock/.test(row.stockRecommendation)),
  '25ft picture frames and field boards must be scheduled from available stock');
assert.ok(!allLong.validationIssues.some(issue=>/No available continuous stock length|UNAVAILABLE/.test(issue)),
  'A supportable installed run must not become an order-blocking stock failure');
assert.ok(allLong.materials.filter(row=>row.name==='Picture-frame deck board 1').length>=2,
  'Long picture frames must show two or more independently cut pieces');
console.log('PASS PT/PVC stock catalogs, 23ft and 25ft stock-backed cut plans and picture-frame joints');
