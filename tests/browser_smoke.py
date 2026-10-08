"""Chromium checks with fixture status data; no broker or OpenAI requests."""
import json
import os
import re
import socket
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server
from dashboard import create_app


def main():
    with tempfile.TemporaryDirectory() as directory:
        app = create_app(str(Path(directory) / "status.db"))
        server = make_server("127.0.0.1", 0, app)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}"
        fixture = {
            "generated_at": "2026-10-08T18:00:00+00:00", "mode": "observe",
            "database_available": True,
            "summary": {"fresh_workers": 4, "enabled_teams": 4, "running_processes": 6,
                        "total_teams": 4, "fresh": 4, "enabled": 4, "running": 6},
            "teams": [
                dict(name=symbol, enabled=True, worker_state="STANDBY", health="fresh",
                     heartbeat="2026-10-08T18:00:00+00:00", heartbeat_age_seconds=2,
                     pid=100 + index, score=None,
                     notes="ci-worker-note " + symbol +
                           " <img src=x onerror=window.__injected=true>")
                for index, symbol in enumerate(("AAPL", "TSLA", "SPY", "QQQ"))
            ],
            "processes": [dict(name="teams/aapl_team.py", pid=100, status="RUNNING", health="fresh",
                               exit_code=None, restarts=0, notes="fixture process")],
            "events": [dict(team_name="AAPL", event_type="STARTED",
                            details="fixture event", created_at="2026-10-08T18:00:00+00:00")],
        }
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    for width, height in ((1440, 1000), (390, 844)):
                        page = browser.new_page(viewport={"width": width, "height": height})
                        errors = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.route("**/api/status", lambda route: route.fulfill(
                            status=200, content_type="application/json",
                            body=json.dumps(fixture)))
                        page.goto(url, wait_until="domcontentloaded")
                        page.wait_for_function(
                            "document.body.innerText.includes('ci-worker-note')", timeout=10000)
                        assert page.locator(".bot").count() == 4, "Missing worker cards"
                        assert page.locator("#mode").inner_text().lower().find("observe") >= 0
                        assert page.locator(".bot-note img").count() == 0, "Notes parsed as HTML"
                        assert not page.evaluate("Boolean(window.__injected)"), "Injected HTML ran"
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        ), f"Horizontal overflow at {width}px"
                        page.unroute("**/api/status")
                        page.route("**/api/status", lambda route: route.abort())
                        page.locator("#refresh").click()
                        page.wait_for_function(
                            "/connection lost|disconnected|unavailable|offline|failed/i.test("
                            "document.getElementById('connection').textContent + ' ' + "
                            "document.getElementById('error').textContent)", timeout=10000)
                        assert "ci-worker-note" in page.locator("body").inner_text(), (
                            "Connection failure discarded the last snapshot")
                        assert not errors, errors
                        page.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
    print("Dashboard browser checks passed: desktop, phone, text safety and connection loss.")


if __name__ == "__main__":
    main()
