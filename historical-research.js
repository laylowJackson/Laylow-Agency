/* Local, user-supplied OHLC evaluation. Imports never become verified provider data or promotion evidence. */
(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./strategy-research.js'):root.LaylowStrategyResearch,node?require('./practice-engine.js'):root.LaylowPracticeEngine,node?require('./research-evidence.js'):root.LaylowResearchEvidence,node?require('./exit-research.js'):root.LaylowExitResearch);if(node)module.exports=api;else root.LaylowHistoricalResearch=api;})(typeof self!=='undefined'?self:this,function(research,practice,evidence,exits){
'use strict';
const VERSION=1,MAX_BYTES=2*1024*1024,MAX_BARS=5000,DURATIONS={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000};
function csv(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('CSV must be at most 2 MB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
 const push=()=>{row.push(cell.trim());cell='';afterQuote=false;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell.trim()||afterQuote)throw Error('Malformed CSV quote.');quoted=true;continue;}
  if(c===','){push();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();if(row.some(Boolean))rows.push(row);row=[];if(rows.length>MAX_BARS+1)throw Error('Use no more than 5,000 candle rows.');continue;}
  if(afterQuote&&!/\s/.test(c))throw Error('Unexpected text after a CSV quote.');
  cell+=c;
 }
 if(quoted)throw Error('Unclosed CSV quote.');push();if(row.some(Boolean))rows.push(row);
 if(rows.length>MAX_BARS+1)throw Error('Use no more than 5,000 candle rows.');return rows;
}
function timestamp(value){
 let ms;
 if(/^\d{10}$/.test(value))ms=Number(value)*1000;
 else if(/^\d{13}$/.test(value))ms=Number(value);
 else{
  const match=/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match)throw Error('Timestamps need ISO 8601 with Z/UTC offset, or Unix seconds/milliseconds.');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw Error('Invalid calendar date.');
  ms=Date.parse(value);
 }
 if(!Number.isFinite(ms)||ms<Date.UTC(1970,0,1))throw Error('Invalid candle timestamp.');return ms;
}
function numeric(value,name,row){
 if(typeof value!=='string'||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value))throw Error('Row '+row+': '+name+' must be a plain number.');
 const n=Number(value);if(!Number.isFinite(n))throw Error('Row '+row+': invalid '+name+'.');return n;
}
function parse(text,meta,now=Date.now()){
 const base=practice.MARKETS.find(a=>a.name===meta?.symbol),duration=DURATIONS[meta?.timeframe];
 if(!base||!duration)throw Error('Choose a supported team and candle timeframe.');
 if(meta.standard!==true||meta.completed!==true)throw Error('Confirm standard OHLC and completed candles.');
 if(typeof meta.source!=='string'||!meta.source.trim()||meta.source.trim().length>180)throw Error('Enter a source / export identifier (up to 180 characters).');
 if(!Number.isFinite(now))throw Error('Invalid evaluation clock.');
 const rows=csv(text),headers=rows.shift()?.map(s=>s.toLowerCase());
 if(!headers||headers.length!==new Set(headers).size)throw Error('CSV requires unique column headers.');
 const timeNames=['timestamp','time','datetime'].filter(h=>headers.includes(h));
 if(timeNames.length!==1||!['open','high','low','close'].every(h=>headers.includes(h)))throw Error('Required headers: timestamp (or time/datetime), open, high, low, close.');
 if(rows.length<288)throw Error('At least 288 completed candles are required. A small file still cannot establish an edge.');
 const at=Object.fromEntries(headers.map((h,i)=>[h,i])),bars=[];let last=-Infinity,gaps=0;
 for(const [i,r]of rows.entries()){
  if(r.length!==headers.length)throw Error('Row '+(i+2)+': column count does not match the header.');
  for(const column of ['symbol','instrument'])if(at[column]!==undefined&&r[at[column]].toUpperCase().split(':').at(-1)!==base.name)throw Error('Row '+(i+2)+': instrument column conflicts with the chosen team.');
  if(at.timeframe!==undefined&&r[at.timeframe]!==meta.timeframe)throw Error('Row '+(i+2)+': timeframe column conflicts with the chosen timeframe.');
  const ms=timestamp(r[at[timeNames[0]]]);if(ms<=last)throw Error('Row '+(i+2)+': timestamps must increase; duplicates and reversed rows are rejected.');
  if(ms+duration>now)throw Error('Row '+(i+2)+': candle is unfinished or in the future.');
  if(last!==-Infinity){const delta=ms-last;if(delta<duration||delta%duration!==0)throw Error('Row '+(i+2)+': spacing does not match the declared timeframe.');if(delta>duration)gaps++;}
  const bar={timestamp:new Date(ms).toISOString(),closed:true};for(const h of ['open','high','low','close'])bar[h]=numeric(r[at[h]],h,i+2);
  if(!research.valid(bar))throw Error('Row '+(i+2)+': positive standard OHLC must contain open and close within high/low.');
  if(at.closed!==undefined&&!['true','1'].includes(r[at.closed].toLowerCase()))throw Error('Row '+(i+2)+': unfinished candle.');
  if(at.volume!==undefined&&r[at.volume]!==''){bar.volume=numeric(r[at.volume],'volume',i+2);if(bar.volume<0)throw Error('Volume cannot be negative.');}
  bars.push(bar);last=ms;
 }
 const slippage=meta.slippage_ticks,fee=meta.roundtrip_fee,tick=meta.tick,multiplier=meta.multiplier;
 if(!Number.isFinite(slippage)||slippage<0||slippage>100||!Number.isFinite(fee)||fee<0||fee>1000||!Number.isFinite(tick)||tick<=0||!Number.isFinite(multiplier)||multiplier<=0)throw Error('Enter valid slippage, fees, tick size and price multiplier.');
 return {version:VERSION,asset:{...base,tick,multiplier},bars,metadata:{symbol:base.name,timeframe:meta.timeframe,source:meta.source.trim(),source_verified:false,chart_type:'user_declared_standard',timestamps:'bar-open',gap_count:gaps,slippage_ticks:slippage,roundtrip_fee:fee,tick,multiplier,completed:'user_declared_and_timestamp_checked',duration_ms:duration,received_at:new Date(now).toISOString()}};
}
function evaluate(dataset){
 // Revalidate persisted inputs before use. Their provenance never changes to verified.
 if(dataset?.version!==VERSION||!Array.isArray(dataset.bars)||!dataset.bars.every(research.valid))throw Error('Invalid saved candle dataset.');
 const d=parse(['timestamp,open,high,low,close',...dataset.bars.map(b=>[b.timestamp,b.open,b.high,b.low,b.close].join(','))].join('\n'),{...dataset.metadata,standard:true,completed:true});
 const {bars,asset,metadata}=d,trainEnd=Math.floor(bars.length*.6),testStart=Math.floor(bars.length*.8);
 const costs={slippage_ticks:metadata.slippage_ticks,roundtrip_fee:metadata.roundtrip_fee,max_gap_ms:metadata.duration_ms,imported_ohlc:true};
 const selected=research.select(asset,bars,{train_end:trainEnd,test_start:testStart,costs}),stressCosts={...costs,slippage_ticks:Math.max(3,metadata.slippage_ticks*3),fee_multiplier:2};
 const candidate=research.simulate(asset,bars,selected.rule,testStart,bars.length,costs),control=research.simulate(asset,bars,research.rules[0],testStart,bars.length,costs);
 const stress=research.simulate(asset,bars,selected.rule,testStart,bars.length,stressCosts),controlStress=research.simulate(asset,bars,research.rules[0],testStart,bars.length,stressCosts);
 return {version:VERSION,model_version:research.VERSION,kind:'user_imported_ohlc_research',metadata,bar_count:bars.length,split:{train_end:trainEnd,test_start:testStart,train_first:24,test_end:bars.length},selected_recipe:{id:selected.rule.id,label:selected.rule.label,rule:{...selected.rule}},decision:selected.decision,selection_scores:selected.scores.map(s=>({id:s.rule.id,label:s.rule.label,train:s.train,validation:s.validation})),candidate,control,stress,control_stress:controlStress,metrics:evidence.metrics(candidate),priorities:evidence.priorities(candidate,stress),lessons:research.lessons(candidate),recipe_trials:8,exit_experiment:exits.evaluate(d),final_test_recipes:selected.rule.id==='balanced'?1:2,auto_promoted:false,market_validation_passed:false,limitations:[
 'User-supplied source, completion, instrument mapping, corporate actions and futures rolls are unverified.',
 'One chronological 60/20/20 split; no multiple-testing adjustment, independent forward test or exchange-calendar verification.',
 'Timestamp gaps end positions at the prior close and reset entry context. This is a dataset-boundary assumption, not verified session close execution.',
 'Next-open fills with modeled slippage, fees, stop-first ambiguous bars and fixed research risk budgets; no actual orders, market depth or broker fills.',
 'Research dollar results depend on the entered tick size, multiplier and costs. They do not change the $50,000 practice account.',
 'An imported backtest cannot establish a future win percentage or automatically clear the market validation gate.'
 ],created_at:new Date().toISOString()};
}
return {VERSION,MAX_BYTES,MAX_BARS,DURATIONS,csv,parse,evaluate};
});
