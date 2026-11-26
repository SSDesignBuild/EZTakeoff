/** Verified Sika/Butterfield product-reference assets. Bundled originals make
 * ordinary builds offline-safe; missing assets have a bounded fetch budget.
 * No stock-image replacement and no invented manufacturer photograph. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchImageWithTimeout} from './assetFetch.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=JSON.parse(await readFile(path.join(root,'src/data/sikaConcreteAssets.json'),'utf8'));
const bundle=JSON.parse(await readFile(path.join(root,'src/data/sikaConcreteAssetBundle.json'),'utf8'));
const cacheRoot=path.join(root,'node_modules/.cache/eztakeoff-sika-assets');
const started=Date.now(),deadline=started+30000;
let next=0,fetched=0,cached=0,bundled=0,missing=0;
const results=[];
const allowed=new Set(['www.butterfieldcolor.com','usa.sika.com']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const valid=(bytes,item)=>bytes.length===item.bytes&&sha(bytes)===item.sha256&&
  (item.path.endsWith('.pdf')?bytes.subarray(0,5).toString()==='%PDF-':
    bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9);
async function cachedBytes(file,item){try{const bytes=await readFile(file);return valid(bytes,item)?bytes:null;}catch{return null;}}
async function one(item){
  const url=new URL(item.sourceUrl),relative=String(item.path).replace(/^\//,'');
  if(url.protocol!=='https:'||!allowed.has(url.hostname)||
    !relative.startsWith('manufacturer/sika/')||relative.includes('..')||
    !/\.(jpg|pdf)$/.test(relative))throw new Error('Unsafe Sika reference asset: '+item.id);
  const target=path.join(root,'public',relative),backup=path.join(cacheRoot,path.basename(relative));
  await mkdir(path.dirname(target),{recursive:true});
  const existing=await cachedBytes(target,item)||await cachedBytes(backup,item);
  if(existing){await writeFile(target,existing);cached++;results.push({id:item.id,available:true,source:'verified-cache'});return;}
  const supplied=typeof bundle[item.id]==='string'?Buffer.from(bundle[item.id],'base64'):null;
  if(supplied&&valid(supplied,item)){
    await writeFile(target,supplied);bundled++;
    results.push({id:item.id,available:true,source:'reviewed-source-bundle'});return;
  }
  let reason='Sika asset delivery deadline exceeded';
  for(let attempt=0;attempt<2&&Date.now()<deadline&&process.env.SIKA_ASSETS_OFFLINE!=='1';attempt++){
    try{
      const {bytes}=await fetchImageWithTimeout(item.sourceUrl,{
        timeoutMs:Math.min(5500,deadline-Date.now()),maxBytes:2*1024*1024,
        headers:{'User-Agent':'Mozilla/5.0 (EZTakeoff manufacturer reference catalog)',
          'Referer':item.productUrl,'Accept':item.path.endsWith('.pdf')?'application/pdf':'image/jpeg'}});
      if(!valid(bytes,item))throw new Error('Manufacturer reference differs from the reviewed source; review catalog revision before replacing it.');
      await writeFile(target,bytes);
      try{await mkdir(cacheRoot,{recursive:true});await writeFile(backup,bytes);}catch{/* optional cache */}
      fetched++;results.push({id:item.id,available:true,source:'manufacturer'});return;
    }catch(error){reason=error instanceof Error?error.message:String(error);if(/HTTP 4\d\d/.test(reason))break;}
  }
  missing++;results.push({id:item.id,available:false,reason});
  console.warn('OFFICIAL SIKA REFERENCE UNAVAILABLE '+item.id+': '+reason);
}
async function worker(){for(;;){const index=next++;if(index>=assets.length)return;await one(assets[index]);}}
await Promise.all(Array.from({length:6},worker));
await writeFile(path.join(root,'public/manufacturer/sika/asset-status.json'),JSON.stringify({
  sourceRevision:'2026-11-25',total:assets.length,available:cached+bundled+fetched,unavailable:missing,
  assets:results.sort((a,b)=>a.id.localeCompare(b.id)),
},null,2)+'\n');
console.log('Sika reference assets: '+(cached+bundled+fetched)+'/'+assets.length+' verified ('+
  cached+' cache, '+bundled+' source bundle, '+fetched+' fetched); '+(Date.now()-started)+'ms, maximum network budget 30000ms.');
if(missing){console.error('Required reviewed Sika references are unavailable. Restore the bundled originals before release.');process.exitCode=1;}
