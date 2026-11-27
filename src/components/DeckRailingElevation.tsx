import { useMemo, useState } from 'react';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import { buildTimberTechIRE } from '../lib/deckRailing';
import { constructionDeckRailModel } from '../lib/constructionRailing';
import type { ConsultationProject } from '../lib/consultationProject';

type Inputs = Record<string, string | number | boolean>;
const ft=(n:number)=>n.toFixed(2).replace(/\.00$/,'')+' ft';
function RailingTierElevation({values,lower=false,project}: {values:Inputs;lower?:boolean;project?:ConsultationProject}) {
  const [current,setCurrent]=useState(0);
  const model=useMemo(()=>{
    const raw=lower?buildLowerTierDeckModel(values):buildDeckModel(values);
    return raw?constructionDeckRailModel(raw,project,lower):null;
  },[lower,values,project]);
  const plan=useMemo(()=>model?buildTimberTechIRE(model,values,lower?'Lower tier':'Main deck'):null,[model,values,lower]);
  if(!model||!plan||!plan.enabled)return null;
  const selected=plan.panels[Math.min(current,plan.panels.length-1)];
  const profile=plan.profile;
  const col=plan.color==='white'?'#d1d5db':plan.color==='dark-bronze'?'#604936':'#111827';
  const balusters=profile==='drink'?'#44403c':col;
  const h=plan.heightIn;
  const py=(inch:number)=>188-inch*3.2;
  return <section className="content-card full-width-card" style={{marginBottom:16}}>
    <div className="section-heading">
      <p className="eyebrow">{lower?'Lower tier':'Main deck'} / TimberTech Impression Rail Express</p>
      <h3>Railing elevations and compatible material schedule</h3>
      <p className="muted">The aluminum panel, separate top rail, post kit, and accessories in this elevation correspond to the calculated takeoff. Actual panel clear spans require manufacturer and distributor verification.</p>
    </div>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
      <label className="form-field" style={{minWidth:240}}><span>Inspect railing bay</span>
        <select value={Math.min(current,plan.panels.length-1)} onChange={(e)=>setCurrent(Number(e.target.value))}>
          {plan.panels.map((panel,index)=><option value={index} key={panel.label}>{panel.label+' · '+panel.kind+' · '+ft(panel.endFt-panel.startFt)}</option>)}
        </select>
      </label>
      <span className="muted">{plan.panels.length} panel kits · {plan.posts.length} distinct level-post coordinates</span>
    </div>
    {selected && (() => {
      const left=52,right=640,width=right-left,railWidth=right-left;
      const topY=py(h);
      const capsAbove=plan.postTermination==='above-top'||plan.postTermination==='above-drink';
      const leftCapTop=capsAbove?topY-27:topY-4;
      const topExtension=profile==='drink'?17:profile==='classic'?11:6;
      return <svg role="img" aria-label={'Railing bay '+selected.label+' '+profile+' top rail and '+plan.infill+' infill'} viewBox="0 0 700 230"
        style={{width:'100%',maxHeight:300,background:'#f9fafb',border:'1px solid #d1d5db',borderRadius:8}}>
        <rect x={left-18} y={188} width={width+36} height={11} fill="#a38d73"/>
        {plan.infill==='glass'
          ? <rect x={left+12} y={topY+13} width={width-24} height={171-topY} fill="#bfdbfe" fillOpacity={0.5} stroke={col} strokeWidth={3}/>
          : plan.infill==='horizontal-cable'
            ? Array.from({length:8},(_,i)=><line key={i} x1={left+12} y1={topY+18+i*(146-topY)/8}
                x2={right-12} y2={topY+18+i*(146-topY)/8} stroke={col} strokeWidth={2}/>)
            : Array.from({length:selected.stockFt===8?20:15},(_,i)=> {
              const count=selected.stockFt===8?20:15,x=left+15+(i+0.5)*(width-30)/count;
              return <line key={i} x1={x} y1={topY+13} x2={x} y2={171} stroke={balusters} strokeWidth={plan.infill==='midrail'?5:4}/>;
            })}
        {plan.infill==='midrail'&&<line x1={left+9} y1={topY+85} x2={right-9} y2={topY+85} stroke={col} strokeWidth={7}/>}
        <line x1={left} y1={172} x2={right} y2={172} stroke={col} strokeWidth={9}/>
        {profile==='drink'
          ? <g><rect x={left-25} y={topY-10} width={width+50} height={12} rx={1} fill="#967759" stroke={col} strokeWidth={3}/><line x1={left} y1={topY+8} x2={right} y2={topY+8} stroke={col} strokeWidth={7}/></g>
          : <rect x={left-8} y={topY-topExtension} width={railWidth+16} height={topExtension+8} rx={profile==='classic'?5:2} stroke={col} strokeWidth={2} fill={col}/>}
        {[left,right].map((x,i)=><g key={i}>
          <rect x={x-12} y={leftCapTop} width={24} height={188-leftCapTop} fill={col}/>
          {plan.postCap==='none'
            ? null
            : plan.postCap==='standard'
              ? <rect x={x-15} y={leftCapTop-5} width={30} height={6} rx={2} fill={col}/>
              : <g><rect x={x-16} y={leftCapTop-11} width={32} height={11} rx={3} fill={col}/>
                {plan.postCap!=='decorative'&&<circle cx={x} cy={leftCapTop-6} r={5} fill="#fbbf24" stroke="#92400e" strokeWidth={2}/>}</g>}
          <text x={x} y={211} fontSize={12} fill="#374151" textAnchor="middle">{i===0?'START POST':'END POST'}</text>
        </g>)}
        <text x={350} y={225} fontSize={11} fill="#4b5563" textAnchor="middle">{selected.label+' · '+selected.stockFt+' ft nominal panel, '+h+' in finished height'}</text>
      </svg>;
    })()}
    <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:10}}>
      <span className="muted">Top: <strong>{profile}</strong></span>
      <span className="muted">Finish: <strong>{plan.color}</strong></span>
      <span className="muted">Infill: <strong>{plan.infill}</strong></span>
      <span className="muted">Post termination: <strong>{plan.postTermination}</strong></span>
      <span className="muted">Caps/lighting: <strong>{plan.postCap}</strong></span>
    </div>
    {plan.issues.map((issue,index)=><p key={index} role="alert" style={{color:'#991b1b',marginTop:9}}>{issue}</p>)}
    {plan.notes.map((note,index)=><p key={index} className="muted" style={{fontSize:12}}>{note}</p>)}
  </section>;
}
export function DeckRailingElevation({values,project}:{values:Inputs;project?:ConsultationProject}){
  if(values.railingSystem!=='timbertech-ire')return null;
  return <><RailingTierElevation values={values} project={project}/>
    {(values.multiTierEnabled===true||String(values.multiTierEnabled)==='true')&&<RailingTierElevation values={values} lower project={project}/>}</>;
}
