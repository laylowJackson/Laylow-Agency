import tempfile
import unittest
from pathlib import Path
from datetime import datetime,timedelta,timezone
from unittest.mock import Mock,patch
from council import assess_council,record_council,authorization_error
from db_utils import connect_db,ensure_system_tables,ensure_team_control,save_analysis
from team_worker import TeamWorker,ensure_ledger,submit_paper_order
from dashboard_status import build_dashboard_payload
NOW=datetime.now(timezone.utc)
def proposal():
    return dict(team_name="SPY",source="unit fixture",bar_time=NOW.isoformat(),
        direction="LONG",state="READY",agreement=2,required=2,
        votes=[dict(name="Momentum",direction="LONG"),dict(name="Trend",direction="LONG"),dict(name="VWAP",direction="SHORT")],
        indicators=dict(atr=2,vwap=100,stop_distance=2.5,relative_volume=1.3,extension_atr=1.2))
class CouncilTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.db=str(Path(self.temp.name)/"status.db")
        ensure_system_tables(self.db);ensure_team_control("SPY",self.db);ensure_ledger(self.db)
    def review(self,analysis=None):
        return assess_council("SPY",analysis or proposal(),dict(enabled=True,entry_locked=False),{},"paper",now=NOW)
    def save(self):
        a=proposal();save_analysis("SPY",a,self.db)
        r=record_council("SPY",a,dict(enabled=True,entry_locked=False),{},"paper",self.db,now=NOW,proposal_id="proposal-1")
        return r,dict(direction="LONG",action=r["action"],analysis_time=a["bar_time"],**r["order_terms"])
    def test_distinct_opinions_and_reduction(self):
        r=self.review();votes={m["name"]:m["vote"] for m in r["members"]}
        self.assertEqual(len(votes),6);self.assertEqual(votes["Flux"],"APPROVE");self.assertEqual(votes["Proof"],"WAIT")
        self.assertEqual(votes["Anchor"],"REDUCE_RISK");self.assertEqual(r["action"],"REDUCE_RISK");self.assertEqual(r["favorable_votes"],5)
    def test_locks_and_uncertain_orders_cannot_be_outvoted(self):
        for c,l in [(dict(enabled=False),{}),(dict(enabled=True,entry_locked=True),{}),(dict(enabled=True),dict(pending_or_uncertain=1))]:
            r=assess_council("SPY",proposal(),c,l,"paper",now=NOW)
            self.assertEqual(r["action"],"SKIP");self.assertFalse(r["entry_eligible"]);self.assertEqual(r["members"][-1]["vote"],"VETO")
    def test_quorum_and_invalid_evidence(self):
        a=proposal();a["votes"][0]["name"]="Mean Reversion";a["indicators"]["extension_atr"]=1.7
        self.assertEqual(self.review(a)["favorable_votes"],3);self.assertEqual(self.review(a)["action"],"SKIP")
        for stamp in [(NOW-timedelta(seconds=301)).isoformat(),(NOW+timedelta(seconds=31)).isoformat(),None]:
            a=proposal();a["bar_time"]=stamp;self.assertFalse(self.review(a)["entry_eligible"])
        for value in (float("nan"),-1,0):
            a=proposal();a["indicators"]["relative_volume"]=value;self.assertEqual(self.review(a)["action"],"SKIP")
    def test_observe_analyze_and_futures_have_no_order_authority(self):
        for mode in ("observe","analyze"):
            self.assertFalse(assess_council("SPY",proposal(),dict(enabled=True),{},mode,now=NOW)["entry_eligible"])
        r=assess_council("MES1!",proposal(),dict(enabled=True),{},"paper",now=NOW)
        self.assertTrue(r["watch_only"]);self.assertFalse(r["entry_eligible"])
    def test_identity_terms_source_and_freshness_bound(self):
        r,d=self.save()
        with connect_db(self.db) as c:
            self.assertIsNone(authorization_error(c,"SPY","proposal-1",d,now=NOW))
            self.assertIsNotNone(authorization_error(c,"SPY","another",d,now=NOW))
            self.assertIsNotNone(authorization_error(c,"QQQ","proposal-1",d,now=NOW))
            self.assertIsNotNone(authorization_error(c,"SPY","proposal-1",dict(d,action="APPROVE"),now=NOW))
            self.assertIsNotNone(authorization_error(c,"SPY","proposal-1",dict(d,atr=3),now=NOW))
            self.assertIsNotNone(authorization_error(c,"SPY","proposal-1",d,now=NOW+timedelta(seconds=301)))
        a=proposal();a["source"]="different";save_analysis("SPY",a,self.db)
        with connect_db(self.db) as c:self.assertIn("changed",authorization_error(c,"SPY","proposal-1",d,now=NOW))
    def test_missing_approval_blocks_before_broker_calls(self):
        d=dict(direction="LONG",action="APPROVE",analysis_time=NOW.isoformat(),atr=2,vwap=100,stop_distance=2.5)
        services=Mock();r=submit_paper_order("SPY","missing",d,100,services,self.db)
        self.assertIn("Council",r);services.broker.get_clock.assert_not_called();services.broker.submit_order.assert_not_called()
    def test_worker_veto_prevents_ai_request(self):
        services=Mock();services.bars.return_value=[]
        settings=dict(mode="analyze",openai_key="fixture",alpaca_key="fixture",alpaca_secret="fixture",model="fixture",paper_enabled=False)
        w=TeamWorker("SPY",self.db,lambda:settings,lambda settings:services)
        with patch("team_worker.evaluate_team",return_value=dict(proposal(),direction="SKIP",reason="No consensus")),patch("team_worker.utc_now",return_value=NOW):w.cycle()
        services.decide.assert_not_called();p=build_dashboard_payload(self.db,now=NOW)
        self.assertEqual(p["council"]["history"][0]["action"],"SKIP");self.assertEqual(len(p["council"]["reviews"]),10)
    def test_dashboard_read_only(self):
        save_analysis("SPY",proposal(),self.db)
        for _ in range(2):self.assertEqual(build_dashboard_payload(self.db,now=NOW)["council"]["history"],[])
