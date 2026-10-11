# Candle knowledge in Laylow Agency

The existing Screenshot Lab and Strategy Training Lab include a **Candle School** panel. It teaches wick anatomy, measures manually supplied OHLC, and offers five knowledge questions. It never reads screenshot pixels, creates orders, changes candidate strategies, or changes the practice account. AI remains disconnected.

## Measurement contract

`wick-knowledge.js` exposes `LaylowWickKnowledge.measure(ohlc)` and `describe(ohlc, context)` in a browser and exports the same functions to Node. The body is `abs(close - open)`, upper wick is `high - max(open, close)`, lower wick is `min(open, close) - low`, and range is `high - low`. Invalid, incomplete or nonfinite inputs return an error. A zero body has no finite wick/body ratio; a zero range has no close-location percentage. Those fields are null, never invented numbers.

The default input basis is **user visual estimate**. “I checked the source OHLC” records user verification, not provider verification. All outputs have `signal: null`, `outcome: unknown`, and `confidence: null`. The calculator does not increase screenshot extraction confidence or mutate raw extraction.

## Interpretation contract for a future provider

- Unknown or synthetic chart types do not receive market-price pattern names. Verify standard OHLC first.
- An incomplete candle cannot receive a final pattern label. Its close and wick lengths may change.
- Prior trend matters. The same lower-tail shape may be a hammer after a decline or a hanging man after an advance; an upper-tail shape may be a shooting star after an advance or an inverted hammer after a decline. Names are possible interpretations, not confirmed entries.
- Geometry thresholds are explicit teaching heuristics, not universal definitions: dominant wick at least twice the body, other wick at most 10% of range, body at most 30% of range; a doji-like body is at most 5%. Do not promote these thresholds into trading rules without independent validation.
- The final candle must have existed before entry to qualify as pre-entry evidence. That status currently comes only from the user's selection. Future extraction must verify timestamps and avoid later-candle leakage.
- A wick alone cannot establish supply/demand, a structure break, a liquidity sweep, or intent from other market participants. Require explicit level definitions and additional evidence.
- OHLC cannot establish the order of intrabar extrema. Stop and target touches in one bar need finer data or a declared conservative simulation rule. Chart touches do not prove fills.

The worksheet is independent from the saved trade until the user chooses **Add measurement to review notes** and then **Save review**. Changing reviews clears the worksheet to avoid carrying one trade's measurements into another. A separate JSON export retains all values, context, provenance and limitations. Quiz scores are educational only; they do not count toward trading wins or training experiments.

## References

- [CME Group — candle anatomy](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar)
- [StockCharts ChartSchool — candle formation and context](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/introduction-to-candlesticks)
- [TradingView — synthetic prices and backtesting](https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/)

Tests: `node tests/test_wick_knowledge.cjs`; the Python unittest wrapper also runs this when Node is available.
