"""Compatibility monitor. Workers, not this module, own heartbeat state."""
import time
from db_utils import ensure_system_tables
from dashboard_status import build_dashboard_payload


def init_db():
    ensure_system_tables()


def main():
    init_db()
    try:
        while True:
            payload = build_dashboard_payload()
            for team in payload["teams"]:
                print(f"{team['name']}: {team['worker_state']} / {team['health']}")
            time.sleep(60)
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
