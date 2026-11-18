/**
 * Materialize verified manufacturer swatches at build time.
 *
 * Netlify downloads these images into the static output so sales consultations
 * have first-party, CORS-safe 3D texture maps and are not dependent on hotlinks
 * while the client is watching.
 *
 * Exact source URL + collection are in the manifest. No recoloring or AI
 * reconstruction of products is allowed.
 */
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entries=JSON.parse(await readFile(path.join(root,'src/data/timbertechVisualAssets.json'),'utf8'));
const mandatory=new Set(['vintage-coastline','vintage-weathered-teak','vintage-mahogany','landmark-boardwalk','legacy-ashwood']);
const errors=[];
let active=0,next=0,downloaded=0,unchanged=0,missed=0;
const mimeOk=(type,ext)=>ext==='webp'?type.includes('image/webp'):type.includes('image/jpeg')||type.includes('image/jpg');
async function get(item){
  const relative=item.swatch.replace(/^\//,'');
  if(!relative.startsWith('manufacturer/timbertech/')||relative.includes('..'))throw Error('Unexpected asset path '+relative);
  const target=path.join(root,'public',relative);
  await mkdir(path.dirname(target),{recursive:true});
  try{
    if((await stat(target)).size>1500){unchanged++;return;}
  }catch{}
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const ctl=new AbortController();
      const timeout=setTimeout(()=>ctl.abort(),18000);
      let resp;
      try{
        resp=await fetch(item.sourceUrl,{signal:ctl.signal,headers:{'Accept':'image/avif,image/webp,image/jpeg,image/*;q=0.8','User-Agent':'S&S-DesignBuild-EZTakeoff/1.0 (contractor product display)'}});
      }finally{clearTimeout(timeout);}
      if(!resp.ok)throw Error('HTTP '+resp.status);
      const type=(resp.headers.get('content-type')??'').toLowerCase();
      if(!mimeOk(type,target.endsWith('.webp')?'webp':'jpg'))throw Error('Wrong image MIME '+type);
      const buffer=Buffer.from(await resp.arrayBuffer());
      if(buffer.length<1500||buffer.length>2*1024*1024)throw Error('Unexpected image length '+buffer.length);
      if(target.endsWith('.jpg')&&!(buffer[0]===0xff&&buffer[1]===0xd8))throw Error('Invalid JPEG magic');
      if(target.endsWith('.webp')&&buffer.toString('ascii',0,4)!=='RIFF')throw Error('Invalid WebP magic');
      await writeFile(target,buffer);
      downloaded++;
      return;
    }catch(e){lastError=e;await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));}
  }
  missed++;
  errors.push(item.label+': '+String(lastError));
  if(mandatory.has(item.id))process.exitCode=1;
}
const worker=async()=>{
  while(next<entries.length){
    const i=next++;
    await get(entries[i]);
  }
};
await Promise.all(Array.from({length:6},worker));
console.log('TimberTech swatches: '+downloaded+' downloaded, '+unchanged+' cached, '+missed+' unavailable / '+entries.length+' catalog');
for(const err of errors)console.warn('MANUFACTURER SWATCH UNAVAILABLE '+err);
if(process.exitCode)console.error('Required verified sample images were not accessible. Aborting to avoid misrepresenting color.');
