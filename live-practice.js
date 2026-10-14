/* Real IEX observations, separate fake ledger. This module never sends broker orders. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./practice-engine.js'):root.LaylowPracticeEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowLivePractice=api;})(typeof window!=='undefined'?window:this,function(base){
'use strict';
const stocks=['SPY','QQQ','AAPL','TSLA'],sign=d=>d==='LONG'?1:-1;
const validBar=b=>b&&[b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)&&Number.isFinite(b.volume)&&b.volume>=0&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&Number.isFinite(Date.parse(b.timestamp));
class LivePracticeMarket extends base.PracticeMarket{
 reset(){this.liveMode=false;super.reset();this.liveMode=true;this.sessionStarted=Date.now();this.feed={status:'NOT_CONNECTED',live:false,source:'Alpaca IEX',reason:'Connect the local data feed. No generated-price fallback.'};this.observations={};this.barSeen={};this.quoteSeen={};for(const a of this.assets)a.bars=[];this.events=[];this.evaluate();}
 evaluate(){
  if(!this.liveMode)return super.evaluate();
  this.reviews=this.assets.map(a=>{
   const observation=this.observations[a.name],ready=stocks.includes(a.name)&&a.bars.length>=30&&a.bars.slice(-30).every(b=>b.volume>0)&&this.feed.live===true&&observation?.fresh===true;
   if(!ready||a.bars.slice(-30).reduce((s,b)=>s+b.volume,0)<=0){a.analysis={state:'WAIT',direction:'WAIT',agreement:0,votes:[],candle_review:null,source:'ALPACA IEX',reason:stocks.includes(a.name)?this.feed.reason:'Futures feed not connected',price:observation?.price??null};return {team_name:a.name,action:'SKIP',direction:'WAIT',favorable_votes:0,members:[],watch_only:true,reason:a.analysis.reason};}
   a.analysis=super.analyze(a);a.analysis.price=observation.price;a.analysis.source='ALPACA IEX · completed 1-minute bars';a.analysis.reason='Rule-based signals from observed IEX OHLC';for(const v of a.analysis.votes)v.reason=v.reason.replace('Synthetic ','Observed IEX ').replace('generated candles','completed market candles');
   if(a.analysis.candle_review){a.analysis.candle_review=JSON.parse(JSON.stringify(a.analysis.candle_review).replaceAll('synthetic_ohlc','observed_iex_ohlc'));for(const v of a.analysis.votes)v.candle_review=a.analysis.candle_review;}
   return super.council(a,a.analysis);
  });
 }
 unrealized(p){const price=this.observations?.[p.team_name]?.price??this.asset(p.team_name).bars.at(-1)?.close??p.entry_price;return Math.round((price-p.entry_price)*sign(p.direction)*p.qty*100);}
 close(id,reason='Manual fake close at observed IEX price',fillPrice=null,ambiguous=false){
  const p=this.positions.find(p=>p.id===id);if(!p||!this.fresh()||!this.observations[p.team_name]?.fresh)return false;
  const filled=super.close(id,reason,fillPrice??this.observations[p.team_name].price,ambiguous);
  if(filled){const t=this.trades.at(-1);t.source='ALPACA IEX OBSERVATION · FAKE FILL · 1 tick slippage per side';t.execution_model='observed_last_trade_poll_v1';t.closed_at=this.feed.received_at;}
  return filled;
 }
 ingest(payload,now=Date.now()){
  if(!payload||payload.feed!=='iex'||payload.execution!=='FAKE_MONEY_ONLY'||payload.orders_sent!==false||!Number.isFinite(Date.parse(payload.received_at))||Math.abs(now-Date.parse(payload.received_at))>90000)throw Error('Unverified feed response');
  const observations={};
  for(const name of stocks){const s=payload.stocks?.[name];if(!s)continue;if(!Number.isFinite(s.price)||s.price<=0||!Number.isFinite(Date.parse(s.timestamp))||!Array.isArray(s.bars)||s.bars.length>120||!s.bars.every(validBar))throw Error('Invalid market observation');
   let previous=-Infinity;for(const b of s.bars){const time=Date.parse(b.timestamp);if(time<=previous||time+60000>now)throw Error('Unordered or unfinished candles');previous=time;}
   observations[name]={...s,fresh:s.fresh===true&&now-Date.parse(s.timestamp)<=90000&&now-Date.parse(s.timestamp)>=-5000};
  }
  this.feed={...payload,live:payload.live===true&&payload.market_open===true&&stocks.every(n=>observations[n]?.fresh),stocks:undefined};if(payload.live&&!this.feed.live){this.feed.status='STALE';this.feed.reason='Observed prices are stale. Trading paused.';}this.observations=observations;
  for(const a of this.assets)if(observations[a.name])a.bars=observations[a.name].bars;
  this.minute=Math.max(0,Math.floor((now-this.sessionStarted)/60000));this.baseTime=now-this.minute*60000;
  this.evaluate();if(!this.feed.live)return false;
  for(const p of [...this.positions]){const o=observations[p.team_name];if(this.quoteSeen[p.team_name]===o.timestamp)continue;const side=sign(p.direction),stop=p.entry_price-side*p.stop_distance,target=p.entry_price+side*p.stop_distance*1.6;
   if(side*(o.price-stop)<=0)this.close(p.id,'Stop crossed at observed IEX price; polling can miss prices',o.price);
   else if(side*(o.price-target)>=0)this.close(p.id,'Target crossed at observed IEX price; fake fill',o.price);
   else if(now-Date.parse(p.opened_at)>=12*60000)this.close(p.id,'12-minute live-price practice time exit',o.price);
  }
  if(this.account.equity_cents<=base.START-100000){for(const p of [...this.positions])this.close(p.id,'$1,000 fake-account loss brake');this.riskLocked=true;}
  this.evaluate();
  for(const name of stocks){const a=this.asset(name),bar=a.bars.at(-1),o=observations[name];if(!bar)continue;const previous=this.barSeen[name];this.barSeen[name]=bar.timestamp;
   // Warm-up never trades historical candles; only a newly observed completed bar may enter.
   if(!previous||previous===bar.timestamp||now-Date.parse(bar.timestamp)>150000||(this.cooldowns[name]||0)>this.minute||this.riskLocked)continue;
   const last30=a.bars.slice(-30);if(last30.length<30||last30.some((b,i)=>i&&Date.parse(b.timestamp)-Date.parse(last30[i-1].timestamp)!==60000))continue;
   if(super.open(a,this.reviews.find(r=>r.team_name===name))){const p=this.positions.at(-1);p.opened_at=payload.received_at;p.market_source='Alpaca IEX';}
  }
  for(const name of stocks)this.quoteSeen[name]=observations[name].timestamp;
  this.evaluate();this.peak=Math.max(this.peak,this.account.equity_cents);this.maxDrawdown=Math.max(this.maxDrawdown,this.peak-this.account.equity_cents);return true;
 }
 step(){return false;} // Never generate candles in live-price mode.
 fresh(){const now=Date.now();return this.feed.live===true&&Math.abs(now-Date.parse(this.feed.received_at))<=90000&&stocks.every(n=>this.observations[n]?.fresh&&now-Date.parse(this.observations[n].timestamp)<=90000&&now-Date.parse(this.observations[n].timestamp)>=-5000);}
 snapshot(){const s=super.snapshot(),fresh=this.fresh();s.live_price_practice=true;s.market_feed={...this.feed,live:fresh,status:this.feed.live&&!fresh?'STALE':this.feed.status};s.payroll.sources=[{source:'LIVE-PRICE FAKE LEDGER · IEX',as_of:this.feed.received_at}];s.payroll.basis='Simulated fills using polled IEX last trades; modeled costs; no broker orders';s.big_manager.summary='Live-price practice · four stock teams · futures disconnected · fake money only';
  for(const t of s.teams){const o=this.observations[t.name];t.worker_state=!stocks.includes(t.name)?'WATCH_ONLY':!fresh||!o?.fresh?'PAUSED':this.riskLocked?'PAUSED':'RUNNING';t.health=o?.fresh&&fresh?'fresh':'unavailable';t.notes=stocks.includes(t.name)?this.feed.reason:'No futures market feed';t.analysis={...t.analysis,price:o?.price??null,bars:this.asset(t.name).bars};}
  return s;}
 export(){return {...super.export(),live_price_practice:true,sessionStarted:this.sessionStarted,observations:this.observations,barSeen:this.barSeen,quoteSeen:this.quoteSeen};}
 restore(data){
  // Use existing ledger validation with filler bars only internally for unsupported districts.
  // Filler bars are removed before any snapshot or evaluation can be published.
  if(!data?.live_price_practice||!Array.isArray(data.assets)||data.assets.some(a=>!Array.isArray(a.bars)||!a.bars.every(validBar)))throw Error('Invalid live-price save');
  const savedBars=structuredClone(data.assets),fallback=()=>Array.from({length:30},(_,i)=>({timestamp:new Date(Date.now()-(30-i)*60000).toISOString(),open:1,high:1,low:1,close:1,volume:1}));
  const copy=structuredClone(data);for(const a of copy.assets)if(a.bars.length<21)a.bars=fallback();else for(const b of a.bars)if(b.volume===0)b.volume=1;
  this.liveMode=false;super.restore(copy);this.liveMode=true;this.observations={};this.barSeen={};this.quoteSeen={};for(const a of this.assets)a.bars=savedBars.find(b=>b.name===a.name).bars;
  if(this.positions.some(p=>!stocks.includes(p.team_name))||this.trades.some(p=>!stocks.includes(p.team_name)))throw Error('Unsupported live-price ledger');this.sessionStarted=Number.isFinite(data.sessionStarted)?data.sessionStarted:data.baseTime;this.feed={status:'RECONNECT_REQUIRED',live:false,source:'Alpaca IEX',reason:'Saved fake ledger restored. Reconnect for fresh prices.'};this.evaluate();
 }
}
return {LivePracticeMarket};
});
