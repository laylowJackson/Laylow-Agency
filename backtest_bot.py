import sqlite3
import time
from datetime import datetime, timezone

from config import DB_PATH
from db_utils import connect_db
from event_logger import log_event


def get_backtest_db(team_name):
    """Get or create a backtest database for a team."""
    db_path = f"backtest_{team_name.lower()}.db"
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS backtest_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            direction TEXT,
            entry_price REAL,
            exit_price REAL,
            pnl REAL,
            pnl_percent REAL,
            quantity REAL,
            entry_time TEXT,
            exit_time TEXT,
            duration_seconds INTEGER
        )
    """)
    conn.commit()
    conn.close()
    return db_path


def calculate_backtest_stats(team_name):
    """Calculate performance metrics for a team's backtest trades."""
    db_path = get_backtest_db(team_name)
    conn = sqlite3.connect(db_path)
    
    trades = conn.execute(
        "SELECT pnl, pnl_percent, duration_seconds FROM backtest_trades ORDER BY id DESC LIMIT 100"
    ).fetchall()
    conn.close()
    
    if not trades:
        return {
            "total_trades": 0,
            "win_rate": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "best_trade": 0.0,
            "worst_trade": 0.0,
            "total_pnl": 0.0,
            "sharpe_like_score": 0.0,
        }
    
    wins = sum(1 for pnl, _, _ in trades if pnl > 0)
    losses = sum(1 for pnl, _, _ in trades if pnl < 0)
    total = len(trades)
    
    win_pnls = [pnl for pnl, _, _ in trades if pnl > 0]
    loss_pnls = [pnl for pnl, _, _ in trades if pnl < 0]
    
    avg_win = sum(win_pnls) / len(win_pnls) if win_pnls else 0.0
    avg_loss = sum(loss_pnls) / len(loss_pnls) if loss_pnls else 0.0
    
    best_trade = max([pnl for pnl, _, _ in trades])
    worst_trade = min([pnl for pnl, _, _ in trades])
    total_pnl = sum([pnl for pnl, _, _ in trades])
    
    win_rate = (wins / total * 100) if total > 0 else 0.0
    
    # Simple Sharpe-like score: reward consistency and return, penalize losses
    pnls = [pnl for pnl, _, _ in trades]
    if len(pnls) > 1:
        mean_pnl = sum(pnls) / len(pnls)
        variance = sum((x - mean_pnl) ** 2 for x in pnls) / len(pnls)
        std_dev = variance ** 0.5 if variance > 0 else 0.001
        sharpe_like = (mean_pnl / std_dev) if std_dev > 0 else 0.0
    else:
        sharpe_like = 0.0
    
    return {
        "total_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": round(win_rate, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "best_trade": round(best_trade, 2),
        "worst_trade": round(worst_trade, 2),
        "total_pnl": round(total_pnl, 2),
        "sharpe_like_score": round(sharpe_like, 2),
    }


def log_backtest_trade(team_name, symbol, direction, entry_price, exit_price, quantity):
    """Log a simulated trade to the backtest database."""
    pnl = 0.0
    if direction == "LONG":
        pnl = (exit_price - entry_price) * quantity
    elif direction == "SHORT":
        pnl = (entry_price - exit_price) * quantity
    
    pnl_percent = ((pnl / (entry_price * quantity)) * 100) if entry_price > 0 else 0.0
    
    now = datetime.now(timezone.utc).isoformat()
    db_path = get_backtest_db(team_name)
    conn = sqlite3.connect(db_path)
    
    conn.execute("""
        INSERT INTO backtest_trades
        (symbol, direction, entry_price, exit_price, pnl, pnl_percent, quantity, entry_time, exit_time, duration_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (symbol, direction, entry_price, exit_price, pnl, pnl_percent, quantity, now, now, 0))
    
    conn.commit()
    conn.close()
    
    log_event("BACKTEST_TRADE", f"{symbol} {direction} +{pnl:.2f} PnL", team_name)


def evaluate_strategy_readiness(team_name, min_trades=50, min_win_rate=45.0, min_sharpe=0.5):
    """
    Evaluate if a strategy is ready to go live based on backtest performance.
    
    Returns: (is_ready, reason, stats)
    """
    stats = calculate_backtest_stats(team_name)
    
    if stats["total_trades"] < min_trades:
        return (
            False,
            f"Not enough trades: {stats['total_trades']} < {min_trades}",
            stats,
        )
    
    if stats["win_rate"] < min_win_rate:
        return (
            False,
            f"Win rate too low: {stats['win_rate']}% < {min_win_rate}%",
            stats,
        )
    
    if stats["sharpe_like_score"] < min_sharpe:
        return (
            False,
            f"Risk-adjusted return too low: {stats['sharpe_like_score']} < {min_sharpe}",
            stats,
        )
    
    return (True, "Strategy meets live trading criteria", stats)


def main():
    print("[BACKTEST BOT] Starting strategy validation monitor...")
    
    # Ensure backtest tables exist for all teams
    teams = ["SPY", "QQQ", "AAPL", "TSLA"]
    for team in teams:
        get_backtest_db(team)
        log_event("BACKTEST_INIT", "Backtest database initialized", team)
    
    while True:
        for team in teams:
            stats = calculate_backtest_stats(team)
            is_ready, reason, _ = evaluate_strategy_readiness(team)
            
            print(f"[BACKTEST] {team}: {stats['total_trades']} trades | "
                  f"Win Rate: {stats['win_rate']}% | "
                  f"Total PnL: ${stats['total_pnl']:.2f} | "
                  f"Sharpe: {stats['sharpe_like_score']} | "
                  f"Ready: {is_ready}")
            
            if is_ready:
                log_event("STRATEGY_READY", reason, team)
        
        time.sleep(300)  # Check every 5 minutes


if __name__ == "__main__":
    main()
