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
