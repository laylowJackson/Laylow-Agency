/* Local WebGL geometry and bloom. No remote assets or fabricated trading activity. */
(()=>{
"use strict";
const byId=id=>document.getElementById(id),bridge=window.LaylowWorld;
if(!bridge)return;
let graphicsQuality='balanced';try{const saved=localStorage.getItem('laylow-graphics-quality');if(['eco','balanced','high'].includes(saved))graphicsQuality=saved;}catch{}
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
function lightMatrix(){
 const eye=[-10,18,8],target=[0,0,0],z=norm(eye.map((v,i)=>v-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);
 const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
 return multiply([1/15,0,0,0,0,1/15,0,0,0,0,-2/54,0,0,0,-56/54,1],view);
}
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
  this.program=program(`attribute vec3 position,color,normal;attribute float emission;uniform mat4 camera,lightCamera,reflectionCamera;varying vec4 shadowCoord,reflectionCoord;varying vec3 tint,n,world;varying float glow,depth;void main(){gl_Position=camera*vec4(position,1.0);world=position;shadowCoord=lightCamera*vec4(position,1.);reflectionCoord=reflectionCamera*vec4(position.x,0.,position.z,1.);tint=color;n=normal;glow=emission;depth=gl_Position.w;}`,`precision highp float;varying vec4 shadowCoord,reflectionCoord;varying vec3 tint,n,world;varying float glow,depth;uniform float ambientPulse;uniform vec3 eyePosition,roomAccent;uniform float interior,woodFloor;uniform vec3 contact[6];uniform sampler2D shadowMap,reflectionMap;uniform float shadows,reflectionPass,reflectionReady;uniform vec3 practicalPosition[4],practicalColor[4];
 vec3 practical(vec3 N,vec3 V){vec3 c=vec3(0.);for(int i=0;i<4;i++){vec3 delta=practicalPosition[i]-world;float distanceSquared=dot(delta,delta);vec3 L=normalize(delta);float diffuse=max(dot(N,L),0.);float spec=pow(max(dot(N,normalize(L+V)),0.),48.);c+=practicalColor[i]*(tint*diffuse+vec3(spec*.13))/(1.+distanceSquared*.20);}return c;}
 float shadowDepth(vec2 p){vec4 v=texture2D(shadowMap,p);return dot(v,vec4(1.,1./255.,1./65025.,1./16581375.));}
 float visibility(vec3 N){
  if(shadows<.5)return 1.;vec3 p=shadowCoord.xyz/shadowCoord.w*.5+.5;
  if(p.x<0.||p.y<0.||p.x>1.||p.y>1.||p.z<0.||p.z>1.)return 1.;
  float bias=max(.0012,.0024*(1.-max(dot(N,normalize(vec3(-10.,18.,8.))),0.))),v=0.;
  for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)v+=step(p.z-bias,shadowDepth(p.xy+vec2(float(i),float(j))/768.));
  return .38+.62*v/9.;
 }
 void main(){if(reflectionPass>.5&&world.y<.08)discard;vec3 N=normalize(n);float light=.32+.63*max(dot(N,normalize(vec3(-.5,1.,.6))),0.)+.24*max(dot(N,normalize(vec3(.8,.2,-1.))),0.);vec3 V=normalize(eyePosition-world);float rim=pow(1.-max(dot(N,V),0.),3.);float shine=pow(max(dot(reflect(-normalize(vec3(-.5,1.,.6)),N),V),0.),36.);vec3 lit=tint*mix(light,1.2+ambientPulse,glow)+vec3(.1,.24,.32)*rim*(1.-glow)+vec3(.23,.26,.3)*shine*(1.-glow);if(interior<.5){
 // View-dependent satin highlights and a low-frequency water normal, no extra draw pass.
 float fresnel=.04+.30*pow(1.-max(dot(N,V),0.),5.);
 lit+=vec3(.12,.19,.29)*fresnel*(1.-glow);
 if(world.y<-.95&&N.y>.9){vec3 waterN=normalize(vec3(sin(world.x*.85+world.z*.27)*.09,1.,cos(world.z*.75-world.x*.21)*.09));float glint=pow(max(dot(reflect(-normalize(vec3(.5,.8,-.6)),waterN),V),0.),90.);lit=tint*.68+vec3(.32,.48,.70)*glint+vec3(.08,.14,.23)*pow(1.-max(dot(waterN,V),0.),4.);}
 }if(interior>.5){
 vec3 warm=vec3(1.,.83,.66),cool=vec3(.55,.77,1.);
 float key=max(dot(N,normalize(vec3(-.6,1.,.45))),0.);
 float fill=max(dot(N,normalize(vec3(.7,.45,-.4))),0.);
 float direct=visibility(N);
 vec3 material=tint*(vec3(.20,.23,.28)+warm*key*.62*direct+cool*fill*.22);
 // Satin panels catch soft highlights, while the side bays wash the room in blue.
 float windowLight=exp(-abs(abs(world.x)-7.8)*.58)*max(0.,N.y)*.14;
 material+=tint*cool*windowLight;
 material+=practical(N,V)*.85;
 float satin=pow(max(dot(N,normalize(normalize(vec3(-.6,1.,.45))+V)),0.),26.);
 material+=vec3(.13,.17,.22)*satin*direct*(.35+.65*pow(1.-max(dot(N,V),0.),3.));
 // Subtle brushed alloy and stone grain, stable when the camera moves.
 float surfaceDetail=sin(world.x*73.+world.y*57.)*sin(world.z*61.+world.y*13.);
 material*=1.+surfaceDetail*.009;
 if(N.y>.92&&world.y<.065&&reflectionReady>.5){
  vec2 uv=reflectionCoord.xy/reflectionCoord.w*.5+.5;
  if(uv.x>0.&&uv.y>0.&&uv.x<1.&&uv.y<1.){
   vec4 reflection=texture2D(reflectionMap,uv)*.40;
   reflection+=texture2D(reflectionMap,uv+vec2(.002,0.))*.15;
   reflection+=texture2D(reflectionMap,uv-vec2(.002,0.))*.15;
   reflection+=texture2D(reflectionMap,uv+vec2(0.,.002))*.15;
   reflection+=texture2D(reflectionMap,uv-vec2(0.,.002))*.15;
   float fresnel=.08+.18*pow(1.-max(dot(N,V),0.),3.);
   material=mix(material,reflection.rgb,fresnel*reflection.a);
  }
 }
 // Stable world-space material detail: oak planks or fine acoustic floor texture.
 if(N.y>.9&&world.y<.065){
  float grain=sin(world.x*26.+sin(world.z*3.2)*1.8)*.017+sin(world.x*81.+world.z*.6)*.008;
  float plank=step(.974,fract(world.x*1.4));float joint=step(.991,fract(world.z*.36+floor(world.x*1.4)*.37));
  material*=woodFloor>.5?1.+grain-(plank+joint)*.16:1.+sin(world.x*115.)*sin(world.z*115.)*.018;
 }
 float pool=exp(-length(world.xz-vec2(-5.,-2.))*.3);
 material+=tint*roomAccent*pool*.17;
 float shade=1.;
 for(int i=0;i<6;i++){float d=length(world.xz-contact[i].xz);shade*=1.-.30*exp(-d*d/1.1)*step(world.y,.22);}
 lit=(material*shade+cool*rim*.055+warm*shine*.13*direct)*(1.-glow)+tint*(1.03+ambientPulse)*glow;
 }float fog=clamp((depth-36.)/110.,0.,.66);gl_FragColor=vec4(mix(lit,vec3(.035,.047,.105),fog),1.);}`);
  this.lightCamera=lightMatrix();
  // Shadow rendering is optional: incomplete framebuffers keep the lit fallback usable.
  try{
   this.shadowProgram=program(`attribute vec3 position;uniform mat4 lightCamera;void main(){gl_Position=lightCamera*vec4(position,1.);}`,`precision highp float;void main(){vec4 v=fract(gl_FragCoord.z*vec4(1.,255.,65025.,16581375.));v-=v.yzww*vec4(1./255.,1./255.,1./255.,0.);gl_FragColor=v;}`);
   this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,768,768,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   this.shadowFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.shadowTexture,0);
   this.shadowDepthBuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.shadowDepthBuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,768,768);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.shadowDepthBuffer);
   this.shadowsAvailable=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }catch(e){this.shadowsAvailable=false;}
  this.buffer=gl.createBuffer();this.attributes=["position","color","normal","emission"].map(n=>gl.getAttribLocation(this.program,n));this.camera=gl.getUniformLocation(this.program,"camera");this.pulse=gl.getUniformLocation(this.program,"ambientPulse");
  this.displayProgram=program(`attribute vec3 position;attribute vec2 uv;uniform mat4 camera;varying vec2 tex;void main(){tex=uv;gl_Position=camera*vec4(position,1.);}`,`precision mediump float;varying vec2 tex;uniform sampler2D display;void main(){gl_FragColor=texture2D(display,tex);}`);
  this.displayBuffer=gl.createBuffer();this.displays=new Map();
  const screenVertex=`attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}`;
  this.blur=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source;uniform vec2 direction;uniform float extract;vec3 tap(vec2 p){vec3 c=texture2D(source,p).rgb;return mix(c,c*smoothstep(.48,.95,max(c.r,max(c.g,c.b))),extract);}void main(){vec3 c=tap(uv)*.227027;c+=(tap(uv+direction*1.384615)+tap(uv-direction*1.384615))*.316216;c+=(tap(uv+direction*3.230769)+tap(uv-direction*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`);
  this.composite=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source,halo;uniform float city;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec4 scene=texture2D(source,uv);vec3 sky=mix(vec3(.065,.072,.17),vec3(.013,.012,.045),smoothstep(.12,1.,uv.y));float cloud=sin(uv.x*7.+uv.y*9.)*sin(uv.x*13.-uv.y*6.);sky+=vec3(.028,.015,.059)*cloud;vec2 cell=floor(uv*vec2(760.,440.));float star=step(.9994,hash(cell))*pow(max(0.,uv.y-.38),1.5);sky+=star*.7*city;vec2 moon=(uv-vec2(.84,.85))*vec2(1.35,1.);float d=length(moon);sky+=vec3(.10,.14,.22)*exp(-d*16.)*city;sky+=vec3(.6,.7,.9)*(1.-smoothstep(.021,.024,d))*city;vec3 c=mix(sky,scene.rgb,scene.a)+texture2D(halo,uv).rgb*mix(.16,.58,city);
 if(city<.5){c*=1.08;c=mix(c,pow(max(c,vec3(0.)),vec3(.91)),.35);c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,1.08);}
 // Gentle highlight compression keeps luminous signs readable instead of white clipping.
 c=max(c,vec3(0.));c=c/(vec3(1.)+c*.20);c=pow(c,vec3(.94));
 c*=1.-.10*pow(length((uv-.5)*1.2),2.);gl_FragColor=vec4(c,1.);}`);
  this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);this.targets=[];
  this.yaw=kind==="council"?-.30:.25;this.pitch=kind==="city"?.43:kind==="council"?.55:.28;this.distance=kind==="city"?57:kind==="council"?19.5:9;this.target=kind==="city"?[0,3,3]:[0,1.6,0];this.data=[];this.labels=[];
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
  // Narrow architectural signs need their own texture aspect, not a squashed monitor.
  if(w/h>5){canvas.height=96;ctx.fillStyle="#071521";ctx.fillRect(0,0,768,96);ctx.fillStyle=accent;ctx.font="700 33px system-ui";ctx.textAlign="center";ctx.fillText(title,384,42,720);ctx.font="18px system-ui";ctx.fillStyle="#b8d5e4";ctx.fillText(String(lines[0]||""),384,77,720);}
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
  const latitudes=this.kind==="city"?6:10,longitudes=this.kind==="city"?10:16;
  for(let a=0;a<latitudes;a++)for(let b=0;b<longitudes;b++){
   const lat=-Math.PI/2+a*Math.PI/latitudes,lon=b*Math.PI*2/longitudes,aa=Math.PI/latitudes,bb=Math.PI*2/longitudes;
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
 // Architecturally useful round struts, not meshes loaded from a remote CDN.
 rod(a,b,r,color,emission=0){
  const start=this.data.length,d=b.map((v,i)=>v-a[i]),h=Math.hypot(...d),Y=norm(d),X=norm(cross(Math.abs(Y[1])>.95?[1,0,0]:[0,1,0],Y)),Z=cross(X,Y);
  this.cylinder(0,0,0,r,h,color,r,emission,12);
  for(let i=start;i<this.data.length;i+=10){const v=this.data.slice(i,i+3),n=this.data.slice(i+6,i+9);for(let j=0;j<3;j++){this.data[i+j]=a[j]+v[0]*X[j]+v[1]*Y[j]+v[2]*Z[j];this.data[i+6+j]=n[0]*X[j]+n[1]*Y[j]+n[2]*Z[j];}}
 }
 skylineWindow(id,x,y,z,w,h,angle,accent){
  this.display(id,x,y,z,w,h,'CITY SKYLINE',[],[],accent);const item=this.displays.get(id);
  const c=Math.cos(angle),ss=Math.sin(angle);for(let i=0;i<item.geometry.length;i+=5){const xx=item.geometry[i]-x,zz=item.geometry[i+2]-z;item.geometry[i]=x+xx*c+zz*ss;item.geometry[i+2]=z-xx*ss+zz*c;}
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=640;const ctx=canvas.getContext('2d');
  const sky=ctx.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#101a42');sky.addColorStop(.6,'#485289');sky.addColorStop(.8,'#be818e');sky.addColorStop(1,'#304569');ctx.fillStyle=sky;ctx.fillRect(0,0,1024,640);
  const haze=ctx.createRadialGradient(730,335,5,730,335,470);haze.addColorStop(0,accent+'55');haze.addColorStop(1,accent+'00');ctx.fillStyle=haze;ctx.fillRect(0,0,1024,640);
  for(let i=0;i<65;i++){ctx.fillStyle='#cbdcfc';ctx.globalAlpha=.22+(i%4)*.12;ctx.fillRect((i*173+53)%1024,(i*37+17)%310,1.6,1.6);}ctx.globalAlpha=1;
  ctx.fillStyle='#ffeace';ctx.beginPath();ctx.arc(756,110,24,0,Math.PI*2);ctx.fill();
  for(let layer=0;layer<3;layer++)for(let i=0;i<26;i++){
   const bw=20+(i*17%29),bx=i*43-24+layer*12,bh=80+(i*83+layer*29)%250,base=520+layer*36;
   ctx.fillStyle=['#4a527a','#2a375a','#122a43'][layer];ctx.fillRect(bx,base-bh,bw,bh);ctx.fillRect(bx+bw*.46,base-bh-14,2,14);
   for(let row=0;row<Math.floor(bh/12)-1;row++)for(let col=0;col<Math.floor(bw/8)-1;col++){if((row*17+col*11+i*7)%5<2)continue;ctx.fillStyle=(row+col+i)%3?'#e5c8a0':accent;ctx.globalAlpha=.28+layer*.13;ctx.fillRect(bx+4+col*8,base-bh+7+row*12,3,4);}ctx.globalAlpha=1;
  }
  ctx.fillStyle='#345a74';ctx.fillRect(0,595,1024,45);for(let i=0;i<80;i++){ctx.fillStyle=i%3?accent+'55':'#ffd9a655';ctx.fillRect((i*137)%1024,602+i%6*5,8+i%6*4,1);}
  // Skyline is scenery, not a fabricated market feed.
  const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
 }
 renderShadows(){
  if(graphicsQuality==='eco'||this.kind==='city'||!this.shadowsAvailable||!this.shadowDirty)return;
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFbo);gl.viewport(0,0,768,768);gl.enable(gl.DEPTH_TEST);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++)gl.disableVertexAttribArray(i);gl.useProgram(this.shadowProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  const p=gl.getAttribLocation(this.shadowProgram,'position');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,40,0);gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProgram,'lightCamera'),false,new Float32Array(this.lightCamera));gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);gl.disableVertexAttribArray(p);this.shadowDirty=false;
 }
 robot(x,y,z,color,scale=1,seated=false,angle=0,headTurn=0){
  const start=this.data.length,b=(xx,yy,zz,w,h,d,c,e=0)=>this.roundedBox(x+xx*scale,y+yy*scale,z+zz*scale,w*scale,h*scale,d*scale,c,.06*scale,e),
   ball=(xx,yy,zz,rx,ry,rz,c,e=0)=>this.ellipsoid(x+xx*scale,y+yy*scale,z+zz*scale,rx*scale,ry*scale,rz*scale,c,e);
  // Soft toy-like armor and articulated hands; each crew member keeps its own color.
  for(const side of[-1,1]){ball(side*.19,.13,seated?.33:.06,.14,.15,.22,'#dae7ed');b(side*.19,.10,seated?.51:.24,.21,.035,.035,color,.3);ball(side*.38,.62,0,.13,.13,.13,'#bfd0dd');ball(side*.44,.44,.12,.095,.13,.095,color);ball(side*.40,.32,.27,.11,.08,.12,'#dae7ed');}
  ball(0,.50,0,.32,.33,.26,color);ball(0,.51,.24,.21,.22,.06,'#dbe8ef');b(0,.49,.30,.16,.055,.035,'#172535');b(0,.51,.324,.10,.018,.013,color,.7);
  this.cylinder(x,y+.77*scale,z,.09*scale,.13*scale,'#69819a');
  for(const side of[-1,1]){ball(side*.32,.62,.05,.07,.075,.07,'#253950');ball(side*.43,.37,.22,.07,.055,.07,'#758f9f');b(side*.40,.35,.31,.16,.02,.08,color,.18);}
  b(0,.69,.25,.19,.026,.025,'#d1e5eb');for(let i=0;i<3;i++)b(-.05+i*.05,.70,.28,.012,.018,.008,color,.6);
  // Layered ceramic armor, inset chest glass and machined joint caps.
  b(0,.56,.303,.20,.09,.035,'#10243b');b(0,.59,.329,.14,.014,.012,color,.55);
  for(const side of[-1,1]){b(side*.24,.59,.21,.025,.15,.027,'#a9c5d9');ball(side*.40,.33,.28,.065,.065,.032,'#1c324a');ball(side*.40,.33,.311,.034,.034,.012,color,.35);}
  const head=this.data.length;
  ball(0,1.19,0,.47,.42,.39,'#dce8ec');ball(0,1.18,.31,.365,.27,.12,'#081a2a');ball(-.11,1.36,.393,.15,.025,.014,'#789cab',.08);
  b(0,1.48,.16,.22,.018,.10,'#b7ccdb');for(const side of[-1,1]){b(side*.275,1.12,.405,.026,.055,.018,'#86b3c9');ball(side*.21,1.32,.41,.085,.018,.006,'#b8e8f4',.12);}
  for(const side of[-1,1]){ball(side*.49,1.20,0,.095,.20,.16,color);ball(side*.53,1.20,.01,.035,.12,.11,'#9ab8c9');ball(side*.14,1.23,.427,.074,.10,.022,color,.75);ball(side*.16,1.26,.443,.018,.025,.008,'#f1fcff',.6);b(side*.145,1.37,.36,.14,.025,.035,color,.35);}
  // A smiling segmented mouth, curved headset band and antenna.
  for(let i=0;i<7;i++){const a=-1.15+i*2.3/6;ball(Math.sin(a)*.105,1.09-Math.cos(a)*.035,.43,.019,.012,.012,color,.6);}
  for(let i=0;i<13;i++){const a=i*Math.PI/12;ball(Math.cos(a)*.49,1.20+Math.sin(a)*.435,-.02,.045,.045,.065,'#3b536b');}
  b(.35,1.01,.26,.035,.035,.28,'#7e9eb3');ball(.34,1.02,.405,.055,.04,.045,color);
  for(const side of[-1,1])for(let i=0;i<3;i++)ball(side*.50,1.12+i*.07,.12,.012,.012,.012,'#d8e9ed');b(0,1.57,0,.028,.19,.028,'#718a9f');ball(0,1.79,0,.065,.065,.065,color,.65);
  const rotate=(from,a)=>{const c=Math.cos(a),s=Math.sin(a);for(let i=from;i<this.data.length;i+=10){const xx=this.data[i]-x,zz=this.data[i+2]-z,nx=this.data[i+6],nz=this.data[i+8];this.data[i]=x+xx*c+zz*s;this.data[i+2]=z-xx*s+zz*c;this.data[i+6]=nx*c+nz*s;this.data[i+8]=-nx*s+nz*c;}};
  if(headTurn)rotate(head,headTurn);if(angle)rotate(start,angle);
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
  // Sculpted waterfront rails, recessed plaza panels and tall boulevard luminaires.
  for(let i=0;i<36;i++){const a=i*Math.PI/18,x=Math.cos(a)*23.2,z=3+Math.sin(a)*23.2;this.box(x,.22,z,.045,.65,.045,'#8496ae');this.sphere(x,.9,z,.065,'#bedfff',.45);}
  for(const x of[-18,18])for(const z of[-12,-6,0,6,12,18]){this.cylinder(x,.18,z,.09,2.1,'#435974',.06);this.roundedBox(x,2.2,z,.65,.10,.30,'#c5d7de',.04);this.box(x,2.17,z,.48,.02,.2,'#d0e8ff',.6);}
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
   for(const side of[-1,1]){this.box(x+side*1.13,.5,z,.12,h*.72,.35,'#59718b');this.box(x+side*1.145,.6,z+.19,.028,h*.69,.025,district.color,.35);}
   this.roundedBox(x,.38,z+1.5,1.75,.09,.8,'#71869a',.12);this.box(x,.48,z+1.78,1.45,.015,.025,district.color,.45);
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
   this.display('academy-wall',5.65,5.62,-6,3.2,.55,'NIGHT SCHOOL',['SYNTHETIC RESEARCH','All teams can keep testing','Separate from account brakes'],[],color);
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
  if(this.kind==='council')this.display('academy-wall',5.65,5.62,-6,3.2,.55,'ACADEMY / RESEARCH',[data.experiments+' EXPERIMENTS',data.scenario,'Synthetic · baseline protected'],[],'#70e2e8');
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
  this.data=[];this.effects=false;this.councilDataKey=null;
  // One deliberate chamber, instead of multiple overlapping interior layers.
  this.roundedBox(0,-.46,0,17,.38,15.8,'#16233a',.48);
  this.roundedBox(0,-.08,0,16.6,.10,15.4,'#9b7a57',.40);
  this.box(0,.02,-6.4,16.6,6.6,.22,'#233045');
  this.roundedBox(0,.035,0,11.6,.025,10.8,'#1d4854',1.1);
  for(const x of[-8.12,8.12]){this.box(x,.035,-1.7,.14,3.8,9,'#243b50');this.box(x,3.83,-1.7,.17,.13,9,'#b39162');this.box(x*.998,.12,-1.7,.025,.055,9,'#9adfda',.45);}
  // Curated library bays, warm sconces, and panoramic city windows.
  for(const x of[-5.75,5.75]){
   this.box(x,1.55,-6.22,4.0,3.85,.07,'#0c253e');
   for(let j=0;j<12;j++){const bx=x-1.75+j*.31,h=.55+(j*7%8)*.29;this.box(bx,1.55,-6.15,.22,h,.04,'#243f5b');for(let r=0;r<6;r++)this.box(bx,1.68+r*.27,-6.12,.07,.05,.015,'#93cce0',.3);}
   for(const dx of[-1.98,0,1.98])this.box(x+dx,1.50,-6.06,.07,4.0,.12,'#a58b6d');
   this.roundedBox(x,.12,-5.95,3.9,1.1,.55,'#465367',.08);
   for(let j=0;j<13;j++)this.box(x-1.7+j*.28,.25,-5.62,.15,.72+(j%3)*.07,.08,j%3?'#c7a073':'#508b95');
  }
  this.roundedBox(0,2.45,-6.10,6.5,2.94,.20,'#061224',.10);
  this.box(0,2.45,-5.98,6.4,.04,.025,'#ffe0a1',.45);
  this.display('council-crest',0,5.62,-6.01,5.3,.55,'THE COUNCIL',['SIX PERSPECTIVES / ONE DECISION'],[],'#f3cf91');
  for(const x of[-7.55,7.55])for(const z of[-4.2,-.7,2.7]){this.box(x,.4,z,.24,3.1,.12,'#967d5b');this.ellipsoid(x,2.90,z,.18,.30,.15,'#ffe2b1',.45);}
  // Brass pedestal, walnut edge, teal felt, personal tablets and the holographic agency.
  this.cylinder(0,.04,0,1.13,1.08,'#9c805c',.82);
  this.cylinder(0,1.12,0,3,.24,'#bf9b6c',3,0,64);
  this.cylinder(0,1.36,0,2.92,.05,'#28606a',2.92,0,64);
  this.ring(0,1.414,0,2.85,'#f7d39c',.025,.35);
  this.cylinder(0,1.42,0,.72,.10,'#142c40');this.ring(0,1.54,0,.70,'#78e5e5',.022,.7);
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9,x=Math.sin(a)*.50,z=Math.cos(a)*.50,h=.18+(i%4)*.12;this.box(x,1.54,z,.14,h,.14,'#6dbdc9',.22);this.box(x,1.54+h,z,.15,.014,.15,'#b7f2e9',.4);}
  this.box(0,1.54,0,.18,.65,.18,'#d5b787',.3);
  // A single sculptural chandelier leaves the faces and tabletop unobstructed.
  this.ring(0,4.85,0,2.65,'#8b7459',.08,0);this.ring(0,4.83,0,2.65,'#ffdfac',.034,.55);
  for(const x of[-1.7,1.7])this.box(x,4.9,0,.022,1.0,.022,'#887c6c');
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*3.8,z=Math.cos(a)*3.8,m=members[i]||{},color=/^#[0-9a-f]{6}$/i.test(m.color)?m.color:['#74c8ff','#ad94ff','#ff7cb0','#ffb86c','#70e1bd','#ffe58f'][i];
   const start=this.data.length;this.cylinder(x,.08,z,.46,.08,'#748697');this.cylinder(x,.16,z,.06,.40,'#93a5b8');this.roundedBox(x,.54,z,1.10,.17,1.02,color,.18);this.roundedBox(x,.66,z+.37,1.05,.55,.18,'#395469',.08);
   // Rotate each chair with its occupant around the round table.
   for(let j=start;j<this.data.length;j+=10){const c=Math.cos(a+Math.PI),ss=Math.sin(a+Math.PI),xx=this.data[j]-x,zz=this.data[j+2]-z,nx=this.data[j+6],nz=this.data[j+8];this.data[j]=x+xx*c+zz*ss;this.data[j+2]=z-xx*ss+zz*c;this.data[j+6]=nx*c+nz*ss;this.data[j+8]=-nx*ss+nz*c;}
   this.robot(x,.72,z,color,1.08,true,a+Math.PI);this.ring(x,.076,z,.64,color,.02,.35);
   const tx=Math.sin(a)*2.25,tz=Math.cos(a)*2.25;this.roundedBox(tx,1.42,tz,.58,.045,.38,'#091e30',.05);this.box(tx,1.466,tz,.45,.007,.27,color,.22);this.cylinder(tx+.36,1.42,tz,.075,.17,'#e2d8c5');
  }
  for(const x of[-6.2,6.2]){
   this.roundedBox(x,.10,4.8,2.25,.38,1.20,'#37536b',.20);this.roundedBox(x,.49,4.8,2.10,.16,1.10,'#688a9b',.17);this.roundedBox(x,.64,5.25,2.15,.55,.20,'#4c6d81',.10);
   this.cylinder(x,.02,3.35,.65,.5,'#4a6575',.50);this.cylinder(x,.52,3.35,.76,.05,'#c9a77d');
   this.cylinder(x,.12,-3.5,.40,.58,'#b49c7d');for(let j=0;j<5;j++)this.ellipsoid(x+Math.sin(j)*.28,1.03+j*.12,-3.5+Math.cos(j)*.23,.27,.34,.20,'#5da590');
  }
  this.display('academy-wall',5.65,5.62,-6,3.2,.55,'NIGHT SCHOOL',['SYNTHETIC RESEARCH'],[],'#70e2e8');
  for(const x of[-5.75,5.75])this.skylineWindow('council-window-'+x,x,1.55,-6.035,3.78,3.84,0,'#e6c2ff');
  // Monumental Art Deco relief flanks the evidence wall.
  for(const x of[-3.7,3.7]){
   this.box(x,.03,-5.93,.40,6.3,.28,'#141d30');this.box(x-.15,.16,-5.75,.055,6.05,.05,'#cda96f');this.box(x+.15,.16,-5.75,.055,6.05,.05,'#cda96f');
  }
  for(let i=0;i<25;i++){const a=Math.PI*i/25,b=Math.PI*(i+1)/25;this.rod([Math.cos(a)*7.7,3.2+Math.sin(a)*3.4,-5.8],[Math.cos(b)*7.7,3.2+Math.sin(b)*3.4,-5.8],.075,'#c9a777');}
  for(const x of[-8,8]){
   this.roundedBox(x,.08,-1.6,.36,.48,9.6,'#172137',.08);this.box(x,4.5,-1.6,.30,.18,9.6,'#8f785c');this.box(x*.99,4.48,-1.6,.035,.025,9.3,'#ffdca5',.65);
   for(let z=-5;z<=2;z+=1.75){this.box(x,.5,z,.22,4,.22,'#314455');this.box(x*.982,.7,z,.035,3.6,.08,'#bb9862');this.rod([x,4.6,z],[x*.82,5.25,z],.07,'#c2a57a');}
  }
  // Stone border and a compass inlay around the council carpet.
  for(const x of[-7.0,7.0])for(let z=-4;z<6.6;z+=.84){this.box(x,.027,z,1.3,.012,.79,(Math.floor(z*5)%2)?'#d2c0a1':'#998b79');this.box(x,.04,z,.025,.006,.79,'#d8b879');}
  this.ring(0,.064,0,5.35,'#c6ac7c',.032,.15);this.ring(0,.065,0,5.50,'#9d8667',.014,0);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;this.rod([Math.sin(a)*5.15,.07,Math.cos(a)*5.15],[Math.sin(a)*5.3,.07,Math.cos(a)*5.3],.012,'#d5bb91');}
  for(const x of[-6.2,6.2])for(let y=.36;y<1.18;y+=.22)this.box(x,y,-5.53,3.8,.035,.035,'#d6b17c');
  // Lantern constellation: thin warm arcs instead of a heavy ceiling lid.
  for(let i=0;i<12;i++){const a=i*Math.PI/6,x=Math.sin(a)*2.65,z=Math.cos(a)*2.65;this.ellipsoid(x,4.84,z,.075,.09,.075,'#fff0d0',.85);}
  for(const x of[-6.2,6.2]){this.cylinder(x,.58,3.35,.08,.16,'#ddc5a1');this.ellipsoid(x,2.4,4.8,.22,.36,.22,'#ffdeaa',.7);this.rod([x,.02,4.8],[x,2.3,4.8],.026,'#bea47a');}
  // Gallery ceiling and sculpted chair shells create a complete, readable chamber.
  for(const x of[-7.7,7.7]){this.roundedBox(x,4.88,-1.9,.36,.24,8.9,'#172337',.10);this.box(x*.992,4.855,-1.9,.07,.025,8.65,'#ffe9ba',.55);}
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*3.8,z=Math.cos(a)*3.8,side=[Math.cos(a),0,-Math.sin(a)];
   for(const d of[-.51,.51]){const xx=x+side[0]*d,zz=z+side[2]*d;this.rod([xx,.59,zz],[xx,.98,zz],.024,'#c6a571');this.sphere(xx,.98,zz,.052,'#48667c');}
   const px=Math.sin(a)*2.55,pz=Math.cos(a)*2.55;this.cylinder(px,1.42,pz,.12,.02,'#cbb484');this.cylinder(px,1.44,pz,.055,.16,'#ddddd1');
  }
  // Walnut panels, recessed bronze seams, carved round-table detailing.
  for(let i=0;i<48;i++){const a=i*Math.PI/24;this.rod([Math.sin(a)*2.99,1.14,Math.cos(a)*2.99],[Math.sin(a)*2.99,1.31,Math.cos(a)*2.99],.012,'#8e704e');}
  for(const x of[-4.5,4.5]){this.box(x,.13,-5.61,.45,2.12,.045,'#2b4350');this.box(x-.17,.13,-5.56,.016,2.12,.035,'#cba871');this.box(x+.17,.13,-5.56,.016,2.12,.035,'#cba871');}
  this.ring(0,.025,6.6,.50,'#d8b585',.020,.12);for(const x of[-.20,.20])this.box(x,.028,6.6,.028,.006,.37,'#ead6b4');
  this.canvas.dataset.design='flagship-v3';
  this.councilBase=this.data.slice();this.upload();this.draw();
 }
 councilData(members,bars,review){
  if(!this.councilBase)return;const key=JSON.stringify([members.map(m=>m.vote),bars.at(-1)?.timestamp,bars.at(-1)?.close,review?.action,review?.team_name]);if(key===this.councilDataKey)return;this.councilDataKey=key;this.data=this.councilBase.slice();
  for(let i=0;i<6;i++){const a=i*Math.PI/3,v=members[i]?.vote,c=v==="SUPPORT"?"#70e1bd":v==="VETO"?"#ff718b":v==="WAIT"?"#e6b875":"#5f718d";this.ring(Math.sin(a)*2.25,1.49,Math.cos(a)*2.25,.32,c,.022,.8);}
  this.display("evidence",0,2.55,-5.94,6.1,2.7,(review?.team_name||"COUNCIL")+" / EVIDENCE WALL",[review?review.favorable_votes+" OF 6 SUPPORT · "+(review.action||"WAIT"):"WAITING FOR EVIDENCE",snapshot?.practice?"SYNTHETIC PRACTICE CANDLES":"RECORDED CLOSE HISTORY","Seat lights: green support / amber wait / red veto"],bars,"#70e2e8");this.upload();this.draw();
 }
 upload(){this.shadowDirty=true;const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.data),gl.STATIC_DRAW);this.vertices=this.data.length/10;}
 targetsFor(w,h){
  if(this.targetWidth===w&&this.targetHeight===h)return;
  const gl=this.gl;for(const t of this.targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);if(t.depth)gl.deleteRenderbuffer(t.depth);}this.targets=[];
  this.targetWidth=w;this.targetHeight=h;
  for(let i=0;i<(this.kind==='city'?3:4);i++){
   const tw=i?Math.max(1,Math.floor(w/2)):w,th=i?Math.max(1,Math.floor(h/2)):h;
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,tw,th,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);let depth=null;
   if(!i||i===3){depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,tw,th);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);}
   this.targets.push({texture,fbo,depth,w:tw,h:th});
  }
  this.bloomAvailable=this.targets.slice(0,3).every(t=>{gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;});this.reflectionAvailable=!!this.targets[3]&&(()=>{gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[3].fbo);return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;})();gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 renderReflection(eye,target){
  if(!this.reflectionAvailable)return;
  const gl=this.gl,rt=this.targets[3],saved=this.matrix;
  this.matrix=cameraMatrix([eye[0],-eye[1],eye[2]],[target[0],-target[1],target[2]],this.canvas.width/this.canvas.height);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'reflectionCamera'),false,new Float32Array(this.matrix));
  gl.uniformMatrix4fv(this.camera,false,new Float32Array(this.matrix));
  gl.uniform1f(gl.getUniformLocation(this.program,'reflectionPass'),1);gl.uniform1f(gl.getUniformLocation(this.program,'reflectionReady'),0);
  // Never bind the attached reflection texture as a sampler during its own pass.
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,rt.fbo);gl.viewport(0,0,rt.w,rt.h);gl.clearColor(.02,.035,.07,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);this.drawDisplays();
  this.matrix=saved;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i===3?1:3,gl.FLOAT,false,40,i*12);}
  gl.uniformMatrix4fv(this.camera,false,new Float32Array(saved));gl.uniform1f(gl.getUniformLocation(this.program,'reflectionPass'),0);gl.uniform1f(gl.getUniformLocation(this.program,'reflectionReady'),1);
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,rt.texture);gl.uniform1i(gl.getUniformLocation(this.program,'reflectionMap'),3);gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.bloomAvailable?this.targets[0].fbo:null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
 }
 screen(program,target,source){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.w||this.canvas.width,target?.h||this.canvas.height);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
  for(const a of this.attributes)gl.disableVertexAttribArray(a);const point=gl.getAttribLocation(program,"point");gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(gl.getUniformLocation(program,"source"),0);
 }
 project(x,y,z){const p=[x,y,z,1],m=this.matrix;if(!m)return null;const out=[0,0,0,0];for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[row]+=m[k*4+row]*p[k];if(out[3]<=0)return null;return{x:(out[0]/out[3]*.5+.5)*this.canvas.clientWidth,y:(-.5*out[1]/out[3]+.5)*this.canvas.clientHeight};}
 draw(){
  if(this.failed)return;const canvas=this.canvas;if(!canvas.clientWidth||!canvas.clientHeight)return;
  const gl=this.gl,dpr=graphicsQuality==='eco'?1:graphicsQuality==='high'?2:Math.min(Math.max(window.devicePixelRatio||1,canvas.clientWidth>600?1.5:1.25),1.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}this.targetsFor(w,h);this.renderShadows();
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.bloomAvailable?this.targets[0].fbo:null);gl.viewport(0,0,w,h);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],i===3?1:3,gl.FLOAT,false,40,i*12);}
  const t=this.target,r=this.distance,eye=[t[0]+r*Math.sin(this.yaw)*Math.cos(this.pitch),t[1]+r*Math.sin(this.pitch),t[2]+r*Math.cos(this.yaw)*Math.cos(this.pitch)];
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'lightCamera'),false,new Float32Array(this.lightCamera));gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture||this.targets[1]?.texture);gl.uniform1i(gl.getUniformLocation(this.program,'shadowMap'),2);gl.uniform1f(gl.getUniformLocation(this.program,'shadows'),graphicsQuality!=='eco'&&this.kind!=='city'&&this.shadowsAvailable?1:0);gl.activeTexture(gl.TEXTURE0);canvas.dataset.shadows=String(graphicsQuality!=='eco'&&this.kind!=='city'&&!!this.shadowsAvailable);
  gl.uniform1f(gl.getUniformLocation(this.program,'interior'),this.kind==='city'?0:1);
  gl.uniform1f(gl.getUniformLocation(this.program,'woodFloor'),this.kind==='council'||['boardroom','exchange','garden','bullion'].includes(this.theme?.feature)?1:0);
  gl.uniform3fv(gl.getUniformLocation(this.program,'roomAccent'),new Float32Array(hex(this.theme?.accent||'#d9b174')));
  const contacts=Array.from({length:6},(_,i)=>this.kind==='office'&&this.crew?.[i]?[this.crew[i].x,0,this.crew[i].z+1]:this.kind==='council'?[Math.sin(i*Math.PI/3)*3.8,0,Math.cos(i*Math.PI/3)*3.8]:[1000,0,1000]);
  gl.uniform3fv(gl.getUniformLocation(this.program,'contact[0]'),new Float32Array(contacts.flat()));
  this.eye=eye;gl.uniform3fv(gl.getUniformLocation(this.program,"eyePosition"),new Float32Array(eye));this.matrix=cameraMatrix(eye,t,w/h);gl.uniformMatrix4fv(this.camera,false,new Float32Array(this.matrix));gl.uniform1f(this.pulse,byId("world").dataset.motion==="on"&&!document.hidden?.035+.035*Math.sin(performance.now()/900):0);
  const warm=this.kind==='council'||['boardroom','exchange','garden','bullion'].includes(this.theme?.feature),accent=hex(this.theme?.accent||'#e6c694');
  gl.uniform3fv(gl.getUniformLocation(this.program,'practicalPosition[0]'),new Float32Array([-5.8,3.4,4.8,6,3.8,-2,0,5,-3.8,0,1.8,0]));
  gl.uniform3fv(gl.getUniformLocation(this.program,'practicalColor[0]'),new Float32Array([1.5,1.05,.65,.48,.92,1.6,warm?1.4:.75,warm?1.15:1.1,warm?.82:1.5,...accent.map(v=>v*.7)]));
  gl.uniform1f(gl.getUniformLocation(this.program,'reflectionPass'),0);gl.uniform1f(gl.getUniformLocation(this.program,'reflectionReady'),0);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program,'reflectionCamera'),false,new Float32Array(this.matrix));
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(gl.getUniformLocation(this.program,'reflectionMap'),3);gl.activeTexture(gl.TEXTURE0);
  if(this.kind!=='city'&&graphicsQuality!=='eco')this.renderReflection(eye,t);
  canvas.dataset.reflections=String(this.kind!=='city'&&graphicsQuality!=='eco'&&!!this.reflectionAvailable);canvas.dataset.graphics='2026';canvas.dataset.quality=graphicsQuality;
  gl.clearColor(.012,.018,.04,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);this.drawRoomEffects();this.drawDisplays();
  if(this.bloomAvailable){
   gl.disable(gl.DEPTH_TEST);const [scene,a,b]=this.targets;
   this.screen(this.blur,a,scene);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),3/scene.w,0);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),1);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.blur,b,a);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),0,3/a.h);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),0);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.composite,null,scene);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(this.composite,"halo"),1);gl.uniform1f(gl.getUniformLocation(this.composite,"city"),this.kind==="city"?1:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.activeTexture(gl.TEXTURE0);
  }
  if(this.kind!=='city'){
   const view=canvas.dataset.camera||'wide';
   for(const button of document.querySelectorAll('[data-room="'+this.kind+'"][data-room-camera]')){
    if(button.classList.contains('room-enter-view')){button.dataset.roomCamera=view==='inside'?'wide':'inside';button.textContent=view==='inside'?'Whole room ↗':'Step inside ↗';}
    else if(!['closer','further'].includes(button.dataset.roomCamera))button.setAttribute('aria-pressed',String(button.dataset.roomCamera===view));
   }
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
 const qualityLabel=document.createElement('label');qualityLabel.textContent='Graphics ';qualityLabel.className='graphics-quality-label';const qualitySelect=document.createElement('select');qualitySelect.id='graphics-quality';qualitySelect.setAttribute('aria-label','Graphics quality');for(const [value,title]of [['eco','Performance'],['balanced','Balanced'],['high','High detail']]){const option=document.createElement('option');option.value=value;option.textContent=title;qualitySelect.append(option);}qualitySelect.value=graphicsQuality;qualityLabel.append(qualitySelect);byId('city-view').parentElement.append(qualityLabel);qualitySelect.addEventListener('change',()=>{graphicsQuality=qualitySelect.value;try{localStorage.setItem('laylow-graphics-quality',graphicsQuality);}catch{}for(const scene of[city,office,councilScene])scene?.draw();});
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
  if(view==='inside'){scene.yaw=0;scene.pitch=.07;scene.distance=kind==='office'?15:15.3;scene.target=[0,1.5,-3.7];scene.canvas.dataset.camera=view;scene.draw();return;}
  if(kind==='office'&&office){if(view==='wall'){office.yaw=0;office.pitch=.08;office.distance=office.canvas.clientWidth<650?14.5:12;office.target=[0,3.3,-6.2];office.canvas.dataset.camera=view;office.draw();return;}if(view==='wide'){office.yaw=-.38;office.pitch=.57;office.distance=19.8;office.target=[0,1.4,-.1];office.canvas.dataset.camera=view;office.draw();return;}if(view==='desk'||view==='screens'){window.LaylowTeamOffices.focus(office,byId('office-worker').value,view);return;}}
  const presets=kind==="council"?{wide:[-.30,.55,19.5,[0,1.6,0]],table:[.15,.74,10.5,[0,1,0]],wall:[0,.12,10.4,[0,2.5,-2.5]]}:{wide:[.3,.28,9,[0,1.6,-.25]],desk:[-.48,.17,5.8,[0,1.7,.25]],screens:[0,.12,4.2,[0,2,-.6]]};
  if(view==="closer"||view==="further")scene.distance=Math.max(4,Math.min(26,scene.distance+(view==="closer"?-1:1)));
  else {const p=presets[view];if(!p)return;[scene.yaw,scene.pitch,scene.distance,scene.target]=p;}
  scene.canvas.dataset.camera=view;scene.draw();
 },
 resetCouncil(){if(councilScene){councilScene.yaw=-.30;councilScene.pitch=.55;councilScene.distance=19.5;councilScene.target=[0,1.6,0];councilScene.draw();}},
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
