import type { MaterialItem } from './types';
import type { buildDeckModel } from './deckModel';
import { packSkirtCuts, type SkirtPlan, type SkirtSide, type SkirtCut, type SkirtVertical, type SkirtCourse } from './deckSkirting';

type Deck=ReturnType<typeof buildDeckModel>;
type Inputs=Record<string,string|number|boolean>;
const p3=(n:number)=>Math.round(n*1000)/1000;
const key=(lower:boolean,name:string)=>lower?'lower'+name.charAt(0).toUpperCase()+name.slice(1):name;
const bool=(v:unknown)=>v===true||v==='true';
/** Geometrically sloped under-stair side infill; not a code-approved stair stringer detail. */
export function buildDeckStairSkirting(deck:Deck,inputs:Inputs,lower=false):SkirtPlan {
  const pref=(name:string)=>key(lower,name);
  const enabled=bool(inputs[pref('skirtingEnabled')])&&bool(inputs[pref('skirtingStairsEnabled')])&&deck.stairCount>0;
  const material=String(inputs[pref('skirtingMaterial')]??'kdat');
  const orientation: 'horizontal'|'vertical'=inputs[pref('skirtingOrientation')]==='horizontal'?'horizontal':'vertical';
  const finishColor=String(inputs[pref('skirtingColor')]??'Natural / stain-ready');
  const faceIn=Number(inputs[pref('skirtingFaceIn')]??(material==='kdat'?4.5:5.5));
  const gapIn=Number(inputs[pref('skirtingGapIn')]??.25);
  const kerfIn=Number(inputs[pref('skirtingKerfIn')]??.125);
  const trimIn=Number(inputs[pref('skirtingTrimIn')]??.25);
  const revealIn=Number(inputs[pref('skirtingRevealIn')]??1);
  const opts={material,orientation,finishColor,faceIn,gapIn,kerfIn,trimIn,revealIn};
  const empty:SkirtPlan={enabled,sides:[],materials:[],cuts:[],finishStock:[],frameStock:[],issues:[],notes:[],frameScrews:0,finishNails:0,finishScrews:0,options:opts};
  if(!enabled)return empty;
  const issues:string[]=[],notes:string[]=[];
  if(!Number.isFinite(faceIn)||faceIn<=0||!Number.isFinite(gapIn)||gapIn<0||gapIn>2||!Number.isFinite(kerfIn)||kerfIn<0||!Number.isFinite(trimIn)||trimIn<0){
    return {...empty,issues:['Invalid stair skirting finish board dimensions, gap, kerf or trim.']};
  }
  const deckHeight=Number(inputs[lower?'lowerDeckHeight':'deckHeight']??0);
  const startHeight=Math.max(.5,deckHeight-((parseInt(deck.joistSize.split('x')[1]||'8',10)-.75)+1)/12);
  const endHeight=.5; // Ground reveal at stair toe; field verification required.
  const run=deck.stairRunFt;
  if(!Number.isFinite(run)||run<=0)return {...empty,issues:['Cannot calculate stair skirting until each stair flight is placed.']};
  const placements=deck.stairPlacements.length?deck.stairPlacements:[deck.stairPlacement];
  const sides:SkirtSide[]=[];
  for(let stair=0;stair<placements.length;stair++) for(let side=0;side<2;side++){
    const index=1000+(lower?200:0)+stair*2+side;
    const id=(lower?'L':'M')+'ST'+(stair+1)+(side===0?'L':'R');
    const label='Stair '+(stair+1)+(side===0?' left side':' right side');
    const finish:SkirtVertical[]=[],verticals:SkirtVertical[]=[],courses:SkirtCourse[]=[];
    const finishCuts:SkirtCut[]=[],framingCuts:SkirtCut[]=[];
    const height=(x:number)=>Math.max(endHeight,startHeight-(startHeight-endHeight)*x/run);
    const add=(kind:'finish'|'2x4',lengthFt:number,location:string)=>{
      if(lengthFt<=.001)return;
      const arr=kind==='finish'?finishCuts:framingCuts;
      arr.push({id:id+'-'+(kind==='finish'?'FIN':'2X4')+'-'+(arr.length+1),edgeIndex:index,material:kind,lengthFt:p3(lengthFt),location:label+' · '+location});
    };
    const stations:number[]=[];
    for(let x=0;x<run-.001;x+=2)stations.push(p3(x));
    stations.push(p3(run));
    verticals.push(...stations.map((station)=>({station,heightFt:p3(height(station)),role:'stud' as const})));
    const cutRail=(sloped:boolean)=>{
      let left=0;
      while(left<run-.001){
        const candidates=stations.filter((x)=>x>left+.01&&x<=Math.min(run,left+15.5));
        const next=candidates[candidates.length-1];
        if(next===undefined){issues.push(label+': unable to locate a supported 2x4 framing joint.');break;}
        const horizontalLength=next-left;
        const change=sloped?Math.abs(height(next)-height(left)):0;
        add('2x4',Math.hypot(horizontalLength,change),sloped?'sloping top rail supported at studs':'ground-contact bottom rail supported at studs');
        left=next;
      }
    };
    cutRail(true);cutRail(false);
    verticals.forEach((vertical)=>add('2x4',vertical.heightFt,'24 in O.C. support at '+vertical.station+' ft'));
    if(orientation==='vertical'){
      const step=(faceIn+gapIn)/12;
      for(let x=0;x<run-.001;x+=step){
        const next=Math.min(run,x+faceIn/12);
        if(next<=x)continue;
        const finishHeight=Math.max(height(x),height(next));
        finish.push({station:p3(x),heightFt:p3(finishHeight),role:'finish'});
        add('finish',finishHeight,'vertical board at '+p3(x)+' ft; scribe top to stair slope');
      }
    } else {
      const step=(faceIn+gapIn)/12;
      for(let row=0;row<Math.ceil(startHeight/step);row++){
        const y=row*step;
        if(y>=startHeight-.001)break;
        const maxX=startHeight===endHeight?run:Math.min(run,Math.max(0,(startHeight-y)/(startHeight-endHeight)*run));
        if(maxX<=.001)continue;
        courses.push({row,start:0,end:p3(maxX),depthFt:faceIn/12});
        // Split finish courses at vertical support studs; no fictitious seam.
        let left=0;
        while(left<maxX-.001){
          const candidates=stations.filter((x)=>x>left+.01&&x<=Math.min(maxX,left+15.5));
          const next=candidates[candidates.length-1]??Math.min(maxX,left+15.5);
          add('finish',next-left,'horizontal course '+(row+1)+'; ending cut scribed to stair slope');
          left=next;
        }
      }
    }
    sides.push({edgeIndex:index,lengthFt:run,startHeightFt:startHeight,endHeightFt:endHeight,openings:[],
      verticals,finish,courses,topRails:[{start:0,end:run}],bottomRails:[{start:0,end:run}],
      finishCuts,framingCuts,kind:'stair',label});
  }
  const finishCuts=sides.flatMap((s)=>s.finishCuts);
  const frameCuts=sides.flatMap((s)=>s.framingCuts);
  const finishStockPack=packSkirtCuts(finishCuts,material==='kdat'?[8,12,16,20]:[16,20],kerfIn,trimIn);
  const frameStockPack=packSkirtCuts(frameCuts,[8,10,12,16,20],kerfIn,trimIn);
  issues.push(...finishStockPack.issues,...frameStockPack.issues);
  if(!bool(inputs[pref('skirtingGradeConfirmed')]))
    issues.push('Verify toe grade, stair slope, finished clearance and bottom rail treatment before supplier export.');
  const frameScrews=sides.reduce((sum,side)=>sum+2*(side.verticals.length*2+side.framingCuts.filter((c)=>c.location.includes('rail')).length*2),0);
  const finishFasteners=orientation==='vertical'
    ? sides.reduce((sum,side)=>sum+side.finish.length*4,0)
    : sides.reduce((sum,side)=>sum+side.courses.reduce((n,course)=>n+2*Math.max(2,side.verticals.filter((s)=>s.station>=course.start-.001&&s.station<=course.end+.001).length),0),0);
  const category=lower?'Lower stair skirting':'Stair skirting';
  const materials:MaterialItem[]=[];
  for(const group of [
    {name:material==='kdat'?'1x5 KDAT pressure-treated stair skirting':material==='pvc'?'PVC stair skirting board':'Composite stair skirting board',color:finishColor,stock:finishStockPack.stock},
    {name:'2x4 ground-contact-treated stair skirting supports',color:'Ground-contact treatment',stock:frameStockPack.stock},
  ]) for(const length of [...new Set(group.stock.map((stock)=>stock.stockLengthFt))]){
    const list=group.stock.filter((stock)=>stock.stockLengthFt===length);
    materials.push({name:group.name,category,quantity:list.length,unit:'boards',stockRecommendation:length+' ft stock',color:group.color,
      layoutLabel:list.flatMap((s)=>s.cuts.map((cut)=>cut.id)).slice(0,10).join(', '),
      notes:'Both stair-side infills: sloped top/flat toe, 2x4 supports at 24 in O.C.; verify field grade and minimum stair clearance.'});
  }
  notes.push('Stair skirting adds two sloping side-infill profiles per placed stair flight (not a replacement for the stair stringers). Studs at 24 in O.C.; top rail cut lengths include the slope.');
  notes.push('Toe profile assumes 6 in exposed clearance; inspect finished grade, ventilation, railing attachment and step dimensions before final fabrication.');
  return {enabled,sides,materials,cuts:[...finishCuts,...frameCuts],
    finishStock:finishStockPack.stock,frameStock:frameStockPack.stock,issues,notes,frameScrews,
    finishNails:material==='kdat'?finishFasteners:0,finishScrews:material==='kdat'?0:finishFasteners,options:opts};
}
