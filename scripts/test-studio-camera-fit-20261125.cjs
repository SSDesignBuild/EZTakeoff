const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),THREE=require('three');
const code=ts.transpileModule(fs.readFileSync('src/lib/studioCameraFit.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const {fitStudioCamera}=mod.exports;
// Verify with Three's actual perspective matrices, independently of the fit
// calculation. Tall roofs, outlying patios and narrow portrait canvases must
// all remain within the rendered image at different orbit directions.
const bounds=[
  [[-10,-.6,-8],[10,12,8]],
  [[-22,-.5,-12],[38,18,20]],
  [[-8,-1,-8],[8,36,8]],
  [[-1,0,-1],[1,2,1]],
];
let checked=0;
for(const [min,max] of bounds)for(const aspect of [.45,.9,1.35,2.4,3.2])
for(const direction of [[.64,.54,.88],[-.8,.3,.6],[.1,.04,-1],[.01,1,.02]]){
  const fit=fitStudioCamera(min,max,direction,aspect,45);
  const camera=new THREE.PerspectiveCamera(45,aspect,.1,5000);
  camera.position.set(...fit.position);camera.lookAt(...fit.target);camera.updateMatrixWorld(true);
  const actualDirection=camera.position.clone().sub(new THREE.Vector3(...fit.target)).normalize();
  assert.ok(actualDirection.distanceTo(new THREE.Vector3(...direction).normalize())<1e-9,'Keep existing orbit direction');
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
    const ndc=new THREE.Vector3(x,y,z).project(camera);
    assert.ok(Math.abs(ndc.x)<.96&&Math.abs(ndc.y)<.96&&ndc.z>-1&&ndc.z<1,
      'Actual rendered corner must fit the viewport with margin: '+JSON.stringify({aspect,direction,ndc}));
    checked++;
  }
}
const narrow=fitStudioCamera([-10,0,-8],[10,12,8],[1,.5,1],.6);
const wide=fitStudioCamera([-10,0,-8],[10,12,8],[1,.5,1],2);
assert.ok(narrow.distance>wide.distance,'Narrower view must compensate for horizontal field of view');
assert.ok(fitStudioCamera([-1,0,-1],[1,1,1],[0,0,0],NaN).position.every(Number.isFinite));
console.log('PASS actual Three perspective projection of '+checked+' corners: tall roofs, remote patios, portrait/landscape and preserved orbit direction');
