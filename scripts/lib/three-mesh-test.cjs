const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),THREE=require('three'),React=require('react');
const root=path.resolve(__dirname,'../..'),cache=new Map();
function load(file){
 let full=path.resolve(root,file);
 if(!fs.existsSync(full))full=['.ts','.tsx','.json'].map(ext=>full+ext).find(p=>fs.existsSync(p));
 if(!full)throw Error('Missing module '+file);
 if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'));
 if(cache.has(full))return cache.get(full).exports;
 const module={exports:{}};cache.set(full,module);
 const js=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
  jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
 }}).outputText;
 new Function('require','module','exports',js)(name=>name==='react'?
  {...React,useMemo:fn=>fn(),useEffect:()=>{}}:name.startsWith('.')?
   load(path.resolve(path.dirname(full),name)):require(name),module,module.exports);
 return module.exports;
}
const geometryTypes={boxGeometry:THREE.BoxGeometry,planeGeometry:THREE.PlaneGeometry,
 shapeGeometry:THREE.ShapeGeometry,cylinderGeometry:THREE.CylinderGeometry,
 sphereGeometry:THREE.SphereGeometry,circleGeometry:THREE.CircleGeometry};
function resolve(node){
 if(node==null||typeof node==='boolean')return [];
 if(Array.isArray(node))return node.flatMap(resolve);
 if(typeof node.type==='function')return resolve(node.type(node.props)).map(n=>
  ({...n,owners:[node.type.name,...(n.owners??[])]}));
 if(typeof node.type==='symbol')return resolve(node.props.children);
 return [{type:node.type,props:node.props,owners:node.owners??[],children:resolve(node.props?.children)}];
}
function renderedMeshes(element){
 const meshes=[];
 function walk(node,parent,trail){
  const p=node.props??{},local=new THREE.Matrix4();
  const q=p.quaternion?.clone?.()??new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation??[0,0,0])));
  local.compose(new THREE.Vector3(...(p.position??[0,0,0])),q,
   new THREE.Vector3(...(p.scale??[1,1,1])));
  const matrix=parent.clone().multiply(local);
  const label=[...trail,...node.owners,p.name??''].filter(Boolean);
  if(node.type==='mesh'){
   const child=node.children.find(n=>geometryTypes[n.type]);
   const geometry=p.geometry?.clone()??(child?new geometryTypes[child.type](...(child.props.args??[])):null);
   assert.ok(geometry,'Mesh has a real geometry: '+label.join('/'));
   geometry.applyMatrix4(matrix);
   const materialNodes=node.children.filter(n=>/Material$/.test(n.type));
   const material=materialNodes[0]?.props??{};
   const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
   mesh.name=p.name??'';mesh.userData={...(p.userData??{}),path:label.join('/'),material};
   mesh.updateMatrixWorld();geometry.computeBoundingBox();meshes.push(mesh);
  }
  for(const child of node.children)if(!/Geometry$|Material$/.test(child.type??''))walk(child,matrix,label);
 }
 for(const node of resolve(element))walk(node,new THREE.Matrix4(),[]);
 return meshes;
}
module.exports={load,renderedMeshes};
