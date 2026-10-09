"""Chromium checks with fixture status data; no broker or OpenAI requests."""
import base64
import json
from datetime import datetime, timezone
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
            "summary": {"fresh_workers": 8, "enabled_teams": 8, "running_processes": 11,
                        "total_teams": 8, "fresh": 8, "enabled": 8, "running": 11},
            "teams": [
                dict(name=symbol, enabled=True, worker_state="STANDBY", health="fresh",
                     heartbeat="2026-10-08T18:00:00+00:00", heartbeat_age_seconds=2,
                     pid=100 + index, score=None,
                     notes="ci-worker-note " + symbol +
                           " <img src=x onerror=window.__injected=true>")
                for index, symbol in enumerate(("AAPL", "TSLA", "SPY", "QQQ", "NQ1!", "ES1!", "MGC1!", "MNQ1!"))
            ],
            "processes": [dict(name="teams/aapl_team.py", pid=100, status="RUNNING", health="fresh",
                               exit_code=None, restarts=0, notes="fixture process")],
            "events": [dict(team_name="AAPL", event_type="STARTED",
                            details="fixture event", created_at="2026-10-08T18:00:00+00:00")],
        }
        now = datetime.now(timezone.utc).isoformat()
        fixture["generated_at"] = now
        fixture["csrf_token"] = "fixture-csrf"
        fixture["managers"] = [dict(team_name=row["name"],severity="INFO",summary="Fixture team assessment",generated_at=now) for row in fixture["teams"]]
        fixture["big_manager"] = dict(severity="INFO",summary="Eight fixture team reports",ai_status="disabled",generated_at=now)
        fixture["teams"][0]["analysis"] = dict(direction="LONG",agreement=3,required=2,
            reason="Fixture consensus",source="CI fixture only",state="READY",bar_time=now,updated_at=now,indicators=dict(atr=2,relative_volume=1.5),
            votes=[dict(name="Trend",direction="LONG",reason="<img src=x onerror=window.__injected=true>")])
        fixture["teams"][0]["controls"] = dict(headline_locked=False,earnings_at="",earnings_status="UNKNOWN",lock_reason="Earnings unknown")
        posted = []
        def mutation(route):
            body = route.request.post_data_json
            posted.append((route.request.url,body,route.request.headers.get("x-laylow-csrf")))
            fixture["teams"][0]["controls"]["headline_locked"] = body["locked"]
            route.fulfill(status=200,content_type="application/json",body='{"saved":true}')
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
                        page.route("**/api/teams/AAPL/headline-lock",mutation)
                        page.goto(url, wait_until="domcontentloaded")
                        page.wait_for_function(
                            "document.body.innerText.includes('ci-worker-note')", timeout=10000)
                        assert page.locator(".bot").count() == 8, "Missing worker cards"
                        assert page.locator("#mode").inner_text().lower().find("observe") >= 0
                        assert page.locator(".bot-note img").count() == 0, "Notes parsed as HTML"
                        assert not page.evaluate("Boolean(window.__injected)"), "Injected HTML ran"
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        ), f"Horizontal overflow at {width}px"
                        assert page.locator(".specialists li").count() == 26, "Missing specialist vote slots"
                        assert page.locator(".city-tower").count() == 8, "Missing city districts"
                        assert page.locator(".city-specialist").count() == 26, "Missing city robots"
                        assert page.locator(".city-team-manager").count() == 8, "Missing city team managers"
                        assert page.locator(".city-big-manager").count() == 1, "Missing Big Manager"
                        assert page.locator("#city-fresh").inner_text() == "8 / 8"
                        assert "NOT RECORDED" in page.locator("#city-map").text_content()
                        assert "STANDBY" in page.locator('.city-tower[data-team="SPY"]').get_attribute("aria-label")
                        assert page.locator("#world").get_attribute("data-motion") == "off"
                        page.locator("#city-motion").click()
                        assert page.locator("#world").get_attribute("data-motion") == "on"
                        page.locator("#city-motion").click()
                        page.locator('#city-dock button[data-team="AAPL"]').click()
                        assert page.locator("#city-team-title").inner_text() == "AAPL"
                        assert page.locator("#city-consensus").inner_text() == "Consensus LONG"
                        assert "CI fixture only" in page.locator("#city-analysis-time").inner_text()
                        assert page.locator("#city-bot-list img").count() == 0
                        page.locator('.city-tower[data-team="QQQ"]').focus()
                        page.keyboard.press("Enter")
                        assert page.locator("#city-team-title").inner_text() == "QQQ"
                        page.locator('#city-dock button[data-team="AAPL"]').click()
                        page.locator("#city-open-team").click()
                        assert page.locator(".bot.city-selected").get_attribute("aria-label") == "AAPL Python worker"
                        preview = page.locator("#world").screenshot(type="jpeg",quality=76,animations="disabled")
                        label = "DESKTOP" if width > 800 else "PHONE"
                        print("LAYLOW_CITY_PREVIEW_" + label + "_BEGIN" +
                              base64.b64encode(preview).decode("ascii") +
                              "LAYLOW_CITY_PREVIEW_" + label + "_END",flush=True)
                        assert "WATCH ONLY" in page.locator("body").inner_text()
                        assert page.locator(".specialists img").count() == 0, "Specialist text parsed as HTML"
                        assert "Eight fixture team reports" in page.locator("#big-summary").inner_text()
                        earnings=page.locator("#earnings-AAPL")
                        earnings.fill("unsaved input")
                        page.locator("#refresh").click()
                        page.wait_for_function("!document.getElementById('refresh').disabled")
                        assert earnings.input_value()=="unsaved input", "Poll discarded an edit"
                        assert page.locator("#city-team-title").inner_text() == "AAPL", "Poll discarded district selection"
                        button=page.locator(".bot:has(#earnings-AAPL) [data-control=headline]")
                        expected=not fixture["teams"][0]["controls"]["headline_locked"]
                        with page.expect_response("**/api/teams/AAPL/headline-lock"):
                            button.click()
                        page.wait_for_function("!document.querySelector('.bot:has(#earnings-AAPL) [data-control=headline]').disabled")
                        assert posted[-1][1]=={"locked":expected} and posted[-1][2]=="fixture-csrf"
                        page.unroute("**/api/status")
                        page.route("**/api/status", lambda route: route.abort())
                        page.locator("#refresh").click()
                        page.wait_for_function(
                            "/connection lost|disconnected|unavailable|offline|failed/i.test("
                            "document.getElementById('connection').textContent + ' ' + "
                            "document.getElementById('error').textContent)", timeout=10000)
                        assert "ci-worker-note" in page.locator("body").inner_text(), (
                            "Connection failure discarded the last snapshot")
                        assert "CONNECTION LOST" in page.locator("#city-world-status").inner_text()
                        assert page.locator("#city-consensus").inner_text() == "Last recorded LONG"
                        assert page.locator('.city-tower[data-observed="true"]').count() == 0
                        assert not errors, errors
                        page.close()

                    reduced = browser.new_page(viewport={"width":390,"height":844},reduced_motion="reduce")
                    reduced.route("**/api/status", lambda route: route.fulfill(
                        status=200,content_type="application/json",body=json.dumps(fixture)))
                    reduced.goto(url,wait_until="domcontentloaded")
                    reduced.wait_for_function("document.body.innerText.includes('ci-worker-note')")
                    assert reduced.locator("#city-motion").is_disabled()
                    assert reduced.evaluate("Array.from(document.querySelectorAll('.city-floating,.city-ambient')).every(node => getComputedStyle(node).animationName === 'none')")
                    reduced.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
    print("Dashboard browser checks passed: desktop, phone, city selection, 26 robots, reduced motion, text safety and connection loss.")


if __name__ == "__main__":
    main()
