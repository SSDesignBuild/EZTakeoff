import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const logs=[];
let failure=false;
for(const cmd of ['npm run assets:sync','npm test','npm run build']) {
 const [tool,...args]=cmd.split(' ');
 const result=spawnSync(tool,args,{encoding:'utf8',maxBuffer:12*1024*1024,timeout:220000});
 const text=[cmd, String(result.stdout??''),String(result.stderr??''),result.error?String(result.error):''].join('\n');
 logs.push(text.slice(-75000));
 if(result.status!==0){failure=true;break;}
}
await mkdir('dist',{recursive:true});
const report='NETLIFY PREVIEW ONLY - NO CUSTOMER DATA\n'+logs.join('\n-----\n');
await writeFile('dist/build-diagnostics.txt',report,'utf8');
if(failure) {
 await writeFile('dist/index.html','<!doctype html><meta charset="utf-8"><h1>Build diagnostic preview</h1><p>Build failed. See /build-diagnostics.txt for compiler output.</p>','utf8');
}
console.log(failure?'Preview diagnostic report published; blocking production merge.':'All preview checks succeeded.');
