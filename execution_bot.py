"""
Execution Bot - Makes the actual trade after a strategy has already been selected.
This is the trade-execution layer.
"""

import os
import sqlite3
import time
from datetime import datetime, timezone

from dotenv import load_dotenv

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

load_dotenv()

ALPACA_API_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY")
DB_PATH = "strategy_bot.db"

trading_client = TradingClient(ALPACA_API_KEY, ALPACA_SECRET_KEY, paper=True)

CHECK_INTERVAL_SECONDS = 120


def get_latest_strategy_decision():
    if not os.path.exists(DB_PATH):
        print("[EXECUTOR] strategy_bot.db not found yet. Waiting...")
        return None

    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("""
        SELECT symbol, direction, strategy_used, strategy_confidence, price, timestamp
        FROM strategy_trades
        ORDER BY id DESC
        LIMIT 1
    """).fetchone()
    conn.close()

    if row is None:
        return None

    symbol, direction, strategy_used, confidence, price, timestamp = row
    return {
        "symbol": symbol,
        "direction": direction,
        "strategy_used": strategy_used,
        "confidence": float(confidence),
        "price": float(price),
        "timestamp": timestamp,
    }


def get_account():
    account = trading_client.get_account()
    return {
        "equity": float(account.equity),
        "buying_power": float(account.buying_power),
        "unrealized_pl": float(account.unrealized_pl),
    }


def risk_ok(account):
    max_daily_loss = account["equity"] * 0.05
    return account["unrealized_pl"] > -max_daily_loss


def get_trade_size(account, price):
    risk_amount = account["equity"] * 0.01
    return max(1, int(risk_amount / max(price, 1.0)))


def place_order(symbol, direction, price, confidence, strategy_used):
    account = get_account()
    if not risk_ok(account):
        print(f"[EXECUTOR] Risk blocked {symbol} {direction} | confidence={confidence}")
        return

    qty = get_trade_size(account, price)
    side = OrderSide.BUY if direction == "LONG" else OrderSide.SELL

    try:
        order = MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=side,
            time_in_force=TimeInForce.DAY,
        )
        response = trading_client.submit_order(order_data=order)
        print(
            f"[EXECUTOR] ORDER SUBMITTED | {symbol} {direction} | strategy={strategy_used} | "
            f"confidence={confidence:.1f}% | qty={qty} | status={response.status}"
        )
    except Exception as e:
        print(f"[EXECUTOR] ORDER ERROR | {symbol} {direction}: {e}")


def run_cycle():
    decision = get_latest_strategy_decision()
    if decision is None:
        print("[EXECUTOR] No strategy decision available yet.")
        return

    # Only execute if confidence is acceptable and a recent decision exists.
    if decision["confidence"] < 45:
        print(f"[EXECUTOR] Low confidence. Skipping {decision['symbol']} {decision['direction']}")
        return

    place_order(
        decision["symbol"],
        decision["direction"],
        decision["price"],
        decision["confidence"],
        decision["strategy_used"],
    )


def main():
    print("[EXECUTOR] Starting execution bot...")
    while True:
        run_cycle()
        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
