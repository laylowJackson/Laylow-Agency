"""Write snapshots of actual database state; workers own their health records."""
import signal
import threading
from config import DATA_DIR, REFRESH_SECONDS
from dashboard_status import save_dashboard_snapshot
from db_utils import ensure_system_tables


def refresh_runtime():
    return save_dashboard_snapshot(DATA_DIR / "dashboard_snapshot.json")


def main(stop_event=None):
    stop = stop_event if stop_event is not None else threading.Event()
    handlers = {}
    def request_stop(_signum, _frame):
        stop.set()
    ensure_system_tables()
    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            handlers[signum] = signal.signal(signum, request_stop)
    try:
        while not stop.is_set():
            try:
                refresh_runtime()
            except Exception as error:
                print("[RUNTIME] Snapshot unavailable: " + type(error).__name__, flush=True)
            stop.wait(REFRESH_SECONDS)
    except KeyboardInterrupt:
        stop.set()
    finally:
        for signum, handler in handlers.items():
            signal.signal(signum, handler)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
