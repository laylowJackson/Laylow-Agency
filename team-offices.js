/* Hand-built shared team interiors. Workstations reflect observed or simulated evidence. */
(()=>{'use strict';
const themes={
 SPY:{name:'Emerald boardroom',accent:'#75edba',floor:'#173330',wall:'#10262b',metal:'#487b71',feature:'boardroom',desks:[[-4,-1.8,.35],[4,-1.8,-.35],[0,2.5,0]]},
 QQQ:{name:'Aurora technology loft',accent:'#9f9aff',floor:'#21233e',wall:'#15172f',metal:'#66638b',feature:'aurora',desks:[[-4,-.8,.7],[4,-.8,-.7],[0,3,0]]},
 AAPL:{name:'Glass innovation studio',accent:'#81e9e3',floor:'#526c79',wall:'#273d4c',metal:'#b9d4d9',feature:'studio',desks:[[-4,-1.7,.3],[4,-1.7,-.3],[-3.6,2.6,.3],[3.6,2.6,-.3]]},
 TSLA:{name:'Crimson engineering garage',accent:'#ff627c',floor:'#30262e',wall:'#241b2d',metal:'#657184',feature:'garage',desks:[[-4.5,-1,.6],[4.5,-1,-.6],[-3.6,2.8,.15],[3.6,2.8,-.15]]},
 'NQ1!':{name:'Orbital command center',accent:'#69caff',floor:'#142f44',wall:'#101f35',metal:'#567a98',feature:'orbital',desks:[[-4.6,-1.8,.5],[4.6,-1.8,-.5],[0,3,0]]},
 'ES1!':{name:'Walnut exchange hall',accent:'#f3c788',floor:'#3b302e',wall:'#26272e',metal:'#95775a',feature:'exchange',desks:[[-4,-1,0],[4,-1,0],[0,3.2,0]]},
 'MGC1!':{name:'Golden garden lab',accent:'#c9e88c',floor:'#293b30',wall:'#162f30',metal:'#899b63',feature:'garden',desks:[[-4.2,-1.4,.6],[4.2,-1.4,-.6],[0,2.8,0]]},
 'MNQ1!':{name:'Violet cyber lab',accent:'#d28bff',floor:'#2b2145',wall:'#1a1636',metal:'#806395',feature:'cyber',desks:[[-4.3,-2,.4],[4.3,-.4,-.4],[-2.3,3,.2]]},
 'MES1!':{name:'Blue strategy arena',accent:'#63e2f2',floor:'#163847',wall:'#132633',metal:'#578997',feature:'arena',desks:[[-4.2,-1.6,.7],[4.2,-1.6,-.7],[0,3.1,0]]},
 'GC1!':{name:'Bullion vault office',accent:'#ffd579',floor:'#453a28',wall:'#2b2830',metal:'#a58a56',feature:'bullion',desks:[[-4.4,-1.5,.5],[4.4,-1.5,-.5],[0,2.9,0]]}
};
function point(p,x,y,z){const c=Math.cos(p.angle),s=Math.sin(p.angle);return[p.x+x*c+z*s,y,p.z-x*s+z*c];}
function transformed(scene,p,build){const start=scene.data.length;build();const c=Math.cos(p.angle),s=Math.sin(p.angle);for(let i=start;i<scene.data.length;i+=10){const x=scene.data[i],z=scene.data[i+2],nx=scene.data[i+6],nz=scene.data[i+8];scene.data[i]=p.x+x*c+z*s;scene.data[i+2]=p.z-x*s+z*c;scene.data[i+6]=nx*c+nz*s;scene.data[i+8]=-nx*s+nz*c;}}
function screen(scene,id,p,title,lines,bars,accent){const xyz=point(p,0,1.46,-.5);scene.display(id,...xyz,1.75,.88,title,lines,bars,accent);const item=scene.displays.get(id),c=Math.cos(p.angle),s=Math.sin(p.angle);for(let i=0;i<item.geometry.length;i+=5){const x=item.geometry[i]-xyz[0],z=item.geometry[i+2]-xyz[2];item.geometry[i]=xyz[0]+x*c+z*s;item.geometry[i+2]=xyz[2]-x*s+z*c;}}
function plant(s,x,z,color){s.cylinder(x,0,z,.34,.55,'#768388');s.box(x,.4,z,.04,1.1,.04,'#397368');for(let i=0;i<5;i++){const a=i*Math.PI*2/5;s.sphere(x+Math.sin(a)*.25,1.05+i*.08,z+Math.cos(a)*.25,.25,color);}}
function desk(s,p,t){transformed(s,p,()=>{
 s.box(0,.025,0,3.1,.03,2.8,'#101d2d');s.box(0,.96,-.25,2.55,.12,1.3,t.metal);s.box(0,1.08,-.25,2.5,.035,1.27,'#172739');s.box(0,1.01,.41,2.48,.04,.025,p.color,.9);
 for(const x of[-1.06,1.06])s.box(x,.02,-.25,.085,.94,1.12,t.metal);
 s.box(0,1.2,-.56,.07,.25,.07,t.metal);s.box(0,1.44,-.56,1.88,1,.12,'#030914');
 s.box(0,1.115,.17,.85,.035,.28,'#637c8e');for(let i=0;i<9;i++)s.box(-.35+i*.087,1.15,.17,.042,.01,.19,i%3?p.color:'#b9d9e4',.3);
 s.cylinder(1,1.115,.14,.09,.19,'#d2d8e6');s.box(-1.03,1.11,-.3,.18,.32,.23,'#0a1324');s.sphere(-1.03,1.28,-.18,.055,p.color,.4);
 s.cylinder(0,.035,1,.39,.05,t.metal);s.cylinder(0,.085,1,.06,.42,'#99acbd');s.box(0,.49,1,.87,.12,.7,'#24364a');s.box(0,.60,1.37,.91,.85,.12,t.metal);
 s.robot(0,.6,.92,p.color,.86,true,Math.PI);s.ring(0,.018,1,.65,p.color,.018,.7);
 });}
function feature(s,t){const a=t.accent;
 if(t.feature==='boardroom'){s.box(0,.3,.1,.6,.5,.6,t.metal);s.cylinder(0,.8,.1,1.6,.12,'#396559',1.6,0,48);s.ring(0,.93,.1,1.5,a,.018,.8);}
 if(t.feature==='aurora'){for(const r of[1.35,1.65]){s.ring(0,3.9,0,r,a,.045,.9);s.ring(0,4.2,0,r*.75,'#64cbdc',.03,.6);}s.cylinder(0,.1,0,.75,.7,t.metal);s.sphere(0,1.4,0,.42,a,.5);}
 if(t.feature==='studio'){s.box(0,.06,.25,3,.55,1.5,'#b7cbd1');s.box(0,.62,.25,3,.04,1.5,'#edf5ef');s.ring(0,.68,.25,.63,a,.025,.8);for(const x of[-6,6]){s.box(x,0,-.6,.08,3.8,7,'#8aabb7');for(let z=-3.4;z<3;z++)s.box(x,.7,z,.085,2.6,.04,a,.35);}}
 if(t.feature==='garage'){s.box(0,.03,.4,3.5,.18,2,'#45526a');s.box(0,.21,.4,2.5,.55,1.3,'#9d2644');s.box(0,.76,.1,1.4,.42,.85,'#273f58');for(const x of[-1.2,1.2])for(const z of[-.1,.9])s.sphere(x,.36,z,.25,'#0a1426');for(const x of[-6.6,6.6]){s.box(x,.2,-.5,.7,2.6,3.8,'#455166');for(let z=-2;z<=1;z+=.5)s.box(x,.35,z,.73,.045,.3,'#ffc36a',.25);}}
 if(t.feature==='orbital'){s.cylinder(0,.03,.15,1.1,.18,t.metal);s.ring(0,.25,.15,1.05,a,.05,1);s.cylinder(0,.26,.15,.68,.45,'#244f70');s.ring(0,1,.15,.78,a,.03,.85);s.sphere(0,1,.15,.3,'#4d97c2',.6);for(const x of[-6.5,6.5]){s.box(x,0,-3,.2,4.5,.2,t.metal);s.box(x,4.5,0,.1,.08,6,a,.8);}}
 if(t.feature==='exchange'){for(const x of[-6.8,6.8])for(const z of[-4,-1,2]){s.box(x,0,z,.34,4.5,.34,'#a88a67');s.box(x,4.5,z,.6,.15,.6,t.metal);}s.box(0,.1,.3,2.8,.85,1.2,'#745744');s.box(0,.96,.3,3,.05,1.35,'#c1a181');}
 if(t.feature==='garden'){for(const x of[-6,6])for(const z of[-3.7,0,3.7])plant(s,x,z,'#71aa81');s.cylinder(0,.03,.2,1.25,.35,'#5b7864');s.cylinder(0,.38,.2,1.1,.05,'#9cccac');s.sphere(0,1,.2,.33,'#ffdc7b',.55);s.ring(0,1.48,.2,.6,a,.024,.8);}
 if(t.feature==='cyber'){for(const x of[-6.5,6.5]){for(let z=-4;z<3;z+=1.5){s.box(x,0,z,.8,2.9,1.2,'#151b33');for(let j=0;j<8;j++){s.box(x,.3+j*.29,z+.61,.65,.15,.02,'#354260');s.box(x+.2,.35+j*.29,z+.63,.04,.025,.02,a,.9);}}}s.cylinder(0,.02,.4,.8,1,'#3b3264');s.ring(0,1.05,.4,.74,a,.03,.9);}
 if(t.feature==='arena'){for(let i=0;i<3;i++)s.box(0,.03+i*.15,-5.6+i*.35,5,.15,.4,t.metal);for(const r of[1.4,1.7])s.ring(0,.025,.3,r,a,.022,.8);s.box(0,.03,.3,1.3,.55,1.3,'#36778a');s.box(0,.58,.3,1.4,.09,1.4,t.metal);}
 if(t.feature==='bullion'){s.cylinder(0,0,.4,1.45,.12,'#877b64');s.ring(0,.14,.4,1.4,a,.04,.8);for(let row=0;row<3;row++)for(let col=0;col<3-row;col++)s.box((col-(2-row)/2)*.5,.16+row*.21,.4,.45,.18,.85,'#c89b48',.22);for(const x of[-6.5,6.5]){s.box(x,0,-2,.85,3.5,4.2,'#786957');for(let y=.6;y<3.5;y+=.65)s.box(x,y,-2,.9,.05,4.2,a,.4);}}
}
function build(s,symbol,bridge){
 const t=themes[symbol]||themes.AAPL,def=bridge.definitions.find(d=>d.name===symbol);s.symbol=symbol;s.theme=t;s.effects=false;s.data=[];s.officeBarKey=null;s.crew=[];for(const d of s.displays.values())s.gl.deleteTexture(d.texture);s.displays.clear();
 s.yaw=.2;s.pitch=.48;s.distance=17;s.target=[0,1.3,-.3];
 s.canvas.dataset.theme=t.feature;s.canvas.dataset.team=symbol;s.canvas.dataset.crewCount=String(1+def.bots.length);s.canvas.dataset.camera='wide';
 s.box(0,-.22,0,16,.22,14,t.floor);s.box(0,0,-6.6,16,5.4,.16,t.wall);
 for(let x=-7.5;x<=7.5;x+=1.5)for(let z=-5.5;z<6;z+=1.5){s.box(x,.004,z,1.43,.025,1.43,t.floor);s.box(x,.034,z-.65,1.1,.008,.025,t.metal,.12);}
 for(const x of[-7.85,7.85]){s.box(x,0,-.7,.15,4.5,11.5,t.wall);s.box(x*.99,.1,-.7,.04,.035,11.5,t.accent,.85);}
 s.box(0,1.15,-6.49,14.9,3.75,.055,'#06162a');for(let i=0;i<30;i++){const x=-7+i*.48,h=.6+(i*7%13)*.18;s.box(x,1.15,-6.44,.33,h,.035,'#274763');for(let j=0;j<h/.25;j++)s.box(x,1.25+j*.25,-6.4,.08,.08,.012,j%4?t.accent:'#cfebf1',.45);}
 for(const x of[-7,-3.5,0,3.5,7])s.box(x,1.15,-6.31,.08,3.8,.12,t.metal);
 s.box(0,5.04,-6.2,14.5,.06,.06,t.accent,1);
 for(const x of[-6,6]){s.box(x,4.6,-.6,.11,.12,10,t.metal);s.box(x,4.57,-.6,.04,.025,9.9,t.accent,.8);}
 s.display('team-sign',0,3.6,-6.24,5.8,1.15,symbol+' / '+t.name.toUpperCase(),['SHARED TEAM OFFICE',def.bots.length+' SPECIALISTS + TEAM MANAGER','Select a robot to inspect its desk'],[],t.accent);
 const coords=[[0,-4.1,0],...t.desks];s.crew=['Team Manager',...def.bots].map((name,i)=>({name,x:coords[i][0],z:coords[i][1],angle:coords[i][2],color:i===0?t.accent:['#75e8cc','#a7b7ff','#ffd18b','#f997bf'][i-1]}));
 for(const p of s.crew)desk(s,p,t);feature(s,t);
 if(!['garden','cyber','bullion'].includes(t.feature))for(const x of[-6.6,6.6])plant(s,x,4.5,'#397d79');
 s.box(-5.9,2.45,-6.26,2.6,1.1,.09,'#061223');s.display('academy-desk',-5.9,2.5,-6.20,2.5,1,'NIGHT SCHOOL',['SYNTHETIC RESEARCH','Separate from account'],[],t.accent);
 s.box(5.8,2.45,-6.26,2.6,1.1,.09,'#061223');s.display('team-results',5.8,2.5,-6.20,2.5,1,'TEAM RESULTS',['Awaiting recorded ledger'],[],t.accent);
 s.officeBase=s.data.slice();s.upload();s.draw();return t;
}
function update(s,snapshot,online,bars){const team=snapshot?.teams?.find(t=>t.name===s.symbol)||{},analysis=team.analysis||{},worker=snapshot?.payroll?.workers?.find(w=>w.team_name===s.symbol)||{},manager=snapshot?.managers?.find(m=>m.team_name===s.symbol),source=snapshot?.practice?'SYNTHETIC PRACTICE':online?'RECORDED DATA':'SOURCE NOT CONNECTED';
 for(const [i,p]of s.crew.entries()){const vote=analysis.votes?.find(v=>v.name===p.name);screen(s,'crew-'+i,p,p.name.toUpperCase(),[i===0?(team.worker_state||'WAITING'):(vote?.direction||'WAITING'),i===0?'Team coordination':vote?.reason||'Awaiting source evidence',source],bars,p.color);}
 s.display('team-results',5.8,2.5,-6.20,2.5,1,'TEAM LEDGER',[Number.isFinite(worker.net_cents)?'$'+(worker.net_cents/100).toFixed(2):'NOT RECORDED',Number.isFinite(worker.closed_trades)?worker.closed_trades+' closed trades':'No closed-trade evidence',source],[],s.theme.accent);s.draw();}
function focus(s,name,view='desk'){const p=s.crew.find(p=>p.name===name)||s.crew[0];if(!p)return;if(view==='screens'){s.yaw=p.angle;s.pitch=.23;s.distance=4.5;s.target=point(p,0,1.8,-.45);}else{s.yaw=p.angle+Math.PI+.4;s.pitch=.45;s.distance=6.4;s.target=[p.x,1.45,p.z+.3];}s.canvas.dataset.camera=view;s.draw();}
function labels(s){const picked=document.getElementById('office-worker').value,selected=s.crew.find(p=>p.name===picked)||s.crew[0],occupied=[];
 const bubble=document.getElementById('office-speech'),sp=selected&&s.project(...point(selected,0,2.6,.92));if(bubble&&sp){bubble.hidden=sp.x<10||sp.x>s.canvas.clientWidth-10||sp.y<65||sp.y>s.canvas.clientHeight-45;bubble.style.left=Math.max(100,Math.min(s.canvas.clientWidth-100,sp.x))+'px';bubble.style.top=Math.max(125,sp.y)+'px';if(!bubble.hidden){const x=parseFloat(bubble.style.left),y=parseFloat(bubble.style.top),w=bubble.offsetWidth,h=bubble.offsetHeight;occupied.push({l:x-w/2,r:x+w/2,t:y-h,b:y});}}
 for(const button of document.querySelectorAll('#office-crew [data-office-worker]')){const p=s.crew.find(p=>p.name===button.dataset.officeWorker),v=p&&s.project(...point(p,0,2.57,.92));button.hidden=!v||p.name===picked||v.x<8||v.x>s.canvas.clientWidth-8||v.y<70||v.y>s.canvas.clientHeight-55;if(button.hidden)continue;const w=button.offsetWidth,h=button.offsetHeight,x=Math.max(w/2+8,Math.min(s.canvas.clientWidth-w/2-8,v.x));let y=v.y;let rect={l:x-w/2,r:x+w/2,t:y-h,b:y};if(occupied.some(o=>rect.l<o.r&&rect.r>o.l&&rect.t<o.b&&rect.b>o.t)){y+=h+12;rect={l:x-w/2,r:x+w/2,t:y-h,b:y};}button.style.left=x+'px';button.style.top=Math.min(s.canvas.clientHeight-65,y)+'px';occupied.push(rect);}
}
window.LaylowTeamOffices={themes,build,update,focus,labels};
})();
