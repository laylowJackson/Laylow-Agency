"""Exercise the real supervisor/worker/dashboard pipeline without credentials."""
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

from config import TEAM_NAMES

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipIf(os.name == "nt", "POSIX signal integration; Windows cleanup covered by supervisor unit tests")
class RuntimeIntegrationTests(unittest.TestCase):
    def test_blank_key_workers_are_reported_and_shutdown(self):
        with tempfile.TemporaryDirectory() as directory:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            env = os.environ.copy()
            env.update(LAYLOW_DATA_DIR=directory, LAYLOW_DASHBOARD_HOST="127.0.0.1",
                       LAYLOW_DASHBOARD_PORT=str(port), LAYLOW_MODE="observe",
                       OPENAI_API_KEY="", ALPACA_API_KEY="", ALPACA_SECRET_KEY="",
                       LAYLOW_ALLOW_PAPER_ORDERS="false")
            process = subprocess.Popen([sys.executable, str(ROOT / "run_all.py")],
                                       cwd=directory, env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            pids = []
            def diagnostics():
                return "\n".join(path.name + ": " + path.read_text(errors="replace")[-1500:]
                                 for path in Path(directory).rglob("*.log"))
            try:
                deadline = time.monotonic() + 30
                payload = None
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        self.fail("Supervisor exited before the dashboard was available\n" + diagnostics())
                    try:
                        with urllib.request.urlopen(
                            f"http://127.0.0.1:{port}/api/status", timeout=1
                        ) as response:
                            payload = json.load(response)
                        teams = payload["teams"]
                        if len(teams) == len(TEAM_NAMES) and all(
                            team["worker_state"] == "STANDBY" and team["health"] == "fresh"
                            for team in teams
                        ):
                            break
                    except (OSError, ValueError):
                        pass
                    time.sleep(.2)
                else:
                    self.fail("All standby workers did not report fresh heartbeats\n" + diagnostics())
                pids = [row["pid"] for row in payload["processes"] if row.get("pid")]
                self.assertEqual(len({team["pid"] for team in teams}), len(TEAM_NAMES))
                self.assertTrue(all("credentials" in team["notes"] for team in teams))
            finally:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    self.fail("Supervisor did not complete shutdown")
                for pid in pids:
                    try:
                        os.kill(pid, 0)
                    except ProcessLookupError:
                        continue
                    self.fail(f"Child process {pid} survived supervisor shutdown")


if __name__ == "__main__":
    unittest.main()
