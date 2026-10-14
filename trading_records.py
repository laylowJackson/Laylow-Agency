"""Recorded closed-trade imports and optional paper-entry profit brakes.

No simulated earnings, broker submissions or reconciliation guesses. The import
producer is responsible for a complete, account-specific closed-trade export.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo
import csv
from pathlib import Path
from config import TEAM_NAMES, STOCK_TEAM_NAMES
from db_utils import connect_db, ensure_system_tables, utc_now
from entry_controls import parse_utc

SESSION_ZONE = ZoneInfo("America/New_York")

def cents(value, positive=False):
    if isinstance(value, bool):
        raise ValueError("Boolean money value")
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or abs(amount) > Decimal("10000000"):
            raise ValueError("Invalid money amount")
        if amount.as_tuple().exponent < -2:
            raise ValueError("Use at most two decimal places")
        number = int(amount * 100)
    except (InvalidOperation, TypeError, OverflowError):
        raise ValueError("Invalid money amount") from None
    if positive and number <= 0:
        raise ValueError("A positive threshold is required")
    return number

def session_day(value):
    return parse_utc(value).astimezone(SESSION_ZONE).date().isoformat()

def import_closed_trades(rows, source, mode, as_of, db_path=None, now=None):
    current = parse_utc(now) if now is not None else datetime.now(timezone.utc)
    observed = parse_utc(as_of)
    if mode not in {"paper", "live"} or not isinstance(source, str) or not source.strip() or len(source) > 128:
        raise ValueError("Use paper/live and a stable account-export source name")
    if observed > current + timedelta(seconds=30):
        raise ValueError("Export timestamp is in the future")
    if not isinstance(rows, list) or len(rows) > 10000:
        raise ValueError("Expected at most 10000 closed trades")
    clean, identities = [], set()
    for row in rows:
        if not isinstance(row, dict) or row.get("team_name") not in TEAM_NAMES:
            raise ValueError("Unknown trade team")
        trade_id = row.get("trade_id")
        if not isinstance(trade_id, str) or not trade_id or len(trade_id) > 128 or trade_id in identities:
            raise ValueError("Trade IDs must be unique and nonempty")
        identities.add(trade_id)
        closed = parse_utc(row.get("closed_at"))
        if closed > observed:
            raise ValueError("A trade closed after the export timestamp")
        gross, fees = cents(row.get("gross_pnl")), cents(row.get("fees"))
        if fees < 0:
            raise ValueError("Fees cannot be negative")
        clean.append((source.strip(),mode,trade_id,row["team_name"],closed.isoformat(),gross,fees))
    ensure_system_tables(db_path)
    with connect_db(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        previous = connection.execute("SELECT as_of FROM trade_exports WHERE source=? AND mode=?",
                                      (source.strip(),mode)).fetchone()
        if previous and observed < parse_utc(previous["as_of"]):
            raise ValueError("Export cannot move backwards in time")
        for values in clean:
            existing = connection.execute("SELECT source,mode,trade_id,team_name,closed_at,gross_cents,fee_cents "
                                          "FROM closed_trades WHERE source=? AND mode=? AND trade_id=?",values[:3]).fetchone()
            if existing and tuple(existing) != values:
                raise ValueError("An existing trade ID has conflicting data; no rows imported")
            connection.execute("INSERT OR IGNORE INTO closed_trades "
                               "(source,mode,trade_id,team_name,closed_at,gross_cents,fee_cents) "
                               "VALUES (?,?,?,?,?,?,?)",values)
        # Only one source is allowed per mode to avoid double-counting one account's fills.
        other = connection.execute("SELECT source FROM trade_exports WHERE mode=? AND source<>?",
                                   (mode,source.strip())).fetchone()
        if other:
            raise ValueError("This mode already has a different export source; keep its stable source name")
        connection.execute("INSERT INTO trade_exports (source,mode,as_of,imported_at) VALUES (?,?,?,?) "
                           "ON CONFLICT(source,mode) DO UPDATE SET as_of=excluded.as_of,imported_at=excluded.imported_at",
                           (source.strip(),mode,observed.isoformat(),utc_now()))
        for name in STOCK_TEAM_NAMES:
            brake_from_connection(connection,name,current,persist=True)
    return len(clean)

def payroll_payload(trades, exports, names, now, mode="paper"):
    current, day = parse_utc(now), session_day(now)
    selected = [row for row in trades if row.get("mode") == mode]
    feeds = [row for row in exports if row.get("mode") == mode]
    available = bool(feeds)
    fresh = any(-30 <= (current-parse_utc(row["as_of"])).total_seconds() <= 90 for row in feeds)
    workers = []
    for name in names:
        today = [row for row in selected if row.get("team_name")==name and session_day(row["closed_at"])==day]
        net = [int(row["gross_cents"])-int(row["fee_cents"]) for row in today]
        workers.append({"team_name":name,"closed_trades":len(today),"wins":sum(value>0 for value in net),
                        "losses":sum(value<0 for value in net),"net_cents":sum(net) if available else None})
    by_day = {}
    for row in selected:
        key = session_day(row["closed_at"])
        by_day[key] = by_day.get(key,0)+int(row["gross_cents"])-int(row["fee_cents"])
    recent = sorted(selected,key=lambda row:row["closed_at"],reverse=True)[:20]
    return {"mode":mode,"day":day,"timezone":"America/New_York","available":available,"fresh":fresh,
            "basis":"Imported closed trades, net of stated fees; export completeness is producer supplied",
            "sources":feeds,"workers":workers,"total_net_cents":sum(row["net_cents"] or 0 for row in workers) if available else None,
            "all_time_net_cents":sum(by_day.values()) if available else None,
            "daily":[{"day":day,"net_cents":net} for day,net in sorted(by_day.items())[-30:]],
            "recent":[{"team_name":row["team_name"],"trade_id":row["trade_id"],"closed_at":row["closed_at"],
                       "source":row["source"],"mode":row["mode"],"net_cents":int(row["gross_cents"])-int(row["fee_cents"])} for row in recent]}

def assess_profit_brake(team_name, row, trades, exports, now=None):
    current = parse_utc(now) if now is not None else datetime.now(timezone.utc)
    row = row or {}
    limit = row.get("limit_cents")
    if limit is None:
        return {"status":"DISABLED","locked":False,"limit_cents":None,"net_cents":None}
    day = session_day(current)
    payroll = payroll_payload(trades,exports,[team_name],current,"paper")
    net = payroll["workers"][0]["net_cents"]
    hit = row.get("hit_day")==day or (net is not None and net >= int(limit))
    status = "PROFIT_BRAKE_HIT" if hit else "AWAITING_CURRENT_EXPORT" if not payroll["fresh"] else "ARMED"
    return {"status":status,"locked":status!="ARMED","limit_cents":int(limit),
            "net_cents":net,"day":day,"source_fresh":payroll["fresh"]}

def brake_from_connection(connection, team_name, now=None, persist=False):
    row = connection.execute("SELECT * FROM risk_brakes WHERE team_name=?",(team_name,)).fetchone()
    trades = [dict(row) for row in connection.execute("SELECT * FROM closed_trades WHERE team_name=? AND mode='paper'",(team_name,))]
    exports = [dict(row) for row in connection.execute("SELECT * FROM trade_exports WHERE mode='paper'")]
    result = assess_profit_brake(team_name,dict(row) if row else {},trades,exports,now)
    if persist and result["status"]=="PROFIT_BRAKE_HIT":
        connection.execute("UPDATE risk_brakes SET hit_day=? WHERE team_name=?",(result["day"],team_name))
    return result

def set_profit_brake(team_name, amount, db_path=None):
    if team_name not in STOCK_TEAM_NAMES:
        raise ValueError("Profit brakes apply only to stock paper entries")
    limit = None if amount is None or amount=="" else cents(amount,positive=True)
    ensure_system_tables(db_path)
    with connect_db(db_path) as connection:
        connection.execute("INSERT INTO risk_brakes (team_name,limit_cents,hit_day,updated_at) VALUES (?,?,NULL,?) "
                           "ON CONFLICT(team_name) DO UPDATE SET limit_cents=excluded.limit_cents,updated_at=excluded.updated_at",
                           (team_name,limit,utc_now()))
        brake_from_connection(connection,team_name,persist=True)
