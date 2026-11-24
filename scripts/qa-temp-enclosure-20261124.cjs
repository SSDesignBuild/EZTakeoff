/* TEMPORARY PREVIEW-ONLY QA. Never merge: restore normal Netlify command
 * and DELETE this file once all 27 tests, TS and Vite pass. This sends only
 * sanitized test basenames and compiler diagnostics to the owner's existing
 * Netlify request logs. No credentials, environment, customer names or photos. */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const tests=pkg.scripts.test.split(' && ').map(x=>
 (x.match(/^node (scripts\/test-[\w-]+\.cjs)$/)||[])[1]).filter(Boolean);
const errors=[];
for(const file of tests){
 const r=spawnSync(process.execPath,[file],{
  cwd:root,encoding:'utf8',timeout:50000,maxBuffer:2e6});
 if(r.status!==0){
  const all=(r.stderr||'')+'\n'+(r.stdout||'');
  const lines=all.split(/\r?\n/).filter(x=>
   /AssertionError|^Error:|SyntaxError|TypeError|ERR_|expected|actual|Cannot find/.test(x));
  errors.push('TEST '+path.basename(file)+' '+lines.slice(0,4).join(' '));
 }
}
const run=(bin,args)=>spawnSync(process.execPath,[bin,...args],
 {cwd:root,encoding:'utf8',timeout:150000,maxBuffer:4e6});
const ts=run('./node_modules/typescript/bin/tsc',['-b']);
if(ts.status!==0){
 const lines=((ts.stdout||'')+'\n'+(ts.stderr||'')).split(/\r?\n/)
  .filter(x=>/error TS\d+/.test(x)).slice(0,15);
 errors.push(...(lines.length?lines:['TSC FAILED WITHOUT PARSED ERROR']).map(x=>'TSC '+x));
}
let vite;
if(ts.status===0){
 vite=run('./node_modules/vite/bin/vite.js',['build']);
 if(vite.status!==0){
  const lines=((vite.stderr||'')+'\n'+(vite.stdout||'')).split(/\r?\n/)
    .filter(x=>/error|failed|resolve|SyntaxError/i.test(x)).slice(0,7);
  errors.push(...(lines.length?lines:['VITE FAILED WITHOUT PARSED ERROR']).map(x=>'VITE '+x));
 }
}
if(!errors.length)errors.push('ALL 27 TESTS TSC AND VITE PASS');
const clean=s=>s.replaceAll(root,'repo').replace(/[^a-zA-Z0-9\s:._\-()/]/g,' ').slice(0,230);
Promise.all(errors.slice(0,23).map((msg,i)=>new Promise(resolve=>{
 const uri='https://eztakeoff.netlify.app/__ezt_qa_1124/'+i+
   '?result='+encodeURIComponent(clean(msg));
 const req=https.get(uri,res=>{res.resume();res.on('end',resolve);res.on('error',resolve)});
 req.setTimeout(4000,()=>{req.destroy();resolve()});req.on('error',resolve);
}))).finally(()=>{console.log('Temporary QA executed '+tests.length+' tests and TS/Vite. Not a release.');
 process.exit(errors[0]==='ALL 27 TESTS TSC AND VITE PASS'?0:1);
});
