"""Only execution gateway. Managers propose; deterministic policy reserves and submits."""
import hashlib
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from broker_adapter import safe_mode, timestamp, money
from db_utils import connect_db, ensure_system_tables, utc_now
from order_store import ensure_execution_tables, transition, ACTIVE_STATUSES, TERMINAL_STATUSES
from risk_engine import RiskEngine
from zoneinfo import ZoneInfo


def session_day(value):
    return timestamp(value).astimezone(ZoneInfo("America/New_York")).date()


@dataclass(frozen=True)
class ExecutionResult:
    status: str
    client_order_id: str
    plan: dict | None
    reasons: tuple[str, ...] = ()


def deterministic_id(mode, broker, account, decision_id, shadow=False):
    # Decision identity is stable across process restarts. Shadow cannot suppress a later
    # explicitly configured paper evaluation, and never reserves broker buying power.
    body = json.dumps([mode, broker, account, decision_id, bool(shadow)], separators=(",", ":"))
    return "ll-" + hashlib.sha256(body.encode()).hexdigest()[:40]


class ExecutionService:
    def __init__(self, router, db_path=None, risk=None, clock=None):
        self.router, self.db_path = router, db_path
        self.risk = risk or RiskEngine()
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        ensure_system_tables(db_path)
        ensure_execution_tables(db_path)

    def _controls(self, c, team, now):
        from entry_controls import assess_controls
        from trading_records import brake_from_connection
        row = c.execute("SELECT * FROM team_controls WHERE team_name=?", (team,)).fetchone()
        status = c.execute("SELECT active,status FROM team_status WHERE team_name=? ORDER BY rowid DESC LIMIT 1", (team,)).fetchone()
        score = c.execute("SELECT is_disabled FROM team_scores WHERE team_name=? ORDER BY rowid DESC LIMIT 1", (team,)).fetchone()
        enabled = bool(status and str(status["active"]) in {"1", "True"} and
            str(status["status"]).upper() not in {"DISABLED", "PAUSED", "STOPPED"} and
            not (score and str(score["is_disabled"]) in {"1", "True"}))
        result = assess_controls(team, dict(row) if row else {}, enabled, now)
        brake = brake_from_connection(c, team, now, persist=True)
        if brake["locked"]:
            result.update(entry_locked=True, lock_reason=brake["status"])
        return result

    def _record_broker_order(self, c, row, order):
        plan = json.loads(row["plan_json"])
        if order.client_order_id != row["client_order_id"] or order.symbol != row["team_name"] or order.qty != plan["qty"] or order.side != plan["side"]:
            transition(c, row["client_order_id"], "UNCERTAIN", {"reason": "Broker order terms mismatch"})
            return "UNCERTAIN"
        status = order.status.upper()
        try:
            fill_qty = money(order.filled_qty)
            if not 0 <= fill_qty <= plan["qty"] or (status == "FILLED" and fill_qty != plan["qty"]):
                raise ValueError("Invalid filled quantity")
            if fill_qty > 0 and (order.filled_price is None or money(order.filled_price) <= 0):
                raise ValueError("Missing fill price")
        except (ValueError, TypeError, ArithmeticError):
            transition(c, row["client_order_id"], "UNCERTAIN", {"reason": "Invalid broker fill data"})
            return "UNCERTAIN"
        if status not in ACTIVE_STATUSES + TERMINAL_STATUSES:
            status = "UNCERTAIN"
        # Late/out-of-order polling must not turn a terminal fill back into an entry.
        if row["status"] in TERMINAL_STATUSES and row["status"] != status:
            transition(c, row["client_order_id"], "UNCERTAIN", {"reason": "Broker terminal status changed"})
            return "UNCERTAIN"
        last = c.execute("SELECT details_json FROM order_status_history WHERE client_order_id=? ORDER BY id DESC LIMIT 1", (row["client_order_id"],)).fetchone()
        if status != row["status"] or order.broker_order_id != row["broker_order_id"] or not last or json.loads(last[0]) != asdict(order):
            transition(c, row["client_order_id"], status, asdict(order), order.broker_order_id)
        return status

    def recover(self, client_id, adapter):
        with connect_db(self.db_path) as c:
            row = c.execute("SELECT * FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
        if row is None: raise ValueError("Unknown intent")
        if row["shadow"] or row["status"] == "BLOCKED":
            return ExecutionResult(row["status"], client_id, json.loads(row["plan_json"] or "null"))
        try:
            order = adapter.lookup(client_id)
        except Exception:
            order = None
            reason = "Broker lookup failed; submission must not be retried"
        else:
            reason = "Broker has no confirmed order; manual reconciliation required"
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
            if order is not None:
                status = self._record_broker_order(c, row, order)
            else:
                # Even RESERVED is held on recovery; we never guess whether a crash
                # happened before or after the broker accepted the original request.
                status = "UNCERTAIN"
                transition(c, client_id, status, {"reason": reason})
        return ExecutionResult(status, client_id, json.loads(row["plan_json"] or "null"),
                               () if order is not None and status != "UNCERTAIN" else (reason,))

    def execute(self, team, decision_id, decision, *, mode="PRACTICE", shadow=True, enabled_check=None):
        mode = safe_mode(mode)  # Reject LIVE before constructing or calling any adapter.
        if type(shadow) is not bool: raise ValueError("Shadow must be an explicit boolean")
        if not isinstance(decision_id, str) or not decision_id.strip() or len(decision_id) > 128:
            raise ValueError("Stable decision ID required")
        adapter = self.router.resolve(team, mode)
        client_id = deterministic_id(mode.value, adapter.broker_id, adapter.account_id, decision_id, shadow)
        proposal = json.dumps(decision, sort_keys=True, allow_nan=False)
        with connect_db(self.db_path) as c:
            existing = c.execute("SELECT * FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
        if existing:
            if existing["proposal_json"] != proposal:
                return ExecutionResult("BLOCKED", client_id, None, ("Decision ID reused with different terms",))
            return self.recover(client_id, adapter)
        # Local locks and council authorization precede all broker reads.
        from council import authorization_error
        now = timestamp(self.clock())
        with connect_db(self.db_path) as c:
            controls = self._controls(c, team, now)
            error = authorization_error(c, team, decision_id, decision, now, execution_mode=mode.value, shadow=shadow)
        if error or controls["entry_locked"] or (enabled_check and not enabled_check()):
            return self._blocked(client_id, decision_id, team, mode, shadow, adapter, proposal,
                                 controls["lock_reason"] or error or "Team disabled")
        try:
            snapshot = adapter.snapshot(team)
        except Exception:
            return self._blocked(client_id, decision_id, team, mode, shadow, adapter, proposal, "Broker snapshot unavailable")
        # Reserve under one SQLite writer across teams/processes. Broker I/O is outside
        # the transaction; recency, controls and council evidence are rechecked inside.
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            if c.execute("SELECT 1 FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone():
                return ExecutionResult("BLOCKED", client_id, None, ("Order intent already exists",))
            now = timestamp(self.clock())
            controls = self._controls(c, team, now)
            if enabled_check and not enabled_check(): controls.update(enabled=False)
            error = authorization_error(c, team, decision_id, decision, now, execution_mode=mode.value, shadow=shadow)
            scope = (mode.value, adapter.broker_id, adapter.account_id)
            rows = [dict(x) for x in c.execute("SELECT * FROM order_intents WHERE mode=? AND broker=? AND account_id=? AND shadow=0", scope)]
            reservations = [x for x in rows if x["status"] in ACTIVE_STATUSES]
            # Include pre-migration uncertain orders. These cannot safely be auto-adopted.
            if mode.value == "PAPER" and c.execute("SELECT 1 FROM paper_orders WHERE status IN ('PENDING','UNCERTAIN') AND client_order_id NOT IN (SELECT client_order_id FROM order_intents)").fetchone():
                error = "Legacy pending order requires manual broker reconciliation"
            recon = c.execute("SELECT status FROM broker_reconciliation WHERE mode=? AND broker=? AND account_id=? ORDER BY id DESC LIMIT 1", scope).fetchone()
            if recon and recon[0] != "OK": error = "Broker reconciliation is unresolved"
            day = session_day(now)
            submitted = [x for x in rows if session_day(x["created_at"]) == day and x["status"] not in {"BLOCKED", "SHADOW"}]
            plan, reasons = self.risk.evaluate(team=team, decision_id=decision_id, decision=decision,
                adapter=adapter, snapshot=snapshot, client_id=client_id, controls=controls,
                council_error=error, reservations=reservations, daily_trades=len(submitted),
                team_daily_trades=sum(x["team_name"] == team for x in submitted), now=now)
            status = "BLOCKED" if reasons else "SHADOW" if shadow else "RESERVED"
            self._insert(c, client_id, decision_id, team, mode, shadow, adapter, proposal, plan, reasons, status)
        if status != "RESERVED":
            return ExecutionResult(status, client_id, plan.payload() if plan else None, tuple(reasons))
        # A broker-side deterministic ID lookup also handles local database restore.
        # Lookup errors are never interpreted as not-found.
        try:
            found = adapter.lookup(client_id)
        except Exception:
            return self._uncertain(client_id, plan, "Broker lookup failed before submission")
        if found is not None:
            return self.recover(client_id, adapter)
        try:
            final_snapshot = adapter.snapshot(team)
        except Exception:
            return self._uncertain(client_id, plan, "Final broker snapshot unavailable; held without submission")
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT status FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
            if row[0] != "RESERVED": return ExecutionResult(row[0], client_id, plan.payload())
            # Final saved controls, approval freshness and concurrent reconciliation gate.
            controls = self._controls(c, team, timestamp(self.clock()))
            error = authorization_error(c, team, decision_id, decision, self.clock(), execution_mode=mode.value)
            recon = c.execute("SELECT status FROM broker_reconciliation WHERE mode=? AND broker=? AND account_id=? ORDER BY id DESC LIMIT 1", scope).fetchone()
            if recon and recon[0] != "OK": error = "Broker reconciliation is unresolved"
            if enabled_check and not enabled_check(): controls.update(enabled=False)
            rows = [dict(x) for x in c.execute("SELECT * FROM order_intents WHERE mode=? AND broker=? AND account_id=? AND shadow=0 AND client_order_id!=?", (*scope, client_id))]
            reservations = [x for x in rows if x["status"] in ACTIVE_STATUSES]
            day = session_day(self.clock())
            submitted = [x for x in rows if session_day(x["created_at"]) == day and x["status"] not in {"BLOCKED", "SHADOW"}]
            plan, reasons = self.risk.evaluate(team=team, decision_id=decision_id, decision=decision,
                adapter=adapter, snapshot=final_snapshot, client_id=client_id, controls=controls,
                council_error=error, reservations=reservations, daily_trades=len(submitted),
                team_daily_trades=sum(x["team_name"] == team for x in submitted), now=self.clock())
            if reasons:
                reason = "; ".join(reasons)
                c.execute("UPDATE order_intents SET plan_json=?,risk_json=? WHERE client_order_id=?",
                    (json.dumps(plan.payload()) if plan else None,json.dumps(reasons),client_id))
                transition(c, client_id, "BLOCKED", {"reason": reason})
                c.execute("DELETE FROM paper_orders WHERE client_order_id=?", (client_id,))
                return ExecutionResult("BLOCKED", client_id, plan.payload() if plan else None, tuple(reasons))
            # Final sized terms are durably recorded before the broker sees them.
            c.execute("UPDATE order_intents SET plan_json=?,notional=? WHERE client_order_id=?",
                      (json.dumps(plan.payload(), allow_nan=False), plan.reserved_buying_power, client_id))
            transition(c, client_id, "SUBMITTING", {"final_plan": plan.payload()})
        try:
            response = adapter.submit(plan)
        except Exception:
            return self._uncertain(client_id, plan, "Submission outcome uncertain; reconciliation required")
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
            status = self._record_broker_order(c, row, response)
        return ExecutionResult(status, client_id, plan.payload())

    def _insert(self, c, cid, did, team, mode, shadow, adapter, proposal, plan, reasons, status):
        now = timestamp(self.clock()).isoformat()
        c.execute("""INSERT INTO order_intents(client_order_id,decision_id,team_name,mode,broker,account_id,shadow,
            created_at,proposal_json,plan_json,risk_json,notional,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (cid, did, team, mode.value, adapter.broker_id, adapter.account_id, int(shadow), now, proposal,
             json.dumps(plan.payload(), allow_nan=False) if plan else None, json.dumps(reasons),
             plan.reserved_buying_power if plan else "0", status, now))
        transition(c, cid, status, {"reasons": reasons})

    def _blocked(self, cid, did, team, mode, shadow, adapter, proposal, reason):
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            if not c.execute("SELECT 1 FROM order_intents WHERE client_order_id=?", (cid,)).fetchone():
                self._insert(c, cid, did, team, mode, shadow, adapter, proposal, None, [reason], "BLOCKED")
        return ExecutionResult("BLOCKED", cid, None, (reason,))

    def _uncertain(self, cid, plan, reason):
        with connect_db(self.db_path) as c:
            transition(c, cid, "UNCERTAIN", {"reason": reason})
        return ExecutionResult("UNCERTAIN", cid, plan.payload(), (reason,))

    def reconcile(self, adapter):
        safe_mode(adapter.mode)
        scope = (adapter.mode.value, adapter.broker_id, adapter.account_id)
        with connect_db(self.db_path) as c:
            rows = [dict(x) for x in c.execute("SELECT * FROM order_intents WHERE mode=? AND broker=? AND account_id=? AND shadow=0 AND status!='BLOCKED'", scope)]
        discrepancies = []
        for row in rows:
            if self.recover(row["client_order_id"], adapter).status == "UNCERTAIN":
                discrepancies.append({"client_order_id": row["client_order_id"], "reason": "Order not confirmed"})
        try:
            snapshot = adapter.snapshot(sorted(adapter.symbols)[0])
            if snapshot.account_id != adapter.account_id or not -5 <= (timestamp(self.clock()) - timestamp(snapshot.captured_at)).total_seconds() <= 30:
                raise ValueError("Reconciliation snapshot invalid or stale")
            known_ids = {r["client_order_id"] for r in rows}
            unknown = [o.client_order_id for o in snapshot.open_orders if o.client_order_id not in known_ids]
            # Report manual/untracked holdings without inventing local fills or P&L.
            details = dict(checked=len(rows), discrepancies=discrepancies, unknown_open_orders=unknown,
                           positions=[asdict(p) for p in snapshot.positions], captured_at=snapshot.captured_at)
        except Exception:
            discrepancies.append({"reason": "Account snapshot unavailable"})
            details = dict(checked=len(rows), discrepancies=discrepancies)
        with connect_db(self.db_path) as c:
            if c.execute("SELECT 1 FROM paper_orders WHERE status IN ('PENDING','UNCERTAIN') AND client_order_id NOT IN (SELECT client_order_id FROM order_intents)").fetchone() and adapter.mode.value == "PAPER":
                discrepancies.append({"reason": "Legacy uncertain intent needs manual reconciliation"})
        status = "REQUIRES_REVIEW" if discrepancies or details.get("unknown_open_orders") else "OK"
        with connect_db(self.db_path) as c:
            c.execute("INSERT INTO broker_reconciliation(mode,broker,account_id,recorded_at,status,details_json) VALUES (?,?,?,?,?,?)",
                      (*scope, utc_now(), status, json.dumps(details, allow_nan=False)))
        return dict(status=status, **details)
