(()=>{"use strict";
const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||"";n.textContent=text??"";return n;},stamp=value=>value?new Date(value).toLocaleString():"not recorded";
let selected="AAPL",last={};
const select=$("council-team");for(const d of window.LaylowWorld.definitions){const o=node("option","",d.name);o.value=d.name;select.append(o);}select.value=selected;
function render(data,online){
 last=data||{};const council=last.council||{},review=(council.reviews||[]).find(r=>r.team_name===selected),history=(council.history||[]).filter(r=>r.team_name===selected);
 $("council-context").textContent=last.practice?"PRACTICE · RULE-BASED SIMULATED OPINIONS":last.public_viewer?"PUBLIC VIEWER / EVIDENCE NOT CONNECTED":online?"CURRENT EVIDENCE REVIEW":"LAST SNAPSHOT / CONNECTION LOST";
 $("council-action").textContent=review?(review.action==="SKIP"?"WAIT / NO ENTRY":String(review.action).replaceAll("_"," ")):"Waiting for evidence";
 $("council-reason").textContent=review?.reason||"Council opinions appear when source evidence is available.";
 $("council-evidence").textContent=review?selected+" · "+review.direction+" · "+review.favorable_votes+"/6 support · source "+stamp(review.analysis_time)+" · review "+stamp(review.generated_at):"No current review.";
 $("council-authority").textContent=last.practice?"Fake-money simulation only. These six opinions are deterministic strategy rules, not live AI agents or real trade approvals.":last.public_viewer?"Connect a hosted worker backend to display real council decisions. This public viewer has no order authority.":!online?"Displayed opinions cannot authorize entries while disconnected.":review?.watch_only?"Watch-only district; no futures order authority.":last.mode!=="paper"?"Analysis only in "+(last.mode||"observe")+" mode. No order authority.":"Fresh recorded approval and all existing broker/account/event limits required.";
 $("council-last").textContent=history.length?"Latest worker deliberation: "+history[0].action+" · "+stamp(history[0].generated_at)+" · "+history[0].proposal_id:"No worker deliberations recorded for this district.";
 const members=review?.members||council.members||[];$("council-members").replaceChildren();
 for(const m of members){const card=node("article","council-member");card.style.setProperty("--member-color",/^#[0-9a-f]{6}$/i.test(m.color)?m.color:"#ffe58f");
 card.append(node("h3","",m.name),node("p","personality",m.personality+" · "+m.risk+" risk"),node("span","council-vote "+(m.vote==="VETO"?"bad":m.vote==="WAIT"?"warn":!m.vote?"muted":"good"),m.vote||"NOT OBSERVED"),node("p","council-reason",m.reason||"Awaiting source evidence."));$("council-members").append(card);}
 $("council-history").replaceChildren();for(const r of history.slice(0,12)){const li=node("li","",stamp(r.generated_at)+" · "+r.action+" · "+r.reason+" · "+r.proposal_id),details=node("details"),summary=node("summary","","Read recorded opinions");details.append(summary);for(const m of r.members||[])details.append(node("p","",m.name+" · "+m.vote+" · "+m.reason));li.append(details);$("council-history").append(li);}
 if(!history.length)$("council-history").append(node("li","muted","No recorded worker deliberations. Current reviews are read-only, not order approvals."));
 window.Laylow3D?.council?.(members);
}
window.LaylowCouncil={update:render};
select.addEventListener("change",()=>{selected=select.value;render(last,window.LaylowWorld.connected());});
$("council-reset").addEventListener("click",()=>window.Laylow3D?.resetCouncil?.());
render(window.LaylowWorld.snapshot(),window.LaylowWorld.connected());
})();
