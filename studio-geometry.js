'use strict';
(function(root){
const G=root.LampGeometry,C=root.ClipperLib,K=1000,TAU=Math.PI*2;
const extra={source:'parametric',stlWidth:0,template:'lantern',layers:24,supports:3,fixedRings:2,assembly:'slots',axis:'z',taper:0,wave:0,waveCount:2,gradient:1,facets:0,aspect:1,socketX:0,socketY:0};
const limits={stlWidth:[0,1200,1],layers:[3,100,1],supports:[2,8,1],fixedRings:[2,6,1],taper:[-40,40,1],wave:[0,25,1],waveCount:[1,5,1],gradient:[.6,1.8,.05],facets:[0,12,1],aspect:[.5,1.5,.05],socketX:[-100,100,1],socketY:[-100,100,1]};
const templates={lantern:{name:'燈籠肋片',mode:'radial',r:[75,113,130,113,75]},bell:{name:'鐘形吊燈',mode:'radial',r:[135,126,102,76,58]},waist:{name:'收腰肋片',mode:'radial',r:[100,77,66,92,112]},cylinder:{name:'圓筒燈罩',mode:'radial',r:[100,100,100,100,100]},polygon:{name:'多角層疊',mode:'stack',facets:6,r:[100,115,125,115,100]},wave:{name:'波浪層疊',mode:'stack',wave:12,r:[108,108,108,108,108]}};
function upgrade(p){const n={...extra,...G.migrate(p)};if(p.layers===undefined)n.layers=Math.max(3,Math.min(100,Math.round((p.height+p.gap)/(p.thickness+p.gap))));if(p.assembly===undefined&&p.mode==='stack'&&p.gap===0)n.assembly='glue';return n}
function validate(p){G.valid(p);for(const[k,[a,b]]of Object.entries(limits))if(!Number.isFinite(p[k])||p[k]<a||p[k]>b)throw Error('參數超出範圍：'+k);for(const k of ['layers','supports','fixedRings','facets','waveCount'])if(!Number.isInteger(p[k]))throw Error('數量必須為整數');if(p.facets!==0&&p.facets<3)throw Error('多角形至少需 3 邊');if(!['parametric','stl'].includes(p.source)||!['slots','glue'].includes(p.assembly)||!['x','y','z'].includes(p.axis))throw Error('設計模式不正確');return p}
const ip=poly=>poly.map(([x,y])=>({X:Math.round(x*K),Y:Math.round(y*K)})),fp=poly=>poly.map(p=>[p.X/K,p.Y/K]);
function circle(r,cx=0,cy=0,n=120){return Array.from({length:n},(_,i)=>[cx+r*Math.cos(TAU*i/n),cy+r*Math.sin(TAU*i/n)])}
function area(poly){return Math.abs(C.Clipper.Area(ip(poly)))/K**2}
function inside(pt,poly){return C.Clipper.PointInPolygon({X:Math.round(pt[0]*K),Y:Math.round(pt[1]*K)},ip(poly))!==0}
function distance(pt,poly){let d=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(pt[0]-a[0]-u*dx,pt[1]-a[1]-u*dy))}return d}
function boolean(outer,clips,type=C.ClipType.ctDifference){const c=new C.Clipper(),tree=new C.PolyTree();c.AddPath(ip(outer),C.PolyType.ptSubject,true);for(const poly of clips){const path=ip(poly);if(!C.Clipper.Orientation(path))path.reverse();c.AddPath(path,C.PolyType.ptClip,true);}c.Execute(type,tree,C.PolyFillType.pftEvenOdd,C.PolyFillType.pftNonZero);return tree.Childs().map(n=>({outer:fp(n.Contour()),holes:n.Childs().map(h=>fp(h.Contour()))}))}
function cutPart(id,name,outer,clips,label){const result=boolean(outer,clips);if(result.length!==1)throw Error(id+' 的開孔或插槽使板件斷開，請減小燈座偏移／孔徑、板厚或支撐數量');const part={id,name,...result[0],label,bounds:G.bounds(result[0].outer)};if(area(part.outer)<1)throw Error(id+' 面積不足');return part}
function rectangle(x0,y0,x1,y1,a=0){return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(v=>G.rotate(v,a))}
function parseSTL(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>25*1024*1024)throw Error('請選擇 25 MB 以下的 STL');
 const dv=new DataView(buffer),n=buffer.byteLength>=84?dv.getUint32(80,true):0;let values=[];
 if(n>0&&84+n*50<=buffer.byteLength){if(n>100000)throw Error('模型超過 100,000 個三角面，請先在建模軟體減面');values=new Float64Array(n*9);for(let i=0;i<n;i++)for(let j=0;j<9;j++)values[i*9+j]=dv.getFloat32(84+i*50+12+j*4,true)}
 else{const text=new TextDecoder().decode(buffer);if(!/^\s*solid\b/i.test(text)||!/endsolid/i.test(text))throw Error('不是有效的 ASCII 或 Binary STL');const re=/\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi;for(const m of text.matchAll(re)){values.push(Number(m[1]),Number(m[2]),Number(m[3]));if(values.length>900000)throw Error('模型超過 100,000 個三角面，請先減面')}values=new Float64Array(values)}
 return inspectMesh(values);
}
function inspectMesh(values){if(values.length<36||values.length%9||values.length>900000)throw Error('STL 三角面資料不完整');let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v)||Math.abs(v)>1e9)throw Error('STL 含無效座標');min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v)}const size=max.map((v,i)=>v-min[i]);if(size.some(v=>v<=1e-8))throw Error('模型必須具有立體體積');const tolerance=Math.max(...size)*1e-7,edges=new Map();let degenerate=0;
 for(let i=0;i<values.length;i+=9){const keys=[];for(let j=0;j<3;j++)keys.push([0,1,2].map(k=>Math.round((values[i+j*3+k]-min[k])/tolerance)).join(','));if(new Set(keys).size<3){degenerate++;continue}for(let j=0;j<3;j++){const a=keys[j],b=keys[(j+1)%3],key=a<b?a+'|'+b:b+'|'+a;edges.set(key,(edges.get(key)||0)+1)}}
 let boundary=0,nonmanifold=0;for(const count of edges.values()){if(count===1)boundary++;else if(count!==2)nonmanifold++}if(boundary||nonmanifold||degenerate)throw Error('STL 不是封閉、共邊的實體（開邊 '+boundary+'、異常邊 '+nonmanifold+'、退化面 '+degenerate+'）。請先修補或重新網格化後匯入');
 return{vertices:values,min,max,size,triangles:values.length/9};
}
function orient(mesh,p){const axes=p.axis==='x'?[1,2,0]:p.axis==='y'?[2,0,1]:[0,1,2],scale=p.height/mesh.size[axes[2]],v=new Float64Array(mesh.vertices.length);for(let i=0;i<v.length;i+=3){v[i]=(mesh.vertices[i+axes[0]]-(mesh.min[axes[0]]+mesh.max[axes[0]])/2)*(p.stlWidth? p.stlWidth/mesh.size[axes[0]]:scale);v[i+1]=(mesh.vertices[i+axes[1]]-(mesh.min[axes[1]]+mesh.max[axes[1]])/2)*(p.stlWidth? p.stlWidth/mesh.size[axes[0]]:scale);v[i+2]=(mesh.vertices[i+axes[2]]-mesh.min[axes[2]])*scale}return v}
function section(vertices,z,center=[0,0]){
 const nodes=new Map(),edges=new Set(),key=v=>v.map(x=>Math.round(x*10000)).join(',');
 for(let i=0;i<vertices.length;i+=9){const pts=[];for(let j=0;j<3;j++){const a=i+j*3,b=i+(j+1)%3*3,da=vertices[a+2]-z,db=vertices[b+2]-z;if((da>=0)===(db>=0))continue;const t=da/(da-db);pts.push([vertices[a]+t*(vertices[b]-vertices[a]),vertices[a+1]+t*(vertices[b+1]-vertices[a+1])])}if(pts.length!==2)continue;const a=key(pts[0]),b=key(pts[1]);if(a===b)continue;const e=a<b?a+'|'+b:b+'|'+a;if(edges.has(e))continue;edges.add(e);for(const[k,v,other]of [[a,pts[0],b],[b,pts[1],a]]){if(!nodes.has(k))nodes.set(k,{v,adj:[]});nodes.get(k).adj.push(other)}}
 if(!nodes.size)throw Error('此高度沒有封閉截面');for(const n of nodes.values())if(n.adj.length!==2)throw Error('截面有破口或重疊面');const visited=new Set(),loops=[];
 for(const[start]of nodes){if(visited.has(start))continue;let cur=start,prev=null,loop=[];do{if(visited.has(cur))throw Error('截面輪廓交錯');visited.add(cur);const n=nodes.get(cur);loop.push(n.v);const next=n.adj.find(k=>k!==prev);prev=cur;cur=next}while(cur!==start);const cleaned=fp(C.Clipper.CleanPolygon(ip(loop),5));if(cleaned.length>=3&&area(cleaned)>.05)loops.push(cleaned)}
 if(loops.length!==1)throw Error('截面包含多個分離區塊或原有內孔；請使用單一封閉的外形實體');const poly=loops[0];if(center&&!inside(center,poly))throw Error('截面未包圍模型中心，無法配置共同燈座與支撐');return poly;
}
function profile(p,z){const r=G.radius(p,z/p.height);const n=p.facets||120;return Array.from({length:n},(_,i)=>[r*Math.cos(TAU*i/n)*p.aspect,r*Math.sin(TAU*i/n)])}
function bulb(data,p){return z=>{const u=(data.bulbTop-z)/p.bulbL;if(u<0||u>1)return 0;if(u<.22)return Math.min(p.bulbD*.18,p.hole*.29);const v=(u-.22)/.78;return p.bulbD/2*Math.sqrt(Math.max(0,1-((v-.44)/.56)**2))}}

// Each rib is the actual vertical plane section, clipped to a shared assembly cavity.
function radialSTL(p,mesh){
 const v=orient(mesh,p),H=p.height,t=p.thickness,slot=t+p.fit,profiles=[],warnings=[];
 if(p.lowerRing<slot/2+2||p.upperRing>H-slot/2-2||p.upperRing-p.lowerRing<(p.fixedRings-1)*(slot+4))throw Error('固定環太靠近端部或彼此重疊，請調整上下固定環高度／數量');
 let minR=Infinity,maxR=0;
 for(let j=0;j<p.count;j++){
  const a=TAU*j/p.count,c=Math.cos(a),s=Math.sin(a),plane=new Float64Array(v.length);
  for(let i=0;i<v.length;i+=3){plane[i]=v[i]*c+v[i+1]*s;plane[i+1]=v[i+2];plane[i+2]=-v[i]*s+v[i+1]*c}
  let poly;try{poly=section(plane,0,null)}catch(e){throw Error('肋片 '+(j+1)+'：'+e.message)}
  const heights=[...new Set(poly.map(pt=>pt[1]))].sort((a,b)=>a-b);
  if(heights[0]>.01||heights.at(-1)<H-.01)throw Error('放射肋片需沿整個高度包圍中心軸；請調整模型直立方向或改用水平堆疊');
  // Check both ends of every linear interval: catches narrow necks and disconnected rays.
  for(let k=1;k<heights.length;k++)for(const u of [.00001,.99999]){
   const z=heights[k-1]+(heights[k]-heights[k-1])*u,xs=[];
   for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a[1]>z)===(b[1]>z))continue;xs.push(a[0]+(z-a[1])/(b[1]-a[1])*(b[0]-a[0]))}
   xs.sort((a,b)=>a-b);if(xs.length!==2||xs[0]>=0||xs[1]<=0)throw Error('放射截面有分離外形或未包圍中心軸，請改用水平堆疊或修整 STL');
   minR=Math.min(minR,xs[1]);maxR=Math.max(maxR,xs[1]);
  }
  profiles.push(poly);
 }

 const required=p.bulbD/2+p.clearance,ri=Math.max(required,minR-p.width);
 if(minR-required<8)throw Error('STL 最窄處無法同時保留燈泡空間與 8 mm 板片寬度。請增加「模型寬度」或縮小燈泡尺寸');
 if(minR-required<p.width)warnings.push({text:'局部板片寬度已縮減，以保留燈泡直徑與目標淨空。可增加模型寬度以保留完整板片寬度。'});
 if(2*ri*Math.sin(Math.PI/p.count)<Math.max(t,slot)+2)throw Error('肋片或固定環插槽過密，請減少肋片數量或板厚');
 if(p.socketX||p.socketY)throw Error('放射肋片的燈座須置於中心軸，請將燈座 X／Y 偏移歸零');
 const ys=Array.from({length:p.fixedRings},(_,i)=>p.lowerRing+(p.upperRing-p.lowerRing)*i/(p.fixedRings-1)),parts=[],instances=[],ringSpecs=[];
 function radiusAt(poly,z){let r=-Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a[1]>z)===(b[1]>z))continue;r=Math.max(r,a[0]+(z-a[1])/(b[1]-a[1])*(b[0]-a[0]))}return r}
 // Each rib follows its own silhouette on both edges, instead of filling to the narrowest shared cylinder.
 const joints=ys.map(y=>profiles.map(poly=>{
  const zs=[y-slot/2,y+slot/2,...poly.filter(pt=>pt[1]>y-slot/2&&pt[1]<y+slot/2).map(pt=>pt[1])];
  const rs=zs.map(z=>radiusAt(poly,z)),inner=Math.max(required,Math.max(...rs)-p.width),outer=Math.min(...rs);
  if(outer-inner<8)throw Error('固定環附近的輪廓變化過急或板片太窄，請移動固定環高度、增加模型寬度或減少板厚');
  return{mid:(inner+outer)/2,inner,outer};
 }));
 for(let j=0;j<p.count;j++){
  const clips=[profiles[j].map(([r,z])=>[r-p.width,z]),rectangle(-maxR-10,-1,required,H+1),...ys.map((z,i)=>rectangle(0,z-slot/2,joints[i][j].mid,z+slot/2))];
  const r=radiusAt(profiles[j],H*.5),label=[(r+Math.max(required,r-p.width))/2,H*.5];
  const part=cutPart('R'+String(j+1).padStart(2,'0'),'STL 放射肋片',profiles[j],clips,label);
  parts.push(part);instances.push({part,kind:'vertical',angle:TAU*j/p.count});
 }
 for(let j=0;j<ys.length;j++){
  const hole=j===ys.length-1?p.hole/2:Math.max(required,Math.min(...joints[j].map(v=>v.inner))-8);
  const outer=section(v,ys[j]),clips=[circle(hole)];
  if(distance([0,0],outer)-hole<4)throw Error('燈座孔徑太大，距固定環外輪廓不足 4 mm');
  for(let i=0;i<p.count;i++){
   const mid=joints[j][i].mid;
   if(mid-hole<4)throw Error('燈座孔徑太大，距固定環插槽不足 4 mm');
   clips.push(rectangle(mid,-slot/2,maxR+10,slot/2,TAU*i/p.count));
  }
  const part=cutPart('F'+String(j+1).padStart(2,'0'),j===ys.length-1?'燈座固定環':'下／中固定環',outer,clips,G.rotate([hole+2,0],Math.PI/p.count));
  part.ring={R:Math.max(...outer.map(pt=>Math.hypot(...pt))),hole,n:p.count,mid:joints[j][0].mid,mids:joints[j].map(v=>v.mid),slot,y:ys[j]};parts.push(part);instances.push({part,kind:'horizontal',z:ys[j]});ringSpecs.push(part.ring);
 }
 const d={parts,instances,ringSpecs,warnings,slot,actualH:H,layers:0,actualGap:0,maxDiameter:maxR*2,innerDiameter:ri*2,layout:G.pack(parts,p.sheetW,p.sheetH,p.spacing),mountHeight:p.upperRing,mountId:parts.at(-1).id,bulbTop:p.upperRing-t/2-p.offset,socketX:0,socketY:0};
 d.bulbBottom=d.bulbTop-p.bulbL;d.bulbRadius=bulb(d,p);d.minClear=ri-p.bulbD/2;
 for(const r of ringSpecs)for(const z of [r.y-t/2,r.y,r.y+t/2])if(z>d.bulbBottom&&z<d.bulbTop-1e-5)d.minClear=Math.min(d.minClear,r.hole-d.bulbRadius(z));
 if(d.minClear<0)warnings.push({text:'燈泡與肋片／固定環碰撞，請縮小燈泡或調整尺寸與位置。',error:true});else if(d.minClear<p.clearance)warnings.push({text:'燈泡幾何淨空低於目標，請調整尺寸。'});
 if(d.bulbBottom<0)warnings.push({text:'燈泡超出燈罩底部，請確認位置'});
 if(d.layout.oversize.length)warnings.push({text:'部分板件超出板材尺寸，請放大板材。',error:true});
 warnings.push({text:'板片內外緣依 STL 輪廓生成，寬度沿半徑方向量測；內部至少保留燈泡直徑加兩側目標淨空。固定環依所在高度取樣。'});
 d.assemblyText='依 R 編號順序繞中心軸排列，配合 F 系列固定環由外向內插接；'+d.mountId+' 為燈座固定環。不同方向的肋片不可任意互換。';return d;
}

function generate(p,mesh){validate(p);if(p.source==='parametric'&&p.mode==='radial'){const d=G.generate(p);for(const part of d.parts){const simple=C.Clipper.SimplifyPolygon(ip(part.outer),C.PolyFillType.pftEvenOdd);if(simple.length!==1||part.holes.some(h=>h.some(pt=>!inside(pt,part.outer)))){d.warnings.push({text:'板件輪廓或插槽交錯，請減少曲線變化、板厚或固定環數量。',error:true});break}}d.assemblyText='先對齊 F 系列固定環，再由外側依序插入 R 系列肋片；最後一片 F 為燈座固定環。';return d}
 if(p.source==='stl'&&!mesh)throw Error('請先匯入 STL 模型');
 if(p.source==='stl'&&p.mode==='radial')return radialSTL(p,mesh);
 const t=p.thickness,slot=t+p.fit,glue=p.assembly==='glue',count=glue?Math.max(3,Math.round(p.height/t)):p.layers,H=glue?count*t:p.height,warnings=[],warn=(text,error=false)=>{if(!warnings.some(w=>w.text===text))warnings.push({text,error})};
 if(count>200)throw Error('緊密堆疊超過 200 片，請增加板厚或降低高度');if(!glue&&(count-1)*Math.max(t,slot)+t>H)throw Error('切片數量與板厚超出總高度，請減少切片或降低板厚');
 const positions=Array.from({length:count},(_,i)=>t/2+(H-t)*(glue?i/(count-1):Math.pow(i/(count-1),p.gradient)));let mount=0;positions.forEach((z,i)=>{if(Math.abs(z-p.upperRing)<Math.abs(positions[mount]-p.upperRing))mount=i});
 if(!glue){if(p.upperRing<t/2||p.upperRing>H-t/2)throw Error('燈座高度需保留半個板厚，請調整燈座固定環高度');positions[mount]=p.upperRing;positions.sort((a,b)=>a-b);mount=positions.indexOf(p.upperRing)}
 if(glue&&Math.abs(H-p.height)>.01)warn('緊密堆疊按板厚取整，實際高度 '+G.round(H)+' mm');if(glue&&Math.abs(positions[mount]-p.upperRing)>.01)warn('燈座對齊最近一層：'+G.round(positions[mount])+' mm');
 let minGap=Infinity;for(let i=1;i<count;i++)minGap=Math.min(minGap,positions[i]-positions[i-1]-t);if(!glue&&minGap<Math.max(2,p.fit+1))throw Error('局部層距不足，支撐槽會重疊或齒根太薄。請減少片數、降低漸變，或調整燈座高度');
 let vertices=p.source==='stl'?orient(mesh,{...p,height:H}):null;const outlines=[];
 for(let i=0;i<count;i++){try{if(vertices){let poly;try{poly=section(vertices,positions[i])}catch(e){poly=section(vertices,Math.min(H-t/4,positions[i]+.00013))}outlines.push(poly)}else outlines.push(profile({...p,height:H},positions[i]))}catch(e){throw Error('第 '+(i+1)+' 層（'+G.round(positions[i])+' mm）：'+e.message)}}
 const center=[p.socketX,p.socketY],centerR=Math.min(...outlines.map(poly=>distance([0,0],poly))),sr=centerR-8,railHalf=6,maxR=Math.max(...outlines.flatMap(poly=>poly.map(v=>Math.hypot(...v))));
 let cavity=Math.min(...outlines.map(poly=>distance(center,poly)))-p.width;
 if(outlines.some(poly=>!inside(center,poly)))throw Error('燈座位置超出切片輪廓，請減少水平偏移');
 if(!glue)cavity=Math.min(cavity,...Array.from({length:p.supports},(_,i)=>Math.hypot(sr*Math.cos(TAU*i/p.supports)-center[0],sr*Math.sin(TAU*i/p.supports)-center[1])-10));
 if(p.autoClear||p.source==='stl')cavity=Math.max(cavity,p.bulbD/2+p.clearance);if(cavity<10||sr<16)throw Error('最小截面太窄，無法容納內孔與支撐。請增加模型寬度或選用兩端有開口寬度的外形');
 const parts=[],instances=[],ringSpecs=[];
 for(let i=0;i<count;i++){const hole=i===mount?p.hole/2:cavity,z=positions[i],outer=outlines[i],id='S'+String(i+1).padStart(3,'0');if(distance(center,outer)-hole<4)throw Error(id+' 燈座或內孔距外輪廓不足 4 mm');const clips=[circle(hole,...center)];if(!glue){for(let j=0;j<p.supports;j++){const a=TAU*j/p.supports;if(Math.hypot(sr*Math.cos(a)-center[0],sr*Math.sin(a)-center[1])-hole<4)throw Error(id+' 的孔接近支撐接合，請縮小燈泡／孔徑或燈座偏移');clips.push(rectangle(sr,-slot/2,maxR+30,slot/2,a))}if(TAU*sr/p.supports<slot+4)throw Error('支撐插槽過密，請減少支撐數量')}
 const a=Math.PI/p.supports,labelR=hole+2,label=[center[0]+labelR*Math.cos(a),center[1]+labelR*Math.sin(a)],part=cutPart(id,i===mount?'燈座安裝片':'水平切片',outer,clips,label);part.ring={R:maxR,hole,n:glue?0:p.supports,mid:sr,slot,y:z};parts.push(part);instances.push({part,kind:'horizontal',z});ringSpecs.push(part.ring)}
 if(!glue){const lo=positions[0]-t/2,hi=positions.at(-1)+t/2;for(let j=0;j<p.supports;j++){const outer=rectangle(sr-railHalf,lo,sr+railHalf,hi),clips=positions.map(z=>rectangle(sr-railHalf-1,z-slot/2,sr,z+slot/2));const part=cutPart('P'+String(j+1).padStart(2,'0'),'垂直定位支撐',outer,clips,[sr+1,H*.45]);parts.push(part);instances.push({part,kind:'vertical',angle:TAU*j/p.supports})}}
 const data={parts,instances,warnings,actualH:H,layers:count,actualGap:(H-count*t)/(count-1),minGap,layout:G.pack(parts,p.sheetW,p.sheetH,p.spacing),ringSpecs,slot,maxDiameter:maxR*2,bulbTop:positions[mount]-t/2-p.offset,mountHeight:positions[mount],mountId:parts[mount].id,socketX:p.socketX,socketY:p.socketY};data.bulbBottom=data.bulbTop-p.bulbL;data.bulbRadius=bulb(data,p);let minClear=Infinity;
 for(const r of ringSpecs)for(const z of [r.y-t/2,r.y,r.y+t/2])if(z>data.bulbBottom&&z<data.bulbTop-1e-5)minClear=Math.min(minClear,r.hole-data.bulbRadius(z));
 if(!glue)for(let j=0;j<p.supports;j++){const a=TAU*j/p.supports,pt=G.rotate(center,-a),dx=Math.max(sr-railHalf-pt[0],0,pt[0]-sr-railHalf),dy=Math.max(Math.abs(pt[1])-t/2,0);minClear=Math.min(minClear,Math.hypot(dx,dy)-p.bulbD/2)}
 data.minClear=minClear;if(minClear<0)warn('燈泡與切片／支撐碰撞，請縮小燈泡或調整尺寸與位置。',true);else if(minClear<p.clearance)warn('燈泡最小幾何淨空約 '+G.round(minClear)+' mm，低於目標 '+p.clearance+' mm');if(data.bulbBottom<0)warn('燈泡超出燈罩底部，請確認位置');if(data.layout.oversize.length)warn('有 '+data.layout.oversize.length+' 件零件超出板材，請放大板材尺寸。',true);
 if(p.source==='stl')warn('依各層中心平面取樣 STL 外形；切片之間以空隙表現形體。');if(glue)warn('緊密堆疊採逐層黏合，不產生插槽與支撐件。');
 data.assemblyText=glue?'依 S 編號由下往上對齊並黏合；'+data.mountId+' 為燈座安裝片，實際高度 '+G.round(data.mountHeight)+' mm。':'依 S 編號由下往上排列，將 '+p.supports+' 支 P 系列定位支撐由外側推入對應槽口；'+data.mountId+' 為燈座安裝片，高度 '+G.round(data.mountHeight)+' mm。';return data;
}
root.SliceStudio={extra,limits,templates,upgrade,validate,parseSTL,inspectMesh,orient,section,generate,bulb,profile,area,inside};
if(typeof module!=='undefined')module.exports=root.SliceStudio;
})(typeof globalThis!=='undefined'?globalThis:this);
