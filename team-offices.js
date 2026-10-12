/* Hand-built shared team interiors. Workstations reflect observed or simulated evidence. */
(()=>{'use strict';
const themes={
 SPY:{name:'Emerald boardroom',accent:'#75edba',floor:'#173330',wall:'#10262b',metal:'#487b71',feature:'boardroom',desks:[[-4,-1.8,.35],[4,-1.8,-.35],[0,2.5,0]]},
 QQQ:{name:'Aurora technology loft',accent:'#9f9aff',floor:'#21233e',wall:'#15172f',metal:'#66638b',feature:'aurora',desks:[[-4,-.8,.7],[4,-.8,-.7],[0,3,0]]},
 AAPL:{name:'Glass innovation studio',accent:'#81e9e3',floor:'#2c414c',wall:'#273d4c',metal:'#b9d4d9',feature:'studio',desks:[[-4,-1.7,.3],[4,-1.7,-.3],[-3.6,2.6,.3],[3.6,2.6,-.3]]},
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
function screen(scene,id,p,title,lines,bars,accent){const xyz=point(p,0,1.46,-.49);scene.display(id,...xyz,1.75,.88,title,lines,bars,accent);const item=scene.displays.get(id),c=Math.cos(p.angle),s=Math.sin(p.angle);for(let i=0;i<item.geometry.length;i+=5){const x=item.geometry[i]-xyz[0],z=item.geometry[i+2]-xyz[2];item.geometry[i]=xyz[0]+x*c+z*s;item.geometry[i+2]=xyz[2]-x*s+z*c;}}
function plant(s,x,z,color){
 s.cylinder(x,.04,z,.29,.43,'#9da69b',.36);s.cylinder(x,.475,z,.31,.025,'#203c31');
 for(let i=0;i<7;i++){const a=i*2.4,h=.72+i*.105,xx=x+Math.sin(a)*.19,zz=z+Math.cos(a)*.19;s.box(xx,.48,zz,.018,h-.4,.018,'#486c4b');s.ellipsoid(xx,h,zz,.12,.27,.10,i%2?color:'#538d75');}
}
function flagshipInterior(s,t){
 const a=t.accent,warm=['boardroom','exchange','bullion','garden'].includes(t.feature),oak=warm?'#aa8259':'#7696a7',tech=['orbital','cyber','arena','garage'].includes(t.feature);
 s.roundedBox(0,-.56,0,17.2,.39,15.2,'#0b152b',.50);s.roundedBox(0,-.17,0,16.9,.15,14.9,'#324359',.45);
 s.roundedBox(0,-.02,0,16.5,.02,14.5,warm?'#a08566':tech?'#27364e':'#789298',.40);
 // Perimeter marble or alloy tiles, a luminous reveal, and a clear circulation route.
 for(const x of[-7.4,7.4])for(let z=-6.4;z<6.7;z+=.78){s.box(x,.006,z,1.2,.018,.73,warm?'#bcaa8c':tech?'#40576c':'#a6bfc0');s.box(x,.026,z,.018,.01,.70,a,.24);}
 for(const z of[-7.2,7.2]){s.box(0,-.055,z,15.8,.024,.03,a,.65);s.box(0,.01,z,15.8,.04,.12,t.metal);}
 for(const x of[-8.12,8.12])s.box(x,-.055,0,.03,.024,14.3,a,.65);
 s.box(0,0,-6.6,16.5,6.65,.22,t.wall);
 // Deep command-wall surround, architectural fins and a floating illuminated lintel.
 s.roundedBox(0,.91,-6.32,14.8,4.82,.20,'#091322',.13);s.roundedBox(0,1.05,-6.25,14.5,4.55,.08,t.metal,.08);
 s.roundedBox(0,1.13,-6.21,14.35,4.38,.025,'#050d1b',.055);
 for(const y of[1.13,5.50])s.box(0,y,-6.195,14.38,.032,.018,a,.75);
 s.box(0,5.68,-6.32,15.7,.20,.5,t.metal);s.box(0,5.67,-6.05,15.4,.02,.025,'#fff0cf',.6);
 s.display('room-sign',0,5.98,-6.21,7.8,.52,t.name.toUpperCase(),[s.symbol+' / LAYLOW AGENCY'],[],a);
 for(const x of[-7.65,7.65]){s.box(x,.10,-6.35,.26,5.4,.35,t.metal);for(let y=.4;y<5.4;y+=.32)s.box(x,y,-6.13,.29,.08,.035,a,.20);}
 // Panoramic city bays are procedural scenery; trading evidence stays on the trade wall.
 for(const x of[-7.98,7.98]){
  s.box(x,0,-3.5,.17,.62,5.7,t.wall);s.box(x,4.86,-3.5,.22,.20,5.7,oak);
  s.skylineWindow('skyline-'+x,x*.991,.64,-3.5,5.65,4.2,x<0?Math.PI/2:-Math.PI/2,a);
  for(let z=-6.3;z<-.5;z+=1.42){s.box(x*.979,.60,z,.075,4.3,.10,t.metal);s.box(x*.970,.70,z,.025,3.9,.028,'#b8d9dd',.18);}
  s.box(x*.968,.59,-3.5,.28,.08,5.75,oak);s.box(x*.975,4.85,-3.5,.09,.045,5.7,a,.4);
  s.roundedBox(x,.04,3.25,.16,.42,7.3,t.wall,.06);s.box(x,.47,3.25,.11,.025,7.2,a,.35);
 }
 // Layered workstation pods. Every robot remains in the same shared office.
 for(const q of s.crew)transformed(s,q,()=>{
  s.roundedBox(0,.007,.15,3.50,.022,3.3,warm?'#365b58':'#22384b',.28);
  for(const x of[-1.70,1.70])s.box(x,.038,.15,.020,.01,3.02,q.color,.35);
  s.box(0,.038,1.76,2.85,.010,.025,q.color,.5);
 });
 // Different district architecture, not just different colors.
 if(tech){
  for(const x of[-6.9,6.9]){s.box(x,.04,-.5,.28,4.4,.28,'#233750');s.box(x*.98,.25,-.36,.035,4.1,.03,a,.65);s.rod([x,4.4,-.5],[x*.67,5.6,-1.5],.10,t.metal);s.rod([x*.67,5.6,-1.5],[x*.20,5.6,-1.5],.055,a,.6);}
  for(let i=0;i<3;i++){const z=3.9+i*.52;s.box(0,.007,z,2.15,.015,.34,'#374f67');s.box(0,.025,z,1.9,.008,.03,a,.5);}
 }else if(t.feature==='studio'||t.feature==='aurora'){
  for(const x of[-6.8,6.8]){s.rod([x,.03,-.5],[x,4.6,-.5],.09,'#c4dedb');s.rod([x,4.6,-.5],[x*.73,5.4,-1.5],.07,'#bedbd9');s.rod([x*.73,5.4,-1.5],[x*.4,5.4,-1.5],.035,a,.6);}
  for(let x=-6;x<7;x+=1.3)s.box(x,.004,5.95,1.24,.01,1.8,'#91abae');
 }else{
  for(const x of[-6.85,6.85]){s.box(x,.025,-.3,.30,4.6,.30,'#81664b');s.box(x,4.55,-1.9,.39,.18,3.6,oak);s.box(x,4.52,-1.9,.10,.024,3.4,'#ffe1ac',.6);}
  for(let j=0;j<10;j++)s.box(-6.15+j*.36,.04,-.9,.12,2.5,.15,'#a18a65');
 }
 // Club lounge: stitched cushions, brass side tables, warm reading lights and a rug.
 s.roundedBox(-5.55,.02,4.85,3.45,.02,3.15,warm?'#33585e':'#344265',.26);
 for(const x of[-6.25,-4.85]){s.roundedBox(x,.14,5.3,1.30,.30,1.25,'#253b53',.18);s.roundedBox(x,.44,5.3,1.20,.20,1.10,warm?'#87b3a5':'#9ba8d1',.18);s.roundedBox(x,.64,5.8,1.24,.57,.20,warm?'#557d75':'#6578a1',.10);s.roundedBox(x-.42,.66,5.15,.25,.15,.8,'#869eaa',.06);s.roundedBox(x+.42,.66,5.15,.25,.15,.8,'#869eaa',.06);}
 s.roundedBox(-5.55,.36,3.80,2.4,.075,.93,oak,.25);for(const x of[-6.35,-4.75])s.box(x,.03,3.8,.055,.33,.55,t.metal);
 s.box(-5.8,.44,3.8,.46,.04,.32,'#25394f');s.cylinder(-5.25,.44,3.8,.10,.15,'#e7ddd0');
 s.rod([-7.05,.04,5.7],[-7.05,2.8,5.7],.028,oak);s.cylinder(-7.05,2.78,5.7,.27,.30,'#f6d5b0',.20,.55,20);
 // Espresso bar with ribbed front, individually modeled cups, backsplash and shelves.
 s.roundedBox(6.25,.04,5.25,2.5,.87,1.15,oak,.09);s.roundedBox(6.25,.91,5.25,2.6,.065,1.25,'#d5e1db',.10);
 for(let x=5.13;x<7.45;x+=.19)s.box(x,.12,5.84,.055,.70,.035,t.metal);
 s.roundedBox(6.95,.985,5.25,.50,.62,.48,'#1a2c3e',.06);s.box(6.95,1.18,5.51,.35,.20,.015,'#0e1521');s.box(6.95,1.22,5.53,.20,.05,.015,a,.5);
 for(let x=5.40;x<6.4;x+=.3)s.cylinder(x,.985,5.25,.065,.13,'#f4e8d0');
 for(const x of[-6.8,6.8])plant(s,x,2.45,'#65a88d');
 // An architectural light sculpture above the team's central feature.
 if(t.feature==='aurora'||t.feature==='orbital'){for(let i=0;i<18;i++){const aa=i*Math.PI/9;s.ellipsoid(Math.cos(aa)*1.5,4.45+Math.sin(aa*2)*.25,Math.sin(aa)*.8,.05,.05,.05,a,.7);}}
 if(t.feature==='bullion'){for(let i=0;i<8;i++){const x=-2.3+i*.65;s.box(x,.025,5.4,.035,.009,1.4,a,.25);}}
 if(t.feature==='garden'){for(const x of[-7.1,7.1])for(let z=-5.7;z<-.7;z+=.6){s.rod([x,4.6,z],[x*.90,4.9,z+.3],.035,'#84a783');s.ellipsoid(x*.92,4.75,z,.15,.09,.28,'#71a777');}}
}
function premiumInterior(s,t){
 const a=t.accent,warm=['boardroom','exchange','garden','bullion'].includes(t.feature),stone=warm?'#ddccb1':'#8da5b8',dark=warm?'#203537':'#15263b',brass=warm?'#cfa974':'#91adbd';
 // Cutaway ceiling: layered acoustic coffers and thin pendants leave the crew in view.
 for(const x of[-7.9,7.9]){
  s.roundedBox(x,5.16,-3.8,.38,.24,5.7,dark,.10);s.box(x*.992,5.12,-3.8,.07,.025,5.5,'#dceefa',.6);
  for(let z=-6;z<-.8;z+=.58){s.box(x*.987,5.42,z,.31,.14,.32,brass);s.box(x*.974,5.33,z,.06,.035,.18,a,.25);}
 }
 s.roundedBox(0,6.04,-6.42,16.1,.26,.52,dark,.13);s.box(0,6.015,-6.11,15.5,.025,.025,'#d5e6ea',.65);
 // A real modeled entry threshold with a smoked glass rail and an inset agency medallion.
 s.roundedBox(0,-.05,7.22,5.8,.08,.75,dark,.20);s.roundedBox(0,.031,6.28,3.35,.025,1.05,stone,.18);
 s.ring(0,.065,6.28,.37,brass,.025,.12);s.box(0,.068,6.28,.18,.006,.18,a,.35);
 for(const x of[-7.5,7.5]){s.roundedBox(x,.035,6.72,1.02,.09,1.06,stone,.09);s.box(x,.13,6.85,.055,.80,.055,brass);s.box(x,.92,6.85,1,.055,.055,brass);}
 for(const x of[-3.5,3.5]){s.box(x,.07,6.82,3.0,.026,.035,a,.35);}
 // Inset terrazzo paths and warm metal floor seams add scale to the office.
 for(let i=0;i<18;i++){const x=-7.65+(i%6)*3.04,z=5.98-Math.floor(i/6)*.48;s.box(x,.019,z,.33,.005,.025,brass);}
 for(const p of s.crew)transformed(s,p,()=>{
  // Suspended rounded light panels, monitor brackets and dark upholstered chair backs.
  s.roundedBox(0,4.7,-.95,1.15,.065,.32,'#24394d',.14);s.roundedBox(0,4.68,-.95,.98,.021,.23,'#e6f4ee',.09,.6);
  for(const x of[-.52,.52])s.rod([x,4.78,-.95],[x,5.4,-.95],.009,brass);
  s.box(0,1.32,-.64,.65,.035,.035,'#628291');s.box(.65,1.26,-.47,.034,.28,.035,'#526f83');
  for(const x of[-.39,.39]){s.rod([x,.55,1.29],[x,.99,1.39],.025,'#253d50');s.box(x,.68,1.48,.018,.17,.018,p.color,.25);}
  // Keycaps, a tablet and a cable spine remain distinct when inspecting a desk.
  for(let row=0;row<3;row++)for(let col=0;col<10;col++)s.roundedBox(-.36+col*.072,1.159,.073+row*.062,.048,.010,.041,row===2&&col>2&&col<7?'#bdd8dc':'#243d50',.005);
  s.roundedBox(.98,1.13,-.22,.25,.018,.35,'#162a3b',.026);s.box(.98,1.149,-.22,.20,.002,.27,p.color,.14);
  s.box(1.31,.5,-.5,.035,.62,.11,'#162837');for(let i=0;i<4;i++)s.box(1.335,.55+i*.14,-.5,.012,.025,.09,brass);
 });
 // Each district has its own signature installation rather than a palette swap.
 if(t.feature==='boardroom'){
  for(let i=0;i<6;i++){const aa=i*Math.PI/3,x=Math.cos(aa)*1.15,z=.1+Math.sin(aa)*1.15;s.roundedBox(x,.935,z,.38,.018,.25,'#142a30',.04);s.box(x,.955,z,.29,.003,.18,a,.15);}
  s.cylinder(0,.96,.1,.35,.045,brass);s.ring(0,1.1,.1,.45,a,.012,.45);
 }else if(t.feature==='garage'){
  s.roundedBox(0,.25,.45,2.75,.36,1.38,'#9f2b46',.28);s.roundedBox(0,.81,.16,1.23,.18,.77,'#1b2d43',.15);
  for(const x of[-1.13,1.13])for(const z of[-.13,.98]){s.ellipsoid(x,.37,z,.08,.19,.19,'#738591');s.ellipsoid(x*1.01,.37,z,.04,.10,.10,'#142333');}
  for(const x of[-.45,.45])s.roundedBox(x,.56,1.1,.32,.08,.045,'#ffdacf',.04,.7);
  for(let i=0;i<7;i++)s.box(-.45+i*.15,.36,1.16,.04,.11,.035,'#142339');
 }else if(t.feature==='studio'){
  for(let i=0;i<12;i++){const aa=i*Math.PI/6;s.rod([Math.cos(aa)*.68,.72,.25+Math.sin(aa)*.68],[Math.cos(aa+.3)*.38,1.55,.25+Math.sin(aa+.3)*.38],.012,a,.45);}
  s.ellipsoid(0,1.58,.25,.18,.22,.18,'#bee8e5',.3);
 }else if(t.feature==='aurora'||t.feature==='orbital'){
  for(let i=0;i<3;i++){const h=1.65+i*.2,r=.55+i*.18;s.ring(0,h,.15,r,a,.012,.40);}
  for(let i=0;i<20;i++){const aa=i*Math.PI/10;s.rod([Math.sin(aa)*.6,.98,.15+Math.cos(aa)*.6],[Math.sin(aa)*.6,1.13,.15+Math.cos(aa)*.6],.012,'#c1e1eb',.25);}
 }else if(t.feature==='exchange'){
  for(let i=0;i<9;i++){s.roundedBox(-1.14+i*.28,1.02,.3,.19,.05,.36,'#d5be94',.025);s.box(-1.14+i*.28,1.07,.3,.10,.005,.27,'#856641');}
 }else if(t.feature==='garden'){
  for(let i=0;i<8;i++){const aa=i*Math.PI/4,x=Math.cos(aa)*.83,z=.2+Math.sin(aa)*.83;s.ellipsoid(x,.55,z,.17,.09,.24,'#3f7769');s.rod([x,.53,z],[x*.85,1.0,z*.85],.016,'#95b778');}
 }else if(t.feature==='cyber'){
  for(let i=0;i<12;i++){const aa=i*Math.PI/6;s.rod([Math.cos(aa)*.5,1.13,.4+Math.sin(aa)*.5],[Math.cos(aa+.3)*.3,1.95,.4+Math.sin(aa+.3)*.3],.018,a,.40);}
  s.sphere(0,1.65,.4,.15,'#e4bdff',.55);
 }else if(t.feature==='arena'){
  for(let i=0;i<4;i++){const x=-.42+i*.28;s.box(x,.68,.3,.17,.11+(i%3)*.13,.27,a,.18);}
  s.ring(0,1.26,.3,.65,'#cceff6',.018,.35);
 }else if(t.feature==='bullion'){
  for(let i=0;i<9;i++){const x=-.55+i%3*.55,y=.16+Math.floor(i/3)*.21;s.box(x,y+.12,.83,.28,.026,.008,'#e7c479',.08);}
 }
 s.canvas.dataset.design='flagship-v3';
}
function desk(s,p,t){transformed(s,p,()=>{
 s.roundedBox(0,.025,0,3.1,.03,2.8,'#101d2d',.22);for(const x of[-1.43,1.43])s.box(x,.06,0,.014,.005,2.45,'#526276');s.roundedBox(0,.96,-.25,2.85,.12,1.45,t.metal,.17);s.roundedBox(0,1.08,-.25,2.80,.035,1.40,'#233344',.15);s.box(0,1.01,.41,2.48,.04,.025,p.color,.9);
 for(const x of[-1.06,1.06])s.box(x,.02,-.25,.085,.94,1.12,t.metal);
 s.box(0,1.2,-.56,.07,.25,.07,t.metal);s.roundedBox(0,1.44,-.56,1.88,1,.12,'#030914',.055);s.roundedBox(-1.18,1.44,-.44,.64,.85,.10,'#030914',.04);s.box(-1.18,1.18,-.49,.04,.26,.04,t.metal);
 s.box(0,1.115,.17,.85,.035,.28,'#637c8e');for(let i=0;i<9;i++)s.box(-.35+i*.087,1.15,.17,.042,.01,.19,i%3?p.color:'#b9d9e4',.3);
 s.cylinder(1,1.115,.14,.09,.19,'#d2d8e6');s.box(-1.03,1.11,-.3,.18,.32,.23,'#0a1324');s.sphere(-1.03,1.28,-.18,.055,p.color,.4);
 s.cylinder(0,.035,1,.39,.05,t.metal);s.cylinder(0,.085,1,.06,.42,'#99acbd');s.box(0,.49,1,.87,.12,.7,'#24364a');s.roundedBox(0,.60,1.37,.91,.40,.12,t.metal,.08);
 s.robot(0,.6,.92,p.color,1.04,true,Math.PI,Math.PI-.20);s.ring(0,.018,1,.65,p.color,.018,.7);
 // Ergonomic swivel base, padded seat, articulated arms and a personal desk lamp.
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;transformed(s,{x:0,z:1,angle:a},()=>{s.box(0,.09,.24,.055,.04,.5,t.metal);s.sphere(0,.07,.5,.065,'#0a1423');});}
 for(const x of[-.48,.48]){s.box(x,.52,1,.055,.3,.06,t.metal);s.box(x,.82,1,.15,.05,.46,'#354b60');}
 s.roundedBox(0,.57,1,.8,.06,.66,'#4e6074',.12);s.roundedBox(0,.65,1.3,.78,.33,.08,'#2c4156',.10);
 s.cylinder(-.97,1.12,.2,.14,.025,t.metal);s.box(-.97,1.14,.2,.03,.42,.03,t.metal);s.box(-.97,1.56,.04,.04,.03,.34,t.metal);s.box(-.97,1.55,-.11,.3,.045,.13,'#e6ecde',.3);
 s.box(.74,1.12,.22,.31,.018,.32,'#0c1829');s.sphere(.74,1.15,.22,.055,'#bacbd6');
 s.box(0,1.12,-.38,1.34,.006,.012,p.color,.25);
 });}
function feature(s,t){const a=t.accent;
 if(t.feature==='boardroom'){s.box(0,.3,.1,.6,.5,.6,t.metal);s.cylinder(0,.8,.1,1.6,.12,'#396559',1.6,0,48);s.ring(0,.93,.1,1.5,a,.018,.8);}
 if(t.feature==='aurora'){for(const r of[1.35,1.65]){s.ring(0,3.9,0,r,a,.045,.9);s.ring(0,4.2,0,r*.75,'#64cbdc',.03,.6);}s.cylinder(0,.1,0,.75,.7,t.metal);s.sphere(0,1.4,0,.42,a,.5);}
 if(t.feature==='studio'){s.box(0,.06,.25,3,.55,1.5,'#b7cbd1');s.box(0,.62,.25,3,.04,1.5,'#edf5ef');s.ring(0,.68,.25,.63,a,.025,.8);}
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
 s.yaw=-.38;s.pitch=.57;s.distance=19.8;s.target=[0,1.4,-.1];
 s.canvas.dataset.theme=t.feature;s.canvas.dataset.team=symbol;s.canvas.dataset.crewCount=String(1+def.bots.length);s.canvas.dataset.camera='wide';
 const coords=[[0,-4.1,0],...t.desks];s.crew=['Team Manager',...def.bots].map((name,i)=>({name,x:coords[i][0],z:coords[i][1],angle:coords[i][2],color:i===0?t.accent:['#75e8cc','#a7b7ff','#ffd18b','#f997bf'][i-1]}));
 flagshipInterior(s,t);for(const p of s.crew)desk(s,p,t);feature(s,t);premiumInterior(s,t);
 if(!['garden','cyber','bullion'].includes(t.feature))for(const x of[-6.6,6.6])plant(s,x,4.5,'#397d79');
 s.officeBase=s.data.slice();s.upload();s.draw();return t;
}
function update(s,snapshot,online,bars){const team=snapshot?.teams?.find(t=>t.name===s.symbol)||{},analysis=team.analysis||{},worker=snapshot?.payroll?.workers?.find(w=>w.team_name===s.symbol)||{},manager=snapshot?.managers?.find(m=>m.team_name===s.symbol),source=snapshot?.live_price_practice?'IEX '+snapshot.market_feed.status+' · FAKE FILLS':snapshot?.practice?'SYNTHETIC PRACTICE':online?'RECORDED DATA':'SOURCE NOT CONNECTED';
 for(const [i,p]of s.crew.entries()){const vote=analysis.votes?.find(v=>v.name===p.name);screen(s,'crew-'+i,p,p.name.toUpperCase(),[i===0?(team.worker_state||'WAITING'):(vote?.direction||'WAITING'),i===0?'Team coordination':vote?.reason||'Awaiting source evidence',source],bars,p.color);}
 for(const [i,p]of s.crew.entries()){const aux={...p,x:point(p,-1.18,0,.12)[0],z:point(p,-1.18,0,.12)[2]};screen(s,'crew-aux-'+i,aux,'SOURCE',[source],bars,p.color);const d=s.displays.get('crew-aux-'+i),center=point(aux,0,1.46,-.49);for(let j=0;j<d.geometry.length;j+=5){d.geometry[j]=center[0]+(d.geometry[j]-center[0])*.31;d.geometry[j+1]=1.46+(d.geometry[j+1]-1.46)*.89;d.geometry[j+2]=center[2]+(d.geometry[j+2]-center[2])*.31;}}renderWall(s.symbol,snapshot,s);s.draw();}
function focus(s,name,view='desk'){const p=s.crew.find(p=>p.name===name)||s.crew[0];if(!p)return;if(view==='screens'){s.yaw=p.angle;s.pitch=.23;s.distance=4.5;s.target=point(p,0,1.8,-.45);}else{s.yaw=p.angle+.35;s.pitch=.36;s.distance=5.8;s.target=[p.x,1.55,p.z+.5];}s.canvas.dataset.camera=view;s.draw();}
function labels(s){const picked=document.getElementById('office-worker').value,selected=s.crew.find(p=>p.name===picked)||s.crew[0],occupied=[];
 const bubble=document.getElementById('office-speech'),sp=selected&&s.project(...point(selected,0,2.6,.92));if(bubble&&sp){bubble.hidden=sp.x<10||sp.x>s.canvas.clientWidth-10||sp.y<65||sp.y>s.canvas.clientHeight-45;bubble.style.left=Math.max(100,Math.min(s.canvas.clientWidth-100,sp.x))+'px';bubble.style.top=Math.max(125,sp.y)+'px';if(!bubble.hidden){const x=parseFloat(bubble.style.left),y=parseFloat(bubble.style.top),w=bubble.offsetWidth,h=bubble.offsetHeight;occupied.push({l:x-w/2,r:x+w/2,t:y-h,b:y});}}
 for(const button of document.querySelectorAll('#office-crew [data-office-worker]')){const p=s.crew.find(p=>p.name===button.dataset.officeWorker),v=p&&s.project(...point(p,0,2.57,.92));button.hidden=!v||p.name===picked||v.x<8||v.x>s.canvas.clientWidth-8||v.y<70||v.y>s.canvas.clientHeight-55;if(button.hidden)continue;const w=button.offsetWidth,h=button.offsetHeight,x=Math.max(w/2+8,Math.min(s.canvas.clientWidth-w/2-8,v.x));let y=v.y;let rect={l:x-w/2,r:x+w/2,t:y-h,b:y};if(occupied.some(o=>rect.l<o.r&&rect.r>o.l&&rect.t<o.b&&rect.b>o.t)){y+=h+12;rect={l:x-w/2,r:x+w/2,t:y-h,b:y};}button.style.left=x+'px';button.style.top=Math.min(s.canvas.clientHeight-65,y)+'px';occupied.push(rect);}
}

// Shared trade wall: one evidence model feeds both the physical screen and readable ledger.
const wallCash=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100):'—';
const wallPrice=v=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const wallTime=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';
function wallModel(symbol,snapshot,session){
 const team=snapshot?.teams?.find(t=>t.name===symbol)||{},practice=snapshot?.practice===true;
 const rows=practice&&session?session.trades:snapshot?.payroll?.recent;
 const closed=(Array.isArray(rows)?rows:[]).filter(t=>t.team_name===symbol).slice().sort((a,b)=>(Date.parse(b.closed_at)||0)-(Date.parse(a.closed_at)||0));
 const positions=practice&&session?(session.positions||[]).filter(t=>t.team_name===symbol):[];
 const orders=(snapshot?.recent_orders||[]).filter(t=>t.team_name===symbol);
 const bars=(team.analysis?.bars||[]).filter(b=>Number.isFinite(b.close)&&b.close>0&&Number.isFinite(Date.parse(b.timestamp))).slice(-60);
 const worker=snapshot?.payroll?.workers?.find(w=>w.team_name===symbol)||{};
 return {symbol,practice,bars,closed,positions,orders,worker,source:snapshot?.live_price_practice?'IEX '+snapshot.market_feed.status+' · FAKE MONEY':practice?'SIMULATED MARKET · FAKE MONEY':'RECORDED SNAPSHOT · LIVE FEED UNVERIFIED',asOf:bars.at(-1)?.timestamp||snapshot?.generated_at};
}
function wallPaint(canvas,m,accent){
 const c=canvas.getContext('2d');if(!c)return;canvas.width=1920;canvas.height=640;
 const text=(value,x,y,size=24,color='#b6c6dc')=>{c.font=`${size>=30?'600':'400'} ${size}px system-ui`;c.fillStyle=color;c.fillText(String(value),x,y, x<1200?1130:660);};
 const line=(x,y,xx,yy,color,width=1)=>{c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();};
 c.fillStyle='#061120';c.fillRect(0,0,1920,640);const glow=c.createLinearGradient(0,0,1920,640);glow.addColorStop(0,accent+'22');glow.addColorStop(1,'#061120');c.fillStyle=glow;c.fillRect(0,0,1920,640);
 c.fillStyle=accent;c.fillRect(0,0,1920,6);text(m.symbol+' / TRADE WALL',34,54,32,'#f1f6ff');text(m.source,34,89,22,accent);text(wallPrice(m.bars.at(-1)?.close),34,144,40,'#f1f6ff');text('AS OF '+wallTime(m.asOf),330,140,22);
 line(1200,30,1200,610,'#28445a');text('TEAM LEDGER',1240,54,30,'#f1f6ff');text(wallCash(m.worker.net_cents)+' net · '+(m.worker.closed_trades??'—')+' closed',1240,100,26,accent);
 text(m.positions.length?m.positions.length+' SIMULATED OPEN POSITION':m.practice?'NO OPEN POSITION':'OPEN POSITION DATA UNAVAILABLE',1240,148,22);
 text('SIDE / QTY',1240,198,20);text('ENTRY → EXIT',1460,198,20);text('NET',1770,198,20);
 for(const [i,t] of [...m.positions.map(p=>({...p,wallOpen:true})),...m.closed].slice(0,5).entries()){const y=246+i*68;line(1240,y-30,1875,y-30,'#23384e');text((t.direction||'CLOSED')+' / '+(t.qty??'—'),1240,y,22);text(wallPrice(t.entry_price)+' → '+wallPrice(t.exit_price),1460,y,21);text(t.wallOpen?'OPEN':wallCash(t.net_cents),1770,y,23,t.net_cents<0?'#ff7e97':'#75edba');text(wallTime(t.closed_at||t.opened_at)+' · '+(t.reason||t.source||(t.wallOpen?'Monitoring simulated exit rules':'Recorded outcome')),1240,y+25,18);}
 if(!m.closed.length&&!m.positions.length){text('WAITING FOR CLOSED TRADES',1240,260,24);text('Completed wins and losses appear here.',1240,298,22);text('Order intents are listed separately below.',1240,332,22);}
 const bars=m.bars,L=40,R=1118,T=185,B=530;
 if(bars.length>1){const values=bars.flatMap(b=>[b.low,b.high,b.close]).filter(Number.isFinite);const lo=Math.min(...values),hi=Math.max(...values),spread=Math.max(hi-lo,hi*.0005,.01),floor=lo-spread*.15,ceiling=hi+spread*.15;
 const y=p=>B-(p-floor)/(ceiling-floor)*(B-T),x=i=>L+(i+.5)*(R-L)/bars.length;
 for(let j=0;j<5;j++){const yy=T+j*(B-T)/4;line(L,yy,R,yy,'#20384d');text(wallPrice(ceiling-j*(ceiling-floor)/4),R+7,yy+7,17);}
 const w=Math.max(3,(R-L)/bars.length*.6);
 bars.forEach((b,i)=>{const col=b.close>=(b.open??b.close)?'#75edba':'#ff7e97';if([b.open,b.high,b.low].every(Number.isFinite)){line(x(i),y(b.high),x(i),y(b.low),col,2);c.fillStyle=col;c.fillRect(x(i)-w/2,Math.min(y(b.open),y(b.close)),w,Math.max(2,Math.abs(y(b.open)-y(b.close))));}else if(i)line(x(i-1),y(bars[i-1].close),x(i),y(b.close),accent,3);});
 // Exact fill prices, timestamped only inside this chart's displayed history.
 const start=Date.parse(bars[0].timestamp),end=Date.parse(bars.at(-1).timestamp);
 for(const t of [...m.closed,...m.positions])for(const [kind,stamp,price,col]of [['E',t.opened_at,t.entry_price,'#ffd579'],['X',t.closed_at,t.exit_price,'#a49bff']]){const time=Date.parse(stamp);if(!Number.isFinite(time)||!Number.isFinite(price)||time<start||time>end||price<floor||price>ceiling)continue;let i=0;for(let j=1;j<bars.length;j++)if(Math.abs(Date.parse(bars[j].timestamp)-time)<Math.abs(Date.parse(bars[i].timestamp)-time))i=j;c.fillStyle=col;c.beginPath();c.arc(x(i),y(price),7,0,Math.PI*2);c.fill();text(kind,x(i)-7,y(price)-13,19,col);}
 text(wallTime(bars[0].timestamp),L,566,21);text(wallTime(bars.at(-1).timestamp),1020,566,21);
 }else text('Waiting for timestamped price history',40,330,30);
 text('CANDLES  ·  E = ENTRY FILL  ·  X = EXIT FILL  ·  LAST 60 BARS',40,615,21,accent);text('NO ORDERS CAN BE PLACED FROM THIS WALL',1240,615,20);
}
let wallSignature='',wallCurrent=null;
function renderWall(symbol,snapshot,scene){
 const session=snapshot?.practice?window.LaylowPractice?.export():null,m=wallModel(symbol,snapshot,session),accent=themes[symbol]?.accent||'#70e2e8',signature=JSON.stringify([m,accent]);wallCurrent=m;
 const canvas=document.getElementById('office-trade-wall-canvas');if(!canvas)return;
 if(signature!==wallSignature){wallSignature=signature;wallPaint(canvas,m,accent);document.getElementById('office-trade-wall-title').textContent=symbol+' / Trade wall';document.getElementById('office-trade-wall-source').textContent=m.source+' · as of '+wallTime(m.asOf);document.getElementById('office-trade-wall-net').textContent=wallCash(m.worker.net_cents)+' net · '+(m.worker.wins??'—')+' wins / '+(m.worker.losses??'—')+' losses';
 const body=document.getElementById('office-trade-wall-rows');body.replaceChildren();
 for(const t of [...m.positions.map(p=>({...p,wallOpen:true})),...m.closed.slice(0,20)]){const tr=document.createElement('tr');for(const value of[t.wallOpen?'OPEN':Number.isFinite(t.net_cents)?t.net_cents>0?'WIN':t.net_cents<0?'LOSS':'FLAT':'CLOSED',t.direction||'—',t.qty??'—',wallPrice(t.entry_price),t.wallOpen?'—':wallPrice(t.exit_price),t.wallOpen?'Unrealized':wallCash(t.net_cents),wallTime(t.closed_at||t.opened_at),t.reason||t.source||(t.wallOpen?'Monitoring simulated exit rules':'Recorded close')]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tr.className=t.wallOpen?'':t.net_cents<0?'bad':'good';body.append(tr);}
 if(!body.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.textContent='No recorded trades for this team yet. Closed trades and available practice positions will appear here.';tr.append(td);body.append(tr);}
 const orders=document.getElementById('office-trade-wall-orders');orders.replaceChildren();for(const t of m.orders.slice(0,5)){const p=document.createElement('p');p.textContent=(t.direction||'—')+' · '+(t.status||'Unknown status')+' · quantity '+(t.qty??'—')+' · '+wallTime(t.created_at);orders.append(p);}if(!orders.children.length){const p=document.createElement('p');p.textContent='No recorded order intents for this team.';orders.append(p);}
 }
 if(scene){scene.display('trade-wall',0,1.25,-6.18,14,4.15,'',[],[],accent);const item=scene.displays.get('trade-wall');if(item.wallKey!==signature){item.wallKey=signature;const gl=scene.gl;gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}scene.canvas.dataset.tradeWall=symbol;}
 return m;
}
function openWall(){const panel=document.getElementById('office-trade-wall-panel');panel.hidden=false;renderWall(document.getElementById('office-roster').dataset.team,window.LaylowWorld.snapshot());window.Laylow3D?.roomCamera('office','wall');document.getElementById('office-3d').scrollIntoView({block:'center',behavior:'auto'});document.getElementById('office-trade-wall-open').setAttribute('aria-expanded','true');}
document.getElementById('office-trade-wall-open').addEventListener('click',openWall);
document.querySelector('[data-room="office"][data-room-camera="wall"]').addEventListener('click',openWall);
window.LaylowTradeWall={model:wallModel,render:renderWall,open:openWall,current:()=>wallCurrent};

window.LaylowTeamOffices={themes,build,update,focus,labels};
})();
