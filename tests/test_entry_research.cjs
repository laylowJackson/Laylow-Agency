const assert=require('node:assert/strict'),R=require('../strategy-research.js'),P=require('../practice-engine.js'),X=require('../entry-research.js');
const bars=Array.from({length:40},(_,i)=>({timestamp:new Date(Date.UTC(2020,0,1)+i*300000).toISOString(),open:100+i,close:100.8+i,high:101+i,low:99.8+i,volume:1000,closed:true}));
const c={atr:2};assert(!R.entryFilter(bars,25,1,{higher:true},c).rejected);
const future=bars.map((v,i)=>i>25?{...v,close:1}:v);assert.deepEqual(R.entryFilter(future,25,1,{higher:true},c),R.entryFilter(bars,25,1,{higher:true},c));
const partial=bars.map((v,i)=>i===25?{...v,close:1}:v);assert.deepEqual(R.entryFilter(partial,25,1,{higher:true},c),R.entryFilter(bars,25,1,{higher:true},c),'Unfinished 15m bucket is excluded');
assert(R.entryFilter(bars,20,1,{higher:true},c).rejected);assert(R.entryFilter(bars,25,-1,{higher:true},c).rejected);
assert(!R.entryFilter(bars,25,1,{quality:true},c).rejected);const missing=bars.map(v=>({...v,volume:null}));assert.equal(R.entryFilter(missing,25,1,{quality:true},c).rejected,'Volume unavailable');
const gap=bars.map((v,i)=>({...v,timestamp:new Date(Date.parse(v.timestamp)+(i>10?900000:0)).toISOString()}));assert(R.entryFilter(gap,25,1,{higher:true},c).rejected);
const asset=P.MARKETS[0],sample=R.generate(asset,44,'Uptrend',1200).map((v,i)=>({...v,timestamp:new Date(Date.UTC(2020,0,1)+i*300000).toISOString(),volume:1000})),d={asset,bars:sample,metadata:{timeframe:'5m',duration_ms:300000,slippage_ticks:1,roundtrip_fee:2}},x=X.evaluate(d),changed={...d,bars:sample.map((v,i)=>i<960?v:{...v,high:v.high*2,low:v.low*.5})};
assert.deepEqual(X.evaluate(changed).selection,x.selection);assert.deepEqual(X.evaluate(changed).selected_method,x.selected_method);assert.equal(x.auto_promoted,false);assert.equal(x.selection_trials,4);assert.equal(X.evaluate({...d,metadata:{...d.metadata,timeframe:'1m'}}).supported,false);
function fill(side,b){const m=new P.PracticeMarket();m.positions=[{id:1,team_name:'SPY',direction:side===1?'LONG':'SHORT',qty:1,entry_price:100,entry_fee_cents:100,reserve_cents:10000,stop_distance:1,opened_minute:0}];m.generateBars=()=>{m.asset('SPY').bars.push({...b,timestamp:new Date().toISOString(),volume:1000});};m.evaluate=()=>{};m.open=()=>false;m.step();return m.trades[0];}
let t=fill(1,{open:100,high:102,low:98,close:100.5});assert(t.ambiguous);assert(Math.abs(t.exit_price-98.99)<1e-8);assert.equal(t.net_cents,-301);
t=fill(-1,{open:100,high:102,low:98,close:99.5});assert(t.ambiguous);assert(Math.abs(t.exit_price-101.01)<1e-8);
t=fill(1,{open:97,high:98,low:96,close:97.5});assert(Math.abs(t.exit_price-96.99)<1e-8,'Worse opening gap fill');
t=fill(1,{open:100,high:104,low:99.5,close:103});assert(Math.abs(t.exit_price-101.59)<1e-8,'Target fills conservatively at level less slippage');
console.log('Entry research and practice fills passed: causal completed context, missing-volume rejection, fixed selection, gaps and long/short stop-first accounting.');


const H=require('../historical-research.js'),csv=['timestamp,open,high,low,close,volume',...sample.map(v=>[v.timestamp,v.open,v.high,v.low,v.close,v.volume].join(','))].join('\n'),parsed=H.parse(csv,{symbol:'SPY',timeframe:'5m',source:'synthetic fixture',standard:true,completed:true,slippage_ticks:1,roundtrip_fee:2,tick:.01,multiplier:1});assert.deepEqual(H.evaluate(parsed).entry_experiment.selection,X.evaluate(parsed).selection,'Persisted input revalidation preserves volume');
