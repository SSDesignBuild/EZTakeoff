/* TEMPORARY exact TypeScript/Vite diagnostics via OWN Netlify request logs.
 * No env, secret, source file contents or user material emitted.
 * Delete this script and restore strict command before merging. */
const fs=require('node:fs'),path=require('node:path'),
 {spawnSync}=require('node:child_process'),https=require('node:https');
const root=path.resolve(__dirname,'..');
function run(bin,args){
 const result=spawnSync(process.execPath,[bin,...args],{
  cwd:root,encoding:'utf8',timeout:150000,maxBuffer:5*1024*1024});
 return {status:result.status,output:(result.stdout||'')+'\n'+(result.stderr||'')};
}
const tsc=run('./node_modules/typescript/bin/tsc',['-b']);
const vite=tsc.status===0?run('./node_modules/vite/bin/vite.js',['build']):null;
const errors=(tsc.status===0?(vite?.output||''):(tsc.output||''))
 .split(/\r?\n/).filter(line=>
    /error TS\d+|\bError\b|Could not resolve|build failed|error during build|SyntaxError|ERR_/.test(line))
 .slice(0,12).map(line=>line.replaceAll(root,'<repo>').slice(0,220));
const messages=errors.length?errors:
 [tsc.status===0?(vite?.status===0?'TSC AND VITE BUILD PASS':'VITE FAILED WITHOUT MESSAGE'):
  'TSC FAILED WITHOUT COMPILER MESSAGE'];
Promise.all(messages.map((m,i)=>new Promise(resolve=>{
 const url='https://eztakeoff.netlify.app/__tmp_elite_compiler/'+i+
  '?summary='+encodeURIComponent(m.replace(/[^a-zA-Z0-9 .:_\/\-()\[\],]/g,' '));
 const req=https.get(url,res=>{res.resume();res.on('end',resolve);res.on('error',resolve);});
 req.setTimeout(4000,()=>{req.destroy();resolve();});req.on('error',resolve);
}))).finally(()=>process.exit(tsc.status===0&&vite?.status===0?0:1));
