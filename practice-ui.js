/* Practice-session controls. This module never submits orders or contacts a broker. */
(()=>{"use strict";
const $=id=>document.getElementById(id),{PracticeMarket}=window.LaylowPracticeEngine;
const key="laylow-practice-50000-v1",cash=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
 let model=new PracticeMarket(),active=false,running=false,timer=null,speed=1,storage=null,saveNote="",startedFromSave=false;
try{storage=window.localStorage;const raw=storage.getItem(key);if(raw){model.restore(JSON.parse(raw));startedFromSave=true;}}catch{model=new PracticeMarket();saveNote="Saved practice data was unavailable. A fresh $50,000 account is ready.";}
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
function save(){try{if(storage)storage.setItem(key,JSON.stringify(model.export()));else throw Error();saveNote="Practice account saved in this browser. Export a copy before switching devices.";}catch{saveNote="This browser cannot save your practice account. Use Export session to keep a copy.";}}
function tables(){
 $("practice-positions").replaceChildren();for(const p of model.positions){const tr=node("tr","");
  for(const value of[p.team_name,p.direction,String(p.qty),p.entry_price.toFixed(2),model.asset(p.team_name).bars.at(-1).close.toFixed(2),cash(model.unrealized(p))])tr.append(node("td",value));
  const cell=node("td",""),close=node("button","Close fake trade");close.type="button";close.setAttribute("aria-label","Close "+p.team_name+" practice position");close.addEventListener("click",()=>{model.close(p.id);model.evaluate();save();publish();});cell.append(close);tr.append(cell);$("practice-positions").append(tr);
 }if(!model.positions.length){const tr=node("tr",""),td=node("td","No open practice positions. Bots await a council-approved setup.");td.colSpan=7;tr.append(td);$("practice-positions").append(tr);}
 $("practice-trades").replaceChildren();for(const t of model.trades.slice(-15).reverse()){const tr=node("tr","");for(const value of[t.team_name,t.direction,String(t.qty),t.entry_price.toFixed(2),t.exit_price.toFixed(2),cash(t.fees_cents),cash(t.net_cents),t.reason])tr.append(node("td",value));$("practice-trades").append(tr);}
 if(!model.trades.length){const tr=node("tr",""),td=node("td","No closed fake trades yet. Both winning and losing trades will appear here.");td.colSpan=8;tr.append(td);$("practice-trades").append(tr);}
}
function publish(){
 const snapshot=model.snapshot();snapshot.practice_running=running;if(!running)for(const team of snapshot.teams)if(team.worker_state==="RUNNING")team.worker_state="PAUSED";window.LaylowWorld.practiceSnapshot(snapshot);
 const a=model.account;for(const [id,value]of[["practice-initial",a.initial_cents],["practice-equity",a.equity_cents],["practice-cash",a.balance_cents],["practice-available",a.available_cents],["practice-realized",a.realized_cents],["practice-unrealized",a.unrealized_cents],["practice-fees",a.fees_cents],["practice-drawdown",a.max_drawdown_cents]])$(id).textContent=cash(value);
 $("practice-clock").textContent="Simulated market time: "+new Date(model.baseTime+model.minute*60000).toLocaleTimeString()+" · "+model.minute+" simulated minutes";
 $("practice-state").textContent=model.riskLocked?"Loss brake reached · reset to restart":model.minute>=3000?"Practice session complete":running?"Practice running":"Practice paused";
 $("practice-toggle").textContent=running?"Pause practice":active?"Resume practice":"Start $50,000 practice";
 $("practice-toggle").disabled=model.riskLocked||model.minute>=3000;$("practice-step").disabled=running||model.riskLocked||model.minute>=3000;
 $("practice-save-note").textContent=saveNote;tables();
}
function schedule(){if(timer!==null){clearTimeout(timer);timer=null;}if(!running||document.hidden)return;
 timer=setTimeout(()=>{timer=null;try{if(!model.step())running=false;save();publish();}catch(error){running=false;$("practice-save-note").textContent="Practice paused after an error: "+error.message;}schedule();},1000/speed);
}
function start(){active=true;running=!model.riskLocked&&model.minute<3000;$("practice-details").hidden=false;try{storage?.setItem(key+"-enabled","1");}catch{}save();publish();schedule();}
window.LaylowPractice={active:()=>active,refresh:()=>{if(active)publish();},export:()=>model.export()};
$("practice-toggle").addEventListener("click",()=>{if(!active)return start();running=!running;publish();schedule();});
$("practice-step").addEventListener("click",()=>{active=true;try{storage?.setItem(key+"-enabled","1");}catch{}$("practice-details").hidden=false;model.step();save();publish();});
$("practice-reset").addEventListener("click",()=>{running=false;schedule();model.reset();active=true;try{storage?.setItem(key+"-enabled","1");}catch{}$("practice-details").hidden=false;save();publish();});
$("practice-exit").addEventListener("click",()=>{running=false;active=false;schedule();save();try{storage?.setItem(key+"-enabled","0");const url=new URL(location.href);url.searchParams.delete("practice");history.replaceState(null,"",url);}catch{}$("practice-details").hidden=true;$("practice-state").textContent="Practice saved · viewer mode";$("practice-toggle").textContent="Resume saved practice";$("practice-toggle").disabled=false;window.LaylowWorld.resumeBackend();});
$("practice-speed").addEventListener("change",()=>{const value=Number($("practice-speed").value);if([1,5,20].includes(value)){speed=value;schedule();}});
$("practice-export").addEventListener("click",()=>{const data={description:"Laylow simulated practice session. Fake dollars, generated prices and synthetic fills; no verified market performance.",exported_at:new Date().toISOString(),account:model.account,session:model.export()};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})),link=node("a","");link.href=url;link.download="laylow-practice-session.json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener("visibilitychange",()=>{if(active){schedule();if(!document.hidden)publish();}});
const requested=new URLSearchParams(location.search).get("practice")==="1";
let enabled=true;try{enabled=storage?.getItem(key+"-enabled")!=="0";}catch{}
if(requested)start();else if(startedFromSave&&enabled){active=true;$("practice-details").hidden=false;publish();}else{$("practice-save-note").textContent=saveNote;if(startedFromSave)$("practice-toggle").textContent="Resume saved practice";}
})();
