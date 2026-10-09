# Laylow Agency — eight teams and a manager hierarchy

Four stock teams (SPY, QQQ, AAPL, TSLA) and four independent futures watch teams (NQ1!, ES1!, MGC1!, MNQ1!). Each team has specialist rule bots, its own read-only Team Manager, and a report to the Big Manager. The dashboard shows observed state and recorded analysis; it never generates demo market quotes or profits.

## Start on Windows

1. Install Python 3.11 or newer.
2. Extract the download. GitHub's artifact ZIP contains a second ZIP; extract that too.
3. In the Laylow-Agency folder, double-click SETUP_WINDOWS.bat, then START_WINDOWS.bat.
4. Open http://127.0.0.1:5000. Keep the terminal open. Ctrl+C stops the supervisor and its children.

Credentials are intentionally blank. Default observe mode starts eight workers, the managers, the dashboard and the snapshot service without any provider requests or orders. CHECK_SETUP.bat checks prerequisites without printing secrets. Logs are under the configured data directory's logs folder.

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
| ES1! | Trend, VWAP, Momentum | 2 of 3 | Watch only |
| MGC1! | Trend, Breakout, Mean Reversion | 2 of 3 | Watch only |

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

Futures run as four separate processes and have no trading-client/order path. Set LAYLOW_FUTURES_CSV_DIR to a directory containing NQ.csv, ES.csv, MGC.csv and MNQ.csv. Relative paths resolve against the project. Your data exporter must atomically replace each CSV with validated current contract/continuous data that you identify yourself; this build does not connect a futures data vendor or infer rollover mappings.

CSV columns: timestamp,open,high,low,close,volume. Rows must be ascending and unique, with timezone-aware ISO timestamps, positive finite OHLC values and nonnegative finite volume. Limit 10,000 rows/5 MB per file. Missing files or invalid data are reported; stale data produces SKIP. No synthetic prices or full-size proxy prices are substituted for micro contracts.

## Managers and observed health

Eight Team Managers independently assess their team's heartbeat, votes, event controls and local order intent state. INFO/CAUTION/CRITICAL reports go to the Big Manager. A single manager process persists all nine reports atomically every 30 seconds. Managers have no order authority. Optional AI summaries are visibly disabled, awaiting configuration, ready, or unavailable; they never override rule assessments.

The dashboard polls /api/status every five seconds, preserves unsaved event inputs, escapes provider text, and keeps the last snapshot with a connection-loss warning. It displays manager report timestamps so cached reports are not presented as current. /healthz checks SQLite readability, not provider connectivity.

A phone cannot reach a computer's localhost URL. A separate authenticated hosting arrangement is needed for phone access; it is not included. Opening index.html directly does not start Python.

## Reliability and packaging

One supervisor owns eleven children: eight team processes, manager assessments, dashboard, and snapshot service. It uses bounded restart delays, independent logs, fresh process observations and controlled shutdown. Legacy launchers delegate to the same supervisor. LAYLOW_DATA_DIR selects where records/logs are saved; relative paths resolve against the project. Existing databases are migrated without deleting historical rows or conflating enabled flags with worker health.

Run python -m unittest discover -s tests -v after installing requirements. CI checks Windows/Linux Python 3.11/3.12, mocked provider/order boundaries, real credential-free startup/shutdown, and Chromium desktop/phone dashboard behavior. Run python package_build.py for dist/Laylow-Agency-improved.zip. Credentials, databases, logs, virtual environments, legacy sample backtests and fake performance generators are excluded from the runtime download.


## Interactive agency city

The World view is a local SVG city inspired by the supplied neon tower references.
Eight team districts surround a gold Vault and purple Big Manager hub. There are
26 specialist robot characters and eight Team Manager characters. Select a tower
by click, tap, Enter or Space, or use the district dock. The inspector displays
the same recorded Python status, consensus, source-bar timestamp, ATR, relative
volume and manager report used by the team cards. Open team controls jumps to
that team's existing controls. On phones, swipe the city horizontally; the dock
also centers the selected district.

City lights are decoration. Bot eyes, report links and status labels use backend
observations. Stale analysis is labeled as recorded, and lost connections retain
the last snapshot while marking observations unconfirmed. The Vault counts recent
heartbeats; realized P&L remains **Not recorded** because this dashboard has no
broker balance or realized earnings ledger. Futures districts remain watch only.

Ambient motion starts off and can be enabled with the toolbar button. Operating
system reduced-motion preferences override it. The city uses no external fonts,
image services, market simulations or additional credentials.

After downloading an updated ZIP, extract it into a new folder and stop the old
runner before starting the new copy. Your already-open dashboard will show this
version only when the server serves the updated code. Copy any existing local
configuration yourself; downloadable packages keep all credential fields blank.
