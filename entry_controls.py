"""Manual event locks. Stock paper entries require an upcoming earnings date."""
from datetime import datetime, timedelta, timezone
from config import STOCK_TEAM_NAMES, FUTURES_TEAM_NAMES

def parse_utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Use an ISO timestamp with a timezone")
    return value.astimezone(timezone.utc)

def assess_controls(team_name, row=None, enabled=True, now=None):
    current = parse_utc(now) if now is not None else datetime.now(timezone.utc)
    row = row or {}
    headline = row.get("headline_locked") in (True, 1, "1")
    earnings_at = row.get("earnings_at") or None
    status, earnings_locked = "UNKNOWN", True
    if team_name not in {"AAPL", "TSLA"}:
        status, earnings_locked = "NOT_APPLICABLE", False
    elif earnings_at:
        try:
            scheduled = parse_utc(earnings_at)
            if current > scheduled + timedelta(hours=12):
                status = "EXPIRED"
            elif current >= scheduled - timedelta(hours=24):
                status = "LOCKED"
            else:
                status, earnings_locked = "SCHEDULED", False
        except (ValueError, TypeError, OverflowError):
            pass
    reasons = []
    if not enabled:
        reasons.append("Team disabled")
    if headline:
        reasons.append("Manual headline lock")
    if earnings_locked:
        reasons.append("Earnings " + status.lower())
    return {"enabled": bool(enabled), "headline_locked": headline,
            "earnings_at": earnings_at, "earnings_status": status,
            "earnings_locked": earnings_locked, "entry_locked": bool(reasons),
            "lock_reason": "; ".join(reasons)}

def read_entry_controls(team_name, db_path=None, enabled=True, now=None):
    from db_utils import connect_db
    with connect_db(db_path) as connection:
        row = connection.execute("SELECT * FROM team_controls WHERE team_name=?", (team_name,)).fetchone()
    return assess_controls(team_name, dict(row) if row else {}, enabled, now)

def update_control(team_name, *, headline_locked=None, earnings_at=None, db_path=None):
    from db_utils import _write_connection, utc_now
    if team_name not in STOCK_TEAM_NAMES:
        raise ValueError("Event controls apply only to stock teams")
    if headline_locked is not None and type(headline_locked) is not bool:
        raise ValueError("locked must be a boolean")
    if earnings_at is not None:
        if not isinstance(earnings_at, str):
            raise ValueError("earnings_at must be a timestamp or an empty string")
        earnings_at = parse_utc(earnings_at).isoformat() if earnings_at else ""
    with _write_connection(db_path) as connection:
        connection.execute("INSERT OR IGNORE INTO team_controls (team_name,updated_at) VALUES (?,?)",
                           (team_name, utc_now()))
        if headline_locked is not None:
            connection.execute("UPDATE team_controls SET headline_locked=?,updated_at=? WHERE team_name=?",
                               (int(headline_locked), utc_now(), team_name))
        if earnings_at is not None:
            connection.execute("UPDATE team_controls SET earnings_at=?,updated_at=? WHERE team_name=?",
                               (earnings_at, utc_now(), team_name))
