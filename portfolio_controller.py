import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

DB_PATH = "team_status.db"
TEAMS = [
    "SPY",
    "QQQ",
    "AAPL",
    "TSLA",
]

MAX_ACTIVE_TEAMS = 3
MAX_TOTAL_EXPOSURE = 0.30
MAX_PORTFOLIO_DRAWDOWN = 0.10


def get_status_db():
    conn = sqlite3.connect(DB_PATH)
    return conn


def get_team_rows():
    conn = get_status_db()
    rows = conn.execute("SELECT team_name, status, last_heartbeat, active, notes FROM team_status ORDER BY team_name").fetchall()
    conn.close()
    return rows


def active_teams_count():
    return sum(1 for _, _, _, active, _ in get_team_rows() if active == 1)


def total_exposure_estimate():
    # simple estimate based on active teams count
    return min(1.0, active_teams_count() / len(TEAMS))


def portfolio_drawdown_estimate():
    # rough drawdown estimate based on active team count and health
    active_count = active_teams_count()
    if active_count <= 0:
        return 1.0
    return min(1.0, (len(TEAMS) - active_count) / len(TEAMS))


def disable_weak_team():
    rows = get_team_rows()
    if not rows:
        return

    for team, status, last_hb, active, notes in rows:
        if active == 1:
            conn = get_status_db()
            conn.execute("UPDATE team_status SET active = 0, status = 'DISABLED', notes = 'Auto-disabled by portfolio controller' WHERE team_name = ?", (team,))
            conn.commit()
            conn.close()
            print(f"[PORTFOLIO CONTROLLER] Disabled {team} due to exposure guard")
            return


def evaluate_portfolio():
    active_count = active_teams_count()
    exposure = total_exposure_estimate()
    drawdown = portfolio_drawdown_estimate()

    print(f"[PORTFOLIO CONTROLLER] active_teams={active_count}, exposure={exposure:.2f}, drawdown={drawdown:.2f}")

    if active_count > MAX_ACTIVE_TEAMS:
        print("[PORTFOLIO CONTROLLER] Too many active teams. Disabling one.")
        disable_weak_team()
        return

    if exposure > MAX_TOTAL_EXPOSURE:
        print("[PORTFOLIO CONTROLLER] Exposure too high. Disabling one.")
        disable_weak_team()
        return

    if drawdown > MAX_PORTFOLIO_DRAWDOWN:
        print("[PORTFOLIO CONTROLLER] Portfolio drawdown too high. Disabling one.")
        disable_weak_team()
        return


def main():
    print("[PORTFOLIO CONTROLLER] Starting...")
    while True:
        evaluate_portfolio()
        time.sleep(60)


if __name__ == "__main__":
    main()
