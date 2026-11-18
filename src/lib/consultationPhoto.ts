/** House photographs remain local in IndexedDB until a secure project-media backend is configured. */
const DB_NAME='sns-consultation-media';
const STORE='home-photos';
const MAX_INPUT_BYTES=18*1024*1024;
const SUPPORTED=new Set(['image/jpeg','image/png','image/webp']);
const openDb=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error??new Error('Cannot open photo storage.'));
});
const transact=async <T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>=>{
  const db=await openDb();
  return new Promise<T>((resolve,reject)=>{
    let result:T;
    const tx=db.transaction(STORE,mode);
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=()=>{db.close();reject(tx.error??new Error('Photo storage failed.'));};
    tx.onabort=()=>{db.close();reject(tx.error??new Error('Photo storage aborted.'));};
    action(tx.objectStore(STORE),(value)=>{result=value;});
  });
};
export const readHousePhoto=(projectId:string):Promise<Blob|null>=>transact('readonly',(store,done)=>{
  const req=store.get(projectId);
  req.onsuccess=()=>done(req.result instanceof Blob?req.result:null);
  req.onerror=()=>{throw req.error;};
});
export const deleteHousePhoto=(projectId:string):Promise<void>=>transact('readwrite',(store,done)=>{
  store.delete(projectId);done(undefined);
});
export const saveHousePhoto=async (projectId:string,file:File):Promise<{bytes:number;type:string}>=>{
  if(!SUPPORTED.has(file.type))throw new Error('Use a JPG, PNG or WebP photograph.');
  if(file.size>MAX_INPUT_BYTES)throw new Error('Photo exceeds 18 MB. Choose a smaller file.');
  let blob:Blob=file;
  // Resize oversized phone photos before saving. Do not store base64 in
  // localStorage, because that would silently destroy deck project state.
  if(typeof createImageBitmap==='function'){
    const bitmap=await createImageBitmap(file);
    try{
      const maxSide=2400;
      const ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
      if(ratio<1 || file.size>3*1024*1024){
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
        canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
        const ctx=canvas.getContext('2d');
        if(!ctx)throw new Error('Unable to resize this photograph.');
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        blob=await new Promise<Blob>((resolve,reject)=>
          canvas.toBlob((result)=>result?resolve(result):reject(new Error('Photo conversion failed.')),'image/jpeg',0.88));
      }
    }finally{bitmap.close();}
  }
  await transact<void>('readwrite',(store,done)=>{store.put(blob,projectId);done(undefined);});
  return {bytes:blob.size,type:blob.type};
};
