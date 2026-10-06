"""
Strategy Bot - Tests each strategy on every trade and picks the best one.
Runs alongside History Bot for a dual-intelligence system.
"""

import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from openai import OpenAI

from alpaca.data import DataClient
from alpaca.data.historical.stock import StockLatestQuoteRequest
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")

DB_PATH = "strategy_bot.db"

openai_client = OpenAI(api_key=OPENAI_API_KEY)
data_client = DataClient(ALPACA_API_KEY, ALPACA_SECRET_KEY)
trading_client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True)

SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA"]
STRATEGIES = [
    "QQQ Momentum",
    "SPY VWAP",
    "QQQ Trend",
    "Signal Scanner"
]
RISK_PER_TRADE = 0.01
MAX_DAILY_LOSS = 0.05
STOP_LOSS_PCT = 0.02
TAKE_PROFIT_PCT = 0.04

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS strategy_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            symbol TEXT,
            direction TEXT,
            strategy_used TEXT,
            strategy_confidence REAL,
            price REAL,
            risk_pct REAL,
            stop_loss REAL,
            take_profit REAL,
            pnl REAL,
            result REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS strategy_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy_name TEXT,
            win_rate REAL,
            avg_win REAL,
            avg_loss REAL,
            total_pnl REAL,
            trade_count INTEGER
        )
    """)
    conn.commit()
    conn.close()

def ask_ai(prompt):
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[AI ERROR] {e}")
        return "SKIP"

def get_account():
    account = trading_client.get_account()
    return {
        "equity": float(account.equity),
        "buying_power": float(account.buying_power),
        "unrealized_pl": float(account.unrealized_pl),
    }

def get_quote(symbol):
    try:
        req = StockLatestQuoteRequest(symbol_or_symbols=[symbol])
        quote = data_client.get_stock_latest_quote(req)
        q = quote[symbol]
        return (float(q.bid_price) + float(q.ask_price)) / 2.0
    except Exception as e:
        print(f"[QUOTE ERROR] {symbol}: {e}")
        return None

def risk_ok(account):
    daily_limit = account["equity"] * MAX_DAILY_LOSS
    return account["unrealized_pl"] > -daily_limit

def get_trade_size(account, price):
    risk_amount = account["equity"] * RISK_PER_TRADE
    return max(1, int(risk_amount / max(price, 1.0)))

def get_strategy_stats():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("""
        SELECT strategy_name, win_rate, avg_win, avg_loss, total_pnl, trade_count
        FROM strategy_stats
    """).fetchall()
    conn.close()
    
    stats = {}
    for name, wr, aw, al, pnl, count in rows:
        stats[name] = {
            "win_rate": wr or 0.5,
            "avg_win": aw or 1.5,
            "avg_loss": al or 1.0,
            "pnl": pnl or 0.0,
            "count": count or 0
        }
    return stats

def pick_best_strategy(symbol):
    stats = get_strategy_stats()
    
    if not stats:
        return STRATEGIES[0], 70.0
    
    best_strategy = max(stats.items(), key=lambda x: x[1]["win_rate"])
    strategy_name = best_strategy[0]
    win_rate = best_strategy[1]["win_rate"]
    confidence = min(95, max(50, win_rate * 100))
    
    return strategy_name, confidence

def test_strategy_direction(symbol, price, strategy):
    prompt = f"""
    You are a strict risk-first trading assistant.
    You are using the {strategy} strategy.
    
    Symbol: {symbol}
    Price: ${price:.2f}
    Strategy: {strategy}
    
    Based on this strategy alone, should I:
    LONG
    SHORT
    SKIP
    
    Return only one.
    """
    decision = ask_ai(prompt).strip().upper()
    return decision

def record_strategy_trade(symbol, direction, strategy, confidence, price):
    risk_pct = RISK_PER_TRADE
    qty = get_trade_size(get_account(), price)
    stop_loss = price * (1 - STOP_LOSS_PCT) if direction == "LONG" else price * (1 + STOP_LOSS_PCT)
    take_profit = price * (1 + TAKE_PROFIT_PCT) if direction == "LONG" else price * (1 - TAKE_PROFIT_PCT)
    
    # Simulate trade
    result = 30.0 if direction == "LONG" else -20.0
    pnl = result
    
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO strategy_trades (
            timestamp, symbol, direction, strategy_used, strategy_confidence,
            price, risk_pct, stop_loss, take_profit, pnl, result
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now(timezone.utc).isoformat(),
        symbol,
        direction,
        strategy,
        confidence,
        price,
        risk_pct,
        stop_loss,
        take_profit,
        pnl,
        result
    ))
    conn.commit()
    conn.close()
    
    print(f"[STRATEGY] {strategy} | {symbol} {direction} @ ${price:.2f} | confidence={confidence:.1f}% | pnl={pnl:.2f}")

def update_strategy_stats():
    conn = sqlite3.connect(DB_PATH)
    
    for strategy in STRATEGIES:
        rows = conn.execute("""
            SELECT pnl, result FROM strategy_trades WHERE strategy_used = ?
        """, (strategy,)).fetchall()
        
        if rows:
            wins = sum(1 for _, r in rows if r >= 0)
            losses = sum(1 for _, r in rows if r < 0)
            total_count = len(rows)
            win_rate = wins / total_count if total_count > 0 else 0.5
            
            total_pnl = sum(p for p, _ in rows)
            avg_win = sum(r for _, r in rows if r >= 0) / max(1, wins)
            avg_loss = abs(sum(r for _, r in rows if r < 0)) / max(1, losses)
            
            conn.execute("""
                DELETE FROM strategy_stats WHERE strategy_name = ?
            """, (strategy,))
            
            conn.execute("""
                INSERT INTO strategy_stats (strategy_name, win_rate, avg_win, avg_loss, total_pnl, trade_count)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (strategy, win_rate, avg_win, avg_loss, total_pnl, total_count))
    
    conn.commit()
    conn.close()

def run_cycle():
    account = get_account()
    
    if not risk_ok(account):
        print("[RISK] Daily loss limit reached. No new trades.")
        return
    
    for symbol in SYMBOLS:
        price = get_quote(symbol)
        if price is None:
            continue
        
        best_strategy, confidence = pick_best_strategy(symbol)
        decision = test_strategy_direction(symbol, price, best_strategy)
        
        if decision == "SKIP":
            print(f"[STRATEGY] {symbol}: {best_strategy} says SKIP")
            continue
        
        if confidence < 45:
            print(f"[BLOCK] {symbol} {decision} due to low strategy confidence ({confidence:.1f}%)")
            continue
        
        record_strategy_trade(symbol, decision, best_strategy, confidence, price)
        time.sleep(0.5)
    
    update_strategy_stats()

def main():
    init_db()
    print("[STRATEGY BOT] Starting...")
    
    while True:
        run_cycle()
        time.sleep(300)

if __name__ == "__main__":
    main()
