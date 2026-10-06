from datetime import datetime, timezone

from db_utils import connect_db, ensure_system_tables


def log_event(team_name, event_type, details):
    ensure_system_tables()
    conn = connect_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO system_events (team_name, event_type, details, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (team_name, event_type, details, now),
    )
    conn.commit()
    conn.close()
    return now
