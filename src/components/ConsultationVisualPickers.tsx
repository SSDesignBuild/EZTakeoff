import { useMemo, useState } from 'react';
import { railingPhotos, coverPhotos, type PhotoReference } from '../data/consultationPhotos';
import type { ConsultationProject } from '../lib/consultationProject';
import {
  deckVisualProducts, deckCollections, getDeckVisualProduct,
  railVisualProducts, getRailVisualProduct, coverVisualProducts, getCoverVisualProduct,
  getCoverFinish, type RailVisualProduct, type RailInfill,
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
function ProductPhoto({photo,name,fallback}:{photo?:PhotoReference;name:string;fallback:string}){
  const [failed,setFailed]=useState(false);
  if(!photo||failed)return <div className="manufacturer-photo manufacturer-photo--missing">
    <strong>Manufacturer photo not available</strong>
    <span>View the actual {name} gallery to verify appearance.</span>
    {fallback&&<small className="photo-source-text">Manufacturer gallery linked in product details</small>}
  </div>;
  return <div className="manufacturer-photo">
    <img src={photo.url} loading="lazy" alt={name+' installed manufacturer product photograph'}
      referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
    <span className="photo-credit">{photo.credit}</span>
    {photo.qualifier&&<span className="photo-qualifier">{photo.qualifier}</span>}
  </div>;
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
      <div><h4>Railing systems · actual installation photos</h4>
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
          <ProductPhoto photo={railingPhotos[style.id]} name={style.label} fallback={style.sourcePage}/>
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
export function ManufacturerCoverPicker({project,onChange}:{
  project:ConsultationProject;onChange:(changes:Partial<ConsultationProject>)=>void;
}){
  const selected=getCoverVisualProduct(project.coverFamily);
  return <section className="consultation-option-card manufacturer-cover-picker">
    <header className="consultation-option-head"><div><h4>Renaissance cover styles · installation gallery</h4>
      <p className="muted">Choose a true manufacturer model. The 3D assembly follows this family and your selected frame profile.</p></div>
    </header>
    <div className="manufacturer-cover-grid">
      {coverVisualProducts.map((item)=><button type="button" key={item.id}
        className={'manufacturer-cover-card'+(project.coverFamily===item.id?' selected':'')}
        aria-pressed={project.coverFamily===item.id}
        onClick={()=>onChange({coverFamily:item.id,kind:item.id==='none'?'deck':'covered-deck',
          coverColor:item.colors.includes(project.coverColor)?project.coverColor:item.colors[0],
          coverRoofStyle:item.roofStyles.includes(project.coverRoofStyle??'studio')?project.coverRoofStyle:'studio'})}>
        <ProductPhoto photo={coverPhotos[item.id]} name={item.name+' Renaissance'} fallback={item.sourcePage}/>
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
      <div className="consultation-skirting-finish">
        <label>Renaissance structural frame profile
          <select value={project.coverFraming??'standard'}
            onChange={e=>onChange({coverFraming:e.target.value as 'standard'|'hd'|'wide'|'wide-insert'})}>
            <option value="standard">Standard (SD) · engineered extrusion</option>
            <option value="hd">Heavy Duty (HD) · engineered extrusion</option>
            <option value="wide">Wide (WD) · architectural open span</option>
            <option value="wide-insert">Wide + insert · reinforced visual configuration</option>
          </select></label>
        <label>Cover placement
          <select value={project.coverMount??'wall-attached'}
            onChange={e=>onChange({coverMount:e.target.value as 'wall-attached'|'freestanding'})}>
            <option value="wall-attached">Attached to house / existing structure</option>
            <option value="freestanding">Freestanding · posts front and back</option>
          </select></label>
        <label>Screen walls
          <select value={project.coverScreenStyle??'none'}
            onChange={e=>onChange({coverScreenStyle:e.target.value as 'none'|'dolce-open-view'|'dolce-standard'})}>
            <option value="none">No screens · open patio</option>
            <option value="dolce-open-view">Dolce · open-view screened walls</option>
            <option value="dolce-standard">Dolce · standard screened panels</option>
          </select></label>
      </div>
      <div className="consultation-skirting-finish">
        <label>Roof width (ft) · 0 = follow deck
          <input type="number" min={0} max={100} step={.5} value={project.coverWidthFt??0}
            onChange={e=>onChange({coverWidthFt:Number(e.target.value)})}/></label>
        <label>Roof projection (ft) · 0 = follow deck
          <input type="number" min={0} max={80} step={.5} value={project.coverProjectionFt??0}
            onChange={e=>onChange({coverProjectionFt:Number(e.target.value)})}/></label>
        <label>Clear headroom above deck (ft)
          <input type="number" min={7} max={16} step={.25} value={project.coverHeightFt??9}
            onChange={e=>onChange({coverHeightFt:Number(e.target.value)})}/></label>
      </div>
      <details className="consultation-subsettings">
        <summary>Structural layout options · post placement & roof overhangs</summary>
        <div className="consultation-subsettings-content consultation-skirting-finish">
          <label>Front support posts (0 = initial layout)
            <input type="number" min={0} max={18} step={1} value={project.coverPostCount??0}
              onChange={e=>onChange({coverPostCount:Number(e.target.value)})}/></label>
          <label>Side roof overhang (ft)
            <input type="number" min={0} max={5} step={.25} value={project.coverSideOverhangFt??1}
              onChange={e=>onChange({coverSideOverhangFt:Number(e.target.value)})}/></label>
          <label>Front roof overhang (ft)
            <input type="number" min={0} max={5} step={.25} value={project.coverFrontOverhangFt??1}
              onChange={e=>onChange({coverFrontOverhangFt:Number(e.target.value)})}/></label>
          <p className="consultation-visual-note">Post count and beam profile affect the visualization. Do not assume fewer posts are allowed without manufacturer's signed span schedule, site wind/snow load and engineering approval.</p>
        </div>
      </details>
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
    <p className="manufacturer-source-footer">Models now distinguish Standard / Heavy Duty / Wide framing, lean-to / gable, freestanding posts and optional Dolce screens using the supplied Renaissance design drawings. Manufacturer engineering, exact extrusion dimensions, loads and supplier BOM still require an approved project configuration.</p>
  </section>;
}
