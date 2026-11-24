/* TEMPORARY QA: isolate exact branch regressions/TypeScript compiler errors.
 * Do not merge. Delete and restore the standard strict netlify.toml command.
 * Emits only local test basenames / TS compiler locations to owner's Netlify
 * request logs. No environment variables, credentials, client data or files. */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),
 {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const tests=pkg.scripts.test.split(' && ')
 .map(cmd=>(cmd.match(/^node (scripts\/test-[\w-]+\.cjs)$/)||[])[1])
 .filter(Boolean);
const status=[];
for(const file of tests){
 const p=spawnSync(process.execPath,[file],{
  cwd:root,encoding:'utf8',timeout:50000,maxBuffer:1024*1024,
 });
 const lines=(p.stderr||'').replaceAll(root,'<repo>').split(/\r?\n/);
 const msg=lines.find(line=>/AssertionError|SyntaxError|TypeError|Error:|Cannot find/.test(line))||'unknown';
 status.push({test:path.basename(file),pass:p.status===0,
  issue:p.status===0?'':msg.replace(/[^a-zA-Z0-9\s:._\-]/g,' ').slice(0,170)});
}
const run=(bin,args)=>spawnSync(process.execPath,[bin,...args],
 {cwd:root,encoding:'utf8',timeout:140000,maxBuffer:4*1024*1024});
const tsc=run('./node_modules/typescript/bin/tsc',['-b']);
const compiler=((tsc.stdout||'')+'\n'+(tsc.stderr||'')).split(/\r?\n/)
 .filter(line=>/error TS[0-9]+/.test(line))
 .slice(0,18).map(line=>{
   const m=line.match(/([^\s/]+\.tsx?\(\d+,\d+\)): error (TS\d+)/);
   return m?m[1]+':'+m[2]:'typescript diagnostic';
 });
const vite=tsc.status===0?run('./node_modules/vite/bin/vite.js',['build']):null;
const failures=status.filter(x=>!x.pass);
const findings=[
 ...failures.map(x=>x.test+' '+x.issue),
 ...compiler,
 ...(tsc.status===0&&vite?.status!==0?['Vite build failed']:[]),
 ];
if(!findings.length)findings.push('ALL 26 TESTS AND TYPESCRIPT VITE PASS');
Promise.all(findings.slice(0,25).map((msg,i)=>new Promise(resolve=>{
 const clean=msg.replace(/[^a-zA-Z0-9\s:._\-()/]/g,' ').slice(0,205);
 const req=https.get('https://eztakeoff.netlify.app/__qa_temp_20261124/'+i+
 '?check='+encodeURIComponent(clean),res=>{res.resume();res.on('end',resolve);res.on('error',resolve);});
 req.setTimeout(2500,()=>{req.destroy();resolve();});req.on('error',resolve);
}))).then(()=>{
 if(failures.length||tsc.status!==0||vite?.status!==0)process.exit(1);
 console.log('TEMP diagnostic passed; restore standard strict command before release.');
});
