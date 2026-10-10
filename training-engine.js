/* Independent research sandbox. Synthetic prices, no orders, no account mutations. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./practice-engine.js'):root.LaylowPracticeEngine);if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowTrainingEngine=api;})(typeof window!=='undefined'?window:this,function(engine){
'use strict';
const {PracticeMarket,MARKETS}=engine;
const variants=[{id:'balanced',label:'Balanced trend',lookback:8,threshold:.0004,hold:8,stop:1.5},{id:'patient',label:'Patient confirmation',lookback:14,threshold:.0008,hold:12,stop:1.8},{id:'quick',label:'Quick momentum',lookback:5,threshold:.0006,hold:5,stop:1.2}];
const sum=a=>a.reduce((n,v)=>n+v,0);
function test(asset,bars,rule,start,end){
 let position=null,net=0,peak=0,drawdown=0;const trades=[];
 const close=(i,reason)=>{const p=position,exit=bars[i].close-p.side*asset.tick,gross=Math.round((exit-p.entry)*p.side*p.qty*asset.multiplier*100),fees=asset.margin?p.qty*400:200;net+=gross-fees;peak=Math.max(peak,net);drawdown=Math.max(drawdown,peak-net);trades.push({net_cents:gross-fees,reason});position=null;};
 for(let i=Math.max(21,start);i<end;i++){
  if(position){const movement=(bars[i].close-position.entry)*position.side;if(movement<=-position.stop)close(i,'Stop');else if(movement>=position.stop*1.6)close(i,'Target');else if(i-position.opened>=rule.hold||i===end-1)close(i,'Time exit');continue;}
  if(i===end-1)continue;const prior=bars.slice(i-rule.lookback,i),avg=sum(prior.map(b=>b.close))/prior.length,move=bars[i].close/avg-1;
  if(Math.abs(move)<rule.threshold)continue;
  const ranges=bars.slice(i-14,i),atr=sum(ranges.map(b=>b.high-b.low))/ranges.length,stop=Math.max(asset.tick*4,atr*rule.stop),qty=Math.floor((asset.multiplier>=20?1500:125)/(stop*asset.multiplier+asset.tick*asset.multiplier*2+(asset.margin?4:0)));
  if(qty<1)continue;const side=move>0?1:-1;position={entry:bars[i].close+side*asset.tick,side,qty:Math.min(qty,asset.margin?3:50),stop,opened:i};
 }
 return {net_cents:net,drawdown_cents:drawdown,trades:trades.length,wins:trades.filter(t=>t.net_cents>0).length,losses:trades.filter(t=>t.net_cents<0).length};
}
class TrainingLab{
 constructor(){this.round=0;this.teams=MARKETS.map(a=>({name:a.name,experiments:0,trades:0,wins:0,losses:0,candidate_net_cents:0,baseline_net_cents:0,drawdown_cents:0,baseline_drawdown_cents:0,verified_rounds:0,selected:'balanced',status:'Waiting for first drill',lesson:'No research sample yet',history:[]}));}
 step(){
  const round=this.round+1,market=new PracticeMarket(91000+round*7919),scenario=['Trend day','Sideways chop','Volatility shock'][(round-1)%3];
  // New seed and regime each round. Later candles are held out from strategy selection.
  for(let i=1;i<=120;i++)market.generateBars(i);
  for(const [index,team]of this.teams.entries()){
   const asset=market.assets[index],bars=asset.bars.map((b,i)=>{const adjustment=scenario==='Trend day'?1+i*.00008:scenario==='Sideways chop'?1+Math.sin(i/4)*.001:1+(i>80&&i<87?-.012:0);return {...b,open:b.open*adjustment,high:b.high*adjustment,low:b.low*adjustment,close:b.close*adjustment};});
   const training=variants.map(rule=>({rule,result:test(asset,bars,rule,21,75)})).sort((a,b)=>(b.result.net_cents-b.result.drawdown_cents*.3)-(a.result.net_cents-a.result.drawdown_cents*.3));
   const selected=training[0].rule,baseline=test(asset,bars,variants[0],75,120),candidate=test(asset,bars,selected,75,120);
   team.experiments++;team.trades+=candidate.trades;team.wins+=candidate.wins;team.losses+=candidate.losses;team.candidate_net_cents+=candidate.net_cents;team.baseline_net_cents+=baseline.net_cents;team.drawdown_cents+=candidate.drawdown_cents;team.baseline_drawdown_cents+=baseline.drawdown_cents;team.selected=selected.id;
   const better=candidate.trades>0&&candidate.net_cents>baseline.net_cents&&candidate.drawdown_cents<=baseline.drawdown_cents+1000;if(better)team.verified_rounds++;
   const enough=team.experiments>=6&&team.trades>=10,ready=enough&&team.verified_rounds>=3&&team.candidate_net_cents>team.baseline_net_cents&&team.candidate_net_cents>0&&team.drawdown_cents<=team.baseline_drawdown_cents*1.25+3000;
   team.status=ready?'Candidate for review':enough?'Keep baseline / more research':'Collecting evidence';
   team.lesson=candidate.trades===0?'Contract risk or signal filters blocked entries; tested the rules without forcing a trade.':better?selected.label+' beat baseline on this held-out scenario. Repeat across more regimes before approval.':candidate.net_cents<0?'Held-out losses: entry timing, stops and costs need more testing. Baseline stays protected.':'This candidate did not beat baseline after costs. Keep testing instead of raising risk.';
   team.history.unshift({round,scenario,rule:selected.label,candidate,baseline,better});team.history.length=Math.min(12,team.history.length);
  }this.round=round;return this.snapshot();
 }
 snapshot(){return {round:this.round,scenario:this.round?['Trend day','Sideways chop','Volatility shock'][(this.round-1)%3]:'First drill pending',source:'SYNTHETIC RESEARCH / HELD-OUT CANDLES',teams:JSON.parse(JSON.stringify(this.teams)),experiments:this.round*MARKETS.length};}
 export(){return {version:1,round:this.round,teams:this.teams};}
 restore(data){
  if(!data||data.version!==1||!Number.isSafeInteger(data.round)||data.round<0||data.round>100000||!Array.isArray(data.teams)||data.teams.length!==10)throw Error('Invalid research save');
  for(const [i,t]of data.teams.entries()){if(t.name!==MARKETS[i].name||!['experiments','trades','wins','losses','drawdown_cents','baseline_drawdown_cents','verified_rounds'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||!['candidate_net_cents','baseline_net_cents'].every(k=>Number.isSafeInteger(t[k]))||!variants.some(v=>v.id===t.selected)||!Array.isArray(t.history)||t.history.length>12)throw Error('Invalid research team');}
  this.round=data.round;this.teams=JSON.parse(JSON.stringify(data.teams));
 }
}
return {TrainingLab,variants,test};
});
