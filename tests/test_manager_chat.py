"""ATLAS GPT advisory unit tests; never contact OpenAI or a broker."""
import copy
import json
import os
import unittest
from unittest.mock import patch

from manager_chat import (
    ManagerChatError,
    answer_question,
    build_context,
    connection_status,
)

SAMPLE = {
    "generated_at": "2026-10-14T14:35:00+00:00",
    "mode": "observe",
    "teams": [
        {
            "name": "AAPL",
            "health": "fresh",
            "worker_state": "STANDBY",
            "controls": {"entry_locked": True, "lock_reason": "earnings unknown"},
            "analysis": {
                "source": "Alpaca IEX",
                "bar_time": "2026-10-14T14:32:00+00:00",
                "state": "READY",
                "direction": "SKIP",
                "agreement": 1,
                "required": 2,
                "indicators": {"atr": 3.25, "vwap": 195.2},
                "votes": [{"name": "Trend", "direction": "SKIP", "reason": "No trend"}],
                "API_SECRET": "should-never-leak",
            },
        },
        {"name": "TSLA", "health": "missing", "worker_state": "NOT_STARTED"},
    ],
    "managers": [
        {
            "team_name": "AAPL",
            "severity": "CAUTION",
            "summary": "Earnings not verified",
            "generated_at": "2026-10-14T14:34:00+00:00",
        }
    ],
    "big_manager": {
        "severity": "CAUTION",
        "summary": "One team needs attention",
        "generated_at": "2026-10-14T14:34:00+00:00",
    },
    "payroll": {
        "available": False,
        "fresh": False,
        "basis": "No complete paper ledger",
        "workers": [{"team_name": "AAPL", "wins": 0, "losses": 0, "net_cents": None}],
    },
    "csrf_token": "SECRET_TOKEN",
    "account": {"api_key": "SENSITIVE"},
    "recent_orders": [{"client_order_id": "secret-account-id"}],
}


class FakeResult:
    def __init__(self, content):
        self.choices = [type("Choice", (), {"message": type("Message", (), {"content": content})()})()]


class FakeCompletions:
    def __init__(self, content):
        self.content = content
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return FakeResult(self.content)


class FakeOpenAI:
    def __init__(self, content):
        self.chat = type("Chat", (), {"completions": FakeCompletions(content)})()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class ManagerChatTests(unittest.TestCase):
    def test_team_filter_never_leaks_unrelated_rows(self):
        context = build_context(SAMPLE, "AAPL")
        self.assertEqual([row["symbol"] for row in context["teams"]], ["AAPL"])
        self.assertEqual(context["closed_trades"]["workers"][0]["team"], "AAPL")
        self.assertNotIn("TSLA", json.dumps(context))

    def test_context_allowlist_excludes_credentials_and_order_details(self):
        context = build_context(SAMPLE)
        serialized = json.dumps(context)
        for secret in ("SENSITIVE", "SECRET_TOKEN", "secret-account-id", "should-never-leak"):
            self.assertNotIn(secret, serialized)
        self.assertTrue(context["live_locked"])
        self.assertFalse(context["closed_trades"]["available"])

    def test_unknown_team_rejected(self):
        with self.assertRaises(ManagerChatError) as caught:
            build_context(SAMPLE, "UNKNOWN")
        self.assertEqual(caught.exception.code, "unknown_team")

    def test_missing_settings_are_explicit(self):
        with patch.dict(os.environ, {"LAYLOW_MANAGER_AI": "false", "OPENAI_API_KEY": ""}):
            self.assertEqual(connection_status()["status"], "disabled")
        with patch.dict(os.environ, {"LAYLOW_MANAGER_AI": "true", "OPENAI_API_KEY": ""}):
            self.assertEqual(connection_status()["status"], "waiting_configuration")

    def test_answer_calls_provider_only_when_configured(self):
        fake = FakeOpenAI(json.dumps({"answer": "The stored AAPL manager report indicates earnings are unverified.", "cautions": ["No verified paper fills."]}))
        with patch.dict(os.environ, {"LAYLOW_MANAGER_AI": "true", "OPENAI_API_KEY": "test-only", "OPENAI_MODEL": "gpt-4o-mini"}):
            result = answer_question("What is wrong with AAPL?", "AAPL", SAMPLE, client_factory=lambda **kwargs: fake)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["scope"], "AAPL")
        self.assertFalse(result["orders_sent"])
        self.assertEqual(result["cautions"], ["No verified paper fills."])
        self.assertEqual(fake.chat.completions.kwargs["response_format"], {"type": "json_object"})
        self.assertNotIn("SENSITIVE", json.dumps(fake.chat.completions.kwargs))

    def test_invalid_question_does_not_call_provider(self):
        with patch.dict(os.environ, {"LAYLOW_MANAGER_AI": "true", "OPENAI_API_KEY": "test-only"}):
            with self.assertRaises(ManagerChatError):
                answer_question("x", "ALL", SAMPLE, client_factory=lambda **kwargs: self.fail("provider called"))

    def test_invalid_provider_reply_returns_safe_unavailable(self):
        fake = FakeOpenAI("not-json")
        with patch.dict(os.environ, {"LAYLOW_MANAGER_AI": "true", "OPENAI_API_KEY": "test-only"}):
            with self.assertRaises(ManagerChatError) as caught:
                answer_question("Explain the reports", "ALL", SAMPLE, client_factory=lambda **kwargs: fake)
        self.assertEqual(caught.exception.code, "ai_provider_unavailable")

    def test_input_snapshot_not_mutated(self):
        original = copy.deepcopy(SAMPLE)
        build_context(SAMPLE, "AAPL")
        self.assertEqual(SAMPLE, original)


if __name__ == "__main__":
    unittest.main()
