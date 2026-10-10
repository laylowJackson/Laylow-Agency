const assert=require('node:assert/strict'),{TrainingLab,test,variants}=require('../training-engine.js'),{PracticeMarket}=require('../practice-engine.js');
const account=new PracticeMarket(),original=JSON.stringify(account.export()),a=new TrainingLab(),b=new TrainingLab();
for(let i=0;i<12;i++){a.step();b.step();}
assert.deepEqual(a.snapshot(),b.snapshot(),'Research must be deterministic');
assert.equal(a.snapshot().experiments,120);assert(a.teams.every(t=>t.experiments===12&&t.trades>0),'Every team must run drills, including full-size futures');
assert.equal(JSON.stringify(account.export()),original,'Research never changes practice ledger, positions or brakes');
const restored=new TrainingLab();restored.restore(JSON.parse(JSON.stringify(a.export())));assert.deepEqual(restored.step(),a.step(),'Resume preserves experiment sequence');
assert.throws(()=>restored.restore({version:1,round:-1,teams:[]}));
const asset=account.assets[0],bars=asset.bars.map((v,i)=>({...v,close:100+i*.2,high:101+i*.2,low:99+i*.2}));
const baseline=test(asset,bars,variants[0],21,55),future=bars.map((v,i)=>i>=55?{...v,close:99999}:v);
assert.deepEqual(test(asset,future,variants[0],21,55),baseline,'Future candles cannot affect earlier selection');
assert(a.teams.filter(t=>t.status==='Candidate for review').every(t=>t.experiments>=6&&t.trades>=10&&t.verified_rounds>=3&&t.candidate_net_cents>0&&t.candidate_net_cents>t.baseline_net_cents));
console.log('Training engine passed: all ten teams, separate ledger, deterministic resume, held-out boundaries and promotion gate.');
