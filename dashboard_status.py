import json
from datetime import datetime, timezone

from db_utils import connect_db


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


def get_dashboard_payload():
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team_status": get_team_status_summary(),
        "strategy_readiness": get_strategy_readiness_summary(),
    }


def save_dashboard_snapshot(path="dashboard_snapshot.json"):
    payload = get_dashboard_payload()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return payload
