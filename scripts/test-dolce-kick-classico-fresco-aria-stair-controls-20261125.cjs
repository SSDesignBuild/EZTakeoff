/* Source-grounded regression for three user-narrated 2026-11-25 videos.
 * Reference artwork inspected: Fresco 2025 manufacturer drawing p4,
 * Aria 2025 manufacturer drawing p3, SD p5. Preserve real known external
 * dimensions, two distinct cheek indentations, full truss/header contact.
 * Undimensioned ornamental tip mold dimensions are NOT factory die CAD. */
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const m={exports:{}};cache.set(full,m);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,
   target:ts.ScriptTarget.ES2020,esModuleInterop:true},
 }).outputText;
 new Function('require','module','exports',js)((name)=>
  name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
  m,m.exports);
 return m.exports;
}
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const f=load('src/lib/renaissanceFactoryProfiles');
for(const [member,widthIn,heightIn]of [['truss',2,6],['header',2.75,7]]){
 const profile=f.renaissanceFormedProfileContour(widthIn/12,heightIn/12,member);
 assert.equal(profile.length,20,'Two paired side notches require 20-point closed profile');
 assert.equal(f.renaissanceFormedProfileGrooveCount(profile,widthIn/12),2,
  'Two distinct physical recessed bands ON EACH cheek: '+member);
 assert.ok(profile.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
 const minX=Math.min(...profile.map(p=>p[0])),maxX=Math.max(...profile.map(p=>p[0]));
 const minY=Math.min(...profile.map(p=>p[1])),maxY=Math.max(...profile.map(p=>p[1]));
 assert.ok(Math.abs(maxX-minX-widthIn/12)<.000001);
 assert.ok(Math.abs(maxY-minY-heightIn/12)<.000001);
 const bands=f.renaissanceFormedGrooveBandsFt(heightIn/12,member);
 assert.equal(bands.length,2);
 assert.ok(bands[1].fromBottomFt>bands[0].toBottomFt,
  'Manufacturer two notches must have unnotched flat fascia between them');
}
const end=load('src/lib/renaissanceTrussSilhouette');
for(const style of ['fresco-s','classico-s','aria-scallop']){
 const samples=Array.from({length:100},(_,i)=>
  end.renaissanceTrussTailDepthFt(10+i*.02,12,.5,style));
 assert.ok(samples.every(d=>Number.isFinite(d)&&d>.015&&d<=.5+.0001),
  'Reference-shaped 2x6 ornamental tip cannot self-overrun real extrusion envelope');
 assert.ok(samples[0]>samples[samples.length-1],
  'Cast nose must transition from full 6in section to its bounded terminal width');
const topTip=end.renaissanceTrussTailTopDropFt(12,12,.5,style);
const bottomTip=end.renaissanceTrussTailLowerDropFt(12,12,.5,style);
assert.equal(topTip,0,'Installed top edge follows the roof datum through the ogee end cut');
assert.ok(bottomTip>.015&&bottomTip<.04,'Photo-derived thin ogee nose must not turn down into a deep hanging lobe');
// A user-rejected random/finicky S cannot have flat kinks at control
// stations. Both visible boundaries must remain smooth (C1) across every
// manufacturer-traced reference station, including the reversed lower S.
const spec=end.RENAISSANCE_END_REFERENCE[style],tailFt=spec.tailIn/12;
const fullLengthFt=12,tailStart=fullLengthFt-tailFt,step=.00001;
for(const [u]of spec.samples.slice(1,-1)){
 const station=tailStart+u*tailFt;
 for(const boundary of [
   end.renaissanceTrussTailTopDropFt,
   end.renaissanceTrussTailLowerDropFt,
 ]){
  const left=(boundary(station,fullLengthFt,.5,style)-
    boundary(station-step,fullLengthFt,.5,style))/step;
  const right=(boundary(station+step,fullLengthFt,.5,style)-
    boundary(station,fullLengthFt,.5,style))/step;
  assert.ok(Math.abs(left-right)<.03,
   'Factory cap visual contours must be tangent-continuous, never stop/start in jagged steps at S control stations: '+style+' u='+u);
 }
}
 const body=end.renaissanceTrussTailDepthFt(3,12,.5,style);
 assert.equal(body,.5,'Actual body remains full-depth 6-inch aluminum');
}
const classicoSource=read('src/components/visual3d/RenaissanceCover3D.tsx');
const classicoStart=classicoSource.indexOf("{product.family==='full-trusses'&&");
const classicoEnd=classicoSource.indexOf('{isTranslucent&&<group',classicoStart);
const classico=classicoSource.slice(classicoStart,classicoEnd);
assert.ok(classico.includes('<RenaissanceContinuousProjectionTruss'));
assert.ok(classico.includes("?'classico-s':'straight'"));
assert.ok(classico.includes('nose={[x,yFront-drop,front]}'));
assert.ok(classico.includes('rear={[x,yBack-drop,roofBackEdge]}'));
assert.ok(!classico.includes('<RenaissanceCurvedTrussEnd'));
assert.ok(!classico.includes('lapEnd=')&&!classico.includes('frameFront-.27'),
 'Classico must NEVER stop the truss 3+ inches before the header or attach a floating S');
assert.ok(classicoSource.includes('endStyle={accentEnd===\'curved\'?\'fresco-s\':\'straight\'}'));
assert.ok(classicoSource.includes('endStyle={accentEnd===\'curved\'?\'aria-scallop\':\'straight\'}'));
const sectionSource=read('src/components/visual3d/RenaissanceExtrusions.tsx');
assert.ok(sectionSource.includes("outlineWithRibs(w,h,t,'header')"));
assert.ok(sectionSource.includes('renaissanceFormedProfileContour('));
assert.ok(sectionSource.includes('makeContinuousFormedTrussGeometry(length,width,height,rise,endStyle,availableTailFt)'));
assert.ok(sectionSource.includes('buildRenaissanceTrussCutMesh'));
assert.ok(!sectionSource.includes('s.bezierCurveTo('),
 'No ad hoc S-shaped THREE.Path Bézier control points in factory truss');
assert.ok(end.renaissanceTrussContactOverlapFt({
 beamTopFt:9,beamBottomFt:9-7/12,
 trussTopFt:9-.125,trussBottomFt:9-.125-.5,
})>.3,'2x6 full-depth Classico truss must physically overlap 7in beam');
const dolce=load('src/lib/renaissanceDetailGeometry');
const kick=dolce.planDolceScreenProfile({
 from:[0,0],to:[12,0],bottomFt:.12,topFromFt:9,topToFt:8.5,
 openView:false,screenBottomOffsetFt:2,interiorUprights:2,
});
assert.ok(kick);
assert.equal(kick.screenBottomOffsetFt,2);
assert.equal(kick.screenContour[0].riseFt,2);
assert.equal(kick.screenContour[1].riseFt,2);
assert.ok(kick.screenContour[2].riseFt>2);
assert.ok(kick.screenAreaFt2<(9-.12)*12);
const screensOnly=dolce.planDolceScreenProfile({
 from:[0,0],to:[12,0],bottomFt:.12,topFromFt:9,topToFt:8.5,
 openView:false,interiorUprights:2,
});
assert.ok(screensOnly);
assert.equal(screensOnly.screenContour[0].riseFt,0);
assert.ok(screensOnly.screenAreaFt2>kick.screenAreaFt2);
assert.equal(dolce.showDolceStandardIntermediateRail(false,'integrated-kick'),false);
const screenSource=classicoSource.slice(classicoSource.indexOf('function DolceScreenRun('),
 classicoSource.indexOf('type DolceTreatment='));
assert.ok(screenSource.includes('screenBottomOffsetFt:treatment===\'integrated-kick\'?2:0'));
assert.ok(screenSource.includes('profile.screenContour.forEach'));
assert.ok(screenSource.includes('dolce-screen-mesh-stops-at-chair-rail-above-kick'));
assert.ok(screenSource.includes('height={bottom+2}'));
assert.ok(!screenSource.includes('profile.contour.forEach'));
const {buildDeckModel}=load('src/lib/deckModel');
const {SERVICES}=load('src/data/services');
const defaults=SERVICES.find(p=>p.slug==='decks').defaults;
const base={...defaults,deckHeight:5,stairCount:1,stairEdgeIndex:2,
 stairOffset:1,stairWidth:4,stairRailingLeft:true,stairRailingRight:false,
 additionalStairs:JSON.stringify([
  {edgeIndex:1,offset:1,width:3,left:false,right:true},
 ])};
const model=buildDeckModel(base);
assert.equal(model.stairPlacements.length,2,'Actual positioned stair flights');
assert.equal(model.stairRailSideCount,2,
 'Takeoff must count one chosen side per individual stair flight');
assert.equal(model.stairPlacements[0].left,true);
assert.equal(model.stairPlacements[0].right,false);
assert.equal(model.stairPlacements[1].left,false);
assert.equal(model.stairPlacements[1].right,true);
const center=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
const rails=load('src/lib/stairRailVisualGeometry').planStairRailingRuns(model,center,5);
assert.equal(rails.length,2);
assert.deepEqual(rails.map(r=>r.placementIndex+'-'+r.side).sort(),
 ['0-left','1-right']);
const noRails=buildDeckModel({...base,stairRailingLeft:false,
 additionalStairs:JSON.stringify([{edgeIndex:1,offset:1,width:3,left:false,right:false}])});
assert.equal(noRails.stairRailSideCount,0);
assert.equal(load('src/lib/stairRailVisualGeometry')
 .planStairRailingRuns(noRails,center,5).length,0);
assert.ok(model.railingRun>=2*model.stairRunFt-1e-6,
 'Handrail footage must include every selected independent stair side');
const studio=read('src/components/ConsultationVisualPickers.tsx');
assert.ok(studio.includes('Stair railing — installed sides'));
assert.ok(studio.includes('Both sides · chosen deck railing'));
assert.ok(studio.includes('No stair railing · verify code/egress'));
const designer=read('src/components/DeckDesigner.tsx');
assert.ok(designer.includes('Main stair left railing')&&
 designer.includes('Main stair right railing')&&
 designer.includes("aria-label={'Stair '+(index+2)+' left railing'}"));
const renderer=read('src/components/visual3d/ManufacturerRailing3D.tsx');
assert.ok(renderer.includes('<ManufacturerStairRailing3D'));
console.log('PASS kick mesh clips at chair rail, two factory cheek grooves, one Classico header-connected truss, bounded Fresco/Aria cast noses and independently counted stair rail inputs/3D');
