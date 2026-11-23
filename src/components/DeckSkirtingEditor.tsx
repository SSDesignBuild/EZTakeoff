import { useMemo, useState } from 'react';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import { buildDeckSkirting, type SkirtGrade, type SkirtOpening, type SkirtSide } from '../lib/deckSkirting';
import { buildDeckStairSkirting } from '../lib/deckStairSkirting';

type Values = Record<string, string | number | boolean>;
type OnChange = (updater: (values: Values) => Values) => void;
const parseArray = <T,>(raw: unknown): T[] => {
  if(typeof raw!=='string')return [];
  try { const value=JSON.parse(raw);return Array.isArray(value)?value as T[]:[]; } catch {return [];}
};
const fieldStyle={minWidth:92,width:'100%',borderRadius:6,padding:7,border:'1px solid #9ca3af'} as const;
const ft=(value:number)=>value.toFixed(2).replace(/\.00$/,'')+' ft';
const rimIn=(size:string)=>Math.max(3.5,Number(size.split('x')[1]||8)-0.75);
function SkirtingElevation({side,orientation,framing,gapIn,faceIn}:{
  side:SkirtSide;orientation:'vertical'|'horizontal';framing:boolean;gapIn:number;faceIn:number;
}) {
  const scale=Math.min(620/Math.max(1,side.lengthFt),115/Math.max(1,side.startHeightFt,side.endHeightFt));
  const px=(value:number)=>35+value*scale;
  const top=40;
  const stair=side.kind==='stair';
  const at=(x:number)=>side.startHeightFt+(side.endHeightFt-side.startHeightFt)*x/side.lengthFt;
  const topAt=(x:number)=>stair?top+(side.startHeightFt-at(x))*scale:top;
  const ground=(x:number)=>stair?top+side.startHeightFt*scale:top+at(x)*scale;
  const w=700,h=Math.max(190,Math.max(ground(0),ground(side.lengthFt))+35);
  return <svg role="img" data-export-skirting="true" data-export-skirt-label={side.label ?? ('Deck side '+(side.edgeIndex+1))}
    data-export-skirt-layer={framing?'framing':'finish'}
    aria-label={(side.label ?? 'Side '+(side.edgeIndex+1))+' elevation showing '+(framing?'2x4 support framing':'skirting finish')} viewBox={'0 0 '+w+' '+h}
    style={{display:'block',width:'100%',maxHeight:260,background:'#f9fafb',border:'1px solid #d1d5db',borderRadius:8}}>
    <line x1={px(0)} y1={topAt(0)-7} x2={px(side.lengthFt)} y2={topAt(side.lengthFt)-7} stroke="#374151" strokeWidth={8}/>
    {!framing && orientation==='vertical' && side.finish.map((board,i)=>{
      const bottom=ground(board.station);
      return <line key={'board-'+i} x1={px(board.station)} y1={topAt(board.station)} x2={px(board.station)} y2={bottom}
        stroke="#9b7b58" strokeWidth={Math.max(2,Math.min(faceIn*scale/12,11))}/>;
    })}
    {!framing && orientation==='horizontal' && side.courses.map((c,i)=><line key={'course-'+i}
      x1={px(c.start)} y1={stair ? ground(c.start)-(c.row*(faceIn+gapIn)/12)*scale-3 : top+(c.row*(faceIn+gapIn)/12)*scale+3}
      x2={px(c.end)} y2={stair ? ground(c.end)-(c.row*(faceIn+gapIn)/12)*scale-3 : top+(c.row*(faceIn+gapIn)/12)*scale+3}
      stroke="#9b7b58" strokeWidth={Math.max(2,Math.min(faceIn*scale/12-1,9))}/>)}
    {framing && <>
      {side.topRails.map((rail,i)=><line key={'top-'+i} x1={px(rail.start)} y1={topAt(rail.start)} x2={px(rail.end)} y2={topAt(rail.end)} stroke="#2563eb" strokeWidth={6}/>)}
      {side.bottomRails.map((rail,i)=><line key={'bottom-'+i} x1={px(rail.start)} y1={ground(rail.start)-3} x2={px(rail.end)} y2={ground(rail.end)-3} stroke="#2563eb" strokeWidth={6}/>)}
      {side.verticals.map((stud,i)=><line key={'stud-'+i} x1={px(stud.station)} y1={topAt(stud.station)} x2={px(stud.station)} y2={ground(stud.station)}
        stroke={stud.role==='jamb'?'#dc2626':'#2563eb'} strokeWidth={stud.role==='jamb'?6:4}/>)}
    </>}
    <line x1={px(0)-10} y1={ground(0)} x2={px(side.lengthFt)+10} y2={ground(side.lengthFt)} stroke="#6b7280" strokeWidth={2} strokeDasharray="5 4"/>
    {side.openings.map((opening,i)=><g key={'opening-'+i}>
      <rect x={px(opening.offset)} y={top+3} width={Math.max(1,opening.width*scale)}
        height={Math.max(0,Math.min(ground(opening.offset),ground(opening.offset+opening.width))-top-7)}
        fill="white" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4"/>
      <text x={px(opening.offset+opening.width/2)} y={top+25} fontSize={11} textAnchor="middle" fill="#991b1b">
        {opening.kind==='hinged-gate'?'GATE':opening.kind==='removable'?'LEGACY PANEL':'ACCESS'}
      </text>
    </g>)}
    <text x={px(side.lengthFt/2)} y={Math.max(ground(0),ground(side.lengthFt))+20} fontSize={13} textAnchor="middle" fill="#374151">{ft(side.lengthFt)} · {side.label ?? ('E'+(side.edgeIndex+1))}</text>
    <text x={px(0)} y={topAt(0)-19} fontSize={11} fill="#4b5563">{ft(side.startHeightFt)}</text>
    <text x={px(side.lengthFt)} y={topAt(side.lengthFt)-19} fontSize={11} textAnchor="end" fill="#4b5563">{ft(side.endHeightFt)}</text>
  </svg>;
}
function TierSkirting({values,onValuesChange,lower=false}: {values:Values;onValuesChange:OnChange;lower?:boolean}) {
  const [framing,setFraming]=useState(false);
  const prefix=lower?'lower':'';
  const k=(name:string)=>prefix ? prefix+name.charAt(0).toUpperCase()+name.slice(1) : name;
  const model=useMemo(()=>lower?buildLowerTierDeckModel(values):buildDeckModel(values),[lower,values]);
  const deckHeightFt=Number(lower?values.lowerDeckHeight:values.deckHeight)||0;
  const gradeBase=Math.max(0.1,deckHeightFt-(model?rimIn(model.joistSize)+1:8.25)/12);
  const plan=useMemo(()=>model?buildDeckSkirting(model.edgeSegments,model.exposedSegments,deckHeightFt,rimIn(model.joistSize),values,prefix):null,[model,values,deckHeightFt,prefix]);
  const stairPlan=useMemo(()=>model?buildDeckStairSkirting(model,values,lower):null,[model,values,lower]);
  const selected=parseArray<number>(values[k('skirtingEdges')]).map(Number);
  const grades=parseArray<SkirtGrade>(values[k('skirtingGrades')]);
  const openings=parseArray<SkirtOpening>(values[k('skirtingOpenings')]);
  const update=(key:string,val:string|number|boolean)=>onValuesChange((old)=>({...old,[k(key)]:val,...((key==='skirtingGrades'||key==='skirtingOpenings'||key==='skirtingEdges')?{[k('skirtingGradeConfirmed')]:false}:{})}));
  const allCuts=[...(plan?.cuts??[]),...(stairPlan?.cuts??[])];
  const cutToStock=new Map<string,string>();
  for(const [type,group] of [['Finish',plan?.finishStock??[]],['2x4',plan?.frameStock??[]],
    ['Stair finish',stairPlan?.finishStock??[]],['Stair 2x4',stairPlan?.frameStock??[]]] as const)
    group.forEach((stock,index)=>stock.cuts.forEach((cut)=>cutToStock.set(cut.id,type+' #'+(index+1)+' / '+stock.stockLengthFt+' ft')));
  const exportCutCsv=()=>{
    if(!plan)return;
    const rows=[['Cut reference','Stock assignment','Material','Finished length (ft)','Installation location'],
      ...allCuts.map((cut)=>[cut.id,cutToStock.get(cut.id)??'UNALLOCATED',cut.material,String(cut.lengthFt),cut.location])];
    const csv=rows.map((row)=>row.map((value)=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=(lower?'lower-':'')+'deck-skirting-installer-cuts.csv';a.click();URL.revokeObjectURL(url);
  };
  const updateGrade=(edgeIndex:number,which:'startFt'|'endFt',height:number)=>{
    const existing=grades.find((g)=>g.edgeIndex===edgeIndex)||{edgeIndex,startFt:gradeBase,endFt:gradeBase};
    const next=[...grades.filter((g)=>g.edgeIndex!==edgeIndex),{...existing,[which]:height}];
    update('skirtingGrades',JSON.stringify(next));
  };
  if(!model||!plan)return null;
  const toggleSide=(index:number)=>{
    const next=selected.includes(index)?selected.filter((x)=>x!==index):[...selected,index].sort((a,b)=>a-b);
    update('skirtingEdges',JSON.stringify(next));
  };
  const addOpening=(edgeIndex:number)=>{
    const edge=model.edgeSegments.find((s)=>s.index===edgeIndex);if(!edge)return;
    const width=Math.min(3,edge.length/2);
    const offset=Math.max(0,(edge.length-width)/2);
    update('skirtingOpenings',JSON.stringify([...openings,{edgeIndex,offset,width,kind:'opening'}]));
  };
  return <section className="content-card full-width-card" data-export-skirt-tier={lower?'Lower deck':'Main deck'} style={{marginBottom:16}}>
    <div className="section-heading">
      <p className="eyebrow">{lower?'Lower tier':'Main deck'} / finish and supports</p>
      <h3>Deck skirting — elevations and material cut plan</h3>
      <p className="muted">Select sides, measure heights from the underside of the rim to finished grade, and add access openings. Every elevation and stock cut comes from the same geometry.</p>
    </div>
    <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:15}}>
      {model.exposedSegments.map((edge)=><button key={'edge-'+edge.index} type="button"
        className={selected.includes(edge.index)?'secondary-btn small-btn':'ghost-btn small-btn'}
        aria-pressed={selected.includes(edge.index)} onClick={()=>toggleSide(edge.index)}>
        {'Side '+(edge.index+1)+' · '+ft(edge.length)} {selected.includes(edge.index)?'✓':''}
      </button>)}
    </div>
    <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
      <strong>{plan.sides.length} deck sides + {stairPlan?.sides.length??0} stair sides · {plan.finishStock.length+(stairPlan?.finishStock.length??0)} finish boards · {plan.frameStock.length+(stairPlan?.frameStock.length??0)} 2×4 stock pieces</strong>
      <div className="preview-toolbar">
        <button type="button" className={framing?'ghost-btn small-btn':'secondary-btn small-btn'} onClick={()=>setFraming(false)}>Finish elevation</button>
        <button type="button" className={framing?'secondary-btn small-btn':'ghost-btn small-btn'} onClick={()=>setFraming(true)}>2×4 support framing</button>
      </div>
    </div>
    {plan.issues.map((issue,i)=><p key={'issue-'+i} role="alert" style={{color:'#b91c1c'}}>{issue}</p>)}
    {plan.sides.map((side)=><article key={'side-'+side.edgeIndex} data-export-skirt-card="true" style={{border:'1px solid #d1d5db',borderRadius:10,padding:12,marginBottom:14}}>
      <SkirtingElevation side={side} framing={framing} orientation={plan.options.orientation} gapIn={plan.options.gapIn} faceIn={plan.options.faceIn}/>
      <div className="skirting-export-counterpart" aria-hidden="true">
        <SkirtingElevation side={side} framing={!framing} orientation={plan.options.orientation} gapIn={plan.options.gapIn} faceIn={plan.options.faceIn}/>
      </div>
      <div className="form-grid organized-config-grid" style={{marginTop:12}}>
        <label className="form-field"><span>Side {side.edgeIndex+1}: starting ground height (ft)</span>
          <input type="number" min={0.1} step={1/12} style={fieldStyle} value={(grades.find((x)=>x.edgeIndex===side.edgeIndex)?.startFt??gradeBase).toFixed(3)}
            onChange={(e)=>updateGrade(side.edgeIndex,'startFt',Number(e.target.value))}/></label>
        <label className="form-field"><span>Ending ground height (ft)</span>
          <input type="number" min={0.1} step={1/12} style={fieldStyle} value={(grades.find((x)=>x.edgeIndex===side.edgeIndex)?.endFt??gradeBase).toFixed(3)}
            onChange={(e)=>updateGrade(side.edgeIndex,'endFt',Number(e.target.value))}/></label>
      </div>
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:10,margin:'12px 0'}}>
        <strong>Access openings</strong>
        <button type="button" className="ghost-btn small-btn" onClick={()=>addOpening(side.edgeIndex)}>+ Add access opening</button>
      </div>
      {openings.filter((o)=>o.edgeIndex===side.edgeIndex).map((o,i)=><div key={'opening-'+i} style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:9,margin:'9px 0'}}>
        <label>Start (ft) <input type="number" min={0} max={side.lengthFt} step={1/12} style={{...fieldStyle,width:85}}
          value={o.offset} onChange={(e)=>{const next=openings.map((item)=>item===o?{...item,offset:Number(e.target.value)}:item);update('skirtingOpenings',JSON.stringify(next));}}/></label>
        <label>Width (ft) <input type="number" min={0.25} max={side.lengthFt} step={1/12} style={{...fieldStyle,width:85}}
          value={o.width} onChange={(e)=>{const next=openings.map((item)=>item===o?{...item,width:Number(e.target.value)}:item);update('skirtingOpenings',JSON.stringify(next));}}/></label>
        <label>Style <select style={fieldStyle} value={o.kind}
          onChange={(e)=>update('skirtingOpenings',JSON.stringify(openings.map((item)=>item===o?{...item,kind:e.target.value}:item)))}>
          <option value="opening">Open access</option><option value="hinged-gate">Hinged access gate</option>
          {o.kind==='removable'&&<option value="removable">Legacy removable panel — convert before ordering</option>}
        </select></label>
        {o.kind==='hinged-gate'&&<label>Gate height (ft) <input type="number" min={.5}
          max={Math.max(.5,Math.min(side.startHeightFt,side.endHeightFt)-.18)}
          step={1/12} style={{...fieldStyle,width:90}} value={o.heightFt??Math.max(.5,Math.min(side.startHeightFt,side.endHeightFt)-.18)}
          onChange={e=>update('skirtingOpenings',JSON.stringify(openings.map(item=>item===o?{...item,heightFt:Number(e.target.value)}:item)))}/></label>}
        <button type="button" className="ghost-btn small-btn" onClick={()=>update('skirtingOpenings',JSON.stringify(openings.filter((item)=>item!==o)))}>Remove</button>
      </div>)}
      <small className="muted">{side.finishCuts.length} finish cuts · {side.framingCuts.length} 2×4 cuts · {side.verticals.length} vertical 2×4 supports at 24″ O.C./jambs</small>
    </article>)}
    {!!stairPlan?.sides.length && <div className="stair-skirting-sections">
      <h4>Stair skirting — both sloping sides of every flight</h4>
      <p className="muted">Includes sloped upper rails, ground-level 2×4 framing and vertical supports at 24 inches on center. Confirm the toe clearance and field slope.</p>
      {stairPlan.issues.map((issue,i)=><p role="alert" key={i} style={{color:'#b91c1c'}}>{issue}</p>)}
      {stairPlan.sides.map((side)=><article className="stair-skirting-elevation" data-export-skirt-card="true" key={side.edgeIndex}>
        <h5>{side.label}</h5>
        <SkirtingElevation side={side} orientation={stairPlan.options.orientation} framing={framing}
          gapIn={stairPlan.options.gapIn} faceIn={stairPlan.options.faceIn}/>
        <div className="skirting-export-counterpart" aria-hidden="true">
          <SkirtingElevation side={side} orientation={stairPlan.options.orientation} framing={!framing}
            gapIn={stairPlan.options.gapIn} faceIn={stairPlan.options.faceIn}/>
        </div>
        <small className="muted">{side.finishCuts.length} finish cuts · {side.framingCuts.length} support cuts</small>
      </article>)}
    </div>}
    <div className="callout-box compact-card">
      <strong>Supplier / installer reconciliation</strong>
      <p className="muted">Finish stock: {plan.finishStock.map((s,i)=>'S'+(i+1)+' '+s.stockLengthFt+'ft → '+s.cuts.map((cut)=>cut.id).join('+')).join('; ')||'None'}.</p>
      <p className="muted">2×4 framing stock: {plan.frameStock.map((s,i)=>'F'+(i+1)+' '+s.stockLengthFt+'ft → '+s.cuts.map((cut)=>cut.id).join('+')).join('; ')||'None'}.</p>
      <p className="muted">Saw kerf and stock trimming are included. Gate height, hardware and ground contact specifications require field approval. Legacy removable panels must be converted before ordering.</p>
    </div>
    <details style={{marginTop:15}}>
      <summary style={{fontWeight:700,cursor:'pointer'}}>Installer cut list — {allCuts.length} exact pieces (deck + stairs)</summary>
      <button type="button" className="secondary-btn small-btn" onClick={exportCutCsv} style={{margin:'12px 0'}}>Download installer cut CSV</button>
      <div className="table-wrap" style={{maxHeight:360,overflow:'auto'}}>
        <table><thead><tr><th>Reference</th><th>Purchase stock</th><th>Material</th><th>Finished cut</th><th>Install location</th></tr></thead>
          <tbody>{allCuts.map((cut)=><tr key={cut.id}><td>{cut.id}</td>
            <td>{cutToStock.get(cut.id)??'Not allocated'}</td><td>{cut.material==='2x4'?'2×4 support':'Finish board'}</td>
            <td>{ft(cut.lengthFt)}</td><td>{cut.location}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
export function DeckSkirtingEditor({values,onValuesChange}: {values:Values;onValuesChange:OnChange}){
  const main=values.skirtingEnabled===true||String(values.skirtingEnabled)==='true';
  const lowerEnabled=values.multiTierEnabled===true||String(values.multiTierEnabled)==='true';
  const lower=lowerEnabled&&(values.lowerSkirtingEnabled===true||String(values.lowerSkirtingEnabled)==='true');
  if(!main&&!lower)return null;
  return <div>{main&&<TierSkirting values={values} onValuesChange={onValuesChange}/>}
    {lower&&<TierSkirting values={values} onValuesChange={onValuesChange} lower/>}</div>;
}
