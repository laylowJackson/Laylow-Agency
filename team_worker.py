"""Shared stock worker. Startup is credential-free; external work is opt-in."""
import json
import logging
import math
import os
import signal
import threading
import uuid
from datetime import datetime, timedelta, timezone

from config import ROOT_DIR, STOCK_TEAM_NAMES, REFRESH_SECONDS, HEARTBEAT_SECONDS
from db_utils import (
    connect_db, ensure_system_tables, ensure_team_control, record_worker_status,
    record_system_event, save_analysis,
)

from specialist_engine import evaluate_team
from entry_controls import read_entry_controls

LOG = logging.getLogger("laylow.worker")
VALID_MODES = {"observe", "analyze", "paper"}


def utc_now():
    return datetime.now(timezone.utc)


def load_settings():
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env.local", override=False)
    load_dotenv(ROOT_DIR / ".env", override=False)
    mode = os.getenv("LAYLOW_MODE", "observe").strip().lower()
    if mode not in VALID_MODES:
        raise ValueError("LAYLOW_MODE must be observe, analyze, or paper")
    return {
        "mode": mode,
        "openai_key": os.getenv("OPENAI_API_KEY", "").strip(),
        "alpaca_key": os.getenv("ALPACA_API_KEY", "").strip(),
        "alpaca_secret": os.getenv("ALPACA_SECRET_KEY", "").strip(),
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip(),
        "paper_enabled": os.getenv("LAYLOW_ALLOW_PAPER_ORDERS", "").lower() == "true",
    }


def missing_settings(settings):
    if settings["mode"] == "observe":
        return []
    missing = [name for name, key in (
        ("OPENAI_API_KEY", "openai_key"),
        ("ALPACA_API_KEY", "alpaca_key"),
        ("ALPACA_SECRET_KEY", "alpaca_secret"),
    ) if not settings.get(key)]
    if settings["mode"] == "paper" and not settings["paper_enabled"]:
        missing.append("LAYLOW_ALLOW_PAPER_ORDERS=true")
    return missing


def parse_decision(raw):
    """Reject arbitrary AI prose instead of treating it as a sell signal."""
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("Decision must be a JSON object")
    direction = obj.get("direction")
    action = obj.get("action")
    reason = obj.get("reason")
    if not isinstance(direction, str) or direction not in {"LONG", "SHORT", "SKIP"}:
        raise ValueError("Invalid decision direction")
    if not isinstance(action, str) or action not in {"APPROVE", "REDUCE_RISK", "SKIP"}:
        raise ValueError("Invalid history action")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        raise ValueError("Decision reason is missing or too long")
    return {"direction": direction, "action": action, "reason": reason.strip()}


def validate_quote(quote, now=None):
    now = now or utc_now()
    bid, ask = float(quote.bid_price), float(quote.ask_price)
    if not all(math.isfinite(x) and x > 0 for x in (bid, ask)) or ask < bid:
        raise ValueError("Quote has invalid bid/ask prices")
    stamp = quote.timestamp
    if stamp.tzinfo is None:
        raise ValueError("Quote timestamp has no timezone")
    age = (now - stamp).total_seconds()
    if age < -5 or age > 60:
        raise ValueError("Quote is stale or dated in the future")
    midpoint = (bid + ask) / 2
    if (ask - bid) / midpoint > .01:
        raise ValueError("Quote spread exceeds 1%")
    return midpoint


def size_trade(account, price, reduce_risk=False, stop_distance=None, symbol="AAPL"):
    equity, previous, buying_power = (
        float(account.equity), float(account.last_equity), float(account.buying_power)
    )
    if not all(math.isfinite(x) and x > 0 for x in (equity, previous, buying_power, price)):
        return 0
    if getattr(account, "trading_blocked", True) or getattr(account, "account_blocked", True):
        return 0
    # equity/last_equity measures account day change, not unrealized position P&L.
    if (equity - previous) / previous <= -.05:
        return 0
    budget = equity * (.0025 if symbol == "TSLA" else .005) * (.5 if reduce_risk else 1)
    stop_distance = price * .02 if stop_distance is None else float(stop_distance)
    if not math.isfinite(stop_distance) or stop_distance <= 0 or stop_distance >= price:
        return 0
    # Whole shares; never force a one-share order beyond buying power or cap.
    return max(0, min(int(budget / stop_distance),
                      int(buying_power / price), int((500 if symbol == "TSLA" else 1000) * (.5 if reduce_risk else 1) / price)))


def team_enabled(symbol, db_path=None):
    with connect_db(db_path) as conn:
        control = conn.execute(
            "SELECT active,status FROM team_status WHERE team_name=? ORDER BY rowid DESC LIMIT 1",
            (symbol,),
        ).fetchone()
        score = conn.execute(
            "SELECT is_disabled FROM team_scores WHERE team_name=? ORDER BY rowid DESC LIMIT 1",
            (symbol,),
        ).fetchone()
    return bool(control and str(control["active"]) in {"1", "True"}) and str(control["status"]).upper() not in {
        "DISABLED", "PAUSED", "STOPPED"
    } and not bool(score and str(score["is_disabled"]) in {"1", "True"})


def ensure_ledger(db_path=None):
    with connect_db(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS worker_decisions (
                id TEXT PRIMARY KEY, team_name TEXT NOT NULL, created_at TEXT NOT NULL,
                mode TEXT NOT NULL, direction TEXT NOT NULL, action TEXT NOT NULL,
                reason TEXT NOT NULL, price REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS paper_orders (
                client_order_id TEXT PRIMARY KEY, decision_id TEXT UNIQUE NOT NULL,
                team_name TEXT NOT NULL, created_at TEXT NOT NULL,
                broker_order_id TEXT, status TEXT NOT NULL, qty INTEGER NOT NULL,
                direction TEXT NOT NULL
            )
        """)


class Services:
    """Construct provider clients only after mode and credential checks."""
    def __init__(self, settings):
        from openai import OpenAI
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.trading.client import TradingClient
        self.ai = OpenAI(api_key=settings["openai_key"], timeout=30, max_retries=0)
        self.data = StockHistoricalDataClient(settings["alpaca_key"], settings["alpaca_secret"])
        self.broker = TradingClient(settings["alpaca_key"], settings["alpaca_secret"], paper=True)
        self.model = settings["model"]

    def quote(self, symbol):
        from alpaca.data.enums import DataFeed
        from alpaca.data.requests import StockLatestQuoteRequest
        quotes = self.data.get_stock_latest_quote(
            StockLatestQuoteRequest(symbol_or_symbols=[symbol], feed=DataFeed.IEX)
        )
        return validate_quote(quotes[symbol])

    def bars(self, symbol):
        from alpaca.data.enums import DataFeed
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame
        now = utc_now()
        response = self.data.get_stock_bars(StockBarsRequest(
            symbol_or_symbols=[symbol], timeframe=TimeFrame.Minute,
            start=now - timedelta(days=7), end=now, feed=DataFeed.IEX))
        rows = {bar.timestamp: {field: getattr(bar, field) for field in
                ("timestamp", "open", "high", "low", "close", "volume")}
                for bar in response.data.get(symbol, [])}
        return [rows[stamp] for stamp in sorted(rows)][-2000:]

    def decide(self, symbol, price, history):
        response = self.ai.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content":
                 "Return a JSON object with direction LONG, SHORT or SKIP; action "
                 "APPROVE, REDUCE_RISK or SKIP; and reason (one sentence). "
                 "You may veto or reduce risk on the specialist consensus supplied below. "
                 "Never invent missing quotes, events, or outcomes. A price alone is insufficient. "
                 "Use SKIP when evidence is insufficient. Previous model decisions "
                 "are not realized trade outcomes."},
                {"role": "user", "content": json.dumps({
                    "symbol": symbol, "quote_midpoint": price,
                    "recent_analysis": history,
                })},
            ],
            temperature=.2,
        )
        return parse_decision(response.choices[0].message.content)

    def paper_request(self, symbol, decision, price, qty, client_id):
        from alpaca.trading.enums import OrderClass, OrderSide, TimeInForce
        from alpaca.trading.requests import (
            MarketOrderRequest, StopLossRequest, TakeProfitRequest,
        )
        long = decision["direction"] == "LONG"
        distance = float(decision.get("stop_distance", price * .02))
        if not math.isfinite(distance) or distance <= 0 or distance >= price:
            raise ValueError("Invalid bracket stop distance")
        stop = round(price - distance if long else price + distance, 2)
        target = round(price + 2*distance if long else price - 2*distance, 2)
        if stop <= 0 or target <= 0 or (long and not stop < price < target) or (not long and not target < price < stop):
            raise ValueError("Bracket rounding leaves invalid exits")
        return MarketOrderRequest(
            symbol=symbol, qty=qty, side=OrderSide.BUY if long else OrderSide.SELL,
            time_in_force=TimeInForce.DAY, order_class=OrderClass.BRACKET,
            client_order_id=client_id,
            stop_loss=StopLossRequest(stop_price=stop),
            take_profit=TakeProfitRequest(limit_price=target),
        )


def submit_paper_order(symbol, decision_id, decision, price, services,
                       db_path=None, enabled_check=None):
    """Persist intent before submission. An uncertain submit blocks new orders."""
    if symbol not in STOCK_TEAM_NAMES:
        return "Futures are watch-only"
    controls = read_entry_controls(symbol, db_path)
    if controls["entry_locked"]:
        return "Entry blocked: " + controls["lock_reason"]
    if decision.get("direction") not in {"LONG", "SHORT", "SKIP"} or decision.get("action") not in {"APPROVE", "REDUCE_RISK", "SKIP"}:
        return "Invalid paper decision"
    distance = decision.get("stop_distance")
    if not isinstance(distance, (int, float)) or isinstance(distance, bool) or not math.isfinite(distance) or distance <= 0:
        return "A validated ATR stop distance is required"
    analysis_time = decision.get("analysis_time")
    try:
        from entry_controls import parse_utc
        age = (utc_now() - parse_utc(analysis_time)).total_seconds()
        if age < -30 or age > 300:
            return "Specialist analysis is stale"
    except (ValueError, TypeError, OverflowError):
        return "Specialist analysis time is required"
    from alpaca.trading.enums import QueryOrderStatus
    from alpaca.trading.requests import GetOrdersRequest
    if decision["direction"] == "SKIP" or decision["action"] == "SKIP":
        return "Analysis says skip"
    with connect_db(db_path) as conn:
        pending = conn.execute(
            "SELECT 1 FROM paper_orders WHERE team_name=? AND status IN ('PENDING','UNCERTAIN')",
            (symbol,),
        ).fetchone()
        duplicate = conn.execute(
            "SELECT 1 FROM paper_orders WHERE decision_id=?", (decision_id,)
        ).fetchone()
    if pending or duplicate:
        return "Order intent already exists; inspect the paper ledger"
    from council import authorization_error
    with connect_db(db_path) as council_connection:
        council_error=authorization_error(council_connection,symbol,decision_id,decision)
    if council_error: return council_error
    if not services.broker.get_clock().is_open:
        return "Market is closed"
    if any(p.symbol == symbol for p in services.broker.get_all_positions()):
        return "Existing position blocks another entry"
    orders = services.broker.get_orders(
        filter=GetOrdersRequest(status=QueryOrderStatus.OPEN, symbols=[symbol])
    )
    if orders:
        return "Open order blocks another entry"
    asset = services.broker.get_asset(symbol)
    if not asset.tradable:
        return "Asset is not tradable"
    if decision["direction"] == "SHORT" and not (
        asset.shortable and getattr(asset, "easy_to_borrow", False)
    ):
        return "Asset is not eligible for a short entry"
    # Re-fetch immediately before submission; do not use a cached AI input quote.
    price = services.quote(symbol)
    qty = size_trade(services.broker.get_account(), price,
                     decision["action"] == "REDUCE_RISK", distance, symbol)
    vwap, atr = decision.get("vwap"), decision.get("atr")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0
               for value in (vwap, atr)) or abs(price-vwap) > 2*atr:
        return "Current quote exceeds the VWAP extension limit"
    if qty == 0:
        return "Account limits or order cap block this entry"
    check = enabled_check or (lambda: team_enabled(symbol, db_path))
    if not check():
        return "Team was disabled during analysis"
    controls = read_entry_controls(symbol, db_path)
    if controls["entry_locked"]:
        return "Entry blocked: " + controls["lock_reason"]
    client_id = "ll-" + uuid.uuid4().hex
    request = services.paper_request(symbol, decision, price, qty, client_id)
    with connect_db(db_path) as conn:
        # BEGIN IMMEDIATE prevents concurrent local intents for the same symbol.
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute(
            "SELECT 1 FROM paper_orders WHERE team_name=? AND status IN ('PENDING','UNCERTAIN')",
            (symbol,),
        ).fetchone():
            return "Another order intent is pending"
        council_error=authorization_error(conn,symbol,decision_id,decision)
        if council_error: return council_error
        # The writer transaction prevents a control edit racing the local intent write.
        from entry_controls import assess_controls
        saved_control = conn.execute("SELECT * FROM team_controls WHERE team_name=?", (symbol,)).fetchone()
        if assess_controls(symbol, dict(saved_control) if saved_control else {},
                           enabled=team_enabled(symbol, db_path))["entry_locked"]:
            return "Entry blocked by a saved control"
        from trading_records import brake_from_connection
        brake = brake_from_connection(conn,symbol,persist=True)
        if brake["locked"]:
            return "Entry blocked: " + brake["status"]
        conn.execute(
            "INSERT INTO paper_orders VALUES (?,?,?,?,?,?,?,?)",
            (client_id, decision_id, symbol, utc_now().isoformat(), None,
             "PENDING", qty, decision["direction"]),
        )
    try:
        response = services.broker.submit_order(order_data=request)
    except Exception:
        with connect_db(db_path) as conn:
            conn.execute(
                "UPDATE paper_orders SET status='UNCERTAIN' WHERE client_order_id=?",
                (client_id,),
            )
        # Do not expose exception text which may contain provider request details.
        return "Paper submission outcome uncertain; reconcile in Alpaca before continuing"
    with connect_db(db_path) as conn:
        conn.execute(
            "UPDATE paper_orders SET broker_order_id=?,status=? WHERE client_order_id=?",
            (str(response.id), getattr(response.status, "value", str(response.status)), client_id),
        )
    return "Paper order submitted; its fill and realized P&L are not yet recorded"


class TeamWorker:
    def __init__(self, symbol, db_path=None, settings_loader=load_settings,
                 services_factory=Services):
        if symbol not in STOCK_TEAM_NAMES:
            raise ValueError("Unknown stock team")
        self.symbol, self.db_path = symbol, db_path
        self.settings_loader, self.services_factory = settings_loader, services_factory
        self.stop_event = threading.Event()
        self.state_lock = threading.Lock()
        self.state, self.notes = "STARTING", "Worker process starting"
        self.recorded_state = None
        self.services, self.service_settings = None, None

    def report(self, state=None, notes=None):
        with self.state_lock:
            if state is not None:
                self.state = state
            if notes is not None:
                self.notes = notes
            record_worker_status(self.symbol, self.state, self.notes, pid=os.getpid(),
                                 db_path=self.db_path)
            if self.recorded_state != self.state:
                record_system_event(self.symbol, "WORKER_" + self.state, self.notes,
                                    db_path=self.db_path)
                self.recorded_state = self.state

    def heartbeat(self):
        while not self.stop_event.wait(HEARTBEAT_SECONDS):
            try:
                self.report()
            except Exception:
                LOG.error("%s heartbeat write failed", self.symbol)

    def cycle(self):
        settings = self.settings_loader()
        if not team_enabled(self.symbol, self.db_path):
            self.report("DISABLED", "Team control or score flag disables external work")
            return
        if settings["mode"] == "observe":
            self.report("STANDBY", "Observe mode: worker is alive; credentials can be added later")
            return
        missing = missing_settings(settings)
        if missing:
            self.report("WAITING_CONFIGURATION", "Set: " + ", ".join(missing))
            return
        if self.services is None or self.service_settings != settings:
            self.services = self.services_factory(settings)
            self.service_settings = settings.copy()
        self.report("ANALYZING", "Evaluating OHLCV specialist votes")
        analysis = evaluate_team(self.symbol, self.services.bars(self.symbol), source="Alpaca IEX minute bars")
        save_analysis(self.symbol, analysis, self.db_path)
        from council import review_proposal
        council=review_proposal(self.symbol,analysis,settings["mode"],self.db_path,now=utc_now())
        decision_id=council["proposal_id"]
        if council["action"]=="SKIP":
            self.report("ANALYSIS_READY","Council WAIT: "+council["reason"])
            return
        price = self.services.quote(self.symbol)
        with connect_db(self.db_path) as conn:
            history = [dict(row) for row in conn.execute(
                "SELECT direction,action,reason FROM worker_decisions "
                "WHERE team_name=? ORDER BY created_at DESC LIMIT 8", (self.symbol,)
            )]
        decision = self.services.decide(self.symbol, price, [analysis] + history)
        if decision["direction"] != analysis["direction"]:
            decision = dict(direction="SKIP", action="SKIP",
                            reason="AI did not confirm the specialist consensus")
        if council["action"]=="REDUCE_RISK" and decision["action"]=="APPROVE":
            decision["action"]="REDUCE_RISK"
        decision["reason"]+=" | Council: "+council["reason"]
        decision.update(stop_distance=analysis["indicators"]["stop_distance"],
                        atr=analysis["indicators"]["atr"], vwap=analysis["indicators"]["vwap"],
                        analysis_time=analysis["bar_time"])
        with connect_db(self.db_path) as conn:
            conn.execute(
                "INSERT INTO worker_decisions VALUES (?,?,?,?,?,?,?,?)",
                (decision_id, self.symbol, utc_now().isoformat(), settings["mode"],
                 decision["direction"], decision["action"], decision["reason"], price),
            )
        if settings["mode"] == "paper":
            result = submit_paper_order(self.symbol, decision_id, decision, price,
                                       self.services, self.db_path)
            self.report("PAPER", result)
        else:
            self.report("ANALYSIS_READY", decision["direction"] + " / " +
                        decision["action"] + ": " + decision["reason"])

    def run(self):
        ensure_system_tables(self.db_path)
        ensure_team_control(self.symbol, self.db_path)
        ensure_ledger(self.db_path)
        self.report()
        heartbeat = threading.Thread(target=self.heartbeat, daemon=True)
        heartbeat.start()
        try:
            while not self.stop_event.is_set():
                try:
                    self.cycle()
                except Exception as error:
                    self.report("ERROR", "Cycle failed (" + type(error).__name__ +
                                "); inspect configuration and provider availability")
                    LOG.error("%s cycle failed (%s), provider status=%s", self.symbol,
                              type(error).__name__, getattr(error, "status_code", "unavailable"))
                self.stop_event.wait(REFRESH_SECONDS)
        finally:
            self.stop_event.set()
            heartbeat.join(timeout=HEARTBEAT_SECONDS + 1)
            self.report("STOPPED", "Worker shut down")


def run_team(symbol):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    worker = TeamWorker(symbol)
    def stop(_signal, _frame):
        worker.stop_event.set()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    worker.run()
