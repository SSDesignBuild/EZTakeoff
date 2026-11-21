import type { DeckEdgeSegment, MaterialItem } from './types';

export type SkirtCut = { id: string; edgeIndex: number; material: 'finish' | '2x4'; lengthFt: number; location: string };
export type SkirtOpening = { edgeIndex: number; offset: number; width: number; kind: 'opening' | 'removable' | 'hinged-gate' };
export type SkirtGrade = { edgeIndex: number; startFt: number; endFt: number };
export type SkirtVertical = { station: number; heightFt: number; role: 'stud' | 'jamb' | 'finish' };
export type SkirtCourse = { row: number; start: number; end: number; depthFt: number };
export type SkirtSide = {
  kind?: 'deck' | 'stair'; label?: string;
  edgeIndex: number; lengthFt: number; startHeightFt: number; endHeightFt: number;
  openings: SkirtOpening[]; verticals: SkirtVertical[]; finish: SkirtVertical[];
  courses: SkirtCourse[]; topRails: { start: number; end: number }[];
  bottomRails: { start: number; end: number }[];
  finishCuts: SkirtCut[]; framingCuts: SkirtCut[];
};
export type CutStock = { stockLengthFt: number; cuts: SkirtCut[]; remainderIn: number };
export type SkirtPlan = {
  enabled: boolean; sides: SkirtSide[]; materials: MaterialItem[]; cuts: SkirtCut[];
  finishStock: CutStock[]; frameStock: CutStock[]; issues: string[]; notes: string[];
  frameScrews: number; finishNails: number; finishScrews: number;
  options: { material: string; finishColor: string; orientation: 'vertical' | 'horizontal'; revealIn: number; gapIn: number; faceIn: number; kerfIn: number; trimIn: number };
};

type Inputs = Record<string, string | number | boolean>;
const num = (v: unknown, fallback: number) => v === '' || v === undefined ? fallback : Number(v);
const p3 = (n: number) => Math.round(n * 1000) / 1000;
const parseJson = (v: unknown): unknown => { try { return JSON.parse(String(v)); } catch { return null; } };
const uniq = (v: number[]) => Array.from(new Set(v.map((x) => Math.round(x * 1200) / 1200))).sort((a,b)=>a-b);
const subtractIntervals = (end: number, openings: { offset: number; width: number }[]) => {
  let result: {start:number;end:number}[] = [{start:0,end}];
  for (const cut of openings) result = result.flatMap((r) => {
    const low=Math.max(r.start,cut.offset), high=Math.min(r.end,cut.offset+cut.width);
    return high<=low ? [r] : [{start:r.start,end:low},{start:high,end:r.end}].filter((item)=>item.end-item.start>0.001);
  });
  return result;
};
export function packSkirtCuts(cuts: SkirtCut[], lengthsFt: number[], kerfIn = 0.125, trimIn = 0.25) {
  const issues: string[] = [];
  const valid=[...new Set(lengthsFt)].filter((length)=>Number.isFinite(length)&&length>0).sort((a,b)=>a-b);
  const sorted=[...cuts].sort((a,b)=>b.lengthFt-a.lengthFt);
  for(const cut of sorted){
    if(!(cut.lengthFt>0)||!Number.isFinite(cut.lengthFt))issues.push('Invalid cut length: '+cut.id);
    else if(!valid.some((length)=>length*12-trimIn+0.000001 >= cut.lengthFt*12+kerfIn))
      issues.push('No available continuous stock length for '+cut.id+' ('+p3(cut.lengthFt)+' ft)');
  }
  if(issues.length)return {stock:[] as CutStock[],issues};
  if(!sorted.length)return {stock:[] as CutStock[],issues};
  const consume=(bin:CutStock,cut:SkirtCut)=>{
    bin.cuts.push(cut);
    bin.remainderIn=p3(bin.remainderIn-cut.lengthFt*12-kerfIn);
  };
  const plans: CutStock[][]=[];
  // Evaluate every available single-length purchasing option. This prevents
  // local greedy choices from buying 2 x 8 ft when a single 10 ft satisfies 3 x 3 ft cuts.
  for(const length of valid){
    if(sorted.some((cut)=>cut.lengthFt*12+kerfIn>length*12-trimIn+0.000001))continue;
    const plan:CutStock[]=[];
    for(const cut of sorted){
      let bin=plan.filter((candidate)=>candidate.remainderIn+0.000001>=cut.lengthFt*12+kerfIn)
        .sort((a,b)=>a.remainderIn-b.remainderIn)[0];
      if(!bin){bin={stockLengthFt:length,cuts:[],remainderIn:length*12-trimIn};plan.push(bin);}
      consume(bin,cut);
    }
    plans.push(plan);
  }
  // Also evaluate a mixed-length first-fit baseline. Uniform stock isn't
  // always optimal; compatible cuts can share longer offcuts.
  const mixed:CutStock[]=[];
  for(const cut of sorted){
    const needed=cut.lengthFt*12+kerfIn;
    let bin=mixed.filter((candidate)=>candidate.remainderIn+0.000001>=needed)
      .sort((a,b)=>a.remainderIn-b.remainderIn)[0];
    if(!bin){
      const length=valid.find((l)=>l*12-trimIn+0.000001>=needed)!;
      bin={stockLengthFt:length,cuts:[],remainderIn:length*12-trimIn};
      mixed.push(bin);
    }
    consume(bin,cut);
  }
  plans.push(mixed);
  // Objective: minimum total purchased linear length, then fewest stock pieces,
  // then least wasted offcut. This is deterministic; full global bin-packing
  // optimality for arbitrary large mixed lengths is not claimed.
  plans.sort((left,right)=>{
    const footage=(items:CutStock[])=>items.reduce((sum,item)=>sum+item.stockLengthFt,0);
    const diff=footage(left)-footage(right);
    return Math.abs(diff)>0.0001?diff:left.length-right.length ||
      left.reduce((sum,item)=>sum+item.remainderIn,0)-right.reduce((sum,item)=>sum+item.remainderIn,0);
  });
  return {stock:plans[0],issues};
}

export function buildDeckSkirting(
  edges: DeckEdgeSegment[], exposed: DeckEdgeSegment[], deckHeightFt: number,
  rimDepthIn: number, inputs: Inputs, prefix = ''
): SkirtPlan {
  const key=(name:string)=>prefix ? prefix+name.charAt(0).toUpperCase()+name.slice(1) : name;
  const tierId=prefix?'L':'M';
  const category=prefix?'Lower deck skirting':'Deck skirting';
  const enabled=inputs[key('skirtingEnabled')]===true || String(inputs[key('skirtingEnabled')])==='true';
  const material=String(inputs[key('skirtingMaterial')] ?? 'kdat');
  const orientation: 'horizontal' | 'vertical'=inputs[key('skirtingOrientation')]==='horizontal' ? 'horizontal' : 'vertical';
  const finishColor=String(inputs[key('skirtingColor')] ?? 'Natural / stain-ready');
  const faceIn=num(inputs[key('skirtingFaceIn')],material==='kdat'?4.5:5.5);
  const revealIn=num(inputs[key('skirtingRevealIn')],1);
  const gapIn=num(inputs[key('skirtingGapIn')],0.25);
  const kerfIn=num(inputs[key('skirtingKerfIn')],0.125);
  const trimIn=num(inputs[key('skirtingTrimIn')],0.25);
  const opts={material,orientation,finishColor,revealIn,gapIn,faceIn,kerfIn,trimIn};
  const empty:SkirtPlan={enabled,sides:[],materials:[],cuts:[],finishStock:[],frameStock:[],issues:[],notes:[],frameScrews:0,finishNails:0,finishScrews:0,options:opts};
  if(!enabled) return empty;
  const issues:string[]=[],notes:string[]=[];
  if(!['kdat','composite','pvc'].includes(material)) issues.push('Choose a supported skirting material.');
  if(![faceIn,gapIn,revealIn,kerfIn,trimIn].every(Number.isFinite) || faceIn<=0 || gapIn<0 || gapIn>2 || revealIn<0 || kerfIn<0 || trimIn<0) {
    issues.push('Invalid skirting board face, spacing, kerf or trimming allowance.'); return {...empty,issues};
  }
  const selections=parseJson(inputs[key('skirtingEdges')]);
  const selected=Array.isArray(selections)?selections.map(Number).filter(Number.isInteger):[];
  if(selected.length===0) issues.push('Select at least one side to receive skirting.');
  const groundRaw=parseJson(inputs[key('skirtingGrades')]);
  const gradeValues=Array.isArray(groundRaw)?groundRaw as SkirtGrade[]:[];
  const openingRaw=parseJson(inputs[key('skirtingOpenings')]);
  const openValues=Array.isArray(openingRaw)?openingRaw as SkirtOpening[]:[];
  const allowed=new Set(exposed.map((edge)=>edge.index));
  const defaultHeight=Math.max(0,deckHeightFt-(rimDepthIn+1)/12);
  const sides:SkirtSide[]=[];
  for(const edgeIndex of [...new Set(selected)]) {
    const edge=edges.find((e)=>e.index===edgeIndex);
    if(!edge || !allowed.has(edgeIndex)){issues.push('Skirting edge '+(edgeIndex+1)+' is unavailable or touches the house.');continue;}
    const length=edge.length;
    if(!(length>0)){issues.push('Skirting side has zero length.');continue;}
    const grade=gradeValues.find((item)=>Number(item.edgeIndex)===edgeIndex);
    const startHeightFt=grade?num(grade.startFt,NaN):defaultHeight;
    const endHeightFt=grade?num(grade.endFt,NaN):defaultHeight;
    if(!Number.isFinite(startHeightFt)||!Number.isFinite(endHeightFt)||startHeightFt<=0||endHeightFt<=0||startHeightFt>30||endHeightFt>30){
      issues.push('Side '+(edgeIndex+1)+': enter positive, measured grade heights under the rim.');continue;
    }
    const at=(station:number)=>startHeightFt+(endHeightFt-startHeightFt)*(station/length);
    const openings=openValues.filter((item)=>Number(item.edgeIndex)===edgeIndex)
      .map((item)=>({edgeIndex,offset:Number(item.offset),width:Number(item.width),kind:item.kind==='removable'?'removable' as const:
        item.kind==='hinged-gate'?'hinged-gate' as const:'opening' as const}))
      .sort((a,b)=>a.offset-b.offset);
    for(let i=0;i<openings.length;i++){
      const o=openings[i];
      if(!Number.isFinite(o.offset)||!Number.isFinite(o.width)||o.width<=0||o.offset<0||o.offset+o.width>length+0.00001 || (i>0&&o.offset<openings[i-1].offset+openings[i-1].width-0.00001))
        issues.push('Side '+(edgeIndex+1)+': access openings overlap or leave the side.');
      if(o.kind==='removable') issues.push('Side '+(edgeIndex+1)+': removable panel framing, finish, hinges and latch must be specified before ordering.');
    }
    const clippedOpenings=openings.filter((o)=>Number.isFinite(o.offset)&&Number.isFinite(o.width)&&o.width>0&&o.offset>=0&&o.offset+o.width<=length+0.00001);
    const exclude=clippedOpenings; // Both access openings and removable doors have separate finish/framing assemblies.
    const spans=subtractIntervals(length,exclude);
    const topRails=[{start:0,end:length}];
    const bottomRails=spans;
    // Maintain S&S standard: vertical 2x4 framing at 24 inches on center plus every jamb/corner.
    const rawStuds=uniq([...Array.from({length:Math.floor(length/2)+1},(_,i)=>i*2),length,
      ...exclude.flatMap((o)=>[o.offset,o.offset+o.width])]);
    const verticals:SkirtVertical[]=rawStuds.filter((x)=>!exclude.some((o)=>x>o.offset+0.001&&x<o.offset+o.width-0.001))
      .map((station)=>({station,heightFt:p3(at(station)),role:exclude.some((o)=>Math.abs(station-o.offset)<0.001||Math.abs(station-o.offset-o.width)<0.001)?'jamb' as const:'stud' as const}));
    const finish:SkirtVertical[]=[], courses:SkirtCourse[]=[];
    const finishCuts:SkirtCut[]=[],framingCuts:SkirtCut[]=[];
    const addCut=(material:'finish'|'2x4',lengthFt:number,location:string)=>{
      if(lengthFt<=0.001)return;
      const arr=material==='finish'?finishCuts:framingCuts;
      arr.push({id:tierId+'SK'+(edgeIndex+1)+'-'+material.toUpperCase()+'-'+(arr.length+1),edgeIndex,material,lengthFt:p3(lengthFt),location});
    };
    // Split long continuous framing over 24-inch stud stations. A framing
    // joint is supported by a stud; a finish board is never silently spliced.
    const cutContinuousRail=(start:number,end:number,label:string)=>{
      let from=start;
      while(end-from>0.001){
        const maxLength=16; // leave room for trimming and saw kerf from 20 ft stock
        if(end-from<=maxLength){ addCut('2x4',end-from,label+' from '+p3(from)+' to '+p3(end)+' ft');break; }
        const stud=rawStuds.filter((x)=>x>from+1&&x<=Math.min(end,from+maxLength)).sort((a,b)=>b-a)[0];
        if(stud===undefined){issues.push('Side '+(edgeIndex+1)+': no stud supports a long horizontal 2x4 joint.');break;}
        addCut('2x4',stud-from,label+' from '+p3(from)+' to '+p3(stud)+' ft (splice over stud)');
        from=stud;
      }
    };
    topRails.forEach((r)=>cutContinuousRail(r.start,r.end,'side '+(edgeIndex+1)+' top rail'));
    bottomRails.forEach((r)=>cutContinuousRail(r.start,r.end,'side '+(edgeIndex+1)+' ground-contact bottom rail'));
    verticals.forEach((p)=>addCut('2x4',p.heightFt,'side '+(edgeIndex+1)+' vertical '+p.role+' at '+p3(p.station)+' ft'));
    // A hinged skirting gate needs its own complete leaf framing and finish;
    // the opening-only schedule previously omitted the gate panel entirely.
    clippedOpenings.filter(o=>o.kind==='hinged-gate').forEach(o=>{
      const leafHeight=Math.max(.3,at(o.offset+o.width/2)-.18);
      addCut('2x4',Math.max(.2,o.width-.08),'hinged access leaf upper rail');
      addCut('2x4',Math.max(.2,o.width-.08),'hinged access leaf lower rail');
      addCut('2x4',leafHeight,'hinged access leaf left stile');
      addCut('2x4',leafHeight,'hinged access leaf right stile');
      if(orientation==='vertical'){
        const number=Math.max(1,Math.ceil(o.width/((faceIn+gapIn)/12)));
        for(let i=0;i<number;i++)addCut('finish',leafHeight,
          'hinged access gate finish board '+(i+1));
      }else{
        const number=Math.max(1,Math.ceil(leafHeight/((faceIn+gapIn)/12)));
        for(let i=0;i<number;i++)addCut('finish',Math.max(.2,o.width-.08),
          'hinged access gate horizontal finish '+(i+1));
      }
    });
    if(orientation==='vertical'){
      for(const span of spans){
        const increment=(faceIn+gapIn)/12;
        const count=Math.max(1,Math.ceil((span.end-span.start+gapIn/12)/increment));
        for(let n=0;n<count;n++){
          const x=span.start+n*increment, next=Math.min(span.end,x+faceIn/12);
          if(next<=x+0.00001)continue;
          const height=Math.max(at(x),at(next)); // Cut sufficient length to rip the sloped bottom edge.
          finish.push({station:p3(x),heightFt:p3(height),role:'finish'});
          addCut('finish',height,'side '+(edgeIndex+1)+' board at '+p3(x)+' ft (finish width '+p3((next-x)*12)+' in)');
        }
      }
    } else {
      const step=(faceIn+gapIn)/12;
      const rowCount=Math.ceil((Math.max(startHeightFt,endHeightFt)+gapIn/12)/step);
      for(let row=0;row<rowCount;row++){
        const y=row*step;
        // Where a sloped grade crosses this row, only the portion above grade receives a finish board.
        let low=0,high=length;
        if(Math.abs(endHeightFt-startHeightFt)<1e-8){
          if(startHeightFt<=y+0.00001)continue;
        } else {
          const xIntersect=(y-startHeightFt)/(endHeightFt-startHeightFt)*length;
          if(endHeightFt>startHeightFt)low=Math.max(0,xIntersect);
          else high=Math.min(length,xIntersect);
        }
        if(high-low<=0.001)continue;
        for(const span of spans){
          const s=Math.max(span.start,low),e=Math.min(span.end,high);
          if(e-s<=0.001)continue;
          courses.push({row,start:p3(s),end:p3(e),depthFt:p3(Math.min(faceIn/12,Math.max(0,Math.min(at(s),at(e))-y)))});
          addCut('finish',e-s,'side '+(edgeIndex+1)+' horizontal course '+(row+1)+' from '+p3(s)+' to '+p3(e)+' ft');
        }
      }
    }
    sides.push({edgeIndex,lengthFt:length,startHeightFt,endHeightFt,openings:clippedOpenings,verticals,finish,courses,topRails,bottomRails,finishCuts,framingCuts});
  }
  const finishCuts=sides.flatMap((side)=>side.finishCuts);
  const frameCuts=sides.flatMap((side)=>side.framingCuts);
  const finishLengths=material==='kdat'?[8,12,16,20]:[16,20];
  const finishPack=packSkirtCuts(finishCuts,finishLengths,kerfIn,trimIn);
  const framePack=packSkirtCuts(frameCuts,[8,10,12,16,20],kerfIn,trimIn);
  issues.push(...finishPack.issues,...framePack.issues);
  if(inputs[key('skirtingGradeConfirmed')]!==true&&String(inputs[key('skirtingGradeConfirmed')])!=='true')
    issues.push('Confirm actual grade heights and 2x4 ground-contact installation before issuing a supplier order.');
  if(orientation==='horizontal' && sides.some((side)=>Math.abs(side.startHeightFt-side.endHeightFt)>0.01))
    notes.push('Sloping grade: horizontal bottom courses need field scribing; confirm finished reveal and rip allowances.');
  notes.push('S&S skirting support: continuous top 2x4 below rim, bottom 2x4 at ground (except clear openings), and 2x4 verticals every 24 in O.C. with jambs.');
  notes.push('Ground-contact treated material, airflow and minimum clearances must be approved for this site; finish stock is not a structural footing.');
  const materials:MaterialItem[]=[];
  const groups=[
    {kind:'finish' as const, stock:finishPack.stock, name:material==='kdat'?'1x5 KDAT pressure-treated skirting':material==='pvc'?'PVC skirting board':'Composite skirting board', color:finishColor},
    {kind:'2x4' as const, stock:framePack.stock, name:'2x4 ground-contact-rated pressure-treated skirting support',color:'Ground-contact treatment - confirm grade'},
  ];
  for(const group of groups){
    for(const length of [...new Set(group.stock.map((item)=>item.stockLengthFt))]){
      const rows=group.stock.filter((item)=>item.stockLengthFt===length);
      const refs=rows.flatMap((r)=>r.cuts.map((cut)=>cut.id));
      materials.push({name:group.name,category,quantity:rows.length,unit:'boards',stockRecommendation:length+' ft stock',color:group.color,
        notes:group.kind==='finish' ? orientation+' · '+faceIn+' in face · '+gapIn+' in gap · '+refs.length+' cuts, '+kerfIn+' in saw kerf · '+trimIn+' in trim per stock'
          : 'Top/bottom/24 in O.C. framing and access jambs · '+refs.length+' cuts · verify ground contact',
        layoutLabel:refs.length<=12?refs.join(', '):refs.slice(0,12).join(', ')+', +'+(refs.length-12)+' more'});
    }
  }
  const accessGates=sides.flatMap(s=>s.openings.filter(o=>o.kind==='hinged-gate'));
  if(accessGates.length){
    materials.push({name:'Skirting access gate exterior hinges',category,
      quantity:accessGates.length*2,unit:'ea',
      stockRecommendation:'Exterior self-closing hinges, field-rated for gate size',
      notes:'Two hinges per hinged skirting access leaf; verify frame attachment and corrosion protection.'});
    materials.push({name:'Skirting access gate latch',category,
      quantity:accessGates.length,unit:'ea',stockRecommendation:'Exterior latch or slide bolt',
      notes:'One latch per skirting access gate, sized for available panel height.'});
  }
  const joinCount=sides.reduce((sum,s)=>sum+s.verticals.length*2+s.bottomRails.length*2+s.topRails.length*2,0);
  // Two exterior 3-inch structural framing screws per 2x4 connection.
  // The estimator combines this with the main framing screw box order,
  // rather than treating a connection location as a purchasable product.
  const frameScrews=joinCount*2;
  // An installed vertical board needs two attachments at each horizontal rail.
  // For horizontal courses, count two attachments at every intersecting 24in stud.
  const faceFasteners=orientation==='vertical'
    ? sides.reduce((sum,s)=>sum+s.finish.length*4,0)
    : sides.reduce((sum,s)=>sum+s.courses.reduce((courseSum,course)=>
        courseSum+2*Math.max(2,s.verticals.filter((v)=>v.station>=course.start-0.001&&v.station<=course.end+0.001).length),0),0);
  // 1x5 KDAT finish gets exterior 2-inch finish nails. Synthetic skirting
  // remains on manufacturer-approved screws instead of an unsuitable nail.
  const finishNails=material==='kdat'?faceFasteners:0;
  const finishScrews=material==='kdat'?0:faceFasteners;
  return {enabled,sides,materials,cuts:[...finishCuts,...frameCuts],finishStock:finishPack.stock,frameStock:framePack.stock,issues,notes,frameScrews,finishNails,finishScrews,options:opts};
}
