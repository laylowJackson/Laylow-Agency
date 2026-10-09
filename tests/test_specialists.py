"""OHLCV, consensus, event control, ATR and manager checks without providers."""
import copy
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from config import TEAM_NAMES
from db_utils import connect_db, ensure_system_tables, ensure_team_control, record_worker_status, save_analysis
from specialist_engine import evaluate_team
from entry_controls import assess_controls, update_control
from team_worker import TeamWorker, size_trade, submit_paper_order, ensure_ledger
from futures_worker import FuturesWorker, read_csv_bars
from manager_hierarchy import build_manager_reports
from manager_worker import run_cycle
from manager_ai import enrich_big_manager
from dashboard import create_app

NOW = datetime(2026,10,8,15,0,tzinfo=timezone.utc)

def bars():
    return [{"timestamp": (NOW-timedelta(minutes=34-index)).isoformat(),
             "open":100+index*.2, "high":101+index*.2, "low":99+index*.2,
             "close":100+index*.2, "volume": 200 if index == 34 else 100}
            for index in range(35)]

class SpecialistTests(unittest.TestCase):
    def test_distinct_team_specialists_and_thresholds(self):
        apple = evaluate_team("AAPL", bars(), observed_at=NOW)
        tesla = evaluate_team("TSLA", bars(), observed_at=NOW)
        self.assertEqual(apple["direction"], "LONG")
        self.assertEqual(apple["required"], 2)
        self.assertEqual(tesla["required"], 3)
        self.assertEqual(len(apple["votes"]), 4)
        self.assertEqual(len(tesla["votes"]), 4)
        self.assertAlmostEqual(apple["indicators"]["atr"], 2)
        self.assertAlmostEqual(apple["indicators"]["stop_distance"], 2.5)
        self.assertAlmostEqual(tesla["indicators"]["stop_distance"], 3.5)
        for team in ("NQ1!", "ES1!", "MGC1!", "MNQ1!", "MES1!", "GC1!"):
            analysis = evaluate_team(team, bars(), observed_at=NOW)
            self.assertTrue(analysis["watch_only"])
            self.assertEqual(len(analysis["votes"]), 3)
            self.assertEqual(analysis["required"], 2)

    def test_invalid_or_stale_bars_never_yield_entry(self):
        self.assertEqual(evaluate_team("AAPL", bars()[:10], observed_at=NOW)["direction"], "SKIP")
        self.assertEqual(evaluate_team("AAPL", bars(), observed_at=NOW+timedelta(minutes=6))["state"], "STALE")
        for field, value in (("close", float("nan")), ("volume", -1), ("high", .01),
                             ("timestamp", NOW.replace(tzinfo=None).isoformat())):
            data = bars()
            data[-1][field] = value
            with self.subTest(field=field), self.assertRaises((ValueError, TypeError)):
                evaluate_team("AAPL", data, observed_at=NOW)
        with self.assertRaises(ValueError):
            evaluate_team("AAPL", bars()+bars()[-1:], observed_at=NOW)

    def test_volume_and_extension_gates(self):
        data = bars()
        data[-1]["volume"] = 1
        self.assertEqual(evaluate_team("AAPL", data, observed_at=NOW)["direction"], "SKIP")
        self.assertIn("Relative volume", evaluate_team("AAPL", data, observed_at=NOW)["reason"])
        data = bars()
        data[-1].update(open=120, high=121, low=119, close=120)
        self.assertIn("2 ATR", evaluate_team("AAPL", data, observed_at=NOW)["reason"])

    def test_stock_vwap_requires_current_session(self):
        data = bars()
        for row in data:
            row["timestamp"] = (datetime.fromisoformat(row["timestamp"])-timedelta(hours=3)).isoformat()
        result = evaluate_team("AAPL", data, observed_at=NOW, max_age_seconds=20000)
        self.assertEqual(result["direction"], "SKIP")
        self.assertIn("current-session", result["reason"])

    def test_event_window_unknown_expired_and_headline_lock(self):
        self.assertTrue(assess_controls("AAPL", now=NOW)["entry_locked"])
        scheduled = (NOW+timedelta(days=3)).isoformat()
        self.assertFalse(assess_controls("AAPL", {"earnings_at":scheduled}, now=NOW)["entry_locked"])
        self.assertTrue(assess_controls("AAPL", {"earnings_at":NOW.isoformat()}, now=NOW)["earnings_locked"])
        past = (NOW-timedelta(days=1)).isoformat()
        self.assertEqual(assess_controls("AAPL", {"earnings_at":past}, now=NOW)["earnings_status"], "EXPIRED")
        self.assertTrue(assess_controls("AAPL", {"earnings_at":scheduled,"headline_locked":True}, now=NOW)["entry_locked"])
        self.assertFalse(assess_controls("NQ1!", now=NOW)["earnings_locked"])

    def test_tsla_atr_budget_smaller_and_no_forced_share(self):
        account = SimpleNamespace(equity=10000,last_equity=10000,buying_power=10000,
                                  trading_blocked=False,account_blocked=False)
        self.assertEqual(size_trade(account,100,stop_distance=20), 2)
        self.assertEqual(size_trade(account,100,stop_distance=20,symbol="TSLA"), 1)
        self.assertEqual(size_trade(account,100,stop_distance=200), 0)

class RuntimeFeatureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = str(Path(self.temp.name)/"status.db")
        ensure_system_tables(self.db)
        ensure_ledger(self.db)
        for name in TEAM_NAMES:
            ensure_team_control(name,self.db)
        self.settings = dict(mode="analyze", openai_key="fixture",alpaca_key="fixture",
                             alpaca_secret="fixture",model="test",paper_enabled=True)

    def test_ai_cannot_override_specialist_direction(self):
        services = Mock()
        services.bars.return_value = bars()
        services.quote.return_value = 106.8
        services.decide.return_value = dict(direction="SHORT",action="APPROVE",reason="fixture")
        worker = TeamWorker("AAPL",self.db,lambda:self.settings,lambda settings:services)
        update_control("AAPL",earnings_at=(NOW+timedelta(days=7)).isoformat(),db_path=self.db)
        with patch("team_worker.utc_now",return_value=NOW), patch("team_worker.evaluate_team",return_value=evaluate_team("AAPL",bars(),observed_at=NOW)):
            worker.cycle()
        with connect_db(self.db) as connection:
            self.assertEqual(connection.execute("SELECT direction FROM worker_decisions").fetchone()[0],"SKIP")
        services.broker.submit_order.assert_not_called()

    def test_futures_paper_mode_still_only_analyzes(self):
        self.settings["mode"] = "paper"
        worker = FuturesWorker("NQ1!",self.db,lambda:self.settings,lambda name,directory:bars())
        with patch.dict(os.environ, {"LAYLOW_FUTURES_CSV_DIR":self.temp.name}), patch(
            "futures_worker.evaluate_team",return_value=evaluate_team("NQ1!",bars(),observed_at=NOW)):
            worker.cycle()
        self.assertEqual(worker.state,"WATCH_ONLY")
        with connect_db(self.db) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM paper_orders").fetchone()[0],0)
        services=Mock()
        self.assertIn("watch-only",submit_paper_order("NQ1!","unused",{},100,services,self.db))
        services.broker.submit_order.assert_not_called()

    def test_csv_adapter_reads_actual_file_and_rejects_bad_rows(self):
        path = Path(self.temp.name)/"NQ.csv"
        path.write_text("timestamp,open,high,low,close,volume\n2026-10-08T15:00:00Z,100,101,99,100,100\n")
        self.assertEqual(len(read_csv_bars("NQ1!",self.temp.name)),1)
        with self.assertRaises(KeyError):
            read_csv_bars("../../bad",self.temp.name)

    def test_unknown_earnings_blocks_before_any_broker_request(self):
        services=Mock()
        result=submit_paper_order("AAPL","test",dict(direction="LONG",action="APPROVE"),100,services,self.db)
        self.assertIn("Earnings unknown",result)
        services.broker.get_clock.assert_not_called()

    def test_manager_reports_isolated_and_ai_cannot_change_authority(self):
        for name in TEAM_NAMES:
            record_worker_status(name,"STANDBY",db_path=self.db)
        save_analysis("AAPL", evaluate_team("AAPL",bars(),observed_at=NOW),self.db)
        def fake(report):
            report["severity"]="CRITICAL"
            report["reports"].clear()
            return dict(ai_status="ready",ai_summary="Fixture summary",severity="CRITICAL",reports=[])
        reports=run_cycle(self.db,enricher=fake)
        self.assertEqual(len(reports),len(TEAM_NAMES)+1)
        self.assertEqual(reports[-1]["severity"],"INFO")
        self.assertEqual(len(reports[-1]["reports"]),len(TEAM_NAMES))
        self.assertEqual(reports[-1]["ai_summary"],"Fixture summary")
        self.assertEqual(reports[0]["bot_votes"],[])
        self.assertEqual(len(next(row for row in reports if row["team_name"]=="AAPL")["bot_votes"]),4)
        with connect_db(self.db) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM manager_reports").fetchone()[0],len(TEAM_NAMES)+1)
        payload=dict(mode="paper",teams=[dict(name=name,worker_state="STANDBY",health="fresh") for name in TEAM_NAMES])
        controls={name:assess_controls(name,enabled=True,now=NOW) for name in TEAM_NAMES}
        critical=build_manager_reports(payload,{},controls,{"TSLA":{"pending_or_uncertain":1}},now=NOW)
        self.assertEqual(next(row for row in critical if row["team_name"]=="TSLA")["severity"],"CRITICAL")
        self.assertEqual(critical[-1]["severity"],"CRITICAL")
        with patch.dict(os.environ,{"LAYLOW_MANAGER_AI":"false"}),patch("manager_ai.load_settings",return_value=self.settings):
            self.assertEqual(enrich_big_manager({})["ai_status"],"disabled")

    def test_control_api_requires_token_origin_types_and_stock_team(self):
        app=create_app(self.db)
        client=app.test_client()
        token=client.get("/api/status").get_json()["csrf_token"]
        headers={"X-Laylow-CSRF":token,"Origin":"http://localhost"}
        url="/api/teams/AAPL/headline-lock"
        self.assertEqual(client.post(url,json={"locked":True}).status_code,403)
        self.assertEqual(client.post(url,json={"locked":True},headers=dict(headers,Origin="https://evil.example")).status_code,403)
        for value in ("true",1,None):
            self.assertEqual(client.post(url,json={"locked":value},headers=headers).status_code,400)
        self.assertEqual(client.post(url,json={"locked":True},headers=headers).status_code,200)
        status=client.get("/api/status").get_json()
        self.assertTrue(next(row for row in status["teams"] if row["name"]=="AAPL")["controls"]["headline_locked"])
        self.assertEqual(client.post("/api/teams/NQ1!/headline-lock",json={"locked":True},headers=headers).status_code,404)
        self.assertEqual(client.post("/api/teams/AAPL/earnings",json={"earnings_at":"2026-12-01T12:00:00"},headers=headers).status_code,400)
        self.assertEqual(client.post("/api/teams/AAPL/earnings",json={"earnings_at":"2026-12-01T12:00:00Z"},headers=headers).status_code,200)
        self.assertEqual(client.get("/api/status",headers={"Host":"evil.example"}).status_code,403)
