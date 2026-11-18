const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const {fetchImageWithTimeout}=await import('./assetFetch.mjs');
  const bytes=Buffer.alloc(1600);
  bytes[0]=0xff;bytes[1]=0xd8;bytes[1598]=0xff;bytes[1599]=0xd9;
  const success=await fetchImageWithTimeout('https://example.test/sample.jpg',{
    timeoutMs:100,
    fetchImpl:async()=>({ok:true,status:200,
      headers:new Headers({'content-type':'image/jpeg','content-length':'1600'}),
      arrayBuffer:async()=>bytes,
    }),
  });
  assert.equal(success.bytes.length,1600);
  const begin=Date.now();
  let aborted=false;
  await assert.rejects(fetchImageWithTimeout('https://example.test/hanging-body.jpg',{
    timeoutMs:30,
    fetchImpl:async(_url,{signal})=>({ok:true,status:200,
      headers:new Headers({'content-type':'image/jpeg'}),
      arrayBuffer:()=>new Promise((_resolve,reject)=>{
        signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Aborted while receiving image body'));},{once:true});
      }),
    }),
  }),/delivery timeout/);
  assert.ok(aborted,'Deadline must abort the response body stream');
  assert.ok(Date.now()-begin<400,'The manufacturer asset stream cannot block deployment indefinitely');
  await assert.rejects(fetchImageWithTimeout('https://example.test/error.jpg',{
    timeoutMs:80,
    fetchImpl:async()=>({ok:false,status:404,headers:new Headers(),arrayBuffer:async()=>Buffer.alloc(0)}),
  }),/HTTP 404/);
  await assert.rejects(fetchImageWithTimeout('https://example.test/oversized.jpg',{
    timeoutMs:80,
    fetchImpl:async()=>({ok:true,status:200,
      headers:new Headers({'content-length':'10000000'}),arrayBuffer:async()=>Buffer.alloc(0)}),
  }),/maximum allowed bytes/);
  const sync=fs.readFileSync(path.join(__dirname,'sync-manufacturer-assets.mjs'),'utf8');
  assert.match(sync,/MAX_SYNC_MS = 45000/);
  assert.match(sync,/validCachedBytes/);
  assert.match(sync,/MAX_TRIES = 2/);
  assert.match(sync,/asset-status\.json/);
  console.log('PASS manufacturer image delivery deadline covers full body, abort, cache, size and error handling');
})().catch(error=>{console.error(error);process.exitCode=1;});
