import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY)

TEAM_DB_FILES = [
    "spy_team.db",
    "qqq_team.db",
    "aapl_team.db",
    "tsla_team.db",
]


def get_trade_history(db_path):
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    rows = conn.execute("""
        SELECT symbol, direction, strategy, ai_reason, confidence, pnl, result, timestamp
        FROM trades
        ORDER BY id DESC
        LIMIT 30
    """).fetchall()
    conn.close()
    return rows


def summarize_team_history(db_path):
    rows = get_trade_history(db_path)
    if not rows:
        return "No trades yet."

    summary = []
    for symbol, direction, strategy, ai_reason, confidence, pnl, result, ts in rows:
        summary.append(
            f"- {symbol} {direction} via {strategy}, confidence={confidence}, pnl={pnl}, result={result}, time={ts}"
        )
    return "\n".join(summary)


def ask_ai(prompt):
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[LEARNING BOT ERROR] {e}")
        return "No insight."


def evolve_team_strategy(db_path):
    history = summarize_team_history(db_path)
    team_name = os.path.basename(db_path).replace("_team.db", "").upper()

    prompt = f"""
    You are the after-hours learning AI for {team_name}.
    Review this trade history and extract patterns.

    Trade history:
    {history}

    Return in this exact format:
    OVERALL: GOOD / CAUTION / BAD
    PATTERN: one sentence
    IMPROVEMENT: one sentence
    NEXT_MOVE: INCREASE_CONFIDENCE / MAINTAIN / REDUCE_CONFIDENCE / SKIP
    """

    result = ask_ai(prompt)
    print(f"[LEARNING BOT] {team_name}\n{result}\n")

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS learning_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            summary TEXT
        )
    """)
    conn.execute(
        "INSERT INTO learning_log (timestamp, summary) VALUES (?, ?)",
        (datetime.now(timezone.utc).isoformat(), result),
    )
    conn.commit()
    conn.close()


def main():
    print("[LEARNING BOT] Starting after-hours learning cycle...")
    while True:
        for db_file in TEAM_DB_FILES:
            if os.path.exists(db_file):
                evolve_team_strategy(db_file)
        time.sleep(3600)


if __name__ == "__main__":
    main()
