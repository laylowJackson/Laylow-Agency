import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from db_utils import connect_db, ensure_system_tables, ensure_team_control
from entry_controls import update_control
from team_worker import (
    TeamWorker, Services, ensure_ledger, missing_settings, parse_decision,
    size_trade, submit_paper_order, validate_quote,
)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = str(Path(self.temp.name) / "status.db")
        ensure_system_tables(self.db)
        ensure_team_control("AAPL", self.db)
        ensure_ledger(self.db)
        self.settings = dict(mode="observe", openai_key="", alpaca_key="",
                             alpaca_secret="", model="gpt-4o-mini", paper_enabled=False)

    def test_blank_keys_start_without_any_provider_client(self):
        factory = Mock(side_effect=AssertionError("Provider must not be created"))
        worker = TeamWorker("AAPL", self.db, lambda: self.settings, factory)
        worker.cycle()
        self.assertEqual(worker.state, "STANDBY")
        factory.assert_not_called()
        with connect_db(self.db) as conn:
            row = conn.execute("SELECT * FROM worker_status WHERE team_name='AAPL'").fetchone()
            self.assertEqual(row["state"], "STANDBY")

    def test_missing_keys_and_disabled_team_do_not_call_provider(self):
        self.settings["mode"] = "analyze"
        factory = Mock()
        worker = TeamWorker("AAPL", self.db, lambda: self.settings, factory)
        worker.cycle()
        self.assertEqual(worker.state, "WAITING_CONFIGURATION")
        with connect_db(self.db) as conn:
            conn.execute("UPDATE team_status SET active=0 WHERE team_name='AAPL'")
        worker.cycle()
        self.assertEqual(worker.state, "DISABLED")
        factory.assert_not_called()

    def test_disabled_control_status_blocks_work_even_with_active_flag(self):
        factory = Mock()
        worker = TeamWorker("AAPL", self.db, lambda: self.settings, factory)
        with connect_db(self.db) as conn:
            conn.execute("UPDATE team_status SET active=1,status='PAUSED' WHERE team_name='AAPL'")
        worker.cycle()
        self.assertEqual(worker.state, "DISABLED")
        factory.assert_not_called()

    def test_paper_mode_requires_both_mode_and_explicit_switch(self):
        self.settings.update(mode="paper", openai_key="test", alpaca_key="test",
                             alpaca_secret="test")
        self.assertEqual(missing_settings(self.settings), ["LAYLOW_ALLOW_PAPER_ORDERS=true"])

    def test_invalid_ai_text_never_becomes_short(self):
        for raw in ("SELL", "[]", '{"direction":"sell","action":"APPROVE","reason":"x"}',
                    '{"direction":"LONG","action":"APPROVE"}'):
            with self.subTest(raw=raw), self.assertRaises((ValueError, json.JSONDecodeError)):
                parse_decision(raw)
        self.assertEqual(parse_decision(
            '{"direction":"LONG","action":"SKIP","reason":"Insufficient evidence"}'
        )["action"], "SKIP")

    def test_stale_crossed_future_and_nonfinite_quotes_rejected(self):
        now = datetime.now(timezone.utc)
        for bid, ask, stamp in (
            (100, 101, now - timedelta(seconds=61)),
            (101, 100, now),
            (100, 101, now + timedelta(seconds=10)),
            (float("nan"), 101, now),
        ):
            with self.subTest(bid=bid, ask=ask), self.assertRaises(ValueError):
                validate_quote(SimpleNamespace(bid_price=bid, ask_price=ask,
                                               timestamp=stamp), now)
        self.assertEqual(validate_quote(SimpleNamespace(
            bid_price=100, ask_price=100.5, timestamp=now), now), 100.25)

    def test_size_never_forces_unaffordable_share_and_honors_day_loss(self):
        account = SimpleNamespace(equity=10000, last_equity=10000, buying_power=9000,
                                  trading_blocked=False, account_blocked=False)
        self.assertEqual(size_trade(account, 200), 5)  # $1,000 notional cap
        account.buying_power = 50
        self.assertEqual(size_trade(account, 200), 0)
        account.buying_power = 9000
        account.equity = 9400
        self.assertEqual(size_trade(account, 200), 0)
        account.equity = 100
        account.last_equity = 100
        self.assertGreater(size_trade(account, 10), size_trade(account, 10, True))

    def make_services(self):
        update_control("AAPL", earnings_at=(datetime.now(timezone.utc)+timedelta(days=7)).isoformat(), db_path=self.db)
        broker = Mock()
        broker.get_clock.return_value = SimpleNamespace(is_open=True)
        broker.get_all_positions.return_value = []
        broker.get_orders.return_value = []
        broker.get_asset.return_value = SimpleNamespace(tradable=True, shortable=True,
                                                       easy_to_borrow=True)
        broker.get_account.return_value = SimpleNamespace(
            equity=10000, last_equity=10000, buying_power=10000,
            trading_blocked=False, account_blocked=False)
        broker.submit_order.return_value = SimpleNamespace(id="fake-order", status="accepted")
        services = Mock()
        services.broker = broker
        services.quote.return_value = 100
        services.paper_request.return_value = object()
        return services

    def test_uncertain_submission_blocks_repeated_and_new_intents(self):
        services = self.make_services()
        services.broker.submit_order.side_effect = TimeoutError("fake timeout")
        decision = dict(direction="LONG", action="APPROVE", reason="test", stop_distance=2, atr=2, vwap=100, analysis_time=datetime.now(timezone.utc).isoformat())
        result = submit_paper_order("AAPL", "decision-1", decision, 100,
                                   services, self.db)
        self.assertIn("uncertain", result)
        submit_paper_order("AAPL", "decision-1", decision, 100, services, self.db)
        submit_paper_order("AAPL", "decision-2", decision, 100, services, self.db)
        self.assertEqual(services.broker.submit_order.call_count, 1)
        with connect_db(self.db) as conn:
            self.assertEqual(conn.execute("SELECT status FROM paper_orders").fetchone()[0],
                             "UNCERTAIN")

    def test_history_skip_and_disable_after_analysis_block_submission(self):
        services = self.make_services()
        decision = dict(direction="LONG", action="SKIP", reason="test", stop_distance=2, atr=2, vwap=100, analysis_time=datetime.now(timezone.utc).isoformat())
        submit_paper_order("AAPL", "decision-1", decision, 100, services, self.db)
        services.broker.submit_order.assert_not_called()
        decision["action"] = "APPROVE"
        submit_paper_order("AAPL", "decision-2", decision, 100, services, self.db,
                           enabled_check=lambda: False)
        services.broker.submit_order.assert_not_called()

    def test_profit_brake_blocks_before_broker_queries(self):
        from trading_records import set_profit_brake, import_closed_trades
        services = self.make_services()
        now = datetime.now(timezone.utc)
        set_profit_brake("AAPL", "50", self.db)
        import_closed_trades([dict(trade_id="profit",team_name="AAPL",
            closed_at=now.isoformat(),gross_pnl="50",fees="0")],
            "paper-account", "paper", now, self.db, now=now)
        decision = dict(direction="LONG",action="APPROVE",reason="test",
            stop_distance=2,atr=2,vwap=100,analysis_time=now.isoformat())
        result = submit_paper_order("AAPL","blocked-profit",decision,100,services,self.db)
        self.assertIn("PROFIT_BRAKE_HIT",result)
        services.broker.get_clock.assert_not_called()
        services.broker.submit_order.assert_not_called()

    def test_profit_import_during_request_build_blocks_intent_transaction(self):
        from trading_records import set_profit_brake, import_closed_trades
        services = self.make_services()
        now = datetime.now(timezone.utc)
        set_profit_brake("AAPL", "50", self.db)
        import_closed_trades([], "paper-account", "paper", now, self.db, now=now)
        def crossing_target(*args):
            stamp = datetime.now(timezone.utc)
            import_closed_trades([dict(trade_id="race-profit",team_name="AAPL",
                closed_at=stamp.isoformat(),gross_pnl="51",fees="0")],
                "paper-account", "paper", stamp, self.db, now=stamp)
            return object()
        services.paper_request.side_effect = crossing_target
        decision = dict(direction="LONG",action="APPROVE",reason="test",
            stop_distance=2,atr=2,vwap=100,analysis_time=now.isoformat())
        result = submit_paper_order("AAPL","race-profit",decision,100,services,self.db)
        self.assertIn("PROFIT_BRAKE_HIT",result)
        services.paper_request.assert_called_once()
        services.broker.submit_order.assert_not_called()
        with connect_db(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM paper_orders").fetchone()[0],0)

    def test_sdk_request_attaches_exit_orders_and_client_id(self):
        services = Services.__new__(Services)  # no clients or API calls
        order = services.paper_request("AAPL", dict(direction="LONG"), 100, 2, "test-id")
        self.assertEqual(order.stop_loss.stop_price, 98)
        self.assertEqual(order.take_profit.limit_price, 104)
        self.assertEqual(order.client_order_id, "test-id")
        self.assertEqual(order.order_class.value, "bracket")


if __name__ == "__main__":
    unittest.main()
