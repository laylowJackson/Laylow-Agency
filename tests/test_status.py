"""Offline schema, preservation and heartbeat regression tests."""
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from config import HEARTBEAT_STALE_SECONDS, ROOT_DIR, TEAM_NAMES
from dashboard_status import build_dashboard_payload, get_dashboard_payload, save_dashboard_snapshot
from db_utils import (connect_db, database_path, ensure_system_tables, ensure_team_control,
                      record_worker_status, upsert_process_status, upsert_team_scores,
                      upsert_team_status)


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "team_status.db"
        self.now = datetime(2026,1,1,12,0,tzinfo=timezone.utc)

    def payload(self):
        return build_dashboard_payload(self.path,now=self.now)

    def team(self,name="SPY"):
        return next(team for team in self.payload()["teams"] if team["name"]==name)

    def test_empty_database_is_not_created_or_healthy(self):
        payload = self.payload()
        self.assertFalse(self.path.exists())
        self.assertFalse(payload["database_available"])
        self.assertEqual(payload["summary"]["fresh_workers"],0)
        self.assertEqual(payload["summary"]["enabled_teams"],0)
        self.assertEqual(payload["summary"]["missing_workers"],len(TEAM_NAMES))
        self.assertTrue(all(team["worker_state"]=="NOT_STARTED" for team in payload["teams"]))
        self.assertTrue(all(team["score"] is None for team in payload["teams"]))
        self.assertTrue(payload["errors"])

    def test_legacy_migration_preserves_rows_and_adds_columns(self):
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute("CREATE TABLE team_status (id INTEGER PRIMARY KEY,team_name TEXT,"
                         "status TEXT,last_heartbeat TEXT,active INTEGER,notes TEXT)")
            conn.execute("INSERT INTO team_status VALUES (1,'SPY','DISABLED','legacy-clock',0,"
                         "'preserve this')")
        ensure_system_tables(self.path)
        ensure_system_tables(self.path)
        with connect_db(self.path) as conn:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(team_status)")}
            row = dict(conn.execute("SELECT * FROM team_status").fetchone())
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"created_at","updated_at"} <= columns)
        self.assertEqual(row["notes"],"preserve this")
        self.assertEqual(row["last_heartbeat"],"legacy-clock")
        self.assertIsNone(row["created_at"])
        self.assertTrue({"worker_status","process_status","system_events","team_scores"} <= tables)
        self.assertEqual(self.team()["health"],"missing")

    def test_duplicate_upserts_update_only_latest(self):
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute("CREATE TABLE team_status (id INTEGER PRIMARY KEY,team_name TEXT,"
                         "status TEXT,active INTEGER,notes TEXT)")
            conn.executemany("INSERT INTO team_status VALUES (?,'SPY',?,?,?)",
                             [(1,"DISABLED",0,"first row"),(2,"ENABLED",1,"newest row")])
            conn.execute("CREATE TABLE team_scores (id INTEGER PRIMARY KEY,team_name TEXT,score REAL)")
            conn.executemany("INSERT INTO team_scores VALUES (?,'SPY',?)",[(1,1.0),(2,2.0)])
        ensure_system_tables(self.path)
        self.assertTrue(self.team()["enabled"])
        upsert_team_status("SPY","DISABLED",active=0,notes="changed newest",db_path=self.path)
        upsert_team_scores("SPY",score=9,db_path=self.path)
        with connect_db(self.path) as conn:
            controls = [dict(row) for row in conn.execute("SELECT * FROM team_status ORDER BY id")]
            scores = [dict(row) for row in conn.execute("SELECT * FROM team_scores ORDER BY id")]
        self.assertEqual(len(controls),2)
        self.assertEqual(controls[0]["notes"],"first row")
        self.assertEqual(controls[1]["notes"],"changed newest")
        self.assertEqual(len(scores),2)
        self.assertEqual(scores[0]["score"],1)
        self.assertEqual(scores[1]["score"],9)
        self.assertFalse(self.team()["enabled"])
        self.assertEqual(self.team()["score_source"],"legacy_unverified")

    def test_heartbeat_cannot_enable_disabled_team(self):
        upsert_team_status("SPY","DISABLED",active=0,db_path=self.path)
        record_worker_status("SPY","STANDBY",pid=123,heartbeat=self.now.isoformat(),db_path=self.path)
        ensure_team_control("SPY",self.path)
        team = self.team()
        self.assertFalse(team["enabled"])
        self.assertEqual(team["health"],"fresh")
        self.assertEqual(team["worker_state"],"STANDBY")
        self.assertEqual(team["pid"],123)

    def test_initialization_does_not_fake_health(self):
        ensure_team_control("SPY",self.path)
        self.assertTrue(self.team()["enabled"])
        self.assertEqual(self.team()["health"],"missing")
        self.assertIsNone(self.team()["heartbeat"])
        upsert_team_scores("SPY",is_disabled=1,db_path=self.path)
        self.assertFalse(self.team()["enabled"])

    def test_heartbeat_boundaries(self):
        fixtures = [(self.now.isoformat(),"fresh",0),
                    ((self.now-timedelta(seconds=HEARTBEAT_STALE_SECONDS)).isoformat(),
                     "fresh",HEARTBEAT_STALE_SECONDS),
                    ((self.now-timedelta(seconds=HEARTBEAT_STALE_SECONDS+1)).isoformat(),
                     "stale",HEARTBEAT_STALE_SECONDS+1),
                    ("","missing",None),("not-a-date","invalid",None),
                    ("2026-01-01T11:59:00","invalid",None),
                    ((self.now+timedelta(seconds=1)).isoformat(),"invalid",None)]
        for heartbeat,health,age in fixtures:
            with self.subTest(heartbeat=heartbeat):
                record_worker_status("SPY","STANDBY",heartbeat=heartbeat,db_path=self.path)
                self.assertEqual(self.team()["health"],health)
                self.assertEqual(self.team()["heartbeat_age_seconds"],age)

    def test_default_heartbeat_is_utc(self):
        record_worker_status("SPY","STANDBY",db_path=self.path)
        team = next(t for t in build_dashboard_payload(self.path)["teams"] if t["name"]=="SPY")
        self.assertEqual(datetime.fromisoformat(team["heartbeat"]).utcoffset(),timedelta(0))
        self.assertEqual(team["health"],"fresh")
        self.assertFalse(team["enabled"])

    def test_control_heartbeat_is_not_worker_liveness(self):
        upsert_team_status("SPY","RUNNING",heartbeat=self.now.isoformat(),db_path=self.path)
        self.assertEqual(self.team()["health"],"missing")
        self.assertEqual(self.team()["worker_state"],"NOT_STARTED")

    def test_concurrent_initialization_creates_one_control(self):
        ensure_system_tables(self.path)
        with ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(lambda _:ensure_team_control("SPY",self.path),range(12)))
        with connect_db(self.path) as conn:
            count = conn.execute("SELECT COUNT(*) FROM team_status WHERE team_name='SPY'").fetchone()[0]
        self.assertEqual(count,1)

    def test_process_and_event_observations(self):
        upsert_process_status("team_spy",10,"RUNNING",restarts=2,notes="child alive",db_path=self.path)
        with connect_db(self.path) as conn:
            conn.execute("UPDATE process_status SET last_heartbeat=?",(self.now.isoformat(),))
            conn.execute("INSERT INTO system_events (team_name,event_type,details,created_at) "
                         "VALUES ('SPY','WORKER_START','Started process',?)",(self.now.isoformat(),))
        payload = self.payload()
        self.assertEqual(payload["summary"]["running_processes"],1)
        self.assertEqual(payload["processes"][0]["restarts"],2)
        self.assertEqual(payload["events"][0]["event_type"],"WORKER_START")
        with connect_db(self.path) as conn:
            conn.execute("UPDATE process_status SET last_heartbeat=?",
                         ((self.now-timedelta(seconds=HEARTBEAT_STALE_SECONDS+1)).isoformat(),))
        self.assertEqual(self.payload()["summary"]["running_processes"],0)

    def test_context_commits_closes_and_rolls_back(self):
        ensure_system_tables(self.path)
        conn = connect_db(self.path)
        with conn:
            conn.execute("INSERT INTO system_events (team_name,event_type) VALUES ('SPY','COMMITTED')")
        with self.assertRaises(sqlite3.ProgrammingError):
            conn.execute("SELECT 1")
        with self.assertRaises(RuntimeError):
            with connect_db(self.path) as failed:
                failed.execute("INSERT INTO system_events (team_name,event_type) VALUES ('SPY','ROLLED_BACK')")
                raise RuntimeError("abort")
        with connect_db(self.path) as conn:
            self.assertEqual([row[0] for row in conn.execute("SELECT event_type FROM system_events")],
                             ["COMMITTED"])

    def test_read_only_snapshot_keeps_legacy_file_unchanged(self):
        with closing(sqlite3.connect(self.path)) as conn, conn:
            conn.execute("CREATE TABLE team_status (team_name TEXT,active INTEGER,status TEXT)")
            conn.execute("INSERT INTO team_status VALUES ('SPY',1,'ENABLED')")
        original = self.path.read_bytes()
        self.assertTrue(self.payload()["database_available"])
        self.assertTrue(self.team()["enabled"])
        self.assertEqual(self.path.read_bytes(),original)
        with closing(sqlite3.connect(self.path)) as conn:
            tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        self.assertEqual(tables,["team_status"])

    def test_corrupt_file_reports_failure(self):
        self.path.write_bytes(b"not a sqlite database")
        self.assertFalse(self.payload()["database_available"])
        self.assertTrue(self.payload()["errors"])
        self.assertEqual(self.payload()["summary"]["fresh_workers"],0)

    def test_compatibility_and_explicit_export(self):
        ensure_team_control("SPY",self.path)
        payload = get_dashboard_payload(self.path,now=self.now)
        self.assertEqual(payload["strategy_readiness"],[])
        self.assertEqual(payload["backtest_summary"],[])
        self.assertEqual(payload["recent_events"],payload["events"])
        target = Path(self.directory.name)/"snapshot.json"
        saved = save_dashboard_snapshot(target,self.path)
        self.assertEqual(json.loads(target.read_text(encoding="utf-8")),saved)
        self.assertFalse(list(target.parent.glob("*.tmp")))

    def test_legacy_extra_team_does_not_inflate_four_bot_overview(self):
        for name in TEAM_NAMES + ["OLD_TEAM"]:
            ensure_team_control(name,self.path)
            record_worker_status(name,"STANDBY",heartbeat=self.now.isoformat(),db_path=self.path)
        payload = self.payload()
        self.assertEqual(len(payload["teams"]),5)
        self.assertEqual(payload["summary"]["total_teams"],4)
        self.assertEqual(payload["summary"]["observed_teams"],5)
        self.assertEqual(payload["summary"]["fresh_workers"],4)
        self.assertEqual(payload["summary"]["enabled_teams"],4)

    def test_relative_paths_and_nonfinite_scores(self):
        self.assertEqual(database_path("relative.db"),str((ROOT_DIR/"relative.db").resolve()))
        with self.assertRaises(ValueError):
            upsert_team_scores("SPY",score=float("inf"),db_path=self.path)
        with self.assertRaises(ValueError):
            ensure_system_tables(":memory:")


if __name__ == "__main__":
    unittest.main()
