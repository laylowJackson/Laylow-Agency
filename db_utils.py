import sqlite3
from datetime import datetime, timezone

from config import DB_PATH


def connect_db(db_path=None):
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_system_tables():
    conn = connect_db()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS team_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT UNIQUE,
            status TEXT,
            active INTEGER,
            last_heartbeat TEXT,
            notes TEXT,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS team_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT UNIQUE,
            score REAL,
            wins INTEGER,
            losses INTEGER,
            streak INTEGER,
            last_updated TEXT,
            cool_down_until TEXT,
            is_disabled INTEGER
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS learning_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            timestamp TEXT,
            summary TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            event_type TEXT,
            details TEXT,
            created_at TEXT
        )
        """
    )

    conn.commit()
    conn.close()


def upsert_team_status(team_name, status="RUNNING", active=1, notes="", heartbeat=None):
    now = datetime.now(timezone.utc).isoformat()
    conn = connect_db()
    existing = conn.execute(
        "SELECT 1 FROM team_status WHERE team_name = ?",
        (team_name,),
    ).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO team_status (team_name, status, active, last_heartbeat, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (team_name, status, active, heartbeat or now, notes, now, now),
        )
    else:
        conn.execute(
            """
            UPDATE team_status
            SET status = ?, active = ?, last_heartbeat = ?, notes = ?, updated_at = ?
            WHERE team_name = ?
            """,
            (status, active, heartbeat or now, notes, now, team_name),
        )

    conn.commit()
    conn.close()


def upsert_team_scores(team_name, score=0, wins=0, losses=0, streak=0, is_disabled=0, cool_down_until=""):
    now = datetime.now(timezone.utc).isoformat()
    conn = connect_db()
    existing = conn.execute(
        "SELECT 1 FROM team_scores WHERE team_name = ?",
        (team_name,),
    ).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO team_scores (team_name, score, wins, losses, streak, last_updated, cool_down_until, is_disabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (team_name, score, wins, losses, streak, now, cool_down_until or now, is_disabled),
        )
    else:
        conn.execute(
            """
            UPDATE team_scores
            SET score = ?, wins = ?, losses = ?, streak = ?, last_updated = ?, cool_down_until = ?, is_disabled = ?
            WHERE team_name = ?
            """,
            (score, wins, losses, streak, now, cool_down_until or now, is_disabled, team_name),
        )

    conn.commit()
    conn.close()
