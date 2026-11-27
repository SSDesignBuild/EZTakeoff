import { enclosureQuickAction } from '../lib/consultationEnclosureAction';
import { lazy, Suspense, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeckDesigner } from './DeckDesigner';
import { ConsultationTechnicalSettings } from './ConsultationTechnicalSettings';
import { buildDeckModel, buildLowerTierDeckModel } from '../lib/deckModel';
import { loadConsultations, saveConsultations, makeConsultationProject, updateConsultation,
  isPricedRevision, type ConsultationProject,
  type PhotoCalibration } from '../lib/consultationProject';
import { saveHousePhoto, readHousePhoto, deleteHousePhoto } from '../lib/consultationPhoto';
import { createEstimateHandoff, parseEstimateResponse, makeAcceptedScope, downloadJson, selectedPricedTier } from '../lib/estimatingBridge';
import { ConsultationCloudPanel } from './ConsultationCloudPanel';
import { ConsultationFinishDock } from './ConsultationFinishDock';
import { ConsultationDetailsPanel, type ConsultationDetailSection } from './ConsultationDetailsPanel';
import { openConsultationInTakeoff } from '../lib/consultationTakeoffBridge';
import { finishDockDetailSection } from '../lib/consultationFinishDock';
import './ConsultationWorkbench.css';

const Live3D=lazy(()=>import('./Consultation3D').then((module)=>({default:module.Consultation3D})));
type Step='photo'|'layout'|'options'|'render';
const STEPS:{id:Step;name:string;hint:string}[]=[
  {id:'photo',name:'1 · Property',hint:'Customer & site reference'},
  {id:'layout',name:'2 · Draw the design',hint:'Shape, stairs & outdoor areas'},
  {id:'options',name:'3 · Choose finishes',hint:'Explore materials in live 3D'},
  {id:'render',name:'4 · Review & export',hint:'Present, drawings & material list'},
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
function ConsultationEditor({project,onChange,saveError}:{project:ConsultationProject;onChange:(changes:Partial<ConsultationProject>)=>void;saveError:string}){
  const navigate=useNavigate();
  const [step,setStep]=useState<Step>(()=>{
    const stage=new URLSearchParams(window.location.search).get('stage');
    return STEPS.some(item=>item.id===stage)?stage as Step:'photo';
  });
  const [photoUrl,setPhotoUrl]=useState<string|null>(null);
  const [photoVersion,setPhotoVersion]=useState(0);
  const [photoError,setPhotoError]=useState('');
  const [notice,setNotice]=useState('');
  const [overlay,setOverlay]=useState(false);
  const [lightingPreview,setLightingPreview]=useState(false);
  const [expandedView,setExpandedView]=useState(false);
  const [fitRequest,setFitRequest]=useState(0);
  const [inspectorSection,setInspectorSection]=useState<ConsultationDetailSection|null>(null);
  const [detailsFocusRequest,setDetailsFocusRequest]=useState(0);
  useEffect(()=>{
    if(!inspectorSection||!detailsFocusRequest)return;
    const frame=window.requestAnimationFrame(()=>{
      const panel=document.getElementById('studio-detail-options');
      panel?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      panel?.focus({preventScroll:true});
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[inspectorSection,detailsFocusRequest]);
  const [layoutMode,setLayoutMode]=useState<'points'|'stairs'|'railing'|'concrete'>('points');
  const [renderBusy,setRenderBusy]=useState(false);
  const [viewportHeight,setViewportHeight]=useState(500);
  const [bridgeError,setBridgeError]=useState('');
  const model=useMemo(()=>buildDeckModel(project.values),[project.values]);
  const lowerModel=useMemo(()=>buildLowerTierDeckModel(project.values),[project.values]);
  const totalDeckArea=model.area+(lowerModel?.area??0);
  const totalStairs=model.stairCount+(lowerModel?.stairCount??0);
  const handoff=useMemo(()=>createEstimateHandoff(project),[project]);
  const currentTier=selectedPricedTier(project);
  useEffect(()=>{
    const resize=()=>setViewportHeight(Math.max(window.innerWidth<700?280:360,
      Math.min(expandedView?1000:700,window.innerHeight-(expandedView?180:410))));
    resize();window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[expandedView]);
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
  const openPlans=()=>{
    try{navigate(openConsultationInTakeoff(project).href);}
    catch(error){setNotice(error instanceof Error?error.message:'Could not open the Takeoff copy. Keep this design open and try again.');}
  };
  const editLayout=(mode:'points'|'stairs'|'railing'|'concrete')=>{
    setLayoutMode(mode);changeStep('layout');
  };
  const requestDetails=(section:string)=>{
    if(section==='screen'||section==='sunroom'){
      const action=enclosureQuickAction(project,section);
      if(Object.keys(action.patch).length)onChange(action.patch);
      setInspectorSection(action.section);setNotice(action.message);
      setDetailsFocusRequest(value=>value+1);return;
    }
    if(section==='concrete'){editLayout('concrete');return;}
    if(section==='stairs'&&totalStairs===0){editLayout('stairs');return;}
    if(section==='railing'&&model.railingRun+model.stairRailSideCount+
      (lowerModel?.railingRun??0)+(lowerModel?.stairRailSideCount??0)===0){editLayout('railing');return;}
    setInspectorSection(finishDockDetailSection(project,section));
    setDetailsFocusRequest(value=>value+1);
  };
  return <div className="consultation-studio">
    <div className="consultation-titlebar">
      <div>
        <p className="eyebrow">Design studio</p>
        <h2>{project.client.name?project.client.name+"'s outdoor living design":project.title}</h2>
        <p className="muted">{project.client.address||'Explore your outdoor living design together.'}</p>
      </div>
      <div className="studio-project-meta"><span>{totalDeckArea.toFixed(0)} sq ft deck</span>
        <span>{totalStairs} stair {totalStairs===1?'flight':'flights'}</span>
        <span className={saveError?'studio-save-error':'studio-save-status'} role="status">{saveError?'Save needs attention':'Saved on this device'} · Rev {project.revision}</span>
        <button type="button" className="ghost-btn small-btn" onClick={openPlans}>Plans & materials</button>
      </div>
    </div>
    <nav className="consultation-step-nav" aria-label="Sales consultation stages">
      {STEPS.map((s)=><button type="button" key={s.id} aria-current={step===s.id?'step':undefined}
        className={step===s.id?'active':''} onClick={()=>changeStep(s.id)}>
        <strong>{s.name}</strong><small>{s.hint}</small>
      </button>)}
    </nav>
    {step==='photo'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 1 / Property</p><h3>Start with the client's actual home</h3>
        <p>Add the customer's details and an optional property photo. You can start drawing at any time.</p></div>
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
            <label>Email<input type="email" value={project.client.email} onChange={(e)=>setClient('email',e.target.value)} placeholder="Email"/></label>
          </div>
          <label>Initial project scope<select value={project.kind} onChange={(e)=>
            onChange({kind:e.target.value as ConsultationProject['kind'],coverFamily:e.target.value==='covered-deck'?'Moderno':'none'})}>
            <option value="deck">Deck / multi-tier deck</option>
            <option value="covered-deck">Deck with a patio cover</option>
          </select></label>
          <p className="studio-field-help">Add screens, a sunroom, concrete areas and lighting as you develop the design. Photos are saved on this device; private cloud sync is available under Save & sync.</p>
        </div>
      </div>
    </section>}
    {step==='layout'&&<section className="consultation-panel">
      <div className="consultation-panel-copy"><p className="eyebrow">Step 2 / Footprint</p>
        <h3>Draw the deck together</h3>
        <p>Start with the footprint. Then place stairs, choose railing sides and draw concrete areas. Select a dimension to adjust it.</p>
      </div>
      <div className="consultation-quick-inputs">
        <label>Height above grade (ft)<input type="number" min={.25} step={.25} value={number(project.values.deckHeight,8)}
          onChange={(e)=>setValue('deckHeight',Number(e.target.value))}/></label>
        <label>Attachment<select value={String(project.values.attachment??'siding')} onChange={(e)=>setValue('attachment',e.target.value)}>
          <option value="siding">Attached to siding / suitable ledger structure</option>
          <option value="brick">Brick / masonry — independent gravity support</option>
          <option value="freestanding">Freestanding</option>
        </select></label>
        <label className="consultation-checkbox"><input type="checkbox" checked={project.values.multiTierEnabled===true}
          onChange={(e)=>setValue('multiTierEnabled',e.target.checked)}/>Add lower deck tier</label>
      </div>
      <DeckDesigner values={project.values} onValuesChange={updateValues} allowSiteConcrete requestedMode={layoutMode}/>
      <ConsultationTechnicalSettings values={project.values} onValuesChange={updateValues}/>
      <p className="consultation-engineering-note">Dimensioned geometry is reused in the 3D scene and material estimator. Structural sizes and foundations require field verification before ordering.</p>
    </section>}
    {(step==='options'||step==='render')&&<section className="studio-live-section" aria-label="Live design workbench">
      <div className="studio-workbench-intro">
        <div><p className="eyebrow">{step==='options'?'Step 3 / Live materials':'Step 4 / Review & export'}</p>
          <h3>{step==='options'?'See every choice come together':'Your outdoor living design'}</h3>
          <p>{step==='options'?'Choose a part below the model, then browse its finishes. Rotate or zoom to see the details.':'Review the design together, save a concept image, then open the plans and material list.'}</p>
        </div>
        <button type="button" className="ghost-btn small-btn" onClick={()=>editLayout('points')}>Edit layout</button>
      </div>
      <div className={'studio-workbench'+(inspectorSection?' studio-workbench--with-inspector':'')}>
        <div className="studio-scene-column">
          <div className="studio-view-toolbar">
            <div className="studio-segmented" role="group" aria-label="Design view">
              <button type="button" aria-pressed={!overlay} onClick={()=>setOverlay(false)}>Interactive 3D</button>
              <button type="button" aria-pressed={overlay} onClick={()=>setOverlay(true)} disabled={!photoUrl}
                title={!photoUrl?'Add a property photo in step 1':'Align the design with the property photo'}>House photo</button>
            </div>
            <div className="studio-segmented" role="group" aria-label="Scene lighting">
              <button type="button" aria-pressed={!lightingPreview} onClick={()=>setLightingPreview(false)}>Day</button>
              <button type="button" aria-pressed={lightingPreview} onClick={()=>setLightingPreview(true)}>Evening</button>
            </div>
            <div className="studio-view-actions">
              <button type="button" className="ghost-btn small-btn" aria-expanded={!!inspectorSection}
                onClick={()=>setInspectorSection(current=>current?null:'deck')}>Detailed options</button>
              <button type="button" className="ghost-btn small-btn" onClick={()=>setFitRequest(current=>current+1)}>Fit design</button>
              <button type="button" className="ghost-btn small-btn" aria-pressed={expandedView}
                onClick={()=>setExpandedView(current=>!current)}>{expandedView?'Standard size':'Expand view'}</button>
              <button type="button" className="secondary-btn small-btn" disabled={renderBusy} onClick={preview}>
                {renderBusy?'Saving…':'Save image'}</button>
            </div>
          </div>
          <Suspense fallback={<div className="consultation-3d-loading">Loading your 3D design…</div>}>
            <Live3D project={project} photoUrl={photoUrl} photoMode={overlay}
              viewportHeight={viewportHeight} lightingPreview={lightingPreview} fitRequest={fitRequest}/>
          </Suspense>
          <ConsultationFinishDock project={project} onChange={onChange} onRequestDetails={requestDetails}/>
        </div>
        {inspectorSection&&<ConsultationDetailsPanel project={project} onChange={onChange}
          section={inspectorSection} onSectionChange={setInspectorSection}
          onClose={()=>setInspectorSection(null)} onEditLayout={editLayout}/>}
      </div>
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
      {step==='render'&&<div className="studio-plan-access">
        <div><h4>Plans, quantities & exports</h4>
          <p>Open this revision in Takeoff to review framing and installation drawings, the concrete site plan and the full material order. Your consultation stays saved.</p></div>
        <button type="button" className="secondary-btn" onClick={openPlans}>Open plans & exports →</button>
      </div>}
      {step==='render'&&<details className="studio-material-review">
        <summary>Current material list · {handoff.materials.length} lines</summary>
        <div className="studio-material-table"><table>
          <thead><tr><th scope="col">Material / selection</th><th scope="col">Group</th><th scope="col" className="quantity">Quantity</th></tr></thead>
          <tbody>{handoff.materials.map((item,index)=><tr key={item.category+'-'+item.name+'-'+index}>
            <td><strong>{item.name}</strong>{item.color&&<small>{item.color}</small>}
              <small>{item.stockRecommendation}</small>{item.notes&&<small>{item.notes}</small>}</td>
            <td>{item.category}</td><td className="quantity">{item.quantity.toLocaleString('en-US',{maximumFractionDigits:2})} {item.unit}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
      {step==='render'&&<details className="studio-estimator-exchange">
        <summary><span>Pricing & scope exchange</span><small>Consultant tools · external estimator</small></summary>
      <div className="consultation-handoff">
        <div>
          <h4>Send the design to your estimating app</h4>
          <p className="muted">Export the current dimensions, material quantities and selected options for pricing.</p>
          {!!handoff.blockers.length&&<div className="consultation-handoff-warnings">
            <strong>Review before pricing / ordering</strong>
            {handoff.blockers.slice(0,8).map((note,i)=><p key={i}>{note}</p>)}
          </div>}
          <button type="button" className="secondary-btn" onClick={()=>
            downloadJson('EZTakeoff-'+project.id+'-revision-'+project.revision+'-estimate-request.json',handoff)}>
            Export dimensions & options (JSON)
          </button>
          <p className="muted">Import this design request into your estimating workflow.</p>
        </div>
        <div>
          <h4>Import the estimating app's pricing tiers</h4>
          <label className="consultation-upload">
            Import validated pricing response JSON
            <input type="file" accept=".json,application/json" onChange={onImport}/>
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
      </details>}
    </section>}
    {saveError&&<div className="studio-storage-alert" role="alert">{saveError}</div>}
    {notice&&<div className="consultation-notice" role="status">{notice}</div>}
    <footer className="consultation-footer">
      <button type="button" className="ghost-btn" disabled={step==='photo'} onClick={()=>changeStep(STEPS[Math.max(0,STEPS.findIndex(s=>s.id===step)-1)].id)}>Previous</button>
      <span>{STEPS.findIndex(s=>s.id===step)+1} / 4 · {totalDeckArea.toFixed(1)} sq ft</span>
      {step!=='render'&&<button type="button" className="secondary-btn" onClick={()=>changeStep(STEPS[Math.min(3,STEPS.findIndex(s=>s.id===step)+1)].id)}>Continue →</button>}
    </footer>
  </div>;
}
export function ConsultationStudio(){
  const {projectId}=useParams<{projectId:string}>();
  const navigate=useNavigate();
  const [projects,setProjects]=useState<ConsultationProject[]>(loadConsultations);
  const [search,setSearch]=useState('');
  const [saveError,setSaveError]=useState('');
  useEffect(()=>{
    try{saveConsultations(projects);setSaveError('');}
    catch{setSaveError('This browser could not save your latest changes. Keep this page open and use Save & sync or export the design before leaving.');}
  },[projects]);
  const project=projects.find((p)=>p.id===projectId);
  const create=()=>{
    const id=crypto.randomUUID();
    setProjects((current)=>[makeConsultationProject(id),...current]);
    const quoteId=new URLSearchParams(window.location.search).get('quoteId');
    const linked=quoteId&&/^[0-9a-f-]{36}$/i.test(quoteId)?'?quoteId='+encodeURIComponent(quoteId):'';
    navigate('/consultation/'+id+linked);
  };
  const update=(changes:Partial<ConsultationProject>)=>{
    if(!projectId)return;
    setProjects((current)=>current.map((p)=>p.id===projectId?updateConsultation(p,changes):p));
  };
  return <div className={'consultations-shell studio-workspace'+(project?' studio-workspace--editing':'')}>
    <div className={project?'studio-workspace-strip':'consultations-banner'}>
      {project?<button type="button" className="ghost-btn small-btn" onClick={()=>navigate('/consultation')}>← All consultations</button>:
      <div><p className="eyebrow">S&S / CLIENT PRESENTATIONS</p><h2>Sales Consultation Studio</h2>
        <p className="muted">Draw together. Explore finishes. Turn the design into plans and a material list.</p></div>}
      <div className="consultations-banner-actions">
        <button type="button" className="ghost-btn small-btn" onClick={create}>+ New consultation</button>
      </div>
    </div>
    <details className="studio-save-sync">
      <summary>Save & sync <span>Private cloud projects and property photos</span></summary>
    <ConsultationCloudPanel project={project??null} onOpen={(remote)=>{
      // Opening a cloud revision replaces only that matching local record.
      // A photo that was already saved in this browser is kept unchanged.
      setProjects(current=>{
        const prior=current.find(p=>p.id===remote.id);
        return [{...remote,values:{fasciaHouseSide:true,...remote.values},photoPresent:prior?.photoPresent??false},
          ...current.filter(p=>p.id!==remote.id)];
      });
      navigate('/consultation/'+remote.id);
    }} onPhotoRestored={(id)=>{
      setProjects(current=>current.map(p=>p.id===id?
        updateConsultation(p,{photoPresent:true}):p));
    }}/>
    </details>
    {project?<ConsultationEditor key={project.id} project={project} onChange={update} saveError={saveError}/>:
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
