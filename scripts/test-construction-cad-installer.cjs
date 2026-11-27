/** Physical installer CAD regression: exact source geometry, identity and placement.
 * This test deliberately reconstructs model coordinates from each plotted view.
 * Token presence alone cannot pass a displaced, omitted or guessed member. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function loadTs(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const full = path.resolve(__dirname, '..', file.endsWith('.ts') ? file : file + '.ts');
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} }; cache.set(full, mod);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText;
  new Function('require', 'module', 'exports', js)(name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(full), name)) : require(name), mod, mod.exports);
  return mod.exports;
}
const { buildConstructionAssembly } = loadTs('src/lib/constructionAssembly');
const { buildConstructionDrawingSet } = loadTs('src/lib/constructionCad');
const { clipConstructionPolygon } = loadTs('src/lib/constructionCadInstaller');
const { dimensionGeometry } = loadTs('src/lib/constructionCadScene');
const { constructionVectorPdf, constructionDxf } = loadTs('src/lib/constructionCadExport');
const { calculateEstimate } = loadTs('src/lib/estimate');
const { SERVICES } = loadTs('src/data/services');
const defaults = SERVICES.find(s => s.slug === 'decks').defaults;
const rectangle = (w, d) => JSON.stringify([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }]);
const base = { ...defaults, deckShape: rectangle(16, 12), deckHeight: 5, boardRun: 'width', stairCount: 1, stairEdgeIndex: 2, stairOffset: 6, stairWidth: 4,
  stairLandingSurface: 'bare-ground', footingDiameterIn: 18, footingDepthIn: 12, stairLandingDepthFt: 4, stairLandingThicknessIn: 4,
  pictureFrameCount: 2, breakerBoardCount: 1, poJobName: 'Installer Geometry QA', jobAddress: 'Synthetic source coordinates', customerPhone: '' };
const fixtures = [
  ['baseline', base],
  ['rails', { ...base, railCoverage: JSON.stringify([{ edgeIndex: 1, start: 0, end: 12 }, { edgeIndex: 2, start: 0, end: 16 }, { edgeIndex: 3, start: 0, end: 12 }]), stairRailingLeft: true, stairRailingRight: true, railingHeightIn: '36' }],
  ['subfloor', { ...base, deckingSurface: 'subfloor', stairCount: 0, stairEdgeIndex: -1, additionalStairs: '[]' }],
  ['fascia-angled', { ...base, deckShape: JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}].map(p=>({x:p.x*Math.cos(.3)-p.y*Math.sin(.3),y:p.x*Math.sin(.3)+p.y*Math.cos(.3)}))), stairCount:0, stairEdgeIndex:-1, additionalStairs:'[]' }],
  ['skirting', { ...base, skirtingEnabled: true, skirtingStairsEnabled: true, skirtingGradeConfirmed: true, skirtingMaterial: 'kdat', skirtingOrientation: 'horizontal',
    skirtingEdges: JSON.stringify([1,2]), skirtingGrades: JSON.stringify([{edgeIndex:1,startFt:3.75,endFt:4.25},{edgeIndex:2,startFt:4.25,endFt:3.75}]),
    skirtingOpenings: JSON.stringify([{edgeIndex:1,offset:2,width:3,kind:'hinged-gate',heightFt:2.75}]) }],
  ['long-fields', { ...base, poJobName: 'Long synthetic project name '.repeat(20) + 'ENDJOBTOKEN', jobAddress: 'Long synthetic project address '.repeat(25) + 'ENDADDRESSTOKEN',
    customerPhone: 'Synthetic contact extension '.repeat(10) + 'ENDPHONETOKEN', drawingRevision: 'Detailed synthetic revision '.repeat(12) + 'ENDREVISIONTOKEN' }],
  ['complex', { ...base, deckShape: JSON.stringify([{x:4,y:3},{x:4,y:15},{x:12,y:15},{x:12,y:11},{x:20,y:11},{x:20,y:3}]),
    stairEdgeIndex: 1, stairOffset: 2, additionalStairs: JSON.stringify([{edgeIndex:4,offset:2,width:4,left:false,right:true}]),
    multiTierEnabled: true, lowerDeckShape: rectangle(10,8), lowerDeckHeight: 2, lowerStairEdgeIndex: -1, lowerAdditionalStairs:'[]' }],
];
const approx = (a, b, message, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const samePolygon = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-7 && Math.abs(p.y - b[i].y) < 1e-7);
const convexIntersection = (a, b) => {
  const axes = [a,b].flatMap(p=>p.map((q,i)=>({x:-(p[(i+1)%p.length].y-q.y),y:p[(i+1)%p.length].x-q.x})));
  return axes.every(axis=>{
    if(Math.hypot(axis.x,axis.y)<1e-9)return true;
    const pa=a.map(p=>p.x*axis.x+p.y*axis.y),pb=b.map(p=>p.x*axis.x+p.y*axis.y);
    return Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))>1e-7;
  });
};
const modelPoint = (p, view) => ({ x: (p.x - view.originPaper.x) / view.pointsPerFt + view.modelOrigin.x, y: (p.y - view.originPaper.y) / view.pointsPerFt + view.modelOrigin.y });
const report = [];
for (const [name, values] of fixtures) {
  const materials = calculateEstimate('decks', values).materials, unchanged = JSON.stringify([values, materials]);
  const assembly = buildConstructionAssembly(values), drawing = buildConstructionDrawingSet(values, materials, { computedItems: materials, revision: name === 'long-fields' ? values.drawingRevision : 'QA' });
  assert.equal(JSON.stringify([values, materials]), unchanged, `${name}: export mutated saved data`);
  assert.equal(new Set(assembly.parts.map(p => p.id)).size, assembly.parts.length, 'Unique physical piece IDs');
  assert.deepEqual(drawing.assemblyPartIds, assembly.parts.map(p => p.id));
  assert.deepEqual(drawing.assemblyConnectionIds, assembly.connections.map(c => c.id));
  const partIds = new Set(assembly.parts.map(p => p.id)), connectionIds = new Set(assembly.connections.map(c => c.id));
  for (const connection of assembly.connections) {
    assert.equal(connection.holePattern, null, 'No invented manufacturer drill pattern');
    assert.ok(connection.partIds.every(id => partIds.has(id)), `${connection.id} has a dangling connected part`);
  }
  for (const part of assembly.parts) {
    let exact = false, tagged = false;
    for (const sheet of drawing.sheets) {
      tagged ||= sheet.entities.some(e => e.type === 'text' && e.sourcePartId === part.id && e.graphicRole === 'part-tag');
      for (const e of sheet.entities.filter(e => e.type === 'polyline' && e.sourcePartId === part.id && e.graphicRole === 'part-outline')) {
        for (const view of (sheet.views ?? []).filter(v => v.projection === 'plan' && v.partIds.includes(part.id))) {
          if (samePolygon(e.points.map(p => modelPoint(p, view)), part.footprint)) exact = true;
        }
      }
    }
    assert.ok(exact, `${name}: missing/displaced complete physical footprint for ${part.id} (${part.kind})`);
    assert.ok(tagged, `${name}: piece has no readable keyed ID ${part.id}`);
  }
  for (const part of assembly.parts.filter(p=>p.kind==='fascia')) {
    let leaderTag = false;
    for (const sheet of drawing.sheets.filter(s=>s.views?.some(v=>v.projection==='plan'&&v.partIds.includes(part.id)))) {
      const tags = sheet.entities.filter(e=>e.type==='text'&&e.sourcePartId===part.id&&e.graphicRole==='part-tag');
      for(const tag of tags) {
        assert.equal(tag.text,part.id,`${name}: thin fascia tag must preserve its full ID without crowded duplicated cut text`);
        const angle=(tag.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),width=tag.text.length*tag.height*.6;
        const glyph=[[-width/2,-tag.height],[width/2,-tag.height],[width/2,0],[-width/2,0]].map(([x,y])=>({x:tag.at.x+c*x-s*y,y:tag.at.y+s*x+c*y}));
        for(const face of sheet.entities.filter(e=>e.type==='polyline'&&e.sourcePartId&&['part-outline','part-fragment'].includes(e.graphicRole)))
          assert.ok(!convexIntersection(glyph,face.points),`${name}/${sheet.id}: fascia tag crosses a physical outline (${part.id}/${face.sourcePartId})`);
        for(const primitive of sheet.entities.filter(e=>e.type==='dimension').flatMap(dimensionGeometry)) {
          if(primitive.type==='line') {
            const local=p=>({x:(p.x-tag.at.x)*c+(p.y-tag.at.y)*s,y:-(p.x-tag.at.x)*s+(p.y-tag.at.y)*c});
            const a=local(primitive.a),b=local(primitive.b);let low=0,high=1,hit=true;
            for(const [axis,min,max] of [['x',-width/2,width/2],['y',-tag.height,0]]) {
              const delta=b[axis]-a[axis];
              if(Math.abs(delta)<1e-8){if(a[axis]<min||a[axis]>max)hit=false;continue;}
              const cuts=[(min-a[axis])/delta,(max-a[axis])/delta].sort((a,b)=>a-b);
              low=Math.max(low,cuts[0]);high=Math.min(high,cuts[1]);
            }
            assert.ok(!hit||low>high,`${name}/${sheet.id}: fascia tag crosses a native dimension line (${part.id})`);
          } else if(primitive.type==='text') {
            const angle=(primitive.rotation??0)*Math.PI/180,dc=Math.cos(angle),ds=Math.sin(angle),dw=primitive.text.length*primitive.height*.6;
            const other=[[-dw/2,-primitive.height],[dw/2,-primitive.height],[dw/2,0],[-dw/2,0]].map(([x,y])=>({x:primitive.at.x+dc*x-ds*y,y:primitive.at.y+ds*x+dc*y}));
            assert.ok(!convexIntersection(glyph,other),`${name}/${sheet.id}: fascia tag crosses a native dimension label (${part.id})`);
          }
        }
        assert.ok(sheet.entities.some(e=>e.type==='line'&&e.sourcePartId===part.id&&e.graphicRole==='part-tag'),`${name}: fascia tag has no linked leader`);
        leaderTag = true;
      }
    }
    assert.ok(leaderTag,`${name}: fascia piece lost its drawing ID/leader (${part.id})`);
  }
  for (const connection of assembly.connections) {
    let exact = false;
    for (const sheet of drawing.sheets) for (const e of sheet.entities.filter(e => e.sourceConnectionId === connection.id && e.graphicRole === 'connection-location')) {
      const center = e.type === 'circle' ? e.center : e.type === 'polyline' ? { x: e.points.reduce((n,p) => n+p.x,0)/e.points.length, y: e.points.reduce((n,p) => n+p.y,0)/e.points.length } : null;
      if (!center) continue;
      for (const view of (sheet.views ?? []).filter(v => v.projection === 'plan' && v.connectionIds.includes(connection.id))) {
        const p = modelPoint(center, view);
        if (Math.hypot(p.x - connection.point.x, p.y - connection.point.y) < 1e-7) exact = true;
      }
    }
    assert.ok(exact, `${name}: connector location lost or displaced ${connection.id}`);
  }
  let completeFootprints = 0, fragments = 0;
  for (const sheet of drawing.sheets.filter(s => s.title.includes('FOUNDATION / POST CENTER SETOUT'))) {
    const box = e => { const width = e.text.length * e.height * .6; return { x0: e.at.x - (e.align === 'center' ? width / 2 : e.align === 'right' ? width : 0), x1: e.at.x + (e.align === 'center' ? width / 2 : e.align === 'right' ? 0 : width), y0: e.at.y - e.height, y1: e.at.y }; };
    const labels = sheet.entities.filter(e => e.type === 'dimension').flatMap(dimensionGeometry).filter(e => e.type === 'text' && !e.rotation).map(box);
    for (const note of sheet.entities.filter(e => e.type === 'text' && e.layer === 'NOTES' && e.at.y > 600 && e.at.y < 665)) {
      const b = box(note);
      assert.ok(labels.every(d => b.x1 <= d.x0 || b.x0 >= d.x1 || b.y1 <= d.y0 || b.y0 >= d.y1), `${name}/${sheet.id}: footer datum note overlaps a native setout dimension label`);
    }
  }
  for (const sheet of drawing.sheets) {
    const caption = sheet.entities.find(e => e.type === 'text' && e.layer === 'TITLE' && e.text.startsWith('SCALE 1:') && e.at.y < 684);
    if (!caption) continue;
    const b = { x0: caption.at.x, x1: caption.at.x + caption.text.length * caption.height * .6, y0: caption.at.y - caption.height, y1: caption.at.y };
    for (const e of sheet.entities.filter(e => e.type === 'dimension').flatMap(dimensionGeometry).filter(e => e.type === 'line')) {
      const horizontalHit = Math.abs(e.a.y - e.b.y) < 1e-7 && e.a.y > b.y0 && e.a.y < b.y1 && Math.max(e.a.x, e.b.x) > b.x0 && Math.min(e.a.x, e.b.x) < b.x1;
      const verticalHit = Math.abs(e.a.x - e.b.x) < 1e-7 && e.a.x > b.x0 && e.a.x < b.x1 && Math.max(e.a.y, e.b.y) > b.y0 && Math.min(e.a.y, e.b.y) < b.y1;
      assert.ok(!horizontalHit && !verticalHit, `${name}/${sheet.id}: native dimension line crosses the graphic scale caption`);
    }
  }
  for (const sheet of drawing.sheets) for (const e of sheet.entities) {
    if (e.sourcePartId) assert.ok(partIds.has(e.sourcePartId), `${name}: unknown part annotation`);
    if (e.sourceConnectionId) assert.ok(connectionIds.has(e.sourceConnectionId), `${name}: unknown connector annotation`);
    if (e.type === 'text') assert.ok(e.height >= 7.5, `${sheet.id} text below installer print minimum`);
    if (e.graphicRole === 'part-outline') completeFootprints++;
    if (e.graphicRole === 'part-fragment') fragments++;
    if (['part-outline','part-fragment','section','connection-location'].includes(e.graphicRole)) {
      const points = e.type === 'polyline' ? e.points : e.type === 'line' ? [e.a,e.b] : e.type === 'circle' ? [e.center] : [];
      for (const p of points) assert.ok(p.x >= 24 && p.x <= 1200 && p.y >= 96 && p.y <= 664, `${name}/${sheet.id}: physical drawing escaped printable view (${p.x},${p.y})`);
    }
  }
  if (name === 'baseline') {
    assert.ok(drawing.sheets.length <= 26, 'Ordinary contacts must not inflate the small-deck print set');
    assert.ok(drawing.sheets.filter(s => s.id.startsWith('QM')).length <= 4, 'Compact per-part index');
    const joist = assembly.parts.find(p => p.kind === 'joist');
    approx(joist.cutLengthFt, 11.5, 'Joist ends clear the two 1.5-in rim plies at both ends');
    const footer = assembly.parts.find(p => p.kind === 'footing'), pad = assembly.parts.find(p => p.kind === 'landing');
    approx(Math.max(...footer.footprint.map(p=>p.x))-Math.min(...footer.footprint.map(p=>p.x)),1.5,'18-in physical footing');
    approx(footer.zTop-footer.zBottom,1,'12-in footing depth');
    const area = Math.abs(pad.footprint.reduce((sum,p,i,a)=>sum+p.x*a[(i+1)%a.length].y-a[(i+1)%a.length].x*p.y,0))/2;
    approx(area,16,'4x4 pad area'); approx(pad.zTop-pad.zBottom,1/3,'4-in pad thickness');
    for (const p of assembly.parts.filter(p=>p.kind==='beam')) approx(p.dressed.widthIn,1.5,'Each beam ply has dressed thickness');
  }
  if (name === 'rails') assert.ok(assembly.parts.some(p=>p.kind==='picket') && assembly.parts.some(p=>p.kind==='rail-post'), 'Railing regression must exercise actual kit components');
  if (name === 'subfloor') {
    assert.ok(assembly.parts.some(p=>p.kind==='subfloor'), 'Actual subfloor panels retained');
    assert.ok(!assembly.parts.some(p=>['field-board','picture-frame','breaker'].includes(p.kind)), 'Subfloor must not invent decorative deck boards');
    for(const panel of assembly.parts.filter(p=>p.kind==='subfloor')) approx(panel.zTop-panel.zBottom,.75/12,'Physical 3/4-in panel thickness');
  }
  if (name === 'skirting') {
    const profiles = assembly.parts.filter(p=>['skirt-board','skirt-support'].includes(p.kind) && p.profile?.length && p.vertices?.length === p.profile.length*2);
    assert.ok(profiles.length > 10, 'Skirting case must exercise real individual finish/support cuts');
    for(const part of profiles) {
      let matched = false;
      for(const sheet of drawing.sheets) for(const view of (sheet.views ?? []).filter(v=>v.projection==='elevation' && (['x','y'].includes(v.axis)||v.stationAxis) && v.partIds.includes(part.id))) {
        const station=p=>view.stationAxis?(p.x-view.stationAxis.origin.x)*view.stationAxis.direction.x+(p.y-view.stationAxis.origin.y)*view.stationAxis.direction.y:p[view.axis];
        const expected=part.vertices.slice(0,part.profile.length).map(p=>({x:station(p),y:p.z}));
        const area=Math.abs(expected.reduce((sum,p,i,a)=>sum+p.x*a[(i+1)%a.length].y-a[(i+1)%a.length].x*p.y,0))/2;
        if(area<1e-8)continue;
        for(const e of sheet.entities.filter(e=>e.type==='polyline'&&e.sourcePartId===part.id&&e.graphicRole==='part-outline')) {
          const actual=e.points.map(p=>({x:(p.x-view.originPaper.x)/view.pointsPerFt+view.modelOrigin.x,y:(view.originPaper.y-p.y)/view.pointsPerFt+view.modelOrigin.y}));
          if(samePolygon(actual,expected))matched=true;
        }
      }
      assert.ok(matched, `Exact ordered skirt profile lost (a convex hull can erase notches): ${part.id}`);
    }
  }
  if (name === 'long-fields') {
    assert.deepEqual(drawing.projectMetadata,{jobName:values.poJobName,address:values.jobAddress,phone:values.customerPhone,revision:values.drawingRevision});
    const basis = drawing.sheets.filter(s=>s.id.startsWith('N')).flatMap(s=>s.entities.filter(e=>e.type==='text').map(e=>e.text)).join(' ');
    for(const marker of ['ENDJOBTOKEN','ENDADDRESSTOKEN','ENDPHONETOKEN','ENDREVISIONTOKEN']) assert.ok(basis.includes(marker),`Full project field omitted: ${marker}`);
    for(const sheet of drawing.sheets) for(const e of sheet.entities.filter(e=>e.type==='text'&&e.at.y>=684&&e.at.x<565)) assert.ok(e.at.x+e.text.length*e.height*.6<=550, 'Footer field escaped its bounded column');
  }
  report.push({ fixture:name,parts:assembly.parts.length,connections:assembly.connections.length,sheets:drawing.sheets.length,completeFootprints,clippedFragments:fragments,exactSourceFootprints:true,exactSourceAnchors:true,minTextPt:7.5 });
  if (process.env.CAD_QA_DIR) {
    const dir = path.resolve(process.env.CAD_QA_DIR); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,`construction-${name}-assembly.json`),JSON.stringify(assembly,null,2));
    fs.writeFileSync(path.join(dir,`construction-${name}-values.json`),JSON.stringify(values,null,2));
  }
  if (process.env.CAD_QA_DIR && ['rails','skirting','long-fields'].includes(name)) {
    const dir = path.resolve(process.env.CAD_QA_DIR); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,`construction-${name}.pdf`),constructionVectorPdf(drawing));
    fs.writeFileSync(path.join(dir,`construction-${name}.dxf`),constructionDxf(drawing));
    fs.writeFileSync(path.join(dir,`construction-${name}-manifest.json`),JSON.stringify({sheets:drawing.sheets.map(s=>({id:s.id,title:s.title,scale:s.scale})),parts:assembly.parts.length,connections:assembly.connections.length},null,2));
  }
}
const clipped = clipConstructionPolygon([{x:-2,y:-1},{x:2,y:-1},{x:2,y:2},{x:-2,y:2}],{minX:0,minY:0,maxX:1,maxY:1});
assert.ok(clipped.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
approx(Math.abs(clipped.reduce((n,p,i,a)=>n+p.x*a[(i+1)%a.length].y-a[(i+1)%a.length].x*p.y,0))/2,1,'Detail clipping preserves exact intersection area');
if(process.env.CAD_QA_DIR)fs.writeFileSync(path.join(path.resolve(process.env.CAD_QA_DIR),'installer-geometry-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS installer CAD exact physical footprints, source part tags, native connector anchors, clipped details and print hierarchy');
console.log(JSON.stringify(report));
