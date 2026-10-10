/* Preferences contain display options only. Broker secrets go to the local server only. */
(()=>{'use strict';
const $=id=>document.getElementById(id),key='laylow-display-settings-v1';
const defaults={bubbles:true,effects:false,motion:false,scale:'normal'};
let preferences={...defaults},storage=null,localSetup=null,opener=null,busy=false;
try{storage=localStorage;const raw=JSON.parse(storage.getItem(key));if(raw&&typeof raw==='object'){for(const k of ['bubbles','effects','motion'])if(typeof raw[k]==='boolean')preferences[k]=raw[k];if(['normal','large'].includes(raw.scale))preferences.scale=raw.scale;}}catch{}
const room=document.createElement('dialog');room.id='settings-room';room.setAttribute('aria-labelledby','settings-title');
room.innerHTML=`<header class="settings-header"><div><span class="world-kicker">LAYLOW / CONTROL CENTER</span><h2 id="settings-title">Settings</h2><p>Your workspace. Your connections. Clear boundaries.</p></div><button id="settings-close" type="button">Return to city ×</button></header>
<div class="settings-status-strip"><span><i></i> <strong id="settings-session">Practice workspace</strong></span><span id="settings-market">Generated prices</span><span class="settings-lock">▣ LIVE LOCKED</span></div>
<div class="settings-layout"><div>
<section class="settings-card"><div class="settings-card-heading"><span class="settings-icon">⌁</span><div><h3>Broker connection</h3><p>Add your paper account when you are ready.</p></div><span id="broker-badge" class="settings-badge">NOT CONNECTED</span></div>
<p id="broker-setup-note">Checking whether secure local setup is available…</p>
<form id="broker-settings-form" autocomplete="off"><label for="settings-broker">Supported adapter</label><select id="settings-broker"><option value="alpaca-paper">Alpaca · stocks · paper only</option></select><p class="settings-caption">The router supports additional adapters in code. Futures teams remain watch-only in the backend.</p>
<fieldset id="broker-credentials" disabled><label for="broker-key">API key</label><input id="broker-key" type="password" autocomplete="off" spellcheck="false" maxlength="512" placeholder="Enter locally when ready"><label for="broker-secret">Secret key</label><input id="broker-secret" type="password" autocomplete="off" spellcheck="false" maxlength="512" placeholder="Never saved in your browser"><div class="settings-button-row"><button id="broker-save" class="settings-primary" type="submit">Save local credentials</button><button id="broker-clear" type="button">Remove local credentials</button></div></fieldset></form>
<p id="broker-save-status" class="settings-feedback" role="status"></p><p class="settings-caption">Saving credentials does not change execution modes, verify a connection, or place an order. Restart the local app to load saved credentials. Environment-provided keys must be removed at their source.</p>
<a class="settings-link" href="https://github.com/laylowJackson/Laylow-Agency/tree/codex/repair-worker-dashboard#readme" target="_blank" rel="noopener">Local Windows setup ↗</a></section>
<section class="settings-card"><div class="settings-card-heading"><span class="settings-icon">◈</span><div><h3>Execution & risk</h3><p>All managers use the deterministic risk gate.</p></div></div><dl class="settings-facts"><div><dt>Browser practice</dt><dd>Fake dollars · synthetic fills</dd></div><div><dt>Local execution mode</dt><dd id="settings-execution">Backend not connected</dd></div><div><dt>Local shadow mode</dt><dd id="settings-shadow">Not available</dd></div><div><dt>LIVE execution</dt><dd class="settings-locked">Hard locked · no UI switch</dd></div></dl><p class="settings-caption">Shadow mode logs the sized trade, stop, target and risk without submitting it. Broker setup cannot bypass risk checks or enable LIVE.</p><details><summary>Inspect active risk limits</summary><p id="settings-risk">Browser practice: $250 planned risk per entry, four open positions, $1,000 account loss brake and $300 team profit brake. Stops can slip; these are rules, not guaranteed loss caps.</p><p id="settings-local-risk">Local broker policy is unavailable on the public website.</p></details></section>
</div><div>
<section class="settings-card"><div class="settings-card-heading"><span class="settings-icon">✧</span><div><h3>World & rooms</h3><p>Preferences stay on this device.</p></div></div>
<label class="settings-toggle"><span>Speech bubbles<small>Show opinions above the robots</small></span><input id="settings-bubbles" type="checkbox"></label><label class="settings-toggle"><span>Room effects<small>Animated lights in offices and Council</small></span><input id="settings-effects" type="checkbox"></label><label class="settings-toggle"><span>City motion<small>Ambient skyline animation</small></span><input id="settings-motion" type="checkbox"></label><p id="settings-motion-note" class="settings-caption"></p><label for="settings-scale">Panel text</label><select id="settings-scale"><option value="normal">Standard</option><option value="large">Larger</option></select><p id="settings-display-status" role="status" class="settings-feedback"></p></section>
<section class="settings-card"><div class="settings-card-heading"><span class="settings-icon">▥</span><div><h3>Practice & training</h3><p>$50,000 starting fake balance.</p></div></div><div class="settings-button-row"><button id="settings-practice" type="button">Practice controls ↗</button><button id="settings-training" type="button">Training lab ↗</button><button id="settings-export" type="button">Export practice session</button></div><p class="settings-caption">Research uses synthetic scenarios. It runs while this page is open and visible, including outside market hours. Export your session before moving devices.</p></section>
<section class="settings-card settings-maintenance"><span class="world-kicker">ONGOING IMPROVEMENTS</span><h3>Every other Saturday</h3><p>10:00 AM · America/Chicago</p><p>Codex checks this project for bugs and useful improvements every two weeks. Tested updates keep your practice and execution safeguards intact.</p></section>
</div></div>`;
document.querySelector('main').append(room);
function apply(){
 for(const kind of ['office','council']){
  document.querySelector(kind==='office'?'.office-stage':'.council-stage')?.classList.toggle('clear-room',!preferences.bubbles);
  const bubble=document.querySelector('[data-clear-room="'+kind+'"]');if(bubble){bubble.setAttribute('aria-pressed',String(!preferences.bubbles));bubble.textContent=preferences.bubbles?'Clear room view':'Show speech bubbles';}
  window.Laylow3D?.roomEffects?.(kind,preferences.effects);
  const effect=document.querySelector('[data-room-motion="'+kind+'"]');if(effect){effect.setAttribute('aria-pressed',String(preferences.effects));effect.textContent=preferences.effects?'Room effects on':'Room effects off';}
 }
 const motion=$('city-motion'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(motion&&!motion.disabled&&(motion.getAttribute('aria-pressed')==='true')!==preferences.motion)motion.click();
 $('settings-motion').disabled=reduced;$('settings-motion-note').textContent=reduced?'Your device requests reduced motion. Animations respect that preference.':'Turn motion off for a quieter view.';
 document.body.dataset.panelText=preferences.scale;
 for(const k of ['bubbles','effects','motion'])$('settings-'+k).checked=preferences[k];$('settings-scale').value=preferences.scale;
}
function persist(){try{if(!storage)throw Error();storage.setItem(key,JSON.stringify(preferences));$('settings-display-status').textContent='Display preferences saved on this device.';}catch{$('settings-display-status').textContent='Storage unavailable. These preferences apply for this visit.';}}
function session(){const data=window.LaylowWorld.snapshot()||{};$('settings-session').textContent=data.practice?'Practice · fake dollars':'Viewer workspace';$('settings-market').textContent=data.market_feed?.live===true?'Market feed: '+(data.market_feed.source||'check provider status'):'Market feed: simulated / not connected';}
function showLocal(data){
 localSetup=data;const c=data.credentials;$('broker-credentials').disabled=false;$('broker-badge').textContent=c.key_saved&&c.secret_saved?'SAVED · UNVERIFIED':'NOT CONFIGURED';
 $('broker-setup-note').textContent='Secure local app detected. Keys are saved only in this project’s private .env.local file; values are never read back. Keep this computer account private.';
 $('settings-execution').textContent=data.configuration.execution_mode;$('settings-shadow').textContent=data.configuration.shadow?'On · no broker submission':'Off · explicit paper authorization still required';
 const p=data.risk_policy;$('settings-local-risk').textContent='Local broker policy: '+(Number(p.max_daily_loss_fraction)*100)+'% daily loss limit, '+p.max_open_positions+' positions, '+p.max_daily_trades+' daily trades ('+p.max_team_daily_trades+' per team), signals expire after '+p.max_signal_age_seconds+' seconds and quotes after '+p.max_quote_age_seconds+' seconds.';
}
async function checkLocal(){
 const loopback=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 if(loopback)try{const response=await fetch('/api/settings',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();const data=await response.json();if(data.local_setup!==true||data.live_locked!==true||typeof data.csrf_token!=='string'||!data.credentials||!data.configuration||!data.risk_policy)throw Error();showLocal(data);return;}catch{}
 localSetup=null;$('broker-credentials').disabled=true;$('broker-badge').textContent='LOCAL SETUP REQUIRED';$('broker-setup-note').textContent='This public viewer has no secure broker server. Open the local Windows app to enter broker keys. You can keep using practice and training here.';
}
async function updateBroker(action){
 if(!localSetup||busy)return;const body=action==='clear'?{action:'clear'}:{action:'save',broker:'alpaca-paper',key:$('broker-key').value.trim(),secret:$('broker-secret').value.trim()};
 if(action==='save'&&(!body.key||!body.secret)){$('broker-save-status').textContent='Enter both the API key and secret in the local app.';return;}
 busy=true;$('broker-credentials').disabled=true;
 try{const response=await fetch('/api/settings/broker',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Laylow-CSRF':localSetup.csrf_token},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const data=await response.json();if(data.saved!==true)throw Error();$('broker-save-status').textContent=data.message;await checkLocal();}
 catch{$('broker-save-status').textContent='Could not confirm the save. Reopen Settings to check saved status before retrying.';}
 finally{$('broker-key').value='';$('broker-secret').value='';busy=false;$('broker-credentials').disabled=!localSetup;}
}
function enter(){opener=document.activeElement;for(const modal of document.querySelectorAll('dialog[open]'))if(modal!==room)modal.close();if(!room.open)room.showModal();history.replaceState(null,'',location.pathname+location.search+'#settings');session();apply();checkLocal();$('settings-close').focus();}
function leave(){room.close();}
$('settings-close').addEventListener('click',leave);room.addEventListener('close',()=>{$('broker-key').value='';$('broker-secret').value='';if(document.querySelector('dialog[open]'))return;history.replaceState(null,'',location.pathname+location.search+'#world');opener?.focus?.({preventScroll:true});});
$('broker-settings-form').addEventListener('submit',e=>{e.preventDefault();updateBroker('save');});$('broker-clear').addEventListener('click',()=>updateBroker('clear'));
for(const k of ['bubbles','effects','motion'])$('settings-'+k).addEventListener('change',()=>{preferences[k]=$('settings-'+k).checked;apply();persist();});$('settings-scale').addEventListener('change',()=>{preferences.scale=$('settings-scale').value;apply();persist();});
for(const kind of ['office','council']){new MutationObserver(()=>{if($(kind==='office'?'office-dialog':'council-room').open)apply();}).observe($(kind==='office'?'office-dialog':'council-room'),{attributes:true,attributeFilter:['open']});document.querySelector('[data-clear-room="'+kind+'"]')?.addEventListener('click',e=>{preferences.bubbles=e.currentTarget.getAttribute('aria-pressed')!=='true';persist();});document.querySelector('[data-room-motion="'+kind+'"]')?.addEventListener('click',e=>{preferences.effects=e.currentTarget.getAttribute('aria-pressed')==='true';apply();persist();});}
$('city-motion').addEventListener('click',()=>{preferences.motion=$('world').dataset.motion==='on';persist();});
$('settings-export').addEventListener('click',()=>$('practice-export').click());$('settings-training').addEventListener('click',()=>{leave();document.querySelector('[data-training-enter]').click();});$('settings-practice').addEventListener('click',()=>{leave();requestAnimationFrame(()=>{$('practice').scrollIntoView({block:'start',behavior:'instant'});$('practice-toggle').focus({preventScroll:true});});});
document.querySelector('a[href="#settings"]').addEventListener('click',e=>{e.preventDefault();enter();});window.addEventListener('hashchange',()=>{if(location.hash==='#settings')enter();else if(room.open)leave();});matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',apply);
window.LaylowSettings={enter,leave};apply();if(location.hash==='#settings')enter();
})();
