"""Durable pre-submit intent, append-only status history and reconciliation audit."""
import json
from db_utils import connect_db, utc_now

ACTIVE_STATUSES = ("RESERVED", "SUBMITTING", "UNCERTAIN", "NEW", "ACCEPTED", "PENDING_NEW",
                   "PARTIALLY_FILLED", "PENDING_CANCEL", "PENDING_REPLACE", "HELD", "ACCEPTED_FOR_BIDDING",
                   "DONE_FOR_DAY", "STOPPED", "SUSPENDED")
TERMINAL_STATUSES = ("FILLED", "CANCELED", "EXPIRED", "REJECTED", "REPLACED")


def ensure_execution_tables(db_path=None):
    with connect_db(db_path) as c:
        c.execute("""CREATE TABLE IF NOT EXISTS order_intents (
            client_order_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL,
            team_name TEXT NOT NULL, mode TEXT NOT NULL, broker TEXT NOT NULL, account_id TEXT NOT NULL,
            shadow INTEGER NOT NULL, created_at TEXT NOT NULL, proposal_json TEXT NOT NULL,
            plan_json TEXT, risk_json TEXT NOT NULL, notional TEXT NOT NULL DEFAULT '0',
            status TEXT NOT NULL, broker_order_id TEXT, updated_at TEXT NOT NULL,
            UNIQUE(mode,broker,account_id,decision_id,shadow))""")
        c.execute("""CREATE TABLE IF NOT EXISTS order_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, client_order_id TEXT NOT NULL,
            status TEXT NOT NULL, recorded_at TEXT NOT NULL, details_json TEXT NOT NULL,
            FOREIGN KEY(client_order_id) REFERENCES order_intents(client_order_id))""")
        c.execute("""CREATE TABLE IF NOT EXISTS broker_reconciliation (
            id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, broker TEXT NOT NULL,
            account_id TEXT NOT NULL, recorded_at TEXT NOT NULL, status TEXT NOT NULL, details_json TEXT NOT NULL)""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_execution_account ON order_intents(mode,broker,account_id,status)")
        # Legacy ledger remains a compatibility projection for the existing managers/UI.
        c.execute("""CREATE TABLE IF NOT EXISTS paper_orders (
            client_order_id TEXT PRIMARY KEY, decision_id TEXT UNIQUE NOT NULL,
            team_name TEXT NOT NULL, created_at TEXT NOT NULL, broker_order_id TEXT,
            status TEXT NOT NULL, qty INTEGER NOT NULL, direction TEXT NOT NULL)""")


def transition(c, client_id, status, details=None, broker_id=None):
    row = c.execute("SELECT * FROM order_intents WHERE client_order_id=?", (client_id,)).fetchone()
    if row is None: raise ValueError("Intent must exist before status")
    now = utc_now()
    c.execute("UPDATE order_intents SET status=?,broker_order_id=COALESCE(?,broker_order_id),updated_at=? WHERE client_order_id=?",
              (status, broker_id, now, client_id))
    c.execute("INSERT INTO order_status_history(client_order_id,status,recorded_at,details_json) VALUES (?,?,?,?)",
              (client_id, status, now, json.dumps(details or {}, allow_nan=False)))
    if row["mode"] == "PAPER" and not row["shadow"] and row["plan_json"] and status not in {"BLOCKED", "SHADOW"}:
        p = json.loads(row["plan_json"])
        mirror = "PENDING" if status in {"RESERVED", "SUBMITTING"} else status
        c.execute("""INSERT INTO paper_orders VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(client_order_id) DO UPDATE SET status=excluded.status,broker_order_id=COALESCE(excluded.broker_order_id,paper_orders.broker_order_id)""",
            (client_id, row["decision_id"], row["team_name"], row["created_at"], broker_id, mirror, p["qty"], p["side"]))


def execution_status(db_path=None):
    ensure_execution_tables(db_path)
    with connect_db(db_path) as c:
        intents = [dict(x) for x in c.execute("SELECT * FROM order_intents ORDER BY created_at DESC LIMIT 100")]
        history = [dict(x) for x in c.execute("SELECT * FROM order_status_history ORDER BY id DESC LIMIT 200")]
        runs = [dict(x) for x in c.execute("SELECT * FROM broker_reconciliation ORDER BY id DESC LIMIT 20")]
    for x in intents:
        for key in ("proposal", "plan", "risk"):
            x[key] = json.loads(x.pop(key + "_json") or "null")
    for x in history + runs: x["details"] = json.loads(x.pop("details_json"))
    return dict(live_locked=True, intents=intents, history=history, reconciliation=runs)
