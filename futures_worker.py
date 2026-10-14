"""Independent futures watch workers reading explicitly configured OHLCV CSV files."""
import csv
import os
import logging
import signal
from pathlib import Path
from config import ROOT_DIR, FUTURES_TEAM_NAMES
from team_worker import TeamWorker, load_settings, team_enabled, utc_now
from db_utils import save_analysis
from specialist_engine import evaluate_team

CSV_NAMES = {"NQ1!": "NQ.csv", "ES1!": "ES.csv", "MGC1!": "MGC.csv", "MNQ1!": "MNQ.csv", "MES1!": "MES.csv", "GC1!": "GC.csv"}

def read_csv_bars(team_name, directory):
    root = Path(directory).expanduser()
    if not root.is_absolute():
        root = ROOT_DIR / root
    path = root / CSV_NAMES[team_name]
    if path.stat().st_size > 5_000_000:
        raise ValueError("Futures CSV exceeds 5 MB")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) > 10000:
        raise ValueError("Futures CSV exceeds 10000 bars")
    return rows

class FuturesWorker(TeamWorker):
    def __init__(self, symbol, db_path=None, settings_loader=load_settings, bars_loader=read_csv_bars):
        if symbol not in FUTURES_TEAM_NAMES:
            raise ValueError("Unknown futures team")
        # Reuse liveness/shutdown only; no Services or trading client is constructed.
        import threading
        self.symbol, self.db_path = symbol, db_path
        self.settings_loader, self.bars_loader = settings_loader, bars_loader
        self.stop_event, self.state_lock = threading.Event(), threading.Lock()
        self.state, self.notes = "STARTING", "Futures watch process starting"
        self.recorded_state = None

    def cycle(self):
        settings = self.settings_loader()
        if not team_enabled(self.symbol, self.db_path):
            self.report("DISABLED", "Futures team disabled")
            return
        if settings["mode"] == "observe":
            self.report("STANDBY", "Observe mode: worker alive; credentials/data can be added later; watch-only")
            return
        directory = os.getenv("LAYLOW_FUTURES_CSV_DIR", "").strip()
        if not directory:
            self.report("WAITING_CONFIGURATION", "Set LAYLOW_FUTURES_CSV_DIR; futures remain watch-only")
            return
        analysis = evaluate_team(self.symbol, self.bars_loader(self.symbol, directory), source="Configured futures CSV")
        save_analysis(self.symbol, analysis, self.db_path)
        from council import review_proposal
        review_proposal(self.symbol,analysis,settings["mode"],self.db_path,now=utc_now())
        self.report("WATCH_ONLY", analysis["direction"] + ": " + analysis["reason"])

def run_future(symbol):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    worker = FuturesWorker(symbol)
    def stop(_signal, _frame):
        worker.stop_event.set()
    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), stop)
    worker.run()
