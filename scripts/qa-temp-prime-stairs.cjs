/* TEMPORARY, NEVER MERGE: diagnose strict Netlify preview errors.
 * Send only sanitized test names and compiler line references to owner's
 * Netlify request log. No user data, tokens, environment or source bodies. */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const testFiles=pkg.scripts.test.split(' && ').map(cmd=>
  (cmd.match(/^node (scripts\/test-[\w-]+\.cjs)$/)||[])[1]).filter(Boolean);
const diagnostic=[];
for(const file of testFiles){
 const result=spawnSync(process.execPath,[file],{
   cwd:root,encoding:'utf8',timeout:55000,maxBuffer:2e6});
 if(result.status!==0){
  const lines=((result.stderr||'')+'\n'+(result.stdout||'')).split(/\r?\n/);
  const err=lines.filter(l=>/AssertionError|Error:|TypeError|SyntaxError|ERR_|expected|actual/.test(l)).slice(0,4).join(' ');
  const trace=lines.find(l=>l.includes(path.basename(file)+':')&&/:[0-9]+:[0-9]+/.test(l))||'';
  diagnostic.push('TEST '+path.basename(file)+' '+err+' '+trace);
 }
}
const run=(bin,args)=>spawnSync(process.execPath,[bin,...args],{
 cwd:root,encoding:'utf8',timeout:150000,maxBuffer:5e6});
const ts=run('./node_modules/typescript/bin/tsc',['-b']);
if(ts.status!==0){
 const messages=((ts.stdout||'')+'\n'+(ts.stderr||'')).split(/\r?\n/).filter(l=>/error TS[0-9]+/.test(l)).slice(0,18);
 diagnostic.push(...(messages.length?messages:['tsc exit '+ts.status]));
}
let vite;
if(ts.status===0){
 vite=run('./node_modules/vite/bin/vite.js',['build']);
 if(vite.status!==0){
  const messages=((vite.stdout||'')+'\n'+(vite.stderr||'')).split(/\r?\n/).filter(l=>/error|failed|resolve|SyntaxError/i.test(l)).slice(0,10);
  diagnostic.push(...(messages.length?messages:['vite exit '+vite.status]));
 }
}
if(!diagnostic.length)diagnostic.push('PASS all '+testFiles.length+' suites and TS Vite');
const safe=s=>s.replaceAll(root,'repo').replace(/[^a-zA-Z0-9\s:._\-()\/]/g,' ').slice(0,270);
Promise.all(diagnostic.slice(0,25).map((m,i)=>new Promise(resolve=>{
 const uri='https://eztakeoff.netlify.app/__qa_prime_stairs/'+i+
   '?issue='+encodeURIComponent(safe(m));
 const req=https.get(uri,res=>{res.resume();res.on('end',resolve);res.on('error',resolve);});
 req.setTimeout(3500,()=>{req.destroy();resolve();});
 req.on('error',resolve);
}))).finally(()=>{
 console.log('Temporary QA complete: '+testFiles.length+' suites; TS Vite checked; NOT A RELEASE');
 process.exit(diagnostic.length===1&&diagnostic[0].startsWith('PASS')?0:1);
});
