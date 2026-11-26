/* Live catalog regressions: saved course independence, compatible product
 * routing, feature-aware tabs, exact order propagation and accessible markup. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){
  let full=path.resolve(root,file);
  if(full.endsWith('.css'))return {};
  if(!fs.existsSync(full))full+=fs.existsSync(full+'.ts')?'.ts':'.tsx';
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  new Function('require','module','exports',code)((name)=>name.startsWith('.')?
    load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports);
  return mod.exports;
}
const {makeConsultationProject}=load('src/lib/consultationProject');
const {deckVisualProducts,getRailVisualProduct}=load('src/data/visualCatalog');
const {calculateEstimate}=load('src/lib/estimate');
const {resolvePictureFrameMaterials,resolveBreakerBoardMaterials}=load('src/lib/deckTrimSelection');
const {getFinishDockTabs,getBoardFinishState,changeBoardFinish,changeFinishCourseCount,
  changeRailingFinishStyle,changeCoverFinishStyle,coverFinishStyleIssue,changeSunroomFinish,changePostCapLighting,
  finishDockDetailSection,getOverheadAddonFinish}=load('src/lib/consultationFinishDock');
const rectangle=(x=0,y=0,w=16,d=12)=>JSON.stringify([
  {x,y},{x:x+w,y},{x:x+w,y:y+d},{x,y:y+d},
]);
const base=makeConsultationProject('finish-dock-qa');
base.values={...base.values,deckShape:rectangle(),attachment:'freestanding',deckHeight:3,
  pictureFrameCount:0,breakerBoardCount:0,stairCount:0,stairEdgeIndex:-1,
  additionalStairs:'[]',manualRailingEdges:'[]',perimeterRailingFt:0};
const categories=project=>getFinishDockTabs(project).map(tab=>tab.category);
assert.deepEqual(categories(base),['deck','fascia'],'Absent design features must not create empty finish tabs');
assert.equal(getFinishDockTabs(base)[0].label,'Main deck');
assert.equal(finishDockDetailSection(base,'sunroom'),'cover',
  'Add / edit Sunroom on an open design opens the cover/enclosure selector, not an empty sunroom inspector');
assert.equal(finishDockDetailSection(base,'risers'),'stairs');
assert.equal(finishDockDetailSection(base,'drink-rail'),'railing');
const [a,b,c]=deckVisualProducts.slice(0,3);
assert.ok(a&&b&&c);
let values={...base.values,deckingMaterial:a.label,pictureFrameCount:3,breakerBoardCount:3,
  borderSameBoard:true,pictureFrameMaterial:'stale legacy selection',pictureFrameMaterial2:'another stale selection'};
values=changeBoardFinish(values,'picture-frame',b.label,1);
assert.deepEqual(resolvePictureFrameMaterials(values),[a.label,b.label,a.label],
  'Editing course 2 must not expose legacy overrides hidden by Match main deck');
values=changeBoardFinish(values,'picture-frame',c.label,2);
values=changeBoardFinish(values,'picture-frame','match',1);
assert.equal(values.borderSameBoard,false,'An inactive custom course must remain preserved');
const beforeShrink={...values};
values=changeFinishCourseCount(values,'picture-frame',1);
assert.equal(values.pictureFrameMaterial3,c.label);
assert.equal(getFinishDockTabs({...base,values}).filter(tab=>tab.category==='picture-frame').length,1);
assert.equal(getFinishDockTabs({...base,values}).find(tab=>tab.category==='picture-frame').label,'Picture frame');
values=changeFinishCourseCount(values,'picture-frame',3);
assert.deepEqual(resolvePictureFrameMaterials(values),[a.label,a.label,c.label]);
assert.equal(values.pictureFrameMaterial3,beforeShrink.pictureFrameMaterial3);
values=changeBoardFinish(values,'breaker',b.label,0);
values=changeBoardFinish(values,'breaker',c.label,1);
values=changeBoardFinish(values,'breaker','match',2);
assert.deepEqual(resolveBreakerBoardMaterials(values),[b.label,c.label,a.label]);
const afterField=changeBoardFinish(values,'deck',b.label);
assert.deepEqual(resolvePictureFrameMaterials(afterField),[b.label,b.label,c.label]);
assert.deepEqual(resolveBreakerBoardMaterials(afterField),[b.label,c.label,b.label]);
assert.equal(afterField.deckingType,'composite');
assert.equal(changeBoardFinish(afterField,'deck',b.label),afterField,'Clicking the selected board must preserve project revision');
assert.equal(changeBoardFinish(afterField,'picture-frame',c.label,2),afterField);
assert.equal(changeFinishCourseCount(afterField,'picture-frame',3),afterField);
assert.equal(changeBoardFinish(values,'picture-frame',a.label,3),values,'Reject an impossible fourth course');
assert.equal(changeFinishCourseCount(values,'breaker',-1),values);
assert.equal(changeBoardFinish(values,'deck','invented product'),values,'Only registered manufacturer options can be newly selected');
assert.equal(getBoardFinishState({...values,borderSameBoard:'false'},'picture-frame',2).value,c.label);

// Shared main/lower finishes retain the independent lower STRUCTURAL course
// count. Only courses actually used by either existing tier become tabs.
const lowerProject={...base,values:{...values,pictureFrameCount:1,multiTierEnabled:true,
  lowerDeckShape:rectangle(17,0,8,6),lowerUseCustomSettings:true,lowerPictureFrameCount:3}};
assert.equal(getFinishDockTabs(lowerProject).filter(tab=>tab.category==='picture-frame').length,3);
const lowerUnchanged=changeBoardFinish(lowerProject.values,'picture-frame',b.label,2);
assert.equal(lowerUnchanged.lowerPictureFrameCount,3);
assert.ok(!Object.keys(lowerUnchanged).some(key=>/^lower.*Material/.test(key)&&!(key in lowerProject.values)),
  'The dock must not create unimplemented independent lower-tier material fields');

const withStairs={...base,values:{...values,stairCount:1,stairEdgeIndex:2,stairOffset:6,
  stairRailingLeft:true,stairRailingRight:true,manualRailingEdges:'[0,1,2,3]'}};
assert.ok(categories(withStairs).includes('stairs'));
assert.ok(categories(withStairs).includes('risers'));
assert.ok(categories(withStairs).includes('railing'));
assert.deepEqual(getFinishDockTabs(withStairs).filter(tab=>tab.category==='railing').map(tab=>[tab.label,tab.mode]),
  [['Railing style','style'],['Railing color','color']]);
let rail=changeRailingFinishStyle({...withStairs.values,railingColor:'dark-bronze',railingInfill:'horizontal-cable'},'tt-ire-drink');
assert.equal(rail.railingColor,'dark-bronze');assert.equal(rail.railingInfill,'horizontal-cable');
assert.equal(rail.railingPostTermination,'flush-drink');assert.equal(rail.railingPostCap,'none');
assert.equal(rail.railingSystem,'timbertech-ire');assert.equal(rail.railingTopProfile,'drink');
assert.equal(changeRailingFinishStyle(rail,'tt-ire-drink'),rail);
assert.ok(categories({...withStairs,values:rail}).includes('drink-rail'));
rail=changeRailingFinishStyle(rail,'tt-statement');
assert.equal(rail.railingColor,'white');assert.equal(rail.railingInfill,'square-white');
assert.equal(rail.railingPostTermination,'at-top');assert.equal(rail.railingPostCap,'standard');
assert.equal(rail.drinkRail,false);assert.equal(rail.railingSystem,'standard');
assert.ok(!categories({...withStairs,values:rail}).includes('drink-rail'));
const wood=changeRailingFinishStyle(rail,'sns-wood-pickets');
assert.equal(wood.railingType,'wood');assert.equal(wood.spindleType,'wood-pickets');
assert.equal(changeRailingFinishStyle(wood,'unknown'),wood);
const litCap=changePostCapLighting({...rail,railingVisualId:'tt-ire-modern',railingPostCap:'lantern'},'tt-ire-post-cap');
assert.equal(litCap.railingPostCap,'standard');assert.equal(litCap.lightingPostCapFixture,'tt-ire-post-cap');
assert.equal(changePostCapLighting(litCap,'tt-ire-post-cap'),litCap,'Repeated cap selection remains a no-op');
assert.equal(changePostCapLighting({...litCap,railingVisualId:'tt-ire-drink',railingPostTermination:'flush-drink'},'none').railingPostCap,'none');
const incompatibleDrink=deckVisualProducts.find(board=>/^(Terrain|Prime|Reliaboard)/i.test(board.collection));
if(incompatibleDrink)assert.equal(changeBoardFinish(wood,'drink-rail',incompatibleDrink.label),wood);
// A legacy drinkRail flag can coexist with a wood or other non-drink visual
// style. Keep that saved scope, but do not accept invisible board changes or
// quietly replace its railing family, infill, post termination or caps.
const compatibleDrinkBoards=deckVisualProducts.filter(board=>!/^(Terrain|Prime|Reliaboard)/i.test(board.collection));
const savedDrinkBoard=compatibleDrinkBoards[0].label,nextDrinkBoard=compatibleDrinkBoards[1].label;
for(const styleId of ['sns-wood-pickets','sns-wood-round','tt-ire-modern','tt-premier']){
  const legacyDrink={...changeRailingFinishStyle(withStairs.values,styleId),drinkRail:true,
    drinkRailMaterial:savedDrinkBoard,railingPostTermination:'above-top',railingPostCap:'lantern'};
  const saved=JSON.stringify(legacyDrink);
  assert.ok(categories({...withStairs,values:legacyDrink}).includes('drink-rail'),
    'Keep the saved drink rail visible instead of silently dropping its scope');
  const finish=getBoardFinishState(legacyDrink,'drink-rail');
  assert.equal(finish.value,savedDrinkBoard);assert.equal(finish.resolved,savedDrinkBoard);
  assert.match(finish.unavailableReason,/preview is unavailable/);
  assert.match(finish.unavailableReason,/Railing style/,
    'Explain how to deliberately select an implemented drink-rail style');
  assert.equal(changeBoardFinish(legacyDrink,'drink-rail',nextDrinkBoard),legacyDrink,
    'Do not save a board that the current railing cannot display');
  assert.equal(changeBoardFinish(legacyDrink,'drink-rail','match'),legacyDrink);
  assert.equal(JSON.stringify(legacyDrink),saved,'All saved legacy scope stays intact');

  const supportedId=styleId==='tt-ire-modern'?'tt-ire-drink':'tt-composite-drink';
  const chosen=changeRailingFinishStyle(legacyDrink,supportedId);
  assert.equal(chosen.drinkRailMaterial,savedDrinkBoard,'Explicit style selection keeps the saved board');
  assert.equal(getBoardFinishState(chosen,'drink-rail').unavailableReason,undefined);
  const edited=changeBoardFinish(chosen,'drink-rail',nextDrinkBoard);
  assert.equal(edited.drinkRailMaterial,nextDrinkBoard);
  assert.ok(getRailVisualProduct(edited.railingVisualId).geometry.includes('drink'),
    'Accepted board changes reach a drink-board geometry implemented by the renderer');
}
const legacyDrinkProfile={...withStairs.values,railingType:'aluminum',railingTopProfile:'drink',
  drinkRail:true,drinkRailMaterial:savedDrinkBoard};
delete legacyDrinkProfile.railingVisualId;
assert.equal(getBoardFinishState(legacyDrinkProfile,'drink-rail').unavailableReason,undefined,
  'A legacy metal drink profile without a visual ID uses the renderer\'s supported fallback');
assert.equal(changeBoardFinish(legacyDrinkProfile,'drink-rail',nextDrinkBoard).drinkRailMaterial,nextDrinkBoard);
const legacyWoodProfile={...legacyDrinkProfile,railingType:'wood',spindleType:'black-round'};
assert.match(getBoardFinishState(legacyWoodProfile,'drink-rail').unavailableReason,/preview is unavailable/,
  'Wood takes precedence over a stale metal drink profile in the renderer fallback');
const stairFinishes=changeBoardFinish(changeBoardFinish(withStairs.values,'stairs',b.label),'risers',c.label);
assert.equal(stairFinishes.stairTreadStyle,b.label);assert.equal(stairFinishes.stairRiserStyle,c.label);
assert.equal(getBoardFinishState({...stairFinishes,stairFasciaMaterial:'match-fascia',fasciaMaterial:b.label},'stair-fascia').resolved,b.label);

const covered={...withStairs,coverFamily:'Classico',coverColor:'Black',coverRoofStyle:'gable',
  coverScreenStyle:'elite-add-a-room',eliteSunroom:{roomSystem:'3-thermal',framingColor:'white',
    panelColor:'clay',windowColor:'bronze',glassType:'clear-insulated',buildMode:'existing-structure',walls:{front:'saved-section-json'}}};
assert.ok(categories(covered).includes('cover'));assert.ok(categories(covered).includes('sunroom'));
assert.equal(finishDockDetailSection(covered,'sunroom'),'sunroom');
assert.deepEqual(changeCoverFinishStyle(covered,'Classico'),{});
assert.deepEqual(getFinishDockTabs(covered).filter(tab=>tab.category==='cover').map(tab=>[tab.label,tab.mode]),
  [['Patio cover style','style'],['Patio cover color','color']]);
const fresco=changeCoverFinishStyle(covered,'Fresco');
assert.deepEqual(fresco,{},'Browsing a cover must never silently remove the selected Elite sunroom or its material order');
assert.ok(coverFinishStyleIssue(covered,'Fresco'));
assert.ok(coverFinishStyleIssue(covered,'Aria'));
assert.ok(coverFinishStyleIssue(covered,'none'));
assert.equal(coverFinishStyleIssue(covered,'Moderno'),undefined);
assert.equal(changeCoverFinishStyle(covered,'Moderno').coverScreenStyle,undefined,'Compatible cover change preserves the existing enclosure');
const openFresco=changeCoverFinishStyle({...covered,coverScreenStyle:'none'},'Fresco');
assert.equal(openFresco.coverRoofStyle,'studio');assert.equal(openFresco.coverColor,'Black');
assert.equal(openFresco.coverFamily,'Fresco');
assert.equal(covered.eliteSunroom.walls.front,'saved-section-json','Preserve saved sunroom section work');
const sunroom=changeSunroomFinish(covered,'wheat').eliteSunroom;
assert.deepEqual([sunroom.framingColor,sunroom.panelColor,sunroom.windowColor],['wheat','wheat','wheat']);
assert.deepEqual(sunroom.walls,covered.eliteSunroom.walls);
assert.deepEqual(changeSunroomFinish({...covered,eliteSunroom:sunroom},'wheat'),{});
assert.ok(categories({...covered,coverScreenStyle:'dolce-standard'}).includes('screen'));
assert.ok(!categories({...covered,coverScreenStyle:'dolce-standard'}).includes('sunroom'));
assert.ok(!categories({...covered,coverFamily:'none'}).includes('screen'));
const concrete={...base,values:{...base.values,siteConcreteAreas:JSON.stringify([
  {id:'patio',name:'Patio',points:JSON.parse(rectangle()),thicknessIn:4,elevationFt:0},
])}};
assert.ok(categories(concrete).includes('concrete'));
assert.deepEqual(getFinishDockTabs(concrete).filter(tab=>tab.category==='concrete').map(tab=>[tab.label,tab.mode]),
  [['Concrete style','style'],['Concrete color','color'],['Concrete borders','border']]);
assert.ok(categories({...base,values:{...base.values,lightingDeckFixture:'tt-in-deck'}}).includes('add-ons'));
assert.ok(categories({...base,values:{...base.values,patioFanCount:1}}).includes('add-ons'));
assert.equal(getOverheadAddonFinish(base.values,'fan'),'',
  'A default fan color must remain clickable when no fan has been added');
assert.equal(getOverheadAddonFinish(base.values,'can-light'),'',
  'A default can-light color must remain clickable when no can light has been added');
assert.equal(getOverheadAddonFinish({...base.values,patioFanCount:0,patioFanFinish:'white'},'fan'),'');
assert.equal(getOverheadAddonFinish({...base.values,patioCanLightCount:0,patioCanLightFinish:'black'},'can-light'),'');
assert.equal(getOverheadAddonFinish({...base.values,patioFanCount:1},'fan'),'black');
assert.equal(getOverheadAddonFinish({...base.values,patioCanLightCount:1},'can-light'),'white');
assert.equal(getOverheadAddonFinish({...base.values,patioFanCount:2,patioFanFinish:'white'},'fan'),'white');
assert.equal(getOverheadAddonFinish({...base.values,patioCanLightCount:3,patioCanLightFinish:'black'},'can-light'),'black');

// The actual Admin estimator receives the exact independently chosen boards.
const order=calculateEstimate('decks',stairFinishes);
assert.ok(order.materials.some(row=>row.name.startsWith('Picture-frame deck board 3')&&row.notes.includes(c.label)));
assert.ok(order.materials.some(row=>row.name==='Main stair tread board'&&row.notes.includes(b.label)));
assert.ok(order.materials.some(row=>row.name==='Main stair riser board'&&row.notes.includes(c.label)));

const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {ConsultationFinishDock}=load('src/components/ConsultationFinishDock.tsx');
const {ManufacturerCoverPicker}=load('src/components/ConsultationVisualPickers.tsx');
const coverMarkup=renderToStaticMarkup(React.createElement(ManufacturerCoverPicker,{project:covered,onChange(){}}));
const coverCards=coverMarkup.match(/<button\b[^>]*class="manufacturer-cover-card[^>]*>[\s\S]*?<\/button>/g)||[];
assert.equal(coverCards.filter(card=>/ disabled=""/.test(card)).length,4,
  'Detailed cover controls also disable None, Fresco, Aria and Solé while an Elite sunroom is installed');
assert.ok(coverCards.filter(card=>/ disabled=""/.test(card)).every(card=>card.includes('Change the room type in details first.')),
  'Incompatible detailed cover choices explain how to deliberately change the room without dropping saved scope');
const markup=renderToStaticMarkup(React.createElement(ConsultationFinishDock,{project:withStairs,onChange(){}}));
assert.ok(markup.includes('role="tablist"')&&markup.includes('role="tabpanel"'));
assert.ok(markup.includes('aria-selected="true"')&&markup.includes('aria-pressed="true"'));
assert.ok(markup.includes('aria-label="Previous Main deck choices"')&&markup.includes('aria-label="More Main deck choices"'));
assert.ok(markup.includes('aria-haspopup="menu"'),'Absent features and add-ons remain discoverable');
assert.ok(markup.includes(a.swatch.replace(/&/g,'&amp;')),'Render real catalog swatches');

// Exercise the actual board panel in server rendering, selecting its initial
// active tab through the hook boundary without changing production defaults.
function drinkPanelMarkup(values,activeTab='drink-rail'){
  const useState=React.useState;
  React.useState=initial=>useState(initial==='deck'?activeTab:initial);
  try{return renderToStaticMarkup(React.createElement(ConsultationFinishDock,{
    project:{...withStairs,values},onChange(){assert.fail('Rendering must not rewrite saved scope');},
  }));}finally{React.useState=useState;}
}
const legacyPanelValues={...wood,drinkRail:true,drinkRailMaterial:savedDrinkBoard,
  railingPostTermination:'above-top',railingPostCap:'lantern'};
const unavailableMarkup=drinkPanelMarkup(legacyPanelValues);
const unavailableCards=unavailableMarkup.match(/<button\b[^>]*class="finish-dock-choice[^>]*>[\s\S]*?<\/button>/g)||[];
assert.ok(unavailableCards.length>1,'Render the preserved selection and available catalog references');
assert.ok(unavailableCards.every(card=>/ disabled=""/.test(card)),
  'Every board choice is disabled when the saved railing has no drink-board preview');
assert.ok(unavailableMarkup.includes('Your saved drink rail is kept.'));
assert.ok(unavailableMarkup.includes('Choose railing style'),'Offer an explicit next action');
assert.equal(legacyPanelValues.railingPostCap,'lantern');
assert.equal(legacyPanelValues.railingPostTermination,'above-top');
const availableMarkup=drinkPanelMarkup(changeRailingFinishStyle(legacyPanelValues,'tt-ire-drink'));
const availableCards=availableMarkup.match(/<button\b[^>]*class="finish-dock-choice[^>]*>[\s\S]*?<\/button>/g)||[];
assert.ok(availableCards.length>1&&availableCards.every(card=>!/ disabled=""/.test(card)),
  'Deliberately selecting a supported drink style restores working finish choices');
assert.ok(!availableMarkup.includes('Your saved drink rail is kept.'));
// Older designs have type/profile fields but no catalog ID. The selected
// style and color options must agree with the already-rendered railing.
for(const [legacyValues,expectedId] of [
  [legacyWoodProfile,'sns-wood-round'],
  [{...legacyDrinkProfile,railingType:'vinyl-composite'},'tt-statement'],
  [legacyDrinkProfile,'tt-ire-drink'],
]){
  const expected=getRailVisualProduct(expectedId);
  const legacy={...legacyValues,railingColor:expected.colors[0]};
  const before=JSON.stringify(legacy);
  const styleMarkup=drinkPanelMarkup(legacy,'railing-style');
  const selectedCard=(styleMarkup.match(/<button\b[^>]*class="finish-dock-choice is-selected"[^>]*>[\s\S]*?<\/button>/g)||[])[0];
  assert.ok(selectedCard?.includes(renderToStaticMarkup(React.createElement('strong',null,expected.label))),
    'Legacy '+expectedId+' must be selected in the railing panel, matching the 3D renderer');
  const colorMarkup=drinkPanelMarkup(legacy,'railing-color');
  const colorCards=colorMarkup.match(/<button\b[^>]*class="finish-dock-choice[^>]*>[\s\S]*?<\/button>/g)||[];
  assert.equal(colorCards.length,expected.colors.length,'Only the legacy railing\'s supported colors are offered');
  assert.equal(JSON.stringify(legacy),before,'Opening the railing panel does not migrate or rewrite the design');
}
assert.equal(changePostCapLighting({...legacyDrinkProfile,railingPostTermination:'above-top',
  railingPostCap:'lantern',lightingPostCapFixture:'tt-ire-post-cap'},'none').railingPostCap,'none',
  'Removing a cap light cannot introduce a standard cap on a legacy drink-rail post');
console.log('PASS live finish dock: contextual tabs, independent courses, shared tier parity, compatible styles, preserved legacy drink rails, exact takeoff materials and accessible catalog markup');
