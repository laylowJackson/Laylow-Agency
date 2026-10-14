"""One process owner for the dashboard and workers."""
import os
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from config import DATA_DIR, LOG_DIR, ROOT_DIR, STARTUP_PROCESSES, WATCHDOG_INTERVAL_SECONDS
from db_utils import ensure_system_tables, upsert_process_status


class AlreadyRunningError(RuntimeError):
    pass


class InstanceLock:
    """OS lock. Keeping its inode after release prevents multiple Unix owners."""
    def __init__(self, path):
        self.path = Path(path)
        self.file = None

    @staticmethod
    def acquire(file):
        file.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def release(file):
        file.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(file.fileno(), fcntl.LOCK_UN)

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+b")
        try:
            self.file.seek(0)
            if not self.file.read(1):
                self.file.write(b"0")
                self.file.flush()
            self.acquire(self.file)
        except OSError as error:
            self.file.close()
            self.file = None
            raise AlreadyRunningError("Another supervisor owns this data directory.") from error
        except BaseException:
            self.file.close()
            self.file = None
            raise
        return self

    def __exit__(self, *_):
        if self.file is not None:
            try:
                self.release(self.file)
            finally:
                self.file.close()
                self.file = None


@dataclass
class Child:
    target: str
    command: list
    process: object = None
    log: object = None
    pid: object = None
    exit_code: object = None
    restarts: int = 0
    next_start: object = None
    exhausted: bool = False
    reported_status: str = ""
    last_recorded: float = 0.0


class Supervisor:
    def __init__(self, targets=None, root_dir=ROOT_DIR, log_dir=LOG_DIR,
                 poll_seconds=WATCHDOG_INTERVAL_SECONDS, max_restarts=5, stop_event=None):
        self.root = Path(root_dir).resolve()
        self.log_dir = Path(log_dir).resolve()
        self.stop = stop_event if stop_event is not None else threading.Event()
        self.poll_seconds = max(0.1, float(poll_seconds))
        self.max_restarts = max(0, int(max_restarts))
        targets = list(STARTUP_PROCESSES if targets is None else targets)
        if not targets:
            raise ValueError("At least one service must be configured.")
        self.children = []
        seen = set()
        forbidden = {
            os.path.normcase(str((self.root / name).resolve()))
            for name in ("watchdog.py", "run_all.py", "auto_restart.py",
                         "run_orchestrator.py", "teams/orchestrator.py",
                         "strategy_bot.py", "execution_bot.py")
        }
        for target in targets:
            relative = Path(target)
            normalized = relative.as_posix()
            if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".py":
                raise ValueError("Services must be relative Python files inside the project.")
            resolved = (self.root / relative).resolve()
            if self.root not in resolved.parents or not resolved.is_file():
                raise ValueError("Missing or invalid service: " + normalized)
            key = os.path.normcase(str(resolved))
            if key in forbidden or key in seen:
                raise ValueError("Recursive or duplicate service: " + normalized)
            seen.add(key)
            if relative.parts[0] == "teams":
                command = [sys.executable, "-u", "-m", ".".join(relative.with_suffix("").parts)]
            else:
                command = [sys.executable, "-u", str(resolved)]
            self.children.append(Child(normalized, command))
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def record(self, child, status, notes=""):
        try:
            upsert_process_status(child.target, child.pid, status, exit_code=child.exit_code,
                                  restarts=child.restarts, notes=notes)
            child.reported_status = status
            child.last_recorded = time.monotonic()
        except Exception as error:
            print("[SUPERVISOR] Status write failed: " + type(error).__name__,
                  file=sys.stderr, flush=True)

    @staticmethod
    def close_log(child):
        if child.log is not None:
            child.log.close()
            child.log = None

    def start(self, child):
        self.close_log(child)
        child.log = (self.log_dir / (child.target.replace("/", "_") + ".log")).open("ab")
        environment = os.environ.copy()
        environment["PYTHONUNBUFFERED"] = "1"
        environment["PYTHONPATH"] = str(self.root) + os.pathsep + environment.get("PYTHONPATH", "")
        try:
            child.process = subprocess.Popen(
                child.command, cwd=str(self.root), env=environment,
                stdin=subprocess.DEVNULL, stdout=child.log, stderr=subprocess.STDOUT)
        except BaseException as error:
            child.pid = None
            self.record(child, "FAILED", "Launch failed: " + type(error).__name__)
            self.close_log(child)
            raise
        child.pid = child.process.pid
        child.exit_code = None
        child.next_start = None
        self.record(child, "STARTING", "Process launched; awaiting its own worker heartbeat.")
        print("[SUPERVISOR] Started " + child.target, flush=True)

    def schedule_restart(self, child, now, notes):
        self.close_log(child)
        child.process = None
        child.pid = None
        if child.restarts >= self.max_restarts:
            child.exhausted = True
            child.next_start = None
            self.record(child, "FAILED", notes + "; restart limit reached.")
            return
        delay = min(30.0, 2.0 ** child.restarts)
        child.next_start = now + delay
        self.record(child, "BACKOFF", notes + "; retry in " + str(delay) + " seconds.")

    def tick(self, now=None):
        now = time.monotonic() if now is None else now
        for child in self.children:
            if child.exhausted:
                continue
            if child.process is None:
                if child.next_start is not None and now >= child.next_start:
                    child.restarts += 1
                    try:
                        self.start(child)
                    except OSError as error:
                        child.exit_code = None
                        self.schedule_restart(child, now, "Launch failed: " + type(error).__name__)
                continue
            exit_code = child.process.poll()
            if exit_code is None:
                if child.reported_status != "RUNNING" or time.monotonic() - child.last_recorded >= 30:
                    self.record(child, "RUNNING",
                                "Process is alive; worker heartbeat reports cycle health separately.")
            else:
                child.exit_code = exit_code
                self.schedule_restart(child, now, "Exited with code " + str(exit_code))

    def shutdown(self):
        cleanup_failed = False
        for child in self.children:
            if child.process is not None and child.process.poll() is None:
                try:
                    child.process.terminate()
                except OSError:
                    pass
        deadline = time.monotonic() + 5.0
        for child in self.children:
            process = child.process
            if process is None:
                self.close_log(child)
                continue
            try:
                try:
                    process.wait(timeout=max(0.0, deadline-time.monotonic()))
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2.0)
                child.exit_code = process.poll()
                if child.exit_code is None:
                    raise subprocess.TimeoutExpired(child.command, 2)
                child.pid = None
                self.record(child, "STOPPED", "Supervisor shut down.")
                child.process = None
                self.close_log(child)
            except (OSError, subprocess.TimeoutExpired) as error:
                cleanup_failed = True
                self.record(child, "SHUTDOWN_FAILED", type(error).__name__)
                # Keep the owned handle and log available for a second cleanup attempt.
        return not cleanup_failed

    def run(self):
        result = 0
        try:
            ensure_system_tables()
            for child in self.children:
                if self.stop.is_set():
                    break
                self.start(child)
            while not self.stop.is_set():
                self.tick()
                self.stop.wait(self.poll_seconds)
            result = 1 if any(child.exhausted for child in self.children) else 0
        except KeyboardInterrupt:
            self.stop.set()
            result = 130
        finally:
            if not self.shutdown():
                result = 1
        return result


def run_supervisor(targets=None):
    stop = threading.Event()
    previous_handlers = {}
    def request_stop(_signum, _frame):
        stop.set()
    try:
        with InstanceLock(DATA_DIR / ".laylow-supervisor.lock"):
            if threading.current_thread() is threading.main_thread():
                signals = [signal.SIGINT, signal.SIGTERM]
                if hasattr(signal, "SIGBREAK"):
                    signals.append(signal.SIGBREAK)
                for signum in signals:
                    previous_handlers[signum] = signal.signal(signum, request_stop)
            try:
                return Supervisor(targets=targets, stop_event=stop).run()
            finally:
                for signum, handler in previous_handlers.items():
                    signal.signal(signum, handler)
    except AlreadyRunningError as error:
        print("[SUPERVISOR] " + str(error), file=sys.stderr)
        return 1
    except Exception as error:
        print("[SUPERVISOR] Startup failed: " + str(error), file=sys.stderr)
        return 1


def main():
    return run_supervisor()


if __name__ == "__main__":
    raise SystemExit(main())
