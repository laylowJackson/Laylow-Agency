(()=>{"use strict";
const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||"";n.textContent=text??"";return n;},stamp=value=>value?new Date(value).toLocaleString():"not recorded";
let selected="AAPL",last={},seat=0,opinions=[],opener=null;
const chamber=$("council-room"),section=$("council");
function selectSeat(index){seat=index;renderSeat();window.Laylow3D?.focusCouncilSeat?.(index);}
function renderSeat(){
 const m=opinions[seat];for(const button of document.querySelectorAll("[data-council-seat]")){const member=opinions[Number(button.dataset.councilSeat)];button.setAttribute("aria-pressed",String(Number(button.dataset.councilSeat)===seat));if(member){button.style.setProperty("--member-color",member.color);button.title=member.name+": "+(member.vote||"NOT OBSERVED")+" · "+(member.reason||"Awaiting evidence");if(button.parentElement.id==="council-seat-labels"){if(!button.firstElementChild)button.replaceChildren(node("strong"),node("span","bubble-opinion"));button.firstElementChild.textContent=member.name+" · "+(member.vote||"WAITING");button.lastElementChild.textContent=member.reason||"I need source evidence before giving an opinion.";}}}
 const inspector=document.querySelector(".council-seat-inspector");inspector.style.setProperty("--member-color",m?.color||"#ffe58f");
 $("council-seat-name").textContent=m?.name||"Council member";$("council-seat-personality").textContent=m?m.personality+" · "+m.risk+" risk":"Awaiting member details";
 $("council-seat-vote").textContent=m?.vote||"NOT OBSERVED";$("council-seat-reason").textContent=m?.reason||"Awaiting source evidence.";
}
function enter(){
 if(chamber.open)return;opener=document.activeElement;chamber.showModal();chamber.scrollTop=0;document.body.classList.add("council-room-open");
 history.replaceState(null,"",location.pathname+location.search+"#council-room");$("council-room-close").focus();window.Laylow3D?.resetCouncil?.();
}
function leave(){if(chamber.open)chamber.close();}
chamber.addEventListener("close",()=>{if(chamber.open)return;document.body.classList.remove("council-room-open");if(!document.querySelector("dialog[open]")){history.replaceState(null,"",location.pathname+location.search+"#world");$("world").scrollIntoView({block:"start"});if(opener?.isConnected&&(document.activeElement===document.body||chamber.contains(document.activeElement)))opener.focus({preventScroll:true});}});
$("council-room-close").addEventListener("click",leave);
section.querySelector('a[href="#world"]').addEventListener("click",event=>{if(chamber.open){event.preventDefault();leave();}});
for(const link of document.querySelectorAll('a[href="#council"]'))link.addEventListener("click",event=>{event.preventDefault();enter();});
for(const [i,m]of (window.LaylowWorld.snapshot()?.council?.members||[]).entries()){
 for(const container of [$("council-seats"),$("council-seat-labels")]){const b=node("button","council-seat",m.name);b.type="button";b.dataset.councilSeat=String(i);b.setAttribute("aria-label","Inspect "+m.name+" at the council table");b.addEventListener("click",()=>selectSeat(i));container.append(b);}
}
const select=$("council-team");for(const d of window.LaylowWorld.definitions){const o=node("option","",d.name);o.value=d.name;select.append(o);}select.value=selected;
function render(data,online){
 last=data||{};const council=last.council||{},review=(council.reviews||[]).find(r=>r.team_name===selected),history=(council.history||[]).filter(r=>r.team_name===selected);
 section.querySelector(".muted").textContent=last.practice?"Inside the Council room. Choose a seat to inspect a member's personality and current simulated opinion. Six rule-based personalities debate each fake-money proposal.":"Choose a seat to inspect a member's personality and risk opinion. Explicit rules review the same source bars; the existing AI review may veto or reduce their decision.";
 $("council-feed").textContent=last.practice?"MARKET FEED: SIMULATED · Live broker/data feed not connected. Generated candles only.":"Recorded evidence review · live quote connection is not verified.";
 $("council-context").textContent=last.practice?"PRACTICE · RULE-BASED SIMULATED OPINIONS":last.public_viewer?"PUBLIC VIEWER / EVIDENCE NOT CONNECTED":online?"CURRENT EVIDENCE REVIEW":"LAST SNAPSHOT / CONNECTION LOST";
 $("council-action").textContent=review?(review.action==="SKIP"?"WAIT / NO ENTRY":String(review.action).replaceAll("_"," ")):"Waiting for evidence";
 $("council-reason").textContent=review?.reason||"Council opinions appear when source evidence is available.";
 $("council-evidence").textContent=review?selected+" · "+review.direction+" · "+review.favorable_votes+"/6 support · source "+stamp(review.analysis_time)+" · review "+stamp(review.generated_at):"No current review.";
 $("council-authority").textContent=last.practice?"Fake-money simulation only. These six opinions are deterministic strategy rules, not live AI agents or real trade approvals.":last.public_viewer?"Connect a hosted worker backend to display real council decisions. This public viewer has no order authority.":!online?"Displayed opinions cannot authorize entries while disconnected.":review?.watch_only?"Watch-only district; no futures order authority.":last.mode!=="paper"?"Analysis only in "+(last.mode||"observe")+" mode. No order authority.":"Fresh recorded approval and all existing broker/account/event limits required.";
 $("council-last").textContent=history.length?"Latest worker deliberation: "+history[0].action+" · "+stamp(history[0].generated_at)+" · "+history[0].proposal_id:"No worker deliberations recorded for this district.";
 const members=review?.members||council.members||[];opinions=members;$("council-members").replaceChildren();
 $("council-room-district").textContent=selected+" / "+(last.practice?"PRACTICE":"RECORDED EVIDENCE");$("council-room-tally").textContent=review?review.favorable_votes+" / 6 SUPPORT":"NO SOURCE EVIDENCE";
 if(!$("council-seats").children.length&&members.length){for(const [i,m]of members.entries())for(const container of [$("council-seats"),$("council-seat-labels")]){const b=node("button","council-seat",m.name);b.type="button";b.dataset.councilSeat=String(i);b.setAttribute("aria-label","Inspect "+m.name+" at the council table");b.addEventListener("click",()=>selectSeat(i));container.append(b);}}
 renderSeat();
 for(const m of members){const card=node("article","council-member");card.style.setProperty("--member-color",/^#[0-9a-f]{6}$/i.test(m.color)?m.color:"#ffe58f");
 card.append(node("h3","",m.name),node("p","personality",m.personality+" · "+m.risk+" risk"),node("span","council-vote "+(m.vote==="VETO"?"bad":m.vote==="WAIT"?"warn":!m.vote?"muted":"good"),m.vote||"NOT OBSERVED"),node("p","council-reason",m.reason||"Awaiting source evidence."));$("council-members").append(card);}
 $("council-history").replaceChildren();for(const r of history.slice(0,12)){const li=node("li","",stamp(r.generated_at)+" · "+r.action+" · "+r.reason+" · "+r.proposal_id),details=node("details"),summary=node("summary","","Read recorded opinions");details.append(summary);for(const m of r.members||[])details.append(node("p","",m.name+" · "+m.vote+" · "+m.reason));li.append(details);$("council-history").append(li);}
 if(!history.length)$("council-history").append(node("li","muted","No recorded worker deliberations. Current reviews are read-only, not order approvals."));
 const bars=last.teams?.find(t=>t.name===selected)?.analysis?.bars||[];window.Laylow3D?.council?.(members,bars,review);
}
window.LaylowCouncil={update:render,enter,leave,selectSeat};
select.addEventListener("change",()=>{selected=select.value;render(last,window.LaylowWorld.connected());});
$("council-reset").addEventListener("click",()=>window.Laylow3D?.resetCouncil?.());
render(window.LaylowWorld.snapshot(),window.LaylowWorld.connected());
if(["#council-room","#council"].includes(location.hash))enter();
window.addEventListener("hashchange",()=>{if(["#council-room","#council"].includes(location.hash))enter();else if(chamber.open)leave();});
})();
