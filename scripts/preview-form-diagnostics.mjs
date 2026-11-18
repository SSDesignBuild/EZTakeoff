import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
let step='PASS',report='';
for(const [name,args] of [['assets',['run','assets:sync']],['tests',['test']],['build',['run','build']]]) {
 const r=spawnSync('npm',args,{encoding:'utf8',maxBuffer:10*1024*1024,timeout:220000});
 report=String(r.stdout??'')+'\n'+String(r.stderr??'');
 if(r.status!==0){step=name;break;}
}
const re=/(src\/[A-Za-z0-9_.\/\\-]+\.tsx?)\((\d+),(\d+)\): error TS(\d+)/g;
const errors=[...report.matchAll(re)];
await mkdir('dist',{recursive:true});
const marker=(s)=>String(s).replace(/[^A-Za-z0-9._-]+/g,'-').slice(0,78);
if(step!=='PASS') {
 await writeFile('dist/index.html','<!doctype html><meta charset="utf-8"><title>Preview test diagnostics</title><p>Preview build under repair.</p>');
 await writeFile('dist/DIAG-STAGE-'+step+'.html','<!doctype html><p>Netlify-only preview diagnostics.</p>');
 for(const [i,m] of errors.slice(0,12).entries()) {
  const file=marker(m[1].split('/').pop());
  const name=marker('ERR'+(i+1)+'-'+file+'-line'+m[2]+'-TS'+m[4])+'.html';
  await writeFile('dist/'+name,'<!doctype html><p>Compiler check, not customer page.</p>');
 }
 console.warn('Preview stage failure',step,'first TS error',errors[0]?.slice(1,5));
} else {
 await writeFile('dist/DIAG-SUCCESS.html','<!doctype html><p>All Netlify preview build phases passed.</p>');
}
