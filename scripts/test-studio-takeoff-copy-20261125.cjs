const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){let full=path.resolve(root,file);if(!fs.existsSync(full))full+='.ts';if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));if(cache.has(full))return cache.get(full).exports;const mod={exports:{}};cache.set(full,mod);const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name))):require(name),mod,mod.exports);return mod.exports;}
const bridge=load('src/lib/consultationTakeoffBridge'),projects=load('src/lib/consultationProject');
const rect=(x,y,w,d)=>[{x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d}];
const p=projects.makeConsultationProject('studio-source');p.title='Exact current design';p.revision=17;
p.client={name:'Fixture customer',address:'Fixture address',phone:'Fixture phone',email:'fixture@example.invalid'};
p.photoPresent=true;p.calibration={scale:1.1,offsetX:4,offsetY:-3,rotationDeg:2};
p.values={...p.values,deckShape:JSON.stringify(rect(0,0,16,12)),stairCount:1,stairEdgeIndex:1,
 stairWidth:4,stairRailingLeft:false,stairRailingRight:true,lightingPostFixture:'tt-small-accent',
 siteConcreteAreas:JSON.stringify([{id:'patio',name:'Patio',points:rect(-12,3,8,10),thicknessIn:4,elevationFt:.055,
 stampId:'sikastamp-new-brick-herringbone',colorId:'sikacolor-200-a53',borderStampId:'sikastamp-4-x-4-granite-border-3-row',borderWidthIn:12}])};
const original=JSON.stringify(p),admin=JSON.stringify({poJobName:'Existing unsaved Admin job',deckWidth:47});
const data=new Map([['sns-takeoff:decks',admin],['sns-consultation-projects-v1',JSON.stringify([p])],['photo-reference','unchanged']]);
const store={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const first=bridge.openConsultationInTakeoff(p,store),second=bridge.openConsultationInTakeoff(p,store);
assert.notEqual(first.id,second.id,'Each open creates an independent copy, preserving any prior edited copy');
assert.equal(first.returnHref,'/consultation/studio-source?stage=render');
assert.equal(first.href,'/service/decks?studioTakeoff='+first.id);
const snapshot=bridge.readConsultationTakeoff(first.id,store);assert.equal(snapshot.sourceRevision,17);
assert.deepEqual(snapshot.project.calibration,p.calibration);assert.equal(snapshot.project.photoPresent,true);
assert.equal(snapshot.values.jobAddress,p.client.address);assert.equal(snapshot.values.customerPhone,p.client.phone);
assert.equal(snapshot.values.customerEmail,p.client.email);assert.ok(snapshot.values.poJobName.includes(p.client.name));
assert.equal(snapshot.values.deckShape,p.values.deckShape);assert.equal(snapshot.values.siteConcreteAreas,p.values.siteConcreteAreas);
const estimate=bridge.consultationTakeoffEstimate(snapshot,snapshot.values);
assert.ok(estimate.orderNotes.some(note=>note.includes('Field decking uses available 16 and 20 ft board lengths')));
assert.ok(!estimate.orderNotes.some(note=>/Field decking.*8, 12/.test(note)));
const calculate=load('src/lib/estimate').calculateEstimate;
const woodEstimate=calculate('decks',{...snapshot.values,deckingType:'pressure-treated',deckingMaterial:'Pressure treated 5/4x6'});
assert.ok(woodEstimate.orderNotes.some(note=>note.includes('Field decking uses available 8, 12, 16 and 20 ft board lengths')));
assert.ok(estimate.materials.some(item=>item.name==='Concrete — drawn site areas'));
assert.ok(estimate.materials.some(item=>item.name.startsWith('SikaStamp field')));
assert.ok(estimate.materials.some(item=>item.name.startsWith('SikaStamp border')));
assert.ok(estimate.materials.some(item=>/small accent/i.test(item.name)),'Studio lighting follows the same takeoff copy');
const updated=bridge.saveConsultationTakeoffValues(snapshot,{...snapshot.values,poJobName:'Edited Admin copy'},store);
assert.equal(updated.copyRevision,2);assert.equal(bridge.readConsultationTakeoff(first.id,store).values.poJobName,'Edited Admin copy');
assert.equal(bridge.readConsultationTakeoff(second.id,store).values.poJobName,snapshot.values.poJobName);
assert.equal(data.get('sns-takeoff:decks'),admin,'Existing Admin draft is byte-for-byte untouched');
assert.equal(data.get('sns-consultation-projects-v1'),JSON.stringify([p]));assert.equal(JSON.stringify(p),original);
assert.equal(data.get('photo-reference'),'unchanged');
assert.equal(bridge.readConsultationTakeoff('missing',store),null);assert.equal(bridge.readConsultationTakeoff('../sns-takeoff:decks',store),null);
assert.throws(()=>bridge.openConsultationInTakeoff(p,{getItem:()=>null,setItem:()=>{throw Error('QuotaExceeded');}}),/QuotaExceeded/);
// Saved design data travels intact, including independent finishes, lower tier,
// detailed geometry edits and the cover/enclosure fields outside values.
const detailed=JSON.parse(original);
detailed.coverFamily='Moderno';detailed.coverScreenStyle='elite-add-a-room';
detailed.coverColor='bronze';detailed.coverScreenColor='white';detailed.coverCeilingColor='hickory';
detailed.coverWidthFt=16;detailed.coverProjectionFt=12;
detailed.values={...detailed.values,pictureFrameCount:3,breakerBoardCount:3,
 pictureFrameMaterial:'Frame course 1',pictureFrameMaterial2:'Frame course 2',pictureFrameMaterial3:'Frame course 3',
 breakerBoardMaterial:'Breaker 1',breakerBoardMaterial2:'Breaker 2',breakerBoardMaterial3:'Breaker 3',
 multiTierEnabled:true,lowerDeckShape:JSON.stringify(rect(4,12,8,6)),
 skirtingEnabled:true,skirtingMaterial:'TimberTech PVC',customBeamYs:'[2,10]',
 additionalStairs:JSON.stringify([{edgeIndex:2,offset:2,width:4,railingLeft:true,railingRight:false}]),
 lightingCanCount:6,lightingFanCount:1};
const detailedCopy=bridge.readConsultationTakeoff(bridge.openConsultationInTakeoff(detailed,store).id,store);
for(const [key,value] of Object.entries(detailed.values))assert.equal(detailedCopy.values[key],value,'Takeoff preserves '+key);
assert.deepEqual(detailedCopy.project,{...detailed,estimatingResponse:null},'Takeoff keeps the complete cover/enclosure/geometry context');

const concrete=load('src/lib/siteConcrete'),layout=load('src/lib/siteConcretePlanLayout');
const measured=(text,size,bold=false)=>text.length*size*(bold?.62:.56);
const layoutAreas=concrete.planSiteConcrete({siteConcreteAreas:JSON.stringify(Array.from({length:9},(_,i)=>({
 id:'slab-'+i,name:'Slab '+i+' with a complete customer requested location and an unabridged finish schedule',
 points:rect(i%3*1.25,Math.floor(i/3)*1.25,1,1),thicknessIn:4,elevationFt:i*.05,
 stampId:'sikastamp-new-brick-herringbone',colorId:'sikacolor-200-a53',
 borderStampId:'sikastamp-4-x-4-granite-border-3-row',borderWidthIn:2,
}))) }).areas;
assert.equal(layoutAreas.length,9);
const bounds={x:0,y:0,width:1280,height:640};
const callouts=layout.concretePlanAnnotations(layoutAreas,p=>({x:600+p.x*15,y:280+p.y*15}),bounds,measured);
const boxes=callouts.flatMap(callout=>[callout.box,...callout.dimensions.map(dimension=>dimension.box)]);
for(let i=0;i<boxes.length;i++){
 const box=boxes[i];assert.ok(box.x>=bounds.x&&box.y>=bounds.y&&box.x+box.width<=bounds.width&&box.y+box.height<=bounds.height);
 for(let j=i+1;j<boxes.length;j++)assert.ok(!layout.concretePlanBoxesOverlap(box,boxes[j]),'Crowded slab labels and dimensions must not collide');
}
// A group at the far edge can exhaust the local ring search. All 100 supported
// slabs still receive a distinct visible callout inside the fixed sheet.
const denseAreas=Array.from({length:100},(_,i)=>({...layoutAreas[0],id:'dense-'+i,
 points:rect(i%10*1.05,Math.floor(i/10)*1.05,1,1)}));
const dense=layout.concretePlanAnnotations(denseAreas,p=>({x:1240+p.x*.08,y:615+p.y*.08}),bounds,measured);
assert.equal(dense.length,100);
for(let i=0;i<dense.length;i++){
 const box=dense[i].box;
 assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=bounds.width&&box.y+box.height<=bounds.height);
 for(let j=i+1;j<dense.length;j++)assert.ok(!layout.concretePlanBoxesOverlap(box,dense[j].box),'Far-edge callout search never falls back onto occupied text');
}
const unusual=[{...layoutAreas[0],id:'concave',points:[{x:0,y:0},{x:12,y:0},{x:12,y:3},{x:5,y:3},{x:5,y:9},{x:0,y:9}]},
 {...layoutAreas[0],id:'clockwise',points:rect(15,2,7,8).reverse()},
 {...layoutAreas[0],id:'remote',points:rect(36,4,4,3)}];
const unusualLabels=layout.concretePlanAnnotations(unusual,p=>({x:110+p.x*26,y:110+p.y*26}),bounds,measured);
assert.ok(unusualLabels.every(callout=>callout.dimensions.length>0),'Concave, clockwise and detached slabs retain readable dimensions');
const unusualBoxes=unusualLabels.flatMap(callout=>[callout.box,...callout.dimensions.map(d=>d.box)]);
for(let i=0;i<unusualBoxes.length;i++)for(let j=i+1;j<unusualBoxes.length;j++)
 assert.ok(!layout.concretePlanBoxesOverlap(unusualBoxes[i],unusualBoxes[j]),'Opposite winding and diagonal text bounds share one collision model');
const schedule=layout.concreteSchedulePages(layoutAreas,measured);
assert.ok(schedule.length>=3,'Nine slabs retain measured schedule pagination');
const scheduleText=schedule.flatMap(page=>page.rows.flatMap(row=>row.lines.map(line=>line.text))).join(' ');
for(const area of layoutAreas){
 assert.ok(scheduleText.includes(area.name),'Schedule never truncates a slab name');
 assert.ok(scheduleText.includes(area.finish.stampName)&&scheduleText.includes(area.finish.colorName));
}
assert.ok(scheduleText.includes('Edge lengths in saved vertex order (ft): 1.00 · 1.00 · 1.00 · 1.00'));
const enormousName=Array.from({length:900},(_,i)=>'location'+i).join(' ');
const overflowSchedule=layout.concreteSchedulePages([{...layoutAreas[0],name:enormousName}],measured);
assert.ok(overflowSchedule.length>1,'Exceptionally long slab descriptions continue without clipping');
assert.ok(overflowSchedule[1].rows[0].continued);
const overflowText=overflowSchedule.flatMap(page=>page.rows.flatMap(row=>row.lines.map(line=>line.text))).join(' ').split(/\s+/);
for(let i=0;i<900;i++)assert.ok(overflowText.includes('location'+i));
for(const page of [...schedule,...overflowSchedule]){
 assert.ok(page.height<=700);
 for(const row of page.rows)for(const line of row.lines){
  assert.ok(row.y+line.y<=page.height&&line.y<=row.height);
  assert.ok(measured(line.text,line.size,line.bold)<=940,'Schedule text stays clear of the slab section column');
 }
}
console.log('PASS concrete callout collision avoidance, complete edge schedule, nine-slab pagination and oversized-name continuation');
const print=load('src/lib/materialExport');
const exporterForTitles=load('src/lib/export');
const identifier='https://manufacturer.example.invalid/a-very-long-product-code-without-whitespace/technical-reference.pdf';
const wrapped=print.wrapMaterialExportText(identifier,80,text=>text.length*7);
assert.equal(wrapped.join(''),identifier,'Long source URLs remain complete instead of escaping their cells');
assert.ok(wrapped.every(line=>line.length*7<=80));
const wideTitle='WWWWWWW'.repeat(45)+' 🏠 Finishes North Terrace / Client Full Drawing Name';
const titleMeasure=text=>Array.from(text).reduce((width,char)=>width+(char==='W'?23:11),0);
const wrappedTitle=exporterForTitles.wrapDrawingExportTitle(wideTitle,612,22,titleMeasure);
assert.ok(wrappedTitle.every(line=>titleMeasure(line)<=556),'Drawing titles wrap to measured glyph width, including wide unbroken words');
assert.equal(wrappedTitle.join('').replace(/\s/g,''),wideTitle.replace(/\s/g,''),'Drawing title retains every code point without ellipsis');
const unicodeIdentifier='🏠'.repeat(80),unicodeLines=print.wrapMaterialExportText(unicodeIdentifier,80,text=>Array.from(text).length*16);
assert.equal(unicodeLines.join(''),unicodeIdentifier);
assert.ok(unicodeLines.every(line=>!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(line)),'Wrapping never splits a Unicode surrogate pair');
assert.equal(print.materialExportQuantity(32/27*1.05),'1.244');
const priorDocument=global.document;
global.document={createElement:()=>{const canvas={width:0,height:0,drawn:[]};const context={font:'16px Arial',
 measureText(text){const size=Number(this.font.match(/(\d+)px/)[1]);return {width:Array.from(String(text)).reduce((sum,char)=>sum+size*(char==='W'?.9:.6),0)};},
 fillText(text,x,y){canvas.drawn.push({text:String(text),x,y,width:this.measureText(text).width});},
 fillRect(){},strokeRect(){},drawImage(){}};canvas.getContext=()=>context;return canvas;}};
const longNotes=Array.from({length:900},(_,i)=>'note'+i).join(' ');
const scopeNotes=['Studio source revision 17. This editable Admin copy does not update the original Studio design.',
 'The deck sheets do not include a manufacturer roof fabrication drawing.',
 Array.from({length:1200},(_,i)=>'scope'+i).join(' ')];
const pages=print.renderMaterialExportPages('Fixture material list',{poJobName:'A complete customer project name'}, {
 'Site concrete':[{name:'Concrete — drawn site areas',quantity:32/27*1.05,unit:'cu yd',stockRecommendation:'Ready mix',notes:'Measured drawn polygon volume'}],
 'Site decorative finishes':[{name:'SikaStamp field finish — New Brick Herringbone',quantity:24,unit:'sq ft',stockRecommendation:'Installer finish work',notes:longNotes}],
},scopeNotes);
const longJob=Array.from({length:1600},(_,i)=>'jobName'+i).join(' '),longAddress='W'.repeat(700);
const headerPages=print.renderMaterialExportPages(wideTitle,{poJobName:longJob,jobAddress:longAddress},{
 'Materials':[{name:'Final material after full job metadata',quantity:1,unit:'ea',notes:'Verify remaining space'}],
});
global.document=priorDocument;
assert.ok(pages.length>1,'Exceptionally long rows continue onto measured pages');
const printed=pages.flatMap(page=>page.drawn.map(line=>line.text));
for(let i=0;i<900;i++)assert.ok(printed.join(' ').split(/\s+/).includes('note'+i),'Export preserves every note token');
assert.ok(printed.includes('1.244'));assert.ok(printed.join(' ').includes('SikaStamp field finish — New Brick Herringbone'));
assert.ok(printed.some(text=>text.includes('(continued)')));
assert.ok(printed.includes('Order notes & scope'));
assert.ok(printed.includes('Order notes & scope (continued)'));
assert.ok(printed.join(' ').includes('The deck sheets do not include a manufacturer roof fabrication drawing.'));
for(let i=0;i<1200;i++)assert.ok(printed.join(' ').split(/\s+/).includes('scope'+i),'Export preserves every scope note token');
assert.ok(printed.every(text=>!text.includes('…')),'Material names and quantities are never ellipsized');
const headerText=headerPages.flatMap(page=>page.drawn.map(line=>line.text)).join(' ');
for(let i=0;i<1600;i++)assert.equal(headerText.split(/\s+/).filter(word=>word==='jobName'+i).length,1,'Long job metadata is preserved once without consuming every subsequent page');
assert.ok(headerText.includes('Final material after full job metadata'));
assert.ok(headerPages.length>1);
for(const page of [...pages,...headerPages])for(const line of page.drawn){
 assert.ok(line.y>=0&&line.y<page.height,'No exported text is cut by a page boundary');
 assert.ok(line.x+line.width<=page.width,'Wrapped export content stays on the page using actual measured font width');
}
console.log('PASS isolated Studio→Admin copies, exact current design/client/finish/lighting mapping, independent edits, return link and original Admin/Studio/photo preservation');
console.log('PASS complete material names/quantities/URLs, row-aware pagination, scope notes and oversized-row continuation without lost text');

// Validate the bytes from the real public PDF export path. Strict viewers must
// find every object directly through xref, without repairing stale offsets.
(async()=>{
 const exporter=load('src/lib/export');
 const oldDocument=global.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 let downloaded;
 global.document={createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
 URL.createObjectURL=blob=>{downloaded=blob;return 'blob:material-export-test';};URL.revokeObjectURL=()=>{};
 try{
  const title='S&S · Matériaux (Q4) \\ 2026';
  for(const count of [1,4,9]){
   const canvases=Array.from({length:count},()=>({width:1200,height:800,toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='}));
   await exporter.exportCanvasesAsPdf(canvases,title,'fixture.pdf');
   const bytes=Buffer.from(await downloaded.arrayBuffer()),raw=bytes.toString('latin1');
   const start=Number(raw.match(/startxref\n(\d+)\n%%EOF$/)[1]);
   assert.equal(raw.slice(start,start+4),'xref','startxref is the exact final byte offset');
   const xref=raw.slice(start).split('\n'),size=Number(xref[1].split(' ')[1]);
   assert.equal(size,4+count*3);
   for(let index=1;index<size;index++){
    const offset=Number(xref[2+index].slice(0,10));
    assert.equal(raw.slice(offset,offset+String(index).length+7),index+' 0 obj\n','Each PDF xref entry locates its own object');
   }
   const hex=raw.match(/\/Title <([a-fA-F0-9]+)>/)[1],encoded=Buffer.from(hex,'hex');
   assert.equal(encoded.subarray(0,2).toString('hex'),'feff');
   assert.equal(encoded.subarray(2).swap16().toString('utf16le'),title,'Unicode and literal title punctuation survive');
   assert.ok(raw.includes('/Count '+count+' >>'));
  }
 }finally{global.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
 console.log('PASS one/four/nine-page PDF object offsets, startxref and full Unicode metadata through actual export path');
})().catch(error=>{console.error(error);process.exitCode=1;});
