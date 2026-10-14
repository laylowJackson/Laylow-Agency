/* Viewer/control for the supervised fake-money worker. Never executes trades. */
(()=>{'use strict';
const panel=document.createElement('section');panel.className='panel practice-panel';panel.id='server-practice';
panel.innerHTML='<span class="world-kicker">SERVER / FAKE MONEY ONLY</span><h2>Background live-price practice</h2><p>One server-owned $50,000 fake account, separate from browser practice. Closing this page does not pause a running worker. The computer or server must stay on.</p><div class="practice-actions"><button id="server-start">Start background practice</button><button id="server-pause">Pause background practice</button><button id="server-watch">View server teams in city</button><button id="server-export">Export saved server review</button></div><p id="server-status" role="status">Checking server worker…</p><p id="server-metrics"></p><p>Real-money trading remains locked. Training and modeled profits do not prove a profitable strategy. Broker paper orders have not been verified.</p><details><summary>Server fake positions and recent trades</summary><pre id="server-ledger" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>';
document.getElementById('practice').after(panel);
const data=document.createElement('p');data.textContent='Export accumulated real OHLC for chronological research: ';
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){for(const symbol of ['SPY','QQQ','AAPL','TSLA']){const link=document.createElement('a');link.href='/api/server-practice/bars/'+symbol+'.csv';link.textContent=symbol+' CSV ';link.download='';data.append(link);}}else data.textContent='Observed OHLC exports are available in the local app or server SSH connection.';panel.append(data);
const $=id=>document.getElementById(id),local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
let viewing=false,latest=null,busy=false;
window.LaylowServerPractice={active:()=>viewing,refresh};
async function refresh(){if(busy)return;busy=true;try{if(!local)throw Error('Use the Windows app or server SSH connection; GitHub Pages cannot run background workers.');const response=await fetch('/api/server-practice',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Server checkpoint unavailable.');latest=await response.json();if(!latest.available)throw Error('Worker not started. Run START_WINDOWS.bat or the server container.');const s=latest.snapshot,v=s.validation;
 $('server-status').textContent=latest.status+' · '+s.market_feed.status+' · '+s.market_feed.reason+' · Saved '+new Date(latest.updated_at).toLocaleString();
 $('server-metrics').textContent='Fake equity $'+(s.account.equity_cents/100).toFixed(2)+' · '+v.closed_trades+' closed trades · Win rate '+(v.win_rate===null?'unknown':(v.win_rate*100).toFixed(1)+'%')+' · Net $'+(v.net_cents/100).toFixed(2)+' · Profit factor '+(v.profit_factor===null?'unknown':v.profit_factor.toFixed(2))+' · Strategy edge: NOT VERIFIED';
 $('server-ledger').textContent=JSON.stringify({open_positions:s.open_fake_positions,recent_closed:s.closed_fake_trades.slice(-15)},null,2);
 if(viewing)window.LaylowWorld.practiceSnapshot(s);
 }catch(error){$('server-status').textContent=error.message;if(viewing){viewing=false;window.LaylowWorld.resumeBackend();}}finally{busy=false;}}
async function control(running){try{const settings=await fetch('/api/settings',{cache:'no-store'});if(!settings.ok)throw Error('Local settings unavailable');const {csrf_token}=await settings.json();const response=await fetch('/api/server-practice/control',{method:'POST',headers:{'Content-Type':'application/json','X-Laylow-CSRF':csrf_token},body:JSON.stringify({running})});if(!response.ok)throw Error('Control rejected');$('server-status').textContent=(await response.json()).message;}catch{$('server-status').textContent='Could not update server control. Use the local app or SSH tunnel.';}}
 $('server-start').addEventListener('click',()=>control(true));$('server-pause').addEventListener('click',()=>control(false));
 $('server-watch').addEventListener('click',()=>{if(window.LaylowPractice?.active())$('practice-exit').click();viewing=true;refresh();location.hash='world';});
 $('server-export').addEventListener('click',()=>{if(!latest?.available)return;const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='laylow-server-fake-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 for(const id of ['server-start','server-pause','server-watch'])$(id).disabled=!local;
 document.getElementById('practice-toggle').addEventListener('click',()=>{viewing=false;});
 document.getElementById('practice-feed-connect').addEventListener('click',()=>{viewing=false;});
 refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);
})();
