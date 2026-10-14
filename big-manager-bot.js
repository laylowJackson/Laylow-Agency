/* Executive robot: presents existing manager reports, never submits orders. */
(()=>{'use strict';
const style=document.createElement('style');style.textContent=`
#big-bot-room{position:fixed;top:4vh;bottom:auto;left:50%;right:auto;transform:translateX(-50%);margin:0;overflow:auto;box-sizing:border-box;color:#eef2ff;background:#091222;border:1px solid #8464cc;border-radius:24px;width:min(1100px,96vw);max-height:92vh;padding:24px;box-shadow:0 0 70px #734cc344}#big-bot-room::backdrop{background:#020711dd;backdrop-filter:blur(9px)}
.big-bot-head{display:flex;justify-content:space-between;align-items:center;gap:16px}.big-bot-head h2{margin:0;font-size:24px}.big-bot-layout{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}.big-bot-stage{border:1px solid #4b4271;border-radius:20px;background:radial-gradient(ellipse at 50% 60%,#352755,#0d1a30 65%);padding:20px;position:relative;overflow:hidden}.big-bot-stage svg{width:100%;height:auto;display:block}.big-bot-speech{background:#1e2945;border:1px solid #aa90ee;border-radius:16px;padding:16px;position:relative;line-height:1.5}.big-bot-speech:after{content:'';position:absolute;bottom:-10px;left:48%;width:18px;height:18px;background:#1e2945;border-right:1px solid #aa90ee;border-bottom:1px solid #aa90ee;transform:rotate(45deg)}.big-bot-status{color:#bdb5ff;font-size:13px;margin:16px 0}.big-bot-reports{display:grid;gap:10px}.big-bot-reports button{text-align:left;border:1px solid #414b73;border-radius:12px;background:#14213a;color:#eff4ff;padding:14px;min-height:48px}.big-bot-reports button:hover{border-color:#aa91fa}.big-bot-reports strong,.big-bot-reports span{display:block}.big-bot-reports span{font-size:13px;color:#c3cce3;margin-top:5px}.big-bot-note{font-size:13px;color:#aebbd5;line-height:1.5}.big-bot-stage .bot-float{animation:big-bot-hover 4s ease-in-out infinite;transform-origin:center}@keyframes big-bot-hover{50%{transform:translateY(-7px)}}.atlas-chat{border:1px solid #54467f;border-radius:14px;padding:14px;margin-top:16px;background:#101b31}.atlas-chat h3{margin:0 0 5px}.atlas-chat label{display:block;font-size:12px;color:#b6c4e6;margin:10px 0 5px}.atlas-chat select,.atlas-chat textarea{box-sizing:border-box;width:100%;border:1px solid #43547d;background:#0b1427;color:#fff;border-radius:9px;padding:10px;font:inherit}.atlas-chat textarea{min-height:82px;resize:vertical}.atlas-chat button{min-height:42px;margin-top:10px;padding:8px 16px;border-radius:10px;background:#7658e7;color:#fff;border:1px solid #a087f3}.atlas-chat button:disabled{opacity:.5}.atlas-chat .answer{white-space:pre-wrap;border:1px solid #33476b;padding:12px;border-radius:10px;line-height:1.55;margin-top:12px}.atlas-chat .cautions{white-space:pre-wrap;color:#ffd595;font-size:12px}.atlas-chat .meta{font-size:12px;color:#b6c4e6;line-height:1.5}
@media(prefers-reduced-motion:reduce){.big-bot-stage .bot-float{animation:none}}@media(max-width:700px){#big-bot-room{padding:16px}.big-bot-layout{grid-template-columns:1fr}.big-bot-stage svg{max-height:300px}.big-bot-head h2{font-size:20px}}
`;document.head.append(style);
const room=document.createElement('dialog');room.id='big-bot-room';room.setAttribute('aria-labelledby','big-bot-title');room.innerHTML=`
<header class="big-bot-head"><div><small>LAYLOW EXECUTIVE HEADQUARTERS</small><h2 id="big-bot-title">Big Manager · ATLAS</h2></div><button type="button" id="big-bot-close" aria-label="Close Big Manager room">Back to city</button></header>
<div class="big-bot-layout"><section class="big-bot-stage" aria-label="Big Manager robot"><div class="big-bot-speech" id="big-bot-speech"></div>
<svg viewBox="0 0 500 420" role="img" aria-label="ATLAS robot with a glowing purple visor at its executive console"><defs><linearGradient id="atlas-shell" x2="1" y2="1"><stop stop-color="#e0e9ff"/><stop offset=".5" stop-color="#6a7796"/><stop offset="1" stop-color="#283757"/></linearGradient><radialGradient id="atlas-floor"><stop stop-color="#a181ee" stop-opacity=".5"/><stop offset="1" stop-color="#a181ee" stop-opacity="0"/></radialGradient></defs>
<path d="M0 325L250 230 500 325M0 370L250 275 500 370M75 420L250 230 425 420" fill="none" stroke="#5d5287"/><ellipse cx="250" cy="352" rx="205" ry="55" fill="url(#atlas-floor)"/><ellipse cx="250" cy="353" rx="150" ry="33" fill="none" stroke="#a380ff" stroke-width="3"/>
<g class="bot-float"><path d="M190 253L177 318 209 324 231 268M269 268L291 324 323 318 310 253" fill="url(#atlas-shell)" stroke="#c4cee4" stroke-width="2"/><rect x="185" y="175" width="130" height="113" rx="36" fill="url(#atlas-shell)" stroke="#d2ddf5" stroke-width="3"/><path d="M196 199L250 222 304 199" fill="none" stroke="#b998ff" stroke-width="5"/><rect x="222" y="237" width="56" height="24" rx="8" fill="#171e38"/><text x="250" y="254" fill="#d3bcff" font-size="14" text-anchor="middle">ATLAS</text>
<path d="M187 207Q141 201 140 270M313 207Q359 201 360 270" fill="none" stroke="#96a6c5" stroke-width="24" stroke-linecap="round"/><circle cx="140" cy="273" r="16" fill="#c2cce2"/><circle cx="360" cy="273" r="16" fill="#c2cce2"/>
<rect x="167" y="70" width="166" height="121" rx="45" fill="url(#atlas-shell)" stroke="#d2ddf5" stroke-width="3"/><rect x="182" y="104" width="136" height="58" rx="25" fill="#0a1127" stroke="#b38aff" stroke-width="3"/><path d="M203 130L225 126M275 126L297 130" stroke="#bda0ff" stroke-width="9" stroke-linecap="round"/><path d="M236 147Q250 155 264 147" stroke="#76e8f6" stroke-width="3" fill="none"/><path d="M228 69L225 48 240 57 250 39 260 57 275 48 272 69Z" fill="#f0ce7b"/><rect x="151" y="114" width="17" height="42" rx="8" fill="#9c7ddd"/><rect x="332" y="114" width="17" height="42" rx="8" fill="#9c7ddd"/></g>
<path d="M85 300L415 300 448 333 52 333Z" fill="#223251" stroke="#8392bf" stroke-width="2"/><rect x="145" y="276" width="210" height="45" rx="9" fill="#0c1729" stroke="#9f80df"/><text x="250" y="295" text-anchor="middle" fill="#d6c4ff" font-size="12">TEAM REPORTS → RISK ENGINE</text><path d="M165 309H335" stroke="#73d9d1" stroke-width="3"/></svg>
<p class="big-bot-note">ATLAS reports are read-only. GPT conversations are optional and require your private Python backend and an OpenAI API key.</p></section>
<section><h3>Team manager report wall</h3><p id="big-bot-status" class="big-bot-status"></p><div id="big-bot-reports" class="big-bot-reports"></div><p class="big-bot-note">Managers report to ATLAS. Deterministic risk controls retain authority; this robot cannot send orders or unlock LIVE trading.</p>
<div class="atlas-chat" aria-label="Ask ATLAS about team reports">
<h3>Ask ATLAS <span style="font-size:12px;color:#a8afff">GPT ADVISORY ONLY</span></h3>
<p class="meta" id="atlas-ai-status" role="status">Checking private AI availability…</p>
<label for="atlas-ai-team">Which team?</label><select id="atlas-ai-team"><option value="ALL">Entire agency</option></select>
<label for="atlas-ai-question">What do you want to know?</label><textarea id="atlas-ai-question" maxlength="500" placeholder="Why are my bots losing trades? What should I investigate first?"></textarea>
<button type="button" id="atlas-ai-send">Ask ATLAS</button>
<div id="atlas-ai-answer" class="answer" aria-live="polite">ATLAS can explain saved team reports, not predict or guarantee trading profits.</div>
<p id="atlas-ai-cautions" class="cautions"></p>
<p class="meta">Private Python dashboard only. Market data and closed-trade history must be connected to answer performance questions. No AI orders. LIVE locked.</p>
</div></section></div>`;
document.body.append(room);let timer=null;
const text=(v,f)=>typeof v==='string'&&v.trim()?v:f;

const $=id=>document.getElementById(id);
const localHost=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
let atlasBusy=false;
function atlasTeamChoices(){
 const select=$('atlas-ai-team'),current=select.value;
 if(select.options.length>1)return;
 for(const def of window.LaylowWorld?.definitions||[]){
  const option=document.createElement('option');
  option.value=def.name;option.textContent=def.name+' team';select.append(option);
 }
 if([...select.options].some(option=>option.value===current))select.value=current;
}
async function atlasAvailability(){
 if(!localHost){$('atlas-ai-status').textContent='GPT requires your private Python app. GitHub Pages is a public static site; AI is not connected here.';$('atlas-ai-send').disabled=true;return;}
 try{
  const response=await fetch('/api/atlas/status',{cache:'no-store',credentials:'same-origin'});
  if(response.status===401){$('atlas-ai-status').textContent='Sign in to the private Python dashboard first.';$('atlas-ai-send').disabled=true;return;}
  const status=await response.json();
  if(!response.ok)throw Error(status.error||'AI status unavailable');
  $('atlas-ai-send').disabled=!status.configured;
  $('atlas-ai-status').textContent=status.configured?'GPT available · connected to private Python backend · read-only':status.status==='disabled'?'AI disabled. Set LAYLOW_MANAGER_AI=true on the Python server.':'Add OPENAI_API_KEY to the private Python server.';
 }catch(error){$('atlas-ai-status').textContent='AI unavailable: '+error.message;$('atlas-ai-send').disabled=true;}
}
async function atlasAsk(){
 if(atlasBusy||!localHost)return;
 const question=$('atlas-ai-question').value.trim(),team_name=$('atlas-ai-team').value;
 if(question.length<3){$('atlas-ai-answer').textContent='Enter a question (at least 3 characters).';return;}
 atlasBusy=true;$('atlas-ai-send').disabled=true;$('atlas-ai-answer').textContent='ATLAS is reviewing the stored team reports…';$('atlas-ai-cautions').textContent='';
 try{
  const statusResponse=await fetch('/api/status',{cache:'no-store',credentials:'same-origin'});
  if(statusResponse.status===401)throw Error('Sign in to the private Python dashboard first.');
  if(!statusResponse.ok)throw Error('Team reports unavailable.');
  const status=await statusResponse.json();
  if(!status.csrf_token)throw Error('Private session token unavailable.');
  const reply=await fetch('/api/atlas/chat',{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json','X-Laylow-CSRF':status.csrf_token},
   body:JSON.stringify({team_name,question})
  });
  const data=await reply.json();
  if(!reply.ok)throw Error((data.error||'AI service unavailable').replaceAll('_',' '));
  $('atlas-ai-answer').textContent=data.answer||'No answer received.';
  $('atlas-ai-cautions').textContent=(data.cautions||[]).join(' • ');
  $('atlas-ai-status').textContent='GPT advisory response · '+(data.model||'model')+' · observations as of '+(data.data_as_of||'unknown');
 }catch(error){$('atlas-ai-answer').textContent='Could not answer: '+error.message;}finally{atlasBusy=false;$('atlas-ai-send').disabled=false;}
}
$('atlas-ai-send').addEventListener('click',atlasAsk);
$('atlas-ai-question').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))atlasAsk();});

function render(){const snapshot=window.LaylowWorld?.snapshot()||{},big=snapshot.big_manager||{},reports=snapshot.managers||[],practice=!!snapshot.practice;
 document.getElementById('big-bot-speech').textContent=text(big.summary,'I’m waiting for team reports. I’ll keep unknown data visible and bring risk concerns to the report wall.');
 const parsed=Date.parse(big.generated_at||'');document.getElementById('big-bot-status').textContent=(practice?'SIMULATED PRACTICE':'RECORDED REPORTS')+' · '+text(big.severity,'Awaiting assessment')+' · '+(Number.isFinite(parsed)?'Report: '+new Date(parsed).toLocaleString():'No report timestamp');
 const wall=document.getElementById('big-bot-reports');
 // Stable buttons preserve keyboard focus during report updates.
 for(const def of window.LaylowWorld?.definitions||[]){let button=wall.querySelector('[data-team="'+def.name+'"]');if(!button){button=document.createElement('button');button.type='button';button.dataset.team=def.name;button.append(document.createElement('strong'),document.createElement('span'));button.addEventListener('click',()=>{room.close();window.LaylowWorld.enter(def.name);});wall.append(button);}const report=reports.find(r=>r.team_name===def.name)||{};button.firstChild.textContent=def.name+' · Team Manager';button.lastChild.textContent=text(report.summary,text(report.recommendation,'Awaiting team report'));}
}
room.addEventListener('close',()=>{clearInterval(timer);timer=null;});document.getElementById('big-bot-close').addEventListener('click',()=>room.close());
window.LaylowBigManager={enter(team='ALL'){atlasTeamChoices();if([...$('atlas-ai-team').options].some(option=>option.value===team))$('atlas-ai-team').value=team;render();if(!room.open)room.showModal();atlasAvailability();clearInterval(timer);timer=setInterval(render,1500);document.getElementById('big-bot-close').focus();}};
const launch=document.createElement('button');launch.type='button';launch.textContent='Enter Big Manager robot room';launch.addEventListener('click',()=>window.LaylowBigManager.enter());document.getElementById('big-title')?.parentElement.after(launch);
const teamOffice=document.getElementById('office-dialog');
if(teamOffice){
 const teamShortcut=document.createElement('button');teamShortcut.type='button';
 teamShortcut.textContent='Ask ATLAS about this team';teamShortcut.className='atlas-office-shortcut';
 teamShortcut.addEventListener('click',()=>window.LaylowBigManager.enter((window.LaylowWorld?.selected?.()||'ALL').name||window.LaylowWorld?.selected?.()||'ALL'));
 const officeHeader=teamOffice.querySelector('.office-header');if(officeHeader)officeHeader.append(teamShortcut);
}
})();
