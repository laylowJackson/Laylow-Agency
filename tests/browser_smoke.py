"""Chromium checks with fixture status data; no broker or OpenAI requests."""
import base64
import json
from datetime import datetime, timedelta, timezone
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
            "summary": {"fresh_workers": 10, "enabled_teams": 10, "running_processes": 13,
                        "total_teams": 10, "fresh": 10, "enabled": 10, "running": 13},
            "teams": [
                dict(name=symbol, enabled=True, worker_state="STANDBY", health="fresh",
                     heartbeat="2026-10-08T18:00:00+00:00", heartbeat_age_seconds=2,
                     pid=100 + index, score=None,
                     notes="ci-worker-note " + symbol +
                           " <img src=x onerror=window.__injected=true>")
                for index, symbol in enumerate(("AAPL", "TSLA", "SPY", "QQQ", "NQ1!", "ES1!", "MGC1!", "MNQ1!", "MES1!", "GC1!"))
            ],
            "processes": [dict(name="teams/aapl_team.py", pid=100, status="RUNNING", health="fresh",
                               exit_code=None, restarts=0, notes="fixture process")],
            "events": [dict(team_name="AAPL", event_type="STARTED",
                            details="fixture event", created_at="2026-10-08T18:00:00+00:00")],
        }
        clock_now = datetime.now(timezone.utc)
        now = clock_now.isoformat()
        fixture["generated_at"] = now
        fixture["csrf_token"] = "fixture-csrf"
        fixture["managers"] = [dict(team_name=row["name"],severity="INFO",summary="Fixture team assessment",generated_at=now) for row in fixture["teams"]]
        fixture["big_manager"] = dict(severity="INFO",summary="Ten fixture team reports",ai_status="disabled",generated_at=now)
        fixture["teams"][0]["analysis"] = dict(direction="LONG",agreement=3,required=2,
            reason="Fixture consensus",source="CI fixture only",state="READY",bar_time=now,updated_at=now,indicators=dict(atr=2,relative_volume=1.5),
            votes=[dict(name="Trend",direction="LONG",reason="<img src=x onerror=window.__injected=true>")])
        fixture["teams"][0]["analysis"]["bars"] = [dict(timestamp=(clock_now-timedelta(minutes=29-index)).isoformat(),open=100+index*.2,high=101+index*.2,low=99+index*.2,close=100+index*.2,volume=1000) for index in range(30)]
        fixture["teams"][0]["analysis"]["indicators"]["vwap"] = 103
        fixture["teams"][0]["controls"] = dict(headline_locked=False,earnings_at="",earnings_status="UNKNOWN",lock_reason="Earnings unknown")
        posted = []
        def mutation(route):
            body = route.request.post_data_json
            posted.append((route.request.url,body,route.request.headers.get("x-laylow-csrf")))
            fixture["teams"][0]["controls"]["headline_locked"] = body["locked"]
            route.fulfill(status=200,content_type="application/json",body='{"saved":true}')
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(args=["--enable-unsafe-swiftshader"])
                try:
                    for width, height in ((1440, 1000), (390, 844)):
                        fixture.pop("payroll",None)
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
                        assert page.locator(".bot").count() == 10, "Missing worker cards"
                        assert page.locator("#mode").inner_text().lower().find("observe") >= 0
                        assert page.locator(".bot-note img").count() == 0, "Notes parsed as HTML"
                        assert not page.evaluate("Boolean(window.__injected)"), "Injected HTML ran"
                        # Wait for the 3D labels' first animation-frame layout before measuring.
                        try:
                            page.wait_for_function(
                                "document.documentElement.scrollWidth <= window.innerWidth + 1", timeout=10000)
                        except Exception:
                            print("Layout diagnostics:", page.evaluate(
                                "({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-scroll,.city-dock')).slice(0,50).map(e=>({tag:e.tagName,id:e.id,classes:String(e.className),right:e.getBoundingClientRect().right}))})"), flush=True)
                            raise
                        assert page.evaluate(
                            "document.documentElement.scrollWidth <= window.innerWidth + 1"
                        ), f"Horizontal overflow at {width}px: " + str(page.evaluate(
                            "Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-scroll,.city-dock')).slice(0,50).map(e=>({tag:e.tagName,id:e.id,classes:String(e.className),right:e.getBoundingClientRect().right}))"))
                        assert page.locator(".specialists li").count() == 32, "Missing specialist vote slots"
                        assert page.locator(".city-tower").count() == 10, "Missing city districts"
                        assert page.locator(".city-specialist").count() == 32, "Missing city robots"
                        assert page.locator(".city-team-manager").count() == 10, "Missing city team managers"
                        assert page.locator(".city-big-manager").count() == 1, "Missing Big Manager"
                        assert page.locator("#city-fresh").inner_text() == "10 / 10"
                        assert "P&L VIA TRADE EXPORT" in page.locator("#city-map").text_content()
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
                        page.locator("#city-view").click()
                        page.locator('.city-tower[data-team="QQQ"]').focus()
                        page.keyboard.press("Enter")
                        assert page.locator("#city-team-title").inner_text() == "QQQ"
                        assert page.locator("#office-dialog").is_visible(), "Building keyboard entry did not open its office"
                        page.keyboard.press("Escape")
                        assert not page.locator("#office-dialog").is_visible()
                        page.locator('#city-dock button[data-team="AAPL"]').click()
                        page.locator("#city-view").click()
                        page.wait_for_function("document.getElementById('city-3d').dataset.ready==='true'")
                        assert page.locator("#world").get_attribute("data-view")=="3d"
                        assert page.locator(".world-3d-label[data-team]").count()==10
                        if width<800:
                            assert page.locator(".world-3d-label[data-team]:visible").count()==1
                            assert page.locator(".city-overview").bounding_box()["y"]+page.locator(".city-overview").bounding_box()["height"] <= page.locator("#city-3d").bounding_box()["y"]
                        assert "Not recorded" in page.locator("#payroll-today").inner_text()
                        page.locator("#city-enter-office").click()
                        assert page.locator("#office-dialog").is_visible()
                        assert "AAPL" in page.locator("#office-title").inner_text()
                        page.wait_for_function("document.getElementById('office-3d').dataset.ready==='true'")
                        page.locator("#office-worker").select_option("Trend")
                        assert page.locator("#office-title").inner_text() == "AAPL · Team office"
                        assert page.locator("#office-worker").input_value() == "Trend"
                        assert "Trend" in page.locator("#office-speech-name").inner_text()
                        assert page.locator("#office-roster button[aria-pressed='true']").count() == 1
                        assert "recorded bars" in page.locator("#office-chart-note").inner_text()
                        assert page.locator("#office-chart polyline").count()==3
                        assert "Not recorded" in page.locator("#office-earned").inner_text()
                        assert page.locator("#office-votes img").count()==0
                        office_preview=page.locator("#office-dialog").screenshot(type="jpeg",quality=76,animations="disabled")
                        office_label="DESKTOP" if width>800 else "PHONE"
                        print("LAYLOW_OFFICE_PREVIEW_"+office_label+"_BEGIN"+
                              base64.b64encode(office_preview).decode("ascii")+
                              "LAYLOW_OFFICE_PREVIEW_"+office_label+"_END",flush=True)
                        page.keyboard.press("Escape")
                        assert not page.locator("#office-dialog").is_visible()
                        page.locator("#city-open-team").click()
                        assert page.locator(".bot.city-selected").get_attribute("aria-label") == "AAPL Python worker"
                        preview = page.locator("#world").screenshot(type="jpeg",quality=76,animations="disabled")
                        label = "DESKTOP" if width > 800 else "PHONE"
                        print("LAYLOW_CITY_PREVIEW_" + label + "_BEGIN" +
                              base64.b64encode(preview).decode("ascii") +
                              "LAYLOW_CITY_PREVIEW_" + label + "_END",flush=True)
                        assert "WATCH ONLY" in page.locator("body").inner_text()
                        assert page.locator(".specialists img").count() == 0, "Specialist text parsed as HTML"
                        assert "Ten fixture team reports" in page.locator("#big-summary").inner_text()
                        fixture["payroll"]=dict(available=True,fresh=True,day=clock_now.date().isoformat(),timezone="America/New_York",
                            total_net_cents=10000,all_time_net_cents=10000,basis="CI closed-trade fixture",
                            sources=[dict(source="ci-paper-export",as_of=now)],
                            workers=[dict(team_name="AAPL",closed_trades=1,wins=1,losses=0,net_cents=10000)],
                            daily=[dict(day=clock_now.date().isoformat(),net_cents=10000)],
                            recent=[dict(team_name="AAPL",trade_id="fixture-closed",closed_at=now,source="ci-paper-export",net_cents=10000)])
                        page.locator("#refresh").click()
                        page.wait_for_function("document.getElementById('payroll-today').textContent.includes('100.00')")
                        assert page.locator("#payroll-chart rect").count()>0
                        assert "ci-paper-export" in page.locator("#payroll-basis").inner_text()
                        assert "100.00" in page.locator('.world-3d-label[data-team="AAPL"]').inner_text()
                        page.locator("#city-enter-office").click()
                        assert "100.00" in page.locator("#office-earned").inner_text()
                        assert "ci-paper-export" in page.locator("#office-performance-note").inner_text()
                        page.keyboard.press("Escape")
                        risk=page.locator("#profit-amount-AAPL")
                        risk.fill("123.45")
                        earnings=page.locator("#earnings-AAPL")
                        earnings.fill("unsaved input")
                        page.locator("#refresh").click()
                        page.wait_for_function("!document.getElementById('refresh').disabled")
                        assert earnings.input_value()=="unsaved input", "Poll discarded an edit"
                        assert risk.input_value()=="123.45","Poll discarded profit-brake edit"
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
                    fallback = browser.new_page(viewport={"width":390,"height":844})
                    fallback.add_init_script("""const original=HTMLCanvasElement.prototype.getContext;
                        HTMLCanvasElement.prototype.getContext=function(kind,...args){
                            return kind==="webgl"?null:original.call(this,kind,...args);
                        };""")
                    fallback.route("**/api/status",lambda route:route.fulfill(
                        status=200,content_type="application/json",body=json.dumps(fixture)))
                    fallback.goto(url,wait_until="domcontentloaded")
                    fallback.wait_for_function("document.body.innerText.includes('ci-worker-note')")
                    assert fallback.locator("#world").get_attribute("data-view")=="map"
                    assert fallback.locator("#city-view").is_disabled()
                    fallback.locator('#city-dock button[data-team="AAPL"]').click()
                    fallback.locator("#city-enter-office").click()
                    assert fallback.locator("#office-chart polyline").count()==3
                    assert "unavailable" in fallback.locator("#office-render-note").inner_text()
                    fallback.close()
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
    print("Dashboard browser checks passed: desktop, phone, city selection, 32 robots, reduced motion, text safety and connection loss.")


if __name__ == "__main__":
    main()
