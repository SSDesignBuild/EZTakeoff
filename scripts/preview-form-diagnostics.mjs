import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const list=['visualCatalog.ts','visualGeometry.ts','ConsultationVisualPickers.tsx','Primitives.tsx','ManufacturerDeck3D.tsx','ManufacturerRailing3D.tsx','RenaissanceCover3D.tsx','Consultation3D.tsx','consultationProject.ts','ConsultationStudio.tsx','estimatingBridge.ts','services.ts'];
let step='PASS',report='';
for(const [name,args] of [['assets:sync',['run','assets:sync']],['test',['test']],['build',['run','build']]]) {
 const r=spawnSync('npm',args,{encoding:'utf8',maxBuffer:6*1024*1024,timeout:220000});
 report=String(r.stdout??'')+'\n'+String(r.stderr??'');
 if(r.status!==0){step=name;break;}
}
const re=/(src\/[A-Za-z0-9_.\/\\-]+\.tsx?)\((\d+),(\d+)\): error TS(\d+)/g;
const match=[...report.matchAll(re)];
const first=match[0];
const i=first?list.findIndex((x)=>first[1].endsWith('/'+x)):-1;
const formName=step==='PASS'?'eztdbg-OK':step==='build'?'eztdbg-BUILD-F'+Math.max(0,i)+'-L'+(first?.[2]??0)+'-TS'+(first?.[4]??0):'eztdbg-'+step.replace(/[^A-Za-z0-9]/g,'')+'-FAIL';
const escaped=(s)=>String(s).replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,100);
const inputs=match.slice(0,12).map((m,j)=>'<input type="hidden" name="E'+j+'_'+escaped(m[1].split('/').pop())+'_L'+m[2]+'_TS'+m[4]+'">').join('\n');
await mkdir('dist',{recursive:true});
await writeFile('dist/diagnostic.html','<!doctype html><html><head><title>Diagnostic</title></head><body><form name="'+formName+'" data-netlify="true" method="POST"><input name="form-name" type="hidden" value="'+formName+'">'+inputs+'<button>Diagnostic only</button></form></body></html>');
if(step!=='PASS')await writeFile('dist/index.html','<!doctype html><html><body><h1>Preview compile under repair</h1></body></html>');
console.log('Netlify stage:',step,'first TypeScript file index:',i,'line:',first?.[2]??'none','code:',first?.[4]??'none');
