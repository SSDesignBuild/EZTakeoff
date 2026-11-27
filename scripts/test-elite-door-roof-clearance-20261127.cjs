/* Regression for the Nov 27 orbit video: actual Three meshes, not only
 * member center heights. No DOM, WebGL, network, or external QA fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const THREE=require('three'),React=require('react');
const {load,renderedMeshes}=require('./lib/three-mesh-test.cjs');
const near=(a,b,message,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${message}: ${a} vs ${b}`);
const dispose=meshes=>meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});
const {RenaissanceCover3D}=load('src/components/visual3d/RenaissanceCover3D');
const {EliteAddARoomWall3D}=load('src/components/visual3d/EliteAddARoomWall3D');
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {planRenaissanceCoverWalls}=load('src/lib/renaissanceCoverWallLayout');
const {makeDefaultEliteWallSections,defaultEliteSunroomSettings,eliteWallBlockingIssues}=load('src/lib/eliteSunroomStudio');
const {createSunroomSection}=load('src/lib/sectioning');
const base=makeConsultationProject('offline-enclosure-regression');
base.values={...base.values,deckHeight:5,deckShape:JSON.stringify([
 {x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]),stairCount:0};
const model=buildDeckModel(base.values),center=[8,6],deckHeight=5;
let cases=0,vertices=0,receivers=0;
const ray=new THREE.Raycaster();
for(const family of ['Moderno','Contempo','Classico'])
for(const variant of ['standard','hd','wide','wide-insert'])
for(const roofStyle of ['studio','gable'])for(const mount of ['wall-attached','freestanding'])
for(const endStyle of ['straight','curved']){
 const roomSystem=cases%3===1?'2-nonthermal':'3-thermal';
 const project={...base,kind:'covered-deck',coverFamily:family,coverFraming:variant,
  coverRoofStyle:roofStyle,coverMount:mount,coverScreenStyle:'elite-add-a-room',
  coverAccentEnd:endStyle,coverTrussMount:Math.floor(cases/3)%2?'flush':'raised',
  coverWidthFt:cases%3===0?12:16,coverProjectionFt:cases%3===0?8:16,
  coverSideOverhangFt:cases%3===0?0:1,coverFrontOverhangFt:cases%3===0?0:1,
  eliteSunroom:{...defaultEliteSunroomSettings(),roomSystem}};
 const anchors=planRenaissanceCoverWalls(model,project,center,deckHeight);
 const meshes=renderedMeshes(React.createElement(RenaissanceCover3D,{model,project,center,deckHeight}));
 const roof=meshes.filter(m=>m.userData.path.includes('renaissance-modular-'));
 assert.ok(roof.length>0,'Every solid family has actual panel meshes');
 const columns=meshes.filter(m=>m.userData.path.includes('/RenaissancePost'));
 const protectedMeshes=meshes.filter(m=>m.userData.path.includes('/EliteAddARoomWall3D')||
  m.userData.path.includes('/RenaissancePost')||m.name==='renaissance-post-cap-below-roof-underside');
 const roofMax=Math.max(...roof.map(m=>m.geometry.boundingBox.max.y));
 const scenario=[family,variant,roofStyle,mount,endStyle,roomSystem].join('/');
 for(const mesh of protectedMeshes){
  const positions=mesh.geometry.getAttribute('position'),seen=new Set();
  for(let i=0;i<positions.count;i++){
   const point=new THREE.Vector3().fromBufferAttribute(positions,i);
   const key=point.toArray().map(v=>v.toFixed(5)).join(',');if(seen.has(key))continue;seen.add(key);
   // With zero configured overhang, a column straddles the eave edge.
   // Extend the plane of the nearest REAL panel over its outboard half.
   const x=Math.max(anchors.xMid-anchors.plan.roofWidthFt/2+.01,
    Math.min(anchors.xMid+anchors.plan.roofWidthFt/2-.01,point.x));
   const z=Math.max(anchors.theoreticalBack-anchors.plan.rearOverhangFt+.01,
    Math.min(anchors.theoreticalFront+anchors.plan.frontOverhangFt-.01,point.z));
   ray.set(new THREE.Vector3(x,roofMax+10,z),new THREE.Vector3(0,-1,0));
   const hits=ray.intersectObjects(roof,false);
   assert.ok(hits.length>0,'Member lies beneath real roof footprint: '+scenario+' '+mesh.userData.path);
   const underside=Math.min(...hits.filter(hit=>Math.abs(hit.face.normal.y)>.1).map(hit=>
    hit.point.y-(hit.face.normal.x*(point.x-hit.point.x)+
     hit.face.normal.z*(point.z-hit.point.z))/hit.face.normal.y));
   assert.ok(point.y<=underside+.001,
    `${scenario}: ${mesh.userData.path} penetrates actual panel underside by ${(point.y-underside)*12} in at ${point.toArray()}`);
   vertices++;
  }
  if(mesh.name==='receiving-channel-back'){
   const box=mesh.geometry.boundingBox;
   for(const column of columns){
    const b=column.geometry.boundingBox;
    const x=Math.min(box.max.x,b.max.x)-Math.max(box.min.x,b.min.x);
    const z=Math.min(box.max.z,b.max.z)-Math.max(box.min.z,b.min.z);
    assert.ok(x<=.001||z<=.001,'Receiver cannot occupy cover column: '+scenario);
   }
   receivers++;
  }
 }
 for(const run of anchors.measuredRuns){
  near(run.bottomY,deckHeight,'Wall bottom is the finished deck surface');
  const raw=anchors.wallRuns.find(w=>w.id===run.id);
  const rawWidth=Math.hypot(raw.to[0]-raw.from[0],raw.to[1]-raw.from[1]);
  assert.ok(run.widthFt<rawWidth,'Measured Elite opening excludes supporting column faces');
  const sections=makeDefaultEliteWallSections(run);
  near(sections.reduce((sum,s)=>sum+s.width,0),run.widthFt,'Default wall width uses actual clear span',.001);
 }
 if(process.env.EZTAKEOFF_MESH_QA&&family==='Classico'&&variant==='standard'&&
    roofStyle==='studio'&&mount==='wall-attached'&&endStyle==='curved'){
  fs.writeFileSync(process.env.EZTAKEOFF_MESH_QA,JSON.stringify({scenario,meshes:meshes.map(m=>({
   name:m.name,path:m.userData.path,color:m.userData.material.color??'#c6b59a',
   opacity:m.userData.material.opacity??1,
   positions:Array.from((m.geometry.index?m.geometry.toNonIndexed():m.geometry).getAttribute('position').array),
  }))}));
 }
 dispose(meshes);cases++;
}
// Prime joints: inspect generated world faces, including both supporting H
// jambs, instead of relying on door dimensions appearing in source strings.
let doors=0;
for(const roomSystem of ['2-nonthermal','3-thermal'])for(const widthIn of [32,36])
for(const hinge of ['left','right']){
 const section=createSunroomSection(0,{width:12,height:8,doorType:'single',doorWidthIn:widthIn,
  doorHinge:hinge,doorPlacement:'center',transomType:'none',uprights:2});
 const run={id:'front',from:[0,0],to:[12,0],widthFt:12,bottomY:0,topFrom:8,topTo:8};
 const meshes=renderedMeshes(React.createElement(EliteAddARoomWall3D,{run,sections:[section],
  settings:{...defaultEliteSunroomSettings(),roomSystem}}));
 const get=name=>{const mesh=meshes.find(m=>m.name===name);assert.ok(mesh,name);return mesh;};
 const leaf=['left-stile','right-stile','top-rail','bottom-rail'].map(n=>get('full-view-door-leaf-'+n));
 const frame=[get('door-left-zbar-or-jamb'),get('door-right-zbar-or-jamb'),get('door-head')];
 const jambs=meshes.filter(m=>m.name==='elite-prime-full-view-door-roof-reaching-jamb');
 const parts=[...leaf,...frame,...jambs];
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  const a=parts[i].geometry.boundingBox,b=parts[j].geometry.boundingBox;
  const overlapX=Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x);
  const overlapY=Math.min(a.max.y,b.max.y)-Math.max(a.min.y,b.min.y);
  for(const face of ['min','max'])assert.ok(Math.abs(a[face].z-b[face].z)>1e-5||
   overlapX<1e-5||overlapY<1e-5,'Visible coplanar Prime frame faces: '+parts[i].name+'/'+parts[j].name);
 }
 const [left,right,top,bottom]=leaf.map(m=>m.geometry.boundingBox);
 near(left.max.x,top.min.x,'Top rail meets inside of left stile');
 near(right.min.x,top.max.x,'Top rail meets inside of right stile');
 near(left.max.x,bottom.min.x,'Bottom rail meets inside of left stile');
 near(right.min.x,bottom.max.x,'Bottom rail meets inside of right stile');
 const glass=meshes.filter(m=>m.name==='prime-clear-full-view-glazed-lite');
 assert.equal(glass.length,2,'Both glass faces remain clear');
 for(const pane of glass){
  assert.ok(pane.userData.material.transparent&&pane.userData.material.opacity<.3);
  const b=pane.geometry.boundingBox;
  near(b.min.y,bottom.max.y,'Pane begins at actual kick rail');
  near(b.max.y,top.min.y,'Pane ends at actual top rail');
 }
 assert.equal(meshes.filter(m=>m.name==='keyed-entry-hardware-handle').length,2);
 assert.equal(meshes.filter(m=>m.name==='deadbolt').length,2);
 assert.equal(meshes.filter(m=>m.name==='three-outswing-hinges').length,3);
 dispose(meshes);doors++;
}
const low={id:'front',from:[0,0],to:[12,0],widthFt:12,bottomY:0,topFrom:6.5,topTo:6.5};
assert.equal(makeDefaultEliteWallSections(low)[0].doorType,'none','Low roof must not auto-add an impossible door');
assert.ok(eliteWallBlockingIssues(low,[createSunroomSection(0,{width:12,height:6.5,doorType:'single',transomType:'none'})])
 .some(issue=>issue.includes('door head exceeds')),'Explicit impossible door retains settings and blocks its invalid render');
console.log(`PASS ${cases} actual solid-cover mesh configurations, ${vertices} roof-checked vertices, ${receivers} clear receivers and ${doors} joined Prime door variants`);
module.exports={load,renderedMeshes};
