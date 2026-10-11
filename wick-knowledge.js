/* Candle education and manual measurements only. Never creates an order or detects screenshot pixels. */
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
 const m=measure(c),result={metrics:m,shape:null,pattern:null,entry_evidence:false,signal:null,outcome:'unknown',confidence:null,provenance:context.basis==='user_verified_ohlc'?'user_verified_ohlc':'user_visual_estimate',limitations:['OHLC does not reveal which extreme happened first.','No trade outcome or execution is inferred.']};
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
const questions=[
 {q:'Open 100, high 108, low 96, close 102. How long is the upper wick?',answers:['6 price units','8 price units','2 price units'],correct:0,why:'Upper wick = high − max(open, close) = 108 − 102 = 6.'},
 {q:'A candle has a long upper wick. What does its OHLC prove?',answers:['The high extended above both open and close','Price hit the high before the low','A short trade will win'],correct:0,why:'OHLC shows extremes, not their sequence or the next move.'},
 {q:'The same small body and long lower wick forms after a rise. Which name may fit?',answers:['Hanging man, requiring context and confirmation','Always a bullish hammer','Guaranteed demand'],correct:0,why:'The prior move matters: a hammer follows a decline; a hanging man follows a rise.'},
 {q:'A finished candle confirms a level after your entry. Was that confirmation known at entry?',answers:['No; it belongs to post-entry review','Yes, because it is visible now','Yes, if the trade won'],correct:0,why:'A later close cannot become earlier evidence.'},
 {q:'Can a Heikin Ashi wick be treated as an exact traded-price extreme?',answers:['No; verify standard OHLC','Yes, the colors match','Yes, on a five-minute chart'],correct:0,why:'Heikin Ashi values are synthetic. Confirm actual prices on a standard chart.'}
];
const api={measure,describe,sources};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.LaylowWickKnowledge=api;
if(typeof document==='undefined')return;
function mount(host,prefix,copyToReview){
 const panel=document.createElement('details');panel.className='wick-guide';panel.id=prefix+'-wick-guide';
 panel.innerHTML=`<summary><span class="wick-badge">CANDLE SCHOOL</span><strong>Candle wicks: measure first, interpret with context</strong><span class="wick-expand">Open lesson +</span></summary><div class="wick-content">
 <p class="wick-lead">A wick records an excursion beyond the open/close body. It is evidence to review, not a buy or sell instruction.</p>
 <div class="wick-lesson-grid"><div class="wick-anatomy"><svg viewBox="0 0 360 270" role="img" aria-label="Illustrative candle with upper wick, open and close body, and lower wick"><path d="M110 34V236" stroke="#90c5ff" stroke-width="4"/><rect x="87" y="96" width="46" height="68" rx="4" fill="#5ed6b1"/><g fill="#d7e7ff" font-family="system-ui" font-size="14"><text x="164" y="39">High / top of wick</text><text x="164" y="75">Upper wick</text><text x="164" y="110">Close (this example)</text><text x="164" y="142">Body = |close − open|</text><text x="164" y="170">Open (this example)</text><text x="164" y="208">Lower wick</text><text x="164" y="244">Low / bottom of wick</text></g><g stroke="#506b96" stroke-dasharray="3 4"><path d="M110 34H155M133 96H155M133 164H155M110 236H155"/></g></svg><small>Teaching illustration · candle colors depend on chart settings.</small></div><div class="wick-rules"><p><strong>Upper wick</strong> = high − max(open, close). Price reached above the body but finished below the high.</p><p><strong>Lower wick</strong> = min(open, close) − low. Price reached below the body but finished above the low.</p><p><strong>Read the location.</strong> Compare trend, timeframe, nearby levels, body size and the close. Long wicks on both sides can suggest indecision; a tiny body can resemble a doji.</p><p><strong>Context changes the name.</strong> Lower tail after a decline: possible hammer; after a rise: possible hanging man. Upper tail after a rise: possible shooting star; after a decline: possible inverted hammer. Confirmation is still needed.</p></div></div>
 <div class="wick-checks"><p><strong>Before calling it a setup:</strong> wait for a verified close, define the level first, and record when the evidence became available. A wick through a level is not automatically a confirmed structure break or liquidity sweep. Supply/demand requires separate evidence.</p><p>OHLC cannot reveal whether the high or low came first. If a stop and target are both touched in one candle, the outcome remains ambiguous without finer data or an explicit conservative rule. A wick touch also does not prove an order filled.</p><p>Heikin Ashi and other synthetic charts can show prices that were not traded. Use standard OHLC to verify prices. Later candles cannot prove what was known before entry.</p></div>
 <h3>Measure one candle</h3><p class="wick-muted">Type source OHLC values. This tool does not read your uploaded image. All context is supplied by you; it does not raise extraction confidence.</p>
 <div class="wick-inputs">${['open','high','low','close'].map(k=>`<label>${k[0].toUpperCase()+k.slice(1)}<input id="${prefix}-wick-${k}" data-wick-price="${k}" type="number" step="any" placeholder="Unknown"></label>`).join('')}
 <label>Chart type<select data-wick-context="chart_type"><option value="unknown">Unknown</option><option value="standard">Standard OHLC candles</option><option value="synthetic">Heikin Ashi / synthetic</option></select></label><label>Candle complete?<select data-wick-context="closed"><option value="unknown">Unverified</option><option value="yes">Yes, closed</option><option value="no">No, still forming</option></select></label><label>Prior trend<select data-wick-context="prior_trend"><option value="unknown">Unknown / range</option><option value="down">Decline</option><option value="up">Rise</option></select></label><label>Known at entry?<select data-wick-context="timing"><option value="unknown">Unknown</option><option value="pre_entry">Closed before entry (verified by me)</option><option value="post_entry">Completed after entry</option></select></label><label class="wick-wide">Value source<select data-wick-context="basis"><option value="user_visual_estimate">Visual estimates</option><option value="user_verified_ohlc">I checked the source OHLC</option></select></label></div>
 <div class="wick-results" role="status"><strong data-wick-shape>Unknown · enter OHLC</strong><dl data-wick-metrics></dl><div data-wick-limitations></div></div><p class="wick-muted">Teaching thresholds: dominant wick ≥ 2× body, opposite wick ≤ 10% of range, body ≤ 30% of range; doji-like body ≤ 5%. These adjustable-in-code examples are not universal definitions or an optimized strategy.</p>
 <div class="wick-actions"><button type="button" data-wick-export disabled>Export candle worksheet</button>${copyToReview?'<button type="button" data-wick-copy disabled>Add measurement to review notes</button>':''}<button type="button" data-wick-reset>Clear worksheet</button></div><p data-wick-message class="wick-muted" role="status"></p>
 <details class="wick-quiz"><summary>Practice reading wicks · 5 questions</summary><p data-wick-question></p><div data-wick-answers class="wick-actions"></div><p data-wick-feedback role="status"></p><button type="button" data-wick-next>Next question</button><span data-wick-score class="wick-muted"></span><p class="wick-muted">Knowledge exercise only. This score is separate from bot research and trading results.</p></details>
 <p class="wick-sources">Learning references: ${sources.map(([title,url])=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`).join(' · ')}</p></div>`;
 host.append(panel);
 const $=s=>panel.querySelector(s),num=n=>n===null?'Unknown':Number(n.toFixed(5)).toLocaleString('en-US',{maximumFractionDigits:5});
 let worksheet=null,question=0,answered=false,correct=0,attempted=0;
 function reset(){for(const i of panel.querySelectorAll('input'))i.value='';for(const s of panel.querySelectorAll('select'))s.selectedIndex=0;$('[data-wick-message]').textContent='';render();}
 function render(){
  const c={},context={};for(const input of panel.querySelectorAll('[data-wick-price]'))c[input.dataset.wickPrice]=input.value.trim()===''?null:Number(input.value);
  for(const select of panel.querySelectorAll('[data-wick-context]'))context[select.dataset.wickContext]=select.value;
  context.closed=context.closed==='yes'?true:context.closed==='no'?false:null;
  worksheet={version:1,analysis_kind:'manual_candle_measurement',ohlc:c,context,...describe(c,context)};const m=worksheet.metrics;
  $('[data-wick-shape]').textContent=m.valid?[(worksheet.pattern||worksheet.shape||'Interpretation unverified'),worksheet.provenance==='user_verified_ohlc'?'OHLC checked by user':'estimated'].join(' · '):m.error;
  $('[data-wick-metrics]').replaceChildren();if(m.valid)for(const [label,value]of [['Upper wick',num(m.upper_wick)],['Lower wick',num(m.lower_wick)],['Body',num(m.body)],['Range',num(m.range)],['Upper wick / body',m.upper_body_ratio===null?'Undefined (zero body)':num(m.upper_body_ratio)+'×'],['Lower wick / body',m.lower_body_ratio===null?'Undefined (zero body)':num(m.lower_body_ratio)+'×'],['Close within range',m.close_location===null?'Undefined (zero range)':num(m.close_location*100)+'% from low']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('[data-wick-metrics]').append(dt,dd);}
  $('[data-wick-limitations]').replaceChildren();for(const text of worksheet.limitations){const p=document.createElement('p');p.textContent=text;$('[data-wick-limitations]').append(p);}
  $('[data-wick-export]').disabled=!m.valid;if(copyToReview)$('[data-wick-copy]').disabled=!m.valid;
 }
 panel.addEventListener('input',e=>{if(e.target.matches('input,select')){$('[data-wick-message]').textContent='';render();}});
 $('[data-wick-reset]').addEventListener('click',reset);
 $('[data-wick-export]').addEventListener('click',()=>{render();if(!worksheet.metrics.valid)return;const url=URL.createObjectURL(new Blob([JSON.stringify(worksheet,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='laylow-candle-worksheet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 if(copyToReview){$('[data-wick-copy]').addEventListener('click',()=>{render();if(!worksheet.metrics.valid)return;const notes=document.getElementById('lab-notes'),m=worksheet.metrics,c=worksheet.ohlc;const text=`Manual candle review (${worksheet.provenance}): O ${c.open}, H ${c.high}, L ${c.low}, C ${c.close}; upper wick ${num(m.upper_wick)}, lower wick ${num(m.lower_wick)}, body ${num(m.body)}. Chart ${worksheet.context.chart_type}; closed ${worksheet.context.closed===null?'unverified':worksheet.context.closed}; timing ${worksheet.context.timing}; prior trend ${worksheet.context.prior_trend}. ${worksheet.pattern||worksheet.shape||'Interpretation unverified'}. No standalone trade signal or outcome. ${worksheet.limitations.join(' ')}`;
   if(notes.value.length+text.length+2>5000){$('[data-wick-message]').textContent='Notes are full. Export the worksheet instead.';return;}notes.value+=(notes.value?'\n\n':'')+text;notes.dispatchEvent(new Event('input',{bubbles:true}));$('[data-wick-message]').textContent='Added to notes. Save review to keep it; raw extraction and entry conditions were not changed.';
  });document.getElementById('screenshot-room').addEventListener('laylow-review-loaded',reset);}
 function quiz(){answered=false;const q=questions[question];$('[data-wick-question]').textContent=(question+1)+' / '+questions.length+' · '+q.q;$('[data-wick-feedback]').textContent='';$('[data-wick-next]').disabled=true;$('[data-wick-answers]').replaceChildren();for(const i of [1,0,2]){const b=document.createElement('button');b.type='button';b.textContent=q.answers[i];b.addEventListener('click',()=>{if(answered)return;answered=true;attempted++;if(i===q.correct)correct++;$('[data-wick-feedback]').textContent=(i===q.correct?'Correct. ':'Review this: ')+q.why;for(const x of $('[data-wick-answers]').children)x.disabled=true;$('[data-wick-next]').disabled=false;$('[data-wick-score]').textContent=' '+correct+' / '+attempted+' correct';});$('[data-wick-answers]').append(b);}}
 $('[data-wick-next]').addEventListener('click',()=>{if(!answered)return;question=(question+1)%questions.length;if(question===0){correct=0;attempted=0;$('[data-wick-score]').textContent='';}quiz();});render();quiz();
}
const lab=document.querySelector('#screenshot-room .lab-side');if(lab)mount(lab,'lab',true);
const training=document.getElementById('training-room');if(training){const host=document.createElement('section');host.className='wick-training';training.querySelector('.academy-stats').after(host);mount(host,'training',false);}
})(typeof window!=='undefined'?window:globalThis);
