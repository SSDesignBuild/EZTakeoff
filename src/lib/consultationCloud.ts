import type { ConsultationProject } from './consultationProject';

/**
 * S&S Estimator Supabase Auth + RLS design store.
 * Publishable keys are public by definition; service role is NEVER exposed.
 * The server's design revision trigger and row policies remain authoritative.
 * Customer house photos stay in local IndexedDB until a private upload is explicitly selected.
 */
const URL_ROOT=String(import.meta.env.VITE_SUPABASE_URL??'').replace(/\/$/,'');
const PUBLISHABLE=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??'');
const SESSION_KEY='sns-estimator-cloud-session-v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AuthSession={
 access_token:string;refresh_token:string;expires_at:number;
 user:{id:string;email?:string};
};
export type CloudDesignRecord={
 id:string;quote_id:string|null;owner_id:string;current_revision:number;
 accepted_revision:number|null;design_json:ConsultationProject;
 updated_at:string;
};
export const cloudConfigured=()=>Boolean(URL_ROOT&&PUBLISHABLE);
const storage=()=>{
 try{return window.sessionStorage;}catch{return null;}
};
const store=(s:AuthSession|null)=>{
 const target=storage();if(!target)return;
 if(!s)target.removeItem(SESSION_KEY);
 else target.setItem(SESSION_KEY,JSON.stringify(s));
};
const read=():AuthSession|null=>{
 try{
  const s=storage()?.getItem(SESSION_KEY);
  if(!s)return null;
  const data=JSON.parse(s) as AuthSession;
  return data?.access_token&&data?.refresh_token&&uuid.test(data?.user?.id??'')?data:null;
 }catch{return null;}
};
const decode=async (response:Response)=>{
 const payload=await response.json().catch(()=>null) as Record<string,unknown>|null;
 if(!response.ok){
  const message=String(payload?.msg??payload?.error_description??payload?.message??payload?.error??'Request failed');
  throw new Error(message.slice(0,360));
 }
 return payload;
};
const authPost=async(path:string,body:Record<string,string>)=>{
 if(!cloudConfigured())throw new Error('Cloud connection is not configured.');
 const response=await fetch(URL_ROOT+'/auth/v1/'+path,{
  method:'POST',headers:{apikey:PUBLISHABLE,'Content-Type':'application/json'},
  body:JSON.stringify(body),
 });
 return decode(response);
};
const parseSession=(data:Record<string,unknown>|null):AuthSession=>{
 const u=data?.user as Record<string,unknown>|undefined;
 if(typeof data?.access_token!=='string'||typeof data?.refresh_token!=='string'||
   typeof u?.id!=='string'||!uuid.test(u.id))throw new Error('Invalid Estimator login response.');
 return {
  access_token:data.access_token,
  refresh_token:data.refresh_token,
  expires_at:Date.now()+Math.max(60,Number(data.expires_in??3600))*1000,
  user:{id:u.id,email:typeof u.email==='string'?u.email:undefined},
 };
};
export const currentCloudUser=()=>read()?.user??null;
export async function signInEstimator(email:string,password:string){
 if(!email.trim()||!password)throw new Error('Email and password required.');
 const data=await authPost('token?grant_type=password',{email:email.trim(),password});
 const session=parseSession(data);store(session);return session.user;
}
async function session(){
 let s=read();if(!s)throw new Error('Sign in using your Estimator account.');
 if(s.expires_at<Date.now()+60000){
  try{
   const refreshed=await authPost('token?grant_type=refresh_token',{
    refresh_token:s.refresh_token,
   });
   s=parseSession(refreshed);store(s);
  }catch(error){store(null);throw error;}
 }
 return s;
}
async function rest(path:string,method='GET',body?:unknown){
 const s=await session();
 const headers:Record<string,string>={
  apikey:PUBLISHABLE,Authorization:'Bearer '+s.access_token,
  Accept:'application/json',
 };
 if(body!==undefined)headers['Content-Type']='application/json';
 if(method!=='GET')headers.Prefer='return=representation';
 const result=await fetch(URL_ROOT+'/rest/v1/'+path,{
  method,headers,body:body===undefined?undefined:JSON.stringify(body),
 });
 return decode(result);
}
export async function signOutEstimator(){
 const current=read();
 store(null);
 if(!current||!cloudConfigured())return;
 try{await fetch(URL_ROOT+'/auth/v1/logout',{method:'POST',headers:{
  apikey:PUBLISHABLE,Authorization:'Bearer '+current.access_token,
 }});}catch{/* Local token already cleared; remote request may be offline. */}
}
export async function listEstimatorDesigns():Promise<CloudDesignRecord[]>{
 const result=await rest('quote_designs?select=id,quote_id,owner_id,current_revision,accepted_revision,design_json,updated_at&order=updated_at.desc&limit=100');
 return Array.isArray(result)?result as CloudDesignRecord[]:[];
}
export const publicDesignSnapshot=(project:ConsultationProject):ConsultationProject=>({
 ...project,
 // Quotes/prices are authoritative in Estimator. Do not duplicate them in
 // a design snapshot; the photo blob is local, never in JSON.
 estimatingResponse:null,photoPresent:false,
});
export async function saveEstimatorDesign(project:ConsultationProject,
 cloudRevision:number|null,quoteId:string|null):Promise<CloudDesignRecord>{
 if(!uuid.test(project.id))throw new Error('A valid design ID is required.');
 if(quoteId!==null&&!uuid.test(quoteId))throw new Error('Quote ID must be a valid UUID.');
 const payload=publicDesignSnapshot(project);
 let result:unknown;
 if(cloudRevision===null){
  const s=await session();
  result=await rest('quote_designs','POST',{
   id:project.id,owner_id:s.user.id,quote_id:quoteId,
   current_revision:1,design_json:payload,
  });
 }else{
  if(!Number.isInteger(cloudRevision)||cloudRevision<1)throw new Error('Invalid cloud revision.');
  const identifier=encodeURIComponent(project.id);
  const match='quote_designs?id=eq.'+identifier+'&current_revision=eq.'+cloudRevision;
  const update:Record<string,unknown>={
   current_revision:cloudRevision+1,design_json:payload,
  };
  if(quoteId)update.quote_id=quoteId;
  result=await rest(match,'PATCH',update);
 }
 const rows=Array.isArray(result)?result as CloudDesignRecord[]:[];
 if(rows.length!==1)throw new Error('Cloud save conflict or access denied. Refresh the design before editing again.');
 return rows[0];
}
export const isValidQuoteId=(value:string)=>uuid.test(value);

const PHOTO_BUCKET='sns-design-private';
const PHOTO_NAME='house-photo';
const allowedImages=new Set(['image/jpeg','image/png','image/webp']);
/** Explicit opt-in: cloud photo transfer never occurs as part of a design JSON save. */
export async function uploadEstimatorHousePhoto(designId:string,photo:Blob):Promise<void>{
 if(!uuid.test(designId))throw new Error('Invalid design identifier.');
 if(!allowedImages.has(photo.type)||photo.size>10*1024*1024||photo.size<1)
  throw new Error('Cloud images must be JPG, PNG or WebP and no larger than 10 MB.');
 const s=await session();
 const path=URL_ROOT+'/storage/v1/object/'+PHOTO_BUCKET+'/'+designId+'/'+PHOTO_NAME;
 const response=await fetch(path,{method:'POST',headers:{
  apikey:PUBLISHABLE,Authorization:'Bearer '+s.access_token,
  'Content-Type':photo.type,'x-upsert':'true',
 },body:photo});
 if(!response.ok){
  const data=await response.json().catch(()=>null) as Record<string,unknown>|null;
  throw new Error(String(data?.message??data?.error??'Private photo upload failed').slice(0,240));
 }
}
/** Object is always private and only retrievable with a user JWT and RLS. */
export async function downloadEstimatorHousePhoto(designId:string):Promise<Blob|null>{
 if(!uuid.test(designId))throw new Error('Invalid design identifier.');
 const s=await session();
 const path=URL_ROOT+'/storage/v1/object/authenticated/'+PHOTO_BUCKET+'/'+designId+'/'+PHOTO_NAME;
 const response=await fetch(path,{headers:{apikey:PUBLISHABLE,Authorization:'Bearer '+s.access_token}});
 if(response.status===404)return null;
 if(!response.ok)throw new Error('Private cloud photo could not be accessed with this account.');
 const photo=await response.blob();
 if(!allowedImages.has(photo.type)||photo.size>10*1024*1024)throw new Error('Invalid cloud photograph.');
 return photo;
}
