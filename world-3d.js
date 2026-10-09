
/* Local WebGL geometry. No remote assets, libraries, generated quotes or orders. */
(()=>{
"use strict";
const byId=id=>document.getElementById(id),bridge=window.LaylowWorld;
if(!bridge)return;
const hex=(s)=>{const v=parseInt(s.slice(1),16);return[(v>>16)/255,((v>>8)&255)/255,(v&255)/255];};
const positions={
 SPY:[-7,-7],QQQ:[7,-7],AAPL:[-12,2],TSLA:[12,2],
 "NQ1!":[-5,8],"ES1!":[5,8],"MGC1!":[-14,10],"MNQ1!":[14,10],
 "MES1!":[-9,16],"GC1!":[9,16]
};
const cube=[
 [0,1,0, 1,1,0, 1,1,1, 0,1,0, 1,1,1, 0,1,1,1.15],
 [0,0,1, 1,0,1, 1,1,1, 0,0,1, 1,1,1, 0,1,1,.88],
 [1,0,0, 1,0,1, 1,1,1, 1,0,0, 1,1,1, 1,1,0,.65],
 [0,0,0, 0,1,0, 0,1,1, 0,0,0, 0,1,1, 0,0,1,.55],
 [0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0,.75],
 [0,0,0, 0,0,1, 1,0,1, 0,0,0, 1,0,1, 1,0,0,.4]
];
function identity(){return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function multiply(a,b){const r=new Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function norm(v){const n=Math.hypot(...v)||1;return v.map(x=>x/n);}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function cameraMatrix(eye,target,aspect){
 const z=norm(eye.map((x,i)=>x-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);
 const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
 const q=1/Math.tan(Math.PI/8)*Math.min(1,aspect/1.3),near=.1,far=250;
 const projection=[q/aspect,0,0,0,0,q,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
 return multiply(projection,view);
}
class Scene {
 constructor(canvas,kind){
  this.canvas=canvas;this.kind=kind;this.gl=canvas.getContext("webgl",{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!this.gl)throw new Error("WebGL is unavailable");
  const gl=this.gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error("Shader could not compile");return s;};
  const p=gl.createProgram();
  gl.attachShader(p,shader(gl.VERTEX_SHADER,"attribute vec3 position;attribute vec3 color;uniform mat4 camera;varying vec3 tint;varying float depth;void main(){gl_Position=camera*vec4(position,1.0);tint=color;depth=gl_Position.w;}"));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,"precision mediump float;varying vec3 tint;varying float depth;uniform float ambientPulse;void main(){float fog=clamp((depth-25.0)/150.0,0.0,0.6);gl_FragColor=vec4(mix(tint*(1.0+ambientPulse*step(0.65,max(tint.r,max(tint.g,tint.b)))),vec3(0.025,0.035,0.08),fog),1.0);}"));
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error("Renderer could not link");
  gl.useProgram(p);this.program=p;this.buffer=gl.createBuffer();this.position=gl.getAttribLocation(p,"position");this.color=gl.getAttribLocation(p,"color");this.camera=gl.getUniformLocation(p,"camera");this.pulse=gl.getUniformLocation(p,"ambientPulse");
  gl.enable(gl.DEPTH_TEST);gl.clearColor(.018,.023,.055,1);
  this.yaw=.52;this.pitch=kind==="office"?.22:.56;this.distance=kind==="office"?9:51;this.target=kind==="office"?[0,1.6,0]:[0,2,4];this.data=[];this.labels=[];
  this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(canvas);
  this.installCamera();canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();this.failed=true;canvas.dataset.ready="false";if(kind==="city"){byId("city-render-note").textContent="3D context lost. Use the accessible city map below.";byId("world").dataset.view="map";}});
  canvas.addEventListener("webglcontextrestored",()=>{byId("city-render-note").textContent="Reload to restore 3D rendering; the map remains available.";});
 }
 box(x,y,z,w,h,d,color){
  const rgb=Array.isArray(color)?color:hex(color);
  for(const face of cube)for(let i=0;i<18;i+=3)this.data.push(x+(face[i]-.5)*w,y+face[i+1]*h,z+(face[i+2]-.5)*d,...rgb.map(v=>Math.min(1,v*face[18])));
 }
 sphere(x,y,z,r,color){
  const rgb=hex(color),point=(lat,lon)=>[x+r*Math.cos(lat)*Math.sin(lon),y+r*Math.sin(lat),z+r*Math.cos(lat)*Math.cos(lon)];
  for(let a=0;a<8;a++)for(let b=0;b<14;b++){
   const lat=-Math.PI/2+a*Math.PI/8,lon=b*Math.PI*2/14,aa=Math.PI/8,bb=Math.PI*2/14;
   const p=point(lat,lon),q=point(lat+aa,lon),r1=point(lat+aa,lon+bb),s=point(lat,lon+bb);
   for(const vertex of[p,q,r1,p,r1,s])this.data.push(...vertex,...rgb.map(v=>v*(.75+.22*Math.sin(lat+aa))));
  }
 }
 robot(x,y,z,color,scale=1,seated=false){
  const b=(xx,yy,zz,w,h,d,c)=>this.box(x+xx*scale,y+yy*scale,z+zz*scale,w*scale,h*scale,d*scale,c);
  b(-.18,0,seated?.25:0,.16,.35,.3,"#282747");b(.18,0,seated?.25:0,.16,.35,.3,"#282747");
  b(0,.32,0,.54,.6,.35,"#30315e");b(0,.53,.21,.18,.12,.03,color);
  b(-.42,.45,.1,.17,.45,.17,"#69739f");b(.42,.45,.1,.17,.45,.17,"#69739f");
  this.sphere(x,y+1.1*scale,z,.34*scale,color);
  b(0,.97,.3,.45,.23,.04,"#080d1e");
  b(-.12,1.06,.33,.07,.07,.04,"#dcffff");b(.12,1.06,.33,.07,.07,.04,"#dcffff");
  b(-.36,1.03,0,.12,.3,.3,"#151b30");b(.36,1.03,0,.12,.3,.3,"#151b30");
  b(0,1.43,0,.06,.15,.06,color);
 }
 ring(x,y,z,r,color){
  for(let i=0;i<36;i++){const a=i*Math.PI*2/36;this.box(x+Math.cos(a)*r,y,z+Math.sin(a)*r,.18,.07,.18,color);}
 }
 building(x,z,h,color,width=2.3){
  this.box(x,0,z,width+1,.35,width+1,"#282445");this.box(x,.35,z,width,h,width,"#141b37");
  for(let row=0;row<Math.floor(h/.42);row++)for(let col=0;col<4;col++){
   const yy=.55+row*.42,xx=x-width*.37+col*width*.25;
   if((row+col*3)%7!==0){this.box(xx,yy,z+width*.505,.15,.2,.04,(row+col)%3===0?"#ffdca3":color);this.box(x+width*.505,yy,z-width*.37+col*width*.25,.04,.2,.15,color);}
  }
  this.box(x,h+.35,z,width+.2,.17,width+.2,color);
 }
 city(){
  this.data=[];this.labels=[];
  this.box(0,-.8,3,45,.75,42,"#090f29");this.box(0,-.05,3,38,.25,38,"#171b37");
  for(let i=-19;i<=19;i+=3){this.box(i,.22,3,.035,.03,37,"#273466");this.box(0,.22,i,38,.03,.035,"#273466");}
  for(let i=0;i<44;i++){const a=i*Math.PI*2/44;this.box(Math.cos(a)*16,.24,3+Math.sin(a)*16,.32,.05,.32,"#b390ff");}
  for(let i=0;i<40;i++){const x=-28+i*1.45,h=1.5+(i*7%11)*.48;this.building(x,-21,h,"#535182",.8);}
  this.building(0,-3,11,"#ffd278",3.3);this.building(0,-3,12.3,"#ffdb8c",1.6);this.ring(0,13.2,-3,2,"#ffe5a7");
  this.box(0,12.8,-3,.12,18,.12,"#fff1cb");this.ring(0,.3,-3,4,"#4eb8e2");
  this.labels.push({x:0,y:15,z:-3,name:"THE VAULT",special:"vault"});
  for(const district of bridge.districts){
   const [x,z]=positions[district.name]||[0,0],h=district.name.endsWith("!")?4.5:7;
   this.building(x,z,h,district.color);this.ring(x,h+.6,z,1.25,district.color);this.robot(x,h+.65,z,district.color,.75);
   this.box(x,h+2.1,z,.055,4,.055,district.color);
   const def=bridge.definitions.find(row=>row.name===district.name);
   for(let j=0;j<def.bots.length;j++)this.robot(x-1.4+j*.9,.35,z+2.1,district.color,.48);
   this.robot(x+2,.35,z,district.color,.65);
   this.labels.push({x,y:h+2.4,z,name:district.name});
  }
  this.building(0,13,6,"#a670ff",3);this.robot(0,6.5,13,"#bc8aff",1.05);this.ring(0,7.2,13,2,"#c697ff");
  this.labels.push({x:0,y:3.5,z:13,name:"BIG MANAGER",special:"manager"});
  this.cityBase=this.data.slice();this.upload();this.draw();
 }
 marketBackdrop(bars,key){
  if(this.backdropKey===key||!this.cityBase)return;this.backdropKey=key;this.data=this.cityBase.slice();
  const prices=bars.map(row=>Number(row.close)).filter(value=>Number.isFinite(value)&&value>0).slice(-48);
  if(prices.length>1){const lo=Math.min(...prices),spread=Math.max(...prices)-lo||1;
   for(let i=1;i<prices.length;i++){const ax=-24+(i-1)*48/(prices.length-1),bx=-24+i*48/(prices.length-1),ay=8+(prices[i-1]-lo)*5/spread,by=8+(prices[i]-lo)*5/spread;
    const vertices=[[ax,ay-.04,-23],[bx,by-.04,-23],[bx,by+.04,-23],[ax,ay-.04,-23],[bx,by+.04,-23],[ax,ay+.04,-23]];
    for(const vertex of vertices)this.data.push(...vertex,...hex("#5fcaed"));
   }
  }this.upload();this.draw();
 }
 office(symbol){
  this.symbol=symbol;this.data=[];
  const color=bridge.districts.find(row=>row.name===symbol)?.color||"#b488ff";
  this.box(0,-.15,0,9,.2,7,"#19213c");this.box(0,0,-3.3,9,4,.12,"#161830");
  this.box(-4.4,0,0,.12,4,6.5,"#0e1a32");this.box(4.4,0,0,.12,4,6.5,"#0e1a32");
  for(let x=-3;x<=3;x+=1.1){this.box(x,.9,-3.2,.04,2.8,.04,color);this.box(x,.9,-3.1,.65,1.4,.03,"#273659");}
  this.box(0,1.05,-.05,5,.17,1.8,"#323153");
  for(const x of[-2,2])for(const z of[-.7,.6])this.box(x,0,z,.12,1.05,.12,"#647099");
  for(const x of[-1.6,0,1.6]){
   this.box(x,1.1,-.45,.1,.55,.1,"#657595");this.box(x,1.45,-.45,1.45,1.05,.16,"#111626");
   this.box(x,1.51,-.35,1.32,.91,.03,"#122a3c");
  }
  this.box(0,.8,1.95,1.2,.55,.17,"#383761");this.box(0,.45,1.65,1.4,.16,.85,"#2d3452");
  this.robot(0,.6,1.25,color,1,true);
  this.box(0,1.23,.45,1,.035,.4,"#4b4d73");
  for(let i=0;i<8;i++)this.box(-1.8+i*.48,1.25,.52,.16,.02,.1,i%2?color:"#ffc874");
  this.officeBase=this.data.slice();this.upload();this.draw();
 }
 officeBars(bars){
  if(!this.officeBase)return;this.data=this.officeBase.slice();
  const usable=bars.filter(b=>Number.isFinite(Number(b.close))).slice(-30),prices=usable.map(b=>Number(b.close));
  if(prices.length>1){
   const low=Math.min(...prices),range=Math.max(...prices)-low||1;
   for(let i=0;i<prices.length;i++)this.box(-.59+i*1.18/(prices.length-1),1.63+(prices[i]-low)*.57/range,-.31,.026,.026,.02,"#65efc1");
  }
  this.upload();this.draw();
 }
 upload(){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(this.data),gl.STATIC_DRAW);this.vertices=this.data.length/6;}
 project(x,y,z){
  const p=[x,y,z,1],m=this.matrix;if(!m)return null;const out=[0,0,0,0];for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[row]+=m[k*4+row]*p[k];
  if(out[3]<=0)return null;return{x:(out[0]/out[3]*.5+.5)*this.canvas.clientWidth,y:(-.5*out[1]/out[3]+.5)*this.canvas.clientHeight};
 }
 draw(){
  if(this.failed)return;const canvas=this.canvas;if(!canvas.clientWidth||!canvas.clientHeight)return;
  const gl=this.gl,dpr=Math.min(window.devicePixelRatio||1,1.7),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,3,gl.FLOAT,false,24,0);
  gl.enableVertexAttribArray(this.color);gl.vertexAttribPointer(this.color,3,gl.FLOAT,false,24,12);
  const t=this.target,r=this.distance,eye=[t[0]+r*Math.sin(this.yaw)*Math.cos(this.pitch),t[1]+r*Math.sin(this.pitch),t[2]+r*Math.cos(this.yaw)*Math.cos(this.pitch)];
  this.matrix=cameraMatrix(eye,t,w/h);gl.uniformMatrix4fv(this.camera,false,new Float32Array(this.matrix));
  gl.uniform1f(this.pulse,byId("world").dataset.motion==="on" && !document.hidden ? .12 + .10*Math.sin(performance.now()/700) : 0);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,this.vertices||0);canvas.dataset.ready="true";
  if(this.kind==="city")placeLabels();
 }
 installCamera(){
  let drag=null,moved=false,start=null;
  this.canvas.addEventListener("pointerdown",event=>{drag={x:event.clientX,y:event.clientY};start={...drag};moved=false;this.canvas.setPointerCapture(event.pointerId);});
  this.canvas.addEventListener("pointermove",event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(event.clientX-start.x)+Math.abs(event.clientY-start.y)>3)moved=true;
   this.yaw+=dx*.006;this.pitch=Math.max(.12,Math.min(1.3,this.pitch+dy*.004));drag={x:event.clientX,y:event.clientY};this.draw();});
  this.canvas.addEventListener("pointerup",event=>{drag=null;if(this.kind==="city"&&!moved){const rect=this.canvas.getBoundingClientRect();let chosen=null,distance=55;
   for(const label of this.labels){if(label.special)continue;const p=this.project(label.x,label.y-2,label.z);if(!p)continue;const dist=Math.hypot(p.x-(event.clientX-rect.left),p.y-(event.clientY-rect.top));if(dist<distance){chosen=label.name;distance=dist;}}
   if(chosen)bridge.select(chosen,false);
  }});
  this.canvas.addEventListener("pointercancel",()=>{drag=null;});
  this.canvas.addEventListener("wheel",event=>{if(!event.ctrlKey)return;event.preventDefault();this.distance=Math.max(this.kind==="city"?24:5,Math.min(this.kind==="city"?80:14,this.distance+event.deltaY*.03));this.draw();},{passive:false});
  this.canvas.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","-"].includes(event.key))return;event.preventDefault();if(event.key==="ArrowLeft")this.yaw-=.12;if(event.key==="ArrowRight")this.yaw+=.12;if(event.key==="ArrowUp")this.pitch=Math.min(1.3,this.pitch+.08);if(event.key==="ArrowDown")this.pitch=Math.max(.12,this.pitch-.08);if(event.key==="+")this.distance=Math.max(24,this.distance-3);if(event.key==="-")this.distance=Math.min(80,this.distance+3);this.draw();});
 }
}
let city=null,office=null,snapshot=null,online=false;
const labels=new Map();
function placeLabels(){
 if(!city)return;
 for(const item of city.labels){
  const node=labels.get(item.name),p=city.project(item.x,item.y,item.z);if(!node||!p)continue;
  node.style.left=p.x+"px";node.style.top=p.y+"px";node.hidden=p.x<20||p.x>city.canvas.clientWidth-20||p.y<20||p.y>city.canvas.clientHeight-20;
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
  city.city();byId("world").dataset.view="3d";byId("city-view").textContent="Use city map";
  byId("city-render-note").textContent="Background line uses selected team's recorded closes · drag to orbit · arrow keys rotate · select a tower sign to enter";
 }catch(error){byId("world").dataset.view="map";byId("city-view").disabled=true;byId("city-render-note").textContent="3D rendering unavailable on this device. The interactive city map remains available.";}
 byId("city-view").addEventListener("click",()=>{const three=byId("world").dataset.view!=="3d";byId("world").dataset.view=three?"3d":"map";byId("city-view").textContent=three?"Use city map":"Use 3D city";if(three)city?.draw();});
 byId("city-camera-reset").addEventListener("click",()=>{if(city){city.yaw=.52;city.pitch=.56;city.distance=51;city.target=[0,2,4];city.draw();}});
 for(const [id,delta]of[["city-zoom-in",-4],["city-zoom-out",4]])byId(id).addEventListener("click",()=>{if(city){city.distance=Math.max(24,Math.min(80,city.distance+delta));city.draw();}});
}
window.Laylow3D={
 update(data,connected){snapshot=data;online=connected;for(const [name,node]of labels){if(node.tagName!=="BUTTON")continue;const team=data.teams?.find(row=>row.name===name)||{};
  node.children[1].textContent=connected?team.controls?.profit_brake?.status==="PROFIT_BRAKE_HIT"?"PROFIT BRAKE HIT":team.health==="fresh"?team.worker_state:"Not recently observed":"Last snapshot";
  const worker=data.payroll?.workers?.find(row=>row.team_name===name),amount=worker?.net_cents;
  node.lastChild.textContent=Number.isFinite(amount)?(amount>=0?"+":"−")+"$"+(Math.abs(amount)/100).toFixed(2)+" net today":"Net not recorded";
  node.lastChild.style.color=amount>0?"#65efc1":amount<0?"#ff718b":"#b8c5da";
  node.dataset.selected=String(bridge.selected()===name);
 }
 const total=data.payroll?.total_net_cents;
 if(labels.has("THE VAULT"))labels.get("THE VAULT").textContent=Number.isFinite(total)?"THE VAULT · "+(total>=0?"+":"−")+"$"+(Math.abs(total)/100).toFixed(2)+" net today":"THE VAULT · Net not recorded";
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
