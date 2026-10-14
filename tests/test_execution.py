import json
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from broker_adapter import (BrokerAdapter, BrokerRouter, BrokerSnapshot, BrokerOrder,
                            ExecutionMode, LiveLockedError, Position, TradePlan)
from broker_practice import PracticeAdapter
from council import record_council
from db_utils import connect_db, ensure_system_tables, ensure_team_control, save_analysis
from entry_controls import update_control
from execution_config import load_execution_settings
from execution_service import ExecutionService, deterministic_id
from order_store import execution_status
from risk_engine import RiskEngine, RiskPolicy


class FakePaperAdapter(BrokerAdapter):
    mode = ExecutionMode.PAPER
    broker_id = "fixture-paper"
    account_id = "fixture-account"
    symbols = frozenset({"AAPL", "TSLA", "SPY", "QQQ"})

    def snapshot(self, symbol): return self.state
    def lookup(self, cid): return self.orders.get(cid)
    def submit(self, plan): return self._submit(plan)

    def __init__(self):
        now = datetime.now(timezone.utc).isoformat()
        self.state = BrokerSnapshot(self.account_id, "10000", "10000", "10000", False,
                                   True, "100", "100", now, now, True, True)
        self.orders = {}
        self.snapshot = Mock(side_effect=lambda symbol: self.state)
        self.lookup = Mock(side_effect=lambda cid: self.orders.get(cid))
        self.submit = Mock(side_effect=self._submit)

    def _submit(self, plan):
        order = BrokerOrder(plan.client_order_id, "fake-" + plan.client_order_id, plan.symbol,
                            "ACCEPTED", plan.qty, plan.side)
        self.orders[plan.client_order_id] = order
        return order


class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = str(Path(self.temp.name) / "status.db")
        ensure_system_tables(self.db)
        for name in ("AAPL", "TSLA", "SPY", "QQQ"):
            ensure_team_control(name, self.db)
            update_control(name, earnings_at=(datetime.now(timezone.utc)+timedelta(days=7)).isoformat(), db_path=self.db)
        self.adapter = FakePaperAdapter()
        self.router = BrokerRouter([self.adapter])
        self.service = ExecutionService(self.router, self.db)

    def proposal(self, did="decision-1", team="AAPL", mode="paper", action=None):
        now = datetime.now(timezone.utc)
        analysis = dict(team_name=team, source="unit fixture", bar_time=now.isoformat(),
            direction="LONG", state="READY", agreement=3, required=2,
            votes=[dict(name=n, direction="LONG") for n in ("Trend", "Momentum", "VWAP")],
            indicators=dict(atr=2, vwap=100, stop_distance=2, relative_volume=2, extension_atr=.5))
        save_analysis(team, analysis, self.db)
        report = record_council(team, analysis, dict(enabled=True, entry_locked=False), {}, mode,
                                self.db, proposal_id=did)
        return dict(direction="LONG", action=action or report["action"], reason="fixture",
                    atr=2, vwap=100, stop_distance=2, analysis_time=now.isoformat())

    def execute(self, did="decision-1", team="AAPL", shadow=False, **kwargs):
        return self.service.execute(team, did, self.proposal(did, team), mode="PAPER", shadow=shadow, **kwargs)

    def test_live_is_locked_at_config_router_and_executor_boundaries(self):
        for flag in ("true", "false"):
            with patch.dict(os.environ, {"LAYLOW_EXECUTION_MODE":"LIVE", "LAYLOW_ALLOW_LIVE":"true", "LAYLOW_SHADOW_MODE":flag}):
                with self.assertRaises(LiveLockedError): load_execution_settings()
        with self.assertRaises(LiveLockedError): self.router.resolve("AAPL", "LIVE")
        with self.assertRaises(LiveLockedError): self.service.execute("AAPL", "x", {}, mode="LIVE")
        self.adapter.snapshot.assert_not_called()
        self.adapter.submit.assert_not_called()

    def test_default_configuration_is_practice_shadow(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(load_execution_settings(), dict(execution_mode="PRACTICE",shadow=True))
        with patch.dict(os.environ, {"LAYLOW_SHADOW_MODE":"maybe"}):
            with self.assertRaises(ValueError): load_execution_settings()

    def test_shadow_logs_exact_plan_without_lookup_or_submission(self):
        result = self.execute(shadow=True)
        self.assertEqual(result.status, "SHADOW")
        self.assertGreater(result.plan["qty"], 0)
        self.assertEqual(result.plan["stop"], "98.00")
        self.assertEqual(result.plan["target"], "104.00")
        self.assertGreater(float(result.plan["estimated_risk"]), 0)
        self.adapter.submit.assert_not_called()
        self.adapter.lookup.assert_not_called()
        audit = execution_status(self.db)
        self.assertEqual(audit["intents"][0]["plan"], result.plan)
        self.assertEqual(audit["history"][0]["status"], "SHADOW")
        with connect_db(self.db) as c: self.assertEqual(c.execute("SELECT COUNT(*) FROM paper_orders").fetchone()[0], 0)

    def test_paper_intent_and_submitting_history_precede_adapter_call(self):
        original = self.adapter._submit
        def submit(plan):
            with connect_db(self.db) as c:
                row = c.execute("SELECT * FROM order_intents").fetchone()
                self.assertEqual(row["status"], "SUBMITTING")
                self.assertEqual(json.loads(row["plan_json"]), plan.payload())
            return original(plan)
        self.adapter.submit.side_effect = submit
        result = self.execute()
        self.assertEqual(result.status, "ACCEPTED")
        self.assertEqual([h["status"] for h in reversed(execution_status(self.db)["history"])], ["RESERVED","SUBMITTING","ACCEPTED"])

    def test_timeout_then_restart_recovers_existing_order_without_resubmit(self):
        def accepted_then_timeout(plan):
            self.adapter._submit(plan)
            raise TimeoutError("response lost")
        self.adapter.submit.side_effect = accepted_then_timeout
        d = self.proposal()
        first = self.service.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False)
        self.assertEqual(first.status, "UNCERTAIN")
        restarted = ExecutionService(self.router, self.db)
        recovered = restarted.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False)
        self.assertEqual(recovered.status, "ACCEPTED")
        self.assertEqual(first.client_order_id, recovered.client_order_id)
        self.adapter.submit.assert_called_once()

    def test_uncertain_not_found_or_lookup_error_never_resubmits(self):
        self.adapter.submit.side_effect = TimeoutError()
        d = self.proposal()
        r = self.service.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False)
        for error in (None, PermissionError("auth")):
            self.adapter.lookup.side_effect = (lambda cid: None) if error is None else error
            self.assertEqual(self.service.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False).status,"UNCERTAIN")
        other = self.execute("decision-2", "SPY")
        self.assertEqual(other.status, "BLOCKED")
        self.adapter.submit.assert_called_once()

    def test_same_id_with_altered_terms_is_blocked(self):
        d = self.proposal()
        self.service.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False)
        d["stop_distance"] = 3
        result = self.service.execute("AAPL", "decision-1", d, mode="PAPER", shadow=False)
        self.assertEqual(result.status,"BLOCKED")
        self.adapter.submit.assert_called_once()

    def test_concurrent_duplicate_submission_has_one_broker_call(self):
        d = self.proposal()
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: ExecutionService(self.router,self.db).execute(
                "AAPL", "decision-1", d, mode="PAPER", shadow=False), range(2)))
        self.assertEqual(len({r.client_order_id for r in results}), 1)
        self.assertLessEqual(self.adapter.submit.call_count, 1)

    def test_reconciliation_tracks_partial_fill_and_final_status_history(self):
        r = self.execute()
        self.adapter.orders[r.client_order_id] = replace(self.adapter.orders[r.client_order_id], status="PARTIALLY_FILLED", filled_qty="1", filled_price="100")
        self.assertEqual(self.service.reconcile(self.adapter)["status"],"OK")
        self.adapter.orders[r.client_order_id] = replace(self.adapter.orders[r.client_order_id], filled_qty="2")
        self.service.reconcile(self.adapter)
        self.assertEqual(execution_status(self.db)["history"][0]["details"]["filled_qty"],"2")
        self.adapter.orders[r.client_order_id] = replace(self.adapter.orders[r.client_order_id], status="FILLED", filled_qty=str(r.plan["qty"]))
        self.service.reconcile(self.adapter)
        history = execution_status(self.db)["history"]
        self.assertEqual(history[0]["status"],"FILLED")
        self.assertEqual(history[0]["details"]["filled_qty"],str(r.plan["qty"]))

    def test_foreign_broker_order_terms_and_untracked_orders_block_reconciliation(self):
        r = self.execute()
        self.adapter.orders[r.client_order_id] = replace(self.adapter.orders[r.client_order_id], qty=999)
        self.assertEqual(self.service.reconcile(self.adapter)["status"],"REQUIRES_REVIEW")
        self.assertEqual(self.execute("decision-2", "SPY").status,"BLOCKED")

    def test_control_changed_during_broker_snapshot_blocks_before_submit(self):
        def snapshot(symbol):
            update_control(symbol,headline_locked=True,db_path=self.db)
            return self.adapter.state
        self.adapter.snapshot.side_effect = snapshot
        r = self.execute()
        self.assertEqual(r.status,"BLOCKED")
        self.adapter.submit.assert_not_called()

    def test_final_snapshot_rechecks_new_position_and_quote_age(self):
        self.adapter.snapshot.side_effect = [self.adapter.state, replace(self.adapter.state,positions=(Position("AAPL","1"),))]
        self.assertEqual(self.execute().status,"BLOCKED")
        self.adapter.submit.assert_not_called()

    def test_account_risk_matrix_blocks_all_invalid_entries(self):
        base = self.adapter.state
        cases = [dict(equity="9400"), dict(positions=(Position("AAPL","1"),)),
                 dict(positions=tuple(Position(s,"1") for s in ("MSFT","NVDA","IWM","DIA"))),
                 dict(open_orders=(BrokerOrder("manual","b","AAPL","NEW",1),)),
                 dict(quote_at=(datetime.now(timezone.utc)-timedelta(seconds=61)).isoformat()),
                 dict(market_open=False), dict(buying_power="1"), dict(quote_bid="NaN"),
                 dict(quote_bid="101",quote_ask="100"), dict(trading_blocked=True),
                 dict(captured_at=(datetime.now(timezone.utc)-timedelta(seconds=31)).isoformat())]
        for i, fields in enumerate(cases):
            with self.subTest(fields=fields):
                self.adapter.state = replace(base,**fields)
                r = self.execute("risk-"+str(i))
                self.assertEqual(r.status,"BLOCKED",r)
        self.adapter.submit.assert_not_called()

    def test_invalid_geometry_stale_signal_and_council_override_cannot_submit(self):
        for i, fields in enumerate((dict(stop_distance=.000001), dict(stop_distance=101),
                dict(analysis_time=(datetime.now(timezone.utc)-timedelta(seconds=301)).isoformat()),
                dict(direction="SHORT"),dict(qty=1000000,action="APPROVE"))):
            d = self.proposal("invalid-"+str(i)); d.update(fields)
            self.assertEqual(self.service.execute("AAPL","invalid-"+str(i),d,mode="PAPER",shadow=False).status,"BLOCKED")
        self.adapter.submit.assert_not_called()

    def test_trade_limits_include_pending_and_use_account_scope(self):
        self.service.risk = RiskEngine(RiskPolicy(max_daily_trades=1))
        self.execute()
        self.assertEqual(self.execute("decision-2","SPY").status,"BLOCKED")
        self.adapter.submit.assert_called_once()

    def test_broker_can_be_replaced_without_changing_teams_or_policy(self):
        other = FakePaperAdapter(); other.broker_id = "another-paper"
        router = BrokerRouter([self.adapter,other], {("PAPER","AAPL"):other.broker_id})
        service = ExecutionService(router,self.db)
        d = self.proposal()
        self.assertEqual(service.execute("AAPL","decision-1",d,mode="PAPER",shadow=False).status,"ACCEPTED")
        other.submit.assert_called_once(); self.adapter.submit.assert_not_called()
        with self.assertRaises(ValueError): router.resolve("SPY","PAPER")
        with self.assertRaises(ValueError): router.resolve("MES1!","PAPER")

    def test_practice_fake_account_is_durable_and_never_constructs_external_clients(self):
        adapter = PracticeAdapter(self.db); adapter.set_quote("SPY",100)
        service = ExecutionService(BrokerRouter([adapter]),self.db)
        d = self.proposal("practice-1","SPY","practice")
        result = service.execute("SPY","practice-1",d,mode="PRACTICE",shadow=False)
        self.assertEqual(result.status,"FILLED")
        restored = PracticeAdapter(self.db); restored.set_quote("SPY",100)
        self.assertEqual(restored.lookup(result.client_order_id).filled_qty,str(result.plan["qty"]))
        self.assertEqual(restored.snapshot("SPY").equity,"50000")
        self.assertEqual(len(restored.snapshot("SPY").positions),1)

    def test_source_proposal_identity_survives_worker_restart(self):
        from council import review_proposal
        self.proposal("seed", "SPY")
        with connect_db(self.db) as c:
            analysis=json.loads(c.execute("SELECT payload_json FROM team_analysis WHERE team_name='SPY'").fetchone()[0])
        a=review_proposal("SPY",analysis,"paper",self.db)
        b=review_proposal("SPY",analysis,"paper",self.db)
        self.assertEqual(a["proposal_id"],b["proposal_id"])
        self.assertEqual(a["generated_at"],b["generated_at"])

    def test_council_reduction_cannot_be_overridden_by_ai_sizing(self):
        d=self.proposal();d["qty"]=100000000
        result=self.service.execute("AAPL","decision-1",d,mode="PAPER",shadow=True)
        self.assertEqual(result.status,"SHADOW")
        self.assertLess(result.plan["qty"],10)
        self.adapter.submit.assert_not_called()

    def test_invalid_broker_fill_and_unknown_open_order_are_audited(self):
        r=self.execute()
        self.adapter.orders[r.client_order_id]=replace(self.adapter.orders[r.client_order_id],status="FILLED",filled_qty="NaN")
        self.assertEqual(self.service.reconcile(self.adapter)["status"],"REQUIRES_REVIEW")
        self.assertEqual(execution_status(self.db)["history"][0]["status"],"UNCERTAIN")

    def test_risk_geometry_and_freshness_are_independent_of_council(self):
        d=self.proposal()
        for fields in (dict(stop_distance=.0000001),dict(stop_distance=101),
                       dict(analysis_time=(datetime.now(timezone.utc)-timedelta(seconds=301)).isoformat())):
            plan,reasons=self.service.risk.evaluate(team="AAPL",decision_id="x",decision=dict(d,**fields),
                adapter=self.adapter,snapshot=self.adapter.state,client_id="x",
                controls=dict(enabled=True,entry_locked=False),council_error=None)
            self.assertTrue(reasons)

    def test_reconciler_default_starts_and_stops_without_clients(self):
        import reconciliation_worker
        stop=Mock();stop.is_set.side_effect=[False,True]
        with patch("reconciliation_worker.load_execution_settings",return_value=dict(execution_mode="PRACTICE",shadow=True)),patch("reconciliation_worker.build_router") as factory:
            self.assertEqual(reconciliation_worker.main(stop),0)
        factory.assert_not_called();stop.wait.assert_called_once_with(30)

    def test_concurrent_teams_share_position_and_buying_power_limits(self):
        self.service.risk=RiskEngine(RiskPolicy(max_open_positions=1))
        decisions={name:self.proposal("concurrent-"+name,name) for name in ("AAPL","SPY")}
        with ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda team:self.service.execute(team,"concurrent-"+team,decisions[team],mode="PAPER",shadow=False),("AAPL","SPY")))
        self.adapter.submit.assert_called_once()
        self.assertEqual(sum(r.status=="BLOCKED" for r in results),1)

    def test_alpaca_adapter_constructor_is_paper_only(self):
        from broker_alpaca import AlpacaPaperAdapter
        from types import SimpleNamespace
        with patch("alpaca.trading.client.TradingClient") as client,patch("alpaca.data.historical.StockHistoricalDataClient"):
            client.return_value.get_account.return_value=SimpleNamespace(id="fixture-account")
            adapter=AlpacaPaperAdapter("fixture-key","fixture-secret")
            client.assert_called_once_with("fixture-key","fixture-secret",paper=True)
            self.assertEqual(adapter.mode,ExecutionMode.PAPER)
            self.assertEqual(adapter.account_id,"fixture-account")

    def test_alpaca_lookup_only_treats_explicit_404_as_not_found(self):
        from broker_alpaca import AlpacaPaperAdapter
        from alpaca.common.exceptions import APIError
        from types import SimpleNamespace
        adapter=AlpacaPaperAdapter.__new__(AlpacaPaperAdapter)
        adapter._client=Mock()
        for code in (404,401,403,429,500):
            adapter._client.get_order_by_client_id.side_effect=APIError('{}',SimpleNamespace(response=SimpleNamespace(status_code=code)))
            if code==404: self.assertIsNone(adapter.lookup("fixture"))
            else:
                with self.assertRaises(APIError): adapter.lookup("fixture")


if __name__ == "__main__": unittest.main()
