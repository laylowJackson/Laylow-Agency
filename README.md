# Laylow Agency

Four stock workers (AAPL, TSLA, SPY and QQQ), one process supervisor, and a dashboard that reads their actual heartbeats from SQLite.

## Windows setup

1. Install Python 3.11 or newer.
2. Extract the ZIP, open the Laylow-Agency folder, and double-click SETUP_WINDOWS.bat.
3. Double-click START_WINDOWS.bat.
4. Open http://127.0.0.1:5000 in a browser.

Keep the terminal open while using the dashboard. Press Ctrl+C there to stop the supervisor and its children. Logs are saved under the configured data directory's logs folder. CHECK_SETUP.bat reports configuration presence without revealing credential values.

The app starts in **observe** mode with blank credentials. The four actual Python processes report **Standby** and heartbeat independently every 30 seconds. Observe mode makes no OpenAI or Alpaca calls and submits no orders. A healthy heartbeat means the worker process can report status; it does not mean a trading strategy is profitable.

## Add your keys later

Setup copies .env.example to .env only when .env does not already exist. Open your local .env and fill in OPENAI_API_KEY, ALPACA_API_KEY and ALPACA_SECRET_KEY. Keep this file private; it is excluded from Git and the download archive.

- LAYLOW_MODE=observe: process monitoring only.
- LAYLOW_MODE=analyze: current Alpaca IEX quotes and OpenAI analysis; no orders.
- LAYLOW_MODE=paper plus LAYLOW_ALLOW_PAPER_ORDERS=true: opt-in Alpaca **paper** bracket orders.

Restart the app after configuration changes. Analyze and paper modes make provider requests and can incur OpenAI API usage. No live-money broker mode is implemented. Use paper-account Alpaca credentials.

AI output must contain an exact allowed direction and action. SKIP blocks submission; REDUCE_RISK lowers sizing. A fresh, valid quote, open market, tradable asset, account limits, team enable flag, and absence of an existing position/open order are required. Whole-share entries are capped at $1,000 notional and sized against a 2% stop distance. Bracket exit prices are attached to the broker request. These controls are implementation limits, not validated investment results.

A paper intent is saved before submission with a unique client ID. Uncertain submissions block later local intents for that symbol. Reconcile them with Alpaca before changing the ledger. Submitted orders are not reported as realized profit; automated fill/P&L reconciliation is not implemented.

## Dashboard

The dashboard displays worker state, heartbeat freshness, process IDs, supervisor exits/restarts, and recorded events. It polls the same-origin /api/status every five seconds. Missing/stale data and a lost connection are explicit. /healthz checks database availability, not broker connectivity.

The server binds to 127.0.0.1 by default. A phone cannot reach the computer's localhost URL. A separately configured authenticated host/tunnel is required for remote access; it is not included in this download. Opening index.html directly does not start Python bots.

## Reliability and data

Only one supervisor may run per configured data directory. It starts the four workers, dashboard and snapshot service directly, with bounded restart delays and shutdown cleanup. Legacy watchdog/orchestrator/auto-restart entry points delegate to the same owner.

LAYLOW_DATA_DIR optionally selects a data directory. Relative paths resolve against the project folder. By default the existing team_status.db beside the code is reused. Schema upgrades retain old rows, including duplicates, and select a deterministic latest row for old control/score tables. Worker health is separate from historical enabled/disabled flags.

Sample backtests remain in the repository for reference and are excluded from normal startup and the ZIP. Legacy scoring/controller entry points now show read-only status; they cannot disable teams based on worker counts or fabricated scores. Random results are never used as broker-account profits or permission for live trading. The standalone legacy strategy/execution entry points route to the supervised workers instead of repeatedly submitting the same old decision.

## Checks and packaging

Run python -m unittest discover -s tests -v after installing requirements. These checks use fixtures and mock providers; no credentials are required and no external orders are submitted. CI checks Windows and Linux on Python 3.11 and 3.12, and Chromium checks desktop/mobile dashboard behavior.

Run python package_build.py to produce dist/Laylow-Agency-improved.zip. The ZIP excludes credentials, databases, logs and the virtual environment. GitHub Actions also provides the ZIP as a workflow artifact.
