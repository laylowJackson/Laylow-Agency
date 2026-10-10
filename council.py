"""Distinct deterministic risk personalities; no model calls or order capability."""
import hashlib
import json
import math
import uuid
from datetime import datetime, timezone
from config import TEAM_NAMES, STOCK_TEAM_NAMES
from db_utils import connect_db, ensure_system_tables
from entry_controls import parse_utc
POLICY_VERSION="council-v1"
MEMBERS=(
 dict(id="anchor",name="Anchor",personality="Patient capital protector",risk="Conservative",color="#74c8ff"),
 dict(id="proof",name="Proof",personality="Evidence first; wants broad agreement",risk="Measured",color="#ad94ff"),
 dict(id="flux",name="Flux",personality="Momentum seeker; tolerates disagreement",risk="Assertive",color="#ff7cb0"),
 dict(id="rebel",name="Rebel",personality="Contrarian; challenges crowded entries",risk="Skeptical",color="#ffb86c"),
 dict(id="steward",name="Steward",personality="Volatility and position-budget steward",risk="Defensive",color="#70e1bd"),
 dict(id="sentinel",name="Sentinel",personality="Execution auditor; rules before enthusiasm",risk="Strict",color="#ffe58f"),
)
def fingerprint(analysis):
    fields={k:analysis.get(k) for k in ("team_name","source","bar_time","direction","agreement","required","votes","indicators","bars")}
    return hashlib.sha256(json.dumps(fields,sort_keys=True,allow_nan=False).encode()).hexdigest()

def assess_council(team_name,analysis,controls,ledger,mode="observe",now=None,proposal_id=None):
    if team_name not in TEAM_NAMES: raise ValueError("Unknown team")
    now=parse_utc(now) if now is not None else datetime.now(timezone.utc)
    analysis,controls,ledger=analysis or {},controls or {},ledger or {}
    gates=[]
    if mode not in {"observe","analyze","paper","practice"}: gates.append("Unknown execution mode")
    if not controls.get("enabled"): gates.append("Team disabled")
    if controls.get("entry_locked"): gates.append(controls.get("lock_reason") or "Entry locked")
    if ledger.get("pending_or_uncertain",0): gates.append("Pending or uncertain order requires reconciliation")
    try:
        if not -30 <= (now-parse_utc(analysis.get("bar_time"))).total_seconds() <=300:
            gates.append("Source bars stale or ahead of clock")
    except (ValueError,TypeError,OverflowError): gates.append("No valid source timestamp")
    if analysis.get("state")!="READY" or analysis.get("direction") not in {"LONG","SHORT"}:
        gates.append(analysis.get("reason") or "No directional proposal")
    ind=analysis.get("indicators") or {}
    try:
        atr,vwap,rvol,extension,stop=(float(ind[k]) for k in ("atr","vwap","relative_volume","extension_atr","stop_distance"))
        if not all(math.isfinite(v) for v in (atr,vwap,rvol,extension,stop)) or min(atr,vwap,rvol,stop)<=0 or extension<0 or stop>=vwap:
            raise ValueError("Invalid indicators")
        votes=analysis["votes"]
        if not isinstance(votes,list) or not votes: raise ValueError("Missing votes")
        support=sum(v.get("direction")==analysis.get("direction") for v in votes)
        opposition=sum(v.get("direction") in {"LONG","SHORT"} and v.get("direction")!=analysis.get("direction") for v in votes)
        if support!=analysis["agreement"] or support<analysis["required"] or analysis["required"]<1:
            raise ValueError("Invalid consensus")
        ratio=support/len(votes)
        if team_name in STOCK_TEAM_NAMES and (rvol<1 or extension>2 or atr/vwap>.03):
            gates.append("Stock volume, extension or volatility limit failed")
    except (ValueError,TypeError,KeyError,OverflowError):
        gates.append("Invalid indicator or consensus evidence")
        atr,vwap,rvol,extension,ratio,opposition,votes=0,1,0,0,0,0,[]
    opinions=[
      ("APPROVE" if ratio>=.75 and extension<=1 and atr/vwap<=.015 else "REDUCE_RISK","Protect capital: prefer 75% agreement, <=1 ATR extension and <=1.5% ATR/VWAP."),
      ("APPROVE" if ratio>=.75 and rvol>=1.2 else "WAIT","Need 75% agreement and relative volume >=1.2."),
      ("APPROVE" if any(v.get("name") in {"Momentum","Breakout"} and v.get("direction")==analysis.get("direction") for v in votes) else "WAIT","Favor confirmed momentum or breakout."),
      ("WAIT" if extension>1.5 else "REDUCE_RISK" if opposition else "APPROVE","Challenge chasing beyond 1.5 ATR; cut risk when specialists oppose."),
      ("REDUCE_RISK" if atr/vwap>.01 or rvol<1.5 else "APPROVE","Halve the existing risk budget when ATR/VWAP >1% or RVOL <1.5."),
      ("APPROVE","Execution controls and order reconciliation must pass."),
    ]
    members=[dict(m,vote=("VETO" if m["id"]=="sentinel" else "WAIT") if gates else vote,
                  reason="; ".join(gates) if gates else reason) for m,(vote,reason) in zip(MEMBERS,opinions)]
    favorable=sum(m["vote"] in {"APPROVE","REDUCE_RISK"} for m in members)
    action="SKIP" if gates or favorable<4 else "REDUCE_RISK" if any(m["vote"]=="REDUCE_RISK" for m in members) else "APPROVE"
    reason="; ".join(gates) if gates else f"{favorable}/6 support; "+("quorum not reached" if action=="SKIP" else "half risk budget" if action=="REDUCE_RISK" else "existing risk budget")
    try: evidence=fingerprint(analysis)
    except (ValueError,TypeError): evidence=None
    return dict(team_name=team_name,proposal_id=proposal_id,policy_version=POLICY_VERSION,
        engine="deterministic_personality_rules",generated_at=now.isoformat(),analysis_time=analysis.get("bar_time"),
        input_fingerprint=evidence,direction=analysis.get("direction") if action!="SKIP" else "SKIP",
        action=action,reason=reason,favorable_votes=favorable,quorum=4,hard_gates=gates,members=members,mode=mode,
        watch_only=team_name not in STOCK_TEAM_NAMES,
        entry_eligible=action!="SKIP" and mode in {"paper","practice"} and team_name in STOCK_TEAM_NAMES,
        order_terms={k:ind.get(k) for k in ("atr","vwap","stop_distance")})

def record_council(team_name,analysis,controls,ledger,mode,db_path=None,now=None,proposal_id=None):
    report=assess_council(team_name,analysis,controls,ledger,mode,now,proposal_id or uuid.uuid4().hex)
    ensure_system_tables(db_path)
    with connect_db(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing=conn.execute("SELECT payload_json FROM council_deliberations WHERE proposal_id=?",(report["proposal_id"],)).fetchone()
        if existing:
            saved=json.loads(existing[0])
            if any(saved.get(k)!=report.get(k) for k in ("team_name","mode","input_fingerprint")):
                raise ValueError("Proposal ID already belongs to different evidence")
            return saved
        conn.execute("INSERT INTO council_deliberations VALUES (?,?,?,?)",
            (report["proposal_id"],team_name,json.dumps(report,allow_nan=False),report["generated_at"]))
    return report

def review_proposal(team_name,analysis,mode,db_path=None,now=None):
    from entry_controls import read_entry_controls
    from team_worker import team_enabled
    controls=read_entry_controls(team_name,db_path,enabled=team_enabled(team_name,db_path),now=now)
    with connect_db(db_path) as conn:
        exists=conn.execute("SELECT 1 FROM sqlite_master WHERE name='paper_orders' AND type='table'").fetchone()
        pending=conn.execute("SELECT COUNT(*) FROM paper_orders WHERE team_name=? AND status IN ('PENDING','UNCERTAIN')",(team_name,)).fetchone()[0] if exists else 0
    identity=json.dumps([team_name,mode,fingerprint(analysis)],separators=(",",":"))
    proposal_id="proposal-"+hashlib.sha256(identity.encode()).hexdigest()[:32]
    return record_council(team_name,analysis,controls,{"pending_or_uncertain":pending},mode,db_path,now,proposal_id)

def authorization_error(conn,team_name,decision_id,decision,now=None,*,execution_mode="PAPER",shadow=False):
    try:
        row=conn.execute("SELECT payload_json FROM council_deliberations WHERE proposal_id=? AND team_name=?",(decision_id,team_name)).fetchone()
        report=json.loads(row[0]) if row else {}
        now=parse_utc(now) if now is not None else datetime.now(timezone.utc)
        permitted = report.get("entry_eligible") and report.get("mode") == execution_mode.lower()
        if shadow:
            permitted = report.get("mode") in {"analyze", execution_mode.lower()} and team_name in STOCK_TEAM_NAMES and report.get("action") in {"APPROVE","REDUCE_RISK"}
        if not 0<=(now-parse_utc(report.get("generated_at"))).total_seconds()<=300 or report.get("policy_version")!=POLICY_VERSION or not permitted:
            return "Council approval missing, expired or watch-only"
        saved=conn.execute("SELECT payload_json FROM team_analysis WHERE team_name=?",(team_name,)).fetchone()
        if not saved or fingerprint(json.loads(saved[0]))!=report.get("input_fingerprint"): return "Council source evidence changed"
        if report["direction"]!=decision.get("direction") or report["analysis_time"]!=decision.get("analysis_time"): return "Council proposal mismatch"
        if report["action"]=="REDUCE_RISK" and decision.get("action")!="REDUCE_RISK": return "Council risk reduction cannot be increased"
        if decision.get("action") not in {"APPROVE","REDUCE_RISK"}: return "Council decision is not an entry"
        if any(report["order_terms"].get(k)!=decision.get(k) for k in ("atr","vwap","stop_distance")): return "Council risk terms mismatch"
        return None
    except (ValueError,TypeError,KeyError,OverflowError): return "Council record invalid"
