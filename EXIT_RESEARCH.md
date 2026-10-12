# First-team fixed-risk exit research

The first mission is SPY with completed standard 5-minute candles. It is a research experiment, not a strategy deployment. Real historical data has not been obtained or tested by this change. Upload a provider/chart export and record its source; no broker or AI credentials are needed for a local CSV.

## Use the station

Open Training, scroll to **SPY exit research mission**, and press **Set up SPY / 5-minute candles**. Download the fixed research plan to keep the predefined assumptions. The empty CSV template contains only column headers, never invented market rows.

Upload 288–5,000 candles (maximum 2 MB), enter the source, check the instrument specification and actual modeled costs, confirm completed standard candles, then run the chronological test. At least 288 rows is an input minimum, not sufficient evidence of profitability. A broader sample across market conditions and a genuinely new forward test are still needed.

The saved research JSON now contains `report.exit_experiment`, including every earlier comparison, the selected exit, final trades and partial fills. Storage keeps the latest historical report on this browser; export before replacing it if older reports matter. Older saved reports still reopen, but need a new run to obtain exit comparisons. Rerunning does not make a file independent new evidence.

## Predeclared experiment

One frozen balanced entry rule: 8-bar moving-average displacement threshold 0.0004, initial stop based on 1.5 earlier ATR, next-open entry, maximum hold 24 candles. No entry recipe is chosen for this exit experiment. The existing eight-recipe research report continues independently and its trials are disclosed alongside these three exit trials.

- **Fixed:** whole position targets 2 initial R from modeled entry.
- **Partial:** floor(half the integer units) exits at 1R, remainder at 2R. The initial stop is unchanged. A one-unit position cannot split and uses the full fixed exit.
- **Trailing:** no fixed target; a completed close at +1R arms a stop one initial R behind that close, active from the next candle. Subsequent completed closes can tighten, never widen, the stop.

All exits have the same $125 maximum planned-risk cap, including modeled costs, and existing caps of 50 shares or 3 contracts. This is an upper bound, not an equal realized risk amount on every trade. Integer sizing, different stop distances and holding times change quantities and later opportunities. Gaps through a stop can exceed planned risk. The $50,000 practice balance, execution settings, real LIVE lock and automatic synthetic nightshift are unchanged.

Equity round-trip fees are charged for each modeled exit slice, conservatively duplicating the fixed fee for a partial exit; futures fees are per contract across both slices. Check those assumptions against the intended provider and fee schedule. Each partial trade is aggregated once in trade count, win/loss and net P&L; JSON also preserves slice quantity, time, fill price and fees.

## Selection and final test

First 60% is training, next 20% validation. Compare three predefined exits. An alternative needs at least three earlier training trades and positive training net, at least two validation trades, positive validation net exceeding the fixed control, positive stressed-validation net, and drawdown within max(control validation drawdown, $250). These count/drawdown thresholds are research heuristics, not statistical significance. Rank eligible alternatives by validation net minus half validation drawdown; deterministic identifier resolves a tie. If none qualifies, retain the fixed control even if it is losing.

Freeze that choice before simulating the final 20%. Show only the frozen method and fixed control, plus their cost-stress counterparts. Do not choose an exit by final performance. Stress doubles fees and uses at least three slippage ticks per side (or three times the entered assumption). A selected method is never automatically promoted. `market_validation_passed` remains false and `forward_paper_status` remains `not_started`.

Do not repeatedly tune on this final section and keep calling it untouched. This implementation does not calculate a probability of backtest overfitting, multiple-testing correction or walk-forward confidence. Repeated investment backtests can fit noise; [Bailey and coauthors](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) explain why selection bias needs explicit attention.

## Limits

Source labels, adjusted prices, exchange calendars, short borrow fees, liquidity and provider provenance remain unverified. Standard OHLC cannot identify stop/target order inside one candle: the model takes the stop first, including when the partial target and stop both appear touched. Trailing updates never use a wick as a completed-close trigger. Timestamp gaps close positions at the previous close and reset context; these are dataset-boundary assumptions, not actual close-auction fills. Generated tests prove software behavior only.

## Files and checks

Added `exit-research.js`, this document, `tests/test_exit_research.cjs` and its Python discovery wrapper. Changed `strategy-research.js` only through opt-in exit/risk options, `historical-research.js`, the worker, station UI/styles, asset routes, packaging and source/public script includes. Default synthetic research behavior remains unchanged.

Tests cover aggregated partial proceeds/fees and unit conservation; ambiguous stop-first fills; long/short trailing activation on the next candle; wick-only activation rejection; future-data isolation; selection frozen before final data; risk cap; and practice-account isolation. Browser checks cover the SPY preset, empty template/plan exports, worker results, saved report reopening and desktop/mobile layout.
