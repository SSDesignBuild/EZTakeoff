/** Regression checks for exact, persisted deck support layouts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function loadTs(filename) {
  const full = path.resolve(__dirname, '..', filename.endsWith('.ts') ? filename : filename + '.ts');
  if (cache.has(full)) return cache.get(full).exports;
  const moduleRecord = { exports: {} };
  cache.set(full, moduleRecord);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  } }).outputText;
  new Function('require', 'module', 'exports', js)((request) => request.startsWith('.') ? loadTs(path.resolve(path.dirname(full), request)) : require(request), moduleRecord, moduleRecord.exports);
  return moduleRecord.exports;
}
const { buildDeckModel, buildLowerTierDeckModel } = loadTs('src/lib/deckModel');
const { parseExactPostLayouts, evenlySpacedPosts, validateExactPostLayout, shiftPostLayoutIndices } = loadTs('src/lib/exactPostLayouts');
const { calculateEstimate } = loadTs('src/lib/estimate');
const { SERVICES } = loadTs('src/data/services');
const defaults = SERVICES.find((service) => service.slug === 'decks').defaults;
const rectangle = (width, depth) => JSON.stringify([{x:0,y:0},{x:width,y:0},{x:width,y:depth},{x:0,y:depth}]);
const shape = rectangle(19.5, 12);
const stations = evenlySpacedPosts([{startX:0,endX:19.5}],4,2);
const expected = [2, 7 + 2/12, 12 + 4/12, 17.5];
expected.forEach((x,i)=>assert.ok(Math.abs(stations[i]-x)<0.0001, 'Exact symmetric station '+i));
const manual = [{ beamIndex: 0, posts: stations.map((x,i)=>({id:'approved-'+i,x,locked:i===0})) }];
const values = {...defaults, deckShape:shape, quickWidth:19.5, quickProjection:12, customBeamYs:JSON.stringify([10]), postLayouts:JSON.stringify(manual)};
const deck=buildDeckModel(values);
assert.equal(deck.beamLines[0].postMode,'manual');
assert.equal(deck.beamLines[0].postXs.length,4,'Four specified supports replace all auto supports');
assert.equal(deck.postCount,4,'Exact post count drives footing and hardware');
assert.equal(deck.postBases,4);
assert.equal(deck.concreteAnchors,4);
assert.equal(deck.concreteBags,12);
assert.deepEqual(deck.postLocations.map((p)=>p.reference),['B1-P1','B1-P2','B1-P3','B1-P4']);
assert.equal(deck.beamLines[0].postSpecs[0].locked,true);
assert.equal(deck.postLayoutIssues.length,0);
const estimated = calculateEstimate('decks',values);
assert.equal(estimated.materials.find((row)=>row.name==='Post brackets').quantity,4);
assert.ok(estimated.orderNotes.some((note)=>note.includes('B1-P4')));
assert.equal((estimated.validationIssues||[]).length,0);
const removed=buildDeckModel({...values,postLayouts:JSON.stringify([{beamIndex:0,posts:manual[0].posts.slice(0,3)}])});
assert.equal(removed.postCount,3);
assert.equal(removed.postBases,3);
const invalid=calculateEstimate('decks',{...values,postLayouts:JSON.stringify([{beamIndex:0,posts:[{id:'bad',x:40,locked:false}]}])});
assert.ok((invalid.validationIssues||[]).length>0,'Invalid support layout must block export');
assert.ok(parseExactPostLayouts('{corrupt').issues.length>0,'Invalid saved JSON cannot silently revert');
assert.equal(validateExactPostLayout({beamIndex:0,posts:[{id:'alone',x:2,locked:false}]},[{startX:0,endX:19.5}]).length,1);
const shifted=shiftPostLayoutIndices(manual,0,'insert');
assert.equal(shifted[0].beamIndex,1);
assert.equal(shiftPostLayoutIndices(shifted,0,'remove')[0].beamIndex,0);
const lower=buildLowerTierDeckModel({...values,multiTierEnabled:true,lowerDeckShape:rectangle(19.5,8),lowerCustomBeamYs:JSON.stringify([6]),lowerPostLayouts:JSON.stringify(manual)});
assert.ok(lower);
assert.equal(lower.beamLines[0].postXs.length,4,'Lower deck post positions are independent');
console.log('PASS 19 ft 6 in manual post geometry, persistence, footings, references, validation and lower tier');
