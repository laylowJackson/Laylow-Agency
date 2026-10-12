/* Descriptive bot research evidence. Never authorizes a trade or claims a learned edge. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowResearchEvidence=api;})(typeof window!=='undefined'?window:this,function(){
'use strict';
const SOURCES=Object.freeze([
 {id:'costs',title:'FINRA · Day-trading costs and execution',url:'https://www.finra.org/rules-guidance/rulebooks/finra-rules/2270',reviewed:'2026-10-11',finding:'Frequent trading costs can consume earnings; execution can deteriorate during volatility.',application:'Measure every result after modeled fees and slippage; rerun adverse-cost scenarios.'},
 {id:'overfit',title:'Bailey et al. · Probability of Backtest Overfitting',url:'https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf',reviewed:'2026-10-11',finding:'Testing more alternatives on the same data creates selection bias. A holdout alone does not account for repeated trials.',application:'Keep recipes fixed, report all trials, select before the test boundary and require fresh market samples. This app does not estimate PBO.'},
 {id:'learning',title:'Barber et al. · Day trading and learning',url:'https://faculty.haas.berkeley.edu/odean/papers/Day%20Traders/Day%20Trading%20and%20Learning%20110217.pdf',reviewed:'2026-10-11',finding:'In Taiwan transaction data from 1992–2006, aggregate day-trader performance was negative and many losing traders persisted.',application:'Treat practice as evaluation, not proof that more activity improves skill. This historical population is not a forecast for our bots.'},
 {id:'sample',title:'NIST · Wilson interval for proportions',url:'https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm',reviewed:'2026-10-11',finding:'Wilson intervals quantify sampling uncertainty for a binomial proportion.',application:'Show a reference interval with the trade count. Trades may be dependent, markets change and strategy selection adds bias; the interval is not a future-win forecast.'},
 {id:'wicks',title:'CME · Candlestick anatomy',url:'https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar',reviewed:'2026-10-11',finding:'Candle bodies and wicks represent open, close, high and low.',application:'Use completed standard OHLC and earlier context. A wick alone cannot identify who traded or prove the next move.'},
 {id:'chart',title:'TradingView · Non-standard chart prices',url:'https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/',reviewed:'2026-10-11',finding:'Non-standard chart prices can produce unrealistic strategy results.',application:'Require standard OHLC for imported tests. Screenshots remain visual estimates and never substitute for candle data.'}
].map(Object.freeze));
function wilson(wins,total){
 if(!Number.isSafeInteger(wins)||!Number.isSafeInteger(total)||wins<0||total<0||wins>total)throw Error('Invalid win sample');
 if(!total)return null;
 const z=1.959963984540054,p=wins/total,d=1+z*z/total,center=(p+z*z/(2*total))/d,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
 return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),level:.95,method:'Wilson / independent Bernoulli reference only'};
}
function metrics(r){
 if(!r)return null;
 const {trades,wins,losses,net_cents,gross_profit_cents:profit,gross_loss_cents:loss}=r;
 if(![trades,wins,losses].every(n=>Number.isSafeInteger(n)&&n>=0)||wins+losses>trades||![net_cents,profit,loss].every(Number.isFinite)||profit<0||loss<0||Math.abs(net_cents-(profit-loss))>1)throw Error('Inconsistent research totals');
 const aw=wins?profit/wins:null,al=losses?loss/losses:null;
 return {trades,wins,losses,breakeven:trades-wins-losses,win_rate:trades?wins/trades:null,interval:wilson(wins,trades),average_win_cents:aw,average_loss_cents:al,payoff_ratio:aw!==null&&al>0?aw/al:null,break_even_decisive_win_rate:aw!==null&&al!==null&&aw+al>0?al/(aw+al):null,expectancy_cents:trades?net_cents/trades:null,profit_factor:loss>0?profit/loss:null,net_cents};
}
function priorities(r,stress){
 const m=metrics(r),rows=[];
 if(!m?.trades)return ['No held-out trades: inspect rejected proposals and gather a larger sample. Do not force entries.'];
 if(m.expectancy_cents<=0)rows.push('Negative or flat net expectancy: keep the control; test entry/regime hypotheses on a fresh sample.');
 if(m.win_rate>.5&&m.expectancy_cents<=0)rows.push('More than half won but net results did not: review loss size and execution costs before pursuing a higher win rate.');
 if(m.payoff_ratio!==null&&m.payoff_ratio<1)rows.push('Average net loss exceeds average net win: inspect stop placement, gaps and early exits; never raise risk to hide losses.');
 if(stress&&stress.net_cents<=0)rows.push('Adverse-cost run is not profitable: inspect spread/slippage sensitivity and setups with small moves.');
 if(m.trades<60)rows.push('Small trade sample: collect more unchanged-rule evaluations across separate sessions. The 60-trade marker is a research heuristic, not proof.');
 if(r.ambiguous_exits>0)rows.push('Stop/target sequence is ambiguous on some bars: retain conservative fills and obtain finer data before drawing conclusions.');
 rows.push('Next validation: unseen standard market OHLC, then forward paper execution. Compare net expectancy and drawdown with the matched control.');
 return rows;
}
return {VERSION:1,SOURCES,metrics,wilson,priorities};
});
