# Paper-testing progress and remaining evidence

Real-money LIVE remains hard locked. This release improves engineering readiness;
it does not certify profitable trading or completed broker testing.

## 1. Real data connection

Save Alpaca paper keys locally in Settings. Start background practice and inspect
its provider status, timestamp and source. NOT_CONFIGURED means no keys; LIVE
requires an open provider market clock and fresh observed prices for all four
stocks. A closed-market response can verify API access but does not establish an
active-session feed. Futures remain disconnected. Never paste keys in chat.

## 2. Strategy evidence

The server review reports sample size, wins/losses/flat trades, win rate, net
profit after modeled costs, expectancy, profit factor and drawdown. It explicitly
keeps strategy_edge_verified=false. No percentage target or minimum trade count
alone makes a strategy ready for real money. Capture observations across different
sessions, track strategies separately, freeze candidate rules, and use untouched
chronological holdout OHLC data through the existing research tools. The existing
retrospective SPY comparison did not establish an improvement. Provider provenance
and forward paper results remain unverified; a new data connection is not evidence
that the prior candidate passed its holdout evaluation.

Once connected, the worker accumulates completed observed IEX minute bars in a
separate SQLite archive, deduplicated by symbol and timestamp. The four CSV links
export accumulated OHLC chronologically for the existing research tools. Empty
exports mean no observations, not a zero-return backtest. Provider revisions can
update archived candles. Missing sessions are not filled with synthetic bars;
this growing single-exchange sample is not a complete historical dataset.

## 3. Browser-independent fake trading

On Windows install Node.js LTS if `node --version` is unavailable, then run
SETUP_WINDOWS.bat and START_WINDOWS.bat. The prepared Linux container includes
Node. The supervisor starts
live_practice_worker.py and the existing training worker. In the dashboard scroll
to Background live-price practice and click Start background practice. Select
View server teams in city to inspect the server ledger. You can close the browser:
the server worker keeps polling every 15 seconds while its machine remains on.
GitHub Pages cannot run this worker. Pause stops position monitoring too.

Server practice starts a separate $50,000 account; it does not import browser
localStorage. State is persisted atomically in the configured data directory.
Restarts restore the ledger, require fresh observations, and do not trade old
warm-up bars. Invalid checkpoints stop the worker instead of resetting money.
The UI marks stale/error workers and never generates a fallback price. There is
no remote server deployment yet. Local windows operation is sufficient to test.

This worker runs the existing fake execution model, not Alpaca's paper broker.
It uses the practice engine's limits. The production deterministic risk engine
has separate fixture tests; this fake ledger must not be represented as its
broker integration test. Polled last-trade fills can miss price crossings and
do not establish liquidity, actual fills, borrow availability or profitability.

## 4. Broker execution evidence

Existing ExecutionService tests exercise deterministic IDs, intent-before-submit,
duplicate prevention, uncertain submissions, restart recovery, reconciliation,
shared limits, stale signals, stops/targets, locks and the LIVE prohibition with
fixture adapters. Fixtures are not real Alpaca executions. Actual end-to-end
paper testing needs saved paper credentials and an open session, followed by
explicitly enabling paper submissions. Background practice never enables that.

Before any real-money discussion, record actual paper order IDs, fills/partials,
rejections/cancellations, independent broker reconciliation, intentional restart
tests and disconnect behavior. Keep the same frozen strategy through evaluation.
No automatic strategy promotion or LIVE unlock is implemented.
