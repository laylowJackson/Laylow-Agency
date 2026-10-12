/* Shared deterministic candle evidence for bot teams and managers. Never creates an order or detects screenshot pixels. */
(function(root){'use strict';
const sources=[
 ['CME: candle anatomy','https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar'],
 ['ChartSchool: context and patterns','https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/introduction-to-candlesticks'],
 ['TradingView: synthetic chart prices','https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/']
];
function measure(c){
 if(!c||!['open','high','low','close'].every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])))return {valid:false,error:'Enter all four finite OHLC values. Unknown values stay unknown.'};
 const {open,high,low,close}=c;
 if(high<low||high<Math.max(open,close)||low>Math.min(open,close))return {valid:false,error:'High must contain open and close; low must be below both. Check the source values.'};
 const body=Math.abs(close-open),range=high-low,upper=high-Math.max(open,close),lower=Math.min(open,close)-low;
 return {valid:true,body,range,upper_wick:upper,lower_wick:lower,upper_body_ratio:body?upper/body:null,lower_body_ratio:body?lower/body:null,close_location:range?(close-low)/range:null,body_fraction:range?body/range:null};
}
function describe(c,context={}){
 const m=measure(c),result={metrics:m,shape:null,pattern:null,entry_evidence:false,signal:null,outcome:'unknown',confidence:null,provenance:['synthetic_ohlc','provider_ohlc','user_verified_ohlc'].includes(context.basis)?context.basis:'user_visual_estimate',limitations:['OHLC does not reveal which extreme happened first.','No trade outcome or execution is inferred.']};
 if(!m.valid)return result;
 if(context.chart_type!=='standard'){result.limitations.push('Chart type is unknown or synthetic. Use standard OHLC before interpreting market-price wicks.');return result;}
 if(context.closed!==true){result.limitations.push('This candle is unfinished or its close is unverified. Its final shape can change.');return result;}
 result.entry_evidence=context.timing==='pre_entry';
 if(!result.entry_evidence)result.limitations.push('The completed candle was not verified as known before entry. Keep it out of entry-rule evidence.');
 if(m.range===0){result.shape='No range';result.limitations.push('A zero-range candle has no measurable wick ratio or close location.');return result;}
 // These are explicit teaching heuristics, not universal pattern definitions or strategy rules.
 if(m.body_fraction<=.05)result.shape='Doji-like';
 else if(m.lower_wick>=2*m.body&&m.upper_wick<=.1*m.range&&m.body_fraction<=.3){
  result.shape='Long lower wick';result.pattern=context.prior_trend==='down'?'Possible hammer':context.prior_trend==='up'?'Possible hanging man':null;
 }else if(m.upper_wick>=2*m.body&&m.lower_wick<=.1*m.range&&m.body_fraction<=.3){
  result.shape='Long upper wick';result.pattern=context.prior_trend==='up'?'Possible shooting star':context.prior_trend==='down'?'Possible inverted hammer':null;
 }else if(m.upper_wick>m.body&&m.lower_wick>m.body)result.shape='Two-sided wicks / small body';
 else result.shape='Body and wicks measured';
 if(context.prior_trend!=='up'&&context.prior_trend!=='down')result.limitations.push('Prior trend is unverified; a shape alone does not establish a reversal pattern.');
 result.limitations.push('A wick alone does not prove rejection, a liquidity sweep, a structure break, or a supply/demand zone.');
 return result;
}
// Synthetic timestamps represent completed steps. Provider timestamps need an explicit interval.
function reviewCandles(bars, context={}){
 const unknown={version:1,available:false,candle_time:null,metrics:null,shape:null,pattern:null,signal:null,outcome:'unknown',entry_evidence:false,provenance:context.basis||'unknown',summary:'Candle evidence unavailable: completion, source or cutoff is unverified.',limitations:['No wick-only signal; no inferred outcome.']};
 const cutoff=Date.parse(context.as_of),duration=context.duration_seconds;
 if(!Array.isArray(bars)||context.chart_type!=='standard'||!Number.isFinite(cutoff)||!['synthetic_ohlc','provider_ohlc'].includes(context.basis))return unknown;
 if(context.basis==='provider_ohlc'&&(!Number.isFinite(duration)||duration<=0))return unknown;
 const rows=[];let previous=-Infinity;
 for(const b of bars){const stamp=Date.parse(b.timestamp);if(!Number.isFinite(stamp)||stamp<=previous)return unknown;previous=stamp;
  const end=stamp+(context.basis==='provider_ohlc'?duration*1000:0);
  if(end>cutoff||b.closed===false)continue;if(!measure(b).valid)return unknown;rows.push(b);
 }
 if(!rows.length)return unknown;
 const c=rows.at(-1),prior=rows.slice(-6,-1),avg=prior.length?prior.reduce((n,b)=>n+b.close,0)/prior.length:null;
 const trend=prior.length===5?(prior.at(-1).close>avg?'up':prior.at(-1).close<avg?'down':'unknown'):'unknown';
 const result=describe(c,{...context,closed:true,timing:'pre_entry',prior_trend:trend}),m=result.metrics;
 return {version:1,available:true,candle_time:c.timestamp,as_of:context.as_of,prior_trend:trend,...result,
  summary:`${result.pattern||result.shape}; upper wick ${m.upper_wick.toFixed(4)}, lower wick ${m.lower_wick.toFixed(4)}, body ${m.body.toFixed(4)}. Completed ${context.basis==='synthetic_ohlc'?'synthetic':'provider'} candle; context only, not a trade signal.`};
}
// Experimental filter on an existing trend proposal, never a standalone entry generator.
function trendFilter(review,direction){
 const m=review?.metrics;
 if(!review?.available||!review.entry_evidence||!m?.valid||!m.range||!m.body||m.body_fraction<=.05)return false;
 return direction==='LONG'?m.close_location>=.6&&m.lower_wick>=m.body:direction==='SHORT'?m.close_location<=.4&&m.upper_wick>=m.body:false;
}
const api={measure,describe,reviewCandles,trendFilter,sources};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.LaylowWickKnowledge=api;
})(typeof window!=='undefined'?window:globalThis);
