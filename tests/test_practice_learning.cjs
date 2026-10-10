const assert=require('node:assert/strict');
const {PracticeMarket}=require('../practice-engine.js');
const m=new PracticeMarket(42);for(let i=0;i<1000;i++)m.step();
const snapshot=m.snapshot();assert.equal(snapshot.market_feed.live,false);assert.equal(snapshot.market_feed.status,'SIMULATED');
assert(snapshot.trade_reviews.some(r=>r.result==='WIN'));assert(snapshot.trade_reviews.some(r=>r.result==='LOSS'));
for(const trade of m.trades){const r=m.reviewTrade(trade);assert.equal(r.net_cents,trade.net_cents);assert(r.observed.includes((trade.fees_cents/100).toFixed(2)));assert(r.observed.includes(trade.reason));assert(r.lesson.length>20);assert(r.basis.includes('not a proven causal'));
 if(trade.entry_context){assert(trade.entry_context.agreement>=0);assert(trade.entry_learning.planned_risk_cents<=25000);}}
for(const learning of snapshot.learning){assert(learning.planned_risk_cents<=25000);assert(learning.risk_factor>=.65);assert.equal(learning.reviewed,m.trades.filter(t=>t.team_name===learning.team_name).length);}
const controlled=new PracticeMarket();const template={team_name:'SPY',direction:'LONG',qty:1,entry_price:100,exit_price:99,gross_cents:-100,fees_cents:200,net_cents:-300,reason:'Stop at generated candle close'};
controlled.trades=Array.from({length:4},(_,i)=>({...template,id:i+1}));assert.equal(controlled.learningStats('SPY').risk_factor,1);
controlled.trades.push({...template,id:5});let learned=controlled.learningStats('SPY');assert.equal(learned.risk_factor,.65);assert.equal(learned.extra_agreement,1);assert.equal(learned.planned_risk_cents,16250);
const asset=controlled.asset('SPY');controlled.evaluate();const analysis={...asset.analysis,direction:'LONG',agreement:2,momentum:.005,atr:.5,price:500};assert.equal(controlled.council(asset,analysis).action,'SKIP','Loss learning must enforce the stronger agreement rule');
for(let i=0;i<12;i++)controlled.trades.push({...template,id:i+6,exit_price:103,gross_cents:300,net_cents:100});learned=controlled.learningStats('SPY');assert.equal(learned.risk_factor,1);assert.equal(learned.extra_agreement,0);assert.equal(learned.planned_risk_cents,25000,'Winning sample may restore but never exceed baseline');
const feeLoss={...template,gross_cents:100,net_cents:-100,exit_price:101};assert(controlled.reviewTrade(feeLoss).lesson.includes('did not cover costs'));assert.equal(controlled.reviewTrade({...feeLoss,net_cents:0}).result,'FLAT');
const restored=new PracticeMarket();restored.restore(JSON.parse(JSON.stringify(m.export())));assert.deepEqual(restored.snapshot().learning,snapshot.learning);assert.deepEqual(restored.snapshot().trade_reviews,snapshot.trade_reviews);
restored.reset();assert(restored.snapshot().learning.every(t=>t.reviewed===0&&t.risk_factor===1));
console.log('Practice learning passed: evidence-based reviews, costs-only losses, five-result threshold, stronger entry agreement, reduced risk, wins restoring baseline, persistence and reset.');
