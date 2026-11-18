/* Geometry parity regression: 3D cannot silently diverge from material planning. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);
  if(!fs.existsSync(full))full+='.ts';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,
  }}).outputText;
  new Function('require','module','exports',js)((name)=>
    name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),
    mod,mod.exports);
  return mod.exports;
}
const {DECK_BOARD_FACE_FT,DECK_GAP_FT,boardStockSegments,buildDeckModel}=load('src/lib/deckModel');
const {surfaceStrips,VISIBLE_BOARD_GAP_FT,VISIBLE_BOARD_WIDTH_FT}=load('src/lib/visualGeometry');
const {rimPlyCenterlines,actualPostWidthFt}=load('src/lib/visualStructure');
const {makeConsultationProject}=load('src/lib/consultationProject');
const basic=makeConsultationProject('design-accuracy').values;
const points=(pairs)=>JSON.stringify(pairs.map(([x,y])=>({x,y})));
const shape=(pairs,extras={})=>buildDeckModel({
  ...basic,deckShape:points(pairs),boardRun:'width',...extras,
});
assert.equal(VISIBLE_BOARD_WIDTH_FT,DECK_BOARD_FACE_FT);
assert.equal(VISIBLE_BOARD_GAP_FT,DECK_GAP_FT);
assert.equal(VISIBLE_BOARD_WIDTH_FT,5.5/12);
assert.equal(VISIBLE_BOARD_GAP_FT,1/8/12);
const regular=shape([[0,0],[16,0],[16,12],[0,12]]);
const rows=surfaceStrips(regular);
assert.ok(rows.length>=20);
const distinct=[...new Map(rows.map(s=>[s.row,s])).values()];
assert.ok(Math.abs(distinct[1].z-distinct[0].z-(DECK_BOARD_FACE_FT+DECK_GAP_FT))<1e-8);
for(const s of rows)assert.ok(s.lengthFt>0&&s.lengthFt<=20.00001);
const long=shape([[0,0],[44,0],[44,12],[0,12]]);
const longPieces=surfaceStrips(long).filter(s=>s.row===0);
assert.equal(longPieces.length,3,'44-ft rows must show actual 20+20+offcut joints');
assert.ok(longPieces.every(s=>s.lengthFt<=20));
assert.deepEqual(boardStockSegments(44),[20,20,4]);
const breaker=shape([[0,0],[18,0],[18,12],[0,12]],{breakerBoardCount:1});
const breakerPieces=surfaceStrips(breaker).filter(s=>s.row===0);
assert.equal(breakerPieces.length,2,'Existing breaker station must split every rendered board');
assert.ok(breakerPieces[0].endFt<breakerPieces[1].startFt);
assert.ok(surfaceStrips({points:[],boardRun:'width',minX:0,maxX:5,minY:0,maxY:5}).length===0);
assert.ok(surfaceStrips(regular,0).length===0);

function insideOrBorder(polygon,x,y){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy);
    if(t>=0&&t<=1&&Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<.0001)return true;
    if(((b.y>y)!==(a.y>y))&&(x<(a.x-b.x)*(y-b.y)/(a.y-b.y)+b.x))inside=!inside;
  }
  return inside;
}
for(const layout of [
  [[0,0],[18,0],[18,6],[10,6],[10,12],[0,12]],
  [[0,0],[16,0],[15,12],[0,12]],
  [[0,0],[6,0],[6,4],[14,4],[14,14],[0,14]],
]){
  for(const run of ['width','projection']){
    const model=shape(layout,{boardRun:run});
    for(const s of surfaceStrips(model)){
      const corners=s.axis==='x'?
        [[s.startFt,s.z-s.widthFt/2],[s.endFt,s.z-s.widthFt/2],
        [s.startFt,s.z+s.widthFt/2],[s.endFt,s.z+s.widthFt/2]]:
        [[s.x-s.widthFt/2,s.startFt],[s.x+s.widthFt/2,s.startFt],
        [s.x-s.widthFt/2,s.endFt],[s.x+s.widthFt/2,s.endFt]];
      for(const [x,y] of corners)assert.ok(insideOrBorder(model.points,x,y),
        '3D plank corner escaped footprint: '+JSON.stringify({x,y,layout,run,s}));
    }
  }
}
const rectangle=regular.points,edge=regular.edgeSegments[0];
const plies=rimPlyCenterlines(rectangle,edge);
assert.equal(plies.length,2);
const separation=Math.hypot(plies[1].start.x-plies[0].start.x,plies[1].start.y-plies[0].start.y);
assert.ok(Math.abs(separation-1.5/12)<1e-7,'Rim must have TWO distinct 1.5-in members');
for(const ply of plies)assert.ok(insideOrBorder(rectangle,ply.start.x+0.01,ply.start.y+0.01));
const reverse=shape([[0,0],[0,12],[16,12],[16,0]]);
const reversed=rimPlyCenterlines(reverse.points,reverse.edgeSegments[0]);
assert.equal(reversed.length,2);
assert.ok(reversed[0].start.x>0,'CW winding must inset toward the deck interior');
assert.equal(actualPostWidthFt('6x6'),5.5/12);
assert.equal(actualPostWidthFt('8x8'),7.5/12);
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const structure=read('src/components/visual3d/DeckStructure3D.tsx');
assert.ok(structure.includes('rimPlyCenterlines(model.points,edge)'));
assert.ok(structure.includes('actualPostWidthFt(model.postSize)'));
const skirt=read('src/components/visual3d/DeckSkirting3D.tsx');
assert.ok(skirt.includes("lowerTier?'lower':''"),'Lower-tier skirting must use LOWER settings');
assert.ok(skirt.includes('SlopedBeam')&&skirt.includes('grade(rail.start)'),'Ground rails must track surveyed grade');
const scene=read('src/components/Consultation3D.tsx');
assert.ok(scene.includes('covered={false} lowerTier'),'Lower geometry must be marked as lower-tier');
console.log('PASS deck board layout parity, 20ft seams, breaker cuts, L/angled polygon corners, double-rim plies, dressed posts and lower-tier graded skirting');
