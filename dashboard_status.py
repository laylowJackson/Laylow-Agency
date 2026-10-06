import json
from datetime import datetime, timezone

from db_utils import connect_db
from event_logger import log_event


def get_team_status_summary():
    conn = connect_db()
    rows = conn.execute(
        """
        SELECT team_name, status, active, last_heartbeat, notes, updated_at
        FROM team_status
        ORDER BY team_name ASC
        """
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append({
            "team_name": row["team_name"],
            "status": row["status"],
            "active": bool(row["active"]),
            "last_heartbeat": row["last_heartbeat"],
            "notes": row["notes"],
            "updated_at": row["updated_at"],
        })
    return result


def get_strategy_readiness_summary():
    conn = connect_db()
    rows = conn.execute(
        """
        SELECT team_name, score, wins, losses, streak, is_disabled, cool_down_until
        FROM team_scores
        ORDER BY team_name ASC
        """
    ).fetchall()
    conn.close()

    summary = []
    for row in rows:
        summary.append({
            "team_name": row["team_name"],
            "score": row["score"],
            "wins": row["wins"],
            "losses": row["losses"],
            "streak": row["streak"],
            "is_disabled": bool(row["is_disabled"]),
            "cool_down_until": row["cool_down_until"],
        })
    return summary


def get_backtest_summary():
    import sqlite3

    summary = []
    for team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
        db_path = f"backtest_{team_name.lower()}.db"
        try:
            conn = sqlite3.connect(db_path)
            rows = conn.execute(
                "SELECT COUNT(*) as total, SUM(pnl) as total_pnl FROM backtest_trades"
            ).fetchone()
            conn.close()

            total_trades = rows[0] or 0
            total_pnl = float(rows[1]) if rows[1] else 0.0

            summary.append({
                "team_name": team_name,
                "backtest_trades": total_trades,
                "backtest_pnl": round(total_pnl, 2),
            })
        except Exception:
            summary.append({
                "team_name": team_name,
                "backtest_trades": 0,
                "backtest_pnl": 0.0,
            })
    return summary


def get_system_events_summary(limit=20):
    conn = connect_db()
    rows = conn.execute(
        """
        SELECT team_name, event_type, details, created_at
        FROM system_events
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()

    events = []
    for row in rows:
        events.append({
            "team_name": row["team_name"],
            "event_type": row["event_type"],
            "details": row["details"],
            "created_at": row["created_at"],
        })
    return events


def get_dashboard_payload():
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team_status": get_team_status_summary(),
        "strategy_readiness": get_strategy_readiness_summary(),
        "backtest_summary": get_backtest_summary(),
        "recent_events": get_system_events_summary(limit=20),
    }


def save_dashboard_snapshot(path="dashboard_snapshot.json"):
    payload = get_dashboard_payload()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    log_event("DASHBOARD", "DASHBOARD_SNAPSHOT_SAVE", f"Dashboard snapshot saved to {path}")
    return payload


def print_dashboard_summary():
    payload = get_dashboard_payload()

    print("\n" + "=" * 80)
    print("LAYLOW AGENCY - TEAM DASHBOARD")
    print("=" * 80)
    print(f"Generated: {payload['generated_at']}\n")

    print("TEAM STATUS")
    print("-" * 80)
    for team in payload["team_status"]:
        status_icon = "✓" if team["active"] else "✗"
        print(f"{status_icon} {team['team_name']:<6} | Status: {team['status']:<10} | "
              f"Active: {team['active']:<5} | Updated: {team['updated_at']}")

    print("\nSTRATEGY READINESS")
    print("-" * 80)
    for team in payload["strategy_readiness"]:
        disabled = "DISABLED" if team["is_disabled"] else "ACTIVE"
        print(f"  {team['team_name']:<6} | Score: {team['score']:<7.2f} | "
              f"Wins: {team['wins']:<3} | Losses: {team['losses']:<3} | "
              f"Streak: {team['streak']:<3} | {disabled}")

    print("\nPAPER TRADING (BACKTEST)")
    print("-" * 80)
    for team in payload["backtest_summary"]:
        print(f"  {team['team_name']:<6} | Trades: {team['backtest_trades']:<4} | "
              f"Total PnL: ${team['backtest_pnl']:<8.2f}")

    print("\nRECENT EVENTS")
    print("-" * 80)
    for event in payload["recent_events"][:10]:
        print(f"  {event['created_at']:<20} | {event['event_type']:<20} | "
              f"{event['team_name']:<6} | {event['details']}")

    print("\n" + "=" * 80 + "\n")


def manual_update_team_status(team_name, new_status, notes=""):
    from db_utils import upsert_team_status
    upsert_team_status(team_name, status=new_status, notes=notes)
    log_event("MANUAL", "TEAM_STATUS_UPDATED", f"Team {team_name} set to {new_status}: {notes}")
    print(f"[MANUAL UPDATE] {team_name} status changed to {new_status}")


def manual_disable_team(team_name, reason=""):
    conn = connect_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE team_scores SET is_disabled = 1 WHERE team_name = ?",
        (team_name,),
    )
    conn.execute(
        "UPDATE team_status SET status = 'DISABLED', active = 0, notes = ?, updated_at = ? WHERE team_name = ?",
        (reason or "Manually disabled", now, team_name),
    )
    conn.commit()
    conn.close()
    log_event("MANUAL", "TEAM_DISABLED", f"{team_name}: {reason or 'Manually disabled'}")
    print(f"[MANUAL DISABLE] {team_name} has been disabled: {reason}")


def manual_enable_team(team_name, reason=""):
    conn = connect_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE team_scores SET is_disabled = 0, cool_down_until = ? WHERE team_name = ?",
        (now, team_name),
    )
    conn.execute(
        "UPDATE team_status SET status = 'RUNNING', active = 1, notes = ?, updated_at = ? WHERE team_name = ?",
        (reason or "Manually enabled", now, team_name),
    )
    conn.commit()
    conn.close()
    log_event("MANUAL", "TEAM_ENABLED", f"{team_name}: {reason or 'Manually enabled'}")
    print(f"[MANUAL ENABLE] {team_name} has been enabled: {reason}")


def manual_reset_team_scores(team_name):
    conn = connect_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE team_scores SET score = 0, wins = 0, losses = 0, streak = 0, is_disabled = 0, cool_down_until = ? WHERE team_name = ?",
        (now, team_name),
    )
    conn.commit()
    conn.close()
    log_event("MANUAL", "TEAM_SCORES_RESET", f"{team_name} scores manually reset")
    print(f"[MANUAL RESET] {team_name} scores have been reset")


def interactive_dashboard_menu():
    while True:
        print("\n" + "=" * 80)
        print("LAYLOW AGENCY - CONTROL PANEL")
        print("=" * 80)
        print("1. View Dashboard")
        print("2. Save Dashboard Snapshot")
        print("3. Disable Team")
        print("4. Enable Team")
        print("5. Reset Team Scores")
        print("6. Update Team Notes")
        print("7. Exit")
        print("=" * 80)

        choice = input("Select option (1-7): ").strip()

        if choice == "1":
            print_dashboard_summary()
        elif choice == "2":
            save_dashboard_snapshot()
            print("✓ Dashboard snapshot saved to dashboard_snapshot.json")
        elif choice == "3":
            team_name = input("Enter team name (SPY/QQQ/AAPL/TSLA): ").upper().strip()
            if team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
                reason = input("Enter reason for disabling: ").strip()
                manual_disable_team(team_name, reason)
            else:
                print("Invalid team name")
        elif choice == "4":
            team_name = input("Enter team name (SPY/QQQ/AAPL/TSLA): ").upper().strip()
            if team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
                reason = input("Enter reason for enabling: ").strip()
                manual_enable_team(team_name, reason)
            else:
                print("Invalid team name")
        elif choice == "5":
            team_name = input("Enter team name (SPY/QQQ/AAPL/TSLA): ").upper().strip()
            if team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
                confirm = input(f"Are you sure you want to reset {team_name} scores? (yes/no): ").strip().lower()
                if confirm == "yes":
                    manual_reset_team_scores(team_name)
                else:
                    print("Cancelled")
            else:
                print("Invalid team name")
        elif choice == "6":
            team_name = input("Enter team name (SPY/QQQ/AAPL/TSLA): ").upper().strip()
            if team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
                notes = input("Enter notes/status: ").strip()
                status = input("Enter status (RUNNING/PAUSED/DISABLED): ").upper().strip()
                if status in ["RUNNING", "PAUSED", "DISABLED"]:
                    manual_update_team_status(team_name, status, notes)
                else:
                    print("Invalid status")
            else:
                print("Invalid team name")
        elif choice == "7":
            print("Exiting...")
            break
        else:
            print("Invalid choice")


def main():
    interactive_dashboard_menu()


if __name__ == "__main__":
    main()
