/* Manufacturer-source geometry contracts, Nov 24 2026. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)((name)=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const source=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const {PCA_PET_FRAME,effectivePcaKickPlateIn,pcaKickPlateSupportsPet,pcaPetCompatibility}=load('src/lib/pcaScreenDoorGeometry');
assert.equal(effectivePcaKickPlateIn('none'),8);
assert.equal(effectivePcaKickPlateIn('none',0),0);
for(const [pet,height] of [['small',12],['medium',24],['large',24]]){
 assert.equal(effectivePcaKickPlateIn(pet,0),height,'auto '+pet+' does not honor an undersized saved manual selection');
 assert.ok(pcaKickPlateSupportsPet(pet,height));
 assert.ok(!pcaKickPlateSupportsPet(pet,8));
 assert.ok(PCA_PET_FRAME[pet].outerHeightIn>0);
 assert.ok(PCA_PET_FRAME[pet].cutHeightIn<PCA_PET_FRAME[pet].outerHeightIn);
 assert.ok(PCA_PET_FRAME[pet].cutWidthIn<PCA_PET_FRAME[pet].outerWidthIn);
}
assert.ok(!pcaPetCompatibility('A-500','large'));
const pca=source('src/components/visual3d/PcaScreenDoor3D.tsx');
assert.ok(pca.includes('shape.holes.push(hole)')&&pca.includes('pca-continuous-full-width-kick-panel-')&&
 !pca.includes('split-kick-'),'PCA kick spans full door; pet aperture is pierced inside it');
const ui=source('src/components/ConsultationVisualPickers.tsx');
assert.ok(ui.includes('project.coverTrussMount')&&ui.includes('effectivePcaKickPlateIn'));
const stair=source('src/components/visual3d/DeckStairAssembly3D.tsx');
const {planStairStringerFaceStations}=load('src/lib/stairFasciaGeometry');
for(const width of [3,4,6,10]){
 const xs=planStairStringerFaceStations(width,Math.ceil(width)+1);
 assert.ok(xs.length>=4);
 assert.ok(xs[0]-1.5/12>=-width/2-1e-8,'left stringer projects entirely under fascia');
 assert.ok(xs.at(-1)<=width/2+1e-8,'right stringer projects entirely under fascia');
}
assert.ok(stair.includes('planStairStringerFaceStations')&&stair.includes('fasciaOutline'),
 'Structural stringer and decorative fascia must be separate geometries');
const {planMiteredPictureFrames}=load('src/lib/deckMiterGeometry');
const pts=[{x:0,y:0},{x:25,y:0},{x:25,y:12},{x:0,y:12}],segs=pts.map((p,i)=>({index:i,start:p,end:pts[(i+1)%4]}));
const strips=planMiteredPictureFrames(pts,segs,1);
assert.equal(strips.length,4);
const expected=-(.076/2+.75/12);
const front=strips.find(x=>x.edgeIndex===0);
assert.ok(front);
assert.ok(Math.abs(front.corners[0][1]-expected)<1e-6,'outside border extends beyond fascia by 3/4in');
assert.ok(front.corners[0][0]<0,'picture frame at left front corner makes a true miter');
const deck3d=source('src/components/visual3d/ManufacturerDeck3D.tsx');
assert.ok(deck3d.includes('miterSeams.map')&&deck3d.includes('visible-miter-joint-'),
 'Selected corners must reveal miter with clear saw seam');
const {planSideConnectedHeader,trussMountLiftFt}=load('src/lib/renaissanceTrussConnections');
const half=3.875/12/2,spans=planSideConnectedHeader(0,20,[2,18],3.875/12);
assert.equal(spans.length,3);
assert.ok(Math.abs(spans[0].endFt-(2-half))<1e-6);
assert.ok(Math.abs(spans[1].startFt-(2+half))<1e-6);
assert.ok(Math.abs(spans[1].endFt-(18-half))<1e-6);
assert.ok(Math.abs(spans[2].startFt-(18+half))<1e-6);
for(const x of [2,18])assert.ok(spans.every(s=>!(s.startFt<x&&x<s.endFt)),
 'No header segment is allowed to penetrate a vertical column');
for(const family of ['Aria','Fresco']){
 assert.equal(trussMountLiftFt(family,'flush'),0);
 assert.equal(trussMountLiftFt(family,'raised'),.5);
}
assert.equal(trussMountLiftFt('Moderno','raised'),0);
const cover=source('src/components/visual3d/RenaissanceCover3D.tsx');
// Posts still meet the side-clipped header, but their visible upper mesh
// must stop beneath the insulation roof plane, never poke through the
// colored roof (the exact screenshot regression from Nov 24).
assert.ok(cover.includes('planSideConnectedHeader')&&
 cover.includes('renaissanceVisiblePostTopFt({')&&
 cover.includes('headerCrownFt:structuralHeaderCrownY')&&
 cover.includes('renaissance-post-cap-below-roof-underside'));
const {renaissanceRoofPanelUndersideAtPost,renaissanceVisiblePostTopFt}=
 load('src/lib/renaissancePostClearance');
const postIntersection={xFt:5,zFt:11,headerCrownFt:9,roofRearZFt:0,roofFrontZFt:12,
 roofRearCenterFt:10,roofFrontCenterFt:8.8,roofPanelThicknessFt:.25,
 gable:false,midXFt:0,roofWidthFt:16,eaveCenterFt:9,gableRiseFt:0};
// Rendered cap is centered 0.029 ft BELOW the visible post stop and
// is 0.050 ft tall: its upper face is stop-.004, not stop+.025.
const capUpperFaceFt=renaissanceVisiblePostTopFt(postIntersection)-.029+.05/2;
assert.ok(capUpperFaceFt<renaissanceRoofPanelUndersideAtPost(postIntersection),
 'Even the full trim cap must stay UNDER the insulated roof skin');
assert.ok(cover.includes('roofRearY-.24+trussLift')&&cover.includes('roofRearY-.25+trussLift'));
const extrusions=source('src/components/visual3d/RenaissanceExtrusions.tsx');
// Video QA 2026-11-24 (83s, fully transcribed): Aria raised and Fresco
// S-shaped ends were physically separate. A single mesh must run the entire
// roof projection in both raised/flush styles, with the chosen family cut.
assert.ok(cover.includes('RenaissanceContinuousProjectionTruss'),
 'Fresco and Aria use a continuous full-length physical projection truss');
assert.ok(cover.includes("endStyle={accentEnd==='curved'?'fresco-s':'straight'}"));
assert.ok(cover.includes("endStyle={accentEnd==='curved'?'aria-scallop':'straight'}"));
assert.ok(cover.includes('nose={[x,roofFrontY-.24+trussLift,front]}'));
assert.ok(cover.includes('nose={[x,roofFrontY-.25+trussLift,front]}'));
assert.ok(!/accentEnd==='curved'\s*&&\s*<RenaissanceCurvedTrussEnd[\s\S]*?profileStyle="aria-scallop"/.test(cover),
 'Aria must never attach a second detached decorative end mesh');
assert.ok(extrusions.includes("continuous-'+endStyle+'-renaissance-truss")&&
 extrusions.includes("endStyle==='fresco-s'")&&
 extrusions.includes("endStyle==='aria-scallop'"),'Distinct molded ends share a single watertight 3D member');
assert.ok(cover.includes('capStart={i===0')&&cover.includes('capEnd={i===frontHeaderSpans.length-1'),
 'Only exposed ends of side-connected headers receive matching caps');
assert.ok(extrusions.includes('renaissance-exposed-beam-end-cap'));
const ribStart=extrusions.slice(extrusions.indexOf('function outlineWithRibs'),extrusions.indexOf('/** Measured external envelope'));
assert.ok(!ribStart.includes('for(const level of'),
 'Do not invent the four horizontal beam reveal stripes rejected in the video');
const bridge=source('src/lib/estimatingBridge.ts'),store=source('src/lib/consultationProject.ts');
assert.ok(bridge.includes("coverTrussMount:project.coverTrussMount??'flush'")&&bridge.includes('effectivePcaKickPlateIn'));
assert.ok(store.includes("coverTrussMount:'flush'"));
console.log('PASS verified PCA full-panel pet-frame sizes; 3/4in perimeter overhang and visible miters; inside-fascia stringers; side-connected Renaissance headers; distinct raised/flush Aria and Fresco trusses and end profiles');
