const assert=require('node:assert/strict');
const {PracticeMarket,START}=require('../practice-engine.js');
const m=new PracticeMarket();
assert.equal(m.account.equity_cents,5000000);
assert.equal(m.account.balance_cents,5000000);
for(let i=0;i<600;i++){
 m.step();const a=m.account;
 assert.equal(a.equity_cents,a.balance_cents+a.unrealized_cents);
 assert.equal(a.balance_cents,START+a.realized_cents-m.positions.reduce((s,p)=>s+p.entry_fee_cents,0));
 assert(a.available_cents>=0);assert(m.positions.length<=4);
 assert.equal(new Set(m.positions.map(p=>p.team_name)).size,m.positions.length);
 for(const p of m.positions){const def=m.asset(p.team_name);assert(p.qty>0);if(def.margin)assert.equal(p.qty,1);assert(p.qty*p.stop_distance*def.multiplier*100+p.entry_fee_cents*2<=25000+.01);}
 for(const review of m.reviews.filter(r=>r.action==='ENTER')){assert(review.favorable_votes>=4);assert(!review.members.some(m=>m.vote==='VETO'));}
}
assert(m.trades.length>10,'Practice never completes trades');
assert(m.trades.some(t=>t.net_cents>0),'No winners generated');assert(m.trades.some(t=>t.net_cents<0),'No losers generated');
const restored=new PracticeMarket();restored.restore(JSON.parse(JSON.stringify(m.export())));assert.deepEqual(restored.account,m.account);
const corrupted=JSON.parse(JSON.stringify(m.export()));corrupted.trades[0].net_cents+=1000000;assert.throws(()=>new PracticeMarket().restore(corrupted));
// Independently verify full-size ES multiplier, short P&L, fees and collateral release.
const f=new PracticeMarket();const es=f.asset('ES1!');es.bars.at(-1).close=5000;
f.positions=[{id:1,team_name:'ES1!',direction:'SHORT',qty:1,entry_price:5001,entry_fee_cents:200,reserve_cents:500000,stop_distance:1,opened_minute:0}];
assert.equal(f.account.balance_cents,4999800);assert.equal(f.account.reserved_cents,500000);assert.equal(f.account.unrealized_cents,5000);
f.close(1);assert.equal(f.trades[0].exit_price,5000.25);assert.equal(f.trades[0].gross_cents,3750);assert.equal(f.trades[0].fees_cents,400);assert.equal(f.account.realized_cents,3350);assert.equal(f.account.balance_cents,5003350);assert.equal(f.account.reserved_cents,0);assert.equal(f.close(1),false);
const same1=new PracticeMarket(42),same2=new PracticeMarket(42);for(let i=0;i<50;i++){same1.step();same2.step();}assert.deepEqual(same1.account,same2.account);
m.reset();assert.equal(m.account.balance_cents,5000000);assert.equal(m.positions.length,0);assert.equal(m.trades.length,0);assert.equal(m.minute,0);
const brake=new PracticeMarket();brake.positions=[{id:1,team_name:'SPY',direction:'LONG',qty:100,entry_price:1000,entry_fee_cents:100,reserve_cents:1000000,stop_distance:1000,opened_minute:0}];brake.step();assert(brake.riskLocked);assert.equal(brake.positions.length,0);const lockedMinute=brake.minute;assert.equal(brake.step(),false);assert.equal(brake.minute,lockedMinute);
console.log('Practice accounting passed: $50,000 reset, cash/equity reconciliation, position/risk caps, gains/losses, fees, short futures multiplier, restore, determinism, loss brake and duplicate-close protection.');
