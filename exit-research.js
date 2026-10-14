/* Three predeclared exits, one fixed entry recipe, one bounded risk budget. No execution integration. */
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./strategy-research.js'):root.LaylowStrategyResearch,node?require('./research-evidence.js'):root.LaylowResearchEvidence);if(node)module.exports=api;else root.LaylowExitResearch=api;})(typeof self!=='undefined'?self:this,function(R,E){
'use strict';
const VERSION=1,METHODS=Object.freeze([
 Object.freeze({id:'fixed',label:'Fixed target / 2R',description:'Initial stop stays fixed. Full exit at 2R or the common time/boundary exit.'}),
 Object.freeze({id:'partial',label:'Half at 1R / rest at 2R',description:'Exit half the integer units at 1R, remainder at 2R; initial stop stays fixed. Fewer than two units uses a full 2R exit. Equity fee charged per exit slice.'}),
 Object.freeze({id:'trailing',label:'Close-based trailing stop',description:'After a completed close reaches +1R, trail one initial R behind that close on the next candle. No fixed profit target.'})
]);
function evaluate(dataset){
 const {asset,bars,metadata}=dataset;if(!bars?.every(R.valid)||!metadata?.duration_ms)throw Error('Valid completed OHLC is required for exit research.');
 const trainEnd=Math.floor(bars.length*.6),testStart=Math.floor(bars.length*.8),rule=Object.freeze({...R.rules[0],id:'fixed_entry_exit_study',label:'Frozen balanced entry / 24-bar maximum hold',hold:24,rr:2}),budget=125;
 const costs={risk_budget:budget,slippage_ticks:metadata.slippage_ticks,roundtrip_fee:metadata.roundtrip_fee,max_gap_ms:metadata.duration_ms,imported_ohlc:true};
 const stress={...costs,slippage_ticks:Math.max(3,costs.slippage_ticks*3),fee_multiplier:2};
 const run=(method,start,end,options=costs)=>R.simulate(asset,bars,rule,start,end,{...options,exit_mode:method});
 const selection=METHODS.map(m=>({...m,train:run(m.id,24,trainEnd),validation:run(m.id,trainEnd,testStart),validation_stress:run(m.id,trainEnd,testStart,stress)})),control=selection[0];
 // Minimum counts are research heuristics, not proof of statistical significance.
 const eligible=selection.slice(1).filter(s=>s.train.trades>=3&&s.train.net_cents>0&&s.validation.trades>=2&&s.validation.net_cents>Math.max(0,control.validation.net_cents)&&s.validation_stress.net_cents>0&&s.validation.drawdown_cents<=Math.max(control.validation.drawdown_cents,budget*200));
 eligible.sort((a,b)=>(b.validation.net_cents-b.validation.drawdown_cents*.5)-(a.validation.net_cents-a.validation.drawdown_cents*.5)||a.id.localeCompare(b.id));
 const chosen=eligible[0]||control,candidate=run(chosen.id,testStart,bars.length),baseline=run('fixed',testStart,bars.length),candidateStress=run(chosen.id,testStart,bars.length,stress),baselineStress=run('fixed',testStart,bars.length,stress);
 return {version:VERSION,kind:'fixed_risk_exit_experiment',team:asset.name,entry_rule:rule,risk_budget_cents:budget*100,unit_cap:asset.margin?3:50,split:{train_end:trainEnd,test_start:testStart,test_end:bars.length},selection_trials:3,final_test_methods:chosen.id==='fixed'?1:2,selection,selected_method:{id:chosen.id,label:chosen.label},decision:eligible.length?'Earlier training and validation qualified this exit for the final section.':'No alternative qualified; keep the fixed-target control.',candidate,control:baseline,stress:candidateStress,control_stress:baselineStress,metrics:E.metrics(candidate),priorities:E.priorities(candidate,candidateStress),auto_promoted:false,market_validation_passed:false,forward_paper_status:'not_started',limitations:[
 'One frozen entry recipe and three predefined exits; final data never chooses an exit. Repeated files are not new evidence.',
 'Planned initial risk is capped at $125 per position, including modeled costs. Gaps can exceed planned risk; unit counts vary with stop distance.',
 'Exit methods can occupy positions for different lengths and therefore take different later signals. This is a portfolio-policy comparison, not identical paired trades.',
 'Partial exits use integer units, charge modeled equity fees per slice, and aggregate both slices into one trade result. Stops win ambiguous candles.',
 'Trailing changes use completed closes and become active on the next candle; minute candles cannot resolve intrabar sequencing.',
 'Maximum hold is 24 candles for all exits. Dataset boundaries flatten positions; exchange sessions, borrow costs and liquidity are unverified.',
 'Provider provenance remains unverified. Positive backtests, sample-count heuristics and stress tests cannot authorize live orders.'
 ]};
}
return {VERSION,METHODS,evaluate};
});
