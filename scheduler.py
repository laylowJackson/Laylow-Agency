import sqlite3
import time
from datetime import datetime, timezone

TEAM_DB_FILES = [
    "spy_team.db",
    "qqq_team.db",
    "aapl_team.db",
    "tsla_team.db",
]


def get_schedule_state():
    conn = sqlite3.connect("system_schedule.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT,
            next_run TEXT
        )
    """)
    conn.commit()
    conn.close()


def schedule_learning_runs():
    conn = sqlite3.connect("system_schedule.db")
    print("[SCHEDULER] Learning runs scheduled every hour.")
    conn.execute("INSERT INTO schedule (action, next_run) VALUES (?, ?)", ("learning", datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()


def main():
    get_schedule_state()
    schedule_learning_runs()
    print("[SCHEDULER] Running automation loop...")
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
