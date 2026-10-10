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
  this.program=program(`attribute vec3 position,color,normal;attribute float emission;uniform mat4 camera;varying vec3 tint,n;varying float glow,depth;void main(){gl_Position=camera*vec4(position,1.0);tint=color;n=normal;glow=emission;depth=gl_Position.w;}`,`precision mediump float;varying vec3 tint,n;varying float glow,depth;uniform float ambientPulse;void main(){vec3 N=normalize(n);float light=.32+.63*max(dot(N,normalize(vec3(-.5,1.,.6))),0.)+.24*max(dot(N,normalize(vec3(.8,.2,-1.))),0.);vec3 lit=tint*mix(light,1.2+ambientPulse,glow);float fog=clamp((depth-36.)/110.,0.,.66);gl_FragColor=vec4(mix(lit,vec3(.035,.047,.105),fog),1.);}`);
  this.buffer=gl.createBuffer();this.attributes=["position","color","normal","emission"].map(n=>gl.getAttribLocation(this.program,n));this.camera=gl.getUniformLocation(this.program,"camera");this.pulse=gl.getUniformLocation(this.program,"ambientPulse");
  const screenVertex=`attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}`;
  this.blur=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source;uniform vec2 direction;uniform float extract;vec3 tap(vec2 p){vec3 c=texture2D(source,p).rgb;return mix(c,c*smoothstep(.48,.95,max(c.r,max(c.g,c.b))),extract);}void main(){vec3 c=tap(uv)*.227027;c+=(tap(uv+direction*1.384615)+tap(uv-direction*1.384615))*.316216;c+=(tap(uv+direction*3.230769)+tap(uv-direction*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`);
  this.composite=program(screenVertex,`precision mediump float;varying vec2 uv;uniform sampler2D source,halo;uniform float city;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec4 scene=texture2D(source,uv);vec3 sky=mix(vec3(.065,.072,.17),vec3(.013,.012,.045),smoothstep(.12,1.,uv.y));float cloud=sin(uv.x*7.+uv.y*9.)*sin(uv.x*13.-uv.y*6.);sky+=vec3(.028,.015,.059)*cloud;vec2 cell=floor(uv*vec2(760.,440.));float star=step(.9994,hash(cell))*pow(max(0.,uv.y-.38),1.5);sky+=star*.7*city;vec2 moon=(uv-vec2(.84,.85))*vec2(1.35,1.);float d=length(moon);sky+=vec3(.10,.14,.22)*exp(-d*16.)*city;sky+=vec3(.6,.7,.9)*(1.-smoothstep(.021,.024,d))*city;vec3 c=mix(sky,scene.rgb,scene.a)+texture2D(halo,uv).rgb*1.05;c*=1.-.22*pow(length((uv-.5)*1.2),2.);gl_FragColor=vec4(c,1.);}`);
  this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);this.targets=[];
  this.yaw=.25;this.pitch=kind==="city"?.43:kind==="council"?.49:.24;this.distance=kind==="city"?57:kind==="council"?12.8:6.8;this.target=kind==="city"?[0,3,3]:[0,1.6,0];this.data=[];this.labels=[];
  this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(canvas);this.installCamera();
  canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();this.failed=true;canvas.dataset.ready="false";if(kind==="city"){byId("city-render-note").textContent="3D context lost. Use the accessible city map below.";byId("world").dataset.view="map";}});
  canvas.addEventListener("webglcontextrestored",()=>{byId("city-render-note").textContent="Reload to restore 3D rendering; the map remains available.";});
 }
 vertex(p,rgb,n,e){this.data.push(...p,...rgb,...n,e);}
 box(x,y,z,w,h,d,color,emission=0){
  const rgb=Array.isArray(color)?color:hex(color);
  for(let f=0;f<cube.length;f++)for(let i=0;i<18;i+=3)this.vertex([x+(cube[f][i]-.5)*w,y+cube[f][i+1]*h,z+(cube[f][i+2]-.5)*d],rgb,faceNormals[f],emission);
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
  this.sphere(x,y+1.08*scale,z,.37*scale,"#d7e0f2");
  b(0,.94,.29,.53,.25,.12,"#080f22");b(-.13,1.04,.36,.085,.07,.015,color,1);b(.13,1.04,.36,.085,.07,.015,color,1);
  b(0,.985,.367,.14,.018,.015,color,.8);
  b(-.38,.93,0,.12,.31,.28,"#242b45");b(.38,.93,0,.12,.31,.28,"#242b45");
  b(-.447,1.00,0,.012,.16,.16,color,.8);b(.447,1.00,0,.012,.16,.16,color,.8);
  b(0,1.43,0,.047,.16,.047,"#647697");this.sphere(x,y+1.62*scale,z,.065*scale,color,1);
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
 office(symbol){
  this.symbol=symbol;this.data=[];
  const color=bridge.districts.find(row=>row.name===symbol)?.color||"#b488ff";
  this.box(0,-.2,0,9,.2,7,"#263047");this.box(0,0,-3.3,9,4.5,.16,"#18223a");
  for(let x=-4;x<=4;x+=.8)this.box(x,.01,0,.02,.01,7,"#46516b");
  for(const x of[-4.4,4.4]){this.box(x,0,0,.12,4.5,6.5,"#19213a");this.box(x*.995,.25,0,.025,.035,6,color,1);}
  this.box(0,.15,-3.17,8.4,.035,.02,color,1);this.box(0,4.1,-3.17,8.4,.035,.02,color,1);
  for(const x of[-2.8,0,2.8]){
   this.box(x,1,-3.19,2.3,2.8,.07,"#09152c");
   for(let i=0;i<8;i++){const h=.6+(i*3%7)*.16;this.building(x-1+i*.27,-3.1,h,"#526981",.15,false);}
   this.box(x,1,-2.97,.035,2.8,.035,"#5d708f");
  }
  this.box(0,1.05,-.05,5.7,.14,1.8,"#4c5871");this.box(0,1.19,-.05,5.7,.045,1.8,"#263047");this.box(0,1.12,.86,5.5,.045,.015,color,1);
  for(const x of[-2.3,2.3]){this.box(x,0,-.05,.13,1.05,1.4,"#536685");this.box(x,.02,-.05,.75,.08,1.6,"#252e42");}
  for(const x of[-1.75,0,1.75]){
   this.cylinder(x,1.21,-.55,.2,.035,"#73859d");this.box(x,1.24,-.55,.08,.4,.08,"#73859d");
   this.box(x,1.62,-.55,1.56,1.05,.12,"#10182a");this.box(x,1.67,-.476,1.43,.92,.02,"#102b40",.12);
   this.box(x,1.66,-.46,1.4,.03,.01,color,.8);
   for(let j=0;j<4;j++)this.box(x-.65,1.9+j*.15,-.459,.38,.024,.01,"#3a6479",.25);
  }
  this.cylinder(0,.04,1.7,.5,.08,"#536381");this.cylinder(0,.12,1.7,.09,.4,"#8fa1bc");
  this.box(0,.52,1.7,1.1,.18,.8,"#303957");this.box(0,.7,2.1,1.08,.8,.17,"#34455e");this.box(0,.81,2.195,.8,.43,.02,color,.4);
  this.robot(0,.67,1.3,color,1.05,true,Math.PI);
  this.box(0,1.245,.45,1.1,.03,.43,"#73809c");for(let row=0;row<3;row++)for(let i=0;i<11;i++)this.box(-.45+i*.087,1.278,.3+row*.11,.06,.01,.06,"#152c42");
  this.cylinder(2.45,1.23,.5,.13,.32,"#acb5c6");this.cylinder(2.45,1.56,.5,.115,.008,"#30282c");
  this.box(-3.6,0,-1.5,.7,.6,.7,"#4b5269");this.cylinder(-3.6,.6,-1.5,.36,.8,"#37625c",.07);
  this.officeBase=this.data.slice();this.upload();this.draw();
 }
 officeBars(bars){
  if(!this.officeBase)return;this.data=this.officeBase.slice();
  const prices=bars.map(b=>Number(b.close)).filter(v=>Number.isFinite(v)&&v>0).slice(-30);
  if(prices.length>1){const low=Math.min(...prices),range=Math.max(...prices)-low||1;for(let i=0;i<prices.length;i++)this.box(-.59+i*1.18/(prices.length-1),1.81+(prices[i]-low)*.57/range,-.448,.026,.026,.012,"#65efc1",1);}
  this.upload();this.draw();
 }
 councilRoom(members){
  this.data=[];this.box(0,-.2,0,14,.2,12,"#28263d");this.box(0,0,-5.5,14,5.5,.16,"#423147");
  for(let x=-6;x<=6;x+=2)this.box(x,.005,0,.018,.008,11,"#5e566b");
  for(let z=-5;z<=5;z+=2)this.box(0,.005,z,13,.008,.018,"#5e566b");
  for(const x of[-6.9,6.9]){this.box(x,0,-2,.14,5.5,7,"#352d43");this.box(x,4.95,-2,.03,.045,7,"#70e2e8",1);for(let z=-5;z<=1;z+=2)this.box(x,0,z,.2,4.9,.11,"#a18558");}
  this.ring(0,4.3,0,3.1,"#e2bc74",.065,1);this.ring(0,4.34,0,2.8,"#70e2e8",.018,.6);
  for(const x of[-6,-3,0,3,6]){this.box(x,0,-5.35,.06,5.1,.06,"#b99463");this.box(x,4.3,-5,.3,.08,.5,"#50413b");this.sphere(x,4.15,-4.9,.10,"#ffe4a0",1);}
  this.box(0,.22,-5.33,13.5,.03,.03,"#c9a679",.8);this.box(0,5.0,-5.33,13.5,.03,.03,"#c9a679",.8);
  this.box(0,2,-5.16,4.8,1.6,.08,"#15203a");this.box(0,2.03,-5.10,4.6,.035,.025,"#bd9457",.8);
  this.cylinder(0,.01,0,4.8,.03,"#323549",4.8,0,64);this.ring(0,.06,0,4.8,"#b29865",.025,.5);
  this.cylinder(0,.05,0,.65,1,"#62513e",.5);this.cylinder(0,1.08,0,2.95,.2,"#8c724d",2.95,0,64);this.cylinder(0,1.28,0,2.87,.035,"#3d554f",2.87,0,64);
  this.ring(0,1.32,0,2.85,"#ffe4a0",.025,1);this.ring(0,1.32,0,1.55,"#b6bd81",.015,.45);
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.sin(a)*3.8,z=Math.cos(a)*3.8,m=members[i]||{},color=/^#[0-9a-f]{6}$/i.test(m.color)?m.color:["#74c8ff","#ad94ff","#ff7cb0","#ffb86c","#70e1bd","#ffe58f"][i];
   this.cylinder(x,.06,z,.45,.09,"#59617b");this.cylinder(x,.15,z,.07,.4,"#a3aec5");this.box(x,.55,z,1.0,.16,.85,"#34314e");
   this.robot(x,.68,z,color,.95,true,a+Math.PI);this.ring(x,2.5,z,.49,color,.026,1);
   const tx=Math.sin(a)*2.2,tz=Math.cos(a)*2.2;this.cylinder(tx,1.32,tz,.25,.025,"#15273c",.25);this.ring(tx,1.35,tz,.23,color,.022,1);
  }
  this.cylinder(0,1.34,0,.36,.28,"#b89b54",.25);this.ring(0,1.65,0,.55,"#ffe4a0",.025,1);
  this.upload();this.draw();
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
  this.eye=eye;this.matrix=cameraMatrix(eye,t,w/h);gl.uniformMatrix4fv(this.camera,false,new Float32Array(this.matrix));gl.uniform1f(this.pulse,byId("world").dataset.motion==="on"&&!document.hidden?.035+.035*Math.sin(performance.now()/900):0);
  gl.clearColor(.012,.018,.04,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);
  if(this.bloomAvailable){
   gl.disable(gl.DEPTH_TEST);const [scene,a,b]=this.targets;
   this.screen(this.blur,a,scene);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),3/scene.w,0);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),1);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.blur,b,a);gl.uniform2f(gl.getUniformLocation(this.blur,"direction"),0,3/a.h);gl.uniform1f(gl.getUniformLocation(this.blur,"extract"),0);gl.drawArrays(gl.TRIANGLES,0,6);
   this.screen(this.composite,null,scene);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(this.composite,"halo"),1);gl.uniform1f(gl.getUniformLocation(this.composite,"city"),this.kind==="city"?1:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.activeTexture(gl.TEXTURE0);
  }
  canvas.dataset.ready="true";canvas.dataset.bloom=String(this.bloomAvailable);if(this.kind==="city")placeLabels();
  if(this.kind==="council")for(const button of byId("council-seat-labels")?.children||[]){const a=Number(button.dataset.councilSeat)*Math.PI/3,p=this.project(Math.sin(a)*3.8,2.95,Math.cos(a)*3.8);button.hidden=!p||p.x<25||p.x>canvas.clientWidth-25||p.y<55||p.y>canvas.clientHeight-25;if(p){button.style.left=p.x+"px";button.style.top=p.y+"px";}}
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
   const node=document.createElement("div");node.className="world-3d-label city-hq-label";node.textContent=name+" · "+label;byId("city-3d-labels").append(node);labels.set(name,node);
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
 council(members){try{if(!councilScene)councilScene=new Scene(byId("council-3d"),"council");const key=JSON.stringify(members.map(m=>m.color));if(key!==councilKey){councilKey=key;councilScene.councilRoom(members);}byId("council-render-note").textContent="Six seats · drag or arrow keys to orbit · read all opinions below.";}catch(error){byId("council-render-note").textContent="3D chamber unavailable; opinions and decisions remain accessible below.";}},
 resetCouncil(){if(councilScene){councilScene.yaw=.25;councilScene.pitch=.49;councilScene.distance=12.8;councilScene.target=[0,1.6,0];councilScene.draw();}},
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
 enter(name){try{if(!office)office=new Scene(byId("office-3d"),"office");office.office(name);office.officeBars(snapshot?.teams?.find(row=>row.name===name)?.analysis?.bars||[]);byId("office-render-note").textContent="Bot office · drag to look around";}catch(error){byId("office-render-note").textContent="3D office unavailable; recorded workstation panels remain available.";}},
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
start();window.Laylow3D.update(bridge.snapshot()||{},bridge.connected());
})();
