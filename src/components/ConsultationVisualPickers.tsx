import { useEffect, useMemo, useRef, useState } from 'react';
import { railingPhotos, coverPhotos, type PhotoReference } from '../data/consultationPhotos';
import { hasRenaissanceReferenceChart, maxReferenceOverhangFt } from '../lib/renaissanceGuidance';
import { effectivePcaKickPlateIn } from '../lib/pcaScreenDoorGeometry';
import type { ConsultationProject } from '../lib/consultationProject';
import {
  deckVisualProducts, deckCollections, getDeckVisualProduct,
  railVisualProducts, getRailVisualProduct, coverVisualProducts, getCoverVisualProduct,
  getCoverFinish, getCoverRoofFinish, getCoverCeilingFinish,
  coverFrameColors,coverRoofColors,coverCeilingFinishes,
  type CoverColor,type CoverRoofColor,type CoverCeilingFinish,
  type RailVisualProduct, type RailInfill,
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
/**
 * An unavailable manufacturer CDN must not leave a blank card indefinitely.
 * Start the deadline only when a lazy photo nears the viewport: starting it
 * on mount would incorrectly time out photos further down long catalogs.
 */
function ProductPhoto({photo,name,fallback}:{photo?:PhotoReference;name:string;fallback:string}){
  const [failed,setFailed]=useState(false);
  const container=useRef<HTMLDivElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const loaded=useRef(false);
  const cancelTimeout=()=>{
    if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}
  };
  useEffect(()=>{
    setFailed(false);
    loaded.current=false;
    if(!photo?.url)return;
    const beginDeliveryDeadline=()=>{
      if(timer.current!==null||loaded.current)return;
      timer.current=window.setTimeout(()=>{
        timer.current=null;
        if(!loaded.current)setFailed(true);
      },12000);
    };
    let observer:IntersectionObserver|null=null;
    if(container.current&&typeof IntersectionObserver!=='undefined'){
      observer=new IntersectionObserver((entries)=>{
        if(entries.some(entry=>entry.isIntersecting)){beginDeliveryDeadline();observer?.disconnect();}
      },{rootMargin:'250px'});
      observer.observe(container.current);
    }else beginDeliveryDeadline();
    return ()=>{observer?.disconnect();cancelTimeout();};
  },[photo?.url]);
  if(!photo||failed)return <div ref={container} className="manufacturer-photo manufacturer-photo--missing">
    <strong>Manufacturer photograph unavailable</strong>
    <span>View {name} in the manufacturer gallery to verify the finish.</span>
    {fallback&&<small className="photo-source-text">Manufacturer gallery linked in product details</small>}
  </div>;
  return <div ref={container} className="manufacturer-photo">
    <img src={photo.url} loading="lazy" alt={name+' installed manufacturer product photograph'}
      referrerPolicy="no-referrer"
      onLoad={()=>{loaded.current=true;cancelTimeout();}}
      onError={()=>{cancelTimeout();setFailed(true);}}/>
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
      <div className="manufacturer-selected-rail-hero">
        <ProductPhoto photo={railingPhotos[selected.id]}
          name={selected.label} fallback={selected.sourcePage}/>
        <p className="muted">Larger manufacturer style reference. Compare actual infill, top profile and posts before confirming.</p>
      </div>
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
  const referenceCharted=hasRenaissanceReferenceChart(project.coverFamily);
  const maxOverhang=maxReferenceOverhangFt(project.coverFamily);
  // Fresco translucent panels, Aria shade tubes and Solé louvers do not use
  // the insulated-roof panel skins available to Moderno/Contempo/Classico.
  const hasInsulatedPanels=['solid-studio','solid-truss-ends','full-trusses'].includes(selected.family);
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
          coverRoofStyle:item.roofStyles.includes(project.coverRoofStyle??'studio')?project.coverRoofStyle:'studio',
           coverAccentEnd:['Contempo','Classico'].includes(item.id)?'curved':'straight'})}>
        {item.id==='none'?<div className="manufacturer-photo manufacturer-photo--missing">
          <strong>Open-air deck</strong><span>No cover or pergola included</span>
        </div>:<ProductPhoto photo={coverPhotos[item.id]} name={item.name+' Renaissance'} fallback={item.sourcePage}/>}

        <strong>{item.name}</strong>
        <small>{item.description}</small>
      </button>)}
    </div>
    {project.coverFamily!=='none'&&<div className="manufacturer-cover-options">
      <div><strong>{selected.name}</strong><small>{selected.description}</small>
        <a href={selected.sourcePage} target="_blank" rel="noreferrer">View Renaissance product page</a></div>
      <div className="manufacturer-finish-system">
        <div>
          <strong>Aluminum framing</strong>
          <p className="muted">Posts, beams and compatible accessories use this finish. Fresco does not use architectural gutters or downspouts.</p>
          <div className="manufacturer-color-choices" role="group" aria-label="Aluminum framing finish">
            {coverFrameColors.map((color:CoverColor)=><button type="button" key={color}
              aria-pressed={color===project.coverColor}
              className={color===project.coverColor?'selected':''}
              onClick={()=>onChange({coverColor:color})}>
              <span style={{background:getCoverFinish(color)}}/>{color}</button>)}
          </div>
        </div>
        {hasInsulatedPanels&&<div>
          <strong>Exterior roof panel color</strong>
          <p className="muted">Top of the insulated roof · white, silver or sandstone only.</p>
          <div className="manufacturer-color-choices" role="group" aria-label="Exterior roof color">
            {coverRoofColors.map((color:CoverRoofColor)=><button type="button" key={color}
              aria-pressed={color===(project.coverRoofColor??'White')}
              className={color===(project.coverRoofColor??'White')?'selected':''}
              onClick={()=>onChange({coverRoofColor:color})}>
              <span style={{background:getCoverRoofFinish(color)}}/>{color}</button>)}
          </div>
        </div>}
        {hasInsulatedPanels&&<div>
          <strong>Ceiling / underside of roof panels</strong>
          <p className="muted">Choose the interior-facing finish independently of the roof and frame.</p>
          <div className="manufacturer-color-choices" role="group" aria-label="Ceiling underside finish">
            {coverCeilingFinishes.map((color:CoverCeilingFinish)=><button type="button" key={color}
              aria-pressed={color===(project.coverCeilingFinish??'White')}
              className={color===(project.coverCeilingFinish??'White')?'selected':''}
              onClick={()=>onChange({coverCeilingFinish:color})}>
              <span style={{background:color.includes('Wood Grain')
                ? `repeating-linear-gradient(96deg, ${getCoverCeilingFinish(color)} 0 3px, ${color==='Mahogany Wood Grain'?'#4a2b23':'#dcc099'} 4px 6px, ${getCoverCeilingFinish(color)} 7px 10px)`
                :getCoverCeilingFinish(color)}}/>{color}</button>)}
          </div>
          {String(project.coverCeilingFinish??'').includes('Wood Grain')&&
            <p className="consultation-visual-note">Wood-grain 3D preview is illustrative; confirm the Renaissance manufacturer sample before ordering.</p>}
        </div>}
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
        {['Fresco','Classico','Aria','Contempo'].includes(project.coverFamily)&&
          <label>Decorative projection truss ends
            <select value={project.coverAccentEnd??(['Classico','Contempo'].includes(project.coverFamily)?'curved':'straight')}
              onChange={e=>onChange({coverAccentEnd:e.target.value as 'straight'|'curved'})}>
              <option value="straight">Straight-cut end</option>
              <option value="curved">Curved accent end</option>
            </select>
            <small className="consultation-visual-note">End profiles are design visuals; verify approved manufacturer cut style.</small>
          </label>}
        <label>Screen walls
          <select value={project.coverScreenStyle??'none'}
            onChange={e=>onChange({coverScreenStyle:e.target.value as 'none'|'dolce-open-view'|'dolce-standard'})}>
            <option value="none">No screens · open patio</option>
            <option value="dolce-open-view">Dolce · open-view screened walls</option>
            <option value="dolce-standard">Dolce · standard screened panels</option>
          </select></label>
        {project.coverScreenStyle==='dolce-standard'&&<div className="renaissance-screen-options">
          <strong>Standard screen wall uprights</strong>
          <p className="consultation-visual-note">Set INTERMEDIATE uprights only. Structural corner columns remain; bays are even on either side of the screen door.</p>
          <div className="consultation-skirting-finish">
            {(['front','left','right',...(project.coverMount==='freestanding'?['rear'] as const:[])] as const).map(side=>
              <label key={'uprights-'+side}>{side.charAt(0).toUpperCase()+side.slice(1)} wall uprights
                <input type="number" min={0} max={12} step={1}
                  value={project.coverScreenUprights?.[side]??(side==='front'||side==='rear'?2:1)}
                  onChange={e=>onChange({coverScreenUprights:{
                    ...project.coverScreenUprights,[side]:Math.max(0,Math.min(12,Math.round(Number(e.target.value)||0))),
                  }})}/>
              </label>)}
          </div>
        </div>}
        {project.coverScreenStyle==='dolce-open-view'&&
          <p className="consultation-visual-note">Open-view has no intermediate vertical mullions. Structural corner posts remain.</p>}
        {(project.coverScreenStyle??'none')!=='none'&&<div className="renaissance-screen-options">
          <strong>Dolce screen integration & PCA access door</strong>
          <label>Screen / railing arrangement
            <select value={project.coverScreenRailTreatment??'integrated-kick'}
              onChange={e=>onChange({coverScreenRailTreatment:e.target.value as
                NonNullable<ConsultationProject['coverScreenRailTreatment']>})}>
              <option value="integrated-kick">Integrated Dolce kick panel — no overlapping railing</option>
              <option value="integrated-picket">Integrated Dolce pickets — no overlapping railing</option>
              <option value="inside">Screen mounted inside independent deck railing</option>
              <option value="outside">Screen mounted outside independent deck railing</option>
              <option value="screens-only">Full-height screen only — omit perimeter railing</option>
            </select></label>
          <label className="consultation-checkbox"><input type="checkbox"
            checked={project.coverDoorEnabled!==false}
            onChange={e=>onChange({coverDoorEnabled:e.target.checked})}/>
            Include PCA Products 3068 (36″ × 80″) screen entry door
          </label>
          {project.coverDoorEnabled!==false&&<div className="renaissance-door-config">
            <label>Door placement side
              <select value={project.coverDoorSide??'front'}
                onChange={e=>onChange({coverDoorSide:e.target.value as
                  NonNullable<ConsultationProject['coverDoorSide']>})}>
                <option value="front">Front screen wall</option>
                <option value="left">Left screen wall</option>
                <option value="right">Right screen wall</option>
                {project.coverMount==='freestanding'&&<option value="rear">Rear screen wall</option>}
              </select></label>
            <label>Position along wall · {project.coverDoorPositionPercent??50}%
              <input type="range" min={10} max={90} step={5}
                value={project.coverDoorPositionPercent??50}
                onChange={e=>onChange({coverDoorPositionPercent:Number(e.target.value)})}/>
            </label>
            <label>PCA door model
              <select value={project.coverDoorModel??'A-100'}
                onChange={e=>onChange({coverDoorModel:e.target.value as
                  NonNullable<ConsultationProject['coverDoorModel']>,
                  coverDoorPet:'none'})}>
                <option value="A-100">Canoe Creek A-100 · 3068</option>
                <option value="A-500">Westmore A-500 · 3068</option>
              </select></label>
            <label>Door finish
              <select value={project.coverDoorFinish??'match'}
                onChange={e=>onChange({coverDoorFinish:e.target.value as
                  NonNullable<ConsultationProject['coverDoorFinish']>})}>
                {['match','White','Bronze','Black','Sandstone','Clay'].map(color=>
                  <option key={color} value={color}>{color==='match'?'Match Renaissance frame':color}</option>)}
              </select></label>
            <label>Hinge side
              <select value={project.coverDoorHinge??'left'}
                onChange={e=>onChange({coverDoorHinge:e.target.value as 'left'|'right'})}>
                <option value="left">Left hand</option><option value="right">Right hand</option>
              </select></label>
            <label>Door swing
              <select value={project.coverDoorSwing??'out'}
                onChange={e=>onChange({coverDoorSwing:e.target.value as 'in'|'out'})}>
                <option value="out">Outswing</option><option value="in">Inswing</option>
              </select></label>
            <label>Integrated PCA pet door
              <select value={project.coverDoorPet??'none'}
                onChange={e=>onChange({coverDoorPet:e.target.value as
                  NonNullable<ConsultationProject['coverDoorPet']>})}>
                <option value="none">No pet door</option>
                <option value="small">Magnador small · 6″ × 8″ opening</option>
                {project.coverDoorModel!=='A-500'&&<>
                  <option value="medium">Magnador medium · 11″ × 13″ opening</option>
                  <option value="large">Magnador large · 13″ × 20″ opening</option>
                </>}
              </select></label>
            {(project.coverDoorPet??'none')==='none'
              ?<label>Kick plate height
                <select value={project.coverDoorKickPlateIn??8}
                  onChange={e=>onChange({coverDoorKickPlateIn:Number(e.target.value)})}>
                  {[0,8,12,14,24].map(inches=><option value={inches} key={inches}>
                    {inches===0?'No kick plate':inches+'″ kick plate'}
                  </option>)}
                </select></label>
              :<p className="consultation-visual-note" role="status">
                PCA solid kick panel: <strong>{effectivePcaKickPlateIn(
                  project.coverDoorPet??'none',project.coverDoorKickPlateIn??8)}″ automatically</strong>.
                Continuous full-width panel with a precisely framed pet opening.
                Panel height exceeds the manufacturer's full outer pet frame.
              </p>}
            <small className="consultation-visual-note">PCA 3068 opening is 36″ × 80″; confirm actual frame/rough opening, door hand, wall height and pet-door fit before ordering.</small>
            {['inside','outside'].includes(project.coverScreenRailTreatment??'integrated-kick')&&
              <small className="consultation-visual-note" role="status">
                Independent screen doors do not remove deck guardrails. Align access
                with a stair opening or add an appropriately placed railing gate,
                and verify the guard, landing and egress details before ordering.
              </small>}
          </div>}
        </div>}

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
            <input type="number" min={0} max={maxOverhang} step={.25} value={project.coverSideOverhangFt??1}
              onChange={e=>onChange({coverSideOverhangFt:Math.max(0,Math.min(maxOverhang,Number(e.target.value)||0))})}/></label>
          <label>Front roof overhang (ft)
            <input type="number" min={0} max={maxOverhang} step={.25} value={project.coverFrontOverhangFt??1}
              onChange={e=>onChange({coverFrontOverhangFt:Math.max(0,Math.min(maxOverhang,Number(e.target.value)||0))})}/></label>
          {referenceCharted&&<p className="consultation-engineering-note" role="status">
            Florida Engineering estimating charts limit these roof overhangs to 1 ft and show a maximum post height of 15 ft.
            Site-specific wind, exposure, projection, soil/footing and frame approval remain required.
            Previously saved overhangs exceeding 1 ft will be flagged for review.
          </p>}
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
