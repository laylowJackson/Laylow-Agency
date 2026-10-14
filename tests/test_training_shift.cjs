const assert=require('node:assert/strict'),policy=require('../training-policy.js'),{TrainingLab,variants}=require('../training-engine.js'),{PracticeMarket}=require('../practice-engine.js');
const at=s=>new Date(s);
assert.equal(policy.session('SPY',at('2026-10-12T13:29:59Z')).closed,true);
assert.equal(policy.session('SPY',at('2026-10-12T13:30:00Z')).closed,false);
assert.equal(policy.session('SPY',at('2026-10-12T20:00:00Z')).closed,true);
assert.equal(policy.session('SPY',at('2026-01-12T14:30:00Z')).closed,false,'DST must use exchange timezone');
for(const name of ['NQ1!','ES1!','MGC1!','MNQ1!','MES1!','GC1!']){
 assert.equal(policy.session(name,at('2026-10-11T21:59:59Z')).closed,true);
 assert.equal(policy.session(name,at('2026-10-11T22:00:00Z')).closed,false);
 assert.equal(policy.session(name,at('2026-10-12T21:00:00Z')).closed,true);
 assert.equal(policy.session(name,at('2026-10-12T22:00:00Z')).closed,false);
 assert.equal(policy.session(name,at('2026-10-10T10:00:00Z')).closed,true);
}
assert.equal(policy.session('OTHER',at('2026-10-12T22:00:00Z')).closed,null);
const night=policy.plan(at('2026-10-10T12:00:00Z'));assert.equal(night.deepTeams.length,10);assert.equal(night.clock_verified,false);
const day=policy.plan(at('2026-10-12T15:00:00Z'));assert.equal(day.deepTeams.length,0);assert.equal(policy.plan(at('2026-10-12T15:00:00Z'),'deep').deepTeams.length,10);
assert.throws(()=>policy.plan(new Date(),'live'));
const account=new PracticeMarket(),ledger=JSON.stringify(account.export()),lab=new TrainingLab(),normal=new TrainingLab();
lab.step({deepTeams:night.deepTeams});normal.step();
for(const t of lab.teams){assert.equal(t.practice_research.comparisons.length,8);assert.equal(t.practice_research.recipe_tests,8);assert.equal(Object.keys(t.research_scoreboard).length,variants.length);assert(Object.values(t.research_scoreboard).every(s=>s.rounds===1&&s.auto_promoted===false&&s.gates.independent_market_data===false));assert.deepEqual(t.trace,normal.teams.find(x=>x.name===t.name).trace,'Deep test evidence must not alter earlier selection');}
assert.equal(lab.snapshot().practice_bot.recipe_tests,80);assert.equal(JSON.stringify(account.export()),ledger);
const restored=new TrainingLab();restored.restore(JSON.parse(JSON.stringify(lab.export())));assert.deepEqual(restored.step({deepTeams:night.deepTeams}),lab.step({deepTeams:night.deepTeams}));
assert.equal(lab.snapshot().practice_bot.recipe_tests,160);
lab.step({deepTeams:['AAPL']});assert.equal(lab.teams.find(t=>t.name==='AAPL').practice_research.comparisons.length,8);assert.equal(lab.teams[0].practice_research.comparisons.length,0);
const invalid=JSON.parse(JSON.stringify(lab.export()));invalid.teams[0].practice_research.recipe_tests=-1;assert.throws(()=>restored.restore(invalid));
console.log('Training shifts passed: DST, stock/futures boundaries, unknown clocks, eight independent recipe scoreboards, unchanged selection, persistence and account isolation.');
