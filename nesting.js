'use strict';
// Polygon no-fit regions. Original cutting/engraving geometry is never simplified.
(function(root){
const C=root.ClipperLib,G=root.LampGeometry,K=1000;
const area=p=>Math.abs(C.Clipper.Area(p));
function positive(p){if(!C.Clipper.Orientation(p))p.reverse();return p}
function simplify(poly){
 function line(points){if(points.length<3)return points;const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1];let max=.05,index=-1;for(let i=1;i<points.length-1;i++){const q=points[i],u=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(q[0]-a[0]-u*dx,q[1]-a[1]-u*dy);if(d>max){max=d;index=i}}return index<0?[a,b]:[...line(points.slice(0,index+1)).slice(0,-1),...line(points.slice(index))]}
 const mid=Math.floor(poly.length/2);return [...line(poly.slice(0,mid+1)).slice(0,-1),...line([...poly.slice(mid),poly[0]]).slice(0,-1)];
}
function hull(poly){const points=[...poly].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const a=[],b=[];for(const p of points){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p)}for(const p of points.reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p)}return a.slice(0,-1).concat(b.slice(0,-1))}
function pack(parts,p,progress=()=>{}){
 const W=p.sheetW,H=p.sheetH,margin=8,gap=p.spacing+.112,start=Date.now();
 const angles=p.nestRotation==='grain'?[0,Math.PI]:[0,Math.PI/2,Math.PI,Math.PI*1.5];
 const cache=new Map(),shapes=new Map(),sheets=[],oversize=[];
 function variants(part){const key=JSON.stringify(part.outer);if(shapes.has(key))return shapes.get(key);
 const out=angles.map(angle=>{const poly=part.outer.map(pt=>G.rotate(pt,angle)),b=G.bounds(poly);
 const path=positive(simplify(part.holes.length?hull(poly):poly).map(([x,y])=>({X:Math.round((x-b.minX)*K),Y:Math.round((y-b.minY)*K)})));
 const co=new C.ClipperOffset(2,.25*K),expanded=[];co.AddPath(path,C.JoinType.jtMiter,C.EndType.etClosedPolygon);co.Execute(expanded,gap*K);
 return{angle,origin:[b.minX,b.minY],w:b.w,h:b.h,path,convex:part.holes.length>0,expanded:expanded.sort((a,b)=>area(b)-area(a))[0],key:key+'@'+angle};});shapes.set(key,out);return out}
 function forbidden(fixed,moving){const key=fixed.key+'>'+moving.key;if(cache.has(key))return cache.get(key);
 const neg=moving.path.map(v=>({X:-v.X,Y:-v.Y}));let sum;
 if(fixed.convex||moving.convex){
 const convex=fixed.convex?fixed.expanded:neg,other=fixed.convex?neg:fixed.expanded;
 const triangles=fixed.convex&&moving.convex?[other]:(()=>{const ids=root.earcut(other.flatMap(p=>[p.X,p.Y])),t=[];for(let i=0;i<ids.length;i+=3)t.push(ids.slice(i,i+3).map(id=>other[id]));return t})();
 const polys=triangles.map(tri=>positive(hull(tri.flatMap(a=>convex.map(b=>[a.X+b.X,a.Y+b.Y]))).map(([X,Y])=>({X,Y}))));
 const clip=new C.Clipper();sum=[];clip.AddPaths(polys,C.PolyType.ptSubject,true);clip.Execute(C.ClipType.ctUnion,sum,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);
 }else sum=C.Clipper.MinkowskiSum(neg,fixed.expanded,true);
 // Fill internal Minkowski holes: no placing pieces inside other pieces' holes.
 const outer=positive(sum.sort((a,b)=>area(b)-area(a))[0]);cache.set(key,outer);return outer}
 const sorted=[...parts].sort((a,b)=>Math.max(b.bounds.w,b.bounds.h)-Math.max(a.bounds.w,a.bounds.h));
 for(let index=0;index<sorted.length;index++){
 if(Date.now()-start>55000)throw Error('此組零件計算較久，請減少片數後重試');
 const part=sorted[index],vs=variants(part).filter(v=>v.w<=W-margin*2&&v.h<=H-margin*2);
 if(!vs.length){oversize.push(part.id);progress(index+1);continue}
 let placed=false;
 for(let si=0;si<=sheets.length;si++){
 const sheet=sheets[si]||{items:[],maxX:0,maxY:0};let best=null;
 for(const v of vs){
 const lo=margin*K,rx=Math.floor((W-margin-v.w)*K),by=Math.floor((H-margin-v.h)*K);
 let candidates=[{X:lo,Y:lo}];
 if(sheet.items.length){
 const rect=[{X:lo,Y:lo},{X:rx,Y:lo},{X:rx,Y:by},{X:lo,Y:by}];
 const clip=new C.Clipper(),result=[];clip.AddPath(rect,C.PolyType.ptSubject,true);
 for(const item of sheet.items){const path=forbidden(item.variant,v).map(pt=>({X:pt.X+Math.round(item.x*K),Y:pt.Y+Math.round(item.y*K)}));clip.AddPath(path,C.PolyType.ptClip,true)}
 clip.Execute(C.ClipType.ctDifference,result,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);
 candidates=result.flat();
 }
 for(const q of candidates){const x=q.X/K,y=q.Y/K;if(x<margin-.001||y<margin-.001||x+v.w>W-margin+.001||y+v.h>H-margin+.001)continue;
 const mx=Math.max(sheet.maxX,x+v.w),my=Math.max(sheet.maxY,y+v.h),score=my*W+mx;
 if(!best||score<best.score)best={x,y,v,score,mx,my};}
 }
 if(best){if(si===sheets.length)sheets.push(sheet);sheet.items.push({part,x:best.x,y:best.y,angle:best.v.angle,origin:best.v.origin,w:best.v.w,h:best.v.h,variant:best.v});sheet.maxX=best.mx;sheet.maxY=best.my;placed=true;break}
 // Degenerate zero-width feasible region: a new blank sheet always has a candidate.
 }
 if(!placed)oversize.push(part.id);progress(index+1);
 }
 const layout={sheets:sheets.map(s=>({items:s.items.map(({variant,...item})=>item)})),oversize};
 const baseline=G.pack(parts,W,H,p.spacing,p.nestRotation);
 const score=l=>l.sheets.length*W*H+l.sheets.reduce((sum,s)=>sum+Math.max(0,...s.items.map(i=>i.y+i.h))*W,0);
 const chosen=baseline.oversize.length<=oversize.length&&(baseline.sheets.length<layout.sheets.length||(baseline.sheets.length===layout.sheets.length&&score(baseline)<score(layout)))?baseline:layout;
 const material=parts.filter(part=>!chosen.oversize.includes(part.id)).reduce((sum,part)=>sum+area(part.outer.map(([x,y])=>({X:x,Y:y})))-(part.holes||[]).reduce((s,h)=>s+area(h.map(([x,y])=>({X:x,Y:y}))),0),0);
 chosen.utilization=chosen.sheets.length?material/(chosen.sheets.length*W*H)*100:0;chosen.compact=true;chosen.method=chosen===baseline?'rectangular':'contour';return chosen;
}
root.ContourNest={pack};
})(typeof self!=='undefined'?self:globalThis);
