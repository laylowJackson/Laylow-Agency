# Candle knowledge for the bot teams

The personal Candle School, quizzes and worksheets have been removed. Existing bot research remains available. AI is still disconnected: this module is deterministic OHLC evidence and experimental strategy testing, not model fine-tuning.

## Integration

`wick-knowledge.js` provides `measure`, `describe`, `reviewCandles` and `trendFilter`. Every synthetic practice specialist and council review receives `candle_review`. New practice entries preserve that snapshot in `entry_context`; later trade reviews retain it. Older entries remain unknown instead of receiving reconstructed hindsight. Practice managers also receive the current review. No account balance, fill, loss or risk limit is rewritten.

`wick_knowledge.py` supplies equivalent evidence to backend specialist votes, council reports, team managers and the Big Manager. New council fingerprints bind the evidence. The Alpaca minute-bar integration explicitly supplies standard chart type and a 60-second interval; forming bars are excluded from wick evidence. CSV feeds with unspecified chart type/interval return unavailable evidence. Existing consensus and execution risk checks remain in force; candle context does not approve an order.

## Evidence contract

Body = abs(close-open); upper wick = high-max(open,close); lower wick = min(open,close)-low. Zero-body ratios and zero-range location are null. Invalid geometry is rejected. The decision cutoff excludes later candles. Provider candle timestamps are start times and require an explicit duration; synthetic timestamps are completed simulation steps. Screenshot estimates cannot enter bot OHLC evidence.

Shape heuristics: dominant wick >= 2 times body, opposite wick <= 10% range, body <= 30% range; doji-like body <= 5%. Prior trend uses only five preceding closes compared with their mean. These are declared heuristics, not universal or optimized definitions. Possible hammer/hanging-man and shooting-star/inverted-hammer labels depend on prior context. No shape is a standalone trading signal. OHLC cannot identify the intrabar sequence, prove a fill or identify a supply/demand zone, structure break or liquidity sweep by itself. Signal, outcome and win probability are never inferred by this module.

## Bot research

The fifth candidate, Wick-aware trend, tests a filter on the existing Balanced trend proposal. It requires a completed candle, nonzero range/body, body fraction > 5%, and either LONG close location >= 60% with lower wick >= body, or SHORT close location <= 40% with upper wick >= body. It never creates direction from a wick. Thresholds are experimental. The existing generator uses symmetric upper/lower excursions, which limits realistic wick-pattern variety; these drills cannot validate actual market effectiveness.

Every team runs the candidate on held-out candles and records proposals checked, proposals filtered, trades, wins, losses, net after simulated costs, and drawdown versus the unchanged baseline. The latest independent comparison is in `wick_research`, and `trace.wick_candidate` retains its trades. Selection uses earlier candles only. Recorded entries retain their available-at-entry evidence. Old research history is preserved and labeled as predating this feature. Candidate tests do not automatically promote rules, change the $50,000 practice ledger, or establish better live performance.

Open Training to watch bot experiments and inspect BOT WICK RESEARCH. Open Council to inspect BOT CANDLE REVIEW. No personal lessons are required. Training runs while this page is open and visible; a hosted worker is still needed for training while closed.

## Sources and checks

- [CME candle anatomy](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar)
- [StockCharts candle context](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/introduction-to-candlesticks)
- [TradingView non-standard chart prices](https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/)

Run `node tests/test_wick_knowledge.cjs` and `python -m unittest discover -s tests`. Checks include completion/cutoff guards, synthetic and unknown input, all ten teams, council fingerprint binding, deterministic research/resume and ledger preservation.
