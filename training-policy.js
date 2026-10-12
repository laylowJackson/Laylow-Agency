/* Research scheduling only. Never authorizes execution or asserts a live market clock. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowTrainingPolicy=api;})(typeof window!=='undefined'?window:this,()=>{
'use strict';
const STOCKS=['SPY','QQQ','AAPL','TSLA'],FUTURES=['NQ1!','ES1!','MGC1!','MNQ1!','MES1!','GC1!'];
function local(now,zone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));return {day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),minute:Number(p.hour)*60+Number(p.minute)};}
function session(name,now=new Date()){
 if(![...STOCKS,...FUTURES].includes(name))return {name,closed:null,basis:'Unknown instrument',verified:false};
 const stock=STOCKS.includes(name),{day,minute}=local(now,stock?'America/New_York':'America/Chicago');
 const open=stock?day>=1&&day<=5&&minute>=570&&minute<960:day===0?minute>=1020:day===6?false:day===5?minute<960:minute<960||minute>=1020;
 return {name,closed:!open,verified:false,basis:stock?'Estimated US stock core session':'Estimated CME futures session',limitation:'Holidays, early closes and exchange halts are not verified. Research continues in either state; this clock cannot authorize orders.'};
}
function plan(now=new Date(),mode='auto'){
 if(!['auto','deep'].includes(mode))throw Error('Invalid training workload');
 const sessions=[...STOCKS,...FUTURES].map(n=>session(n,now)),deepTeams=sessions.filter(s=>mode==='deep'||s.closed===true).map(s=>s.name);
 return {mode,sessions,deepTeams,interval_ms:deepTeams.length?8000:15000,label:mode==='deep'?'Deep research · all teams':deepTeams.length?'Automatic closed-session shift':'Automatic session research',clock_verified:false};
}
return {session,plan};
});
