import sqlite3
import time
from datetime import datetime, timezone

from db_utils import connect_db
from event_logger import log_event


def get_backtest_db(team_name):
    db_path = f"backtest_{team_name.lower()}.db"
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS backtest_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT,
            symbol TEXT,
            direction TEXT,
            entry_price REAL,
            exit_price REAL,
            quantity REAL,
            pnl REAL,
            pnl_percent REAL,
            status TEXT,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()
    return db_path


def simulate_trade(team_name, symbol, direction, entry_price, quantity, exit_price=None):
    if exit_price is None:
        exit_price = entry_price

    pnl = (exit_price - entry_price) * quantity if direction == "LONG" else (entry_price - exit_price) * quantity
    pnl_percent = ((pnl / (entry_price * quantity)) * 100) if entry_price and quantity else 0.0

    db_path = get_backtest_db(team_name)
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO backtest_trades
        (team_name, symbol, direction, entry_price, exit_price, quantity, pnl, pnl_percent, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (team_name, symbol, direction, entry_price, exit_price, quantity, pnl, pnl_percent, "SIMULATED", datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()

    log_event("PAPER_TRADE", f"{team_name} {symbol} {direction} pnl={pnl:.2f}", team_name)
    return pnl


def get_backtest_stats(team_name):
    db_path = get_backtest_db(team_name)
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT pnl FROM backtest_trades ORDER BY id DESC LIMIT 100"
    ).fetchall()
    conn.close()

    if not rows:
        return {
            "total_trades": 0,
            "win_rate": 0.0,
            "total_pnl": 0.0,
            "avg_pnl": 0.0,
            "best_trade": 0.0,
            "worst_trade": 0.0,
            "score": 0.0,
        }

    pnls = [float(r[0]) for r in rows]
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    total = len(pnls)

    total_pnl = sum(pnls)
    avg_pnl = total_pnl / total if total else 0.0
    best_trade = max(pnls)
    worst_trade = min(pnls)
    win_rate = (wins / total) * 100 if total else 0.0

    if total > 1:
        mean = sum(pnls) / total
        variance = sum((p - mean) ** 2 for p in pnls) / total
        std_dev = variance ** 0.5
        score = (mean / std_dev) if std_dev else 0.0
    else:
        score = 0.0

    return {
        "total_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": round(win_rate, 2),
        "total_pnl": round(total_pnl, 2),
        "avg_pnl": round(avg_pnl, 2),
        "best_trade": round(best_trade, 2),
        "worst_trade": round(worst_trade, 2),
        "score": round(score, 2),
    }


def strategy_ready(team_name, min_trades=20, min_win_rate=50.0, min_score=0.3):
    stats = get_backtest_stats(team_name)
    if stats["total_trades"] < min_trades:
        return False, stats, f"Need at least {min_trades} trades"
    if stats["win_rate"] < min_win_rate:
        return False, stats, f"Win rate too low: {stats['win_rate']}% < {min_win_rate}%"
    if stats["score"] < min_score:
        return False, stats, f"Strategy score too low: {stats['score']} < {min_score}"
    return True, stats, "Ready for live execution"


def create_team_backtest_script(team_name):
    script_name = f"backtest_{team_name.lower()}.py"
    team_symbol = team_name.upper()
    return script_name, f'''import random
import time

from backtest_bot import simulate_trade

TEAM_NAME = "{team_name}"
SYMBOL = "{team_symbol}"


def generate_simulated_trade():
    direction = random.choice(["LONG", "SHORT"])
    entry = round(random.uniform(90, 200), 2)
    exit_price = round(entry * random.uniform(0.94, 1.08), 2)
    quantity = random.randint(10, 100)
    simulate_trade(TEAM_NAME, SYMBOL, direction, entry, quantity, exit_price)


def main():
    print(f"[{{TEAM_NAME}} BACKTEST] Running simulated paper trades...")
    while True:
        generate_simulated_trade()
        time.sleep(60)


if __name__ == "__main__":
    main()
'''


def add_backtest_scripts():
    for team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
        script_name, content = create_team_backtest_script(team_name)
        with open(script_name, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Created {script_name}")


def main():
    print("[BACKTEST BOT] initializing paper-trading system...")
    add_backtest_scripts()
    while True:
        for team_name in ["SPY", "QQQ", "AAPL", "TSLA"]:
            is_ready, stats, message = strategy_ready(team_name)
            print(f"[BACKTEST] {team_name}: trades={stats['total_trades']} win_rate={stats['win_rate']}% total_pnl=${stats['total_pnl']} score={stats['score']} ready={is_ready} reason={message}")
        time.sleep(300)


if __name__ == "__main__":
    main()
