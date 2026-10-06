import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

DB_PATH = "team_status.db"
TEAM_PATHS = [
    "teams/spy_team.py",
    "teams/qqq_team.py",
    "teams/aapl_team.py",
    "teams/tsla_team.py",
]


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS team_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            status TEXT,
            last_heartbeat TEXT,
            active INTEGER,
            notes TEXT
        )
    """)
    conn.commit()
    conn.close()


def team_name_from_path(path):
    name = os.path.basename(path).replace("_team.py", "")
    return name.upper()


def heartbeat(team):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO team_status (team_name, status, last_heartbeat, active, notes)
        VALUES (?, 'RUNNING', ?, 1, 'Healthy')
        ON CONFLICT DO NOTHING
    """, (team, datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


def update_heartbeat(team):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        UPDATE team_status
        SET status = 'RUNNING', last_heartbeat = ?, active = 1, notes = 'Healthy'
        WHERE team_name = ?
    """, (datetime.now(timezone.utc).isoformat(), team))
    conn.commit()
    conn.close()


def mark_down(team, note):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        UPDATE team_status
        SET status = 'DOWN', last_heartbeat = ?, active = 0, notes = ?
        WHERE team_name = ?
    """, (datetime.now(timezone.utc).isoformat(), note, team))
    conn.commit()
    conn.close()


def ensure_rows():
    conn = sqlite3.connect(DB_PATH)
    for path in TEAM_PATHS:
        team = team_name_from_path(path)
        row = conn.execute("SELECT 1 FROM team_status WHERE team_name = ?", (team,)).fetchone()
        if row is None:
            conn.execute("""
                INSERT INTO team_status (team_name, status, last_heartbeat, active, notes)
                VALUES (?, 'STARTING', ?, 1, 'Pending start')
            """, (team, datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


def main():
    init_db()
    ensure_rows()
    print("[PORTFOLIO MANAGER] Team status monitoring started.")
    while True:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute("SELECT team_name, status, last_heartbeat, active, notes FROM team_status ORDER BY team_name").fetchall()
        conn.close()

        print("\n--- TEAM HEALTH ---")
        for team_name, status, heartbeat_time, active, notes in rows:
            print(f"{team_name}: {status} | active={active} | heartbeat={heartbeat_time} | notes={notes}")

        time.sleep(60)


if __name__ == "__main__":
    main()
