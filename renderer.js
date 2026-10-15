'use strict';
(function(root){
// A real depth buffer resolves intersecting surfaces per pixel, independently of draw order.
const vertexSource=`
attribute vec3 a_position;
attribute vec3 a_color;
uniform vec4 u_view;
uniform vec4 u_camera;
uniform float u_perspective;
uniform float u_bias;
varying vec3 v_color;
void main(){
 float cy=cos(u_camera.x),sy=sin(u_camera.x),cp=cos(u_camera.y),sp=sin(u_camera.y);
 float x=a_position.x*cy-a_position.y*sy;
 float d=a_position.x*sy+a_position.y*cy;
 float z=a_position.z-u_camera.z*.5;
 float depth=d*cp+z*sp,vertical=z*cp-d*sp;
 float size=u_camera.w;
 float w=1.,clipZ=-depth/(size*3.),factor=1.;
 if(u_perspective>.5){
  float distance=size*4.,nearPlane=size,farPlane=size*7.;
  w=distance-depth;factor=distance;
  clipZ=(farPlane+nearPlane)/(farPlane-nearPlane)*w-2.*farPlane*nearPlane/(farPlane-nearPlane);
 }
 gl_Position=vec4(2.*x*u_view.z/u_view.x*factor,2.*vertical*u_view.z/u_view.y*factor-.06*w,clipZ-u_bias*w,w);
 v_color=a_color;
}`;
const fragmentSource=`precision mediump float;varying vec3 v_color;void main(){gl_FragColor=vec4(v_color,1.);}`;
function project(v,c){const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch),x=v[0]*cy-v[1]*sy,d=v[0]*sy+v[1]*cy,z=v[2]-c.modelHeight*.5,depth=d*cp+z*sp,vertical=z*cp-d*sp,size=c.size;let w=1,clipZ=-depth/(size*3),factor=1;if(c.perspective){w=size*4-depth;factor=size*4;clipZ=8/6*w-14*size/6}return[c.width*.5+x*c.scale*factor/w,c.height*.53-vertical*c.scale*factor/w,clipZ/w]}
class DepthViewport{
 constructor(canvas){this.canvas=canvas;this.faces=[];this.lost=false;this.gl=null;try{this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:false})}catch{}if(this.gl){this.initGL();canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true});canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.initGL();this.upload(this.faces);if(this.lastCamera)this.render(this.lastCamera)})}else this.ctx=canvas.getContext('2d');}
 initGL(){const gl=this.gl;const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader};const vs=compile(gl.VERTEX_SHADER,vertexSource),fs=compile(gl.FRAGMENT_SHADER,fragmentSource),program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);this.program=program;this.position=gl.getAttribLocation(program,'a_position');this.color=gl.getAttribLocation(program,'a_color');this.uniforms={};for(const n of ['u_view','u_camera','u_perspective','u_bias'])this.uniforms[n]=gl.getUniformLocation(program,n);this.meshBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();this.gridBuffer=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clearDepth(1);}
 upload(faces){this.faces=faces;const vertices=[],edges=[];const push=(out,v,col)=>out.push(...v,...col.map(x=>x/255));for(const f of faces){if(f.v.length<3)continue;for(let i=1;i<f.v.length-1;i++){for(const v of [f.v[0],f.v[i],f.v[i+1]])push(vertices,v,f.col)}if(f.kind==='edge')for(let i=0;i<f.v.length;i++){push(edges,f.v[i],[77,59,37]);push(edges,f.v[(i+1)%f.v.length],[77,59,37])}}this.vertices=new Float32Array(vertices);this.edges=new Float32Array(edges);if(this.gl&&!this.lost){const gl=this.gl;for(const [buffer,array]of [[this.meshBuffer,this.vertices],[this.lineBuffer,this.edges]]){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW)}}}
 resize(width,height,dpr){this.width=width;this.height=height;this.dpr=dpr;const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;}
 render(c){this.lastCamera=c;if(this.lost)return;if(!this.gl){this.renderCPU(c);return}const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.uniform4f(this.uniforms.u_view,c.width,c.height,c.scale,0);gl.uniform4f(this.uniforms.u_camera,c.yaw,c.pitch,c.modelHeight,c.size);gl.uniform1f(this.uniforms.u_perspective,c.perspective?1:0);gl.uniform1f(this.uniforms.u_bias,0);
 const draw=(buffer,count,mode)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(this.position);gl.enableVertexAttribArray(this.color);gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(this.color,3,gl.FLOAT,false,24,12);gl.drawArrays(mode,0,count)};
 const grid=[];for(let i=-4;i<=4;i++){const q=i*c.size/8;for(const v of [[-c.size*.5,q,-5],[c.size*.5,q,-5],[q,-c.size*.5,-5],[q,c.size*.5,-5]])grid.push(...v,.19,.23,.16)}gl.bindBuffer(gl.ARRAY_BUFFER,this.gridBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(grid),gl.DYNAMIC_DRAW);draw(this.gridBuffer,grid.length/6,gl.LINES);draw(this.meshBuffer,this.vertices.length/6,gl.TRIANGLES);if(c.wire){gl.depthMask(false);gl.uniform1f(this.uniforms.u_bias,.00002);draw(this.lineBuffer,this.edges.length/6,gl.LINES);gl.depthMask(true);gl.uniform1f(this.uniforms.u_bias,0)}}
 // Devices without WebGL keep correct occlusion using a software depth buffer.
 renderCPU(c){const width=this.canvas.width,height=this.canvas.height;if(!this.ctx)return;const img=this.ctx.createImageData(width,height),pixels=img.data,depth=new Float32Array(width*height);depth.fill(Infinity);const sx=width/c.width,sy=height/c.height;const at=v=>{const a=project(v,c);return[a[0]*sx,a[1]*sy,a[2]]};const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);for(const f of this.faces){const verts=f.v.map(at);for(let i=1;i<verts.length-1;i++){const a=verts[0],b=verts[i],d=verts[i+1],area=edge(a,b,d[0],d[1]);if(Math.abs(area)<1e-8)continue;const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],d[0]))),maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],d[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],d[1]))),maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],d[1])));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const u=edge(b,d,x+.5,y+.5)/area,v=edge(d,a,x+.5,y+.5)/area,w=1-u-v;if(u< -1e-7||v< -1e-7||w< -1e-7)continue;const z=u*a[2]+v*b[2]+w*d[2],idx=y*width+x;if(z< -1||z>1||z>depth[idx]+1e-8)continue;depth[idx]=z;pixels[idx*4]=f.col[0];pixels[idx*4+1]=f.col[1];pixels[idx*4+2]=f.col[2];pixels[idx*4+3]=255}}}if(c.wire){for(const f of this.faces.filter(f=>f.kind==='edge')){const verts=f.v.map(at);for(let i=0;i<verts.length;i++){const a=verts[i],b=verts[(i+1)%verts.length],n=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));for(let j=0;j<=n;j++){const t=n?j/n:0,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);if(x<0||y<0||x>=width||y>=height)continue;const z=a[2]+(b[2]-a[2])*t,idx=y*width+x;if(z>depth[idx]+.00005)continue;pixels.set([77,59,37,255],idx*4)}}}}this.ctx.putImageData(img,0,0);}
}
DepthViewport.project=project;DepthViewport.vertexSource=vertexSource;DepthViewport.fragmentSource=fragmentSource;root.DepthViewport=DepthViewport;if(typeof module!=='undefined')module.exports=DepthViewport;
})(globalThis);
