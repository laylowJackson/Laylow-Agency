'use strict';
// Server-owned fake ledger. No broker client or order submission dependency.
const fs=require('node:fs'),{LivePracticeMarket}=require('./live-practice.js');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const model=new LivePracticeMarket();
if(input.session){
 model.restore(input.session);
 // Only an uninterrupted worker may resume bar/quote deduplication. Restart
 // reconnects and monitors positions but never backfills old entries.
 if(input.continuation===true){model.barSeen=input.session.barSeen||{};model.quoteSeen=input.session.quoteSeen||{};}
}
if(input.running===true)model.ingest(input.feed);
const snapshot=model.snapshot();snapshot.server_practice=true;snapshot.practice_running=input.running===true;
snapshot.open_fake_positions=model.positions;snapshot.closed_fake_trades=model.trades;
for(const team of snapshot.teams){const observation=model.observations[team.name];team.heartbeat=observation?.timestamp??null;team.heartbeat_age_seconds=observation?Math.max(0,(Date.now()-Date.parse(observation.timestamp))/1000):null;team.analysis.bar_time=team.analysis.bars.at(-1)?.timestamp??null;}
snapshot.summary.fresh_workers=snapshot.teams.filter(t=>t.health==='fresh').length;
if(!input.running){snapshot.market_feed.live=false;snapshot.market_feed.status='PAUSED';snapshot.market_feed.reason='Server fake-money worker paused. No position monitoring while paused.';for(const team of snapshot.teams)if(team.worker_state==='RUNNING')team.worker_state='PAUSED';}
const trades=model.trades,net=trades.reduce((n,t)=>n+t.net_cents,0),wins=trades.filter(t=>t.net_cents>0),losses=trades.filter(t=>t.net_cents<0),positive=wins.reduce((n,t)=>n+t.net_cents,0),negative=-losses.reduce((n,t)=>n+t.net_cents,0);
snapshot.validation={source:'Observed IEX prices / modeled fake fills',closed_trades:trades.length,wins:wins.length,losses:losses.length,flat:trades.length-wins.length-losses.length,win_rate:trades.length?wins.length/trades.length:null,net_cents:net,expectancy_cents:trades.length?net/trades.length:null,profit_factor:negative?positive/negative:null,max_drawdown_cents:model.account.max_drawdown_cents,strategy_edge_verified:false,broker_execution_verified:false,live_locked:true,limitations:['Polling can miss stop/target crossings','No broker orders or verified fills','Forward observations are not out-of-sample historical validation','No futures data','No guaranteed win rate or maximum loss']};
process.stdout.write(JSON.stringify({session:model.export(),snapshot}));
