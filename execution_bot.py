"""Offline walkthrough of the execution gateway. Never starts an external broker."""
import argparse
import json
from dataclasses import asdict
from datetime import datetime, timezone
from broker_adapter import BrokerRouter
from broker_practice import PracticeAdapter
from council import record_council
from db_utils import ensure_system_tables, ensure_team_control, save_analysis
from execution_service import ExecutionService


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="execution_demo.db", help="Separate fake-money demo database")
    parser.add_argument("--decision-id", default="offline-demo-1", help="Stable ID; retries never duplicate a fill")
    parser.add_argument("--submit-practice", action="store_true", help="Record one local fake fill instead of shadow only")
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat()
    ensure_system_tables(args.db); ensure_team_control("SPY",args.db)
    adapter = PracticeAdapter(args.db); adapter.set_quote("SPY",100)
    service = ExecutionService(BrokerRouter([adapter]),args.db)
    # Explicit synthetic fixture, not a forecast or live market observation.
    analysis = dict(team_name="SPY",source="OFFLINE SYNTHETIC DEMO",bar_time=now,
        direction="LONG",state="READY",agreement=3,required=2,
        votes=[dict(name=n,direction="LONG") for n in ("Trend","Momentum","VWAP")],
        indicators=dict(atr=2,vwap=100,stop_distance=2,relative_volume=2,extension_atr=.5))
    from db_utils import connect_db
    with connect_db(args.db) as c:
        prior=c.execute("SELECT proposal_json FROM order_intents WHERE decision_id=? ORDER BY created_at LIMIT 1",(args.decision_id,)).fetchone()
    if prior:
        decision=json.loads(prior[0])
    else:
        save_analysis("SPY",analysis,args.db)
        report=record_council("SPY",analysis,dict(enabled=True,entry_locked=False),{},"practice",args.db,proposal_id=args.decision_id)
        decision=dict(direction="LONG",action=report["action"],reason="Offline synthetic walkthrough",
                      atr=2,vwap=100,stop_distance=2,analysis_time=now)
    result=service.execute("SPY",args.decision_id,decision,mode="PRACTICE",shadow=not args.submit_practice)
    print(json.dumps(dict(market="SYNTHETIC",real_orders_sent=0,**asdict(result)),indent=2))
    return 0 if result.status in {"SHADOW","FILLED"} else 1

if __name__ == "__main__": raise SystemExit(main())
