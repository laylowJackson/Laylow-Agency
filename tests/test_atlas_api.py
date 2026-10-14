"""HTTP security regression checks for the optional ATLAS chat API."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dashboard import create_app


class AtlasApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.database = Path(self.folder.name) / "status.db"
        self.app = create_app(db_path=self.database)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def login_owner(self):
        with self.client.session_transaction() as session:
            session["login_csrf"] = "test-csrf-for-owner-setup"
        response = self.client.post(
            "/auth/setup",
            data={"csrf": "test-csrf-for-owner-setup",
                  "password": "long-test-password-2026",
                  "confirm": "long-test-password-2026"},
            headers={"Origin": "http://localhost"},
        )
        self.assertEqual(response.status_code, 302)

    def body(self, **changes):
        return {"question": "Why is AAPL on caution?", "team_name": "AAPL"} | changes

    def csrf(self):
        return {"X-Laylow-CSRF": self.app.config["CONTROL_CSRF"],
                "Origin": "http://localhost"}

    def test_requires_owner_setup(self):
        self.assertEqual(self.client.get("/api/atlas/status").status_code, 403)
        self.assertEqual(self.client.post("/api/atlas/chat", json=self.body(),
                                          headers=self.csrf()).status_code, 403)

    def test_requires_existing_authenticated_session(self):
        self.login_owner()
        second = self.app.test_client()
        self.assertEqual(second.get("/api/atlas/status").status_code, 401)
        self.assertEqual(second.post("/api/atlas/chat", json=self.body(),
                                     headers=self.csrf()).status_code, 401)

    def test_owner_gets_status_with_no_secrets(self):
        self.login_owner()
        response = self.client.get("/api/atlas/status")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("configured", data)
        self.assertTrue(data["live_locked"])
        self.assertFalse(data["orders_allowed"])
        self.assertNotIn("OPENAI_API_KEY", str(data))

    def test_rejects_csrf_bad_origin_and_bad_body(self):
        self.login_owner()
        self.assertEqual(self.client.post("/api/atlas/chat", json=self.body()).status_code, 403)
        self.assertEqual(self.client.post("/api/atlas/chat", json=self.body(),
                                          headers={"X-Laylow-CSRF": self.csrf()["X-Laylow-CSRF"],
                                                   "Origin": "http://evil.invalid"}).status_code, 403)
        self.assertEqual(self.client.post("/api/atlas/chat", json=self.body(team_name="BAD"),
                                          headers=self.csrf()).status_code, 400)
        self.assertEqual(self.client.post("/api/atlas/chat", json=self.body(question="a"),
                                          headers=self.csrf()).status_code, 400)

    def test_valid_request_only_returns_read_only_response(self):
        self.login_owner()
        snapshot = {"database_available": True}
        expected = {"status": "ready", "scope": "AAPL", "answer": "Test answer",
                    "cautions": [], "orders_sent": False, "live_locked": True}
        with patch("dashboard.build_dashboard_payload", return_value=snapshot), \
             patch("dashboard.answer_question", return_value=expected) as handler:
            response = self.client.post("/api/atlas/chat", json=self.body(),
                                        headers=self.csrf())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        handler.assert_called_once_with(self.body()["question"], "AAPL", snapshot)

    def test_rate_limit_prevents_sixth_request(self):
        self.login_owner()
        with patch("dashboard.build_dashboard_payload", return_value={"database_available": True}), \
             patch("dashboard.answer_question", return_value={"answer": "OK"}) as ai:
            responses = [self.client.post("/api/atlas/chat", json=self.body(),
                                          headers=self.csrf()) for _ in range(6)]
        self.assertEqual([r.status_code for r in responses], [200] * 5 + [429])
        self.assertEqual(ai.call_count, 5)


if __name__ == "__main__":
    unittest.main()
