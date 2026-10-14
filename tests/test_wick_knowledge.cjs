const assert=require('node:assert/strict'),{measure,describe}=require('../wick-knowledge.js');
const verified={chart_type:'standard',closed:true,timing:'pre_entry',prior_trend:'down'};
assert.deepEqual(measure({open:100,high:108,low:96,close:102}),{valid:true,body:2,range:12,upper_wick:6,lower_wick:4,upper_body_ratio:3,lower_body_ratio:2,close_location:.5,body_fraction:1/6});
const down=measure({open:102,high:108,low:96,close:100});assert.equal(down.upper_wick,6);assert.equal(down.lower_wick,4);
for(const bad of [null,{open:null,high:2,low:0,close:1},{open:1,high:.5,low:0,close:1},{open:1,high:2,low:1.5,close:1},{open:1,high:Infinity,low:0,close:1}])assert.equal(measure(bad).valid,false);
const tail={open:100,high:102,low:90,close:102};
assert.equal(describe(tail,verified).pattern,'Possible hammer');assert.equal(describe(tail,{...verified,prior_trend:'up'}).pattern,'Possible hanging man');
const upper={open:100,high:112,low:100,close:102};assert.equal(describe(upper,{...verified,prior_trend:'up'}).pattern,'Possible shooting star');assert.equal(describe(upper,verified).pattern,'Possible inverted hammer');
assert.equal(describe(tail,{...verified,prior_trend:'unknown'}).pattern,null);
for(const chart_type of ['unknown','synthetic'])assert.equal(describe(tail,{...verified,chart_type}).shape,null);
for(const closed of [false,null]){const d=describe(tail,{...verified,closed});assert.equal(d.pattern,null);assert.equal(d.entry_evidence,false);}
assert.equal(describe(tail,{...verified,timing:'post_entry'}).entry_evidence,false);
assert.equal(describe(tail,verified).entry_evidence,true);
const doji=describe({open:100,close:100,high:110,low:90},verified);assert.equal(doji.shape,'Doji-like');assert.equal(doji.pattern,null);assert.equal(doji.metrics.upper_body_ratio,null);
const flat=describe({open:100,close:100,high:100,low:100},verified);assert.equal(flat.shape,'No range');assert.equal(flat.metrics.close_location,null);
const negative=measure({open:-3,close:-2,high:-1,low:-4});assert.equal(negative.valid,true);assert.equal(negative.upper_wick,1);
for(const d of [doji,flat,describe(tail,verified)]){assert.equal(d.signal,null);assert.equal(d.outcome,'unknown');assert.equal(d.confidence,null);assert.equal(d.provenance,'user_visual_estimate');assert(d.limitations.some(s=>s.includes('extreme happened first')));}
assert.equal(describe(tail,{...verified,basis:'user_verified_ohlc'}).provenance,'user_verified_ohlc');
console.log('Wick knowledge passed: bullish/bearish formulas, invalid/unknown OHLC, context names, incomplete/synthetic bars, zero body/range, timing and no signal/outcome/confidence.');
const {reviewCandles,trendFilter}=require('../wick-knowledge.js');
const bars=Array.from({length:7},(_,i)=>({timestamp:new Date(Date.UTC(2020,0,1,0,i)).toISOString(),open:105-i,high:106-i,low:103-i,close:104-i}));
bars[6]={timestamp:bars[6].timestamp,...tail};
const context={basis:'synthetic_ohlc',chart_type:'standard',as_of:bars[6].timestamp};
const known=reviewCandles(bars,context);assert.equal(known.pattern,'Possible hammer');assert.equal(known.entry_evidence,true);assert.equal(known.provenance,'synthetic_ohlc');assert.equal(trendFilter(known,'LONG'),true);assert.equal(trendFilter(known,'SHORT'),false);
const futureBar={...tail,timestamp:'2020-01-01T00:07:00.000Z',high:9999};
assert.deepEqual(reviewCandles([...bars,futureBar],context),known,'Later bars cannot influence earlier knowledge');
assert.equal(reviewCandles(bars,{...context,basis:'provider_ohlc'}).available,false,'Provider interval is required');
const provider=reviewCandles(bars,{...context,basis:'provider_ohlc',duration_seconds:60});assert.equal(provider.candle_time,bars[5].timestamp,'Current forming minute is excluded');
assert.equal(reviewCandles(bars,{...context,chart_type:'synthetic'}).available,false);
assert.equal(reviewCandles(bars,{...context,basis:'user_visual_estimate'}).available,false,'Screenshot estimates cannot enter bot OHLC evidence');
assert.equal(trendFilter({available:false},'LONG'),false);
const {PracticeMarket}=require('../practice-engine.js'),{TrainingLab,test,variants}=require('../training-engine.js');
const market=new PracticeMarket();assert(market.assets.every(a=>a.analysis.votes.every(v=>v.candle_review.available&&v.candle_review.signal===null)));assert(market.reviews.every(r=>r.candle_review.available));
const saved=JSON.parse(JSON.stringify(market.export()));const old=new PracticeMarket();old.restore(saved);assert.deepEqual(old.account,market.account);
const lab=new TrainingLab();lab.step();assert(lab.teams.every(t=>t.wick_research.version===1&&!t.wick_research.auto_promoted));
const asset=market.assets[0],rule=variants.find(r=>r.wick_filter),training=lab.teams[0].trace.bars;
assert.deepEqual(test(asset,training,rule,21,75),test(asset,training.map((b,i)=>i>=75?{...b,high:b.high+9999}:b),rule,21,75));
for(const team of lab.teams)for(const t of team.trace.candidate.trade_records){assert.equal(t.entry_index,t.signal_index+1);assert.equal(t.candle_review.candle_time,team.trace.bars[t.signal_index].timestamp,'Trade retains only completed signal-candle knowledge before next-open entry');}
console.log('Bot integration passed: ten teams/council, experimental held-out candidate, no future evidence or screenshot inference, preserved account.');
