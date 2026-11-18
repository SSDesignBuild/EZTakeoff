/**
 * Fetch authoritative TimberTech product photographs into Netlify's first-party
 * static assets. Bounded network budget prevents a manufacturer CDN outage from
 * blocking or hanging a deploy. No guessed colors or substitute stock images.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchImageWithTimeout } from './assetFetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(await readFile(path.join(root, 'src/data/timbertechVisualAssets.json'), 'utf8'));
const required = new Set(['vintage-coastline','vintage-weathered-teak','vintage-mahogany','landmark-boardwalk','legacy-ashwood']);
const MAX_SYNC_MS = 45000;
const MAX_TRIES = 2;
const PER_REQUEST_MS = 5500;
const MAX_PARALLEL = 9;
const start = Date.now();
const deadline = start + MAX_SYNC_MS;
const cacheRoot = path.join(root, 'node_modules', '.cache', 'eztakeoff-manufacturer-assets');
const results = [];
let next = 0, fetched = 0, cached = 0, missing = 0;

function validImage(bytes, ext) {
  if (bytes.length < 1500 || bytes.length > 2*1024*1024) return false;
  if (ext === '.jpg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (ext === '.webp') return bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  return false;
}
async function validCachedBytes(file, ext) {
  try {
    const bytes = await readFile(file);
    return validImage(bytes, ext) ? bytes : null;
  } catch { return null; }
}
async function getOne(item) {
  const relative = String(item.swatch || '').replace(/^\//, '');
  const source = new URL(item.sourceUrl);
  if (source.hostname !== 'www.timbertech.com' ||
      !relative.startsWith('manufacturer/timbertech/') ||
      relative.includes('..')) {
    throw new Error('Unsafe manufacturer image source or local path: ' + String(item.id));
  }
  const ext = path.extname(relative).toLowerCase();
  if (!['.webp','.jpg'].includes(ext)) throw new Error('Unsupported manufacturer image extension.');
  const target = path.join(root,'public',relative);
  const backup = path.join(cacheRoot,path.basename(relative));
  await mkdir(path.dirname(target), {recursive:true});
  const existing = await validCachedBytes(target, ext) || await validCachedBytes(backup,ext);
  if (existing) {
    await writeFile(target, existing);
    results.push({id:item.id,available:true,source:'cache'});
    cached++;
    return;
  }
  let last = 'Not attempted';
  for (let attempt=0;attempt<MAX_TRIES;attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { last='Global manufacturer image delivery deadline exceeded'; break; }
    try {
      const requestMs = Math.max(1, Math.min(remaining,PER_REQUEST_MS));
      const {bytes,contentType} = await fetchImageWithTimeout(item.sourceUrl,{
        timeoutMs:requestMs,
        headers:{
          'Accept':ext==='.jpg'?'image/jpeg':'image/webp',
          'User-Agent':'S&S-DesignBuild-EZTakeoff/1.0 (dealer design catalog)'
        }
      });
      const expectedType=ext==='.jpg'?'image/jpeg':'image/webp';
      if (!contentType.includes(expectedType) || !validImage(bytes,ext)) {
        throw new Error('Image type or signature does not match ' + ext);
      }
      await writeFile(target,bytes);
      try { await mkdir(cacheRoot,{recursive:true}); await writeFile(backup,bytes); }
      catch { /* Optional cache is never a release blocker. */ }
      fetched++;
      results.push({id:item.id,available:true,source:'manufacturer'});
      return;
    } catch (error) {
      last=error instanceof Error?error.message:String(error);
      // A permanent 404 is not helped by repeated calls.
      if (/HTTP 4\d\d/.test(last)) break;
    }
  }
  missing++;
  results.push({id:item.id,available:false,reason:last});
  console.warn('OFFICIAL SWATCH UNAVAILABLE ' + item.label + ': ' + last);
  if (required.has(item.id)) process.exitCode=1;
}
async function worker() {
  while (true) {
    const index=next++;
    if (index>=entries.length) return;
    await getOne(entries[index]);
  }
}
await Promise.all(Array.from({length:MAX_PARALLEL},worker));
const statusPath=path.join(root,'public','manufacturer','timbertech','asset-status.json');
await mkdir(path.dirname(statusPath),{recursive:true});
await writeFile(statusPath,JSON.stringify({
  generatedAt:new Date().toISOString(),
  total:entries.length,downloaded:fetched,cacheHits:cached,unavailable:missing,
  elapsedMs:Date.now()-start,assets:results,
},null,2));
console.log('TimberTech assets: ' + (fetched+cached) + '/' + entries.length +
  ' available ('+fetched+' fetched, '+cached+' cached, '+missing+' unavailable), elapsed ' +
  (Date.now()-start)+'ms; maximum network budget '+MAX_SYNC_MS+'ms.');
if (process.exitCode) {
  console.error('A required official swatch was not delivered within the fixed deadline. Existing production deployment remains safe.');
}
