"""Durable offline practice broker. Synthetic quotes, fake cash, no network code."""
from datetime import datetime, timezone
from decimal import Decimal
import json
from broker_adapter import (BrokerAdapter, BrokerOrder, BrokerSnapshot, ExecutionMode,
                            Position, money, safe_mode)
from db_utils import connect_db
from config import STOCK_TEAM_NAMES
from zoneinfo import ZoneInfo


class PracticeAdapter(BrokerAdapter):
    mode = ExecutionMode.PRACTICE
    broker_id = "local-practice"
    symbols = frozenset(STOCK_TEAM_NAMES)

    def __init__(self, db_path=None, account_id="practice-50000", clock=None):
        self.db_path, self.account_id = db_path, account_id
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.quotes = {}
        with connect_db(db_path) as c:
            c.execute("""CREATE TABLE IF NOT EXISTS practice_accounts (
                account_id TEXT PRIMARY KEY, cash TEXT NOT NULL, day_start_equity TEXT NOT NULL)""")
            c.execute("""CREATE TABLE IF NOT EXISTS practice_broker_orders (
                account_id TEXT NOT NULL, client_order_id TEXT NOT NULL, payload_json TEXT NOT NULL,
                PRIMARY KEY(account_id,client_order_id))""")
            c.execute("""CREATE TABLE IF NOT EXISTS practice_positions (
                account_id TEXT NOT NULL, symbol TEXT NOT NULL, qty INTEGER NOT NULL, entry TEXT NOT NULL,
                PRIMARY KEY(account_id,symbol))""")
            c.execute("INSERT OR IGNORE INTO practice_accounts(account_id,cash,day_start_equity) VALUES (?, '50000', '50000')", (account_id,))
            columns = {r["name"] for r in c.execute("PRAGMA table_info(practice_accounts)")}
            if "trading_day" not in columns:
                c.execute("ALTER TABLE practice_accounts ADD COLUMN trading_day TEXT")

    def set_quote(self, symbol, price, market_open=True):
        if symbol not in self.symbols or money(price) <= 0 or type(market_open) is not bool:
            raise ValueError("Invalid practice quote")
        self.quotes[symbol] = (str(money(price)), self.clock().isoformat(), market_open)

    def snapshot(self, symbol):
        price, quote_at, is_open = self.quotes[symbol]
        with connect_db(self.db_path) as c:
            a = c.execute("SELECT * FROM practice_accounts WHERE account_id=?", (self.account_id,)).fetchone()
            rows = c.execute("SELECT * FROM practice_positions WHERE account_id=?", (self.account_id,)).fetchall()
        equity, collateral = money(a["cash"]), Decimal(0)
        for r in rows:
            mark = money(self.quotes.get(r["symbol"], (r["entry"],))[0])
            equity += r["qty"] * mark
            if r["qty"] < 0: collateral += 2 * abs(r["qty"]) * mark
        day = self.clock().astimezone(ZoneInfo("America/New_York")).date().isoformat()
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            current = c.execute("SELECT day_start_equity,trading_day FROM practice_accounts WHERE account_id=?", (self.account_id,)).fetchone()
            baseline = current["day_start_equity"]
            if current["trading_day"] != day:
                baseline = str(equity)
                c.execute("UPDATE practice_accounts SET day_start_equity=?,trading_day=? WHERE account_id=?", (baseline,day,self.account_id))
        return BrokerSnapshot(self.account_id, str(equity), baseline,
            str(max(Decimal(0), money(a["cash"]) - collateral)), False, is_open, price, price, quote_at,
            self.clock().isoformat(), True, True, tuple(Position(r["symbol"], str(r["qty"])) for r in rows))

    def lookup(self, client_order_id):
        with connect_db(self.db_path) as c:
            r = c.execute("SELECT payload_json FROM practice_broker_orders WHERE account_id=? AND client_order_id=?",
                          (self.account_id, client_order_id)).fetchone()
        return BrokerOrder(**json.loads(r[0])) if r else None

    def submit(self, plan):
        safe_mode(plan.mode)
        if plan.mode != "PRACTICE" or plan.account_id != self.account_id or plan.broker != self.broker_id:
            raise ValueError("Practice route mismatch")
        # Orders fill only at a synthetic reference. Protective exits are represented
        # in the immutable plan; this adapter does not pretend to emulate exchange fills.
        order = BrokerOrder(plan.client_order_id, "fake-" + plan.client_order_id, plan.symbol,
                            "FILLED", plan.qty, plan.side, str(plan.qty), plan.entry_reference)
        with connect_db(self.db_path) as c:
            c.execute("BEGIN IMMEDIATE")
            old = c.execute("SELECT payload_json FROM practice_broker_orders WHERE account_id=? AND client_order_id=?",
                            (self.account_id, plan.client_order_id)).fetchone()
            if old: return BrokerOrder(**json.loads(old[0]))
            if c.execute("SELECT 1 FROM practice_positions WHERE account_id=? AND symbol=?", (self.account_id, plan.symbol)).fetchone():
                raise ValueError("Practice position already exists")
            cash = money(c.execute("SELECT cash FROM practice_accounts WHERE account_id=?", (self.account_id,)).fetchone()[0])
            signed = plan.qty if plan.side == "LONG" else -plan.qty
            c.execute("UPDATE practice_accounts SET cash=? WHERE account_id=?",
                      (str(cash - signed * money(plan.entry_reference)), self.account_id))
            c.execute("INSERT INTO practice_positions VALUES (?,?,?,?)", (self.account_id, plan.symbol, signed, plan.entry_reference))
            from dataclasses import asdict
            c.execute("INSERT INTO practice_broker_orders VALUES (?,?,?)",
                      (self.account_id, plan.client_order_id, json.dumps(asdict(order))))
        return order
