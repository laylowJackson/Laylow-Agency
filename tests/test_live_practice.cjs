const assert=require('node:assert/strict');
const {LivePracticeMarket}=require('../live-practice.js');
const original=Date.now;let now=Date.parse('2026-10-12T15:30:00Z');Date.now=()=>now;
const symbols=['SPY','QQQ','AAPL','TSLA'];
function payload(){return {feed:'iex',execution:'FAKE_MONEY_ONLY',orders_sent:false,received_at:new Date(now).toISOString(),market_open:true,live:true,status:'LIVE',reason:'Observed IEX',source:'Alpaca IEX',stocks:Object.fromEntries(symbols.map(name=>[name,{price:105,timestamp:new Date(now-1000).toISOString(),fresh:true,bars:Array.from({length:40},(_,i)=>({timestamp:new Date(now-(40-i)*60000).toISOString(),open:100+i*.1,high:100.2+i*.1,low:99.9+i*.1,close:100.1+i*.1,volume:1000+i*10}))}]))};}
try{
 const m=new LivePracticeMarket();assert.equal(m.account.initial_cents,5000000);assert(m.assets.every(a=>a.bars.length===0));assert.equal(m.step(),false);
 m.ingest(payload());assert.equal(m.positions.length,0,'no warm-up backfill trades');assert.equal(m.snapshot().market_feed.live,true);assert(m.snapshot().teams.filter(t=>t.name.includes('!')).every(t=>t.worker_state==='WATCH_ONLY'&&t.analysis.bars.length===0));
 now+=60000;m.ingest(payload());assert(m.positions.length>0,'fresh new bars can make fake entries');assert.equal(m.positions.length,4);const before=m.export();m.ingest(payload());assert.equal(m.serial,before.serial,'same bar cannot duplicate entry');
 const restored=new LivePracticeMarket();restored.restore(before);assert.equal(restored.positions.length,4);assert.equal(restored.snapshot().market_feed.live,false);assert.equal(restored.close(restored.positions[0].id),false,'cannot close without reconnected data');assert(restored.assets.filter(a=>a.name.includes('!')).every(a=>a.bars.length===0));
 const stopped=payload();for(const s of Object.values(stopped.stocks))s.price=90;now+=15000;stopped.received_at=new Date(now).toISOString();m.ingest(stopped);assert.equal(m.positions.length,0);assert(m.trades.every(t=>t.net_cents<0&&t.execution_model==='observed_last_trade_poll_v1'));assert(m.trades.every(t=>t.source.includes('FAKE FILL')));
 const stale=new LivePracticeMarket();const s=payload();for(const row of Object.values(s.stocks))row.timestamp=new Date(now-180000).toISOString();stale.ingest(s);assert.equal(stale.feed.live,false);assert.equal(stale.positions.length,0);assert.equal(stale.snapshot().market_feed.status,'STALE');
 const closed=new LivePracticeMarket();closed.ingest({...payload(),market_open:false,live:false,status:'MARKET_CLOSED'});assert.equal(closed.positions.length,0);
 const bad=payload();bad.stocks.SPY.bars.at(-1).timestamp=new Date(now).toISOString();assert.throws(()=>new LivePracticeMarket().ingest(bad),/unfinished/);
 const aged=new LivePracticeMarket();aged.ingest(payload());now+=100000;assert.equal(aged.snapshot().market_feed.live,false,'fresh status expires without a request');
 assert.throws(()=>new LivePracticeMarket().ingest({...payload(),orders_sent:true}),/Unverified/);
 console.log('Live-price practice: warm-up, fake fills, duplicate bars, stale/closed data, unsupported futures and restore passed.');
}finally{Date.now=original;}
