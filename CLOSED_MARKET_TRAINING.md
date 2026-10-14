# Automatic closed-market research

Training Lab now has a **Practice strategy researcher**. It researches all ten teams independently of practice account trades, balances, profit brakes and LIVE execution. In automatic mode, a team outside its estimated session gets all eight fixed recipes evaluated on the final 96 candles, with matched control and cost stress. During its estimated session it continues the selected-recipe drill. Deep mode applies the full workload to every team at any time.

The selection still uses only the first 128 training and next 64 validation candles. Testing all recipes on the later sample collects evidence; it does not retrospectively change the selected recipe. Each recipe has its own repeated-sample scoreboard. Eight comparisons from one sample are not eight independent rounds. Scores preserve losses, fees, drawdown and the loss-review hypotheses. No strategy is automatically promoted, parameters are not automatically rewritten, and neither AI nor real market data is connected. More synthetic drills do not guarantee better market results.

## Schedule

`training-policy.js` uses timezone-aware estimates: stock core session weekdays 09:30–16:00 America/New_York; listed CME equity/Gold futures Sunday 17:00 through Friday 16:00 America/Chicago with weekday 16:00–17:00 breaks. Daylight saving follows the exchange timezone, not the device timezone. Sources: [NYSE hours](https://www.nyse.com/trade/hours-calendars), [CME Micro E-mini FAQ](https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html), [CME Gold contract hours](https://www.cmegroup.com/content/dam/cmegroup/market-regulation/files/gold-futures-and-options-fact-card.pdf).

Holidays, early closes, halts and provider availability are **unverified**. This is a research workload schedule, never an execution clock. Research continues during either estimated state, so an unknown holiday does not turn training off. Use Deep mode for full workload throughout an exceptional closure. A future verified market-calendar adapter should replace the estimates before they are used for anything beyond research scheduling.

Browser drills run every eight seconds when any team is on a deep shift, otherwise every fifteen seconds. Hidden tabs pause; closing the public GitHub Pages site stops browser research. No catch-up results are fabricated for time the app was off.

## Browser-independent local worker

Install Node.js LTS in addition to the existing Python setup, then use `START_WINDOWS.bat`. The supervisor starts `training_worker.py`, which invokes the same pure research engine through `training-worker.cjs`. The computer and runner must remain on. This works with the browser closed and while the practice account is paused. There is no hosted worker on GitHub Pages and no training while the computer is off.

The worker atomically saves `training_state.json`, `training_worker_status.json` and user controls in `training_control.json` inside `LAYLOW_DATA_DIR`. They are excluded from Git and the source download. Restart restores the last valid completed round. Errors preserve the previous state and report paused progress rather than starting over. Without Node, status explicitly reports NODE_REQUIRED and browser research remains available.

The local dashboard reads `/api/training`, shows its owner/heartbeat and disables duplicate browser drills when worker-owned history is displayed. Pause/Resume and Workload controls are token/origin protected through `/api/training/control`. Browser history remains separately retained; it is not merged into worker history or counted twice. Export research from the view you want to retain. A stopped or stale worker is labeled; the dashboard does not fabricate progress or silently start a second engine.

## Use

Enter **Training Lab** from a team office, council or vault. The night-shift station shows each team's estimated session and workload, completed recipe batches, deep rounds and the current owner. Pick a team under “Inspect strategy workload” to see all eight latest holdout/cost-stress comparisons and their lesson hypotheses. Watch the completed trade replay below. Pause/Resume, choose Auto or Deep, and export the complete research history.

The account ledger, broker router, deterministic risk engine and LIVE lock are unchanged. Independent real OHLC validation remains a required failed gate for every candidate. Results are synthetic research, not proof of financial improvement.
