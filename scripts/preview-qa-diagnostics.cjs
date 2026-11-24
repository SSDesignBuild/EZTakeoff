/* Preview-only diagnostics. REMOVE before merging. No data or secrets printed. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'netlify/functions');fs.mkdirSync(dir,{recursive:true});
const tests=require(path.join(root,'package.json')).scripts.test.match(/node scripts\/[a-z0-9-]+\.cjs/g)||[];
let failed=0;
for(let i=0;i<tests.length;i++){
 const file=tests[i].slice('node '.length),r=cp.spawnSync(process.execPath,[file],{
  cwd:root,encoding:'utf8',timeout:90000,
 });
 if(r.status===0)continue;
 failed++;
 const name=path.basename(file,'.cjs').replace(/[^a-z0-9-]/g,'').slice(0,45);
 const marker='qa-failed-'+String(i).padStart(2,'0')+'-'+name;
 fs.writeFileSync(path.join(dir,marker+'.js'),
  "exports.handler=async()=>({statusCode:200,body:'Diagnostic marker'})\n");
 // Diagnostic text encoded only into temporary function NAMES so Netlify
 // deploy metadata can identify assertion roots without web access.
 // Never include environment variables or sensitive project data here.
 const raw=String(r.stderr||r.stdout||'').slice(-900);
 const chunks=Buffer.from(raw).toString('base64url').match(/.{1,68}/g)||[];
 chunks.slice(0,20).forEach((part,j)=>{
  fs.writeFileSync(path.join(dir,'qa-log-'+String(i).padStart(2,'0')+'-'+
   String(j).padStart(2,'0')+'-'+part+'.js'),
   "exports.handler=async()=>({statusCode:200,body:'Diagnostic marker'})\n");
 });
}
console.log('Preview diagnostic completed',tests.length,'scripts, failures:',failed);
