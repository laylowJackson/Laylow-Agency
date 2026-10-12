"""Supervised, persistent research worker. No execution or broker dependencies."""
import json
import os
import shutil
import signal
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from config import DATA_DIR, ROOT_DIR


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data), encoding="utf-8")
    os.replace(temporary, path)


def read_control(directory):
    path = Path(directory) / "training_control.json"
    if not path.exists():
        return {"paused": False, "mode": "auto"}
    body = json.loads(path.read_text(encoding="utf-8"))
    if type(body.get("paused")) is not bool or body.get("mode") not in {"auto", "deep"}:
        raise ValueError("Invalid research control")
    return body


def cycle(directory=DATA_DIR, node=None, now=None):
    directory = Path(directory)
    control = read_control(directory)
    now = now or datetime.now(timezone.utc).isoformat()
    status = {"available": True, "updated_at": now, "mode": control["mode"],
              "paused": control["paused"], "source": "LOCAL SYNTHETIC RESEARCH WORKER", "live_locked": True}
    node = node or shutil.which("node")
    state_path = directory / "training_state.json"
    if not node:
        status.update(status="NODE_REQUIRED", message="Install Node.js LTS for browser-independent training. Browser research remains available.")
    elif control["paused"]:
        status.update(status="PAUSED", message="Local research worker paused by user.")
    else:
        saved = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else None
        result = subprocess.run([node, str(ROOT_DIR / "training-worker.cjs")],
                                input=json.dumps({"lab": saved, "now": now, "mode": control["mode"]}),
                                text=True, capture_output=True, timeout=45, check=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        data = json.loads(result.stdout)
        atomic_json(state_path, data["lab"])
        status.update(status="RUNNING", round=data["lab"]["round"], plan=data["plan"],
                      message="Training continues while this computer and the local runner are on.")
    atomic_json(directory / "training_worker_status.json", status)
    return status


def read_status(directory):
    directory = Path(directory)
    status_path = directory / "training_worker_status.json"
    if not status_path.exists():
        return {"available": False, "status": "NOT_STARTED"}
    body = json.loads(status_path.read_text(encoding="utf-8"))
    age = time.time() - datetime.fromisoformat(body["updated_at"]).timestamp()
    body["stale"] = age > 90 or age < -30
    state = directory / "training_state.json"
    if state.exists():
        body["lab"] = json.loads(state.read_text(encoding="utf-8"))
    return body


def main():
    stop = threading.Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda *_: stop.set())
    while not stop.is_set():
        try:
            state = cycle()
            interval = state.get("plan", {}).get("interval_ms", 15000) / 1000
        except Exception as error:
            # Preserve last valid research state; never silently reset or fabricate progress.
            atomic_json(DATA_DIR / "training_worker_status.json", {
                "available": True, "updated_at": datetime.now(timezone.utc).isoformat(),
                "status": "ERROR", "message": "Research paused: " + type(error).__name__, "live_locked": True})
            interval = 30
        stop.wait(interval)


if __name__ == "__main__":
    main()
