"""Shared paths and timings. Importing configuration never starts workers or clients."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env.local", override=False)
load_dotenv(ROOT_DIR / ".env", override=False)
_data_setting = os.getenv("LAYLOW_DATA_DIR", "").strip()
DATA_DIR = Path(_data_setting).expanduser() if _data_setting else ROOT_DIR
if not DATA_DIR.is_absolute():
    DATA_DIR = ROOT_DIR / DATA_DIR
DATA_DIR = DATA_DIR.resolve()
DB_PATH = str(DATA_DIR / "team_status.db")
LOG_DIR = DATA_DIR / "logs"
STOCK_TEAM_NAMES = ["SPY", "QQQ", "AAPL", "TSLA"]
FUTURES_TEAM_NAMES = ["NQ1!", "ES1!", "MGC1!", "MNQ1!", "MES1!", "GC1!"]
TEAM_NAMES = STOCK_TEAM_NAMES + FUTURES_TEAM_NAMES
REFRESH_SECONDS = 300
HEARTBEAT_SECONDS = 30
HEARTBEAT_STALE_SECONDS = 90
_host_setting = os.getenv("LAYLOW_DASHBOARD_HOST", "127.0.0.1").strip()
DASHBOARD_HOST = _host_setting if _host_setting in {"127.0.0.1", "localhost", "::1"} else "127.0.0.1"
try:
    DASHBOARD_PORT = int(os.getenv("LAYLOW_DASHBOARD_PORT", "5000"))
    if not 1 <= DASHBOARD_PORT <= 65535:
        raise ValueError("Invalid port")
except ValueError:
    DASHBOARD_PORT = 5000
_mode_setting = os.getenv("LAYLOW_MODE", "observe").strip().lower()
LAYLOW_MODE = _mode_setting if _mode_setting in {"observe", "analyze", "paper"} else "observe"
WATCHDOG_INTERVAL_SECONDS = 2
STARTUP_PROCESSES = [
    "live_practice_worker.py",
    "dashboard.py", "runtime_manager.py", "manager_worker.py", "reconciliation_worker.py", "training_worker.py",
    "teams/spy_team.py", "teams/qqq_team.py",
    "teams/aapl_team.py", "teams/tsla_team.py",
    "teams/nq_team.py", "teams/es_team.py", "teams/mgc_team.py", "teams/mnq_team.py", "teams/mes_team.py", "teams/gc_team.py",
]
