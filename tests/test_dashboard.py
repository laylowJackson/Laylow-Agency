"""HTTP checks; never contact providers or execute workers."""
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from dashboard import create_app


class DashboardHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "status.db"
        self.app = create_app(db_path=self.database)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_root_serves_status_ui_and_disables_cache(self):
        response = self.client.get("/")
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Bots in view.", response.data)
        self.assertIn(b"/api/status", response.data)
        self.assertNotIn(b"Math.random", response.data)
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")

    def test_empty_database_does_not_report_fresh_workers(self):
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue({"generated_at", "mode", "summary", "teams", "processes", "events"} <= payload.keys())
        self.assertEqual(payload["summary"]["fresh_workers"], 0)
        self.assertFalse(any(team["health"] == "fresh" for team in payload["teams"]))
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_status_passes_real_observation_payload_to_client(self):
        payload = {"generated_at": "2026-10-08T12:00:00+00:00", "mode": "observe",
                   "database_available": True, "summary": {}, "teams": [{"name": "AAPL", "notes": "<script>text</script>"}],
                   "processes": [], "events": []}
        with patch("dashboard.build_dashboard_payload", return_value=payload) as build:
            response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), payload)
        build.assert_called_once_with(db_path=str(self.database))

    def test_relative_override_normalizes_once_for_api_and_health(self):
        with patch("dashboard.database_path", return_value=str(self.database)) as normalize:
            app = create_app("relative-status.db")
        normalize.assert_called_once_with("relative-status.db")
        self.assertEqual(app.config["DATABASE_PATH"], str(self.database))
        client = app.test_client()
        self.assertEqual(client.get("/api/status").status_code, 200)
        self.assertEqual(client.get("/healthz").status_code, 200)

    def test_missing_database_returns_service_unavailable(self):
        self.database.unlink()
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["database_available"])
        self.assertFalse(self.database.exists())

    def test_api_failure_does_not_expose_exception(self):
        with patch("dashboard.build_dashboard_payload", side_effect=sqlite3.OperationalError("sensitive internal detail")):
            response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"], "status_unavailable")
        self.assertNotIn(b"sensitive internal detail", response.data)

    def test_health_does_not_create_missing_database(self):
        self.assertEqual(self.client.get("/healthz").status_code, 200)
        self.database.unlink()
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(self.database.exists())

    def test_corrupt_database_is_unhealthy(self):
        self.database.write_bytes(b"This is not a SQLite database.")
        self.assertEqual(self.client.get("/healthz").status_code, 503)

    def test_dashboard_is_read_only(self):
        self.assertEqual(self.client.post("/api/status", json={"enabled": True}).status_code, 405)
        for route in ("enable", "disable", "restart"):
            self.assertEqual(self.client.post("/" + route + "/AAPL").status_code, 404)


if __name__ == "__main__":
    unittest.main()
