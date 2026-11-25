/* Regression for the full Nov 25 deck recording: physical miter gaps, missing
 * field-board rips, accidental near-axis beam and independent fascia finish. */
const assert=require('node:assert/strict'),fs=require('node:fs'),
  path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
  }}).outputText;
  new Function('require','module','exports',code)((name)=>name.startsWith('.')?
    load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
  return mod.exports;
}
const {buildDeckModel,buildLowerTierDeckModel,DECK_GAP_FT}=load('src/lib/deckModel');
const {surfaceStrips}=load('src/lib/visualGeometry');
const {planMiteredPictureFrames,planVisiblePictureFrameMiterSeams,
  openPictureFrameMiterGaps}=load('src/lib/deckMiterGeometry');
const {deckPlanToScene,deckFaceArea,subtractDeckFace,mergeDeckFaces}=load('src/lib/deckSurfaceClipping');
const {calculateEstimate}=load('src/lib/estimate');
const close=(actual,expected,tol=1e-7)=>assert.ok(Math.abs(actual-expected)<=tol,
  `Expected ${expected}; got ${actual}`);
const rect=[[0,0],[16,0],[16,12],[0,12]].map(([x,y])=>({x,y}));
const make=(points,extra={})=>buildDeckModel({deckShape:JSON.stringify(points),
  attachment:'freestanding',pictureFrameCount:1,deckingType:'composite',
  deckHeight:3,stairCount:0,...extra});

const notchedPlank=mergeDeckFaces([
  [[0,0],[2,0],[2,1],[0,1]],[[0,1],[1,1],[1,2],[0,2]],
]);
assert.equal(notchedPlank.length,1,'A notched physical plank must not acquire a diagonal partition seam');
assert.equal(notchedPlank[0].length,6);close(deckFaceArea(notchedPlank[0]),3);
assert.equal(mergeDeckFaces([
  [[0,0],[2,0],[2,1],[0,1]],[[0,1.01],[1,1.01],[1,2],[0,2]],
]).length,2,'A real installation gap must never be stitched closed');

// The discarded row in the recording was partly occupied by the parallel
// picture frame. Its remaining width must be installed as a ripped board.
for(const boardRun of ['width','projection'])for(const count of [1,2,3]){
  const model=make(rect,{boardRun,pictureFrameCount:count});
  const frames=planMiteredPictureFrames(model.points,model.pictureFrameSegments,count);
  const strips=surfaceStrips(model);
  const runX=boardRun==='width',fieldEnd=(runX?12:16)+(.076/2+.75/12)
    -(count*(5.5/12)+(count-1)*DECK_GAP_FT)-DECK_GAP_FT;
  const midRun=runX?8:6;
  const across= strips.filter(p=>p.startFt<=midRun&&p.endFt>=midRun);
  const installedEnd=Math.max(...across.map(p=>(runX?p.z:p.x)+p.widthFt/2));
  close(installedEnd,fieldEnd);
  assert.ok(across.some(p=>p.widthFt<5.5/12-1e-5),
    'A partial-width field board must remain next to the parallel border');
  for(const p of strips){
    assert.ok(p.lengthFt>0&&p.lengthFt<20);
    const shape=p.outline??(p.axis==='x'
      ?[[p.startFt,p.z-p.widthFt/2],[p.endFt,p.z-p.widthFt/2],
        [p.endFt,p.z+p.widthFt/2],[p.startFt,p.z+p.widthFt/2]]
      :[[p.x-p.widthFt/2,p.startFt],[p.x+p.widthFt/2,p.startFt],
        [p.x+p.widthFt/2,p.endFt],[p.x-p.widthFt/2,p.endFt]]);
    for(const frame of frames){
      const kept=mergeDeckFaces(subtractDeckFace(shape,frame.corners));
      close(kept.reduce((sum,poly)=>sum+deckFaceArea(poly),0),deckFaceArea(shape),1e-6);
    }
  }
}

// Seam transforms must follow the actual boards in either draw direction,
// including translated/notched footprints; the previous Z reflection failed.
const stepped=[[9.9166667,3],[22.4166667,3],[22.4166667,10.9166667],
  [24.1666667,10.9166667],[24.1666667,22.9166667],[8.1666667,22.9166667],
  [8.1666667,10.8333333],[10,10.8333333]].map(([x,y])=>({x,y}));
for(const points of [rect,stepped,[...stepped].reverse(),
  stepped.map(p=>({x:p.x-40,y:p.y+17}))]){
  const model=make(points),center=[(model.minX+model.maxX)/2,(model.minY+model.maxY)/2];
  const frames=planMiteredPictureFrames(points,model.pictureFrameSegments,2);
  const seams=planVisiblePictureFrameMiterSeams(points,model.pictureFrameSegments,2,[],true);
  const cut=openPictureFrameMiterGaps(frames,seams);
  assert.equal(seams.length,points.length*2);
  for(const seam of seams){
    const nominal=frames.find(p=>p.edgeIndex===seam.edgeIndex&&p.course===seam.course);
    const actual=cut.find(p=>p.edgeIndex===seam.edgeIndex&&p.course===seam.course);
    assert.deepEqual(seam.from,nominal.corners[1]);
    assert.deepEqual(seam.to,nominal.corners[2]);
    for(const point of [seam.from,seam.to]){
      const mapped=deckPlanToScene(point,center);
      close(mapped[0]+center[0],point[0]);close(mapped[1]+center[1],point[1]);
    }
    const dx=seam.to[0]-seam.from[0],dy=seam.to[1]-seam.from[1],len=Math.hypot(dx,dy);
    const distance=p=>Math.abs(dx*(p[1]-seam.from[1])-dy*(p[0]-seam.from[0]))/len;
    close(distance(actual.corners[1]),DECK_GAP_FT/2);
    close(distance(actual.corners[2]),DECK_GAP_FT/2);
  }
}

// No fabricated longitudinal support for a one-inch skew in an otherwise
// orthogonal deck. Preserve the exact footprint and legitimate diagonals.
const skew=make(stepped,{attachment:'brick',houseEdgeIndices:'[1]'});
assert.equal(skew.angledBeamLines.length,0);
assert.deepEqual(skew.points,stepped);
assert.equal(skew.beamSegmentsCount,skew.beamLines.reduce((n,b)=>n+b.segments.length*2,0));
for(const points of [
  [[0,0],[16,0],[16,8],[12,12],[0,12]],
  [[0,12],[12,12],[16,8],[16,0],[0,0]],
]){
  const diagonal=make(points.map(([x,y])=>({x,y})));
  assert.equal(diagonal.angledBeamLines.length,1,'Real 45-degree return retains its support');
  const beam=diagonal.angledBeamLines[0];
  assert.ok(beam.length>4&&beam.postPoints.length>=2);
}

// E2 in the recording is marked HOUSE. Finishing its rim must be independent
// of whether that edge supplies a ledger or suppresses an exterior guard.
const values={deckShape:JSON.stringify(stepped),attachment:'brick',
  houseEdgeIndices:'[1]',deckingType:'composite',deckHeight:3,stairCount:0};
const exposed=buildDeckModel(values),finished=buildDeckModel({...values,fasciaHouseSide:true});
assert.equal(exposed.fasciaSegments.length,stepped.length-1);
assert.equal(finished.fasciaSegments.length,stepped.length);
assert.deepEqual(finished.houseEdgeIndices,exposed.houseEdgeIndices);
assert.deepEqual(finished.railCoverage,exposed.railCoverage);
assert.deepEqual(finished.beamLines,exposed.beamLines);
close(finished.fasciaLf-exposed.fasciaLf,finished.houseContactLength,.011);
const fasciaCount=flags=>calculateEstimate('decks',{...values,
  deckShape:JSON.stringify(rect),houseEdgeIndices:'[0]',...flags}).materials
  .filter(m=>m.name==='Fascia board').reduce((sum,m)=>sum+m.quantity,0);
assert.ok(fasciaCount({fasciaHouseSide:true})>fasciaCount({fasciaHouseSide:false}));

// Flight identity survives a disabled main stair and skipped invalid extra;
// lower flight guards must not depend on a material-customization checkbox.
const placements=make(rect,{stairCount:1,stairEdgeIndex:-1,
  additionalStairs:JSON.stringify([{edgeIndex:99,width:4,offset:0},
    {edgeIndex:2,width:4,offset:3}])}).stairPlacements;
assert.equal(placements.length,1);assert.equal(placements[0].sourceIndex,2);
const lower=buildLowerTierDeckModel({deckShape:JSON.stringify(rect),multiTierEnabled:true,
  lowerDeckShape:JSON.stringify(rect),deckHeight:3,lowerDeckHeight:2,
  lowerUseCustomSettings:false,stairCount:1,lowerStairEdgeIndex:2,
  stairRailingLeft:true,stairRailingRight:true,lowerStairRailingLeft:false,
  lowerStairRailingRight:true});
assert.equal(lower.stairRailingLeft,false);assert.equal(lower.stairRailSideCount,1);
console.log('PASS actual miter gaps/transforms, all partial-width field boards, near-axis beam exclusion, fascia geometry/order parity and stable stair identities');
