/* Local WebGL geometry and bloom. No remote assets or fabricated trading activity. */
(()=>{
"use strict";
const byId=id=>document.getElementById(id),bridge=window.LaylowWorld;
if(!bridge)return;
const hex=s=>{const v=parseInt(s.slice(1),16);return[(v>>16)/255,((v>>8)&255)/255,(v&255)/255];};
const positions={SPY:[-7,-7],QQQ:[7,-7],AAPL:[-12,2],TSLA:[12,2],"NQ1!":[-5,8],"ES1!":[5,8],"MGC1!":[-14,10],"MNQ1!":[14,10],"MES1!":[-9,16],"GC1!":[9,16]};
const cube=[
 [0,1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1],
 [0,0,1,1,0,1,1,1,1,0,0,1,1,1,1,0,1,1],
 [1,0,0,1,0,1,1,1,1,1,0,0,1,1,1,1,1,0],
 [0,0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1],
 [0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0],
 [0,0,0,0,0,1,1,0,1,0,0,0,1,0,1,1,0,0]
];
const faceNormals=[[0,1,0],[0,0,1],[1,0,0],[-1,0,0],[0,0,-1],[0,-1,0]];
function multiply(a,b){const r=new Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function norm(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function cameraMatrix(eye,target,aspect){
 const z=norm(eye.map((x,i)=>x-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);
 const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
 const q=1/Math.tan(Math.PI/8)*Math.min(1,aspect/1.3),near=.1,far=250;
 return multiply([q/aspect,0,0,0,0,q,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],view);
}
class Scene {
 constructor(canvas,kind){
  this.canvas=canvas;this.kind=kind;this.gl=canvas.getContext("webgl",{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!this.gl)throw new Error("WebGL is unavailable");
  const gl=this.gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error("Shader could not compile");return s;};
  const program=(v,f)=>{const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error("Renderer could not link");return p;};
  this.program=program(`attribute vec3 position,color,normal;attribute float emission;uniform mat4 camera;varying vec3 tint,n,world;varying float glow,depth;void main(){gl_Position=camera*vec4(position,1.0);world=position;tint=color;n=normal;glow=emission;depth=gl_Position.w;}`,`precision mediump float;varying vec3 tint,n,world;varying float glow,depth;uniform float ambientPulse;uniform vec3 eyePosition,roomAccent;uniform float interior;uniform vec3 contact[6];void main(){vec3 N=normalize(n);float light=.32+.63*max(dot(N,normalize(vec3(-.5,1.,.6))),0.)+.24*max(dot(N,normalize(vec3(.8,.2,-1.))),0.);vec3 V=normalize(eyePosition-world);float rim=pow(1.-max(dot(N,V),0.),3.);float shine=pow(max(dot(reflect(-normalize(vec3(-.5,1.,.6)),N),V),0.),36.);vec3 lit=tint*mix(light,1.2+ambientPulse,glow)+vec3(.1,.24,.32)*rim*(1.-glow)+vec3(.23,.26,.3)*shine*(1.-glow);if(interior>.5){
 vec3 warm=vec3(1.,.83,.66),cool=vec3(.55,.77,1.);
 float key=max(dot(N,normalize(vec3(-.6,1.,.45))),0.);
 float fill=max(dot(N,normalize(vec3(.7,.45,-.4))),0.);
 vec3 material=tint*(vec3(.28)+warm*key*.62+cool*fill*.27);
 float pool=exp(-length(world.xz-vec2(-5.,-2.))*.3);
 material+=tint*roomAccent*pool*.17;
 float shade=1.;
 for(int i=0;i<6;i++){float d=length(world.xz-contact[i].xz);shade*=1.-.30*exp(-d*d/1.1)*step(world.y,.22);}
 lit=(material*shade+cool*rim*.055+warm*shine*.07)*(1.-glow)+tint*(1.03+ambientPulse)*glow;
 }float fog=clamp((depth-36.)/110.,0.,.66);gl_FragColor=vec4(mix(lit,vec3(.035,.047,.105),fog),1.);}`);
  this.buffer=gl.createBuffer();this.attributes=["position","color","normal","emission"].map(n=>gl.getAttribLocation(this.program,n));this.camera=gl.getUniformLocation(this.program,"camera");this.pulse=gl.getUniformLocation(this.program,"ambientPulse");
  this.displayProgram=program(`attribute vec3 position;attribute vec2 uv;uniform mat4 camera;varying vec2 tex;void main(){tex=uv;gl_Position=camera*vec4(position,1.);}`,`precision mediump float;varying vec2 tex;uniform sampler2D display;void main(){gl_FragColor=texture2D(display,tex);}`);
  this.displayBuffer=gl.createBuffer();this.displays=new Map();
  const screenVertex=`attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}`;
  this.blur=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source;uniform vec2 direction;uniform float extract;vec3 tap(vec2 p){vec3 c=texture2D(source,p).rgb;return mix(c,c*smoothstep(.48,.95,max(c.r,max(c.g,c.b))),extract);}void main(){vec3 c=tap(uv)*.227027;c+=(tap(uv+direction*1.384615)+tap(uv-direction*1.384615))*.316216;c+=(tap(uv+direction*3.230769)+tap(uv-direction*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`);
  this.composite=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source,halo;uniform float city;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec4 scene=texture2D(source,uv);vec3 sky=mix(vec3(.065,.072,.17),vec3(.013,.012,.045),smoothstep(.12,1.,uv.y));float cloud=sin(uv.x*7.+uv.y*9.)*sin(uv.x*13.-uv.y*6.);sky+=vec3(.028,.015,.059)*cloud;vec2 cell=floor(uv*vec2(760.,440.));float star=step(.9994,hash(cell))*pow(max(0.,uv.y-.38),1.5);sky+=star*.7*city;vec2 moon=(uv-vec2(.84,.85))*vec2(1.35,1.);float d=length(moon);sky+=vec3(.10,.14,.22)*exp(-d*16.)*city;sky+=vec3(.6,.7,.9)*(1.-smoothstep(.021,.024,d))*city;vec3 c=mix(sky,scene.rgb,scene.a)+texture2D(halo,uv).rgb*mix(.30,1.05,city);c*=1.-.22*pow(length((uv-.5)*1.2),2.);gl_FragColor=vec4(c,1.);}`);
  this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);this.targets=[];
  this.yaw=.25;this.pitch=kind==="city"?.43:kind==="council"?.38:.28;this.distance=kind==="city"?57:kind==="council"?13.5:9;this.target=kind==="city"?[0,3,3]:[0,1.6,0];this.data=[];this.labels=[];
  this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(canvas);this.installCamera();
  canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();this.failed=true;canvas.dataset.ready="false";if(kind==="city"){byId("city-render-note").textContent="3D context lost. Use the accessible city map below.";byId("world").dataset.view="map";}});
  canvas.addEventListener("webglcontextrestored",()=>{byId("city-render-note").textContent="Reload to restore 3D rendering; the map remains available.";});
 }
 vertex(p,rgb,n,e){this.data.push(...p,...rgb,...n,e);}
 // Text and charts on the physical monitors use the same snapshot as the panels.
 display(id,x,y,z,w,h,title,lines,bars=[],accent="#70e2e8"){
  const key=JSON.stringify([title,lines,bars.map(b=>b.close),accent]);let item=this.displays.get(id);
  if(!item){item={texture:this.gl.createTexture()};this.displays.set(id,item);}
  item.geometry=[x-w/2,y,z,0,1,x+w/2,y,z,1,1,x+w/2,y+h,z,1,0,x-w/2,y,z,0,1,x+w/2,y+h,z,1,0,x-w/2,y+h,z,0,0];
  if(item.key===key)return;item.key=key;
  const canvas=document.createElement("canvas");canvas.width=768;canvas.height=448;const ctx=canvas.getContext("2d");
  ctx.fillStyle="#071521";ctx.fillRect(0,0,768,448);ctx.fillStyle=accent;ctx.fillRect(0,0,768,5);ctx.font="600 25px system-ui";ctx.fillText(title,28,48,710);
  for(let i=0;i<lines.length;i++){ctx.font=i===0?"600 38px system-ui":"22px system-ui";ctx.fillStyle=i===0?"#f4f6ff":"#b4c8da";ctx.fillText(String(lines[i]),28,100+i*37,710);}
  const prices=bars.map(b=>Number(b.close)).filter(v=>Number.isFinite(v)&&v>0).slice(-48);
  if(prices.length>1){const low=Math.min(...prices),spread=Math.max(...prices)-low||1;ctx.strokeStyle="#213648";ctx.lineWidth=1;for(let y=252;y<=410;y+=52){ctx.beginPath();ctx.moveTo(28,y);ctx.lineTo(740,y);ctx.stroke();}
   ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.beginPath();prices.forEach((p,i)=>{const x=28+i*712/(prices.length-1),y=398-(p-low)*136/spread;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  }else{ctx.fillStyle="#697f99";ctx.font="21px system-ui";ctx.fillText("OPEN TERMINAL FOR DETAILS",28,350);}
  const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
 }
 drawDisplays(){
  const gl=this.gl;if(!this.displays.size)return;for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++)gl.disableVertexAttribArray(i);
  gl.useProgram(this.displayProgram);gl.uniformMatrix4fv(gl.getUniformLocation(this.displayProgram,"camera"),false,new Float32Array(this.matrix));gl.bindBuffer(gl.ARRAY_BUFFER,this.displayBuffer);
  const p=gl.getAttribLocation(this.displayProgram,"position"),uv=gl.getAttribLocation(this.displayProgram,"uv");gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(p,3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,20,12);
  gl.activeTexture(gl.TEXTURE0);gl.uniform1i(gl.getUniformLocation(this.displayProgram,"display"),0);
  for(const item of this.displays.values()){gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(item.geometry),gl.STATIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.drawArrays(gl.TRIANGLES,0,6);}gl.disableVertexAttribArray(p);gl.disableVertexAttribArray(uv);
 }
 box(x,y,z,w,h,d,color,emission=0){
  const rgb=Array.isArray(color)?color:hex(color);
  for(let f=0;f<cube.length;f++)for(let i=0;i<18;i+=3)this.vertex([x+(cube[f][i]-.5)*w,y+cube[f][i+1]*h,z+(cube[f][i+2]-.5)*d],rgb,faceNormals[f],emission);
 }
 // Rounded furniture profiles keep a small, deterministic mesh budget.
 roundedBox(x,y,z,w,h,d,color,r=.08,emission=0){
  r=Math.min(r,w/2,d/2);const rgb=hex(color),outline=[];
  for(let k=0;k<4;k++){const a=k*Math.PI/2,cx=Math.cos(a+Math.PI/4)>0?w/2-r:-w/2+r,cz=Math.sin(a+Math.PI/4)>0?d/2-r:-d/2+r;
   for(let j=0;j<=5;j++){const angle=a+j*Math.PI/10;outline.push([cx+Math.cos(angle)*r,cz+Math.sin(angle)*r,Math.cos(angle),Math.sin(angle)]);}}
  for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],lo=[x+a[0],y,z+a[1]],hi=[x+a[0],y+h,z+a[1]],ll=[x+b[0],y,z+b[1]],hh=[x+b[0],y+h,z+b[1]];
   for(const [v,n]of[[lo,[a[2],0,a[3]]],[ll,[b[2],0,b[3]]],[hh,[b[2],0,b[3]]],[lo,[a[2],0,a[3]]],[hh,[b[2],0,b[3]]],[hi,[a[2],0,a[3]]]])this.vertex(v,rgb,n,emission);
   for(const v of[[x,y+h,z],hh,hi])this.vertex(v,rgb,[0,1,0],emission);
  }
 }
 ellipsoid(x,y,z,rx,ry,rz,color,emission=0){
  const start=this.data.length;this.sphere(x,y,z,1,color,emission);
  for(let i=start;i<this.data.length;i+=10){this.data[i]=x+(this.data[i]-x)*rx;this.data[i+1]=y+(this.data[i+1]-y)*ry;this.data[i+2]=z+(this.data[i+2]-z)*rz;
   const n=norm([this.data[i+6]/rx,this.data[i+7]/ry,this.data[i+8]/rz]);this.data.splice(i+6,3,...n);}
 }
 sphere(x,y,z,r,color,emission=0){
  const rgb=hex(color),point=(lat,lon)=>[Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon)];
  for(let a=0;a<12;a++)for(let b=0;b<20;b++){
   const lat=-Math.PI/2+a*Math.PI/12,lon=b*Math.PI*2/20,aa=Math.PI/12,bb=Math.PI*2/20;
   for(const n of[point(lat,lon),point(lat+aa,lon),point(lat+aa,lon+bb),point(lat,lon),point(lat+aa,lon+bb),point(lat,lon+bb)])this.vertex([x+n[0]*r,y+n[1]*r,z+n[2]*r],rgb,n,emission);
  }
 }
 cylinder(x,y,z,r,h,color,top=r,emission=0,segments=32){
  const rgb=hex(color);
  for(let i=0;i<segments;i++){
   const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
   const p=[x+r*Math.cos(a),y,z+r*Math.sin(a)],q=[x+r*Math.cos(b),y,z+r*Math.sin(b)],u=[x+top*Math.cos(a),y+h,z+top*Math.sin(a)],v=[x+top*Math.cos(b),y+h,z+top*Math.sin(b)];
   const na=norm([Math.cos(a),(r-top)/Math.max(h,.001),Math.sin(a)]),nb=norm([Math.cos(b),(r-top)/Math.max(h,.001),Math.sin(b)]);
   for(const [p1,n] of[[p,na],[q,nb],[v,nb],[p,na],[v,nb],[u,na]])this.vertex(p1,rgb,n,emission);
   for(const p1 of[[x,y+h,z],u,v])this.vertex(p1,rgb,[0,1,0],emission);
  }
 }
 ring(x,y,z,r,color,thickness=.045,emission=1){
  const rgb=hex(color),count=64;
  for(let i=0;i<count;i++){
   const a=i*2*Math.PI/count,b=(i+1)*2*Math.PI/count;
   const p=(angle,radius)=>[x+Math.cos(angle)*radius,y,z+Math.sin(angle)*radius];
   for(const point of[p(a,r-thickness),p(a,r+thickness),p(b,r+thickness),p(a,r-thickness),p(b,r+thickness),p(b,r-thickness)])this.vertex(point,rgb,[0,1,0],emission);
  }
 }
 robot(x,y,z,color,scale=1,seated=false,angle=0){
  const start=this.data.length,b=(xx,yy,zz,w,h,d,c,e=0)=>this.box(x+xx*scale,y+yy*scale,z+zz*scale,w*scale,h*scale,d*scale,c,e);
  b(-.18,0,seated?.3:0,.2,.32,.34,"#444967");b(.18,0,seated?.3:0,.2,.32,.34,"#444967");
  this.cylinder(x,y+.28*scale,z,.32*scale,.52*scale,"#9da9c5",.26*scale);
  b(0,.49,.29,.28,.17,.025,"#131d35");b(0,.53,.31,.19,.045,.025,color,1);
  this.sphere(x-.37*scale,y+.69*scale,z,.13*scale,"#d3dcf1");this.sphere(x+.37*scale,y+.69*scale,z,.13*scale,"#d3dcf1");
  b(-.4,.32,.12,.12,.33,.12,"#71849f");b(.4,.32,.12,.12,.33,.12,"#71849f");
  this.sphere(x-.4*scale,y+.32*scale,z+.15*scale,.10*scale,color);this.sphere(x+.4*scale,y+.32*scale,z+.15*scale,.10*scale,color);
  this.ellipsoid(x,y+1.08*scale,z,.39*scale,.33*scale,.35*scale,'#bac9d9');
  // Twin molded ear cups, a colored brow and a dark faceplate.
  b(0,1.20,.28,.45,.035,.12,color,.35);
  this.ellipsoid(x,y+1.065*scale,z+.305*scale,.26*scale,.13*scale,.07*scale,'#0a1828');
  for(const side of[-1,1])this.ellipsoid(x+side*.40*scale,y+1.075*scale,z,.08*scale,.17*scale,.14*scale,'#41536b');
  b(0,.94,.29,.53,.25,.12,"#080f22");b(-.13,1.04,.36,.085,.07,.015,color,1);b(.13,1.04,.36,.085,.07,.015,color,1);
  b(0,.985,.367,.14,.018,.015,color,.8);
  b(-.38,.93,0,.12,.31,.28,"#242b45");b(.38,.93,0,.12,.31,.28,"#242b45");
  b(-.447,1.00,0,.012,.16,.16,color,.8);b(.447,1.00,0,.012,.16,.16,color,.8);
  b(0,1.43,0,.047,.16,.047,"#647697");this.sphere(x,y+1.62*scale,z,.065*scale,color,1);
  // Layered armor, articulated joints, visor trim and a headset microphone.
  b(0,.35,-.23,.38,.35,.1,'#405776');b(0,.44,.32,.35,.018,.018,color,.5);
  for(const side of[-1,1]){
   this.sphere(x+side*.4*scale,y+.49*scale,z+.09*scale,.085*scale,'#293e59');
   b(side*.17,.075,seated?.46:.19,.23,.11,.26,'#b6c7d8');
   b(side*.17,.08,seated?.595:.325,.19,.045,.018,color,.3);
   this.sphere(x+side*.448*scale,y+1.10*scale,z,.095*scale,'#516581');
   b(side*.48,1.075,.025,.026,.045,.12,color,.7);
  }
  b(0,1.19,.35,.43,.018,.015,'#7895b3');b(0,.925,.355,.47,.012,.014,'#5d7e9c');
  b(.36,.91,.22,.035,.03,.32,'#7085a1');this.sphere(x+.34*scale,y+.92*scale,z+.38*scale,.04*scale,color,.6);
  this.ring(x,y+.84*scale,z,.15*scale,'#566d89',.014*scale,0);
  if(angle){const c=Math.cos(angle),s=Math.sin(angle);for(let i=start;i<this.data.length;i+=10){const xx=this.data[i]-x,zz=this.data[i+2]-z,nx=this.data[i+6],nz=this.data[i+8];this.data[i]=x+xx*c+zz*s;this.data[i+2]=z-xx*s+zz*c;this.data[i+6]=nx*c+nz*s;this.data[i+8]=-nx*s+nz*c;}}
 }
 building(x,z,h,color,width=2.3,detail=true){
  this.box(x,.04,z,width+1.1,.28,width+1.1,"#293550");this.box(x,.33,z,width+.45,.15,width+.45,color,.6);
  this.box(x,.48,z,width,h,width,"#202e49");
  const rows=Math.floor(h/.46),cols=Math.max(3,Math.floor(width/.3));
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   if((row*11+col*7+Math.round(x*3+z*2))%9===0)continue;
   const yy=.7+row*.46,offset=-width*.4+col*width*.8/(cols-1),c=(row+col)%4===0?color:"#ffd9a0";
   this.box(x+offset,yy,z+width*.503,.09,.17,.014,c,.8);
   this.box(x+width*.503,yy,z+offset,.014,.17,.09,c,.8);
   this.box(x+offset,yy,z-width*.503,.09,.17,.014,c,.8);
   this.box(x-width*.503,yy,z+offset,.014,.17,.09,c,.8);
  }
  this.box(x,h+.48,z,width+.15,.15,width+.15,"#425477");
  this.box(x,h+.64,z,width*.75,.48,width*.75,"#263a58");
  this.box(x,h+1.12,z,width*.8,.06,width*.8,color,1);
  if(detail){
   for(const dx of[-1,1])for(const dz of[-1,1])this.box(x+dx*width*.47,.5,z+dz*width*.47,.065,h,.065,color,.85);
   for(let yy=2;yy<h;yy+=2.3)this.box(x,yy,z,width+.07,.05,width+.07,"#687384");
   this.box(x,.5,z+width*.512,.65,.74,.025,"#091328");this.box(x,.55,z+width*.532,.4,.62,.01,color,.5);
  }
 }
 beam(x,y,z,color,height=7){
  this.cylinder(x,y,z,.085,height,color,.035,1,16);
  for(let i=0;i<3;i++)this.ring(x,y+.2+i*.26,z,.5+i*.24,color,.025,.8);
 }
 city(){
  this.data=[];this.labels=[];this.buildings=[];
  // Dark water, a raised island, concentric boulevards and a lit waterfront.
  this.box(0,-1.2,0,170,.12,150,"#07152c");
  this.cylinder(0,-.75,3,24,.72,"#132441",24,0,96);this.cylinder(0,-.03,3,23.5,.15,"#1c2d46",23.5,0,96);
  for(const r of[23.4,19,13.3,6.2]){this.ring(0,.15,3,r,"#10192c",r===23.4?.12:.48,0);this.ring(0,.18,3,r+.48,"#667f9d",.025,.4);}
  this.ring(0,.17,3,23.6,"#668ef2",.045,1);
  for(let x=-18;x<=18;x+=6){this.box(x,.15,3,.8,.02,36,"#111b2f");this.box(x+.43,.18,3,.025,.015,36,"#586f95",.4);}
  for(let z=-15;z<=18;z+=6){this.box(0,.16,z,37,.02,.8,"#111b2f");this.box(0,.18,z+.43,37,.015,.025,"#586f95",.4);}
  for(let i=0;i<60;i++){const a=i*Math.PI*2/60,x=Math.cos(a)*22.6,z=3+Math.sin(a)*22.6;this.cylinder(x,.15,z,.04,.62,"#71829e",.025);this.sphere(x,.8,z,.055,"#ffdc9b",1);}
  for(let i=0;i<27;i++){
   const x=-35+i*2.7,z=-25-(i%3)*2,h=3+(i*7%17)*.45;this.building(x,z,h,i%3?"#799bc5":"#ac90d4",1.15+(i%3)*.36,false);
  }
  // A second skyline gives the city depth without implying trading activity.
  for(let i=0;i<18;i++){const x=-44+i*5.1,h=4+(i*5%13)*.5;this.building(x,-37,h,"#516790",1.8,false);}
  // Vault plaza: terraces, blue pool, gold tower and a continuous halo.
  for(let i=0;i<3;i++)this.cylinder(0,.16+i*.15,-3,5-i*.42,.15,"#3e4860",5-i*.42,0,64);
  this.cylinder(0,.63,-3,4.05,.08,"#0c4568",4.05,.3,64);this.ring(0,.74,-3,4.02,"#73dfff",.045,1);
  this.cylinder(0,.73,-3,2.9,.28,"#5c4d34",2.9);this.ring(0,1.03,-3,2.9,"#fbd387",.06,1);
  this.building(0,-3,15.4,"#ffd079",3.4);this.building(0,-3,17.1,"#ffd079",1.5);
  this.cylinder(0,17.7,-3,.74,1.1,"#6d5530",.18);this.ring(0,18.3,-3,1.5,"#ffe2a3",.055,1);this.beam(0,18.8,-3,"#ffe6a8",12);
  this.labels.push({x:0,y:20.1,z:-3,name:"THE VAULT",special:"vault"});
  this.buildings.push({name:"THE VAULT",min:[-1.7,.35,-4.7],max:[1.7,19.2,-1.3]});
  let teamIndex=0;
  for(const district of bridge.districts){
   const [x,z]=positions[district.name]||[0,0],h=district.name.endsWith("!")?5.1+(teamIndex%3)*.65:8+(teamIndex%2)*1.1;
   this.cylinder(x,.18,z,2.3,.15,"#26334d",2.3);this.ring(x,.34,z,2.1,district.color,.035,.75);
   this.building(x,z,h,district.color,2.1);this.building(x,z,h+1,district.color,1.2,false);
   this.ring(x,h+1.7,z,1.0,district.color,.035,1);this.robot(x,h+1.5,z,district.color,.65);this.beam(x,h+2.7,z,district.color,4.5);
   const def=bridge.definitions.find(row=>row.name===district.name);
   for(let j=0;j<(def?.bots.length||0);j++)this.robot(x-1.3+j*.8,.36,z+2.1,district.color,.4);
   this.robot(x+2,.35,z,district.color,.55);this.labels.push({x,y:h+3,z,name:district.name});this.buildings.push({name:district.name,min:[x-1.1,.35,z-1.1],max:[x+1.1,h+2.65,z+1.1]});teamIndex++;
  }
  this.cylinder(0,.18,13,3.3,.2,"#313049",3.3);this.ring(0,.4,13,3.3,"#b692ff",.035,.8);
  this.building(0,13,6.1,"#b58cff",3);this.robot(0,7.3,13,"#b58cff",1);this.ring(0,8.3,13,1.9,"#bd9fff",.04,1);
  this.labels.push({x:0,y:10.1,z:13,name:"BIG MANAGER",special:"manager"});
  this.buildings.push({name:"BIG MANAGER",min:[-1.5,.35,11.5],max:[1.5,9,14.5]});
  // Six-seat Council headquarters on the front waterfront promenade.
  this.cylinder(0,.18,21,3.2,.2,"#26334d",3.2);this.ring(0,.42,21,3.1,"#70e2e8",.05,1);
  this.building(0,21,4.4,"#70e2e8",4.2);this.building(0,21,5.2,"#70e2e8",2.5,false);
  this.cylinder(0,5.85,21,2.05,.25,"#293c54",2.05);this.ring(0,6.15,21,2.1,"#ffe0a2",.055,1);
  const councilColors=["#70e2e8","#ac7bff","#ffd278","#ff657e","#44edac","#4acaff"];
  councilColors.forEach((color,index)=>{const a=index*Math.PI/3;this.robot(Math.cos(a)*1.55,6.15,21+Math.sin(a)*1.55,color,.45);});
  this.box(0,.55,23.13,1.05,1.2,.04,"#ffe0a2",.8);this.box(0,.6,23.17,.77,1.08,.03,"#07172a");
  this.labels.push({x:0,y:8,z:21,name:"THE COUNCIL",special:"council"});
  this.buildings.push({name:"THE COUNCIL",min:[-2.1,.35,18.9],max:[2.1,7.3,23.1]});
  // Warm landscaped promenades and subtle geometric reflections in the water.
  for(let i=0;i<32;i++){const a=i*Math.PI*2/32,x=Math.cos(a)*20.3,z=3+Math.sin(a)*20.3;this.cylinder(x,.18,z,.2,.7,"#233e3f",0,0,8);}
  for(let i=0;i<65;i++){const x=-34+(i*17%69),z=28+(i*13%23);this.box(x,-1.06,z,.12+(i%4)*.18,.01,.03,i%3?"#304867":"#817348",.35);}
  this.cityBase=this.data.slice();this.upload();this.draw();
 }
 marketBackdrop(bars,key){
  if(this.backdropKey===key||!this.cityBase)return;this.backdropKey=key;this.data=this.cityBase.slice();
  const prices=bars.map(row=>Number(row.close)).filter(value=>Number.isFinite(value)&&value>0).slice(-48);
  if(prices.length>1){const lo=Math.min(...prices),spread=Math.max(...prices)-lo||1;
   for(let i=1;i<prices.length;i++){const ax=-24+(i-1)*48/(prices.length-1),bx=-24+i*48/(prices.length-1),ay=11+(prices[i-1]-lo)*5/spread,by=11+(prices[i]-lo)*5/spread;
    for(const vertex of[[ax,ay-.035,-23],[bx,by-.035,-23],[bx,by+.035,-23],[ax,ay-.035,-23],[bx,by+.035,-23],[ax,ay+.035,-23]])this.vertex(vertex,hex("#5fcaed"),[0,0,1],1);
   }
  }this.upload();this.draw();
 }
 gameInterior(kind,color){
  this.effects=false;
  const council=kind==='council';
  // A hand-built game environment: paneled floors, luminous conduits and command stations.
  for(let x=-5;x<=5;x++)for(let z=-4;z<=3;z++){
   if(council&&Math.hypot(x,z)<5.5)continue;
   this.box(x,.025,z,.92,.025,.92,(x+z)%2?'#22364b':'#293e53');
   this.box(x,.057,z-.42,.65,.008,.018,'#466782',.15);
  }
  for(const x of council?[-6.4,6.4]:[-5.2,5.2]){
   this.box(x,.06,-.4,.06,.018,7,color,.85);
   for(let z=-3;z<3;z+=1.2){this.box(x,.09,z,.25,.012,.22,'#b1f0ed',.5);this.box(x,0,z,.5,.09,.42,'#12243a');}
  }
  // Rear wall inset panels and layered circuit trim.
  const back=council?-6:-4.1;
  for(const x of council?[-6.8,6.8]:[-5.1,5.1]){
   this.box(x,.15,back,.65,4.6,.2,'#0a1325');this.box(x,.22,back+.12,.08,4.35,.02,color,1);
   for(let y=.4;y<4.4;y+=.35)this.box(x+.16,y,back+.15,.26,.045,.015,'#7b9caf',.5);
  }
  if(council){
   // Holographic miniature agency on the central table; decorative skyline only.
   this.cylinder(0,1.58,0,.8,.07,'#122e43',.8);this.ring(0,1.66,0,.78,color,.025,1);
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=Math.sin(a)*.6,z=Math.cos(a)*.6,h=.3+(i%3)*.16;this.box(x,1.66,z,.18,h,.18,'#387986',.35);this.box(x,1.66+h,z,.21,.018,.21,color,.8);}
   this.box(0,1.66,0,.25,.74,.25,'#6e8566',.4);this.ring(0,2.5,0,.43,'#ffe4a0',.018,.8);
   for(const x of[-6.2,6.2]){this.box(x,0,-3.4,1.45,.16,1.8,'#415b70');this.box(x,.16,-3.4,1.2,.95,1.5,'#142339');this.box(x,1.1,-3.4,1.5,.12,1.8,'#384b64');this.box(x,1.24,-3.6,1.15,.76,.09,'#061524');this.box(x,1.19,-2.65,1.3,.03,.025,color,.8);}
   this.display('academy-wall',5.65,3.6,-6,2.6,1.15,'NIGHT SCHOOL',['SYNTHETIC RESEARCH','All teams can keep testing','Separate from account brakes'],[],color);
  }else{
   // Side command desk, illuminated display plinth and lounge furniture.
   this.box(-3.95,1.06,-2.4,2.0,.1,1.0,'#5b718b');this.box(-3.95,.1,-2.4,1.7,.96,.8,'#182e43');this.box(-3.95,1.1,-1.88,1.85,.025,.04,color,.9);
   this.box(-3.95,1.2,-2.65,1.86,1.28,.12,'#061322');
   this.display('academy-desk',-3.95,1.24,-2.575,1.73,1.16,'RESEARCH TERMINAL',['NIGHT SCHOOL','Synthetic scenario drills','No live orders'],[],color);
   this.box(4.5,.22,1.9,1.5,.4,1.4,'#273d53');this.box(4.5,.58,2.4,1.5,.8,.24,'#47617a');this.box(4.5,.55,1.85,1.35,.14,1.2,'#507382');
   this.cylinder(3.4,.08,3.05,.55,.5,'#3b5067',.36);this.cylinder(3.4,.58,3.05,.63,.06,'#7394a8',.63);this.ring(3.4,.65,3.05,.55,color,.02,.8);
   this.cylinder(3.4,.65,3.05,.15,.2,'#bfd6e1');
   // Light canopy outlines the workspace without enclosing the roof.
   for(const x of[-3.5,3.5]){this.box(x,3.85,-.5,.065,.06,3.2,color,.8);this.box(x,.12,1.05,.035,3.7,.035,'#435f78');}
   this.box(0,3.85,-2.1,7,.06,.065,color,.8);
  }
 }
 trainingDisplay(data){
  const t=data?.teams?.find(t=>t.name===this.symbol)||data?.teams?.[0];if(!t)return;
  if(this.kind==='office'&&!this.crew)this.display('academy-desk',-5.9,2.5,-6.20,2.5,1,'NIGHT SCHOOL / '+t.name,[t.experiments+' DRILLS',t.status,t.trades+' held-out trades'],[],this.theme?.accent||'#70e2e8');
  if(this.kind==='council')this.display('academy-wall',5.65,3.6,-6,2.6,1.15,'ACADEMY / RESEARCH',[data.experiments+' EXPERIMENTS',data.scenario,'Synthetic · baseline protected'],[],'#70e2e8');
  this.draw();
 }
 drawRoomEffects(){
  if(this.kind==='city'||!this.effects)return;
  const original=this.data;this.data=[];const time=performance.now()/1500,council=this.kind==='council',x=council?0:3.4,z=council?0:3.05,y=council?2.2:1.0,color=council?'#70e2e8':'#ad94ff';
  this.ring(x,y+.08*Math.sin(time),z,council?.52:.28,color,.017,.85);
  for(let i=0;i<9;i++){const a=time+i*Math.PI*2/9,r=council?.7:.33;this.sphere(x+Math.sin(a)*r,y+.12*Math.sin(a*2),z+Math.cos(a)*r,.035,color,.8);}
  const gl=this.gl;if(!this.effectBuffer)this.effectBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.effectBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.data),gl.DYNAMIC_DRAW);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i===3?1:3,gl.FLOAT,false,40,i*12);}gl.drawArrays(gl.TRIANGLES,0,this.data.length/10);this.data=original;
 }

 office(symbol){
  window.LaylowTeamOffices.build(this,symbol,bridge);
 }
 officeBars(bars){
  if(this.crew)window.LaylowTeamOffices.update(this,snapshot,online,bars);
 }
 councilRoom(members){
  this.data=[];this.councilDataKey=null;
  this.box(0,-.25,0,16,.25,15,"#182337");this.box(0,0,-6.4,16,6.7,.2,"#252841");
  for(let x=-7;x<=7;x++)this.box(x,.008,0,.014,.008,14,"#344256");for(let z=-6;z<=6;z++)this.box(0,.008,z,15,.008,.014,"#344256");
  // Bronze architectural ribs, blue alcoves and a panoramic window wall.
  for(const x of[-7.8,7.8]){this.box(x,0,-2,.18,6.7,8.5,"#253149");this.box(x*.99,.12,-2,.035,.04,8.5,"#d9b174",1);for(let z=-6;z<=2;z+=1.3)this.box(x*.98,0,z,.15,6.3,.09,"#806647");}
  for(const x of[-5.65,5.65]){this.box(x,1,-6.22,3.4,4.9,.05,"#071c30");for(let j=0;j<9;j++){const bx=x-1.5+j*.36,h=1+(j*7%9)*.24;this.box(bx,1,-6.17,.27,h,.04,"#294562");for(let row=0;row<h/.25;row++)this.box(bx,1.12+row*.25,-6.13,.045,.08,.012,"#a6cbe5",.5);}for(const bx of[x-1.65,x,x+1.65])this.box(bx,1,-6.05,.045,4.9,.06,"#a3a4af");}
  for(const x of[-7.35,-3.7,3.7,7.35]){this.box(x,0,-6.03,.13,6.5,.15,"#9d794c");this.box(x,.25,-5.93,.035,5.9,.025,"#ffd18e",.8);}
  this.box(0,2.5,-6.07,6.4,2.9,.18,"#081521");this.box(0,2.48,-5.96,6.5,.045,.035,"#ffd18e",1);
  this.cylinder(0,.02,0,5.4,.09,"#28384c",5.4,0,64);this.ring(0,.12,0,5.35,"#c2a16a",.05,.8);this.ring(0,.13,0,5.05,"#6c95a8",.015,.4);
  this.cylinder(0,.1,0,.78,1.03,"#65563e",.63);this.cylinder(0,1.12,0,3.0,.23,"#a58351",3,0,64);this.cylinder(0,1.35,0,2.91,.045,"#193c40",2.91,0,64);
  this.ring(0,1.40,0,2.88,"#ffe4a0",.026,1);this.ring(0,1.405,0,1.2,"#70e2e8",.013,.7);
  this.cylinder(0,1.4,0,.5,.18,"#61758d",.43);this.ring(0,1.61,0,.65,"#70e2e8",.025,1);this.ring(0,2.12,0,.48,"#70e2e8",.013,.5);this.ring(0,2.4,0,.29,"#ffe4a0",.013,.6);
  this.sphere(0,1.99,0,.19,"#56a8bb",.4);
  // Suspended chandelier, slender cables and warm downlights.
  for(const r of[2.25,2.5]){this.ring(0,4.45,0,r,"#705d49",.065,0);this.ring(0,4.46,0,r,"#ffe4a0",.025,.85);}
  for(let i=0;i<12;i++){const a=i*Math.PI/6,x=Math.sin(a)*2.38,z=Math.cos(a)*2.38;this.box(x,4.5,z,.03,1.7,.03,"#9c8b69");this.sphere(x,4.39,z,.055,"#ffe4a0",1);}
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*3.8,z=Math.cos(a)*3.8,m=members[i]||{},color=/^#[0-9a-f]{6}$/i.test(m.color)?m.color:["#74c8ff","#ad94ff","#ff7cb0","#ffb86c","#70e1bd","#ffe58f"][i];
   this.cylinder(x,.14,z,.53,.1,"#53617c");this.cylinder(x,.24,z,.075,.31,"#a3aec5");this.box(x,.55,z,1.12,.16,.87,"#213449");
   this.robot(x,.72,z,color,1.04,true,a+Math.PI);this.ring(x,2.54,z,.51,color,.023,.8);
   const tx=Math.sin(a)*2.25,tz=Math.cos(a)*2.25;this.cylinder(tx,1.405,tz,.3,.06,"#0c2133",.3);this.ring(tx,1.475,tz,.27,color,.018,.9);
   // Personal gear gives each seat a distinct silhouette.
   if(i===0){this.sphere(x-.44,1.15,z,.12,"#74c8ff",.4);}
   if(i===1){this.box(x,1.69,z,.5,.06,.48,"#ad94ff",.5);}
   if(i===2){this.box(x,2.12,z,.07,.22,.3,color,.5);}
   if(i===3){this.sphere(x-.22,2.25,z,.08,color,.6);this.sphere(x+.22,2.25,z,.08,color,.6);}
   if(i===4){this.cylinder(x,2.13,z,.31,.09,"#70e1bd",.14);}
   if(i===5){this.ring(x,2.37,z,.27,"#ffe58f",.025,.8);}
  }
  this.gameInterior('council','#70e2e8');
  this.chamberArchitecture();
  this.chamberFurnishings(members);this.councilBase=this.data.slice();this.upload();this.draw();
 }
 chamberArchitecture(){
  // A dedicated executive chamber, with a cutaway roof for the room camera.
  this.box(0,-.48,0,16.8,.22,15.8,'#080e20');this.box(0,-.26,0,16.5,.06,15.5,'#7e684d');
  for(const x of[-8.15,8.15])this.box(x,-.14,0,.04,.06,15.3,'#70e2e8',.4);
  this.box(0,-.14,7.65,16.3,.06,.04,'#d9b174',.4);
  for(let i=0;i<3;i++)this.cylinder(0,.12+i*.015,0,4.8-i*.22,.014,i%2?'#334655':'#28394a',4.8-i*.22,0,96);
  // Radial inlays and concentric brass trim beneath the six council seats.
  for(const r of[4.7,4.2,3.25])this.ring(0,.18,0,r,'#a78c62',.014,.15);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;this.box(Math.sin(a)*4.9,.19,Math.cos(a)*4.9,.045,.018,.045,'#70e2e8',.4);}
  for(const x of[-7.5,7.5])for(const z of[-4.8,-1.5,1.8]){
   this.box(x,.3,z,.25,4.85,2.55,'#131f32');this.box(x*.98,5.15,z,.2,.15,2.75,'#8e7353');
   this.box(x*.975,.45,z,.03,4.6,.035,'#ffda9b',.35);
   for(let j=0;j<8;j++)this.box(x*.98,1+j*.38,z,.05,.045,1.8,'#38495d');
  }
  // Tiered suspended fixture; avoid a solid ceiling blocking isometric views.
  for(const x of[-6.6,6.6]){this.box(x,5.65,-4.5,.09,.09,3,'#9c825b');this.box(x,5.62,-4.5,.04,.015,2.8,'#ffdda9',.2);}
  // Recessed podiums, executive shelves and low planted lounge corners.
  for(const x of[-6,6]){
   this.cylinder(x,.02,4.7,.45,.65,'#475064',.35);this.box(x,.55,4.7,.04,1,.04,'#326868');
   for(let i=0;i<4;i++){const a=i*Math.PI/2;this.sphere(x+Math.sin(a)*.22,1.32+i*.09,4.7+Math.cos(a)*.22,.23,'#397e72');}
   for(let y=.7;y<3.3;y+=.8){this.box(x,y,-5.7,2.25,.065,.65,'#766c5a');for(let j=0;j<6;j++)this.box(x-.85+j*.3,y+.07,-5.7,.15,.39,.25,j%2?'#3c6a7e':'#bca276');}
  }
  for(const x of[-5,5]){this.box(x,.15,5.4,2,.35,.95,'#283b50');this.box(x,.5,5.8,2,.8,.12,'#566074');this.box(x,.5,5.4,1.8,.12,.82,'#49586d');}
  // Tablets, notebooks, cups and swivel chairs turn seats into working stations.
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*2.3,z=Math.cos(a)*2.3;
   this.box(x,1.48,z,.5,.025,.32,'#0c1b2e');this.box(x,1.507,z,.4,.006,.24,'#568d9b',.22);
   this.cylinder(x+.4,1.41,z,.085,.17,'#ced7d7');
   const sx=Math.sin(a)*3.8,sz=Math.cos(a)*3.8;
   this.box(sx,.62,sz,1,.07,.82,'#495b71');
   for(let j=0;j<5;j++){const b=j*Math.PI*2/5;this.sphere(sx+Math.sin(b)*.46,.18,sz+Math.cos(b)*.46,.06,'#142031');}
  }
  this.display('council-crest',0,5.58,-6.01,4.4,.65,'THE COUNCIL',['SIX PERSPECTIVES / ONE DECISION'],[],'#f3cf91');
 }
 chamberFurnishings(members){
  // Walnut tabletop with radial brass inlays and six inward-facing club chairs.
  this.cylinder(0,1.401,0,2.90,.018,'#55463c',2.9,0,80);
  for(const r of[1.25,2.66])this.ring(0,1.425,0,r,'#bca27e',.014,.08);
  for(let i=0;i<36;i++){const a=i*Math.PI/18;this.box(Math.sin(a)*2.76,1.428,Math.cos(a)*2.76,.024,.006,.024,'#ddc39b',.1);}
  for(let i=0;i<6;i++){
   const a=i*Math.PI/3,x=Math.sin(a)*3.8,z=Math.cos(a)*3.8,start=this.data.length,c=members[i]?.color||'#70e2e8';
   this.roundedBox(0,.56,0,1.12,.15,1.0,'#58687a',.16);
   this.roundedBox(0,.68,.47,1.10,.88,.17,'#283848',.11);
   this.roundedBox(0,.76,.36,.94,.66,.08,'#667384',.04);
   for(const side of[-1,1]){this.box(side*.57,.6,0,.05,.32,.08,'#bca27e');this.roundedBox(side*.57,.92,0,.18,.08,.73,'#43566c',.08);}
   this.box(0,1.48,.56,.52,.025,.025,c,.25);
   const ca=Math.cos(a),sa=Math.sin(a);for(let j=start;j<this.data.length;j+=10){const xx=this.data[j],zz=this.data[j+2],nx=this.data[j+6],nz=this.data[j+8];this.data[j]=x+xx*ca+zz*sa;this.data[j+2]=z-xx*sa+zz*ca;this.data[j+6]=nx*ca+nz*sa;this.data[j+8]=-nx*sa+nz*ca;}
  }
  for(const x of[-5,5]){this.roundedBox(x,.50,5.4,1.85,.19,.90,'#617285',.15);for(const dx of[-.48,.48])this.roundedBox(x+dx,.69,5.73,.88,.56,.16,'#45576d',.07);this.cylinder(x,.16,4.25,.63,.40,'#283b4c');this.cylinder(x,.57,4.25,.68,.05,'#a68f71');}
  // Framed brass relief and luminous wall sconces, not fake performance data.
  for(const x of[-7.15,7.15])for(const z of[-3.9,-.5,2.9]){this.box(x,2.1,z,.12,.65,.22,'#b19b75');this.ellipsoid(x,2.45,z,.11,.17,.11,'#ffe4ba',.35);}
  for(let i=0;i<9;i++){this.roundedBox(-6.15+i*.25,3.6,-5.7,.06,.7+(i%3)*.24,.12,'#a58b67',.025);}
 }
 councilData(members,bars,review){
  if(!this.councilBase)return;const key=JSON.stringify([members.map(m=>m.vote),bars.at(-1)?.timestamp,bars.at(-1)?.close,review?.action,review?.team_name]);if(key===this.councilDataKey)return;this.councilDataKey=key;this.data=this.councilBase.slice();
  for(let i=0;i<6;i++){const a=i*Math.PI/3,v=members[i]?.vote,c=v==="SUPPORT"?"#70e1bd":v==="VETO"?"#ff718b":v==="WAIT"?"#e6b875":"#5f718d";this.ring(Math.sin(a)*2.25,1.49,Math.cos(a)*2.25,.32,c,.022,.8);}
  this.display("evidence",0,2.55,-5.94,6.1,2.7,(review?.team_name||"COUNCIL")+" / EVIDENCE WALL",[review?review.favorable_votes+" OF 6 SUPPORT · "+(review.action||"WAIT"):"WAITING FOR EVIDENCE",snapshot?.practice?"SYNTHETIC PRACTICE CANDLES":"RECORDED CLOSE HISTORY","Seat lights: green support / amber wait / red veto"],bars,"#70e2e8");this.upload();this.draw();
 }
 upload(){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.data),gl.STATIC_DRAW);this.vertices=this.data.length/10;}
 targetsFor(w,h){
  if(this.targetWidth===w&&this.targetHeight===h)return;
  const gl=this.gl;for(const t of this.targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);if(t.depth)gl.deleteRenderbuffer(t.depth);}this.targets=[];
  this.targetWidth=w;this.targetHeight=h;
  for(let i=0;i<3;i++){
   const tw=i?Math.max(1,Math.floor(w/2)):w,th=i?Math.max(1,Math.floor(h/2)):h;
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,tw,th,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);let depth=null;
   if(!i){depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,tw,th);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);}
   this.targets.push({texture,fbo,depth,w:tw,h:th});
  }
  this.bloomAvailable=this.targets.every(t=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;});gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 screen(program,target,source){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.w||this.canvas.width,target?.h||this.canvas.height);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
  for(const a of this.attributes)gl.disableVertexAttribArray(a);const point=gl.getAttribLocation(program,"point");gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(program,"source"),0);
 }
 project(x,y,z){const p=[x,y,z,1],m=this.matrix;if(!m)return null;const out=[0,0,0,0];for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[row]+=m[k*4+row]*p[k];if(out[3]<=0)return null;return{x:(out[0]/out[3]*.5+.5)*this.canvas.clientWidth,y:(-.5*out[1]/out[3]+.5)*this.canvas.clientHeight};}
 draw(){
  if(this.failed)return;const canvas=this.canvas;if(!canvas.clientWidth||!canvas.clientHeight)return;
  const gl=this.gl,dpr=Math.min(Math.max(window.devicePixelRatio||1,canvas.clientWidth>600?1.5:1.25),2),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}this.targetsFor(w,h);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.bloomAvailable?this.targets[0].fbo:null);gl.viewport(0,0,w,h);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i===3?1:3,gl.FLOAT,false,40,i*12);}
  const t=this.target,r=this.distance,eye=[t[0]+r*Math.sin(this.yaw)*Math.cos(this.pitch),t[1]+r*Math.sin(this.pitch),t[2]+r*Math.cos(this.yaw)*Math.cos(this.pitch)];
  gl.uniform1f(gl.getUniformLocation(this.program,'interior'),this.kind==='city'?0:1);
  gl.uniform3fv(gl.getUniformLocation(this.program,'roomAccent'),new Float32Array(hex(this.theme?.accent||'#d9b174')));
  const contacts=Array.from({length:6},(_,i)=>this.kind==='office'&&this.crew?.[i]?[this.crew[i].x,0,this.crew[i].z+1]:this.kind==='council'?[Math.sin(i*Math.PI/3)*3.8,0,Math.cos(i*Math.PI/3)*3.8]:[1000,0,1000]);
  gl.uniform3fv(gl.getUniformLocation(this.program,'contact[0]'),new Float32Array(contacts.flat()));
  this.eye=eye;gl.uniform3fv(gl.getUniformLocation(this.program,"eyePosition"),new Float32Array(eye));this.matrix=cameraMatrix(eye,t,w/h);gl.uniformMatrix4fv(this.camera,false,new Float32Array(this.matrix));gl.uniform1f(this.pulse,byId("world").dataset.motion==="on"&&!document.hidden?.035+.035*Math.sin(performance.now()/900):0);
  gl.clearColor(.012,.018,.04,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);this.drawRoomEffects();this.drawDisplays();
  if(this.bloomAvailable){
   gl.disable(gl.DEPTH_TEST);const [scene,a,b]=this.targets;
   this.screen(this.blur,a,scene);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),3/scene.w,0);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),1);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.blur,b,a);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),0,3/a.h);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),0);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.composite,null,scene);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(this.composite,"halo"),1);gl.uniform1f(gl.getUniformLocation(this.composite,"city"),this.kind==="city"?1:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.activeTexture(gl.TEXTURE0);
  }
  canvas.dataset.ready="true";canvas.dataset.bloom=String(this.bloomAvailable);if(this.kind==="city")placeLabels();
  if(this.kind==="office"){const buttons=Array.from(byId("office-screen-labels")?.children||[]);buttons.forEach((button,i)=>{button.hidden=false;button.style.left=canvas.clientWidth*(i+1)/4+"px";button.style.top=canvas.clientHeight-14+"px";});}
  if(this.kind==="office"&&this.crew)window.LaylowTeamOffices.labels(this);
  if(this.kind==="council"){
   const occupied=[],buttons=Array.from(byId("council-seat-labels")?.children||[]).sort((a,b)=>Number(b.getAttribute("aria-pressed")==="true")-Number(a.getAttribute("aria-pressed")==="true"));
   for(const button of buttons){const a=Number(button.dataset.councilSeat)*Math.PI/3,p=this.project(Math.sin(a)*3.8,2.8,Math.cos(a)*3.8);button.hidden=!p||p.x<10||p.x>canvas.clientWidth-10||p.y<45||p.y>canvas.clientHeight-35;if(button.hidden)continue;
    const w=button.offsetWidth,h=button.offsetHeight,choices=[[0,0],[-w*.6,0],[w*.6,0],[0,-h-8],[-w*.6,-h-8],[w*.6,-h-8],[0,-h*2-16]];let chosen=null;
    for(const [dx,dy]of choices){const x=Math.max(w/2+7,Math.min(canvas.clientWidth-w/2-7,p.x+dx)),y=Math.max(h+85,Math.min(canvas.clientHeight-50,p.y+dy)),r={l:x-w/2-3,r:x+w/2+3,t:y-h-3,b:y+3};if(!occupied.some(o=>r.l<o.r&&r.r>o.l&&r.t<o.b&&r.b>o.t)){chosen={x,y,r};break;}}
    if(!chosen)chosen={x:Math.max(w/2+7,Math.min(canvas.clientWidth-w/2-7,p.x)),y:p.y,r:{l:0,r:0,t:0,b:0}};button.style.left=chosen.x+"px";button.style.top=chosen.y+"px";occupied.push(chosen.r);
   }
  }
 }
 // Ray-box intersection follows the actual camera and chooses the nearest tower.
 hitBuilding(clientX,clientY){
  if(this.kind!=="city"||!this.eye||!this.buildings)return null;
  const rect=this.canvas.getBoundingClientRect();
  if(!rect.width||!rect.height||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
  const aspect=rect.width/rect.height,q=1/Math.tan(Math.PI/8)*Math.min(1,aspect/1.3);
  const forward=norm(this.target.map((v,i)=>v-this.eye[i])),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
  const nx=(clientX-rect.left)/rect.width*2-1,ny=1-(clientY-rect.top)/rect.height*2;
  const ray=norm(forward.map((v,i)=>v+right[i]*nx*aspect/q+up[i]*ny/q));
  let chosen=null,nearest=Infinity;
  for(const building of this.buildings){
   let near=0,far=Infinity;
   for(let axis=0;axis<3;axis++){
    if(Math.abs(ray[axis])<1e-8){if(this.eye[axis]<building.min[axis]||this.eye[axis]>building.max[axis]){far=-1;break;}continue;}
    const a=(building.min[axis]-this.eye[axis])/ray[axis],b=(building.max[axis]-this.eye[axis])/ray[axis];
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
   }
   if(far>=near&&near<nearest){chosen=building.name;nearest=near;}
  }
  return chosen;
 }
 installCamera(){
  let drag=null,moved=false,start=null;
  this.canvas.addEventListener("pointerdown",event=>{if(event.button!==0||!event.isPrimary)return;drag={x:event.clientX,y:event.clientY};start={...drag};moved=false;this.canvas.setPointerCapture(event.pointerId);});
  this.canvas.addEventListener("pointermove",event=>{
   if(!drag){if(this.kind==="city"){const name=this.hitBuilding(event.clientX,event.clientY);this.canvas.style.cursor=name?"pointer":"grab";this.canvas.title=name?"Open "+name:"Drag to explore · click a building to enter";}return;}
   const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)moved=true;
   this.yaw+=dx*.006;this.pitch=Math.max(.12,Math.min(1.3,this.pitch+dy*.004));drag={x:event.clientX,y:event.clientY};this.canvas.style.cursor="grabbing";this.draw();
  });
  this.canvas.addEventListener("pointerup",event=>{
   if(!drag)return;drag=null;this.canvas.style.cursor="grab";
   if(this.kind==="city"&&!moved&&event.button===0){const name=this.hitBuilding(event.clientX,event.clientY);if(name)bridge.open(name);}
  });
  this.canvas.addEventListener("pointercancel",()=>{drag=null;moved=true;this.canvas.style.cursor="grab";});
  this.canvas.addEventListener("keydown",event=>{if(this.kind==="city"&&(event.key==="Enter"||event.key===" ")){event.preventDefault();bridge.open(bridge.selected());}});
  this.canvas.addEventListener("wheel",event=>{if(!event.ctrlKey)return;event.preventDefault();this.distance=Math.max(this.kind==="city"?24:5,Math.min(this.kind==="city"?80:14,this.distance+event.deltaY*.03));this.draw();},{passive:false});
  this.canvas.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","-"].includes(event.key))return;event.preventDefault();if(event.key==="ArrowLeft")this.yaw-=.12;if(event.key==="ArrowRight")this.yaw+=.12;if(event.key==="ArrowUp")this.pitch=Math.min(1.3,this.pitch+.08);if(event.key==="ArrowDown")this.pitch=Math.max(.12,this.pitch-.08);if(event.key==="+")this.distance=Math.max(this.kind==="city"?24:5,this.distance-3);if(event.key==="-")this.distance=Math.min(this.kind==="city"?80:20,this.distance+3);this.draw();});
 }
}
let city=null,office=null,councilScene=null,councilKey="",snapshot=null,online=false;
const labels=new Map();
function placeLabels(){
 if(!city)return;
 const width=city.canvas.clientWidth,height=city.canvas.clientHeight,occupied=[];
 const items=city.labels.slice().sort((a,b)=>Number(b.name===bridge.selected())-Number(a.name===bridge.selected()) || Number(!!b.special)-Number(!!a.special));
 const candidates=[[0,0],[-70,0],[70,0],[0,-45],[0,45],[-70,-45],[70,-45],[-70,45],[70,45],[-140,0],[140,0],[0,-90],[0,90]];
 const overview=document.querySelector(".city-overview"),canvasRect=city.canvas.getBoundingClientRect();
 if(width>600&&overview){const b=overview.getBoundingClientRect();if(b.bottom>canvasRect.top&&b.top<canvasRect.bottom)occupied.push({l:b.left-canvasRect.left-8,r:b.right-canvasRect.left+8,t:b.top-canvasRect.top-8,b:b.bottom-canvasRect.top+8});}
 for(const item of items){
  const node=labels.get(item.name),p=city.project(item.x,item.y,item.z);if(!node)continue;
  if(!p||p.x<20||p.x>width-20||p.y<20||p.y>height-20){node.hidden=true;continue;}
  node.hidden=false;const boxW=node.offsetWidth||90,boxH=node.offsetHeight||36;
  let chosen=null;
  for(const [dx,dy] of candidates){
   const x=Math.max(boxW/2+8,Math.min(width-boxW/2-8,p.x+dx)),y=Math.max(boxH+12,Math.min(height-15,p.y+dy));
   const rect={l:x-boxW/2-5,r:x+boxW/2+5,t:y-boxH-5,b:y+5};
   if(!occupied.some(b=>rect.l<b.r&&rect.r>b.l&&rect.t<b.b&&rect.b>b.t)){chosen={x,y,rect};break;}
  }
  if(!chosen){node.hidden=true;continue;}
  node.style.left=chosen.x+"px";node.style.top=chosen.y+"px";occupied.push(chosen.rect);
 }
}
function start(){
 try{
  city=new Scene(byId("city-3d"),"city");
  for(const row of bridge.districts){
   const button=document.createElement("button");button.type="button";button.className="world-3d-label";button.dataset.team=row.name;
   button.style.setProperty("--district-color",row.color);
   const name=document.createElement("strong");name.textContent=row.name;const state=document.createElement("span");state.textContent="Not observed";
   const net=document.createElement("span");net.className="world-3d-net";net.textContent="Net not recorded";button.append(name,state,net);button.addEventListener("click",()=>{bridge.select(row.name,false);bridge.enter(row.name);});byId("city-3d-labels").append(button);labels.set(row.name,button);
  }
  for(const [name,label] of[["THE VAULT","Recorded activity"],["BIG MANAGER","Team reports"]]){
   const node=document.createElement(name==="THE VAULT"?"button":"div");node.className="world-3d-label city-hq-label";node.textContent=name+" · "+label;if(name==="THE VAULT"){node.type="button";node.addEventListener("click",()=>bridge.open(name));node.style.pointerEvents="auto";node.setAttribute("aria-label","Open The Vault results and learning");}byId("city-3d-labels").append(node);labels.set(name,node);
  }
  const councilEntrance=document.createElement("button");councilEntrance.type="button";councilEntrance.className="world-3d-label city-hq-label city-council-label";
  councilEntrance.textContent="THE COUNCIL · Enter chamber";councilEntrance.setAttribute("aria-label","Open The Council chamber");
  councilEntrance.addEventListener("click",()=>bridge.open("THE COUNCIL"));byId("city-3d-labels").append(councilEntrance);labels.set("THE COUNCIL",councilEntrance);
  city.city();byId("world").dataset.view="3d";byId("city-view").textContent="Use city map";
  byId("city-render-note").textContent="Background line uses selected team's recorded closes · drag to orbit · arrow keys rotate · click a building to open its office";
 }catch(error){byId("world").dataset.view="map";byId("city-view").disabled=true;byId("city-render-note").textContent="3D rendering unavailable on this device. The interactive city map remains available.";}
 byId("city-view").addEventListener("click",()=>{const three=byId("world").dataset.view!=="3d";byId("world").dataset.view=three?"3d":"map";byId("city-view").textContent=three?"Use city map":"Use 3D city";if(three)city?.draw();});
 byId("city-camera-reset").addEventListener("click",()=>{if(city){city.yaw=.25;city.pitch=.43;city.distance=57;city.target=[0,3,3];city.draw();}});
 for(const [id,delta]of[["city-zoom-in",-4],["city-zoom-out",4]])byId(id).addEventListener("click",()=>{if(city){city.distance=Math.max(24,Math.min(80,city.distance+delta));city.draw();}});
}
window.Laylow3D={
 council(members,bars=[],review=null){try{if(!councilScene)councilScene=new Scene(byId("council-3d"),"council");const key=JSON.stringify(members.map(m=>m.color));if(key!==councilKey){councilKey=key;councilScene.councilRoom(members);}councilScene.councilData(members,bars,review);councilScene.trainingDisplay(window.LaylowTraining?.snapshot());byId("council-render-note").textContent="Drag to orbit · select a member to inspect their opinion · green support, amber wait, red veto.";}catch(error){byId("council-render-note").textContent="3D chamber unavailable; opinions and decisions remain accessible below.";}},
 roomCamera(kind,view){const scene=kind==="council"?councilScene:office;if(!scene)return;
  if(kind==='office'&&office){if(view==='wall'){office.yaw=0;office.pitch=.08;office.distance=office.canvas.clientWidth<650?14.5:12;office.target=[0,3.3,-6.2];office.canvas.dataset.camera=view;office.draw();return;}if(view==='wide'){office.yaw=.2;office.pitch=.48;office.distance=17;office.target=[0,1.3,-.3];office.canvas.dataset.camera=view;office.draw();return;}if(view==='desk'||view==='screens'){window.LaylowTeamOffices.focus(office,byId('office-worker').value,view);return;}}
  const presets=kind==="council"?{wide:[.25,.38,13.5,[0,1.6,0]],table:[.15,.74,10.5,[0,1,0]],wall:[0,.12,10.4,[0,2.5,-2.5]]}:{wide:[.3,.28,9,[0,1.6,-.25]],desk:[-.48,.17,5.8,[0,1.7,.25]],screens:[0,.12,4.2,[0,2,-.6]]};
  if(view==="closer"||view==="further")scene.distance=Math.max(4,Math.min(18,scene.distance+(view==="closer"?-1:1)));
  else {const p=presets[view];if(!p)return;[scene.yaw,scene.pitch,scene.distance,scene.target]=p;}
  scene.canvas.dataset.camera=view;scene.draw();
 },
 resetCouncil(){if(councilScene){councilScene.yaw=.25;councilScene.pitch=.38;councilScene.distance=13.5;councilScene.target=[0,1.6,0];councilScene.draw();}},
 focusCouncilSeat(index){if(councilScene&&Number.isInteger(index)&&index>=0&&index<6){const a=index*Math.PI/3;councilScene.yaw=a+.18;councilScene.pitch=.26;councilScene.distance=9.5;councilScene.target=[Math.sin(a)*1.5,1.6,Math.cos(a)*1.5];councilScene.draw();}},

 update(data,connected){snapshot=data;online=connected;for(const [name,node]of labels){if(node.tagName!=="BUTTON"||!node.dataset.team)continue;const team=data.teams?.find(row=>row.name===name)||{};
  node.children[1].textContent=connected?team.controls?.profit_brake?.status==="PROFIT_BRAKE_HIT"?"PROFIT BRAKE HIT":team.health==="fresh"?team.worker_state:"Not recently observed":"Last snapshot";
  const worker=data.payroll?.workers?.find(row=>row.team_name===name),amount=worker?.net_cents;
  node.lastChild.textContent=Number.isFinite(amount)?(amount>=0?"+":"−")+"$"+(Math.abs(amount)/100).toFixed(2)+" net today":"Net not recorded";
  node.lastChild.style.color=amount>0?"#65efc1":amount<0?"#ff718b":"#b8c5da";
  node.dataset.selected=String(bridge.selected()===name);
 }
 const total=data.payroll?.total_net_cents;
 if(labels.has("THE VAULT"))labels.get("THE VAULT").textContent=data.practice?"THE VAULT · Fake equity $"+(data.account.equity_cents/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):Number.isFinite(total)?"THE VAULT · "+(total>=0?"+":"−")+"$"+(Math.abs(total)/100).toFixed(2)+" net today":"THE VAULT · Net not recorded";
 const analysis=data.teams?.find(row=>row.name===bridge.selected())?.analysis||{};
 city?.marketBackdrop(Array.isArray(analysis.bars)?analysis.bars:[],bridge.selected()+"/"+(analysis.bar_time||"empty"));
 if(office&&byId("office-dialog").open){const analysis=data.teams?.find(row=>row.name===office.symbol)?.analysis||{};office.officeBars(Array.isArray(analysis.bars)?analysis.bars:[]);}},
 enter(name){try{if(!office)office=new Scene(byId("office-3d"),"office");office.office(name);office.trainingDisplay(window.LaylowTraining?.snapshot());office.officeBars(snapshot?.teams?.find(row=>row.name===name)?.analysis?.bars||[]);byId("office-theme-name").textContent=office.theme.name;byId("office-layout-note").textContent=office.crew.length+" teammates in one room · individual desks, shared research and team ledger";byId("office-dialog").style.setProperty("--office-accent",office.theme.accent);byId("office-render-note").textContent="Click Trade wall for the room-sized chart and ledger · select a robot to inspect its desk · drag to explore";}catch(error){byId("office-render-note").textContent="3D office unavailable; recorded workstation panels remain available.";}},
 training(data){this.trainingSnapshot=data;office?.trainingDisplay(data);councilScene?.trainingDisplay(data);},
 roomEffects(kind,on){const scene=kind==='council'?councilScene:office;if(scene){scene.effects=on;scene.draw();scheduleRoomEffects();}},
 focusOfficeWorker(name){if(office&&office.crew)window.LaylowTeamOffices.focus(office,name);},
 officeSelection(){office?.draw();},
 select(){this.update(snapshot||{},online);}
};
let ambientFrame=null,ambientLast=0;
function scheduleAmbient(){
 if(ambientFrame!==null){cancelAnimationFrame(ambientFrame);ambientFrame=null;}
 if(!city||document.hidden||byId("world").dataset.motion!=="on"){city?.draw();return;}
 const frame=stamp=>{if(document.hidden||byId("world").dataset.motion!=="on"){ambientFrame=null;return;}
  if(stamp-ambientLast>50){ambientLast=stamp;city.draw();if(office&&byId("office-dialog").open)office.draw();}
  ambientFrame=requestAnimationFrame(frame);
 };
 ambientFrame=requestAnimationFrame(frame);
}
new MutationObserver(scheduleAmbient).observe(byId("world"),{attributes:true,attributeFilter:["data-motion"]});
document.addEventListener("visibilitychange",scheduleAmbient);
for(const button of document.querySelectorAll("[data-room-camera]"))button.addEventListener("click",()=>window.Laylow3D.roomCamera(button.dataset.room,button.dataset.roomCamera));
for(const button of document.querySelectorAll("[data-office-terminal]"))button.addEventListener("click",()=>{const panel=byId("office-"+button.dataset.officeTerminal+"-panel");if(!panel)return;panel.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});panel.focus({preventScroll:true});});
let roomFrame=null,roomLast=0;
function scheduleRoomEffects(){
 if(roomFrame!==null){cancelAnimationFrame(roomFrame);roomFrame=null;}
 if(document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const frame=stamp=>{roomFrame=null;if(document.hidden)return;let active=false;
  for(const [scene,id]of [[office,'office-dialog'],[councilScene,'council-room']])if(scene?.effects&&byId(id).open){active=true;if(stamp-roomLast>65)scene.draw();}
  if(stamp-roomLast>65)roomLast=stamp;if(active)roomFrame=requestAnimationFrame(frame);
 };roomFrame=requestAnimationFrame(frame);
}
for(const id of ['office-dialog','council-room'])new MutationObserver(scheduleRoomEffects).observe(byId(id),{attributes:true,attributeFilter:['open']});
document.addEventListener('visibilitychange',scheduleRoomEffects);
start();window.Laylow3D.update(bridge.snapshot()||{},bridge.connected());
})();
