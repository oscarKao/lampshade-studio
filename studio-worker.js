'use strict';
importScripts('vendor/clipper-6.4.2.js','geometry.js?v=10','studio-geometry.js?v=10');
let mesh=null;
self.onmessage=e=>{const m=e.data;try{if(m.type==='load'){const next=SliceStudio.parseSTL(m.buffer);mesh=next;self.postMessage({type:'loaded',id:m.id,mesh});return}if(m.type==='restore'){mesh=m.mesh?SliceStudio.inspectMesh(new Float64Array(m.mesh.vertices)):null;self.postMessage({type:'restored',id:m.id});return}const d=SliceStudio.generate(m.parameters,mesh);delete d.bulbRadius;self.postMessage({type:'result',id:m.id,data:d})}catch(error){self.postMessage({type:'error',id:m.id,message:error.message,operation:m.type})}};
