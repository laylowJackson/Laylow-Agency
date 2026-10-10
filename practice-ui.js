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

// The Vault is available for practice and recorded ledgers; it never invents results.
(()=>{"use strict";const $=id=>document.getElementById(id),cash=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100),node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||"";e.textContent=text??"";return e;};
let last={},opener=null,signature="";const room=$("vault-room");
function enter(){if(room.open)return;opener=document.activeElement;room.showModal();$("vault-close").focus();history.replaceState(null,"",location.pathname+location.search+"#vault");update(last);}
function leave(){if(room.open)room.close();}
$("vault-close").addEventListener("click",leave);room.addEventListener("close",()=>{history.replaceState(null,"",location.pathname+location.search+"#world");if(opener?.isConnected)opener.focus({preventScroll:true});});
function update(data){
 last=data||{};const payroll=last.payroll||{},available=payroll.available===true,workers=payroll.workers||[],sum=key=>workers.reduce((n,w)=>n+(Number.isFinite(w[key])?w[key]:0),0),wins=sum("wins"),losses=sum("losses"),closed=sum("closed_trades"),flat=Math.max(0,closed-wins-losses);
 for(const [id,value]of[["vault-wins",wins],["vault-losses",losses],["vault-flat",flat]])$(id).textContent=available?String(value):"—";
 $("vault-ratio").textContent=!available||!closed?"—":losses?(wins/losses).toFixed(2)+" : 1":wins?"No losses":"—";
 $("vault-win-rate").textContent=available&&wins+losses?(100*wins/(wins+losses)).toFixed(1)+"%":"—";$("vault-net").textContent=available&&Number.isFinite(payroll.total_net_cents)?cash(payroll.total_net_cents):"—";
 $("vault-source").textContent=last.practice?"FAKE-MONEY PRACTICE · full saved session ledger · net after simulated fees":available?"RECORDED LEDGER · "+(payroll.day||"today")+" · "+(payroll.basis||"closed trades only"):"No closed-trade ledger connected. Figures remain blank until results are recorded.";
 $("vault-feed").textContent=last.practice?"MARKET FEED: SIMULATED · Live broker/data feed not connected. These results use generated prices.":"Recorded dashboard snapshot · live quote connection is not verified.";
 $("vault-ratio-note").textContent="Win/loss ratio = winning trades ÷ losing trades. Win rate excludes break-even trades. Open positions are excluded. "+(available?closed+" closed trades counted.":"No data available.");
 const learning=last.learning||[],reviews=last.trade_reviews||[],key=JSON.stringify([learning,reviews]);if(key===signature)return;signature=key;
 $("vault-teams").replaceChildren();for(const team of learning){const card=node("article","vault-team");card.append(node("h3","",team.team_name),node("p","",team.reviewed+" outcomes reviewed · "+team.wins+" wins / "+team.losses+" losses"),node("p","",team.summary),node("p","","Current planned risk cap: "+cash(team.planned_risk_cents)+" · extra specialist votes: "+team.extra_agreement));$("vault-teams").append(card);}
 if(!learning.length)$("vault-teams").append(node("p","muted",last.practice?"Teams are waiting for their first closed trade.":"Learning reviews are available for practice trades. A connected backend must supply its own verified trade reviews."));
 const focused=document.activeElement.closest?.(".vault-review")?.dataset.tradeId,opened=new Set(Array.from($("vault-reviews").querySelectorAll("details[open]")).map(d=>d.dataset.tradeId));$("vault-reviews").replaceChildren();
 for(const review of reviews){const item=node("details","vault-review"),summary=node("summary","",review.team_name+" · "+review.result+" · "+cash(review.net_cents)+" · "+review.exit_rule);item.dataset.tradeId=String(review.trade_id);item.open=opened.has(String(review.trade_id));item.append(summary,node("p","",review.observed),node("p","lesson","Lesson: "+review.lesson),node("p","basis",review.evidence),node("p","basis",review.basis));$("vault-reviews").append(item);}
 if(!reviews.length)$("vault-reviews").append(node("p","muted","No trade reviews yet. Finish a fake trade to see the price movement, exit rule, costs and lesson."));
 if(focused){const summary=Array.from($("vault-reviews").children).find(d=>d.dataset.tradeId===focused)?.querySelector("summary");summary?.focus({preventScroll:true});}
}
window.LaylowVault={enter,leave,update};update(window.LaylowWorld.snapshot());if(location.hash==="#vault")enter();window.addEventListener("hashchange",()=>{if(location.hash==="#vault")enter();else if(room.open)leave();});
})();
