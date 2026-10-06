import os
import sqlite3
import time
from datetime import datetime, timezone

from dashboard_status import get_dashboard_payload, save_dashboard_snapshot
from event_logger import log_event

TEAM_NAMES = ["SPY", "QQQ", "AAPL", "TSLA"]


def ensure_tables():
    conn = sqlite3.connect("team_monitor.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS team_monitor_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            live_eligible INTEGER DEFAULT 0,
            blocked INTEGER DEFAULT 0,
            cooldown_until TEXT,
            status TEXT,
            last_checked TEXT,
            notes TEXT,
            updated_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS manual_override_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            action TEXT,
            reason TEXT,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def get_or_create_monitor_record(team_name):
    conn = sqlite3.connect("team_monitor.db")
    row = conn.execute(
        "SELECT * FROM team_monitor_state WHERE team_name = ?",
        (team_name,),
    ).fetchone()

    if row is None:
        conn.execute(
            "INSERT INTO team_monitor_state (team_name, live_eligible, blocked, cooldown_until, status, last_checked, notes, updated_at) VALUES (?, 0, 0, ?, 'CHECKING', ?, '', ?)",
            (team_name, None, datetime.now(timezone.utc).isoformat(), datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM team_monitor_state WHERE team_name = ?",
            (team_name,),
        ).fetchone()
    conn.close()
    return row


def update_monitor_record(team_name, live_eligible=None, blocked=None, cooldown_until=None, status=None, notes=None):
    conn = sqlite3.connect("team_monitor.db")
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "live_eligible": live_eligible,
        "blocked": blocked,
        "cooldown_until": cooldown_until,
        "status": status,
        "notes": notes,
        "updated_at": now,
    }

    updates = []
    values = []
    for key, value in data.items():
        if value is not None:
            updates.append(f"{key} = ?")
            values.append(value)

    if updates:
        updates_sql = ", ".join(updates)
        values.extend([team_name])
        conn.execute(f"UPDATE team_monitor_state SET {updates_sql} WHERE team_name = ?", values)

    conn.execute(
        "UPDATE team_monitor_state SET last_checked = ?, updated_at = ? WHERE team_name = ?",
        (now, now, team_name),
    )
    conn.commit()
    conn.close()


def log_manual_override(team_name, action, reason):
    conn = sqlite3.connect("team_monitor.db")
    conn.execute(
        "INSERT INTO manual_override_log (team_name, action, reason, created_at) VALUES (?, ?, ?, ?)",
        (team_name, action, reason, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def evaluate_team(team_name):
    conn = sqlite3.connect("team_monitor.db")
    row = conn.execute(
        "SELECT * FROM team_monitor_state WHERE team_name = ?",
        (team_name,),
    ).fetchone()
    conn.close()

    if row is None:
        get_or_create_monitor_record(team_name)
        row = get_or_create_monitor_record(team_name)

    # static thresholds for now
    min_trades = 20
    min_win_rate = 50.0
    min_score = 0.3

    # read current readiness metrics from dashboard payload
    payload = get_dashboard_payload()
    readiness = next((x for x in payload["strategy_readiness"] if x["team_name"] == team_name), None)
    backtest = next((x for x in payload["backtest_summary"] if x["team_name"] == team_name), None)

    if readiness is None:
        update_monitor_record(team_name, live_eligible=0, blocked=1, status="BLOCKED", notes="No readiness data")
        return "BLOCKED"

    trade_count = backtest.get("backtest_trades", 0) if backtest else 0
    win_rate = readiness.get("wins", 0) / max(1, readiness.get("wins", 0) + readiness.get("losses", 0)) * 100 if (readiness.get("wins", 0) + readiness.get("losses", 0)) > 0 else 0.0
    score = readiness.get("score", 0.0)

    if trade_count < min_trades:
        update_monitor_record(team_name, live_eligible=0, blocked=0, status="COOLDOWN", notes=f"Not enough paper trades: {trade_count}/{min_trades}")
        log_event("MONITOR_CHECK", f"{team_name} needs more paper trades", team_name)
        return "COOLDOWN"

    if win_rate < min_win_rate:
        update_monitor_record(team_name, live_eligible=0, blocked=1, status="BLOCKED", notes=f"Win rate too low: {win_rate:.1f}% < {min_win_rate}%")
        log_event("MONITOR_CHECK", f"{team_name} blocked for poor win rate", team_name)
        return "BLOCKED"

    if score < min_score:
        update_monitor_record(team_name, live_eligible=0, blocked=1, status="BLOCKED", notes=f"Score too low: {score} < {min_score}")
        log_event("MONITOR_CHECK", f"{team_name} blocked for low score", team_name)
        return "BLOCKED"

    update_monitor_record(team_name, live_eligible=1, blocked=0, status="LIVE_ELIGIBLE", notes="Ready for live activity")
    log_event("MONITOR_CHECK", f"{team_name} is live eligible", team_name)
    return "LIVE_ELIGIBLE"


def refresh_monitoring_cycle():
    ensure_tables()
    save_dashboard_snapshot()
    statuses = {}
    for team in TEAM_NAMES:
        statuses[team] = evaluate_team(team)
    return statuses


def manual_override(team_name, action, reason):
    if action not in ["ENABLE", "DISABLE", "COOLDOWN"]:
        raise ValueError("Action must be ENABLE, DISABLE, or COOLDOWN")

    if action == "ENABLE":
        update_monitor_record(team_name, live_eligible=1, blocked=0, status="LIVE_ELIGIBLE", notes=reason)
    elif action == "DISABLE":
        update_monitor_record(team_name, live_eligible=0, blocked=1, status="BLOCKED", notes=reason)
    else:
        update_monitor_record(team_name, live_eligible=0, blocked=0, status="COOLDOWN", notes=reason)

    log_manual_override(team_name, action, reason)
    log_event("MANUAL_OVERRIDE", f"{team_name} {action}: {reason}", team_name)
    return True


def main():
    ensure_tables()
    print("[MONITORING] Starting team health monitoring loop...")
    while True:
        statuses = refresh_monitoring_cycle()
        print("\nMonitoring status:")
        for team, state in statuses.items():
            print(f"  {team}: {state}")
        time.sleep(300)


if __name__ == "__main__":
    main()
