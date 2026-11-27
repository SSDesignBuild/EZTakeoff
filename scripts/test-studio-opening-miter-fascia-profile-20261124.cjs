/* User video Nov 24 2026 — regression: one Sunroom section is a FULL wall
 * opening. True transom triangles, 24ft cut parity, stair fascia stock,
 * exterior picture-frame miters, continuous skirting across short gates,
 * and formed Renaissance structural cross-sections.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',code)((name)=>name.startsWith('.')?
  load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
  mod,mod.exports);
 return mod.exports;
}
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const close=(a,b,eps=.0001)=>assert.ok(Math.abs(a-b)<eps,`expected ${b}, got ${a}`);
const elite=load('src/lib/eliteSunroomStudio');
const sections=load('src/lib/sunroomSectionGeometry');
const estimate=load('src/lib/estimate');
const {buildDeckModel}=load('src/lib/deckModel');
const {planVisiblePictureFrameMiterSeams}=load('src/lib/deckMiterGeometry');
const {planStairFasciaCoverage}=load('src/lib/stairFasciaGeometry');
const {buildDeckSkirting}=load('src/lib/deckSkirting');
const {SERVICES}=load('src/data/services');
const run={id:'left',from:[-8,-6],to:[-8,5.5],
 topFrom:9,topTo:8,bottomY:0,widthFt:11.5};
const wall=elite.makeDefaultEliteWallSections(run);
assert.equal(wall.length,1,'ONE 11ft6in physical opening, not three windows as sections');
const one=wall[0];
close(one.width,11.5);close(one.height,9);
assert.equal(one.uprights,2);
assert.equal(one.doorType,'none');
assert.equal(one.transomType,'picture-window');
close(one.leftTransomHeight,1);close(one.rightTransomHeight,0);
close(sections.sunroomMainTopFt(one),8);
close(sections.sunroomRoofTopFtAt(one,0),9);
close(sections.sunroomRoofTopFtAt(one,11.5),8);
close(sections.sunroomRoofCapLengthFt(one),Math.hypot(11.5,1));
close(sections.sunroomTransomPanelAreaFt2(one),11.5/2);
const openings=sections.sunroomWindowOpenings(one);
const main=openings.filter(o=>o.zone==='main');
const transoms=openings.filter(o=>o.zone==='transom');
const kick=openings.filter(o=>o.zone==='kick');
assert.equal(main.length,3,'Two uprights divide ONE opening into 3 main windows');
assert.equal(transoms.length,3,'Triangle transom has 3 glazed bays including zero-rise tail');
assert.equal(kick.length,0,'Solid lower knee panels are not glass');
assert.ok(main.every(o=>Math.abs(o.topLeftFt-8)<.0001&&
 Math.abs(o.topRightFt-8)<.0001),
 'Main windows need one LEVEL head, never individually pitched tops');
assert.ok(transoms[0].topLeftFt>transoms[0].topRightFt);
assert.ok(Math.abs(transoms[2].topRightFt-8)<.0001,
 'Final transom bay must taper to the actual low edge');
const uprights=sections.sunroomUprightOffsetsExcludingDoor(one);
assert.equal(uprights.length,2);
const runs=uprights.map(station=>sections.sunroomUprightVerticalExtent(one,station));
assert.ok(runs[0].lengthFt>runs[1].lengthFt,
 'Actual 24ft stock upright cuts must shorten toward low roof edge');
const toValues=(sec)=>({roomSystem:'3-thermal',framingColor:'white',
 windowColor:'bronze',panelColor:'clay',buildMode:'existing-structure',
 sunroomSections:JSON.stringify([sec])});
const admin=estimate.calculateEstimate('sunrooms',toValues(one));
const glazing=admin.materials.filter(m=>
 m.category==='Sunroom windows - verify shop dimensions');
assert.equal(glazing.filter(m=>m.name.includes('Horizontal slider')).length,3);
assert.equal(glazing.filter(m=>m.name.includes('Fixed picture')).length,3);
assert.ok(!admin.materials.some(m=>/corner post/i.test(m.name)));
assert.ok(admin.materials.some(m=>m.name.includes('Top cap')));
const zero=estimate.calculateEstimate('sunrooms',toValues({...one,uprights:0}));
assert.ok(admin.materials.filter(m=>m.name.includes('H-beam')).length>=
 zero.materials.filter(m=>m.name.includes('H-beam')).length,
 'Two additional true mullions cannot lower number of H stock types');
assert.deepEqual(estimate.calculateEstimate('sunrooms',toValues(one)).materials,
 admin.materials,'Admin and Sales Sunrooms material engine remains identical');
assert.ok(elite.eliteWallDimensionWarnings(run,wall).length===0,
 'Factory dimensions must match the actual rear/front roof heights');
assert.ok(elite.eliteWallDimensionWarnings(run,
 [{...one,leftTransomHeight:.4}]).some(x=>x.includes('transom/roof mismatch')));
assert.equal(elite.eliteWallBlockingIssues(run,[one]).length,0);
assert.ok(elite.eliteWallDimensionWarnings(run,[one,
 {...one,id:'legacy-window-2',width:2}]).some(x=>
 x.includes('saved window-sized sections')));
const sun3d=read('src/components/visual3d/EliteAddARoomWall3D.tsx');
assert.ok(sun3d.includes('sunroomUprightVerticalExtent'));
assert.ok(sun3d.includes('sunroomTransomBays'));
assert.ok(sun3d.includes('elite-H-beam-and-DRC-transom-break-continuous'));
assert.ok(!sun3d.includes('mainTop:Math.min(topLeft,topRight)'));
const sales=read('src/components/EliteSunroomStudioOptions.tsx');
assert.ok(sales.includes('onePhysicalOpening'));
assert.ok(sales.includes('Rebuild as one measured opening'));
const editor=read('src/components/SunroomSectionEditor.tsx');
assert.ok(editor.includes('transomEndLabels')&&
 editor.includes('Internal uprights (create additional windows)'));

// Picture-frame seam exists only at the TWO exterior front corners when the
// selected house edge is omitted, with actual polygon-mitered adjoining ends.
const deckDefaults=SERVICES.find(s=>s.slug==='decks').defaults;
const deck=buildDeckModel({...deckDefaults,
 deckShape:JSON.stringify([{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]),
 attachment:'siding',houseEdgeIndices:'[0]',
 pictureFrameCount:1,pictureFrameHouseSide:false});
const seams=planVisiblePictureFrameMiterSeams(
 deck.points,deck.pictureFrameSegments,1,deck.houseEdgeIndices,false);
assert.equal(seams.length,2,
 'House omitted: BOTH front picture-frame corners miter, neither rear house corner');
assert.deepEqual(seams.map(x=>x.cornerIndex).sort(),[2,3]);
assert.ok(seams.every(x=>x.from.every(Number.isFinite)&&
 x.to.every(Number.isFinite)));
assert.ok(!deck.pictureFrameSegments.some(edge=>edge.index===0));
const withHouse=buildDeckModel({...deckDefaults,
 deckShape:JSON.stringify(deck.points),attachment:'siding',
 houseEdgeIndices:'[0]',pictureFrameCount:1,pictureFrameHouseSide:true});
assert.equal(planVisiblePictureFrameMiterSeams(
 withHouse.points,withHouse.pictureFrameSegments,1,[0],true).length,4);
const deckRender=read('src/components/visual3d/ManufacturerDeck3D.tsx');
assert.ok(deckRender.includes('planVisiblePictureFrameMiterSeams'));

// S&S 3/4 x 12 x 12ft fascia stock: a straight nosing-parallel strip
// exposes lumber unless its measured underslung rip is installed and counted.
const face=planStairFasciaCoverage({
 treadDepthFt:11/12,treads:7,riseFt:.625,heightFt:5,style:'straight',
 nosingFt:1/12,
});
assert.equal(face.boardThicknessIn,.75);assert.equal(face.boardFaceIn,12);
assert.equal(face.stockLengthFt,12);
assert.equal(face.main.length,4);
assert.ok(face.lowerRip.length===4,'Actual diagonal stringer requires lower rip');
const structuralStart=5-1/12-(11.25/12)*Math.hypot(1,.625/(11/12));
const expectedRip=Math.max(face.main.at(-1).riseFt-Math.max(0,structuralStart-.03),
 face.main.at(-2).riseFt-Math.max(0,structuralStart-.625*7-.03))*12;
assert.ok(Math.abs(face.ripMaxWidthIn-expectedRip)<1e-7&&face.ripMaxWidthIn<face.boardFaceIn,
 'Lower rip covers the actual dressed stringer underside and fits selected fascia stock');
const stair3d=read('src/components/visual3d/DeckStairAssembly3D.tsx');
assert.ok(stair3d.includes('planStairFasciaStockPieces')&&stair3d.includes('fasciaCuts.map'));
assert.ok(stair3d.includes('fasciaDimensions.thicknessIn/12'));
const fasciaOrder=estimate.calculateEstimate('decks',{...deckDefaults,
 stairCount:1,stairEdgeIndex:2,stairWidth:4,stairOffset:2,
 stairFasciaStyle:'straight',deckHeight:5,
 deckingType:'composite',deckingMaterial:'Trex Enhance'});
assert.ok(fasciaOrder.materials.some(m=>m.stockRecommendation.includes('12 ft')&&
 m.cutPlan?.boards.some(board=>board.cuts.some(cut=>cut.location.includes('lower-rip fascia')))),
 'Ripped under-stringer strip must be on the physical 12ft supplier order');

// Skirting short gate: full-wall HORIZONTAL boards remain continuous ABOVE
// the gate; only lower leaf is interrupted, and the fixed patch is not ordered.
const front=deck.exposedSegments.find(edge=>edge.length>10);
assert.ok(front);
const gate=buildDeckSkirting(deck.edgeSegments,deck.exposedSegments,5,7.25,{
 ...deckDefaults,skirtingEnabled:true,skirtingMaterial:'kdat',
 skirtingOrientation:'horizontal',skirtingEdges:JSON.stringify([front.index]),
 skirtingGradeConfirmed:true,
 skirtingOpenings:JSON.stringify([{edgeIndex:front.index,offset:4,width:2.5,
 kind:'hinged-gate',heightFt:2.5}]),
});
const side=gate.sides[0];
assert.ok(side.courses.some(c=>c.row===0&&c.start<4&&c.end>6.5),
 'Standard upper horizontal course MUST span right across gate header');
assert.ok(!side.finishCuts.some(c=>c.location.includes('fixed upper infill above access gate')),
 'No double-order of independently patched top skirting boards');
const skirt3d=read('src/components/visual3d/DeckSkirting3D.tsx');
assert.ok(skirt3d.includes('buildConstructionSkirting')&&skirt3d.includes('assembly.parts.map')&&
 read('src/lib/constructionSkirting.ts').includes('side.physicalMembers'),
 'Renderer consumes the exact purchased panel and gate-infill members');

// Actual manufacturer outside profile and structural bent cheek references.
const frame=read('src/components/visual3d/RenaissanceExtrusions.tsx');
for(const token of ["outlineWithRibs(w,h,t,'header')",'corners.forEach','recess',
 'makeContinuousFormedTrussGeometry','renaissanceFormedProfileContour',
 'buildRenaissanceTrussCutMesh','new THREE.Float32BufferAttribute(positions,3)',
 'const innerCorners:Array<[number,number]>=corners.map','outer.holes.push(inner)']){
 assert.ok(frame.includes(token),'Renaissance formed member missing '+token);
}
const renaissance=load('src/lib/renaissanceManufacturer');
assert.equal(renaissance.getRenaissanceExtrusion('standard').headerHeightIn,7);
assert.equal(renaissance.getRenaissanceExtrusion('standard').headerDepthIn,2.75);
assert.equal(renaissance.getRenaissanceExtrusion('hd').postOutsideIn,3.875);
assert.equal(renaissance.RENAISSANCE_TRUSS.outsideHeightIn,6);
assert.equal(renaissance.RENAISSANCE_TRUSS.outsideWidthIn,2);
console.log('PASS one physical Elite opening/3 windows/trapezoid transom; 24ft stock, corner miters, 3/4x12 fascia rip order, continuous gate rows and formed Renaissance profile semantics');
