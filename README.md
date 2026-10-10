# Laylow Agency — ten teams and a manager hierarchy

Four stock teams (SPY, QQQ, AAPL, TSLA) and six independent futures watch teams (NQ1!, ES1!, MGC1!, MNQ1!, MES1!, GC1!). Each team has specialist rule bots, its own read-only Team Manager, and a report to the Big Manager. The dashboard shows observed state and recorded analysis; it never generates demo market quotes or profits.

## Start on Windows

1. Install Python 3.11 or newer.
2. Extract the download. GitHub's artifact ZIP contains a second ZIP; extract that too.
3. In the Laylow-Agency folder, double-click SETUP_WINDOWS.bat, then START_WINDOWS.bat.
4. Open http://127.0.0.1:5000. Keep the terminal open. Ctrl+C stops the supervisor and its children.

Credentials are intentionally blank. Default observe mode starts ten workers, the managers, the dashboard and the snapshot service without any provider requests or orders. CHECK_SETUP.bat checks prerequisites without printing secrets. Logs are under the configured data directory's logs folder.

## Configure later

Setup copies .env.example to .env only if no .env already exists. Fill in your own OPENAI_API_KEY, ALPACA_API_KEY and ALPACA_SECRET_KEY locally; these files are excluded from Git and the ZIP. Use Alpaca paper-account credentials. Restart after editing configuration.

- LAYLOW_MODE=observe: all workers report standby; no external requests.
- LAYLOW_MODE=analyze: stock minute-bar specialists and an OpenAI review; no orders. Futures read configured local CSV data only.
- LAYLOW_MODE=paper plus LAYLOW_ALLOW_PAPER_ORDERS=true: stock teams may submit Alpaca paper bracket orders after all entry checks. Futures remain watch-only in every mode.
- LAYLOW_MANAGER_AI=true: optional OpenAI text summary of team reports in analyze/paper mode. Default false. It cannot change deterministic severity, votes, controls, or orders.

Analyze/paper modes can incur OpenAI usage and require suitable Alpaca market-data access. Stock bars/quotes use IEX, whose volume is the IEX feed's volume, not consolidated market volume. No real provider accounts were used in the included tests. No live-money order mode is implemented.

## Specialist teams

| Team | Specialists | Required agreement | ATR stop multiplier |
| --- | --- | --- | --- |
| AAPL | Trend, VWAP, Momentum, Volume Confirmation | 2 of 4 | 1.25 |
| TSLA | Breakout, Momentum, Volume-Volatility, Trend | 3 of 4 | 1.75 |
| SPY, QQQ | Trend, VWAP, Momentum | 2 of 3 | 1.25 |
| NQ1!, MNQ1! | Trend, Momentum, Breakout | 2 of 3 | Watch only |
| ES1!, MES1! | Trend, VWAP, Momentum | 2 of 3 | Watch only |
| MGC1!, GC1! | Trend, Breakout, Mean Reversion | 2 of 3 | Watch only |

At least 35 validated OHLCV bars and 10 current-session bars are required. Source bars older than five minutes or with invalid timestamps/prices cannot produce an entry. ATR is the average of the last 14 true ranges. Trend compares EMA9/EMA21; momentum measures five bars; breakout compares the prior twenty-bar range. Stock VWAP uses the current regular Eastern session. Futures VWAP is explicitly a rolling 120-bar window.

Stocks additionally require relative volume >= 1, ATR/price <= 3%, and price within 2 ATR of session VWAP. RVOL compares the latest bar's volume to the prior twenty-bar mean. AI may veto or reduce risk; it cannot reverse or bypass the specialist consensus. Displayed confidence is a bounded formula score, not a probability of success. These thresholds are unvalidated strategy settings, and correlated specialist votes do not establish profitability.

## Earnings and headline controls

Each stock card has a manual headline lock; AAPL and TSLA also have a next earnings timestamp. Use an ISO timestamp including a timezone, such as 2026-11-01T21:00:00Z. Save only a date you have verified for that company. Unknown/invalid or expired earnings dates block AAPL/TSLA paper entries. Entries are locked from 24 hours before until 12 hours after the entered timestamp; after that, enter the next earnings date. ETF teams SPY/QQQ have no company earnings gate. Their manual headline locks still apply.

The headline lock blocks new entries until released. No automatic news or earnings feed is configured; a blank feed never means events were checked. Controls persist in SQLite. They do not cancel already submitted orders or close positions. Writes require a same-origin control token; the dashboard binds to loopback and rejects other Host headers.

## Stock paper limits

A fresh non-crossed quote (<=60 seconds old, <=1% spread), open market, tradable asset, short-borrow eligibility, current team enable flag, event clearance, and absence of an existing position/open order are required. The quote is refreshed before sizing and must still be within 2 ATR of VWAP.

Whole-share sizing uses the ATR stop distance, equity risk budget, buying power, and a notional cap. AAPL/SPY/QQQ risk budget is 0.5% of equity with a $1,000 cap. TSLA uses 0.25% and a $500 cap. REDUCE_RISK halves budget and cap. Account day loss >=5% blocks entries. Brackets attach an ATR stop and a target at twice that distance. Small budgets never force a one-share entry.

A unique local intent is saved before submission. Pending/uncertain outcomes block later entries until manually reconciled with Alpaca. Automated fill/P&L reconciliation is not implemented. A submitted order is never reported as realized profit.

## Futures data

Futures run as six separate processes and have no trading-client/order path. Set LAYLOW_FUTURES_CSV_DIR to a directory containing NQ.csv, ES.csv, MGC.csv, MNQ.csv, MES.csv and GC.csv. Relative paths resolve against the project. Your data exporter must atomically replace each CSV with validated current contract/continuous data that you identify yourself; this build does not connect a futures data vendor or infer rollover mappings.

CSV columns: timestamp,open,high,low,close,volume. Rows must be ascending and unique, with timezone-aware ISO timestamps, positive finite OHLC values and nonnegative finite volume. Limit 10,000 rows/5 MB per file. Missing files or invalid data are reported; stale data produces SKIP. No synthetic prices or full-size proxy prices are substituted for micro contracts.

## Managers and observed health

Ten Team Managers independently assess their team's heartbeat, votes, event controls and local order intent state. INFO/CAUTION/CRITICAL reports go to the Big Manager. A single manager process persists all eleven reports atomically every 30 seconds. Managers have no order authority. Optional AI summaries are visibly disabled, awaiting configuration, ready, or unavailable; they never override rule assessments.

The dashboard polls /api/status every five seconds, preserves unsaved event inputs, escapes provider text, and keeps the last snapshot with a connection-loss warning. It displays manager report timestamps so cached reports are not presented as current. /healthz checks SQLite readability, not provider connectivity.

A phone cannot reach a computer's localhost URL. A separate authenticated hosting arrangement is needed for phone access; it is not included. Opening index.html directly does not start Python.

## Reliability and packaging

One supervisor owns thirteen children: ten team processes, manager assessments, dashboard, and snapshot service. It uses bounded restart delays, independent logs, fresh process observations and controlled shutdown. Legacy launchers delegate to the same supervisor. LAYLOW_DATA_DIR selects where records/logs are saved; relative paths resolve against the project. Existing databases are migrated without deleting historical rows or conflating enabled flags with worker health.

Run python -m unittest discover -s tests -v after installing requirements. CI checks Windows/Linux Python 3.11/3.12, mocked provider/order boundaries, real credential-free startup/shutdown, and Chromium desktop/phone dashboard behavior. Run python package_build.py for dist/Laylow-Agency-improved.zip. Credentials, databases, logs, virtual environments, legacy sample backtests and fake performance generators are excluded from the runtime download.


## 3D city and robot offices

The city now includes ten teams and 32 specialist bots. MES1! and GC1! are separate
watch-only futures districts, reading MES.csv and GC.csv respectively. They follow
the same configuration and source-data rules as ES/MGC; no futures order client
exists.

The World view uses local WebGL geometry: rotate by dragging or using arrow keys,
zoom with the buttons, and reset the camera from its controls. Select a tower sign
to enter that team's office, or select a district in the dock and press Enter bot
office. Ambient lighting starts off; reduced-motion preferences and hidden tabs pause it.
The background market line uses the selected team's recorded closing prices only.
The office includes a seated robot with headphones, a market terminal,
signal scanner, performance terminal and recorded decision/order history. Choose
a specialist desk to inspect its vote and reasoning. Escape or Return to city
closes the office. If WebGL is unavailable, the accessible SVG map and all recorded
data panels remain available.

Market charts use up to 240 OHLCV bars saved with actual worker analysis. Close
prices and EMA lines use those bars; the VWAP reference is the latest recorded
strategy value. Missing bars remain empty. Offices label stale observations.
Payroll is team-level; the system does not invent separate specialist earnings.
Neither the city nor offices manufacture prices, fills, account equity or profits.

## Closed-trade imports and Payroll

Payroll and its daily bar chart are backed by imported, completed trades.
Order intents and model decisions never count as earnings. There is no automatic
broker fill reconciliation in this version. Export completeness and realized
PnL accounting must be supplied by the export producer.

Prepare a CSV with columns:
trade_id,team_name,closed_at,gross_pnl,fees

Use a stable source name identifying one account/export stream, then run:
python import_trade_records.py YOUR_EXPORT.csv --source YOUR_ACCOUNT_EXPORT --mode paper --as-of YOUR_COMPLETE_EXPORT_TIMESTAMP

closed_at and --as-of require ISO timestamps with timezone. gross_pnl is the
completed trade's realized USD amount before fees; fees must be supplied and
nonnegative. Dollar values allow at most two decimals. Use one stable source per
mode: alternate sources are rejected to prevent duplicate account totals.
Repeated unchanged trade IDs are idempotent; conflicting IDs reject the entire
batch. Older export coverage timestamps cannot replace newer ones. Imports must
contain completed trades through their declared as-of timestamp. The producer
must also import a complete empty export to confirm a zero-trade session.

Live exports can be retained separately with --mode live, but do not influence
the paper Payroll or paper profit brakes. Session days use America/New_York.
Payroll shows source, coverage time, freshness, net results after stated fees,
trades, wins/losses and up to 30 daily results. Account balance and open positions
are not inferred from these exports.

## Optional paper-entry profit brake

Each stock team's existing control card includes an optional USD net-profit target.
It starts disabled. Save a positive amount to arm it, or save an empty value to
disable it. This control uses the same local Host, Origin and CSRF restrictions.

With a brake configured, a complete paper export no older than 90 seconds is
required; missing/stale coverage blocks new paper entries. Reaching the target
latches the brake for the New York session day, including when later losses reduce
the net amount. Raising the target does not clear a same-day latch. The brake is
checked again inside the order-intent transaction. It never closes existing
positions, cancels broker orders or sends additional orders. Futures stay watch
only regardless of any export records. No target amount is preset.

## $50,000 browser practice session

Open `/?practice=1#practice` on the dashboard or public GitHub Pages site to start
or resume a simulated account with $50,000 in fake dollars. Ten market teams
evaluate generated candles; six deterministic Council personalities vote on
entries. The city, bot offices, payroll and account panels show this simulation.
This mode runs entirely in the browser and does not call a broker, send order
intents, use live market quotes or call an external AI service.

Pause or advance one simulated market minute, select 1x/5x/20x speed, close a fake
position, reset the account to $50,000, or export the session as JSON. Local
browser storage preserves the account; export keeps a copy for your records.
Leaving practice returns to the normal viewer. Different devices have separate
accounts. Updates pause when the tab is hidden.

Simulation assumptions include adverse one-tick slippage, $1 per stock fill or
$2 per futures contract fill, at most four positions, a $250 planned entry risk
budget, a $1,000 account loss brake and a $300 per-team realized profit brake.
Prices, fills and collateral requirements are fictional. Gaps can exceed the
planned stop risk. Completed trades include both entry and exit fees; open
positions reserve collateral and are marked to the generated candle close.
These results do not establish actual market performance.

Run the accounting, Council and risk-control checks with
`node tests/test_practice_engine.cjs`. Python HTTP tests verify both practice
scripts remain available without granting broker controls.

## Council
Six deterministic personalities debate the same evidence: Anchor protects capital, Proof requires broad support, Flux favors momentum, Rebel challenges extended or disputed entries, Steward reduces volatility exposure, and Sentinel enforces entry controls. Four of six must support proceeding. Hard gates cannot be outvoted; risk reduction halves the existing budget. These are explicit rule policies, not fine-tuned language models or profitability forecasts.

Current dashboard reviews are read-only. Worker deliberations separately record all opinions, source fingerprint, proposal ID, timestamp and policy version. Existing AI can veto or reduce but cannot reverse or increase council risk. Stock paper submissions verify fresh recorded approval, source identity and risk terms before broker requests and again before the intent write. Existing risk checks remain mandatory. Futures remain watch-only.
