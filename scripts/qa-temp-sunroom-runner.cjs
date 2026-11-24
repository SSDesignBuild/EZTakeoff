/* TEMPORARY Netlify diagnostic. Strict tests/build must be restored for release.
 * Output contains only non-sensitive suite name, exit code and assertion summary.
 * Do not publish source, customer files, tokens or environment variables. */
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const tests=pkg.scripts.test.split(' && ').map(command=>
  (command.match(/^node (scripts\/test-[\w-]+\.cjs)$/)||[])[1]).filter(Boolean);
const results=tests.slice(12,14).map(file=>{
  const start=Date.now();
  const child=spawnSync(process.execPath,[file],{
    cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,
    env:{...process.env,CI:'true'},
  });
  const status=child.status===0?'PASS':'FAIL';
  // Include only the last thrown assertion lines, scrub literal paths.
  const std=(child.stderr||'').replaceAll(root,'<repo>')
    .split('\n').filter(line=>/AssertionError|Error:|Expected|actual:|expected:|ERR_|TypeError|SyntaxError|at Object\.\<anonymous\>/.test(line)).slice(0,9);
  return {file,status,exit:child.status,durationMs:Date.now()-start,
    summary:status==='PASS'?'':std.join(' / ').slice(0,1200),
    signal:child.signal||null};
});
const out={source:'temporary strict suite isolation only; not a release',tested:tests.length,
 passed:results.filter(r=>r.status==='PASS').length,
 failed:results.filter(r=>r.status==='FAIL').length,results};
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','__elite_qa_results.json'),JSON.stringify(out,null,2));
fs.writeFileSync(path.join(root,'dist','index.html'),'<!doctype html><title>Temporary preview QA</title><p>Feature not yet released. Build validation in progress.</p>');
process.stdout.write('Temporary diagnostic finished; release still requires full strict test and TypeScript/Vite build.\n');
const firstFail=results.findIndex(result=>result.status==='FAIL');
if(firstFail>=0)process.exit(100+firstFail); // Dev preview error_code decodes first suite index.

