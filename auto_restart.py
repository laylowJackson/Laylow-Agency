import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone


def team_status_exists(team_name):
    db_path = "team_status.db"
    if not os.path.exists(db_path):
        return False

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT 1 FROM team_status WHERE team_name = ?", (team_name,)).fetchone()
    conn.close()
    return row is not None


def restart_team(team_name):
    print(f"[AUTO RESTART] Restarting {team_name}")
    script_name = f"teams/{team_name.lower()}_team.py"
    if os.path.exists(script_name):
        subprocess.Popen([sys.executable, script_name])


def monitor_teams():
    if not os.path.exists("team_status.db"):
        print("[AUTO RESTART] No team status DB yet.")
        return

    conn = sqlite3.connect("team_status.db")
    rows = conn.execute("SELECT team_name, status, active FROM team_status").fetchall()
    conn.close()

    for team_name, status, active in rows:
        if status == "DOWN" or active == 0:
            restart_team(team_name)


def main():
    print("[AUTO RESTART] Monitoring team health...")
    while True:
        monitor_teams()
        time.sleep(120)


if __name__ == "__main__":
    main()
