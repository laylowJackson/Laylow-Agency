# Laylow Agency â€” ten teams and a manager hierarchy

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
- LAYLOW_MODE=paper permits execution evaluation. Actual paper submissions additionally require LAYLOW_EXECUTION_MODE=PAPER, LAYLOW_SHADOW_MODE=false and LAYLOW_ALLOW_PAPER_ORDERS=true. Defaults remain local PRACTICE and shadow only. Futures remain watch-only.
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

A deterministic, account-scoped local intent is saved before submission. The central executor tracks broker statuses and partial fills with an append-only history. Pending/uncertain outcomes block entries until reconciliation confirms the order. Closed-trade realized P&L still requires the recorded-trade importer; an entry fill is never reported as realized profit.

## Futures data

Futures run as six separate processes and have no trading-client/order path. Set LAYLOW_FUTURES_CSV_DIR to a directory containing NQ.csv, ES.csv, MGC.csv, MNQ.csv, MES.csv and GC.csv. Relative paths resolve against the project. Your data exporter must atomically replace each CSV with validated current contract/continuous data that you identify yourself; this build does not connect a futures data vendor or infer rollover mappings.

CSV columns: timestamp,open,high,low,close,volume. Rows must be ascending and unique, with timezone-aware ISO timestamps, positive finite OHLC values and nonnegative finite volume. Limit 10,000 rows/5 MB per file. Missing files or invalid data are reported; stale data produces SKIP. No synthetic prices or full-size proxy prices are substituted for micro contracts.

## Managers and observed health

Ten Team Managers independently assess their team's heartbeat, votes, event controls and local order intent state. INFO/CAUTION/CRITICAL reports go to the Big Manager. A single manager process persists all eleven reports atomically every 30 seconds. Managers have no order authority. Optional AI summaries are visibly disabled, awaiting configuration, ready, or unavailable; they never override rule assessments.

The dashboard polls /api/status every five seconds, preserves unsaved event inputs, escapes provider text, and keeps the last snapshot with a connection-loss warning. It displays manager report timestamps so cached reports are not presented as current. /healthz checks SQLite readability, not provider connectivity.

A phone cannot reach a computer's localhost URL. A separate authenticated hosting arrangement is needed for phone access; it is not included. Opening index.html directly does not start Python.

## Reliability and packaging

One supervisor owns fifteen children: ten team processes, manager assessments, dashboard, snapshot service, a read-only reconciliation worker, and an isolated research worker. It uses bounded restart delays, independent logs, fresh process observations and controlled shutdown. Legacy launchers delegate to the same supervisor. LAYLOW_DATA_DIR selects where records/logs are saved; relative paths resolve against the project. Existing databases are migrated without deleting historical rows or conflating enabled flags with worker health.

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
Click the Council building, its floating entrance sign, or Council in the top
navigation to enter the full Council room. Six named seats let you focus on an
individual robot and read its current risk opinion. Drag the room or use arrow
keys to orbit, and use Reset chamber view to return to the full table. Return to
city or Escape exits the room. A direct `#council-room` link enters the interior.
Opinions and seat controls remain available when WebGL is unavailable.

Six deterministic personalities debate the same evidence: Anchor protects capital, Proof requires broad support, Flux favors momentum, Rebel challenges extended or disputed entries, Steward reduces volatility exposure, and Sentinel enforces entry controls. Four of six must support proceeding. Hard gates cannot be outvoted; risk reduction halves the existing budget. These are explicit rule policies, not fine-tuned language models or profitability forecasts.

Current dashboard reviews are read-only. Worker deliberations separately record all opinions, source fingerprint, proposal ID, timestamp and policy version. Existing AI can veto or reduce but cannot reverse or increase council risk. Stock paper submissions verify fresh recorded approval, source identity and risk terms before broker requests and again before the intent write. Existing risk checks remain mandatory. Futures remain watch-only.


### Immersive rooms and outcome reviews

Click a district to enter its bot office, The Council for its chamber, or The Vault
for results and team learning. Camera buttons provide whole-room, desk/table and
screen/evidence-wall views. Drag or use arrow keys to orbit. Council speech bubbles
show current source opinions; the office bubble follows the selected specialist.
Physical monitors display the same snapshot as the detailed terminals below them.

The Vault calculates wins, losses, break-even counts, win/loss ratio and win rate
from closed-trade ledger counts. Practice reviews retain entry indicators and explain
the observed price move, exit rule and fees for each outcome. These are observations,
not proven causes. Learning is deterministic, bounded practice-rule adaptation:
after five decisive outcomes in the last twelve trades, a win rate below 40% reduces
planned risk to 65% and requires an extra specialist vote; below 50% uses 85% risk.
Winning samples may restore the baseline $250 cap, never exceed it. Losing closes
use a five-minute cooldown; other closes use three. Learning is derived from saved
trade records and resets with the $50,000 account. It does not modify real broker
execution or claim that an external AI model has been trained.

Live market data is **not connected** in the public practice app. Prices and fills
remain synthetic until a broker/data provider is configured. Rooms and Vault show
this status explicitly. Do not interpret practice timestamps as current quotes.

### Game rooms and independent night school
Open a building to enter its command suite. Camera presets, terminal hotspots,
speech bubbles, Clear room view and optional Room effects are available in offices
and the Council. Every room links to the Strategy training lab (`#training`).

The research lab runs all ten teams every eight seconds when a deep shift is active, otherwise every fifteen seconds. Auto workload tests every recipe for a team outside its estimated exchange session; Deep workload applies it to every team. It continues when the independent $50,000 account is finished or braked. Eight fixed recipes, six regimes, chronological selection and untouched holdouts provide separate recipe evidence. No account rules, risk or orders change. Hypothetical budgets remain $125 stocks/micros and $1,500 full-size contracts.

Browser research is saved separately and can be exported. Public-site hidden tabs pause and closing the browser stops it. START_WINDOWS with Node.js LTS runs a persistent local research worker while the computer/runner are on; cross-device or computer-off training still needs hosting. Session hours are estimates, not a verified holiday/halts calendar or execution clock. These are synthetic experiments, not verified trading performance or neural-model training. See [CLOSED_MARKET_TRAINING.md](CLOSED_MARKET_TRAINING.md).

### Shared team offices
Each district now houses its team manager and all configured specialists in one
room. Select a robot's floating label, roster card or teammate menu to inspect its
opinion and focus its workstation. Whole room restores the shared office view.
The ten interiors have separate floor plans, furniture and architectural themes:
emerald boardroom, aurora loft, glass studio, engineering garage, orbital command
center, walnut exchange, garden lab, cyber lab, strategy arena and bullion office.
Physical monitors use the same evidence as the dashboard; results remain team-level
because specialist earnings are not separately recorded. Without WebGL, the full
teammate roster and evidence panels remain available. No trade logic was changed.


## Broker-neutral execution and hard LIVE lock

All stock workers submit proposals through `ExecutionService`, `RiskEngine`, and
`BrokerRouter`. The teams do not import a trading SDK or call a raw broker client.
The only SDK order builder is in `broker_alpaca.py`. Register a new implementation
of `BrokerAdapter` and explicit `(mode, symbol)` routes to replace a stock broker;
ambiguous, missing, unsupported futures and cross-mode routes fail closed.
No automatic broker failover is allowed for an unresolved order.

Execution modes are independent of the legacy observe/analyze/paper assessment
workflow:

| Mode | Behavior |
| --- | --- |
| PRACTICE | Durable local fake account, starting at $50,000. No external broker. |
| PAPER | Alpaca stock paper adapter, with the paper endpoint fixed in code. |
| LIVE | Recognized but always raises `LiveLockedError`; no implementation, credential, endpoint override or `.env` switch unlocks it. |

`LAYLOW_SHADOW_MODE=true` is the default. A successful shadow evaluation records
quantity, reference entry, stop, target, estimated risk, notional, route, account,
signal timestamp and policy version but never calls the adapter submit or order
lookup methods. PAPER shadow evaluation uses **read-only** broker account/quote
requests. PRACTICE shadow uses local quotes. Shadow and submission IDs are separate;
each submission is re-evaluated, never executed from a cached shadow plan.
`LAYLOW_MODE=analyze` always forces shadow regardless of execution configuration.

The central policy checks saved council authorization/evidence, team enablement,
manual event/earnings/profit locks, account block flags, daily equity loss >=5%,
maximum four distinct held/pending symbols, duplicate positions/open orders/local
reservations, unresolved broker outcomes, twenty account attempts and ten team
attempts per Eastern calendar day, source age <=300 seconds, quote age <=60 seconds,
snapshot age <=30 seconds, spread <=1%, short eligibility, VWAP extension, rounded
stop/target geometry and whole-share affordability. These limits are per routed
broker account, shared across all its teams. A second account has its own limits;
this is not a consolidated multi-account risk calculation.

Sizing preserves the stock risk budgets and notional caps above, adding a 1%
adverse entry allowance. The final account and quote are fetched again, policy and
saved controls rechecked, and the final plan committed before submission. These
are exact planned terms, **not guaranteed fill prices or maximum realized losses**.
The conservative allowance is a fixed policy, not a proven slippage model.

`order_intents` holds immutable proposal identity and risk outcomes.
`order_status_history` records RESERVED -> SUBMITTING -> broker status, including
partial fill quantities/prices. IDs hash mode, broker, account and stable proposal
ID. Changed proposal terms under the same ID are rejected. SQLite writer
transactions reserve buying power and position capacity across worker processes.
The old `paper_orders` table remains a projection for managers and dashboard
compatibility; older unresolved intents remain blocked instead of being erased.

The supervised reconciler polls every thirty seconds when PAPER is configured.
It reads broker orders by client ID and compares local terms/status, open orders
and account positions, saving discrepancies and an account inventory. It never
submits, cancels or infers realized P&L. Untracked orders or missing/invalid broker
responses hold new entries for review. An uncertain submission is never blindly
retried, even if a lookup later returns not-found. Restarts adopt confirmed matching
orders without another submit. Keep the SQLite database when restarting or moving
the service: the broker ID alone cannot recover a lost proposal log.

Inspect `GET /api/execution` on the local backend for plans, risk reasons, history,
reconciliation and the LIVE lock. It is read-only and retains loopback Host checks;
there is no public order-submission HTTP route. Team Managers and the Big Manager
still have read-only reports. AI review can veto/reduce a proposal, but has no raw
broker tool and cannot override the central policy.

### Try it now without accounts or credentials

Run `python execution_bot.py` for a fully offline synthetic SPY shadow plan.
Run `python execution_bot.py --submit-practice` to record one fake local fill.
Repeating the same decision ID recovers that fill, rather than creating another.
Use `--db path/to/separate-demo.db` to keep this walkthrough separate from your
worker database. Neither command sends external requests or real orders.

The Python fake account is separate from the browser's saved $50,000 city session.
The minimal local adapter records entry fills and marks positions; it does not
emulate exchange exit fills, fees, or strategy improvement. Use the existing
browser practice simulator for that experience. GitHub Pages cannot run Python:
the public city remains a synthetic practice viewer until a backend is hosted.

Adapter contract references: [Alpaca Python order API](https://alpaca.markets/sdks/python/api_reference/trading/orders.html)
and [client order ID lookup](https://docs.alpaca.markets/us/reference/getorderbyclientorderid).
Tests use local fixtures only; no actual broker account was connected or tested.

### Team trading walls

Enter any district office and click **Trade wall** for a panoramic physical wall
with candlesticks, timestamped entry/exit markers and that team's trade ledger.
The readable display beneath the room lists side, quantity, entry, exit, net after
fees and exit reason. The table also works without WebGL. Return to **Whole room**
to inspect the team's robots again.

Practice walls use the saved browser simulation, including open fake positions;
they do not change its balance or trades. Recorded mode uses imported closed-trade
results and keeps order intents separate. Missing fill details remain blank, and
markers outside the chart's price/time window are omitted. Net results exclude
open positions. The public site still uses generated market prices, not live quotes.


The Council is now a dedicated interior: click its city building or the Council
navigation link to enter directly. It stays inside the room when closed, so there
is no Council preview to scroll through below the map. Both `#council` and
`#council-room` links open it. Escape or Return to city takes you back to the map.

Interiors include layered foundations, inset floor paths, acoustic wall panels,
recessed lighting, furnished lounges, ergonomic desks and detailed headset robots.
The ten district themes remain distinct, and every team still shares one office.
Council opinion cards and recorded deliberations expand from the room archive.


### Settings and broker setup

Open **Settings** in the navigation to adjust speech bubbles, room effects, city motion and panel text, open practice controls and the training lab, or export the fake-money session. Display preferences stay on the current device. Practice prices and fills are synthetic until a data provider is connected.

The GitHub Pages viewer disables broker key entry. For secure setup, download the source from this branch, run `SETUP_WINDOWS.bat`, then `START_WINDOWS.bat` and open the loopback dashboard. Settings enables key entry only after the local server responds. The supported adapter is Alpaca stocks in paper mode. Save both credentials into the ignored `.env.local` file, then restart the app. Credentials are never returned by the API or saved in browser storage. This file contains plaintext credentials on your computer, so protect the computer account and never share the file. Removing local credentials clears only their `.env.local` entries; separately configured environment keys must be removed at their source.

Saving credentials does not change analysis/execution modes, verify account connectivity or submit orders. PRACTICE and shadow defaults remain in place. LIVE stays hard locked in code. Risk limits are shown read-only; brokers and AI managers cannot bypass the central risk engine. Futures backend teams remain watch-only.

A Codex follow-up in this chat checks for useful bug fixes and improvements every other Saturday at 10 AM America/Chicago. It requires the Codex automation to run with project access; the website itself does not schedule or perform code updates.


### Game-style team offices and Council chamber

Rooms open directly into a large playable cutaway view. Each team shares a furnished district office with colored workstation islands, rounded dual-monitor desks, expressive headset robots, a lounge and a coffee counter. Ten district themes retain their distinct centerpieces, including the Tesla engineering prototype, orbital command pedestal, garden and gold display. Heads face the visitor in the wide office view; desk and monitor cameras remain available.

The Council has a teal-felt brass table, wood-grain floor, skyline windows, personal tablets, a central miniature agency and a sculptural chandelier. Select seats to see their opinions; on small screens only the selected member's full speech appears, with name tags for the other members. Materials use procedural detail and contact shading. Smaller city robot meshes limit rendering cost. The same evidence model still drives the physical trade walls and readable ledger. No market-data, broker or account behavior changes are introduced by the design.


### Screenshot Lab and Trade Review Wall — AI connection deferred

Open **Screenshot Lab** in navigation, or enter any team office, open its Trade
Wall and choose **Review screenshot** on a recorded trade. A dedicated review
room opens immediately. No image yet displays **NO SCREENSHOT REVIEW SAVED**.
Upload an entry chart plus optional context and additional images (PNG/JPG/WEBP,
8 MB and 30 million pixels each). Choose a chart tab, then use the annotation
tools to draw price levels, zones, arrows, labels, or the entry cutoff. Enter
supported values and observations, prepare the visual review and save it. Saved
cards reopen reviews. Export annotated PNG, structured JSON, or a compact card.

AI is deliberately disconnected. Preparation does not detect candles, prices,
patterns or outcomes. Unknown extraction fields remain null and confidence is
zero; all manual marks are visual estimates. Original extraction and editable
corrections are separate. A verified checkbox means user verification only.
An outcome requires supporting evidence. No money P&L is inferred from pixels.
Extraction (`screenshot_analysis.extraction_layer`) and explicit strategy rule
evaluation (`strategy_layer`) are separate. Only observations identified by the
user as pre-entry can satisfy entry rules. Tags alone do not prove a strategy.
Future provider integration belongs exclusively in the backend extraction layer;
no API key or model call is present in this module.

Public GitHub Pages stores review records, original image blobs and editable
annotations privately in IndexedDB on this browser/device. Export copies before
clearing browser data. Saving does not upload images to GitHub. The local Flask
app instead receives and validates images, strips EXIF, saves originals and
annotated outputs under ignored `screenshot_reviews/originals` and `annotated`
directories, and persists records in the `screenshot_reviews` SQLite table.
Writes require the local CSRF token and same origin. The existing localhost-only
server restriction remains. No hosted AI/server storage or cross-device sync is
available on Pages.

Links include trade ID, source, execution mode and team. Practice links include
the session base time so reset ID reuse cannot attach an old review to a new
trade. Reviews are attached as independent records; they never edit fills,
broker order history, risk decisions or account balances. Past journal trades
can supply an external ID plus record source. Review status is a user workflow
label, not an execution approval. Replacing screenshots starts a new review to
preserve the earlier raw extraction. Original screenshots can always be reopened;
annotated exports are rendered from saved marks.

### Watch training and compare evidence

**Training** opens completed synthetic drill replay, with a team selector,
play/pause and candle scrubber. Entry/exit markers and trade-by-trade reasons are
revealed as playback progresses. Research v2 compares eight fixed recipes,
including trend pullback/rejection, breakout retest, and range-edge rejection,
across six synthetic regimes. Each drill uses 128 training candles, 64 validation
candles and 96 untouched test candles. Entries fill at the next open; OHLC wicks
trigger stops/targets, ambiguous bars use stop-first, and gap losses, costs and
open-position drawdown are recorded. The selected recipe and matched control
are retested with three-tick slippage and double fees. Each exact recipe has its
own sample, regime and evidence gates; no automatic promotion occurs.

The **Strategy evidence station** shows gate progress, regime results and a bot
review queue for stops, weak follow-through, costs and successful targets. These
are research hypotheses, not definitive causes or neural-network training.
The latest drill, export and scorecards survive reload. Previous model totals
remain in an explicit legacy summary and are excluded from v2 gates. See
[STRATEGY_RESEARCH.md](STRATEGY_RESEARCH.md) for the full rules, costs, limitations
and tests. There is no connected live feed or independent historical-market
validation yet. These are synthetic OHLC experiments, not backtests of
screenshots or validated live-market results. Training runs while this page is
open and visible on GitHub Pages. The local Node worker continues while the computer/runner are on; cross-device or computer-off training needs hosting.

The Vault now also shows average win/loss, profit factor and average closed net
result. Recorded mode may contain only a partial imported ledger, labeled as
such. A 1.4:1 win/loss count ratio alone does not establish strategy quality.
Candidate comparisons do not guarantee improvement, promote live strategies,
raise risk or rewrite recorded results. Practice remains fake money and LIVE
remains hard locked.

Added frontend: `screenshot-lab.js`, `screenshot-lab.css`, `training-theater.js`.
Added backend: `screenshot_analysis.py`, `screenshot_reviews.py`.
Updated: `index.html`, `dashboard.py`, `requirements.txt`, `.gitignore`,
`package_build.py`, `training-engine.js`, `training-ui.js`, `world-3d.js`,
`team-offices.js`, tests and this README. Office/Council graphics now include
cached soft shadows, panoramic skyline windows and more detailed architecture.

## Automatic closed-market training

The Practice strategy researcher now tests all eight recipes for teams outside their estimated exchange session. Choose Auto or Deep in Training Lab, inspect per-team net/cost-stress results and watch completed trade replays. Every recipe retains its own evidence; no automatic promotion or account-risk changes occur. Install Node.js LTS and run START_WINDOWS for browser-independent local research; keep the computer/runner on. GitHub Pages still needs an open visible page. See [CLOSED_MARKET_TRAINING.md](CLOSED_MARKET_TRAINING.md) for schedule limitations, persistence and controls.
# Research evidence and historical candle files

The existing Training lab now includes a source-backed bot playbook, win-rate sample uncertainty, net expectancy and next-test priorities. It also accepts user-supplied standard OHLC CSV files for chronological selection/validation/final-test comparisons and adverse-cost runs. Results stay separate from the practice ledger, and neither imported nor generated tests authorize promotion or trading. AI and broker setup remain deferred.

See [BOT_RESEARCH_EVIDENCE.md](BOT_RESEARCH_EVIDENCE.md) for file format, local saving/export, model assumptions and limitations. Automatic nightshift training still uses generated candles; historical-file testing is manual until a verified provider is connected.

