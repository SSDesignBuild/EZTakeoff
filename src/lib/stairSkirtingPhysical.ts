import type { DeckModel,StairPlacement } from './deckModel';
import type { SkirtSide,SkirtPlan,SkirtCut } from './deckSkirting';
import { planConstructionStair } from './constructionStairs';
import { planStairFasciaCoverage } from './stairFasciaGeometry';
import { resolveFasciaDimensions } from './deckProductDimensions';
import { resolveStairSideFasciaMaterial,hasDecorativeStairFascia,stairFasciaDimensionOverrides } from './deckTrimSelection';
import { supportedFinishCoursePieces,MAX_FINISH_CUT_FT } from './finishStockGeometry';
import { clipSkirtProfile,skirtRect,skirtMember,skirtFinishThicknessFt,
 SKIRT_FRAME_FACE_FT,SKIRT_FRAME_DEPTH_FT,type SkirtProfilePoint } from './skirtingPhysicalLayout';

type Inputs=Record<string,string|number|boolean>;
type Line={slope:number;intercept:number};
const at=(line:Line,s:number)=>line.intercept+line.slope*s;
const lineBetween=(a:{runFt:number;riseFt:number},b:{runFt:number;riseFt:number}):Line=>{
 const slope=(b.riseFt-a.riseFt)/Math.max(.0001,b.runFt-a.runFt);
 return {slope,intercept:a.riseFt-slope*a.runFt};
};
/** The skirt roof is the actual selected finish-fascia underside, including
 * its ripped lower strip. There is no unrelated six-inch-high toe wall.
 */
export function stairSkirtRoof(deck:DeckModel,placement:StairPlacement,height:number,values:Inputs){
 const stair=planConstructionStair(deck,placement,height,values);if(!stair)return null;
 const slope=stair.riseFt/stair.treadDepthFt;
 let lines:Line[]=[{slope:-slope,intercept:height-stair.treadThicknessFt-
   stair.stringerDepthFt*Math.hypot(1,slope)}];
 if(hasDecorativeStairFascia(values)){
  const dims=resolveFasciaDimensions(resolveStairSideFasciaMaterial(values),stairFasciaDimensionOverrides(values));
  const cover=planStairFasciaCoverage({treadDepthFt:stair.treadDepthFt,treads:stair.treads,
   riseFt:stair.riseFt,heightFt:height,style:values.stairFasciaStyle==='straight'?'straight':'profiled',
   nosingFt:stair.nosingFt,boardFaceFt:dims.faceIn/12,boardThicknessIn:dims.thicknessIn,
   treadThicknessFt:stair.treadThicknessFt});
  if(cover.main.length>1)lines=[lineBetween(cover.main[cover.main.length-1],cover.main[cover.main.length-2])];
  if(cover.lowerRip.length===4)lines.push(lineBetween(cover.lowerRip[3],cover.lowerRip[2]));
 }
 lines=lines.map(line=>({...line,intercept:line.intercept-.04}));
 return {stair,lines,roofAt:(s:number)=>Math.min(...lines.map(line=>at(line,s)))};
}

export function physicalStairSkirtSide(deck:DeckModel,placement:StairPlacement,height:number,values:Inputs,
 options:SkirtPlan['options'],flight:number,sideIndex:number,lower:boolean):{side:SkirtSide;issues:string[]}|null{
 const roof=stairSkirtRoof(deck,placement,height,values);if(!roof)return null;
 const {stair,lines,roofAt}=roof,run=stair.runFt;
 const id=(lower?'L':'M')+'ST'+(flight+1)+(sideIndex===0?'L':'R');
 const edgeIndex=1000+(lower?200:0)+flight*2+sideIndex;
 const label='Stair '+(flight+1)+(sideIndex===0?' left side':' right side');
 const side:SkirtSide={kind:'stair',label,edgeIndex,lengthFt:run,
  startHeightFt:Math.max(0,roofAt(0)),endHeightFt:Math.max(0,roofAt(run)),openings:[],
  verticals:[],finish:[],courses:[],topRails:[],bottomRails:[],finishCuts:[],framingCuts:[],physicalMembers:[]};
 const issues:string[]=[],plate=SKIRT_FRAME_FACE_FT,depth=SKIRT_FRAME_DEPTH_FT;
 const finishDepth=skirtFinishThicknessFt(options),face=options.faceIn/12,
  reveal=options.revealIn/12,pitch=(options.faceIn+options.gapIn)/12;
 const clip=(poly:SkirtProfilePoint[],extraDrop=0)=>lines.reduce((p,line)=>
  clipSkirtProfile(p,line.slope,-1,line.intercept-extraDrop),poly);
 const add=(material:'finish'|'2x4',role:NonNullable<SkirtCut['placement']>['role'],
  profile:SkirtProfilePoint[],faceFt:number,axis?:[SkirtProfilePoint,SkirtProfilePoint],extra:Partial<SkirtCut['placement']>={})=>{
  const list=material==='finish'?side.finishCuts:side.framingCuts;
  const cut:SkirtCut={id:id+'-'+(material==='finish'?'FIN':'2X4')+'-'+(list.length+1),edgeIndex,material,
   lengthFt:0,location:label+' · '+role,placement:{role,...extra}};
  const member=skirtMember(cut,profile,material==='finish'?finishDepth:depth,faceFt,axis);
  if(!member)return null;
  cut.lengthFt=member.cutLengthFt;list.push(cut);side.physicalMembers!.push(member);return member;
 };
 const positiveEnd=Math.min(run,...lines.filter(line=>line.slope<0).map(line=>-line.intercept/line.slope));
 if(positiveEnd<=.05)return {side,issues};
 // Existing 24-in framing stations remain the supported stock-splice set.
 const roofBreaks=lines.flatMap((a,i)=>lines.slice(i+1).flatMap(b=>{
  const x=(b.intercept-a.intercept)/(a.slope-b.slope);
  return Number.isFinite(x)&&x>.001&&x<positiveEnd-.001?[x]:[];
 }));
 const stations=Array.from(new Set([...Array.from({length:Math.floor(positiveEnd/2)+1},(_,i)=>i*2),...roofBreaks])).sort((a,b)=>a-b);
 if(positiveEnd-stations[stations.length-1]>.001)stations.push(positiveEnd);
 const railPieces:{start:number;end:number}[]=[];
 for(let start=0;start<positiveEnd-.001;){
  const limit=roofBreaks.filter(s=>s>start+.001).sort((a,b)=>a-b)[0]??positiveEnd;
  const candidates=stations.filter(s=>s>start+.001&&s<=limit+.00001&&
    Math.hypot(s-start,roofAt(s)-roofAt(start))<=16);
  const end=candidates[candidates.length-1];
  if(end===undefined){issues.push(label+': no supported 2x4 splice within available stock.');break;}
  railPieces.push({start,end});start=end;
 }
 for(const {start,end} of railPieces){
  const lowerLines=lines.map(line=>({...line,intercept:line.intercept-plate*Math.hypot(1,line.slope)}));
  // The two selected slopes meet at their actual intersection. Clip a
  // nominal top-plate strip at the bottom plate as the toe closes.
  const breaks=[start,end,...lines.flatMap((a,i)=>lines.slice(i+1).flatMap(b=>{
   const x=(b.intercept-a.intercept)/(a.slope-b.slope);
   return Number.isFinite(x)&&x>start&&x<end?[x]:[];
  }))].sort((a,b)=>a-b);
  const upper=breaks.map(s=>[s,roofAt(s)] as SkirtProfilePoint);
  const lowerPts=[...breaks].reverse().map(s=>[s,Math.min(...lowerLines.map(l=>at(l,s)))] as SkirtProfilePoint);
  const profile=clipSkirtProfile([...upper,...lowerPts],0,1,-plate);
  if(profile.length>=3){
   const left=Math.min(...profile.map(p=>p[0])),right=Math.max(...profile.map(p=>p[0]));
   add('2x4','top-rail',profile,plate,[[left,roofAt(left)],[right,roofAt(right)]],{startFt:left,endFt:right});
   side.topRails.push({start:left,end:right});
  }
 }
 for(const {start,end} of railPieces){
  const member=add('2x4','bottom-rail',clip(skirtRect(start,end,0,plate)),plate,undefined,{startFt:start,endFt:end});
  if(member)side.bottomRails.push({start,end});
 }
 const installedStuds:number[]=[];
 for(const station of stations){
  const x=Math.max(plate/2,Math.min(positiveEnd-plate/2,station));
  if(installedStuds.some(s=>Math.abs(s-x)<plate+.001))continue;
  let poly=skirtRect(x-plate/2,x+plate/2,plate,Math.max(plate,roofAt(x)));
  for(const line of lines)poly=clipSkirtProfile(poly,line.slope,-1,line.intercept-plate*Math.hypot(1,line.slope));
  const member=add('2x4','stud',poly,plate,undefined,{stationFt:x});
  if(member){side.verticals.push({station:x,heightFt:member.cutLengthFt,role:'stud'});installedStuds.push(x);}
 }
 const supports=side.verticals.map(v=>v.station);
 if(options.orientation==='vertical'){
  for(let start=0;start<positiveEnd-.001;start+=pitch){
   const end=Math.min(positiveEnd,start+face);
   const member=add('finish','vertical-finish',clip(skirtRect(start,end,reveal,roofAt(0))),end-start,
    undefined,{startFt:start,endFt:end,faceFt:end-start});
   if(member)side.finish.push({station:start,heightFt:member.cutLengthFt,role:'finish'});
  }
 }else{
  for(let row=0;reveal+row*pitch<roofAt(0)-.001;row++){
   const bottom=reveal+row*pitch,poly=clip(skirtRect(0,positiveEnd,bottom,bottom+face));
   if(poly.length<3)continue;
   const end=Math.max(...poly.map(p=>p[0]));
   const pieces=supportedFinishCoursePieces(0,end,supports,MAX_FINISH_CUT_FT);
   issues.push(...pieces.issues.map(issue=>label+': '+issue));
   for(const piece of pieces.pieces){
    const clipped=clipSkirtProfile(clipSkirtProfile(poly,1,0,-piece.start),-1,0,piece.end);
    const member=add('finish','horizontal-finish',clipped,face,undefined,
      {startFt:piece.start,endFt:piece.end,row,faceFt:face});
    if(member)side.courses.push({row,start:piece.start,end:piece.end,depthFt:face});
   }
  }
 }
 return {side,issues};
}
