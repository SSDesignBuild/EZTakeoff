import { useMemo, useState } from 'react';
import type { ConsultationProject } from '../lib/consultationProject';
import {
  deckVisualProducts, deckCollections, getDeckVisualProduct,
  railVisualProducts, getRailVisualProduct, coverVisualProducts, getCoverVisualProduct,
  getCoverFinish, type RailVisualProduct, type RailInfill, type CoverFamily, type CoverColor,
} from '../data/visualCatalog';

type Values=ConsultationProject['values'];
export function ManufacturerBoardPicker({values,onValues}:{
  values:Values;onValues:(values:Values)=>void;
}){
  const [search,setSearch]=useState('');
  const [collection,setCollection]=useState('All');
  const [broken,setBroken]=useState<Set<string>>(new Set());
  const filtered=useMemo(()=>deckVisualProducts.filter((item)=>
    (collection==='All'||item.collection===collection) &&
    (item.collection+' '+item.color+' '+item.family).toLowerCase().includes(search.toLowerCase())
  ),[search,collection]);
  const current=getDeckVisualProduct(values.deckingMaterial);
  const choose=(value:string)=>onValues({...values,deckingMaterial:value,deckingType:'composite'});
  return <section className="consultation-option-card manufacturer-board-picker">
    <header className="consultation-option-head">
      <div><h4>TimberTech · actual board photographs</h4>
        <p className="muted">Pick from manufacturer's collection photographs. Grain maps are applied to individual boards in the 3D model.</p>
      </div>
      <input type="search" value={search} placeholder="Filter color / grain" aria-label="Search decking colors"
        onChange={(e)=>setSearch(e.target.value)}/>
    </header>
    <div className="manufacturer-collection-tabs" role="group" aria-label="Filter decking collection">
      {['All',...deckCollections].map((name)=><button type="button" key={name}
        aria-pressed={collection===name} className={collection===name?'selected':''}
        onClick={()=>setCollection(name)}>{name}</button>)}
    </div>
    {!current&&<p className="manufacturer-selection-caution" role="status">
      Current selection: <strong>{String(values.deckingMaterial??'none')}</strong>.
      A manufacturer image is not yet verified for this choice. Select a verified TimberTech board below for textured rendering.
      Existing Admin Takeoff products remain available in Admin mode.
    </p>}
    <div className="manufacturer-board-grid">
      {filtered.map((item)=><button type="button" key={item.id}
        className={'manufacturer-board-card'+(values.deckingMaterial===item.label?' selected':'')}
        aria-pressed={values.deckingMaterial===item.label} onClick={()=>choose(item.label)}>
        <div className="manufacturer-board-image">
          {!broken.has(item.id)
            ? <img src={item.swatch} alt={item.collection+' '+item.color+' official decking grain swatch'}
                loading="lazy" onError={()=>setBroken((prev)=>new Set([...prev,item.id]))}/>
            : <div className="manufacturer-image-missing">Manufacturer photograph unavailable<br/>Check manufacturer color sample</div>}
          {values.deckingMaterial===item.label&&<span className="manufacturer-selected-mark">Selected ✓</span>}
        </div>
        <div className="manufacturer-board-metadata">
          <strong>{item.color}</strong>
          <span>{item.collection} · {item.family==='pvc'?'Advanced PVC':'Composite'}</span>
          <small>{item.grain.replace(/-/g,' ')} grain</small>
        </div>
      </button>)}
    </div>
    <footer className="manufacturer-source-footer">
      <span>{filtered.length} official color records · Photographs are manufacturer references; actual delivered product and lighting vary.</span>
      <a href="https://www.timbertech.com/colors/" target="_blank" rel="noreferrer">See TimberTech color guide</a>
    </footer>
  </section>;
}
const RAIL_COLORS:Record<string,string>={
 'white':'#e5e5e2','matte-white':'#e5e3dc','black':'#181c20','matte-black':'#222327',
 'dark-bronze':'#58493e','matte-espresso':'#382d26','kona':'#6a4c35','khaki':'#aea389',
 'pressure-treated':'#a38a64',
};
function RailStyleDiagram({rail,color,infill}:{
  rail:RailVisualProduct;color:string;infill:RailInfill;
}){
  const metal=rail.family==='metal';
  const width=rail.topWidthIn;
  const topHeight=rail.topHeightIn;
  const x0=25,x1=264,yTop=28,yBottom=145;
  const circular=['round-black'].includes(infill);
  const topRound=rail.geometry==='composite-radiance'||rail.geometry==='composite-premier';
  const thickTop=rail.geometry==='pvc-pinnacle'||rail.geometry==='composite-drink'||
    rail.geometry==='ire-drink'||width>=4.5;
  const postW=Math.max(9,rail.postWidthIn*2.6);
  return <svg viewBox="0 0 290 180" role="img" aria-label={rail.label+' sample railing geometry'}
    className="manufacturer-rail-drawing">
    <rect width="290" height="180" fill="#eff1f2"/>
    {[x0,x1].map((x,i)=><g key={i}>
      <rect x={x-postW/2} y={metal?yTop-8:yTop-12} width={postW} height={yBottom-yTop+26} fill={color}/>
      <rect x={x-postW/2-2} y={yTop-15} width={postW+4} height={7} fill={color} opacity={.95}/>
      <rect x={x-postW/2-4} y={yBottom+12} width={postW+8} height={5} fill={color}/>
    </g>)}
    {infill==='glass'?<rect x={x0+14} y={yTop+19} width={x1-x0-28} height={96}
      fill="#96c9dd" opacity=".47" stroke={color} strokeWidth="3"/>:
      infill==='horizontal-cable'?Array.from({length:8},(_,i)=>
        <line key={i} x1={x0+13} x2={x1-13} y1={yTop+18+i*12} y2={yTop+18+i*12} stroke="#6e7477" strokeWidth="1.5"/>):
      infill==='chippendale'||infill==='square-web'?<g stroke={color} strokeWidth={5}>
        <rect x={x0+16} y={yTop+19} width={x1-x0-32} height={95} fill="none"/>
        <path d={'M '+(x0+16)+' '+(yTop+19)+' L '+(x1-16)+' '+(yTop+114)+' M '+(x0+16)+' '+(yTop+114)+' L '+(x1-16)+' '+(yTop+19)}
          fill="none"/>
        {infill==='square-web'&&[x0+95,x0+159].map((x)=><line key={x} x1={x} y1={yTop+19} x2={x} y2={yTop+114}/>)}
      </g>:
      Array.from({length:metal?16:11},(_,i)=>{
        const n=metal?16:11,x=x0+14+i*(x1-x0-28)/(n-1);
        return <rect key={i} x={x-(circular?2:metal?3:5)} y={yTop+21}
          width={circular?4:metal?6:10} height={91} fill={['round-black','square-black','aluminum'].includes(infill)?'#24282c':color} rx={circular?2:0}/>;
      })}
    <rect x={x0} y={yBottom-12} width={x1-x0} height={metal?9:13} rx={topRound?4:0} fill={color}/>
    {thickTop
      ? <rect x={x0-6} y={yTop} width={x1-x0+12} height={Math.max(11,topHeight*4.2)} rx={topRound?7:1}
          fill={rail.geometry.includes('drink')?'#a88962':color} stroke={color} strokeWidth={2}/>
      : <g>
        <rect x={x0-4} y={yTop+6} width={x1-x0+8} height={Math.max(6,topHeight*3.5)} rx={topRound?6:1} fill={color}/>
        {topRound&&<rect x={x0-7} y={yTop+3} width={x1-x0+14} height={6} rx={3} fill={color}/>}
      </g>}
    <text x="145" y="172" fontSize="9" fill="#475569" textAnchor="middle">Geometry preview · {rail.topWidthIn}" top · {rail.postWidthIn}" posts</text>
  </svg>;
}
export function ManufacturerRailPicker({values,onValues}:{
  values:Values;onValues:(values:Values)=>void;
}){
  const selected=getRailVisualProduct(values.railingVisualId);
  const [filter,setFilter]=useState('All');
  const selectedColor=String(values.railingColor??'black');
  const selectedInfill=String(values.railingInfill??selected.infills[0]) as RailInfill;
  const choose=(style:RailVisualProduct)=>{
    const color=style.colors.includes(selectedColor)?selectedColor:style.colors[0];
    const infill=style.infills.includes(selectedInfill)?selectedInfill:style.infills[0];
    const railType=style.family==='metal'?'aluminum':style.family==='wood'?'wood':'vinyl-composite';
    onValues({...values,railingVisualId:style.id,railingType:railType,
      railingSystem:style.takeoffSystem==='timbertech-ire'?'timbertech-ire':'standard',
      railingTopProfile:style.geometry==='ire-modern'?'modern':style.geometry==='ire-drink'?'drink':'classic',
      railingColor:color,railingInfill:infill,
      spindleType:style.geometry==='wood-round-aluminum'?'black-round':style.geometry==='wood-picket'?'wood-pickets':values.spindleType});
  };
  return <section className="consultation-option-card manufacturer-rail-picker">
    <header className="consultation-option-head">
      <div><h4>Railing collections & real profile geometry</h4>
        <p className="muted">Metal · PVC · Composite · Pressure-treated · Vinyl</p>
      </div>
      <div className="manufacturer-collection-tabs" role="group" aria-label="Railing material filters">
        {['All','metal','pvc','composite','vinyl','wood'].map((value)=>
          <button type="button" className={filter===value?'selected':''} key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>
            {value==='All'?'All styles':value.toUpperCase()}</button>)}
      </div>
    </header>
    <div className="manufacturer-rail-grid">
      {railVisualProducts.filter((style)=>filter==='All'||style.family===filter).map((style)=>{
        const active=selected.id===style.id;
        return <button type="button" className={'manufacturer-rail-card'+(active?' selected':'')} key={style.id}
          aria-pressed={active} onClick={()=>choose(style)}>
          <RailStyleDiagram rail={style} color={RAIL_COLORS[style.colors[0]]??'#353535'} infill={style.infills[0]}/>
          <strong>{style.label}</strong>
          <small>{style.summary}</small>
          <span className="manufacturer-rail-family">{style.family.toUpperCase()} · {style.colors.join(' / ')}</span>
        </button>;
      })}
    </div>
    <div className="manufacturer-selected-rail">
      <strong>{selected.label}</strong>
      <div className="manufacturer-rail-config">
        <label>Railing finish
          <select value={selected.colors.includes(selectedColor)?selectedColor:selected.colors[0]}
            onChange={(e)=>onValues({...values,railingColor:e.target.value})}>
            {selected.colors.map((color)=><option key={color} value={color}>{color.replace(/-/g,' ')}</option>)}
          </select></label>
        <label>Infill style
          <select value={selected.infills.includes(selectedInfill)?selectedInfill:selected.infills[0]}
            onChange={(e)=>onValues({...values,railingInfill:e.target.value})}>
            {selected.infills.map((item)=><option key={item} value={item}>{item.replace(/-/g,' ')}</option>)}
          </select></label>
        <label>Railing height
          <select value={String(values.railingHeightIn??'36')} onChange={(e)=>onValues({...values,railingHeightIn:e.target.value})}>
            <option value="36">36 inches</option><option value="42">42 inches</option>
          </select></label>
      </div>
      {selected.sourcePage&&<a href={selected.sourcePage} target="_blank" rel="noreferrer">Manufacturer specifications</a>}
      {selected.takeoffSystem!=='timbertech-ire'&&<p className="manufacturer-selection-caution">
        Visualization is style-specific. This railing family still needs a manufacturer-specific SKU/kit purchase scheduler;
        the external estimator handoff is flagged until that mapping is verified.
      </p>}
    </div>
  </section>;
}
function CoverSilhouette({family,finish}:{family:CoverFamily;finish:string}){
  const product=getCoverVisualProduct(family);
  const color=getCoverFinish(finish);
  if(family==='none')return <svg viewBox="0 0 260 145" role="img" aria-label="Uncovered deck"><rect width="260" height="145" fill="#eff2f3"/><path d="M24 108 L236 108 L222 117 L37 117Z" fill="#8f765e"/><text x="130" y="72" textAnchor="middle" fill="#64748b" fontSize="15">No roof</text></svg>;
  return <svg viewBox="0 0 260 145" role="img" aria-label={family+' patio cover architectural family'}>
    <rect width="260" height="145" fill="#e9eff3"/>
    <rect x="22" y="112" width="218" height="5" fill="#977a5e"/>
    <g fill={color} stroke="#4e5356" strokeWidth="1">
      <rect x="35" y="36" width="7" height="75" rx="1"/>
      <rect x="221" y="36" width="7" height="75" rx="1"/>
      <path d="M27 35 L236 35 L240 42 L25 42Z"/>
      {product.family==='solid-studio'&&<path d="M25 32 L235 25 L237 35 L25 42Z"/>}
      {product.family==='solid-truss-ends'&&<><path d="M25 32 L235 25 L237 35 L25 42Z"/><path d="M41 40 L66 54 L89 40 M178 40 L201 54 L223 40" fill="none" strokeWidth="4"/></>}
      {product.family==='full-trusses'&&<><path d="M25 28 L130 7 L237 28 L237 37 L25 37Z"/><path d="M42 40 L130 23 L218 40 L130 56 Z" fill="none" strokeWidth="3"/><line x1="130" y1="23" x2="130" y2="56" strokeWidth="3"/></>}
      {product.family==='translucent'&&<><path d="M25 28 L236 28 L238 40 L25 40Z" fill="#c9e5eb" opacity=".85"/>{Array.from({length:8},(_,i)=><line key={i} x1={36+i*25} y1="23" x2={36+i*25} y2="46" strokeWidth="3"/>)}</>}
      {product.family==='lattice'&&Array.from({length:13},(_,i)=><line key={i} x1={28+i*16} y1="26" x2={28+i*16} y2="46" strokeWidth="3"/>)}
      {product.family==='louvered'&&Array.from({length:11},(_,i)=><path key={i} d={'M'+(30+i*18)+' 29 l11 8'} strokeWidth="5" strokeLinecap="round"/>)}
    </g>
    <text x="130" y="135" fill="#475569" fontSize="11" textAnchor="middle">{family} · manufacturer family diagram</text>
  </svg>;
}
export function ManufacturerCoverPicker({project,onChange}:{
  project:ConsultationProject;onChange:(changes:Partial<ConsultationProject>)=>void;
}){
  const selected=getCoverVisualProduct(project.coverFamily);
  return <section className="consultation-option-card manufacturer-cover-picker">
    <header className="consultation-option-head"><div><h4>Renaissance patio cover collections</h4>
      <p className="muted">Distinct studio, truss, translucent, lattice and louvered architectural geometry.</p></div>
    </header>
    <div className="manufacturer-cover-grid">
      {coverVisualProducts.map((item)=><button type="button" key={item.id}
        className={'manufacturer-cover-card'+(project.coverFamily===item.id?' selected':'')}
        aria-pressed={project.coverFamily===item.id}
        onClick={()=>onChange({coverFamily:item.id,kind:item.id==='none'?'deck':'covered-deck',
          coverColor:item.colors.includes(project.coverColor)?project.coverColor:item.colors[0],
          coverRoofStyle:item.roofStyles.includes(project.coverRoofStyle??'studio')?project.coverRoofStyle:'studio'})}>
        <CoverSilhouette family={item.id} finish={project.coverColor}/>
        <strong>{item.name}</strong>
        <small>{item.description}</small>
      </button>)}
    </div>
    {project.coverFamily!=='none'&&<div className="manufacturer-cover-options">
      <div><strong>{selected.name}</strong><small>{selected.description}</small>
        <a href={selected.sourcePage} target="_blank" rel="noreferrer">View Renaissance product page</a></div>
      <div className="manufacturer-color-choices">
        {selected.colors.map((color)=><button type="button" key={color} aria-pressed={color===project.coverColor}
          className={color===project.coverColor?'selected':''} onClick={()=>onChange({coverColor:color})}>
          <span style={{background:getCoverFinish(color)}}/>{color}</button>)}
      </div>
      {selected.roofStyles.length>1&&<label>Roof shape
        <select value={project.coverRoofStyle??'studio'}
          onChange={(e)=>onChange({coverRoofStyle:e.target.value as 'studio'|'gable'})}>
          <option value="studio">Studio / lean-to</option><option value="gable">Gable / A-frame</option>
        </select></label>}
      {selected.family==='lattice'&&<label>Shade lattice coverage: {project.coverShadePercent??65}%
        <input type="range" min={40} max={90} step={5} value={project.coverShadePercent??65}
          onChange={(e)=>onChange({coverShadePercent:Number(e.target.value)})}/></label>}
      {selected.family==='louvered'&&<label>Louver opening: {project.coverLouverAngle??12}°
        <input type="range" min={0} max={90} step={5} value={project.coverLouverAngle??12}
          onChange={(e)=>onChange({coverLouverAngle:Number(e.target.value)})}/></label>}
    </div>}
    <p className="manufacturer-source-footer">3D profiles are based on verified architectural differences, but remain concept geometry. Exact Renaissance extrusion drawings, span schedules and cover BOM are not yet incorporated.</p>
  </section>;
}
