/* Synthetic market sandbox. No network, broker, credentials or real orders. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./wick-knowledge.js'):root.LaylowWickKnowledge);if(typeof module==="object"&&module.exports)module.exports=api;else root.LaylowPracticeEngine=api;})(typeof window!=="undefined"?window:this,function(wicks){
"use strict";
const START=5000000,VERSION=1;
const MARKETS=[
 {name:"SPY",price:500,tick:.01,multiplier:1,margin:0,bots:["Trend","VWAP","Momentum"],required:2},
 {name:"QQQ",price:440,tick:.01,multiplier:1,margin:0,bots:["Trend","VWAP","Momentum"],required:2},
 {name:"AAPL",price:190,tick:.01,multiplier:1,margin:0,bots:["Trend","VWAP","Momentum","Volume Confirmation"],required:2},
 {name:"TSLA",price:240,tick:.01,multiplier:1,margin:0,bots:["Breakout","Momentum","Volume-Volatility","Trend"],required:3},
 {name:"NQ1!",price:18000,tick:.25,multiplier:20,margin:500000,bots:["Trend","Momentum","Breakout"],required:2},
 {name:"ES1!",price:5000,tick:.25,multiplier:50,margin:500000,bots:["Trend","VWAP","Momentum"],required:2},
 {name:"MGC1!",price:2400,tick:.1,multiplier:10,margin:50000,bots:["Trend","Breakout","Mean Reversion"],required:2},
 {name:"MNQ1!",price:18000,tick:.25,multiplier:2,margin:50000,bots:["Trend","Momentum","Breakout"],required:2},
 {name:"MES1!",price:5000,tick:.25,multiplier:5,margin:50000,bots:["Trend","VWAP","Momentum"],required:2},
 {name:"GC1!",price:2400,tick:.1,multiplier:100,margin:500000,bots:["Trend","Breakout","Mean Reversion"],required:2}
];
const MEMBERS=[
 {id:"anchor",name:"Anchor",personality:"Patient capital protector",risk:"Conservative",color:"#74c8ff"},
 {id:"proof",name:"Proof",personality:"Evidence first; wants broad agreement",risk:"Measured",color:"#ad94ff"},
 {id:"flux",name:"Flux",personality:"Momentum seeker; tolerates disagreement",risk:"Assertive",color:"#ff7cb0"},
 {id:"rebel",name:"Rebel",personality:"Contrarian; challenges crowded entries",risk:"Skeptical",color:"#ffb86c"},
 {id:"steward",name:"Steward",personality:"Volatility and position-budget steward",risk:"Defensive",color:"#70e1bd"},
 {id:"sentinel",name:"Sentinel",personality:"Execution auditor; rules before enthusiasm",risk:"Strict",color:"#ffe58f"}
];
const sum=values=>values.reduce((a,b)=>a+b,0),mean=values=>sum(values)/values.length;
const cents=value=>Math.round(value*100),sign=direction=>direction==="LONG"?1:-1;
class PracticeMarket {
 constructor(seed=73017){this.reset(seed);}
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 normal(){return sum(Array.from({length:12},()=>this.random()))-6;}
 round(price,def){return Math.max(def.tick,Math.round(price/def.tick)*def.tick);}
 reset(seed=73017){
  this.seed=seed>>>0;this.minute=0;this.baseTime=Date.now();this.positions=[];this.trades=[];this.events=[];this.decisions=[];this.reviews=[];this.history=[];this.cooldowns={};this.peak=START;this.maxDrawdown=0;this.riskLocked=false;this.serial=0;
  this.assets=MARKETS.map(def=>({...def,bars:[]}));
  for(let i=-79;i<=0;i++)this.generateBars(i);
  this.evaluate();this.log("System","SESSION_START","Practice account opened with $50,000 fake dollars. All prices are generated.");
 }
 generateBars(minute){
  const shared={};
  for(const asset of this.assets){
   const group=asset.name==="MES1!"?"ES1!":asset.name==="MNQ1!"?"NQ1!":asset.name==="GC1!"?"MGC1!":asset.name;
   const previous=asset.bars.at(-1)?.close||asset.price;
   const drift=Math.sin((minute+80)/19+MARKETS.findIndex(m=>m.name===group))*.00035;
   const close=shared[group]??this.round(previous*Math.exp(this.normal()*(asset.margin?.00065:.0014)+drift),asset);shared[group]=close;
   const wiggle=Math.abs(this.normal())*previous*.0005;
   const bar={timestamp:new Date(this.baseTime+minute*60000).toISOString(),open:previous,high:this.round(Math.max(previous,close)+wiggle,asset),low:this.round(Math.min(previous,close)-wiggle,asset),close,volume:Math.round(800+this.random()*2400)};
   asset.bars.push(bar);if(asset.bars.length>120)asset.bars.shift();
  }
 }
 asset(name){const asset=this.assets.find(a=>a.name===name);if(!asset)throw Error("Unknown practice market");return asset;}
 get balance(){return START+sum(this.trades.map(t=>t.net_cents))-sum(this.positions.map(p=>p.entry_fee_cents));}
 unrealized(position){const asset=this.asset(position.team_name);return cents((asset.bars.at(-1).close-position.entry_price)*sign(position.direction)*position.qty*asset.multiplier);}
 get account(){
  const unrealized=sum(this.positions.map(p=>this.unrealized(p))),reserved=sum(this.positions.map(p=>p.reserve_cents));
  return {initial_cents:START,balance_cents:this.balance,equity_cents:this.balance+unrealized,available_cents:this.balance-reserved,reserved_cents:reserved,realized_cents:sum(this.trades.map(t=>t.net_cents)),unrealized_cents:unrealized,fees_cents:sum(this.trades.map(t=>t.fees_cents))+sum(this.positions.map(p=>p.entry_fee_cents)),max_drawdown_cents:this.maxDrawdown};
 }
 log(team,event,details){this.events.unshift({created_at:new Date().toISOString(),team_name:team,event_type:"SIM · "+event,details});this.events.length=Math.min(this.events.length,60);}
 metrics(asset){
  const bars=asset.bars,close=bars.at(-1).close,values=bars.map(b=>b.close),recent=bars.slice(-14);
  const atr=mean(recent.map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-(bars[bars.length-15+i]?.close||b.open)),Math.abs(b.low-(bars[bars.length-15+i]?.close||b.open)))));
  const vwap=sum(bars.slice(-30).map(b=>b.close*b.volume))/sum(bars.slice(-30).map(b=>b.volume));
  return {price:close,atr,vwap,momentum:close/values.at(-6)-1,trend:mean(values.slice(-8))/mean(values.slice(-21))-1,relative_volume:bars.at(-1).volume/mean(bars.slice(-21,-1).map(b=>b.volume))};
 }
 analyze(asset){
  const m=this.metrics(asset),direction=value=>value>.00015?"LONG":value<-.00015?"SHORT":"WAIT";
  const candle_review=wicks.reviewCandles(asset.bars,{chart_type:'standard',basis:'synthetic_ohlc',as_of:asset.bars.at(-1).timestamp});
  const votes=asset.bots.map(name=>{let value=m.momentum;
   if(name==="Trend")value=m.trend;if(name==="VWAP")value=m.price/m.vwap-1;if(name==="Mean Reversion")value=1-m.price/m.vwap;
   if(name==="Breakout"){const prior=asset.bars.slice(-16,-1);value=m.price>Math.max(...prior.map(b=>b.high))?.001:m.price<Math.min(...prior.map(b=>b.low))?-.001:0;}
   if(["Volume Confirmation","Volume-Volatility"].includes(name)&&m.relative_volume<.8)value=0;
   return {name,candle_review,direction:direction(value),reason:"Synthetic "+name+" check · "+(value*100).toFixed(3)+"% · generated candles"};
  });
  const longs=votes.filter(v=>v.direction==="LONG").length,shorts=votes.filter(v=>v.direction==="SHORT").length,agreement=Math.max(longs,shorts),side=agreement>=asset.required?(longs>shorts?"LONG":"SHORT"):"WAIT";
  return {state:"READY",candle_review,direction:side,agreement,votes,indicators:{atr:Number(m.atr.toFixed(3)),relative_volume:Number(m.relative_volume.toFixed(2)),vwap:Number(m.vwap.toFixed(3))},reason:"Practice indicators from synthetic candles",source:"SYNTHETIC PRACTICE FEED",...m};
 }
 sizing(asset,analysis){
  const stop=Math.max(asset.tick*4,analysis.atr*1.8),fee=asset.margin?200:100;
  const maxByRisk=Math.floor(this.learningStats(asset.name).planned_risk_cents/(cents(stop*asset.multiplier)+fee*2));
  const qty=asset.margin?Math.min(1,maxByRisk):Math.min(maxByRisk,Math.floor(5000/analysis.price));
  const entry=analysis.price+sign(analysis.direction)*asset.tick;
  const reserve=asset.margin?asset.margin*qty:cents(entry*qty);
  return {qty,stop,entry,reserve,fee:fee*(asset.margin?qty:1)};
 }
 teamNet(name){return sum(this.trades.filter(t=>t.team_name===name).map(t=>t.net_cents));}
 learningStats(name){
  const trades=this.trades.filter(t=>t.team_name===name),recent=trades.slice(-12),wins=recent.filter(t=>t.net_cents>0).length,losses=recent.filter(t=>t.net_cents<0).length,rate=wins+losses?wins/(wins+losses):null;
  const enough=wins+losses>=5,risk_factor=enough&&rate<.4?.65:enough&&rate<.5?.85:1,extra_agreement=enough&&rate<.4?1:0;
  return {team_name:name,reviewed:trades.length,wins:trades.filter(t=>t.net_cents>0).length,losses:trades.filter(t=>t.net_cents<0).length,sample_size:recent.length,risk_factor,extra_agreement,planned_risk_cents:Math.floor(25000*risk_factor),summary:!enough?"Collecting five decisive outcomes before changing entry rules":extra_agreement?"Recent losses: risk reduced to 65%; require one more specialist vote":risk_factor<1?"Mixed recent results: practice risk reduced to 85%":"Recent wins support retaining the baseline rules; risk stays capped"};
 }
 reviewTrade(t){
  const result=t.net_cents>0?"WIN":t.net_cents<0?"LOSS":"FLAT",move=(t.exit_price-t.entry_price)*sign(t.direction),context=t.entry_context||{};
  let observed=move<0?"Price moved against the "+t.direction.toLowerCase()+" entry by "+Math.abs(move).toFixed(2)+" price units":move>0?"Price moved in the entry direction by "+move.toFixed(2)+" price units":"Entry and exit prices were equal";
  observed+=". Gross $"+(t.gross_cents/100).toFixed(2)+" minus $"+(t.fees_cents/100).toFixed(2)+" simulated fees produced $"+(t.net_cents/100).toFixed(2)+" net. Exit: "+t.reason+".";
  const lesson=result==="WIN"?"Keep the winning setup in the review sample. A single win does not justify increasing risk.":t.gross_cents>=0&&t.net_cents<0?"The favorable move did not cover costs. Count fees and slippage when assessing small edges.":String(t.reason).includes("Stop")?"The entry direction failed before the target. Review agreement and volatility; retain the stop.":String(t.reason).includes("time exit")?"The setup did not reach its target within the holding window. Review timing and signal agreement.":"Review entry direction, timing and exposure. Preserve account brakes; do not chase the loss.";
  return {trade_id:t.id,candle_review:context.candle_review||null,team_name:t.team_name,result,net_cents:t.net_cents,closed_at:t.closed_at,exit_rule:t.reason,observed,lesson,evidence:Number.isFinite(context.agreement)?context.agreement+"/"+context.specialist_count+" specialist agreement at entry · ATR "+Number(context.atr||0).toFixed(3):"Entry indicators were not recorded for this older trade",basis:"Observed price path and costs; this is not a proven causal explanation."};
 }
 council(asset,analysis){
  const sizing=this.sizing(asset,analysis),budget=sizing.qty>0&&sizing.reserve+sizing.fee<=this.account.available_cents;
  const locked=this.riskLocked||this.positions.length>=4||this.teamNet(asset.name)>=30000||!budget;
  const learning=this.learningStats(asset.name),signal=analysis.direction!=="WAIT",aligned=sign(analysis.direction)*analysis.momentum>0,required=Math.min(asset.bots.length,asset.required+learning.extra_agreement);
  const choices=[
   [signal&&analysis.agreement===asset.bots.length,"I want unanimous specialists before risking capital."],
   [signal&&analysis.agreement>=required,"I require "+required+" specialist votes. "+learning.summary+"."],
   [signal&&aligned,"I favor momentum aligned with the proposal."],
   [signal&&!aligned,"I prefer a pullback; I question a crowded momentum trade."],
   [signal&&!locked&&analysis.atr/analysis.price<.01,"I cap planned practice risk at $"+(learning.planned_risk_cents/100).toFixed(2)+". "+learning.summary+"."],
   [signal&&!locked,"I enforce four positions, the loss brake and available cash."]
  ];
  const members=MEMBERS.map((m,i)=>({...m,vote:i===5&&locked?"VETO":choices[i][0]?"SUPPORT":"WAIT",reason:choices[i][1]}));
  const favorable=members.filter(m=>m.vote==="SUPPORT").length,approved=signal&&analysis.agreement>=required&&favorable>=4&&!members.some(m=>m.vote==="VETO");
  const reason=this.riskLocked?"Account loss brake reached":this.teamNet(asset.name)>=30000?"$300 simulated team profit brake reached":this.positions.length>=4?"Four open positions already":!budget?"Insufficient practice collateral or risk budget":signal&&analysis.agreement<required?"Learning filter requires "+required+" specialist votes":approved?"Four of six support; practice risk checks pass":"Waiting for four of six opinions and a directional signal";
  return {team_name:asset.name,candle_review:analysis.candle_review,action:approved?"ENTER":"SKIP",direction:analysis.direction,favorable_votes:favorable,members,reason,watch_only:false,proposal_id:"practice-"+this.minute+"-"+asset.name,analysis_time:asset.bars.at(-1).timestamp,generated_at:new Date().toISOString(),sizing};
 }
 evaluate(){this.reviews=this.assets.map(asset=>{asset.analysis=this.analyze(asset);return this.council(asset,asset.analysis);});}
 open(asset,review){
  if(review.action!=="ENTER"||this.positions.some(p=>p.team_name===asset.name))return false;
  // Recheck the shared account after any previous team consumes its budget.
  const fresh=this.council(asset,asset.analysis);if(fresh.action!=="ENTER")return false;
  const s=fresh.sizing;this.positions.push({id:++this.serial,team_name:asset.name,direction:fresh.direction,qty:s.qty,entry_price:s.entry,entry_fee_cents:s.fee,reserve_cents:s.reserve,stop_distance:s.stop,opened_minute:this.minute,opened_at:new Date(this.baseTime+this.minute*60000).toISOString(),entry_context:{candle_review:structuredClone(asset.analysis.candle_review),agreement:asset.analysis.agreement,specialist_count:asset.bots.length,atr:asset.analysis.atr,momentum:asset.analysis.momentum,relative_volume:asset.analysis.relative_volume},entry_learning:this.learningStats(asset.name)});
  this.history.unshift({...fresh});this.history.length=Math.min(100,this.history.length);
  this.decisions.unshift({created_at:new Date().toISOString(),team_name:asset.name,direction:fresh.direction,action:"SIMULATED ENTRY",reason:fresh.reason});this.decisions.length=Math.min(50,this.decisions.length);
  this.log(asset.name,"ENTRY",fresh.direction+" · "+s.qty+" "+(asset.margin?"fake contract":"fake shares")+" at "+s.entry.toFixed(2)+". No broker order.");return true;
 }
 close(id,reason="Manual practice close"){
  const index=this.positions.findIndex(p=>p.id===id);if(index<0)return false;
  const p=this.positions[index],asset=this.asset(p.team_name),exit=this.round(Math.max(asset.tick,asset.bars.at(-1).close-sign(p.direction)*asset.tick),asset),exitFee=asset.margin?200*p.qty:100;
  const gross=cents((exit-p.entry_price)*sign(p.direction)*p.qty*asset.multiplier),fees=p.entry_fee_cents+exitFee;
  this.trades.push({...p,exit_price:exit,gross_cents:gross,fees_cents:fees,net_cents:gross-fees,closed_at:new Date(this.baseTime+this.minute*60000).toISOString(),reason,source:"SIMULATED FILL · 1 tick slippage per side"});
  this.positions.splice(index,1);this.cooldowns[asset.name]=this.minute+(gross-fees<0?5:3);this.log(asset.name,"CLOSE",reason+" · net "+((gross-fees)/100).toFixed(2)+" fake USD after fees");this.log(asset.name,"TRADE_REVIEW",this.reviewTrade(this.trades.at(-1)).lesson+" "+this.learningStats(asset.name).summary);return true;
 }
 step(){
  if(this.minute>=3000||this.riskLocked)return false;
  this.minute++;this.generateBars(this.minute);
  for(const p of [...this.positions]){const movement=(this.asset(p.team_name).bars.at(-1).close-p.entry_price)*sign(p.direction);
   if(movement<=-p.stop_distance)this.close(p.id,"Stop at generated candle close");
   else if(movement>=p.stop_distance*1.6)this.close(p.id,"Profit target at generated candle close");
   else if(this.minute-p.opened_minute>=12)this.close(p.id,"12-minute practice time exit");
  }
  if(this.account.equity_cents<=START-100000){for(const p of [...this.positions])this.close(p.id,"$1,000 account loss brake");this.riskLocked=true;this.log("System","LOSS_BRAKE","Practice entries stopped. Reset to start a new account.");}
  this.evaluate();
  if(!this.riskLocked)for(const asset of this.assets){if((this.cooldowns[asset.name]||0)>this.minute)continue;this.open(asset,this.reviews.find(r=>r.team_name===asset.name));}
  this.evaluate();const equity=this.account.equity_cents;this.peak=Math.max(this.peak,equity);this.maxDrawdown=Math.max(this.maxDrawdown,this.peak-equity);
  return true;
 }
 snapshot(){
  const now=new Date().toISOString(),account=this.account,workers=this.assets.map(a=>{const trades=this.trades.filter(t=>t.team_name===a.name);return {team_name:a.name,closed_trades:trades.length,wins:trades.filter(t=>t.net_cents>0).length,losses:trades.filter(t=>t.net_cents<0).length,net_cents:sum(trades.map(t=>t.net_cents))};});
  const managers=this.assets.map(a=>({team_name:a.name,candle_review:a.analysis.candle_review,severity:"INFO",generated_at:now,summary:this.positions.some(p=>p.team_name===a.name)?"Monitoring simulated position and exit rules":this.reviews.find(r=>r.team_name===a.name).reason}));
  return {practice:true,public_viewer:true,mode:"practice",database_available:false,generated_at:now,account,learning:this.assets.map(a=>this.learningStats(a.name)),trade_reviews:this.trades.slice(-60).reverse().map(t=>this.reviewTrade(t)),market_feed:{status:"SIMULATED",live:false,source:"Generated candles",reason:"Live market data is not connected. Add a broker/data feed when ready."},teams:this.assets.map(a=>({name:a.name,enabled:true,worker_state:this.riskLocked?"PAUSED":this.teamNet(a.name)>=30000?"PROFIT_BRAKE_HIT":"RUNNING",health:"fresh",heartbeat:now,heartbeat_age_seconds:0,notes:"Browser simulation · generated prices and fake fills only",controls:{enabled:false,entry_locked:true,lock_reason:"Real execution unavailable; sandbox only",profit_brake:{status:this.teamNet(a.name)>=30000?"PROFIT_BRAKE_HIT":"ARMED",limit_cents:30000}},analysis:{...a.analysis,updated_at:now,bar_time:now,bars:a.bars},execution_health:{order_count:0,pending_or_uncertain:0}})),processes:[],events:this.events,managers,big_manager:{severity:this.riskLocked?"CRITICAL":"INFO",generated_at:now,summary:"Practice supervisor: "+this.positions.length+"/4 positions · $250 planned risk per entry · $1,000 account loss brake",ai_status:"disabled"},recent_orders:[],recent_decisions:this.decisions,summary:{total_teams:10,enabled_teams:10,fresh_workers:10,running_processes:0},payroll:{available:true,fresh:true,day:"Practice session",timezone:"Simulated clock",basis:"Fake realized P&L, excluding open positions; entry and exit fees included",sources:[{source:"SYNTHETIC PRACTICE LEDGER",as_of:now}],total_net_cents:account.realized_cents,all_time_net_cents:account.realized_cents,workers,daily:[{day:"Practice",net_cents:account.realized_cents}],recent:this.trades.slice(-30).reverse()},council:{members:MEMBERS,reviews:this.reviews,history:this.history}};
 }
 export(){return {version:VERSION,seed:this.seed,minute:this.minute,baseTime:this.baseTime,assets:this.assets.map(a=>({name:a.name,bars:a.bars})),positions:this.positions,trades:this.trades,events:this.events,decisions:this.decisions,history:this.history,cooldowns:this.cooldowns,peak:this.peak,maxDrawdown:this.maxDrawdown,riskLocked:this.riskLocked,serial:this.serial};}
 restore(data){
  // Rebuild definitions locally; never import code, strategy rules or broker credentials.
  if(!data||data.version!==VERSION||!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295||!Number.isInteger(data.minute)||data.minute<0||data.minute>3000||!Number.isFinite(data.baseTime)||!Array.isArray(data.assets)||data.assets.length!==10||!Array.isArray(data.positions)||data.positions.length>4||!Array.isArray(data.trades)||data.trades.length>3000)throw Error("Invalid practice save");
  const price=value=>Number.isFinite(value)&&value>0,integer=value=>Number.isSafeInteger(value)&&value>=0;
  for(const def of MARKETS){const a=data.assets.find(a=>a.name===def.name);if(!a||!Array.isArray(a.bars)||a.bars.length<21||a.bars.length>120||a.bars.some(b=>![b.open,b.high,b.low,b.close].every(price)||!price(b.volume)||!Number.isFinite(Date.parse(b.timestamp))))throw Error("Invalid practice candles");}
  const ids=new Set(),names=new Set();for(const p of data.positions){if(!MARKETS.some(a=>a.name===p.team_name)||!integer(p.id)||ids.has(p.id)||names.has(p.team_name)||!integer(p.qty)||p.qty<1||!["LONG","SHORT"].includes(p.direction)||!price(p.entry_price)||!price(p.stop_distance)||!integer(p.entry_fee_cents)||!integer(p.reserve_cents)||!integer(p.opened_minute)||p.opened_minute>data.minute)throw Error("Invalid saved position");ids.add(p.id);names.add(p.team_name);}
  for(const t of data.trades){const def=MARKETS.find(a=>a.name===t.team_name);if(!def||!integer(t.qty)||t.qty<1||!["LONG","SHORT"].includes(t.direction)||!price(t.entry_price)||!price(t.exit_price)||!integer(t.fees_cents)||!Number.isSafeInteger(t.gross_cents)||t.gross_cents!==cents((t.exit_price-t.entry_price)*sign(t.direction)*t.qty*def.multiplier)||t.net_cents!==t.gross_cents-t.fees_cents)throw Error("Invalid saved trade ledger");}
  if(!integer(data.serial)||!integer(data.peak)||data.peak<START||!integer(data.maxDrawdown)||!data.cooldowns||typeof data.cooldowns!=="object"||Object.values(data.cooldowns).some(v=>!integer(v)))throw Error("Invalid practice account");
  this.seed=data.seed;this.minute=data.minute;this.baseTime=data.baseTime;this.assets=MARKETS.map(def=>({...def,bars:data.assets.find(a=>a.name===def.name).bars}));this.positions=data.positions;this.trades=data.trades;this.cooldowns=data.cooldowns;this.peak=data.peak;this.maxDrawdown=data.maxDrawdown;this.riskLocked=data.riskLocked===true;this.serial=data.serial;
  for(const key of["events","decisions","history"])this[key]=Array.isArray(data[key])?data[key].slice(0,60):[];
  if(this.account.available_cents<0||!Number.isSafeInteger(this.account.equity_cents))throw Error("Invalid saved collateral");this.evaluate();
 }
}
return {PracticeMarket,MARKETS,MEMBERS,START};
});
