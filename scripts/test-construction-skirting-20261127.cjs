const assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react');
const {load,renderedMeshes}=require('./lib/three-mesh-test.cjs');
const {buildDeckModel}=load('src/lib/deckModel');
const {makeConsultationProject}=load('src/lib/consultationProject');
const {buildConstructionSkirting}=load('src/lib/constructionSkirting');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const {buildDeckStairSkirting}=load('src/lib/deckStairSkirting');
const {framingDepthFt}=load('src/lib/constructionFraming');
const {stairSkirtRoof}=load('src/lib/stairSkirtingPhysical');
const {DeckSkirting3D}=load('src/components/visual3d/DeckSkirting3D');
const near=(a,b,message,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
const base=makeConsultationProject('anonymous-skirt-part-qa').values;
let checked=0,boards=0,supports=0;
for(const orientation of ['vertical','horizontal'])for(const angle of [0,Math.PI/6,Math.PI/2])for(const tierId of ['M','L']){
 const lower=tierId==='L',prefix=lower?'lower':'';
 const key=name=>prefix?prefix+name[0].toUpperCase()+name.slice(1):name;
 const shape=[{x:0,y:0},{x:18,y:0},{x:18,y:12},{x:0,y:12}].map(p=>({
  x:p.x*Math.cos(angle)-p.y*Math.sin(angle)+(lower?30:0),
  y:p.x*Math.sin(angle)+p.y*Math.cos(angle)+(lower?20:0)}));
 const height=lower?3.5:5.25;
 const values={...base,deckShape:JSON.stringify(shape),attachment:'freestanding',deckHeight:height,lowerDeckHeight:height,
  deckingMaterial:'TimberTech Legacy - Ashwood',stairCount:1,stairEdgeIndex:1,stairOffset:3,stairWidth:4,
  additionalStairs:JSON.stringify([{edgeIndex:2,offset:6,width:4}]),stairStringerFascia:true,
  stairFasciaStyle:angle===0?'profiled':'straight',
  [key('skirtingEnabled')]:true,[key('skirtingStairsEnabled')]:true,[key('skirtingMaterial')]:'kdat',
  [key('skirtingEdges')]:JSON.stringify([0,1,2,3]),[key('skirtingOrientation')]:orientation,
  [key('skirtingGradeConfirmed')]:true,[key('skirtingFaceIn')]:4.5,[key('skirtingGapIn')]:.25,
  [key('skirtingGrades')]:JSON.stringify([{edgeIndex:0,startFt:height-.8,endFt:height-1.15}]),
  [key('skirtingOpenings')]:JSON.stringify([{edgeIndex:0,offset:4.02,width:3,kind:'hinged-gate',heightFt:1.75},
   {edgeIndex:3,offset:2,width:2,kind:'opening'}]),
 };
 const deck=buildDeckModel(values),tier={id:tierId,label:lower?'Lower deck':'Main deck',deck,heightFt:height,values};
 const a=buildConstructionSkirting(tier);
 const plans=[buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,height,framingDepthFt(deck.joistSize)*12,values,prefix),
  buildDeckStairSkirting(deck,values,lower)];
 const cuts=plans.flatMap(p=>p.cuts),cutMap=new Map(cuts.map(c=>[c.id,c]));
 assert.ok(a.parts.length>60,'Every field, access and stair piece is present');
 assert.equal(a.parts.length,cuts.length,'One installed part per exact stock cut');
 assert.equal(new Set(a.parts.map(p=>p.id)).size,a.parts.length,'All installed IDs unique');
 if(angle===0){
  const rails=a.parts.filter(p=>p.stockReference.includes('SK')&&p.source.notes.some(n=>n.includes(': top-rail;')));
  const box=p=>({x0:Math.min(...p.footprint.map(q=>q.x)),x1:Math.max(...p.footprint.map(q=>q.x)),
   y0:Math.min(...p.footprint.map(q=>q.y)),y1:Math.max(...p.footprint.map(q=>q.y))});
  for(let i=0;i<rails.length;i++)for(let j=i+1;j<rails.length;j++){
   const x=box(rails[i]),y=box(rails[j]);
   assert.ok(Math.min(x.x1,y.x1)-Math.max(x.x0,y.x0)<1e-7||
    Math.min(x.y1,y.y1)-Math.max(x.y0,y.y0)<1e-7,'Square-corner support rails butt without double-counted volume');
  }
 }
 assert.deepEqual(new Set(a.parts.map(p=>p.stockReference)),new Set(cuts.map(c=>c.id)));
 for(const part of a.parts){
  assert.ok(part.id.startsWith(tierId+'-'));
  near(part.cutLengthFt,cutMap.get(part.stockReference).lengthFt,'Unrounded cut length shared by CAD and stock');
  assert.ok(part.vertices.length===part.profile.length*2&&part.profile.length>=3);
  assert.ok(part.zTop>part.zBottom&&part.cutLengthFt>0);
  if(part.kind==='skirt-support'){
   assert.deepEqual(part.dressed,{widthIn:3.5,depthIn:1.5});supports++;
  }else boards++;
 }
 for(const plan of plans)for(const bin of [...plan.finishStock,...plan.frameStock]){
  near(bin.stockLengthFt*12,bin.cuts.reduce((n,c)=>n+c.lengthFt*12+plan.options.kerfIn,0)+
    plan.options.trimIn+bin.remainderIn,'Exact stock/kerf/trim/offcut conservation');
 }
 for(const side of plans[1].sides){
  const index=side.edgeIndex-1000-(lower?200:0),flight=Math.floor(index/2);
  const roof=stairSkirtRoof(deck,deck.stairPlacements[flight],height,values);
  for(const m of side.physicalMembers)for(const [s,z]of m.profile){
   assert.ok(z<=roof.roofAt(s)+1e-6,'Stair skirt follows actual selected fascia/stringer underside');
   assert.ok(z>=-1e-6,'Physical support does not invent a six-inch toe or go below assumed grade');
   if(m.material==='finish')assert.ok(z>=planReveal(plans[1])-1e-6,'Configured finish ground reveal is preserved');
  }
 }
 const center=[(deck.minX+deck.maxX)/2,(deck.minY+deck.maxY)/2];
 const meshes=renderedMeshes(React.createElement(DeckSkirting3D,{model:deck,center,height,values,lowerTier:lower,texture:null}));
 const physical=meshes.filter(m=>m.userData.constructionPartId),byMesh=new Map(physical.map(m=>[m.userData.constructionPartId,m]));
 assert.equal(physical.length,a.parts.length,'Renderer emits exactly the CAD part count');
 for(const part of a.parts){
  const mesh=byMesh.get(part.id);assert.ok(mesh,'Renderer includes '+part.id);
  assert.equal(mesh.userData.stockReference,part.stockReference);
  const p=mesh.geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)assert.ok(part.vertices.some(v=>
   Math.abs(v.x-center[0]-p.getX(i))<2e-5&&Math.abs(v.z-p.getY(i))<2e-5&&Math.abs(v.y-center[1]-p.getZ(i))<2e-5),
   'Actual Three vertex belongs to canonical CAD/cut polygon');
 }
 const gate=a.connections.find(c=>c.kind==='skirting-access-gate');assert.ok(gate);
 assert.equal(gate.hardware.find(h=>h.name.includes('hinge')).quantity,2);
 const gateParts=a.parts.filter(p=>gate.partIds.includes(p.id));
 assert.equal(gateParts.filter(p=>p.kind==='skirt-support').length,4,'Complete gate leaf has two rails and two stiles');
 const plannedFrame=plans.reduce((n,p)=>n+p.frameScrews,0),plannedFinish=plans.reduce((n,p)=>n+p.finishNails+p.finishScrews,0);
 const connectionQty=kind=>a.connections.filter(c=>c.kind===kind).reduce((n,c)=>n+c.hardware.reduce((k,h)=>k+h.quantity,0),0);
 assert.equal(connectionQty('skirt-frame-attachment'),plannedFrame,'Every frame screw allowance is shared with takeoff');
 assert.equal(connectionQty('skirt-finish-attachment'),plannedFinish,'Gate, infill, perimeter and stair finish fasteners share the same cut contacts');
 if(process.env.EZTAKEOFF_SKIRT_QA&&orientation==='horizontal'&&angle===Math.PI/6&&!lower){
  fs.writeFileSync(process.env.EZTAKEOFF_SKIRT_QA,JSON.stringify({parts:a.parts,meshes:meshes.map(m=>({
   name:m.name,path:m.userData.path,color:m.userData.material.color??'#927654',opacity:1,
   positions:Array.from((m.geometry.index?m.geometry.toNonIndexed():m.geometry).getAttribute('position').array)}))}));
 }
 meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();});checked++;
}
function planReveal(plan){return plan.options.revealIn/12;}
console.log(`PASS ${checked} rotated/tier/orientation skirt assemblies; ${boards} finish boards and ${supports} actual 2x4 supports share stock IDs, exact cuts, CAD polygons and rendered Three vertices`);
