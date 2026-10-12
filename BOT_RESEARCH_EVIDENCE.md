# Bot research evidence and historical candle tests

This extends Laylow Agency's existing training lab. It does not replace the city, rooms, managers, screenshot reviews, execution engine or $50,000 practice ledger. AI and broker connections remain deferred; LIVE remains locked.

## What the bots know and test

`research-evidence.js` contains a curated, dated research playbook and deterministic diagnostics. It does not claim to contain every day-trading dataset, train an AI model, or discover a guaranteed edge. Its sources and applications are visible inside the strategy evidence station:

- [FINRA Rule 2270](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2270): frequent costs and difficult execution can reduce returns. Compare net results and adverse-cost runs.
- [Bailey, Borwein, López de Prado and Zhu, Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf): repeated strategy trials create selection bias; holdouts alone do not account for it. Disclose trials, freeze recipes and require new evidence. The app does not implement CSCV, PBO or a multiple-testing correction.
- [Barber et al., Do Day Traders Rationally Learn About Their Ability?](https://faculty.haas.berkeley.edu/odean/papers/Day%20Traders/Day%20Trading%20and%20Learning%20110217.pdf): Taiwan's 1992–2006 transaction data show negative aggregate results and persistence among many losing traders. This historical population does not estimate the performance of our bots. More practice alone is not proof of skill.
- [NIST Wilson interval](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm): show sampling uncertainty along with win percentage. The app uses a two-sided 95% Wilson reference. Trades are not necessarily independent Bernoulli trials; selection bias, correlation and changing regimes can make that reference overconfident.
- [CME candle anatomy](https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar): wick/body geometry comes from completed standard OHLC. A wick alone does not prove causation or the next direction.
- [TradingView non-standard chart limitations](https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/): synthetic chart prices can distort backtests. Screenshots stay visual estimates, separate from candle tests.

Reviewed 2026-10-11. Applications above are implementation choices informed by these sources, not prescriptions endorsed by their authors.

## Win percentage is only one metric

The evidence panel reports the latest selected recipe's cumulative **synthetic v2** results, without borrowing trades from other recipes or older models. It shows:

- Wins / all closed trades, including flat results in the denominator.
- Closed trades and number of flat results.
- Wilson reference interval; no interval for an empty sample.
- Average net result per trade (expectancy).
- Average net win and net loss.
- Break-even win proportion among decisive trades, `average_loss / (average_win + average_loss)`, unknown if either side has no observations.

Profit/loss totals in the existing engine's `gross_profit_cents` and `gross_loss_cents` fields actually aggregate winning and losing **net** trade results; diagnostics use their established semantics. They do not subtract fees twice. A no-loss sample has an unknown finite profit factor, not infinite proven skill.

For example, 80 wins of $1 and 20 losses of $10 produce an 80% win percentage and a **-$1.20** average result. Raising win percentage alone would miss that problem. Bot priorities identify observed issues to test, not established causes of losses or automatic strategy changes.

## Upload and test market candles

Open Training in the city, then **Test the bots on your candle data**. Choose the team, candle timeframe, source/export identifier, slippage, round-trip fees, tick size and USD price multiplier. Confirm that the file contains completed standard OHLC with **bar-open timestamps**. Click **Run chronological test**.

CSV requires 288–5,000 rows, at most 2 MB:

```csv
timestamp,open,high,low,close,volume
2026-10-01T14:30:00Z,100,101,99,100.5,1000
```

`time` or `datetime` may replace `timestamp`. Use ISO 8601 with Z/UTC offset, ten-digit Unix seconds or thirteen-digit Unix milliseconds. Optional `volume` must be nonnegative; optional `closed` must be true/1. Present `symbol`/`instrument` and `timeframe` columns must agree with the chosen inputs. Names with exchange prefixes are accepted when the suffix matches. Export one instrument per file.

Invalid numbers, unfinished/future bars, OHLC geometry, duplicate/reversed timestamps, conflicting instruments, unsupported intervals, and malformed CSV fail with an explanation. Missing values are never filled in. Timestamp spacing must be an integer multiple of the chosen interval. The chosen chart type, bar completion, source, instrument specifications, adjustments and rolls are still **user declared**, not provider verified.

The simulator uses:

1. First 60% for training/selection, with a 24-bar warmup.
2. Next 20% for validation and choosing among the existing eight fixed recipes.
3. Final 20% for that chosen recipe vs the unchanged balanced control.
4. The same final section with at least three ticks of slippage per side (or three times the entered slippage) and double fees.

Only earlier prices select the recipe. All eight selection trials are disclosed. Comparing chosen/control normal/stress results is not four independent datasets. Revisiting the same file is not fresh evidence; the interface warns when its SHA-256 matches the last saved file.

Imported runs use the existing conservative next-open, stop-first ambiguous-bar and mark-to-market model. Timestamp gaps flatten open positions at the preceding close and reset the 24-bar entry context. That is a **dataset-boundary assumption**, not exchange-calendar verification or proof that such a close fill was achievable. Stocks use a per-trade round-trip fee; futures use a per-contract round-trip fee. Existing research budgets are $125 ($1,500 for multiplier ≥20), capped at 50 shares or three contracts. The model may skip an entry. Fees, slip and entered specifications affect hypothetical dollar results; no money is added to the practice account.

## Persistence, exports and privacy

The historical browser worker computes locally. There is no market-provider fetch, AI request, order submission or credential field in this module. It stores the **latest** original CSV, normalized candles, report and SHA-256 in IndexedDB `laylow-market-research-v1`. It does not overwrite synthetic training history or the practice account. Export JSON before replacing a file if you want to retain older reports. A storage failure leaves the result exportable; a processing failure preserves the earlier report.

Export includes the original CSV, parsed data, all selection scores, chosen rule parameters, candidate/control/stress trades, user-declared provenance, modeled fees, timestamps and limitations. A hash identifies bytes; it does not verify their source. Clear research file removes only this module's last saved file. Browser storage is device/origin-specific and can be cleared by the browser. This import is not automatically fed into the local closed-market worker; automatic nightshift drills remain synthetic.

## Current limits

No live market feed, automatic historical download, trained AI provider, verified exchange calendar, corporate-action/continuous-contract adjustment engine, tick/order-book fill model, independent forward-paper validation or multiple-testing correction is connected. One retrospective split does not establish a future high win percentage. Importing a positive file never sets `market_validation_passed`, changes the existing market-data gate, promotes a recipe, changes account risk or unlocks LIVE.

## Added/changed files and verification

Added: `research-evidence.js`, `historical-research.js`, `historical-research-worker.js`, `research-station-ui.js`, this document and `tests/test_research_evidence.{cjs,py}`.

Changed: `strategy-research.js` (optional split/cost/import provenance/gap boundaries, default synthetic behavior preserved), `strategy-research.css`, `index.html`, `dashboard.py` (four exact asset routes), `package_build.py`, and README. Public/source index API paths remain different by design.

Checks cover high-win negative expectancy, Wilson values, nulls, strict file parsing, future boundaries, timestamp-gap isolation, cost changes, preserved synthetic defaults and untouched practice ledger. Desktop/mobile browser checks exercise the actual worker, upload, corrected inputs, save/reopen, repeated-file warning, JSON export, bad-file recovery and clearing. Synthetic QA fixtures are explicitly labeled; none is published as real market performance.
