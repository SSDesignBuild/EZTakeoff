import { lazy, Suspense, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeckDesigner } from './DeckDesigner';
import { DeckGateEditor } from './DeckGateEditor';
import { SalesSkirtingOptions } from './SalesSkirtingOptions';
import { SalesTechnicalSettings } from './SalesTechnicalSettings';
import { ManufacturerBoardPicker, ManufacturerRailPicker, ManufacturerCoverPicker } from './ConsultationVisualPickers';
import { buildDeckModel } from '../lib/deckModel';
import { calculateEstimate } from '../lib/estimate';
import { loadConsultations, saveConsultations, makeConsultationProject, updateConsultation,
  isPricedRevision, type ConsultationProject,
  type PhotoCalibration } from '../lib/consultationProject';
import { saveHousePhoto, readHousePhoto, deleteHousePhoto } from '../lib/consultationPhoto';
import { createEstimateHandoff, parseEstimateResponse, makeAcceptedScope, downloadJson, selectedPricedTier } from '../lib/estimatingBridge';

const Live3D=lazy(()=>import('./Consultation3D').then((module)=>({default:module.Consultation3D})));
type Step='photo'|'layout'|'options'|'render';
const STEPS:{id:Step;name:string;hint:string}[]=[
  {id:'photo',name:'1 · Home photo',hint:'Client, location and site reference'},
  {id:'layout',name:'2 · Draw the design',hint:'Footprint, dimension, stairs and levels'},
  {id:'options',name:'3 · Choose finishes',hint:'Boards, borders, rails, skirting and cover'},
  {id:'render',name:'4 · Visualize & handoff',hint:'Live 3D, house overlay and estimator exchange'},
];
function savePreview(photoUrl:string|null,calibration:PhotoCalibration){
  const webgl=document.querySelector<HTMLCanvasElement>('.consultation-3d-frame canvas');
  if(!webgl)throw new Error('3D scene is not available.');
  const width=1600,height=1000,c=document.createElement('canvas');
  c.width=width;c.height=height;
  const context=c.getContext('2d');if(!context)throw new Error('Canvas export is unavailable.');
  context.fillStyle='#e7edf2';context.fillRect(0,0,width,height);
  return new Promise<void>((resolve,reject)=>{
    const overlay=()=>{
      context.save();
      context.translate(width/2+calibration.offsetX/100*width,height/2+calibration.offsetY/100*height);
      context.rotate(calibration.rotationDeg*Math.PI/180);
      context.scale(calibration.scale,calibration.scale);
      context.drawImage(webgl,-width/2,-height/2,width,height);
      context.restore();
      context.fillStyle='rgba(11,22,34,.80)';
      context.fillRect(0,height-56,width,56);
      context.font='22px Arial';context.fillStyle='white';
      context.fillText('S&S DESIGN BUILD  ·  CONCEPT VISUALIZATION  ·  VERIFY DIMENSIONS, MATERIALS AND PERSPECTIVE',25,height-20);
      c.toBlob((blob)=>{
        if(!blob){reject(new Error('Image export failed.'));return;}
        const a=document.createElement('a'),url=URL.createObjectURL(blob);
        a.href=url;a.download='sns-consultation-concept.png';a.click();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        resolve();
      },'image/png');
    };
    if(!photoUrl){overlay();return;}
    const img=new Image();
    img.onload=()=>{
      const factor=Math.max(width/img.width,height/img.height);
      context.drawImage(img,(width-img.width*factor)/2,(height-img.height*factor)/2,img.width*factor,img.height*factor);
      overlay();
    };
    img.onerror=()=>{reject(new Error('Could not include the house photograph.'));};
    img.src=photoUrl;
  });
}
const number=(value:unknown,fall:number)=>Number.isFinite(Number(value))?Number(value):fall;
function ConsultationEditor({project,onChange}:{project:ConsultationProject;onChange:(changes:Partial<ConsultationProject>)=>void}){
  const [step,setStep]=useState<Step>('photo');
  const [photoUrl,setPhotoUrl]=useState<string|null>(null);
  const [photoVersion,setPhotoVersion]=useState(0);
  const [photoError,setPhotoError]=useState('');
  const [notice,setNotice]=useState('');
  const [overlay,setOverlay]=useState(false);
  const [renderBusy,setRenderBusy]=useState(false);
  const [pricingBusy,setPricingBusy]=useState(false);
  const [bridgeError,setBridgeError]=useState('');
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const estimate=useMemo(()=>calculateEstimate('decks',project.values),[project.values]);
  const handoff=useMemo(()=>createEstimateHandoff(project),[project]);
  const currentTier=selectedPricedTier(project);
  useEffect(()=>{
    let alive=true,activeUrl:string|null=null;
    readHousePhoto(project.id).then((blob)=>{
      if(!alive)return;
      if(blob){activeUrl=URL.createObjectURL(blob);setPhotoUrl(activeUrl);}
      else setPhotoUrl(null);
    }).catch((error)=>{if(alive)setPhotoError(String(error));});
    return ()=>{alive=false;if(activeUrl)URL.revokeObjectURL(activeUrl);};
  },[project.id,project.photoPresent,photoVersion]);
  const setClient=(name:keyof ConsultationProject['client'],value:string)=>
    onChange({client:{...project.client,[name]:value}});
  const setValue=(key:string,value:string|number|boolean)=>
    onChange({values:{...project.values,[key]:value}});
  const updateValues=(updater:(current:Record<string,string|number|boolean>)=>Record<string,string|number|boolean>)=>
    onChange({values:updater(project.values)});
  const setCalibration=(name:keyof PhotoCalibration,value:number)=>
    onChange({calibration:{...project.calibration,[name]:value}});
  const onPhoto=async (event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    setPhotoError('');setNotice('');
    try{
      const saved=await saveHousePhoto(project.id,file);
      onChange({photoPresent:true});setPhotoVersion((n)=>n+1);
      setNotice('Photo saved privately on this browser ('+(saved.bytes/1024/1024).toFixed(1)+' MB).');
    }catch(error){setPhotoError(error instanceof Error?error.message:String(error));}
    event.target.value='';
  };
  const onImport=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    setBridgeError('');
    try{
      if(file.size>512*1024)throw new Error('Pricing response must be smaller than 512 KB.');
      const response=parseEstimateResponse(await file.text(),project);
      onChange({estimatingResponse:response});
      setNotice('Pricing tiers imported from external estimator. Select one to prepare the final scope.');
    }catch(error){setBridgeError(error instanceof Error?error.message:String(error));}
    event.target.value='';
  };
  const preview=async()=>{
    setRenderBusy(true);setNotice('');
    try{await savePreview(overlay?photoUrl:null,overlay?project.calibration:{scale:1,offsetX:0,offsetY:0,rotationDeg:0});setNotice('Concept PNG downloaded.');}
    catch(error){setNotice(error instanceof Error?error.message:String(error));}
    finally{setRenderBusy(false);}
  };
  const changeStep=(next:Step)=>{setStep(next);window.scrollTo({top:0,behavior:'smooth'});};
  return <div className="consultation-studio">
    <div className="consultation-titlebar">
      <div>
        <p className="eyebrow">S&S / SALES CONSULTATION STUDIO</p>
        <h2>{project.client.name?project.client.name+"'s outdoor living design":project.title}</h2>
        <p className="muted">Show the homeowner the design. Geometry drives the takeoff; pricing stays in your separate estimating app.</p>
      </div>
      <span className="consultation-local-label">Saved locally · Revision {project.revision}</span>
    </div>
    <nav className="consultation-step-nav" aria-label="Sales consultation stages">
      {STEPS.map((s)=><button type="button" key={s.id} aria-current={step===s.id?'step':undefined}
        className={step===s.id?'active':''} onClick={()=>changeStep(s.id)}>
        <strong>{s.name}</strong><small>{s.hint}</small>
      </button>)}
    </nav>
    {step==='photo'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 1 / Property</p><h3>Start with the client's actual home</h3>
        <p>Capture the property and your contact information before drawing. The picture stays in this browser until a secure shared storage system is connected.</p></div>
      <div className="consultation-photo-grid">
        <div className="consultation-photo-drop">
          {photoUrl?<img src={photoUrl} alt="Client's house"/>:<div className="consultation-photo-placeholder">
            <span aria-hidden="true">⌂</span><strong>Front or rear view of the home</strong>
            <small>Take a photograph on-site or upload JPG, PNG or WebP</small>
          </div>}
          <label className="consultation-upload">Choose / replace property photo
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto}/>
          </label>
          {!!photoUrl&&<button type="button" className="ghost-btn small-btn" onClick={async()=>{
            await deleteHousePhoto(project.id);onChange({photoPresent:false});setPhotoVersion((n)=>n+1);setNotice('Local property photo cleared.');
          }}>Remove saved photo</button>}
          {photoError&&<p role="alert">{photoError}</p>}
        </div>
        <div className="consultation-form">
          <label>Customer name<input value={project.client.name} onChange={(e)=>setClient('name',e.target.value)} placeholder="Homeowner's name"/></label>
          <label>Property address<input value={project.client.address} onChange={(e)=>setClient('address',e.target.value)} placeholder="Project location"/></label>
          <div className="consultation-form-two">
            <label>Phone<input value={project.client.phone} onChange={(e)=>setClient('phone',e.target.value)} placeholder="Phone"/></label>
            <label>Email<input inputMode="email" value={project.client.email} onChange={(e)=>setClient('email',e.target.value)} placeholder="Email"/></label>
          </div>
          <label>Initial project scope<select value={project.kind} onChange={(e)=>
            onChange({kind:e.target.value as ConsultationProject['kind'],coverFamily:e.target.value==='covered-deck'?'Moderno':'none'})}>
            <option value="deck">Deck / multi-tier deck</option>
            <option value="covered-deck">Covered deck (visual concept + deck takeoff)</option>
          </select></label>
          <p className="muted">Photo upload is optional. Deck and covered-deck consultations are available in this first release; standalone patio, screening and sunroom assembly engines will be added separately.</p>
        </div>
      </div>
    </section>}
    {step==='layout'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 2 / Footprint</p>
        <h3>Draw the deck together</h3>
        <p>Use the dimensioned editor to create the footprint, steps, additional tier, support locations and railing edges. This is the same underlying deck model as Admin Takeoff.</p>
      </div>
      <div className="consultation-quick-inputs">
        <label>Height above grade (ft)<input type="number" min={.25} step={.25} value={number(project.values.deckHeight,8)}
          onChange={(e)=>setValue('deckHeight',Number(e.target.value))}/></label>
        <div className="consultation-quick-summary">
          <strong>Construction preset</strong>
          <span>{String(project.values.postSizeChoice??'6x6')} support posts · {String(project.values.attachment??'siding').replace('-', ' ')} attachment</span>
        </div>
        <label className="consultation-checkbox"><input type="checkbox" checked={project.values.multiTierEnabled===true}
          onChange={(e)=>setValue('multiTierEnabled',e.target.checked)}/>Add lower deck tier</label>
      </div>
      <DeckDesigner values={project.values} onValuesChange={updateValues}/>
      <SalesTechnicalSettings values={project.values} onValuesChange={updateValues}/>
      <p className="consultation-engineering-note">Dimensioned geometry is reused in the 3D scene and material estimator. Structural sizes and foundations require field verification before ordering.</p>
    </section>}
    {step==='options'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 3 / Materials</p>
        <h3>Build the outdoor living package</h3>
        <p>Pick products in a visual sequence. The product names come from the S&S takeoff catalog, so choices flow into the same material rules.</p>
      </div>
      <ManufacturerBoardPicker values={project.values} onValues={(values)=>onChange({values})}/>
      <div className="consultation-option-columns">
        <article className="consultation-option-card">
          <h4>Picture frame & breaker boards</h4>
          <label>Picture frame courses<select value={Number(project.values.pictureFrameCount??0)} onChange={(e)=>setValue('pictureFrameCount',Number(e.target.value))}>
            {[0,1,2,3].map((n)=><option value={n} key={n}>{n===0?'None':n+' course'+(n===1?'':'s')}</option>)}
          </select></label>
          <label className="consultation-checkbox"><input type="checkbox" checked={project.values.pictureFrameHouseSide===true} onChange={(e)=>setValue('pictureFrameHouseSide',e.target.checked)}/>Include picture frame on house side</label>
          <label>Breaker courses<select value={Number(project.values.breakerBoardCount??0)} onChange={(e)=>setValue('breakerBoardCount',Number(e.target.value))}>
            {[0,1,2,3].map((n)=><option key={n} value={n}>{n===0?'None':n+' breaker course'+(n===1?'':'s')}</option>)}
          </select></label>
        </article>
        <ManufacturerRailPicker values={project.values} onValues={(values)=>onChange({values})}/>
        <article className="consultation-option-card">
          <h4>Stair options</h4>
          <label>Stair width (ft)<input type="number" min={2} step={.5}
            value={number(project.values.stairWidth,4)} onChange={(e)=>setValue('stairWidth',Number(e.target.value))}/></label>
          <label>Tread material<select value={String(project.values.stairTreadStyle??'match')}
            onChange={(e)=>setValue('stairTreadStyle',e.target.value)}>
            <option value="match">Match deck board style</option>
            <option value={String(project.values.deckingMaterial??'')}>{String(project.values.deckingMaterial??'Current deck board')}</option>
          </select></label>
          <label>Riser material<select value={String(project.values.stairRiserStyle??'auto')}
            onChange={(e)=>setValue('stairRiserStyle',e.target.value)}>
            <option value="auto">Standard coordinated riser</option>
            <option value="match">Match deck board</option>
            <option value="fascia">Match fascia trim</option>
          </select></label>
        </article>
        <SalesSkirtingOptions values={project.values} onValuesChange={updateValues}/>
        <ManufacturerCoverPicker project={project} onChange={onChange}/>
      </div>
      <DeckGateEditor values={project.values} onValuesChange={updateValues}/>
    </section>}
    {step==='render'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 4 / Present</p><h3>Show the vision. Keep the takeoff connected.</h3>
        <p>Rotate and zoom the real geometry, or place it over the homeowner's photograph as an approximate concept overlay. A photorealistic AI pass is not yet connected.</p>
      </div>
      <div className="consultation-preview-toolbar">
        <button type="button" className={!overlay?'active':''} onClick={()=>setOverlay(false)}>Interactive 3D</button>
        <button type="button" className={overlay?'active':''} onClick={()=>setOverlay(true)} disabled={!photoUrl}>Overlay on house photo</button>
        <button type="button" className="secondary-btn small-btn" disabled={renderBusy} onClick={preview}>
          {renderBusy?'Exporting…':'Download concept PNG'}</button>
      </div>
      <Suspense fallback={<div className="consultation-3d-loading">Loading professional 3D viewer…</div>}>
        <Live3D project={project} photoUrl={photoUrl} photoMode={overlay}/>
      </Suspense>
      {overlay&&<div className="consultation-calibration">
        <p className="muted">Align the preliminary 3D perspective by hand. Use the 3D viewport to orbit the design, then move and scale it on the home photograph.</p>
        {([
          ['scale','Design scale',.5,2.8,.05],
          ['offsetX','Move horizontally (%)',-80,80,1],
          ['offsetY','Move vertically (%)',-80,80,1],
          ['rotationDeg','Screen rotation (degrees)',-45,45,1],
        ] as const).map(([key,label,min,max,step])=><label key={key}>{label} <strong>{project.calibration[key]}</strong>
          <input type="range" min={min} max={max} step={step} value={project.calibration[key]}
            onChange={(e)=>setCalibration(key,Number(e.target.value))}/></label>)}
      </div>}
      <div className="consultation-handoff">
        <div>
          <h4>Send the design to your estimating app</h4>
          <p className="muted">{model.area.toFixed(1)} sq ft deck · {model.stairCount} stair flight(s) · {estimate.materials.length} material lines. No prices are calculated here.</p>
          {!!handoff.blockers.length&&<div className="consultation-handoff-warnings">
            <strong>Review before pricing / ordering</strong>
            {handoff.blockers.slice(0,8).map((note,i)=><p key={i}>{note}</p>)}
          </div>}
          <button type="button" className="secondary-btn" onClick={()=>
            downloadJson('EZTakeoff-'+project.id+'-revision-'+project.revision+'-estimate-request.json',handoff)}>
            Export dimensions & options (JSON)
          </button>
          <p className="muted">Use the JSON in your separate estimator. The bridge is ready to connect to its API once its endpoint and authentication contract are provided.</p>
        </div>
        <div>
          <h4>Import the estimating app's pricing tiers</h4>
          <label className="consultation-upload">
            Import validated pricing response JSON
            <input type="file" accept=".json,application/json" onChange={onImport} disabled={pricingBusy}/>
          </label>
          {bridgeError&&<p role="alert">{bridgeError}</p>}
          {!!project.estimatingResponse&&isPricedRevision(project)&&<div className="consultation-pricing-tiers">
            {project.estimatingResponse.tiers.map((tier)=><label key={tier.id} className="consultation-tier">
              <input type="radio" name={'tier-'+project.id} checked={project.estimatingResponse?.selectedTierId===tier.id}
                onChange={()=>onChange({estimatingResponse:{...project.estimatingResponse!,selectedTierId:tier.id}})}/>
              <span><strong>{tier.name}</strong><small>{tier.scope.slice(0,180)}</small></span>
              <strong>{tier.price.toLocaleString('en-US',{style:'currency',currency:'USD'})}</strong>
            </label>)}
            {currentTier&&<div className="consultation-accepted-scope">
              <h5>Selected scope · {currentTier.name}</h5>
              <pre>{currentTier.scope}</pre>
              <button type="button" className="secondary-btn" onClick={()=>downloadJson('EZTakeoff-'+project.id+'-scope-'+currentTier.id+'.json',makeAcceptedScope(project))}>
                Export draft final scope
              </button>
            </div>}
          </div>}
          {!project.estimatingResponse&&<p className="muted">No external price imported. Return an estimate response with the exact project ID and revision. The selected pricing tier will produce the draft final scope.</p>}
          <p className="muted">Pricing is salesperson-facing until the final scope is intentionally exported. Imported pricing becomes invalid after a design change.</p>
        </div>
      </div>
      <button type="button" className="ghost-btn small-btn" onClick={()=>{setPricingBusy(false);setNotice('');}}>Clear notices</button>
    </section>}
    {notice&&<div className="consultation-notice" role="status">{notice}</div>}
    <footer className="consultation-footer">
      <button type="button" className="ghost-btn" disabled={step==='photo'} onClick={()=>changeStep(STEPS[Math.max(0,STEPS.findIndex(s=>s.id===step)-1)].id)}>Previous</button>
      <span>{STEPS.findIndex(s=>s.id===step)+1} / 4 · {model.area.toFixed(1)} sq ft</span>
      {step!=='render'&&<button type="button" className="secondary-btn" onClick={()=>changeStep(STEPS[Math.min(3,STEPS.findIndex(s=>s.id===step)+1)].id)}>Continue →</button>}
    </footer>
  </div>;
}
export function ConsultationStudio(){
  const {projectId}=useParams<{projectId:string}>();
  const navigate=useNavigate();
  const [projects,setProjects]=useState<ConsultationProject[]>(loadConsultations);
  const [search,setSearch]=useState('');
  useEffect(()=>{try{saveConsultations(projects);}catch{/* Limited browser storage; existing photos remain in IndexedDB. */}},[projects]);
  const project=projects.find((p)=>p.id===projectId);
  const create=()=>{
    const id=crypto.randomUUID();
    setProjects((current)=>[makeConsultationProject(id),...current]);
    navigate('/consultation/'+id);
  };
  const update=(changes:Partial<ConsultationProject>)=>{
    if(!projectId)return;
    setProjects((current)=>current.map((p)=>p.id===projectId?updateConsultation(p,changes):p));
  };
  return <div className="consultations-shell">
    <div className="consultations-banner">
      <div><p className="eyebrow">S&S / CLIENT PRESENTATIONS</p><h2>Sales Consultation Studio</h2>
        <p className="muted">Design live with the client. Accurate deck geometry flows into takeoff and your external pricing workflow.</p></div>
      <div className="consultations-banner-actions">
        {project&&<button type="button" className="ghost-btn" onClick={()=>navigate('/consultation')}>All consultations</button>}
        <button type="button" className="secondary-btn" onClick={create}>+ New consultation</button>
      </div>
    </div>
    {project?<ConsultationEditor key={project.id} project={project} onChange={update}/>:
      <section className="consultation-list">
        <div className="consultation-list-heading">
          <h3>Saved consultations</h3>
          <input type="search" aria-label="Search consultations" placeholder="Search customer or address" value={search} onChange={(e)=>setSearch(e.target.value)}/>
        </div>
        {projects.length===0&&<div className="consultation-empty">
          <strong>No consultations created yet</strong>
          <p>Start a new project to upload the house photo, draw a deck, configure products and preview it in 3D.</p>
          <button type="button" className="secondary-btn" onClick={create}>Start first consultation</button>
        </div>}
        {projects.filter((p)=>(p.client.name+' '+p.client.address+' '+p.title).toLowerCase().includes(search.toLowerCase())).map((p)=>
          <button type="button" key={p.id} className="consultation-project-row" onClick={()=>navigate('/consultation/'+p.id)}>
            <strong>{p.client.name||p.title}</strong>
            <span>{p.client.address||'Property address not entered'}</span>
            <small>{p.kind==='covered-deck'?'Covered deck':'Deck'} · Revision {p.revision} · {new Date(p.updatedAt).toLocaleDateString()}</small>
          </button>)}
      </section>}
  </div>;
}
