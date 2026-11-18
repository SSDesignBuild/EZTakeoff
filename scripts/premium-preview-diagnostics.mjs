import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const results=[];let failed='none';
for(const [stage,args] of [['assets',['run','assets:sync']],['test',['test']],['build',['run','build']]]) {
 const r=spawnSync('npm',args,{encoding:'utf8',maxBuffer:6*1024*1024,timeout:180000});
 const output=String(r.stdout??'')+'\n'+String(r.stderr??'');
 results.push({stage,code:r.status,output});
 if(r.status!==0){failed=stage;break;}
}
await mkdir('dist',{recursive:true});
const lines=results.map(({stage,code,output})=>{
 const all=output.split('\n');
 const filtered=all.filter(x=>/error TS\d+|AssertionError|ReferenceError|SyntaxError|TypeError|ERR_ASSERTION|^Error:|FAIL |Expected values|Actual:|Expected:|at .*scripts\//.test(x));
 return '\nSTAGE='+stage+' EXIT='+code+'\n'+filtered.join('\n').slice(0,16000);
}).join('\n');
await writeFile('dist/build-diagnostics.txt','PREVIEW COMPILER ERRORS ONLY\n'+lines);
if(failed!=='none')await writeFile('dist/index.html','<!doctype html><meta charset="utf-8"><title>Under test</title><p>Internal preview build error. Strict production deploy blocked.</p>');
const safe=s=>String(s).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,72);
const last=results.at(-1)?.output??'';
const ts=[...last.matchAll(/(src\/[\w.\-/]+\.tsx?)\((\d+),(\d+)\): error TS(\d+)/g)];
if(failed!=='none'){
 await writeFile('dist/DIAG-FAILED-'+safe(failed)+'.html','<!doctype html><p>Test/compile diagnostics only.</p>');
 if(ts.length){
  for(const [i,m] of ts.slice(0,15).entries()){
   const file=safe('TS'+m[4]+'-'+m[1].split('/').pop()+'-LINE-'+m[2]+'-COL-'+m[3]+'-E'+i)+'.html';
   await writeFile('dist/'+file,'<!doctype html><p>Build diagnostic, no client data.</p>');
  }
 }else{
  const stack=last.match(/(?:scripts\/)([\w.-]+\.cjs):(\d+):(\d+)/);
  const err=last.match(/(?:AssertionError|ReferenceError|SyntaxError|TypeError|Error):[^\n]*/);
  const file=safe('TEST-'+(stack?.[1]??'unknown')+'-L'+(stack?.[2]??0)+'-'+(err?.[0]??'unknown'))+'.html';
  await writeFile('dist/'+file,'<!doctype html><p>Test diagnostic, no client data.</p>');
 }
}else await writeFile('dist/DIAG-ALL-STAGES-PASSED.html','<!doctype html><p>All preview checks passed.</p>');
console.log('PREVIEW DIAG STATUS',failed);
