import os
import subprocess
import sys
import time
from datetime import datetime, timezone

from config import STARTUP_PROCESSES, WATCHDOG_INTERVAL_SECONDS
from db_utils import ensure_system_tables
from event_logger import log_event

PROCESSES = {}


def start_process(target):
    print(f"[WATCHDOG] Starting {target}")
    proc = subprocess.Popen([sys.executable, target], cwd=os.getcwd())
    PROCESSES[target] = proc
    log_event("SYSTEM", "PROCESS_STARTED", f"Started {target}")
    return proc


def ensure_process(target):
    proc = PROCESSES.get(target)
    if proc is None or proc.poll() is not None:
        start_process(target)
        return True
    return False


def supervise():
    ensure_system_tables()
    for target in STARTUP_PROCESSES:
        ensure_process(target)

    while True:
        time.sleep(WATCHDOG_INTERVAL_SECONDS)
        for target in STARTUP_PROCESSES:
            proc = PROCESSES.get(target)
            if proc is None or proc.poll() is not None:
                print(f"[WATCHDOG] {target} is down. Restarting...")
                start_process(target)
                log_event(
                    "SYSTEM",
                    "PROCESS_RESTARTED",
                    f"Restarted {target} at {datetime.now(timezone.utc).isoformat()}",
                )


if __name__ == "__main__":
    print("[WATCHDOG] Runtime supervisor started")
    supervise()
