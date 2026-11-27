const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
module.exports = function loadProjectTs(file) {
  let full = path.resolve(__dirname, '..', file);
  if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!/\.tsx?$/.test(full)) full += fs.existsSync(full + '.ts') ? '.ts' : '.tsx';
  if (cache.has(full)) return cache.get(full).exports;
  const entry = { exports: {} }; cache.set(full, entry);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    esModuleInterop: true, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('require', 'module', 'exports', js)(request => request.startsWith('.')
    ? module.exports(path.resolve(path.dirname(full), request)) : require(request), entry, entry.exports);
  return entry.exports;
};
