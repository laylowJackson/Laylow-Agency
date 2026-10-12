/* Deterministic bot research. Separate from execution, screenshots, and the account. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./wick-knowledge.js'):root.LaylowWickKnowledge);if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowStrategyResearch=api;})(typeof window!=='undefined'?window:this,function(wicks){
'use strict';
const VERSION=2,REGIMES=['Uptrend','Downtrend','Sideways range','Volatility shock','Gap and reversal','Quiet / costly market'];
const rules=Object.freeze([
 {id:'balanced',label:'Balanced trend / control',family:'baseline',lookback:8,threshold:.0004,hold:8,stop:1.5,rr:1.6},
 {id:'patient',label:'Patient confirmation',family:'baseline',lookback:14,threshold:.0008,hold:12,stop:1.8,rr:1.6},
 {id:'quick',label:'Quick momentum',family:'baseline',lookback:5,threshold:.0006,hold:5,stop:1.2,rr:1.6},
 {id:'selective',label:'Selective trend confirmation',family:'breakout',lookback:24,threshold:.0012,hold:10,stop:1.8,rr:1.6},
 {id:'wick_trend',label:'Wick-aware trend (experimental)',family:'wick',lookback:8,threshold:.0004,hold:8,stop:1.5,rr:1.6,wick_filter:true},
 {id:'pullback_v2',label:'Trend pullback + rejection',family:'pullback',lookback:24,hold:16,stop:1.5,rr:2},
 {id:'retest_v2',label:'Breakout retest + confirmation',family:'retest',lookback:24,hold:18,stop:1.5,rr:2},
 {id:'range_v2',label:'Range edge + rejection',family:'range',lookback:24,hold:12,stop:1.2,rr:1.8}
].map(Object.freeze));
const sum=a=>a.reduce((n,v)=>n+v,0),mean=a=>a.length?sum(a)/a.length:0;
function valid(b){return b&&b.closed!==false&&Number.isFinite(Date.parse(b.timestamp))&&['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close);}
function context(bars,i){const recent=bars.slice(i-24,i),p=bars[i-1],ranges=recent.slice(-14).map((b,j)=>Math.max(b.high-b.low,Math.abs(b.high-(recent[recent.length-15+j]?.close??b.open)),Math.abs(b.low-(recent[recent.length-15+j]?.close??b.open))));const atr=mean(ranges),closes=recent.map(b=>b.close),travel=sum(closes.slice(1).map((v,j)=>Math.abs(v-closes[j])));return {atr,efficiency:travel?Math.abs(closes.at(-1)-closes[0])/travel:0,fast:mean(closes.slice(-8)),slow:mean(closes),prior:p,high:Math.max(...recent.map(b=>b.high)),low:Math.min(...recent.map(b=>b.low))};}
function signal(asset,bars,i,rule){
 if(i<24||!valid(bars[i]))return null;const b=bars[i],c=context(bars,i),m=wicks.measure(b);if(!c.atr||!m.valid)return null;
 const move=b.close/mean(bars.slice(i-rule.lookback,i).map(v=>v.close))-1;let side=Math.sign(move),reason='Close displaced from earlier moving average',anchor=null;
 if(rule.family==='baseline'||rule.family==='wick'){if(Math.abs(move)<rule.threshold)return null;}
 else{
  // Guard rails are evaluated only using candles already completed at the signal.
  if(b.high-b.low>c.atr*2.8||Math.abs(b.open-c.prior.close)>c.atr*1.5)return null;
  if(rule.family==='breakout'){side=b.close>Math.max(...bars.slice(i-5,i).map(v=>v.high))?1:b.close<Math.min(...bars.slice(i-5,i).map(v=>v.low))?-1:0;if(!side||Math.abs(move)<rule.threshold||Math.sign(b.close-b.open)!==side)return null;reason='Prior five-candle boundary broken at close';}
  if(rule.family==='pullback'){
   if(c.efficiency<.24)return null;side=c.fast>c.slow?1:-1;
   if(side===1?!(b.low<=c.fast+c.atr*.2&&b.close>c.fast&&m.close_location>=.65&&m.lower_wick>=m.body*.5):!(b.high>=c.fast-c.atr*.2&&b.close<c.fast&&m.close_location<=.35&&m.upper_wick>=m.body*.5))return null;
   anchor=side===1?Math.min(...bars.slice(i-3,i+1).map(v=>v.low))-asset.tick:Math.max(...bars.slice(i-3,i+1).map(v=>v.high))+asset.tick;reason='Established trend, pullback and completed-candle rejection';
  }
  if(rule.family==='retest'){
   const boundary=bars.slice(i-15,i-3),breakBar=bars[i-3],high=Math.max(...boundary.map(v=>v.high)),low=Math.min(...boundary.map(v=>v.low));
   side=breakBar.close>high?1:breakBar.close<low?-1:0;const level=side===1?high:low;
   if(!side||c.efficiency<.18||(side===1?!(b.low<=level+c.atr*.25&&b.close>level&&b.close>b.open&&m.close_location>=.6):!(b.high>=level-c.atr*.25&&b.close<level&&b.close<b.open&&m.close_location<=.4)))return null;
   anchor=side===1?Math.min(...bars.slice(i-2,i+1).map(v=>v.low))-asset.tick:Math.max(...bars.slice(i-2,i+1).map(v=>v.high))+asset.tick;reason='Earlier breakout followed by retest and confirming close';
  }
  if(rule.family==='range'){
   if(c.efficiency>.22||c.high-c.low<c.atr*2)return null;
   side=b.low<=c.low+c.atr*.3&&m.close_location>=.65&&m.lower_wick>=m.body?1:b.high>=c.high-c.atr*.3&&m.close_location<=.35&&m.upper_wick>=m.body?-1:0;
   if(!side)return null;anchor=side===1?Math.min(c.low,b.low)-asset.tick:Math.max(c.high,b.high)+asset.tick;reason='Low-efficiency range, edge test and completed-candle rejection';
  }
 }
 if(!side)return null;if(rule.wick_filter&&(m.body/m.range<=.05||(side===1?!(m.close_location>=.6&&m.lower_wick>=m.body):!(m.close_location<=.4&&m.upper_wick>=m.body))))return {rejected:'Wick filter'};
 const distance=Math.max(asset.tick*4,c.atr*rule.stop,anchor===null?0:Math.abs(b.close-anchor));
 const stop=Number(((side===1?Math.floor:Math.ceil)((b.close-side*distance)/asset.tick+side*1e-8)*asset.tick).toFixed(8)),risk=Math.abs(b.close-stop),target=Number(((side===1?Math.ceil:Math.floor)((b.close+side*risk*rule.rr)/asset.tick-side*1e-8)*asset.tick).toFixed(8));
 return {side,stop,target,reason,regime:c.efficiency>.24?'trend':c.efficiency<.22?'range':'transition',atr:c.atr};
}
function empty(){return {wick_checked:0,wick_rejected:0,blocked:0,trade_records:[],gross_profit_cents:0,gross_loss_cents:0,net_cents:0,drawdown_cents:0,trades:0,wins:0,losses:0,breakeven:0,ambiguous_exits:0,fees_cents:0,expectancy_cents:null,profit_factor:null};}
function simulate(asset,bars,rule,start,end,options={}){
 const result=empty();end=Math.min(end,bars.length);const begin=Math.max(24,start),slip=asset.tick*(options.slippage_ticks??1),feeFactor=options.fee_multiplier??1,feeBase=options.roundtrip_fee??(asset.margin?4:2),gapLimit=options.max_gap_ms??Infinity,budget=asset.multiplier>=20?1500:125;
 // Validate only the interval and its earlier context. Never inspect later bars.
 if(!Number.isInteger(start)||start<0||!Number.isInteger(end)||end<start||!Number.isFinite(slip)||slip<0||!Number.isFinite(feeFactor)||feeFactor<1||!Number.isFinite(feeBase)||feeBase<0||!(gapLimit>0)||!Number.isFinite(asset.tick)||asset.tick<=0||!Number.isFinite(asset.multiplier)||asset.multiplier<=0||!bars.slice(Math.max(0,begin-24),end).every((b,j,a)=>valid(b)&&(!j||Date.parse(b.timestamp)>Date.parse(a[j-1].timestamp))))throw Error('Research requires ordered, completed standard OHLC bars and valid costs');
 let pos=null,pending=null,net=0,peak=0,dd=0,lastExit=-99;
 const fee=q=>Math.round((asset.margin?q*feeBase:feeBase)*feeFactor*100),mark=equity=>{peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);};
 function close(i,price,reason,ambiguous=false){const p=pos,exit=Number((price-p.side*slip).toFixed(8)),gross=Math.round((exit-p.entry)*p.side*p.qty*asset.multiplier*100),fees=fee(p.qty),pnl=gross-fees;net+=pnl;mark(net);result.trade_records.push({net_cents:pnl,gross_cents:gross,fees_cents:fees,reason,ambiguous,signal_index:p.signal,entry_index:p.opened,exit_index:i,entry_price:p.entry,exit_price:exit,side:p.side,qty:p.qty,stop_distance:Math.abs(p.entry-p.stop),stop_price:p.stop,target_price:p.target,risk_cents:p.risk_cents,result_r:p.risk_cents?pnl/p.risk_cents:null,setup_reason:p.reason,regime:p.regime,candle_review:p.candle_review});if(ambiguous)result.ambiguous_exits++;pos=null;lastExit=i;}
 for(let i=begin;i<end;i++){
  const b=bars[i];
  if(pending){const p=pending;pending=null;const entry=Number((b.open+p.side*slip).toFixed(8)),distance=(entry-p.stop)*p.side,reward=(p.target-entry)*p.side;
   if(distance<=0||reward<=0||(rule.family!=='baseline'&&reward/distance<1.2)){result.blocked++;}else{const available=budget-(asset.margin?0:feeBase*feeFactor),qty=Math.min(asset.margin?3:50,Math.floor(available/(distance*asset.multiplier+slip*asset.multiplier+(asset.margin?feeBase*feeFactor:0))));if(qty<1)result.blocked++;else pos={...p,entry,qty,opened:i,risk_cents:Math.round(distance*qty*asset.multiplier*100)+fee(qty)+Math.round(slip*qty*asset.multiplier*100)};}
  }
  if(pos){const p=pos,stopHit=p.side===1?b.low<=p.stop:b.high>=p.stop,targetHit=p.side===1?b.high>=p.target:b.low<=p.target;
   // A gap through the stop fills at the worse open. A target limit never gets a better-than-limit assumed fill.
   const stopFill=p.side===1?Math.min(b.open,p.stop):Math.max(b.open,p.stop);
   const adverse=p.side===1?Math.max(b.low,Math.min(p.stop,b.open)):Math.min(b.high,Math.max(p.stop,b.open));mark(net+Math.round((adverse-p.entry)*p.side*p.qty*asset.multiplier*100)-fee(p.qty));
   if(stopHit)close(i,stopFill,targetHit?'Ambiguous bar / stop first':'Stop',targetHit);
   else if(targetHit)close(i,p.target,'Target');
   else if(i-p.opened>=rule.hold||i===end-1)close(i,b.close,i===end-1?'Segment close':'Time exit');
   else mark(net+Math.round((b.close-p.entry)*p.side*p.qty*asset.multiplier*100)-fee(p.qty));
  }
  // Imported research uses declared timestamp gaps as dataset boundaries, not a verified exchange calendar.
  // Flatten at the preceding close; no OHLC from the next segment is read for this decision.
  if(i+1<end&&Date.parse(bars[i+1].timestamp)-Date.parse(b.timestamp)>gapLimit){if(pos)close(i,b.close,'Data gap boundary');pending=null;continue;}
  if(pos||i>=end-2||i-lastExit<2)continue;
  if(Number.isFinite(gapLimit)&&bars.slice(i-24,i+1).some((v,j,a)=>j&&Date.parse(v.timestamp)-Date.parse(a[j-1].timestamp)>gapLimit))continue;
  const proposal=signal(asset,bars,i,rule);if(!proposal)continue;if(rule.wick_filter)result.wick_checked++;if(proposal.rejected){result.wick_rejected++;continue;}
  const candle_review=options.imported_ohlc?{metrics:wicks.measure(b),candle_time:b.timestamp,provenance:'user_imported_ohlc',entry_evidence:true,summary:'User-declared completed standard OHLC. Wick geometry is measured; provider and chart type remain unverified.'}:wicks.reviewCandles(bars.slice(0,i+1),{chart_type:'standard',basis:'synthetic_ohlc',as_of:b.timestamp});pending={...proposal,signal:i,candle_review};
 }
 const trades=result.trade_records;Object.assign(result,{net_cents:net,drawdown_cents:Math.round(dd),trades:trades.length,wins:trades.filter(t=>t.net_cents>0).length,losses:trades.filter(t=>t.net_cents<0).length,breakeven:trades.filter(t=>t.net_cents===0).length,gross_profit_cents:sum(trades.filter(t=>t.net_cents>0).map(t=>t.net_cents)),gross_loss_cents:-sum(trades.filter(t=>t.net_cents<0).map(t=>t.net_cents)),fees_cents:sum(trades.map(t=>t.fees_cents))});result.expectancy_cents=trades.length?net/trades.length:null;result.profit_factor=result.gross_loss_cents?result.gross_profit_cents/result.gross_loss_cents:null;return result;
}
function generate(asset,seed,regime,count=288){
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},normal=()=>sum(Array.from({length:12},random))-6,round=p=>Math.max(asset.tick,Math.round(p/asset.tick)*asset.tick);let last=asset.price;const bars=[];
 for(let i=0;i<count;i++){
  let drift=regime==='Uptrend'?.00023:regime==='Downtrend'?-.00023:regime==='Sideways range'?(asset.price-last)/asset.price*.14:regime==='Gap and reversal'?(i<count/2?.00027:-.00045):0;
  const volatility=regime==='Quiet / costly market'?.000035:regime==='Volatility shock'&&i%70>48?.0018:.00038;
  const gap=regime==='Gap and reversal'&&i%79===0&&i?normal()*.003:0,open=round(last*(1+gap)),close=round(open*(1+drift+normal()*volatility));
  const high=round(Math.max(open,close)+asset.price*volatility*(.15+random()*1.1)),low=round(Math.min(open,close)-asset.price*volatility*(.15+random()*1.1));
  bars.push({timestamp:new Date(Date.UTC(2020,0,1)+i*60000).toISOString(),open,high:Math.max(high,open,close),low:Math.min(low,open,close),close,closed:true});last=close;
 }return bars;
}
function select(asset,bars,options={}){
 // Fixed small recipe set; validation ranking never sees the final 96 candles.
 const trainEnd=options.train_end??128,testStart=options.test_start??192,costs=options.costs??{};
 if(!Number.isInteger(trainEnd)||!Number.isInteger(testStart)||trainEnd<48||testStart<=trainEnd||testStart>bars.length)throw Error('Invalid chronological research split');
 const scores=rules.map(rule=>({rule,train:simulate(asset,bars,rule,24,trainEnd,costs),validation:simulate(asset,bars,rule,trainEnd,testStart,costs)}));
 const control=scores[0].validation;
 const eligible=scores.filter(s=>s.rule.id!=='balanced'&&s.train.trades>=3&&s.train.net_cents>0&&s.validation.trades>=2&&s.validation.net_cents>Math.max(0,control.net_cents)&&s.validation.drawdown_cents<=Math.max(12500,s.train.drawdown_cents*1.5));
 eligible.sort((a,b)=>(b.validation.net_cents-b.validation.drawdown_cents*.5)-(a.validation.net_cents-a.validation.drawdown_cents*.5));
 return {rule:eligible[0]?.rule||rules[0],scores,decision:eligible.length?'Earlier selection + validation qualified a candidate':'No candidate qualified; retain the control strategy',train_end:trainEnd,test_start:testStart};
}
function lessons(result){const rows=result.trade_records,losers=rows.filter(t=>t.net_cents<0),winners=rows.filter(t=>t.net_cents>0);return [
 {label:'Stops / gaps',count:losers.filter(t=>t.reason.includes('Stop')||t.reason.includes('stop')).length,action:'Research entry location and stop geometry; do not widen account risk automatically.'},
 {label:'Time exits / weak follow-through',count:losers.filter(t=>t.reason==='Time exit'||t.reason==='Segment close').length,action:'Compare regime filters and entry timing in the next independent sample.'},
 {label:'Costs reversed a gross win',count:rows.filter(t=>t.gross_cents>=0&&t.net_cents<0).length,action:'Reject setups whose expected move is too small relative to execution costs.'},
 {label:'Targets after costs',count:winners.filter(t=>t.reason==='Target').length,action:'Repeat the same rule unchanged across other regimes before keeping it.'},
 {label:'Intrabar order unknown',count:result.ambiguous_exits,action:'Stop-first is a conservative assumption. Tick data would be needed to resolve the sequence.'}
 ];}
return {VERSION,REGIMES,rules,simulate,signal,generate,select,lessons,valid};
});
