"""Private iPhone / PC access checks; no Tailscale or provider connection needed."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from dashboard import create_app


HOSTNAME = "laylow-pc.example-tailnet.ts.net"


class PrivatePhoneAccessTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        with patch.dict(os.environ, {"LAYLOW_TAILSCALE_HOSTNAME": HOSTNAME}):
            self.app = create_app(db_path=Path(self.directory.name) / "status.db")
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def private_headers(self, *, identity=True, proto=True):
        headers = {"Host": HOSTNAME, "X-Forwarded-Host": HOSTNAME}
        if proto:
            headers["X-Forwarded-Proto"] = "https"
        if identity:
            headers["Tailscale-User-Login"] = "owner@example.com"
        return headers

    def test_private_https_requires_serve_identity(self):
        self.assertEqual(self.client.get("/api/status", headers=self.private_headers()).status_code, 200)
        self.assertEqual(self.client.get("/api/status", headers=self.private_headers(identity=False)).status_code, 403)
        self.assertEqual(self.client.get("/api/status", headers=self.private_headers(proto=False)).status_code, 403)

    def test_reject_other_hosts_and_non_loopback_forwarders(self):
        self.assertEqual(self.client.get("/api/status", headers={
            **self.private_headers(), "Host": "evil.test", "X-Forwarded-Host": "evil.test"
        }).status_code, 403)
        self.assertEqual(self.client.get("/api/status", headers=self.private_headers(),
                                         environ_base={"REMOTE_ADDR": "100.100.100.10"}).status_code, 403)

    def test_loopback_unaffected(self):
        self.assertEqual(self.client.get("/api/status").status_code, 200)

    def test_owner_setup_over_private_https_preserves_origin_check(self):
        with self.client.session_transaction() as session:
            session["login_csrf"] = "private-setup-csrf"
        headers = self.private_headers()
        headers["Origin"] = "https://" + HOSTNAME
        response = self.client.post("/auth/setup", headers=headers, data={
            "csrf": "private-setup-csrf", "password": "private-test-password-2026",
            "confirm": "private-test-password-2026"
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.client.get("/api/atlas/status",
                                         headers=self.private_headers()).status_code, 200)

    def test_wrong_origin_rejected_during_setup(self):
        with self.client.session_transaction() as session:
            session["login_csrf"] = "wrong-origin-test"
        headers = self.private_headers()
        headers["Origin"] = "http://" + HOSTNAME
        response = self.client.post("/auth/setup", headers=headers, data={
            "csrf": "wrong-origin-test", "password": "private-test-password-2026",
            "confirm": "private-test-password-2026"
        })
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
