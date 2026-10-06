import os
import sqlite3
import time
from datetime import datetime, timezone

DB_PATH = "team_status.db"
TEAM_DB_FILES = [
    "spy_team.db",
    "qqq_team.db",
    "aapl_team.db",
    "tsla_team.db",
]

COOLDOWN_SECONDS = 3600


def get_status_db():
    return sqlite3.connect(DB_PATH)


def ensure_team_score_table():
    conn = get_status_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS team_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            score REAL,
            wins INTEGER,
            losses INTEGER,
            streak INTEGER,
            last_updated TEXT,
            cool_down_until TEXT,
            is_disabled INTEGER
        )
    """)
    conn.commit()
    conn.close()


def get_team_trade_rows(db_path):
    if not os.path.exists(db_path):
        return []
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT direction, pnl, result FROM trades ORDER BY id DESC LIMIT 20").fetchall()
    conn.close()
    return rows


def score_team(team_name, db_path):
    rows = get_team_trade_rows(db_path)
    if not rows:
        return {
            "score": 0.0,
            "wins": 0,
            "losses": 0,
            "streak": 0,
        }

    wins = 0
    losses = 0
    streak = 0
    score = 0.0

    for direction, pnl, result in rows:
        if pnl is not None:
            if float(pnl) > 0:
                wins += 1
                score += 1.0
                streak += 1
            else:
                losses += 1
                score -= 1.0
                streak = 0

    return {
        "score": round(score, 2),
        "wins": wins,
        "losses": losses,
        "streak": streak,
    }


def update_team_scores():
    ensure_team_score_table()
    conn = get_status_db()
    now = datetime.now(timezone.utc).isoformat()

    for db_file in TEAM_DB_FILES:
        team_name = os.path.basename(db_file).replace("_team.db", "").upper()
        stats = score_team(team_name, db_file)

        existing = conn.execute("SELECT id, is_disabled, cool_down_until FROM team_scores WHERE team_name = ?", (team_name,)).fetchone()
        if existing is None:
            conn.execute("""
                INSERT INTO team_scores (team_name, score, wins, losses, streak, last_updated, cool_down_until, is_disabled)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """, (team_name, stats["score"], stats["wins"], stats["losses"], stats["streak"], now, now))
            continue

        _, is_disabled, cool_down_until = existing
        if is_disabled == 1 and cool_down_until and cool_down_until > now:
            conn.execute("UPDATE team_scores SET score = ?, wins = ?, losses = ?, streak = ?, last_updated = ? WHERE team_name = ?",
                         (stats["score"], stats["wins"], stats["losses"], stats["streak"], now, team_name))
            continue

        conn.execute("""
            UPDATE team_scores
            SET score = ?, wins = ?, losses = ?, streak = ?, last_updated = ?, is_disabled = 0, cool_down_until = ?
            WHERE team_name = ?
        """, (stats["score"], stats["wins"], stats["losses"], stats["streak"], now, now, team_name))

    conn.commit()
    conn.close()


def disable_weak_team():
    conn = get_status_db()
    rows = conn.execute("SELECT team_name, score, is_disabled, cool_down_until FROM team_scores ORDER BY score ASC LIMIT 1").fetchall()
    conn.close()

    for team_name, score, is_disabled, cool_down_until in rows:
        if is_disabled == 1:
            continue

        now = datetime.now(timezone.utc).isoformat()
        future = (datetime.now(timezone.utc).timestamp() + COOLDOWN_SECONDS)
        cooldown_value = datetime.fromtimestamp(future, timezone.utc).isoformat()

        conn = get_status_db()
        conn.execute("UPDATE team_scores SET is_disabled = 1, cool_down_until = ? WHERE team_name = ?", (cooldown_value, team_name))
        conn.execute("UPDATE team_status SET status = 'DISABLED', active = 0, notes = 'Disabled by team performance scoring' WHERE team_name = ?", (team_name,))
        conn.commit()
        conn.close()
        print(f"[TEAM SCORER] Disabled {team_name} due to poor performance. Cooldown until {cooldown_value}")
        return


def reenable_team_if_ready():
    conn = get_status_db()
    rows = conn.execute("SELECT team_name, cool_down_until, is_disabled FROM team_scores WHERE is_disabled = 1").fetchall()
    conn.close()

    now = datetime.now(timezone.utc)
    for team_name, cool_down_until, is_disabled in rows:
        if is_disabled == 1 and cool_down_until:
            cd = datetime.fromisoformat(cool_down_until)
            if now >= cd:
                conn = get_status_db()
                conn.execute("UPDATE team_scores SET is_disabled = 0, cool_down_until = ? WHERE team_name = ?", (None, team_name))
                conn.execute("UPDATE team_status SET status = 'RUNNING', active = 1, notes = 'Re-enabled after cooldown' WHERE team_name = ?", (team_name,))
                conn.commit()
                conn.close()
                print(f"[TEAM SCORER] Re-enabled {team_name} after cooldown")


def main():
    print("[TEAM SCORER] starting team performance monitoring...")
    while True:
        update_team_scores()
        reenable_team_if_ready()
        disable_weak_team()
        time.sleep(60)


if __name__ == "__main__":
    main()
