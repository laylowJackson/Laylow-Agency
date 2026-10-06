import sqlite3
import time
from datetime import datetime, timezone

DB_PATH = "team_status.db"


def get_team_status():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT team_name, status, last_heartbeat, active, notes FROM team_status").fetchall()
    conn.close()
    return rows


def get_active_teams():
    return [team for team, status, hb, active, notes in get_team_status() if active == 1]


def overall_portfolio_summary():
    rows = get_team_status()
    print("\n=== PORTFOLIO RISK SUMMARY ===")
    for team, status, heartbeat, active, notes in rows:
        print(f"{team}: status={status}, active={active}, note={notes}")


def main():
    print("[PORTFOLIO RISK] running")
    while True:
        overall_portfolio_summary()
        time.sleep(60)


if __name__ == "__main__":
    main()
