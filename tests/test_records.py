"""Trade provenance, exact money, deduplication, brakes and chart persistence."""
import copy
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from config import TEAM_NAMES
from db_utils import ensure_system_tables, connect_db, ensure_team_control, save_analysis
from dashboard_status import build_dashboard_payload
from dashboard import create_app
from trading_records import import_closed_trades, set_profit_brake, brake_from_connection, session_day
from entry_controls import read_entry_controls
from specialist_engine import evaluate_team

NOW=datetime(2026,10,8,15,0,tzinfo=timezone.utc)

class RecordsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db=str(Path(self.temp.name)/"status.db")
        ensure_system_tables(self.db)
        self.row=dict(trade_id="closed-1",team_name="SPY",closed_at=(NOW-timedelta(minutes=1)).isoformat(),gross_pnl="101.01",fees="1.01")

    def ingest(self,rows=None,mode="paper",as_of=NOW,source="account-export"):
        return import_closed_trades([self.row] if rows is None else rows,source,mode,as_of,self.db,now=NOW)

    def test_exact_net_deduplication_and_provenance(self):
        self.ingest();self.ingest()
        result=build_dashboard_payload(self.db,now=NOW)["payroll"]
        self.assertEqual(result["total_net_cents"],10000)
        self.assertEqual(result["workers"][0]["closed_trades"],1)
        self.assertEqual(result["workers"][0]["wins"],1)
        self.assertEqual(result["sources"][0]["source"],"account-export")
        self.assertEqual(result["recent"][0]["net_cents"],10000)
        self.assertTrue(result["fresh"])

    def test_conflicting_trade_rolls_back_entire_import(self):
        self.ingest()
        conflict=dict(self.row,gross_pnl="999.00")
        new=dict(self.row,trade_id="new")
        with self.assertRaises(ValueError):
            self.ingest([new,conflict])
        with connect_db(self.db) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM closed_trades").fetchone()[0],1)

    def test_invalid_records_and_source_never_change_totals(self):
        self.ingest()
        for key,value in [("fees","-1"),("gross_pnl","nan"),("gross_pnl","1.001"),("team_name","BAD"),("closed_at","2026-10-09T15:00:00Z")]:
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):
                self.ingest([dict(self.row,trade_id="new",**{key:value})])
        with self.assertRaises(ValueError):
            self.ingest([dict(self.row,trade_id="new")],source="other-account")
        self.assertEqual(build_dashboard_payload(self.db,now=NOW)["payroll"]["total_net_cents"],10000)

    def test_live_records_cannot_inflate_paper_payroll_or_brake(self):
        self.ingest(mode="live")
        self.assertIsNone(build_dashboard_payload(self.db,now=NOW)["payroll"]["total_net_cents"])
        set_profit_brake("SPY","50.00",self.db)
        with connect_db(self.db) as connection:
            self.assertEqual(brake_from_connection(connection,"SPY",NOW)["status"],"AWAITING_CURRENT_EXPORT")

    def test_missing_export_unknown_but_complete_empty_export_is_zero(self):
        self.assertIsNone(build_dashboard_payload(self.db,now=NOW)["payroll"]["total_net_cents"])
        self.ingest([])
        self.assertEqual(build_dashboard_payload(self.db,now=NOW)["payroll"]["total_net_cents"],0)
        set_profit_brake("SPY","50",self.db)
        with connect_db(self.db) as connection:
            self.assertEqual(brake_from_connection(connection,"SPY",NOW)["status"],"ARMED")

    def test_brake_latches_after_hit_even_if_later_trade_loses(self):
        set_profit_brake("SPY","50",self.db)
        self.ingest()
        loss=dict(self.row,trade_id="loss",gross_pnl="-100.00",fees="0.00")
        self.ingest([self.row,loss])
        with connect_db(self.db) as connection:
            result=brake_from_connection(connection,"SPY",NOW)
        self.assertEqual(result["net_cents"],0)
        self.assertEqual(result["status"],"PROFIT_BRAKE_HIT")
        self.assertTrue(result["locked"])

    def test_stale_export_locks_configured_brake_and_new_day_needs_export(self):
        self.ingest([])
        set_profit_brake("SPY","50",self.db)
        with connect_db(self.db) as connection:
            self.assertEqual(brake_from_connection(connection,"SPY",NOW+timedelta(seconds=91))["status"],"AWAITING_CURRENT_EXPORT")
            self.assertEqual(brake_from_connection(connection,"SPY",NOW+timedelta(days=1))["status"],"AWAITING_CURRENT_EXPORT")
        result=read_entry_controls("SPY",self.db,now=NOW+timedelta(seconds=91))
        self.assertTrue(result["entry_locked"])

    def test_session_day_uses_new_york_not_utc_midnight(self):
        self.assertEqual(session_day("2026-10-09T01:00:00Z"),"2026-10-08")
        self.assertEqual(session_day("2026-10-09T05:00:00Z"),"2026-10-09")

    def test_brake_api_requires_token_and_valid_values(self):
        app=create_app(self.db);client=app.test_client()
        token=client.get("/api/status").get_json()["csrf_token"]
        url="/api/teams/SPY/profit-brake";headers={"X-Laylow-CSRF":token}
        self.assertEqual(client.post(url,json={"amount":"50"}).status_code,403)
        for value in [True,-1,0,"NaN","1.001"]:
            self.assertEqual(client.post(url,json={"amount":value},headers=headers).status_code,400)
        self.assertEqual(client.post(url,json={"amount":"50.00"},headers=headers).status_code,200)
        self.assertEqual(client.post(url,json={"amount":None},headers=headers).status_code,200)
        with connect_db(self.db) as connection:
            self.assertEqual(brake_from_connection(connection,"SPY",NOW)["status"],"DISABLED")
        self.assertEqual(client.post("/api/teams/MES1!/profit-brake",json={"amount":"50"},headers=headers).status_code,404)

    def test_real_bars_persist_for_workstation_and_new_teams_are_watch_only(self):
        bars=[dict(timestamp=(NOW-timedelta(minutes=34-i)).isoformat(),open=100+i*.2,high=101+i*.2,low=99+i*.2,close=100+i*.2,volume=200) for i in range(35)]
        for name in ["MES1!","GC1!"]:
            analysis=evaluate_team(name,bars,source="actual-export",observed_at=NOW)
            self.assertTrue(analysis["watch_only"])
            save_analysis(name,analysis,self.db)
        teams=build_dashboard_payload(self.db,now=NOW)["teams"]
        chart=next(row for row in teams if row["name"]=="MES1!")["analysis"]["bars"]
        self.assertEqual(len(chart),35)
        self.assertEqual(chart[-1]["close"],bars[-1]["close"])
        self.assertIsInstance(chart[-1]["timestamp"],str)
        response=create_app(self.db).test_client().get("/world-3d.js")
        self.assertEqual(response.status_code,200)
        self.assertIn("webgl",response.get_data(as_text=True))

        response.close()
