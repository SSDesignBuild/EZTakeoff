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
console.log('PREVIEW DIAG STATUS',failed);
