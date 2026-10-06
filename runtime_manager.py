import time
from datetime import datetime, timezone

from config import TEAM_NAMES, REFRESH_SECONDS
from dashboard_status import save_dashboard_snapshot
from db_utils import ensure_system_tables
from event_logger import log_event
from monitoring import refresh_monitoring_cycle


def initialize_runtime():
    ensure_system_tables()
    for team_name in TEAM_NAMES:
        log_event(team_name, "RUNTIME_INIT", "Runtime manager initialized")
    return True


def refresh_runtime():
    save_dashboard_snapshot()
    states = refresh_monitoring_cycle()
    now = datetime.now(timezone.utc).isoformat()
    for team_name, state in states.items():
        log_event(team_name, "RUNTIME_REFRESH", f"state={state} @ {now}")
    return states


def main():
    initialize_runtime()
    print("[RUNTIME] Starting runtime manager...")
    while True:
        states = refresh_runtime()
        print("[RUNTIME] Status refresh completed")
        for team_name, state in states.items():
            print(f"  {team_name}: {state}")
        time.sleep(REFRESH_SECONDS)


if __name__ == "__main__":
    main()
