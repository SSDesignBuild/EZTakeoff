import { useEffect, useState, type FormEvent } from 'react';
import type { ConsultationProject } from '../lib/consultationProject';
import {readHousePhoto,saveHousePhoto} from '../lib/consultationPhoto';
import {
 cloudConfigured,currentCloudUser,signInEstimator,signOutEstimator,
 listEstimatorDesigns,saveEstimatorDesign,isValidQuoteId,
 uploadEstimatorHousePhoto,downloadEstimatorHousePhoto,
 type CloudDesignRecord,
} from '../lib/consultationCloud';

type User={id:string;email?:string};
type Props={
 project:ConsultationProject|null;
 onOpen:(project:ConsultationProject)=>void;
 onPhotoRestored:(projectId:string)=>void;
};
export function ConsultationCloudPanel({project,onOpen,onPhotoRestored}:Props){
 const [user,setUser]=useState<User|null>(()=>currentCloudUser());
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [quoteId,setQuoteId]=useState('');
 const [items,setItems]=useState<CloudDesignRecord[]>([]);
 const [loadedVersions,setLoadedVersions]=useState<Record<string,number>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const reload=async()=>{
  const rows=await listEstimatorDesigns();setItems(rows);
  return rows;
 };
 useEffect(()=>{
  if(!user)return;
  let active=true;
  listEstimatorDesigns().then(rows=>{if(active)setItems(rows);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});
  return ()=>{active=false;};
 },[user?.id]);
 useEffect(()=>{
  if(!project){setQuoteId('');return;}
  const current=items.find(item=>item.id===project.id);
  const fromEstimator=new URLSearchParams(window.location.search).get('quoteId')??'';
  setQuoteId(current?.quote_id??(isValidQuoteId(fromEstimator)?fromEstimator:''));
 },[project?.id,items]);
 const login=async(e:FormEvent)=>{
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const result=await signInEstimator(email,password);
   setUser(result);setPassword('');
   setMessage('Authenticated with your S&S Estimator account.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const open=(item:CloudDesignRecord)=>{
  if(!item.design_json||item.design_json.schemaVersion!==1||
    item.design_json.id!==item.id){
   setError('This cloud design has an invalid or mismatched schema.');return;
  }
  // House image is deliberately NOT copied to cloud as JSON.
  // Keep local photos only if they already exist for this design ID.
  setLoadedVersions(current=>({...current,[item.id]:item.current_revision}));
  onOpen({...item.design_json,photoPresent:false,estimatingResponse:null});
  setMessage('Cloud revision '+item.current_revision+' loaded. House photo remains device-local.');
  setError('');
 };
 const save=async()=>{
  if(!project||!user)return;
  setBusy(true);setError('');setMessage('');
  try{
   if(quoteId.trim()&&!isValidQuoteId(quoteId.trim())){
    throw new Error('Quote ID must be an Estimator quote UUID.');
   }
   const current=items.find(item=>item.id===project.id);
   if(current&&loadedVersions[project.id]===undefined){
    throw new Error('An existing cloud design already has this ID. Load its current revision before saving; your local draft was not overwritten.');
   }
   if(current?.accepted_revision!==null&&current?.accepted_revision!==undefined)
    throw new Error('This design has an accepted revision and is frozen.');
   const saved=await saveEstimatorDesign(project,
    loadedVersions[project.id]??null,quoteId.trim()||null);
   setLoadedVersions(all=>({...all,[project.id]:saved.current_revision}));
   await reload();
   setMessage('Design saved securely · cloud revision '+saved.current_revision+
    '. Client home photographs remain on this device.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const uploadPhoto=async()=>{
  if(!project||!user)return;
  setBusy(true);setError('');setMessage('');
  try{
   const record=items.find(item=>item.id===project.id);
   if(!record)throw new Error('Save the design to cloud before uploading its photo.');
   if(record.accepted_revision!==null)throw new Error('Accepted design media is locked.');
   const photo=await readHousePhoto(project.id);
   if(!photo)throw new Error('No property photo is stored in this browser.');
   await uploadEstimatorHousePhoto(project.id,photo);
   setMessage('Property photograph securely uploaded to private Estimator storage.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const restorePhoto=async()=>{
  if(!project||!user)return;
  setBusy(true);setError('');setMessage('');
  try{
   const record=items.find(item=>item.id===project.id);
   if(!record)throw new Error('Load a cloud design first.');
   const photo=await downloadEstimatorHousePhoto(project.id);
   if(!photo)throw new Error('This design has no private cloud photo.');
   await saveHousePhoto(project.id,new File([photo],'home-photo',{type:photo.type}));
   onPhotoRestored(project.id);
   setMessage('Private home photograph restored to this browser.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 const logout=async()=>{
  setBusy(true);
  try{await signOutEstimator();setUser(null);setItems([]);setLoadedVersions({});setMessage('');setError('');}
  finally{setBusy(false);}
 };
 if(!cloudConfigured())return <section className="content-card" style={{padding:20,marginBottom:16}}>
  <strong>Estimator cloud not configured</strong>
  <p className="muted">Designs continue to save locally. An administrator must configure the correct S&S Estimator cloud connection.</p>
 </section>;
 return <section className="content-card" style={{padding:20,marginBottom:16}}>
  <div className="consultation-list-heading">
   <div><p className="eyebrow">S&S ESTIMATOR CLOUD</p>
    <h3>Secure design library</h3>
    <p className="muted">Cross-device saved designs use the Estimator account and quote permissions. Estimator remains the source of selling prices.</p></div>
   {user&&<button type="button" className="ghost-btn small-btn" disabled={busy} onClick={logout}>Sign out</button>}
  </div>
  {!user?<form onSubmit={login} className="consultation-form">
   <div className="consultation-form-two">
    <label>Estimator account email<input type="email" required autoComplete="username" value={email}
      onChange={e=>setEmail(e.target.value)} /></label>
    <label>Password<input type="password" required autoComplete="current-password" value={password}
      onChange={e=>setPassword(e.target.value)} /></label>
   </div>
   <button type="submit" className="secondary-btn" disabled={busy}>{busy?'Signing in…':'Sign in to Estimator cloud'}</button>
  </form>:<>
   <p className="muted">Signed in: {user.email??'Estimator team member'}</p>
   {project&&<div className="consultation-form" style={{maxWidth:720}}>
    <label>Estimator quote ID (optional)
     <input type="text" value={quoteId} placeholder="Paste the quote UUID to link this design"
       onChange={e=>setQuoteId(e.target.value)} />
    </label>
    <p className="muted">Quote assignment is checked by database permissions. Saving never changes Estimator prices or overwrites previous design revisions.</p>
    <button className="secondary-btn" type="button" disabled={busy} onClick={save}>
      {busy?'Saving…':'Save this design to secure cloud'}
    </button>
    {items.some(item=>item.id===project.id)&&<div className="consultation-form-two" style={{marginTop:12}}>
      <button className="ghost-btn" type="button" disabled={busy||!project.photoPresent} onClick={uploadPhoto}>
        Upload home photo privately
      </button>
      <button className="ghost-btn" type="button" disabled={busy} onClick={restorePhoto}>
        Restore private cloud photo
      </button>
    </div>}
   </div>}
   <div style={{marginTop:16}}>
    <div className="consultation-list-heading">
     <h4>Team-accessible designs ({items.length})</h4>
     <button type="button" className="ghost-btn small-btn" disabled={busy}
      onClick={async()=>{setBusy(true);setError('');try{await reload();}
        catch(e){setError(e instanceof Error?e.message:String(e));}
        finally{setBusy(false);}}}>Refresh library</button>
    </div>
    {items.length===0&&<p className="muted">No cloud designs visible to your Estimator account yet.</p>}
    {items.map(item=><button type="button" key={item.id}
       className="consultation-project-row" onClick={()=>open(item)}>
      <strong>{item.design_json?.client?.name||item.design_json?.title||'Untitled design'}</strong>
      <span>{item.design_json?.client?.address||'No property address'} · {item.quote_id?'Linked to Estimator quote':'Unlinked draft'}</span>
      <small>Cloud revision {item.current_revision} · {item.accepted_revision!==null?'Accepted / frozen':'Editable'} · {new Date(item.updated_at).toLocaleDateString()}</small>
    </button>)}
   </div>
  </>}
  {error&&<p role="alert" style={{color:'#b94e40'}}>{error}</p>}
  {message&&<p role="status">{message}</p>}
  <p className="muted">House photo bytes are never included in design JSON or estimating requests. Private photo sync requires a separate explicit upload/download. Only authorized Estimator accounts can access a cloud design and its media.</p>
 </section>;
}
