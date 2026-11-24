/* TEMPORARY preview-only TypeScript diagnostics; REMOVE before merging. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const r=cp.spawnSync('node',['./node_modules/typescript/bin/tsc','-p','tsconfig.app.json','--noEmit'],{
 cwd:root,encoding:'utf8',timeout:90000,
});
const output=String(r.stdout||'')+'\n'+String(r.stderr||'');
const lines=output.split(/\r?\n/).filter(Boolean);
const first=lines.find(x=>/error TS\d+:/.test(x))??lines.find(x=>x.trim())??'no-error';
const safe=first.replace(/[^A-Za-z0-9-_]/g,'-').replace(/-+/g,'-').slice(0,95);
const dir=path.join(root,'netlify/functions');fs.mkdirSync(dir,{recursive:true});
const filename='qa-ts-'+String(r.status??99)+'-'+safe+'.js';
fs.writeFileSync(path.join(dir,filename),
"exports.handler=async()=>({statusCode:200,body:'Temporary QA metadata only'});\n");
console.log('TypeScript preview diagnostics compiled; failure count',lines.filter(x=>/error TS\d+:/.test(x)).length);
