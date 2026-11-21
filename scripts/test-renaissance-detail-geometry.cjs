const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const mod={exports:{}};
const js=ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/renaissanceDetailGeometry.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
new Function('module','exports',js)(mod,mod.exports);
const {planDolceScreenProfile,roofLineAtX}=mod.exports;
const from=[0,0],to=[0,10];
const rear=9+5/12,front=9;
const p=planDolceScreenProfile({
  from,to,bottomFt:.12,topFromFt:rear,topToFt:front,openView:true,
});
assert.ok(p,'10ft roof-aligned Dolce open view screen should exist');
assert.equal(p.lengthFt,10);
assert.equal(p.bayCount,1,'open view side should have no extra intermediate mullions');
assert.equal(p.mullions.length,2);
assert.ok(Math.abs(p.mullions[0].topFt-p.mullions[1].topFt-5/12)<1e-8,
  'side screen top must follow 5-in roof elevation difference');
assert.ok(Math.abs(p.contour[3].riseFt-p.contour[2].riseFt-5/12)<1e-8,
  'screen mesh geometry must be a trapezoid, not a generic rectangular plate');
const standard=planDolceScreenProfile({
  from:[0,0],to:[18,0],bottomFt:.12,topFromFt:9,topToFt:9,openView:false,
});
assert.equal(standard.bayCount,4,'standard screens should have mullions at ~5ft');
assert.equal(standard.mullions.length,5);
assert.equal(planDolceScreenProfile({from,to,bottomFt:9,topFromFt:8,topToFt:8,openView:true}),null);
assert.equal(planDolceScreenProfile({from:[NaN,0],to,bottomFt:0,topFromFt:9,topToFt:9,openView:true}),null);
assert.equal(planDolceScreenProfile({from:[0,0],to:[0,0],bottomFt:0,topFromFt:9,topToFt:9,openView:true}),null);
const gable={midXFt:0,roofWidthFt:16,eaveFt:9,gableRiseFt:2,gable:true,
  studioFrontFt:9,studioRearFt:10,rear:false};
assert.equal(roofLineAtX({...gable,xFt:0}),11);
assert.equal(roofLineAtX({...gable,xFt:-8}),9);
assert.equal(roofLineAtX({...gable,xFt:8}),9);
assert.equal(roofLineAtX({...gable,xFt:4}),10);
assert.equal(roofLineAtX({...gable,xFt:200}),9);
assert.equal(roofLineAtX({...gable,xFt:0,gable:false,rear:true}),10);
assert.equal(roofLineAtX({...gable,xFt:0,gable:false,rear:false}),9);
const render=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceCover3D.tsx'),'utf8');
const extrude=fs.readFileSync(path.join(root,'src/components/visual3d/RenaissanceExtrusions.tsx'),'utf8');
assert.ok(render.includes('planDolceScreenProfile'));
assert.ok(render.includes('shapeGeometry args={[shape]}'));
assert.ok((render.includes('topFrom={roofBack-headerHeight}')&&render.includes('topTo={roofFront-headerHeight}'))||
  (render.includes('topFrom:roofBack-headerHeight')&&render.includes('topTo:roofFront-headerHeight')),
  'Dolce side walls must follow both endpoints of the sloped roof');
assert.ok(render.includes("product.family==='full-trusses'")&&
  render.includes('plan.projectionTrussStationsFt.map'),'full Classico trusses run in projection');
assert.ok(render.includes('RenaissanceCurvedTrussEnd'),'Contempo and Classico need sculpted tail contour');
assert.ok(!render.includes("Math.ceil(depth/7)+1"),'remove sideways generic full-truss array');
assert.ok(!render.includes("radius={.075}"),'remove cylinder proxy truss geometry');
assert.ok(extrude.includes('shape.bezierCurveTo'),'tail needs a curved profile');
assert.ok(extrude.includes('ExtrudeGeometry'),'contour must be a 3D mesh');
assert.ok(!render.includes('roofWidthFt:width,eaveFt,'),
  '3D roofline inputs must refer to the actual eaveY variable');
assert.ok(!render.includes('x={x}frontZ=')&&!render.includes('}color={powder}'),
  'Contempo JSX attributes must have explicit separators in strict TypeScript');
console.log('PASS roof-following Dolce screens, trapezoid mesh, true open-view panels, Classico projection trusses and Contempo curved 3D ends');
