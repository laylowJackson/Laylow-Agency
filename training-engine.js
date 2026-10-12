/* Independent bot research. Existing saves and the practice ledger are preserved. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./practice-engine.js'):root.LaylowPracticeEngine,typeof module==='object'&&module.exports?require('./strategy-research.js'):root.LaylowStrategyResearch);if(typeof module==='object'&&module.exports)module.exports=api;else root.LaylowTrainingEngine=api;})(typeof window!=='undefined'?window:this,function(engine,research){
'use strict';
const {MARKETS}=engine,variants=research.rules,test=research.simulate;
const summary=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='trade_records'));
const totals=()=>({trades:0,wins:0,losses:0,net_cents:0,gross_profit_cents:0,gross_loss_cents:0});
function add(total,result){for(const k of Object.keys(total))total[k]+=result[k]||0;}
function scoreRule(team,id,round,regime,candidate,baseline,stress,baseStress){
 const board=team.research_scoreboard||(team.research_scoreboard={});const s=board[id]||(board[id]={version:2,rounds:0,candidate:totals(),baseline:totals(),stress:totals(),baseline_stress:totals(),max_drawdown_cents:0,baseline_max_drawdown_cents:0,regimes:{},auto_promoted:false});
 s.rounds++;s.last_round=round;add(s.candidate,candidate);add(s.baseline,baseline);add(s.stress,stress);add(s.baseline_stress,baseStress);s.max_drawdown_cents=Math.max(s.max_drawdown_cents,candidate.drawdown_cents,stress.drawdown_cents);s.baseline_max_drawdown_cents=Math.max(s.baseline_max_drawdown_cents,baseline.drawdown_cents,baseStress.drawdown_cents);
 const r=s.regimes[regime]||(s.regimes[regime]={rounds:0,trades:0,net_cents:0,stress_net_cents:0});r.rounds++;r.trades+=candidate.trades;r.net_cents+=candidate.net_cents;r.stress_net_cents+=stress.net_cents;
 const c=s.candidate,covered=Object.values(s.regimes).filter(r=>r.rounds>=2&&r.trades>0).length;
 s.gates={identity_samples:s.rounds>=12&&c.trades>=60,regime_coverage:covered>=4,positive_expectancy:c.net_cents>0,beats_control:c.net_cents>s.baseline.net_cents,profit_factor:c.gross_loss_cents>0&&c.gross_profit_cents/c.gross_loss_cents>=1.2,cost_stress:s.stress.net_cents>0&&s.stress.net_cents>s.baseline_stress.net_cents,drawdown:s.max_drawdown_cents<=s.baseline_max_drawdown_cents,independent_market_data:false};
 s.synthetic_qualified=id!=='balanced'&&Object.entries(s.gates).filter(([k])=>k!=='independent_market_data').every(([,v])=>v);return s;
}
class TrainingLab{
 constructor(){this.round=0;this.teams=MARKETS.map(a=>({name:a.name,experiments:0,trades:0,wins:0,losses:0,candidate_net_cents:0,baseline_net_cents:0,drawdown_cents:0,baseline_drawdown_cents:0,verified_rounds:0,selected:'balanced',status:'Waiting for first drill',lesson:'No research sample yet',history:[]}));}
 step(){
  const round=this.round+1,scenario=research.REGIMES[(round-1)%research.REGIMES.length];
  for(const [index,team]of this.teams.entries()){
   const asset=MARKETS[index],bars=research.generate(asset,91000+round*7919+index*313,scenario),selection=research.select(asset,bars),selected=selection.rule,baseline=test(asset,bars,variants[0],192,288),candidate=test(asset,bars,selected,192,288),stress=test(asset,bars,selected,192,288,{slippage_ticks:3,fee_multiplier:2}),baseStress=test(asset,bars,variants[0],192,288,{slippage_ticks:3,fee_multiplier:2}),wick_candidate=test(asset,bars,variants.find(r=>r.wick_filter),192,288);
   if(team.research_version!==2){team.legacy_research={rounds:team.experiments,trades:team.trades,wins:team.wins,losses:team.losses,candidate_net_cents:team.candidate_net_cents,baseline_net_cents:team.baseline_net_cents,model:'Earlier close-based research; not comparable to version 2'};team.scorecard={version:2,rounds:0,candidate:totals(),baseline:totals()};team.research_scoreboard={};team.research_version=2;}
   const ruleScore=scoreRule(team,selected.id,round,scenario,candidate,baseline,stress,baseStress);team.scorecard.rounds++;add(team.scorecard.candidate,candidate);add(team.scorecard.baseline,baseline);
   team.wick_research={version:1,round,source:'SYNTHETIC HELD-OUT RESEARCH / NEXT-OPEN MODEL',checked:wick_candidate.wick_checked,rejected:wick_candidate.wick_rejected,trades:wick_candidate.trades,wins:wick_candidate.wins,losses:wick_candidate.losses,net_cents:wick_candidate.net_cents,baseline_net_cents:baseline.net_cents,drawdown_cents:wick_candidate.drawdown_cents,baseline_drawdown_cents:baseline.drawdown_cents,auto_promoted:false};
   team.trace={model_version:2,knowledge_version:1,wick_candidate,round,scenario,selection_decision:selection.decision,training_end:192,selection_end:128,bars,training_scores:selection.scores.map(x=>({label:x.rule.label,id:x.rule.id,net_cents:x.train.net_cents,trades:x.train.trades,drawdown_cents:x.train.drawdown_cents,validation_net_cents:x.validation.net_cents,validation_trades:x.validation.trades,validation_drawdown_cents:x.validation.drawdown_cents})),candidate,baseline,stress,baseline_stress:baseStress,lessons:research.lessons(candidate),rule:selected.label,rule_id:selected.id};
   team.experiments++;team.trades+=candidate.trades;team.wins+=candidate.wins;team.losses+=candidate.losses;team.candidate_net_cents+=candidate.net_cents;team.baseline_net_cents+=baseline.net_cents;team.drawdown_cents+=candidate.drawdown_cents;team.baseline_drawdown_cents+=baseline.drawdown_cents;team.selected=selected.id;
   const better=candidate.trades>0&&candidate.net_cents>baseline.net_cents&&candidate.drawdown_cents<=baseline.drawdown_cents;if(better)team.verified_rounds++;
   team.status=selected.id==='balanced'?'Control retained / candidates did not qualify':ruleScore.synthetic_qualified?'Synthetic candidate / market validation required':'Experimental / evidence gates incomplete';
   team.lesson=selection.decision+'. '+(candidate.trades===0?'No held-out trades; filters or contract sizing blocked entries.':candidate.net_cents<0?'Held-out result lost after costs; inspect stop hits, follow-through and costs below.':better?'Beat control on this one held-out drill. Repeat without changing the recipe.':'Did not outperform the control in this held-out drill.')+' Real OHLC validation is still required.';
   team.history.unshift({model_version:2,round,scenario,rule:selected.label,candidate:summary(candidate),baseline:summary(baseline),stress:summary(stress),better});team.history.length=Math.min(12,team.history.length);
  }this.round=round;return this.snapshot();
 }
 snapshot(){return {model_version:2,round:this.round,scenario:this.round?research.REGIMES[(this.round-1)%research.REGIMES.length]:'First drill pending',source:'SYNTHETIC RESEARCH / UNTOUCHED HOLDOUT / COST STRESS',teams:JSON.parse(JSON.stringify(this.teams)),experiments:this.round*MARKETS.length};}
 export(){return {version:1,model_version:2,round:this.round,teams:this.teams};}
 restore(data){
  if(!data||data.version!==1||!Number.isSafeInteger(data.round)||data.round<0||data.round>100000||!Array.isArray(data.teams)||data.teams.length!==10)throw Error('Invalid research save');
  for(const [i,t]of data.teams.entries()){
   if(t.name!==MARKETS[i].name||!['experiments','trades','wins','losses','drawdown_cents','baseline_drawdown_cents','verified_rounds'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||!['candidate_net_cents','baseline_net_cents'].every(k=>Number.isSafeInteger(t[k]))||!variants.some(v=>v.id===t.selected)||!Array.isArray(t.history)||t.history.length>12)throw Error('Invalid research team');
   if(t.trace&&(!Array.isArray(t.trace.bars)||t.trace.bars.length>500||!t.trace.bars.every(b=>['open','high','low','close'].every(k=>Number.isFinite(b[k])))))throw Error('Invalid drill trace');
   if(t.scorecard&&(!Number.isSafeInteger(t.scorecard.rounds)||t.scorecard.rounds<0||!['candidate','baseline'].every(n=>t.scorecard[n]&&Object.keys(totals()).every(k=>Number.isSafeInteger(t.scorecard[n][k])))))throw Error('Invalid research scorecard');
   if(t.research_scoreboard){if(typeof t.research_scoreboard!=='object'||Object.keys(t.research_scoreboard).length>variants.length)throw Error('Invalid research scoreboard');for(const [id,s]of Object.entries(t.research_scoreboard)){if(!variants.some(v=>v.id===id)||s.version!==2||!Number.isSafeInteger(s.rounds)||s.rounds<0||!['candidate','baseline','stress','baseline_stress'].every(n=>s[n]&&Object.keys(totals()).every(k=>Number.isSafeInteger(s[n][k])))||!s.regimes||Object.keys(s.regimes).some(k=>!research.REGIMES.includes(k)))throw Error('Invalid strategy evidence');}}
  }
  this.round=data.round;this.teams=JSON.parse(JSON.stringify(data.teams));
 }
}
return {TrainingLab,variants,test,research};
});
