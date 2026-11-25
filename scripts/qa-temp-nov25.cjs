/* TEMPORARY BRANCH-ONLY QA. Remove before release and restore
 * canonical Netlify npm test + build. Only sanitized assertion/TypeScript
 * errors go to existing owner Netlify request log; no customer data/secrets. */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const scripts=pkg.scripts.test.split(' && ').map(x=>
 (x.match(/^node (scripts\/test-[\w-]+\.cjs)$/)||[])[1]).filter(Boolean);
const errors=[];
for(const script of scripts){
 const p=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',
  timeout:50000,maxBuffer:1024*1024});
 if(p.status!==0){
  const output=(p.stderr||'')+'\n'+(p.stdout||'');
  const lines=output.split(/\r?\n/);
  const signal=lines.filter(l=>/AssertionError|Error:|TypeError|SyntaxError|ERR_|expected|actual/.test(l)).slice(0,3);
  const stack=lines.find(l=>l.includes(path.basename(script)+':')&&/:[0-9]+:[0-9]+/.test(l))||'';
  errors.push('TEST '+path.basename(script)+' '+signal.join(' ')+' '+stack);
 }
}
const run=(file,args)=>spawnSync(process.execPath,[file,...args],{
 cwd:root,encoding:'utf8',timeout:150000,maxBuffer:4*1024*1024});
const ts=run('./node_modules/typescript/bin/tsc',['-b']);
if(ts.status!==0){
 const diagnostic=((ts.stdout||'')+'\n'+(ts.stderr||'')).split(/\r?\n/)
  .filter(s=>/error TS[0-9]+/.test(s)).slice(0,15);
 errors.push(...(diagnostic.length?diagnostic:['TSC failed no parsed diagnostic']).map(x=>'TSC '+x));
}
let vite;
if(ts.status===0){
 vite=run('./node_modules/vite/bin/vite.js',['build']);
 if(vite.status!==0){
  const diagnostic=((vite.stdout||'')+'\n'+(vite.stderr||'')).split(/\r?\n/)
   .filter(s=>/error|failed|resolve|SyntaxError/i.test(s)).slice(0,8);
  errors.push(...(diagnostic.length?diagnostic:['Vite failed']).map(x=>'VITE '+x));
 }
}
if(!errors.length)errors.push('PASS '+scripts.length+' tests TS VITE');
const clean=s=>s.replaceAll(root,'repo').replace(/[^a-zA-Z0-9\s:._\-()\/]/g,' ').slice(0,260);
Promise.all(errors.slice(0,20).map((m,i)=>new Promise(resolve=>{
 const u='https://eztakeoff.netlify.app/__qa_dualprofile_1125/'+i+'?issue='+
   encodeURIComponent(clean(m));
 const req=https.get(u,res=>{res.resume();res.on('end',resolve);res.on('error',resolve)});
 req.setTimeout(3000,()=>{req.destroy();resolve()});req.on('error',resolve);
}))).finally(()=>{console.log('QA result '+scripts.length+' scripts processed. Temporary ONLY.');
 process.exit(errors.length===1&&errors[0].startsWith('PASS')?0:1);
});
