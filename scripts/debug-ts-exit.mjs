import {spawnSync} from 'node:child_process';
const result=spawnSync('npm',['run','build'],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
const log=String(result.stdout??'')+'\n'+String(result.stderr??'');
if(result.status===0){console.log('TypeScript+Vite build OK');process.exit(0);}
const list=[
 'src/data/visualCatalog.ts','src/lib/visualGeometry.ts','src/components/ConsultationVisualPickers.tsx',
 'src/components/visual3d/Primitives.tsx','src/components/visual3d/ManufacturerDeck3D.tsx',
 'src/components/visual3d/ManufacturerRailing3D.tsx','src/components/visual3d/RenaissanceCover3D.tsx',
 'src/components/Consultation3D.tsx','src/lib/consultationProject.ts','src/components/ConsultationStudio.tsx',
 'src/lib/estimatingBridge.ts','src/data/services.ts'
];
const match=log.match(/([A-Za-z0-9_./\\-]+\.tsx?)\((\d+),(\d+)\): error TS(\d+)/);
let file=match?.[1]?.replace(/\\/g,'/')??'UNKNOWN';
let idx=list.findIndex((item)=>item===file||file.endsWith('/'+item));
console.error('FIRST_ERROR_FILE_INDEX',idx,'line',match?.[2]??'', 'type',match?.[4]??'');
console.error(log.slice(-4500));
process.exit(40+(idx<0?25:idx));
