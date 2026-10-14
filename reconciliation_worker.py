"""Periodic paper-only broker reconciliation. Never submits or cancels orders."""
import logging
import signal
import threading
from execution_config import load_execution_settings, build_router
from execution_service import ExecutionService
from team_worker import load_settings


def main(stop_event=None):
    stop = stop_event or threading.Event()
    handlers = {}
    if threading.current_thread() is threading.main_thread():
        for signum in (signal.SIGINT, signal.SIGTERM):
            handlers[signum] = signal.signal(signum, lambda *_: stop.set())
    try:
        while not stop.is_set():
            try:
                execution = load_execution_settings()
                if execution["execution_mode"] == "PAPER":
                    # Reconciliation needs no AI key. Credential loading makes no requests.
                    settings = dict(load_settings(), **execution)
                    router = build_router(settings)
                    service = ExecutionService(router)
                    for adapter in router.adapters.values(): service.reconcile(adapter)
            except Exception as error:
                logging.error("Reconciliation unavailable (%s)", type(error).__name__)
            stop.wait(30)
    finally:
        for signum, previous in handlers.items(): signal.signal(signum, previous)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
